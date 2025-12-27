import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { addBusinessDays } from "@/lib/utils/dates";
import { recordPerformanceEvent } from "@/lib/governance/record-event";

/**
 * POST /api/activation-meetings/[id]/complete
 * 
 * Activator Call Summary Modal - Complete a meeting with outcome
 * 
 * Outcomes:
 * - installed_proven: Install completed and verified
 * - blocked: Couldn't complete install, needs follow-up
 * - partial: Some progress, not proven
 * - rescheduled: Meeting rescheduled to new time
 * - no_show: Customer didn't show up
 * - canceled: Meeting was canceled
 * - killed: Trial killed / not a fit
 * 
 * State Machine Rules:
 * - active and killed are TERMINAL states
 * - no_show_count >= 2 → auto-kill
 * - reschedule_count >= 3 → auto-kill
 * - blocked > 14 days → auto-kill (handled by cron)
 */

// Type definitions
interface CompleteRequestBody {
  outcome: 'installed_proven' | 'blocked' | 'partial' | 'rescheduled' | 'no_show' | 'canceled' | 'killed';
  
  // Install fields (required if outcome = installed_proven)
  install_url?: string;
  proof_method?: 'credits_decremented' | 'test_lead_confirmed' | 'both';
  lead_delivery_methods?: string[];
  primary_recipient?: string;
  client_confirmed_receipt?: boolean;
  
  // Block/Partial fields (required if outcome = blocked OR partial)
  block_reason?: string;
  block_owner?: string;
  next_step?: string;
  followup_date?: string;
  outcome_notes?: string;
  
  // Reschedule fields (required if outcome = rescheduled)
  new_datetime?: string;
  reschedule_reason?: string;
  web_person_invited?: boolean;
  
  // No-show fields
  contact_attempted?: string[];
  
  // Canceled fields
  canceled_by?: 'client' | 'us';
  cancel_reason?: string;
  
  // Killed fields
  kill_reason?: string;
}

export async function POST(
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
    const body: CompleteRequestBody = await request.json();
    const { outcome } = body;

    if (!outcome) {
      return NextResponse.json({ error: "Outcome is required" }, { status: 400 });
    }

    // Get existing meeting with pipeline
    const { data: meeting, error: meetingError } = await supabaseService
      .from("activation_meetings")
      .select(`
        *,
        trial_pipeline:trial_pipeline_id (
          id, crm_lead_id, no_show_count, reschedule_count, activation_status
        )
      `)
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // LOCK: Prevent double-completion
    if (meeting.status === 'completed' || meeting.status === 'no_show' || meeting.status === 'canceled') {
      return NextResponse.json({ 
        error: "Meeting already completed. Create a new meeting to continue." 
      }, { status: 400 });
    }

    const trialPipelineId = meeting.trial_pipeline_id;
    const pipeline = meeting.trial_pipeline;
    const now = new Date();
    const nowISO = now.toISOString();

    // Check terminal states
    if (pipeline?.activation_status === 'active' || pipeline?.activation_status === 'killed') {
      return NextResponse.json({ 
        error: `Cannot modify pipeline in terminal state: ${pipeline.activation_status}` 
      }, { status: 400 });
    }

    // Validate required fields based on outcome
    const validationError = validateOutcome(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Process based on outcome
    let meetingUpdate: Record<string, any> = {
      status: 'completed',
      completed_at: nowISO,
      completed_by_user_id: user.id,
      outcome_notes: body.outcome_notes,
    };

    let pipelineUpdate: Record<string, any> = {
      last_meeting_outcome: outcome,
    };

    switch (outcome) {
      case 'installed_proven':
        meetingUpdate = {
          ...meetingUpdate,
          proof_method: body.proof_method,
          lead_delivery_methods: body.lead_delivery_methods,
          primary_recipient: body.primary_recipient,
          client_confirmed_receipt: body.client_confirmed_receipt,
          install_url: body.install_url,
        };
        pipelineUpdate = {
          ...pipelineUpdate,
          activation_status: 'active', // TERMINAL
          calculator_installed_at: nowISO,
          install_url: body.install_url,
          followup_owner_role: null,
          next_followup_at: null,
          followup_reason: null,
          block_reason: null,
          block_owner: null,
          next_step: null,
        };
        break;

      case 'blocked':
      case 'partial':
        const blockedFollowup = body.followup_date 
          ? new Date(body.followup_date)
          : addBusinessDays(now, outcome === 'blocked' ? 1 : 2);
        
        meetingUpdate = {
          ...meetingUpdate,
          block_reason: body.block_reason,
          block_owner: body.block_owner,
          next_step: body.next_step,
        };
        pipelineUpdate = {
          ...pipelineUpdate,
          activation_status: 'blocked',
          followup_owner_role: 'activator',
          next_followup_at: blockedFollowup.toISOString(),
          followup_reason: body.block_reason || 'Install blocked – follow up required',
          block_reason: body.block_reason,
          block_owner: body.block_owner,
          next_step: body.next_step,
        };
        break;

      case 'rescheduled':
        // Increment reschedule count
        const newRescheduleCount = (pipeline?.reschedule_count || 0) + 1;
        
        // Check auto-kill threshold
        if (newRescheduleCount >= 3) {
          pipelineUpdate = {
            ...pipelineUpdate,
            activation_status: 'killed',
            marked_lost_at: nowISO,
            activation_kill_reason: 'excessive_reschedules',
            reschedule_count: newRescheduleCount,
            followup_owner_role: null,
            next_followup_at: null,
          };
          meetingUpdate.status = 'rescheduled';
        } else {
          meetingUpdate = {
            ...meetingUpdate,
            status: 'rescheduled',
            reschedule_reason: body.reschedule_reason,
            web_person_invited: body.web_person_invited,
          };
          pipelineUpdate = {
            ...pipelineUpdate,
            activation_status: 'queued',
            reschedule_count: newRescheduleCount,
            followup_owner_role: null,
            next_followup_at: null,
          };
          
          // Create new meeting (handled separately)
          if (body.new_datetime) {
            await createRescheduledMeeting(supabaseService, meeting, body.new_datetime, user.id);
          }
        }
        break;

      case 'no_show':
        // Increment no-show count
        const newNoShowCount = (pipeline?.no_show_count || 0) + 1;
        
        meetingUpdate = {
          ...meetingUpdate,
          status: 'no_show',
          contact_attempted: body.contact_attempted,
        };

        // Check auto-kill threshold
        if (newNoShowCount >= 2) {
          pipelineUpdate = {
            ...pipelineUpdate,
            activation_status: 'killed',
            marked_lost_at: nowISO,
            activation_kill_reason: 'repeated_no_show',
            no_show_count: newNoShowCount,
            no_show_at: nowISO,
            followup_owner_role: null,
            next_followup_at: null,
          };
        } else {
          const noShowFollowup = addBusinessDays(now, 1);
          pipelineUpdate = {
            ...pipelineUpdate,
            activation_status: 'no_show',
            no_show_count: newNoShowCount,
            no_show_at: nowISO,
            followup_owner_role: 'sdr',
            next_followup_at: noShowFollowup.toISOString(),
            next_action: 'Reschedule install',
          };
        }
        break;

      case 'canceled':
        meetingUpdate = {
          ...meetingUpdate,
          status: 'canceled',
          canceled_by: body.canceled_by,
          cancel_reason: body.cancel_reason,
        };
        
        const cancelFollowup = addBusinessDays(now, 1);
        pipelineUpdate = {
          ...pipelineUpdate,
          activation_status: 'queued',
          followup_owner_role: 'sdr',
          next_followup_at: cancelFollowup.toISOString(),
          next_action: 'Reschedule install',
        };
        break;

      case 'killed':
        meetingUpdate = {
          ...meetingUpdate,
          kill_reason: body.kill_reason,
        };
        pipelineUpdate = {
          ...pipelineUpdate,
          activation_status: 'killed', // TERMINAL
          marked_lost_at: nowISO,
          activation_kill_reason: body.kill_reason,
          followup_owner_role: null,
          next_followup_at: null,
          next_action: null,
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

    // Update pipeline
    if (trialPipelineId) {
      const { error: updatePipelineError } = await supabaseService
        .from("trial_pipeline")
        .update(pipelineUpdate)
        .eq("id", trialPipelineId);

      if (updatePipelineError) {
        console.error("Error updating pipeline:", updatePipelineError);
      }

      // Create activation event
      const { outcome: _, ...bodyWithoutOutcome } = body;
      await supabaseService
        .from("activation_events")
        .insert({
          trial_pipeline_id: trialPipelineId,
          event_type: outcome,
          actor_user_id: user.id,
          metadata: {
            meeting_id: meetingId,
            outcome,
            ...bodyWithoutOutcome,
          },
        });

      // Record governance performance events
      const { data: lead } = await supabaseService
        .from("search_results")
        .select("assigned_campaign_id")
        .eq("id", pipeline?.crm_lead_id)
        .single();

      const campaignId = lead?.assigned_campaign_id;
      if (campaignId) {
        // Always record install_attended when meeting is completed
        await recordPerformanceEvent({
          campaignId,
          eventType: 'install_attended',
          leadId: pipeline?.crm_lead_id,
          userId: user.id,
        });

        // Record calculator_installed if outcome is installed_proven
        if (outcome === 'installed_proven') {
          await recordPerformanceEvent({
            campaignId,
            eventType: 'calculator_installed',
            leadId: pipeline?.crm_lead_id,
            userId: user.id,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      outcome,
      meeting_id: meetingId,
      pipeline_status: pipelineUpdate.activation_status,
    });

  } catch (error: any) {
    console.error("Error in POST /api/activation-meetings/[id]/complete:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Validate required fields based on outcome
 */
function validateOutcome(body: CompleteRequestBody): string | null {
  const { outcome } = body;

  switch (outcome) {
    case 'installed_proven':
      if (!body.install_url) return "Install URL is required";
      if (!body.proof_method) return "Proof method is required";
      if (!body.lead_delivery_methods?.length) return "Lead delivery methods are required";
      break;

    case 'blocked':
    case 'partial':
      if (!body.block_reason) return "Block reason is required";
      if (!body.block_owner) return "Block owner is required";
      if (!body.next_step) return "Next step is required";
      break;

    case 'rescheduled':
      if (!body.new_datetime) return "New date/time is required";
      if (!body.reschedule_reason) return "Reschedule reason is required";
      break;

    case 'no_show':
      if (!body.contact_attempted?.length) return "At least one contact attempt method is required";
      break;

    case 'canceled':
      if (!body.canceled_by) return "Canceled by is required";
      if (!body.cancel_reason) return "Cancel reason is required";
      break;

    case 'killed':
      if (!body.kill_reason) return "Kill reason is required";
      break;
  }

  return null;
}

/**
 * Create a new meeting for reschedule (new attempt)
 */
async function createRescheduledMeeting(
  supabase: any,
  oldMeeting: any,
  newDatetime: string,
  userId: string
) {
  const newStartTime = new Date(newDatetime);
  const newEndTime = new Date(newStartTime.getTime() + 30 * 60 * 1000); // 30 min meeting

  const newAttemptNumber = (oldMeeting.attempt_number || 1) + 1;

  const { data: newMeeting, error } = await supabase
    .from("activation_meetings")
    .insert({
      organization_id: oldMeeting.organization_id,
      trial_pipeline_id: oldMeeting.trial_pipeline_id,
      scheduled_by_sdr_user_id: oldMeeting.scheduled_by_sdr_user_id,
      activator_user_id: oldMeeting.activator_user_id,
      scheduled_start_at: newStartTime.toISOString(),
      scheduled_end_at: newEndTime.toISOString(),
      scheduled_timezone: oldMeeting.scheduled_timezone,
      status: 'scheduled',
      attendee_name: oldMeeting.attendee_name,
      attendee_role: oldMeeting.attendee_role,
      website_platform: oldMeeting.website_platform,
      website_url: oldMeeting.website_url,
      phone: oldMeeting.phone,
      attempt_number: newAttemptNumber,
      parent_meeting_id: oldMeeting.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating rescheduled meeting:", error);
    throw error;
  }

  // Update pipeline with new meeting info
  await supabase
    .from("trial_pipeline")
    .update({
      scheduled_start_at: newStartTime.toISOString(),
      scheduled_end_at: newEndTime.toISOString(),
    })
    .eq("id", oldMeeting.trial_pipeline_id);

  return newMeeting;
}
