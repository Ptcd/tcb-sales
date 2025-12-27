import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncWorkflowToJCC, mapCRMKillReasonToJCC } from "@/lib/jcc-activation-api";

/**
 * POST /api/admin/kill-trials-by-contact
 * Kill trials for leads matching phone or email (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const supabaseService = createServiceRoleClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { phone, email } = body;

    if (!phone && !email) {
      return NextResponse.json(
        { error: "phone or email is required" },
        { status: 400 }
      );
    }

    // Find leads matching phone or email
    let query = supabaseService
      .from("search_results")
      .select("id, name, phone, email, client_status")
      .eq("organization_id", profile.organization_id);

    if (phone) {
      // Normalize phone - remove formatting
      const normalizedPhone = phone.replace(/\D/g, '');
      query = query.or(`phone.ilike.%${normalizedPhone}%,phone.ilike.%${phone}%`);
    }

    if (email) {
      query = query.or(`email.ilike.%${email}%,email.eq.${email.toLowerCase()}`);
    }

    const { data: leads, error: leadsError } = await query;

    if (leadsError) {
      console.error("Error finding leads:", leadsError);
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No leads found matching the provided phone or email",
        killed: []
      });
    }

    const killedTrials = [];
    const errors = [];

    for (const lead of leads) {
      try {
        // Check if lead has a trial
        const { data: pipeline } = await supabaseService
          .from("trial_pipeline")
          .select("id, jcc_user_id, activation_status")
          .eq("crm_lead_id", lead.id)
          .single();

        if (!pipeline || pipeline.activation_status === 'killed' || pipeline.activation_status === 'activated') {
          continue; // Skip if no trial or already killed/activated
        }

        const killedAt = new Date().toISOString();

        // Kill the trial
        await supabaseService
          .from("trial_pipeline")
          .update({
            activation_status: 'killed',
            marked_lost_at: killedAt,
            lost_reason: "Killed by admin via contact lookup",
            activation_kill_reason: 'other',
          })
          .eq("crm_lead_id", lead.id);

        // Update lead badge
        await supabaseService
          .from("search_results")
          .update({ badge_key: "recycle_not_interested" })
          .eq("id", lead.id);

        // Sync to JCC (non-blocking)
        if (pipeline.jcc_user_id) {
          syncWorkflowToJCC({
            user_id: pipeline.jcc_user_id,
            activation_status: 'killed',
            killed_at: killedAt,
            kill_reason: 'other',
            kill_note: "Killed by admin via contact lookup",
          }).then(result => {
            if (result.success) {
              console.log(`[JCC Sync] Kill synced for ${pipeline.jcc_user_id}`);
            } else {
              console.error(`[JCC Sync] Failed to sync kill: ${result.error}`);
            }
          });
        }

        killedTrials.push({
          leadId: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          jccUserId: pipeline.jcc_user_id,
        });
      } catch (error: any) {
        errors.push({
          leadId: lead.id,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Killed ${killedTrials.length} trial(s)`,
      killed: killedTrials,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in kill-trials-by-contact:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


