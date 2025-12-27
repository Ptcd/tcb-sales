import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncWorkflowToJCC, mapCRMStatusToJCC, getActivationSignals, JCCWorkflowUpdatePayload } from "@/lib/jcc-activation-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId } = await params;
    const { status, next_action, scheduled_install_at, technical_owner_name, customer_timezone, assigned_activator_id } = await request.json();

    // Get current trial pipeline data first to use as fallback
    const { data: pipeline, error: pipelineError } = await supabase
      .from("trial_pipeline")
      .select("id, first_lead_received_at, activation_status, jcc_user_id, assigned_activator_id, next_action, scheduled_install_at, search_results(email, name, phone)")
      .eq("crm_lead_id", leadId)
      .single();

    if (pipelineError && pipelineError.code !== 'PGRST116') {
      // PGRST116 means no row found, which is OK (we'll create/update)
      console.error("Error fetching pipeline:", pipelineError);
      return NextResponse.json({ error: "Failed to fetch trial pipeline" }, { status: 500 });
    }

    // Use provided status or fall back to pipeline status, default to 'queued'
    const effectiveStatus = status || pipeline?.activation_status || 'queued';

    const leadData = (pipeline?.search_results as any);
    const leadEmail = leadData?.email;
    const leadName = leadData?.name;
    const leadPhone = leadData?.phone;

    // 4.1 Ownership - auto-assign to current user if unassigned (first touch)
    let effectiveActivatorId = assigned_activator_id || pipeline?.assigned_activator_id;
    
    if (!effectiveActivatorId && !['activated', 'killed'].includes(effectiveStatus)) {
      // First touch - auto-assign to current user
      effectiveActivatorId = user.id;
      console.log(`[Activation] Auto-assigned to ${user.id} on first touch (status change)`);
    }

    // 4.2 Next action required (STRICT - must be in request, not just existing)
    if (['queued', 'in_progress', 'scheduled'].includes(effectiveStatus)) {
      const effectiveNextAction = next_action !== undefined ? next_action : pipeline?.next_action;
      if (!effectiveNextAction || effectiveNextAction.trim() === '') {
        return NextResponse.json(
          { error: "Next action required. Example: 'Call back Tue 10am CT'" },
          { status: 400 }
        );
      }
    }

    // 4.3 Scheduling requirements
    if (effectiveStatus === 'scheduled') {
      if (!scheduled_install_at || !customer_timezone || !technical_owner_name) {
        return NextResponse.json(
          { error: "Scheduled status requires install date, customer timezone, and technical owner" },
          { status: 400 }
        );
      }
    }

    // GATING: Cannot set 'activated' unless first_lead_received_at exists
    if (effectiveStatus === 'activated') {
      // First check local data
      if (!pipeline?.first_lead_received_at) {
        // If no local data, try to verify with JCC directly
        if (pipeline?.jcc_user_id) {
          const signals = await getActivationSignals(pipeline.jcc_user_id);
          if (!signals?.can_activate) {
            return NextResponse.json(
              { error: "Cannot activate - no test lead received yet. Check Control Tower." },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json(
            { error: "Cannot activate - no test lead received yet. Check Control Tower." },
            { status: 400 }
          );
        }
      }
    }

    // Update trial_pipeline
    const updateData: Record<string, any> = {
      activation_status: effectiveStatus,
      next_action: next_action !== undefined ? next_action : (pipeline?.next_action || null),
      updated_at: new Date().toISOString(),
    };

    if (assigned_activator_id) {
      updateData.assigned_activator_id = assigned_activator_id;
    } else if (effectiveActivatorId && !pipeline?.assigned_activator_id) {
      // Auto-assigned on first touch
      updateData.assigned_activator_id = effectiveActivatorId;
    }

    if (effectiveStatus === 'scheduled') {
      updateData.scheduled_install_at = scheduled_install_at;
      updateData.customer_timezone = customer_timezone;
      updateData.technical_owner_name = technical_owner_name;
    }

    await supabase
      .from("trial_pipeline")
      .update(updateData)
      .eq("crm_lead_id", leadId);

    // Phase 3.2: Reminder Scheduling Logic
    // 1. Cancel existing reminders for this pipeline
    if (pipeline?.id) {
      await supabase
        .from("scheduled_messages")
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq("trial_pipeline_id", pipeline.id)
        .eq("status", "scheduled");

      // 2. If status is 'scheduled' and email exists, create new reminder
      if (effectiveStatus === 'scheduled' && leadEmail && scheduled_install_at) {
        const scheduledTime = new Date(scheduled_install_at);
        const sendAt = new Date(scheduledTime.getTime() - 24 * 60 * 60 * 1000); // 24h before
        
        // If sendAt is in the past, send immediately (by setting send_at to now)
        const effectiveSendAt = sendAt < new Date() ? new Date().toISOString() : sendAt.toISOString();

        await supabase
          .from("scheduled_messages")
          .insert({
            trial_pipeline_id: pipeline.id,
            type: 'install_reminder_24h',
            send_at: effectiveSendAt,
            status: 'scheduled',
            payload: {
              email: leadEmail,
              name: leadName || "Customer",
              phone: leadPhone || "",
              scheduled_install_at: scheduled_install_at,
              customer_timezone: customer_timezone,
              account_name: leadName || "your account",
            }
          });
      }
    }

    // Sync to JCC (non-blocking - don't fail CRM if JCC sync fails)
    if (pipeline?.jcc_user_id) {
      const jccPayload: JCCWorkflowUpdatePayload = {
        user_id: pipeline.jcc_user_id,
        activation_status: mapCRMStatusToJCC(effectiveStatus),
        assigned_activator_id: effectiveActivatorId,
        crm_next_action: next_action !== undefined ? next_action : (pipeline?.next_action || null),
        last_contact_at: new Date().toISOString(),
      };

      if (effectiveStatus === 'scheduled') {
        jccPayload.scheduled_install_at = scheduled_install_at;
        jccPayload.technical_owner_name = technical_owner_name || null;
      }

      // Fire and don't wait - sync happens in background
      syncWorkflowToJCC(jccPayload).then(result => {
        if (result.success) {
          console.log(`[JCC Sync] Status synced for ${pipeline.jcc_user_id}: ${effectiveStatus}`);
        } else {
          console.error(`[JCC Sync] Failed to sync status: ${result.error}`);
        }
      });
    }

    return NextResponse.json({ success: true, status: effectiveStatus });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
