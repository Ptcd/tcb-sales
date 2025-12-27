import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/activator-meetings
 * Get all scheduled meetings for all activators (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
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

    // Get all scheduled meetings (no joins - fetch related data separately)
    const { data: meetings, error } = await supabase
      .from("activation_meetings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("status", "scheduled")
      .order("scheduled_start_at", { ascending: true });

    if (error) {
      console.error("Error fetching activator meetings:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Get unique user IDs (activators AND SDRs) to fetch their names
    const activatorIds = [...new Set((meetings || []).map((m: any) => m.activator_user_id).filter(Boolean))];
    const sdrIds = [...new Set((meetings || []).map((m: any) => m.scheduled_by_sdr_user_id).filter(Boolean))];
    const allUserIds = [...new Set([...activatorIds, ...sdrIds])];
    
    let userMap: Record<string, { full_name: string; email: string }> = {};
    if (allUserIds.length > 0) {
      const { data: users } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", allUserIds);
      
      if (users) {
        userMap = Object.fromEntries(
          users.map((u: any) => [u.id, { full_name: u.full_name, email: u.email }])
        );
      }
    }
    
    // Fetch jcc_user_id separately for meetings that have trial_pipeline_id
    const trialPipelineIds = (meetings || [])
      .filter((m: any) => m.trial_pipeline_id)
      .map((m: any) => m.trial_pipeline_id);
    
    let trialPipelineMap: Record<string, string> = {};
    if (trialPipelineIds.length > 0) {
      const { data: trials } = await supabase
        .from("trial_pipeline")
        .select("id, jcc_user_id")
        .in("id", trialPipelineIds);
      
      if (trials) {
        trialPipelineMap = Object.fromEntries(
          trials.map((t: any) => [t.id, t.jcc_user_id])
        );
      }
    }

    // Transform the data to flatten the nested structure
    const transformedMeetings = (meetings || []).map((meeting: any) => ({
      id: meeting.id,
      trialPipelineId: meeting.trial_pipeline_id,
      leadId: meeting.lead_id,
      scheduledStartAt: meeting.scheduled_start_at,
      scheduledEndAt: meeting.scheduled_end_at,
      scheduledTimezone: meeting.scheduled_timezone,
      activatorUserId: meeting.activator_user_id,
      activatorName: userMap[meeting.activator_user_id]?.full_name || null,
      activatorEmail: userMap[meeting.activator_user_id]?.email || null,
      scheduledBySdrUserId: meeting.scheduled_by_sdr_user_id,
      scheduledBySdrName: userMap[meeting.scheduled_by_sdr_user_id]?.full_name || null,
      organizationId: meeting.organization_id,
      status: meeting.status,
      attendeeName: meeting.attendee_name,
      attendeeRole: meeting.attendee_role,
      phone: meeting.phone,
      email: meeting.email,
      websitePlatform: meeting.website_platform,
      websiteUrl: meeting.website_url,
      goal: meeting.goal,
      objections: meeting.objections,
      notes: meeting.notes,
      confirmationSentAt: meeting.confirmation_sent_at,
      reminder24hSentAt: meeting.reminder_24h_sent_at,
      rescheduledFromId: meeting.rescheduled_from_id,
      sdrConfirmedUnderstandsInstall: meeting.sdr_confirmed_understands_install,
      sdrConfirmedAgreedInstall: meeting.sdr_confirmed_agreed_install,
      sdrConfirmedWillAttend: meeting.sdr_confirmed_will_attend,
      accessMethod: meeting.access_method,
      webPersonEmail: meeting.web_person_email,
      jccUserId: meeting.trial_pipeline_id ? trialPipelineMap[meeting.trial_pipeline_id] || null : null,
      createdAt: meeting.created_at,
      updatedAt: meeting.updated_at,
    }));

    return NextResponse.json({ 
      success: true, 
      meetings: transformedMeetings 
    });
  } catch (error: any) {
    console.error("Error in admin activator meetings GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/activator-meetings
 * Reassign a meeting to a different activator (admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
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
    const { meetingId, newActivatorId, reason } = body;

    if (!meetingId || !newActivatorId) {
      return NextResponse.json(
        { error: "meetingId and newActivatorId are required" },
        { status: 400 }
      );
    }

    // Verify the meeting exists and belongs to the organization
    const { data: meeting, error: meetingError } = await supabase
      .from("activation_meetings")
      .select("*, activator_user_id, trial_pipeline_id")
      .eq("id", meetingId)
      .eq("organization_id", profile.organization_id)
      .eq("status", "scheduled")
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found or not scheduled" }, { status: 404 });
    }

    // Verify the new activator exists and is an activator
    const { data: newActivator, error: activatorError } = await supabase
      .from("user_profiles")
      .select("id, is_activator")
      .eq("id", newActivatorId)
      .eq("organization_id", profile.organization_id)
      .single();

    if (activatorError || !newActivator || !newActivator.is_activator) {
      return NextResponse.json(
        { error: "New activator not found or is not an activator" },
        { status: 400 }
      );
    }

    // Check for conflicts with new activator's schedule
    const { data: conflicts } = await supabase
      .from("activation_meetings")
      .select("id")
      .eq("activator_user_id", newActivatorId)
      .eq("status", "scheduled")
      .neq("id", meetingId)
      .lt("scheduled_start_at", meeting.scheduled_end_at)
      .gt("scheduled_end_at", meeting.scheduled_start_at);

    if (conflicts && conflicts.length > 0) {
      return NextResponse.json(
        { error: "New activator has a conflicting meeting at this time" },
        { status: 409 }
      );
    }

    const oldActivatorId = meeting.activator_user_id;

    // Update the meeting
    const { error: updateError } = await supabase
      .from("activation_meetings")
      .update({
        activator_user_id: newActivatorId,
      })
      .eq("id", meetingId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update trial_pipeline if linked
    if (meeting.trial_pipeline_id) {
      await supabase
        .from("trial_pipeline")
        .update({
          assigned_activator_id: newActivatorId,
        })
        .eq("id", meeting.trial_pipeline_id);

      // Create activation_events record for audit log
      try {
        await supabase
          .from("activation_events")
          .insert({
            trial_pipeline_id: meeting.trial_pipeline_id,
            event_type: "reassigned",
            actor_user_id: user.id,
            metadata: {
              meeting_id: meetingId,
              old_activator_id: oldActivatorId,
              new_activator_id: newActivatorId,
              reason: reason || null,
              reassigned_by: "admin",
            },
          });
      } catch (err) {
        console.error("Failed to log reassignment event:", err);
      }
    }

    return NextResponse.json({ 
      success: true,
      message: "Meeting reassigned successfully"
    });
  } catch (error: any) {
    console.error("Error in admin activator meetings PATCH:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

