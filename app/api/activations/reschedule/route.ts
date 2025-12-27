import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/activations/reschedule
// Reschedule an existing onboarding meeting
// Policy: SDR can reschedule only once, Activators can reschedule unlimited
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("organization_id, is_activator, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { meetingId, newSlotStartAt, newSlotEndAt, reason } = body;

  if (!meetingId || !newSlotStartAt || !newSlotEndAt) {
    return NextResponse.json({ error: "meetingId, newSlotStartAt, and newSlotEndAt are required" }, { status: 400 });
  }

  // Get the meeting
  const { data: meeting, error: meetingError } = await supabase
    .from("activation_meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Check if user is activator or the SDR who scheduled it
  const isActivator = profile.is_activator || profile.role === 'admin';
  const isOriginalSdr = meeting.scheduled_by_sdr_user_id === user.id;

  if (!isActivator && !isOriginalSdr) {
    return NextResponse.json({ error: "You can only reschedule meetings you scheduled or are assigned to" }, { status: 403 });
  }

  // If SDR (not activator), check reschedule_count
  if (!isActivator && isOriginalSdr) {
    // Get trial_pipeline to check reschedule_count
    if (meeting.trial_pipeline_id) {
      const { data: trial } = await supabase
        .from("trial_pipeline")
        .select("reschedule_count")
        .eq("id", meeting.trial_pipeline_id)
        .single();

      if (trial && (trial.reschedule_count || 0) >= 1) {
        return NextResponse.json({ 
          error: "SDRs can only reschedule once. Only the Activator can reschedule now." 
        }, { status: 403 });
      }
    }
  }

  // Validate new slot is available (race-safe check)
  const { data: conflicts } = await supabase
    .from("activation_meetings")
    .select("id")
    .eq("activator_user_id", meeting.activator_user_id)
    .eq("status", "scheduled")
    .neq("id", meetingId) // Exclude current meeting
    .lt("scheduled_start_at", newSlotEndAt)
    .gt("scheduled_end_at", newSlotStartAt);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "This time slot is no longer available" }, { status: 409 });
  }

  // Store old times for event log
  const oldStartAt = meeting.scheduled_start_at;
  const oldEndAt = meeting.scheduled_end_at;

  // Update meeting
  const { error: updateError } = await supabase
    .from("activation_meetings")
    .update({
      scheduled_start_at: newSlotStartAt,
      scheduled_end_at: newSlotEndAt,
      status: "rescheduled", // Temporarily set to rescheduled, then back to scheduled
    })
    .eq("id", meetingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Set status back to scheduled
  await supabase
    .from("activation_meetings")
    .update({ status: "scheduled" })
    .eq("id", meetingId);

  // Update trial_pipeline if linked
  if (meeting.trial_pipeline_id) {
    // Increment reschedule_count if SDR
    const updates: any = {
      scheduled_start_at: newSlotStartAt,
      scheduled_end_at: newSlotEndAt,
    };

    if (!isActivator) {
      const { data: currentTrial } = await supabase
        .from("trial_pipeline")
        .select("reschedule_count")
        .eq("id", meeting.trial_pipeline_id)
        .single();

      updates.reschedule_count = (currentTrial?.reschedule_count || 0) + 1;
    }

    await supabase
      .from("trial_pipeline")
      .update(updates)
      .eq("id", meeting.trial_pipeline_id);

    // Create activation_events record
    try {
      await supabase
        .from("activation_events")
        .insert({
          trial_pipeline_id: meeting.trial_pipeline_id,
          event_type: "rescheduled",
          actor_user_id: user.id,
          metadata: {
            old_start_at: oldStartAt,
            old_end_at: oldEndAt,
            new_start_at: newSlotStartAt,
            new_end_at: newSlotEndAt,
            reason: reason || null,
            rescheduled_by: isActivator ? 'activator' : 'sdr',
          },
        });
    } catch (err) {
      console.error("Failed to log reschedule event:", err);
    }
  }

  // Send notification emails (fire and forget)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000";

  // Resend confirmation with new time
  fetch(`${baseUrl}/api/activation-meetings/${meetingId}/send-confirmation`, {
    method: "POST",
  }).catch(console.error);

  return NextResponse.json({ success: true });
}

