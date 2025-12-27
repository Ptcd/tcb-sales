import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { syncWorkflowToJCC, mapCRMStatusToJCC } from "@/lib/jcc-activation-api";
import { recordPerformanceEvent } from "@/lib/governance/record-event";

// POST - Create a new meeting (SDR booking)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();

  // VALIDATION - All required fields
  const required = [
    "scheduledStartAt",
    "scheduledTimezone", 
    "activatorUserId",
    "attendeeName",
    "attendeeRole",
    "phone",
    "websitePlatform",
    "goal",
  ];
  
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  // Calculate end time (always 30 min)
  const startAt = new Date(body.scheduledStartAt);
  const endAt = new Date(startAt.getTime() + 30 * 60000);

  // VALIDATION - Slot must be from availability (race-safe check)
  const { data: conflicts } = await supabase
    .from("activation_meetings")
    .select("id")
    .eq("activator_user_id", body.activatorUserId)
    .eq("status", "scheduled")
    .lt("scheduled_start_at", endAt.toISOString())
    .gt("scheduled_end_at", startAt.toISOString());

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "This time slot is no longer available" }, { status: 409 });
  }

  // Determine scheduled_via (dialer vs activations page)
  const scheduledVia = body.scheduledVia || 'activations_page'; // Default, but dialer should pass this

  // Auto-fill website_url from search_results if trial_pipeline_id is provided
  let websiteUrl: string | null = null;
  if (body.trialPipelineId) {
    const { data: trialData } = await supabase
      .from('trial_pipeline')
      .select('crm_lead_id, search_results!inner(website)')
      .eq('id', body.trialPipelineId)
      .single();
    
    // search_results is returned as an array from the join, get first item
    const searchResults = Array.isArray(trialData?.search_results) 
      ? trialData.search_results[0] 
      : trialData?.search_results;
    websiteUrl = searchResults?.website || null;
  }

  // Create meeting (atomic operation)
  const { data: meeting, error: meetingError } = await supabase
    .from("activation_meetings")
    .insert({
      trial_pipeline_id: body.trialPipelineId || null,
      lead_id: body.leadId || null,
      scheduled_start_at: startAt.toISOString(),
      scheduled_end_at: endAt.toISOString(),
      scheduled_timezone: body.scheduledTimezone,
      activator_user_id: body.activatorUserId,
      scheduled_by_sdr_user_id: user.id,
      organization_id: profile.organization_id,
      status: "scheduled",
      attendee_name: body.attendeeName,
      attendee_role: body.attendeeRole,
      phone: body.phone,
      email: body.email || null,
      website_platform: body.websitePlatform,
      website_url: websiteUrl,
      goal: body.goal,
      objections: body.objections || null,
      notes: body.notes || null,
      sdr_confirmed_understands_install: body.sdrConfirmedUnderstandsInstall || false,
      sdr_confirmed_agreed_install: body.sdrConfirmedAgreedInstall || false,
      sdr_confirmed_will_attend: body.sdrConfirmedWillAttend || false,
      access_method: body.accessMethod || null,
      web_person_email: body.webPersonEmail || null,
    })
    .select()
    .single();

  if (meetingError) {
    return NextResponse.json({ error: meetingError.message }, { status: 500 });
  }

  // Record performance event: install_scheduled
  if (body.leadId || body.trialPipelineId) {
    try {
      const supabaseService = createServiceRoleClient();
      
      // Get campaign_id from lead or trial_pipeline
      let campaignId: string | null = null;
      let leadIdForEvent: string | null = body.leadId || null;
      
      if (body.leadId) {
        const { data: lead } = await supabaseService
          .from("search_results")
          .select("assigned_campaign_id")
          .eq("id", body.leadId)
          .single();
        campaignId = lead?.assigned_campaign_id || null;
      } else if (body.trialPipelineId) {
        const { data: trial } = await supabaseService
          .from("trial_pipeline")
          .select("crm_lead_id, search_results!inner(assigned_campaign_id)")
          .eq("id", body.trialPipelineId)
          .single();
        
        leadIdForEvent = trial?.crm_lead_id || null;
        const searchResults = Array.isArray(trial?.search_results) 
          ? trial.search_results[0] 
          : trial?.search_results;
        campaignId = searchResults?.assigned_campaign_id || null;
      }

      if (campaignId && leadIdForEvent) {
        await recordPerformanceEvent({
          campaignId,
          eventType: 'install_scheduled',
          leadId: leadIdForEvent,
          userId: user.id,
          metadata: {
            meeting_id: meeting.id,
            activator_user_id: body.activatorUserId,
            scheduled_by_sdr_user_id: user.id,
          },
          eventTimestamp: startAt.toISOString(),
        });
      }
    } catch (perfError: any) {
      console.error("Error recording install_scheduled event:", perfError);
      // Don't fail the request if performance event recording fails
    }
  }

  // Protect the call recording that led to this meeting (keep for 90 days)
  try {
    let leadIdForProtection: string | null = body.leadId || null;
    
    // If trialPipelineId is provided, get the lead_id from trial_pipeline
    if (!leadIdForProtection && body.trialPipelineId) {
      const { data: trial } = await supabase
        .from("trial_pipeline")
        .select("crm_lead_id")
        .eq("id", body.trialPipelineId)
        .single();
      leadIdForProtection = trial?.crm_lead_id || null;
    }
    
    if (leadIdForProtection) {
      // Find the most recent meaningful call by this SDR to this lead
      const { data: recentCall } = await supabase
        .from("calls")
        .select("id")
        .eq("lead_id", leadIdForProtection)
        .eq("user_id", user.id)
        .gt("duration", 10)  // Only actual conversations, not failed dial attempts
        .order("initiated_at", { ascending: false })
        .limit(1)
        .single();

      if (recentCall) {
        const protectedUntil = new Date();
        protectedUntil.setDate(protectedUntil.getDate() + 90); // 90 days from now
        
        await supabase
          .from("calls")
          .update({ recording_protected_until: protectedUntil.toISOString() })
          .eq("id", recentCall.id);
        
        console.log(`Protected call recording ${recentCall.id} until ${protectedUntil.toISOString()}`);
      }
    }
  } catch (protectError: any) {
    console.error("Error protecting call recording:", protectError);
    // Don't fail the request if protection fails
  }

  // Update trial_pipeline if linked (with all new fields)
  if (body.trialPipelineId) {
    // Get current attempts_count
    const { data: currentTrial } = await supabase
      .from("trial_pipeline")
      .select("attempts_count")
      .eq("id", body.trialPipelineId)
      .single();

    const newAttemptsCount = (currentTrial?.attempts_count || 0) + 1;

    const { error: trialError } = await supabase
      .from("trial_pipeline")
      .update({
        activation_status: "scheduled",
        scheduled_start_at: startAt.toISOString(),
        scheduled_end_at: endAt.toISOString(),
        scheduled_timezone: body.scheduledTimezone,
        scheduled_with_name: body.attendeeName,
        scheduled_with_role: body.attendeeRole,
        website_platform: body.websitePlatform,
        lead_phone: body.phone,
        lead_email: body.email || null,
        technical_owner_name: body.attendeeName, // Keep for backward compatibility
        assigned_activator_id: body.activatorUserId,
        customer_timezone: body.scheduledTimezone, // Keep for backward compatibility
        scheduled_by_user_id: user.id,
        scheduled_at: new Date().toISOString(),
        attempts_count: newAttemptsCount,
        last_contact_at: new Date().toISOString(),
        next_action: `Onboarding scheduled for ${startAt.toLocaleDateString()}`,
      })
      .eq("id", body.trialPipelineId);

    if (trialError) {
      // Rollback: delete the meeting we just created
      await supabase.from("activation_meetings").delete().eq("id", meeting.id);
      return NextResponse.json({ error: `Failed to update trial pipeline: ${trialError.message}` }, { status: 500 });
    }

      // Create activation_events record for audit log
      try {
        await supabase
          .from("activation_events")
          .insert({
            trial_pipeline_id: body.trialPipelineId,
            event_type: "scheduled",
            actor_user_id: user.id,
            metadata: {
              scheduled_start_at: startAt.toISOString(),
              scheduled_end_at: endAt.toISOString(),
              scheduled_timezone: body.scheduledTimezone,
              scheduled_via: scheduledVia,
              activator_user_id: body.activatorUserId,
              attendee_name: body.attendeeName,
              attendee_role: body.attendeeRole,
            },
          });
      } catch (err) {
        console.error("Failed to log activation event:", err); // Non-blocking
      }

      // Sync scheduled data to JCC Control Tower
      const { data: trialPipeline } = await supabase
        .from("trial_pipeline")
        .select("jcc_user_id")
        .eq("id", body.trialPipelineId)
        .single();

      if (trialPipeline?.jcc_user_id) {
        try {
          await syncWorkflowToJCC({
            user_id: trialPipeline.jcc_user_id,
            activation_status: mapCRMStatusToJCC("scheduled"),
            scheduled_install_at: startAt.toISOString(),
            scheduled_timezone: body.scheduledTimezone,
            scheduled_with_name: body.attendeeName,
            scheduled_with_role: body.attendeeRole,
            notes: body.notes || body.goal || null,
            scheduled_by_user_id: user.id,
            technical_owner_name: body.attendeeName, // Keep for backward compatibility
          });
        } catch (err) {
          console.error("Failed to sync schedule to JCC:", err); // Non-blocking
        }
      }
    }

  // Send confirmation email (fire and forget)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000";
  
  fetch(`${baseUrl}/api/activation-meetings/${meeting.id}/send-confirmation`, {
    method: "POST",
  }).catch(console.error);

  return NextResponse.json({ success: true, meeting });
}

// GET - List meetings (for Activator dashboard)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id, is_activator")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  let query = supabase
    .from("activation_meetings")
    .select(`
      *,
      activator:user_profiles!activator_user_id(full_name)
    `)
    .eq("organization_id", profile.organization_id)
    .order("scheduled_start_at", { ascending: true });

  // If activator, show only their meetings
  if (profile.is_activator) {
    const activatorOnly = searchParams.get("activatorOnly") !== "false";
    if (activatorOnly) {
      query = query.eq("activator_user_id", user.id);
    }
  }

  // Filter by status
  const status = searchParams.get("status");
  if (status) {
    query = query.eq("status", status);
  }

  // Filter by date range
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (startDate) {
    query = query.gte("scheduled_start_at", `${startDate}T00:00:00Z`);
  }
  if (endDate) {
    query = query.lte("scheduled_start_at", `${endDate}T23:59:59Z`);
  }

  const { data: meetings, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, meetings });
}

