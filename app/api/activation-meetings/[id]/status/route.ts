import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { addBusinessDays } from "@/lib/utils/dates";

/**
 * PATCH /api/activation-meetings/[id]/status
 * 
 * Update meeting status (scheduled -> no_show, canceled, completed, rescheduled)
 * Implements automation for no-show and canceled meetings
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const supabaseService = await createServiceRoleClient();
    
    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: meetingId } = await params;
    const { status, notes } = await request.json();

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    // Get existing meeting
    const { data: meeting, error: meetingError } = await supabaseService
      .from("activation_meetings")
      .select("*, trial_pipeline_id")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const trialPipelineId = meeting.trial_pipeline_id;

    // Update meeting
    const meetingUpdate: Record<string, any> = {
      status,
      ...(notes && { notes }),
    };

    // Pipeline updates based on status
    let pipelineUpdate: Record<string, any> = {};

    switch (status) {
      case 'no_show':
        // No-show automation: set SDR follow-up
        const noShowFollowup = addBusinessDays(now, 1);
        pipelineUpdate = {
          activation_status: 'no_show',
          followup_owner_role: 'sdr',
          next_followup_at: noShowFollowup.toISOString(),
          next_action: 'Reschedule install',
          no_show_at: nowISO,
        };
        
        // Create no_show event
        if (trialPipelineId) {
          await supabaseService.from("activation_events").insert({
            trial_pipeline_id: trialPipelineId,
            event_type: 'no_show',
            actor_user_id: user.id,
            metadata: { meeting_id: meetingId },
          });
        }
        break;

      case 'canceled':
        // Canceled automation: set SDR follow-up
        const cancelFollowup = addBusinessDays(now, 1);
        pipelineUpdate = {
          activation_status: 'queued',
          followup_owner_role: 'sdr',
          next_followup_at: cancelFollowup.toISOString(),
          next_action: 'Reschedule install',
        };
        break;

      case 'completed':
        // Mark as active (attended)
        pipelineUpdate = {
          activation_status: 'active',
        };
        
        // Create attended event
        if (trialPipelineId) {
          await supabaseService.from("activation_events").insert({
            trial_pipeline_id: trialPipelineId,
            event_type: 'attended',
            actor_user_id: user.id,
            metadata: { meeting_id: meetingId },
          });
        }
        break;

      case 'rescheduled':
        // Keep pipeline in queued state
        pipelineUpdate = {
          activation_status: 'queued',
        };
        break;
    }

    // Update meeting
    const { error: updateMeetingError } = await supabaseService
      .from("activation_meetings")
      .update(meetingUpdate)
      .eq("id", meetingId);

    if (updateMeetingError) {
      console.error("Error updating meeting:", updateMeetingError);
      return NextResponse.json({ error: "Failed to update meeting" }, { status: 500 });
    }

    // Update pipeline if needed
    if (trialPipelineId && Object.keys(pipelineUpdate).length > 0) {
      const { error: updatePipelineError } = await supabaseService
        .from("trial_pipeline")
        .update(pipelineUpdate)
        .eq("id", trialPipelineId);

      if (updatePipelineError) {
        console.error("Error updating pipeline:", updatePipelineError);
      }
    }

    return NextResponse.json({
      success: true,
      meeting_id: meetingId,
      status,
      pipeline_status: pipelineUpdate.activation_status,
    });

  } catch (error: any) {
    console.error("Error in PATCH /api/activation-meetings/[id]/status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
