import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - Fetch current activator's availability settings
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is an activator
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_activator, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.is_activator) {
    return NextResponse.json({ error: "Not an activator" }, { status: 403 });
  }

  // Get schedules
  const { data: schedules } = await supabase
    .from("agent_schedules")
    .select("*")
    .eq("user_id", user.id)
    .order("day_of_week");

  // Return settings (use first schedule row for global settings, or defaults)
  const firstSchedule = schedules?.[0];
  
  return NextResponse.json({
    success: true,
    settings: {
      userId: user.id,
      timezone: firstSchedule?.timezone ?? "America/New_York",
      meetingDurationMinutes: firstSchedule?.meeting_duration_minutes ?? 30,
      bufferBeforeMinutes: firstSchedule?.buffer_before_minutes ?? 15,
      bufferAfterMinutes: firstSchedule?.buffer_after_minutes ?? 15,
      maxMeetingsPerDay: firstSchedule?.max_meetings_per_day ?? 6,
      minNoticeHours: firstSchedule?.min_notice_hours ?? 2,
      bookingWindowDays: firstSchedule?.booking_window_days ?? 14,
      meetingLink: firstSchedule?.meeting_link ?? null,
      isAcceptingMeetings: firstSchedule?.is_accepting_meetings ?? true,
      workingHours: (schedules || []).map(s => ({
        dayOfWeek: s.day_of_week,
        startTime: s.start_time,
        endTime: s.end_time,
        isActive: s.is_active,
      })),
    },
  });
}

// PUT - Update activator's availability settings
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_activator, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.is_activator) {
    return NextResponse.json({ error: "Not an activator" }, { status: 403 });
  }

  const body = await request.json();
  const { 
    timezone,
    bufferBeforeMinutes, 
    bufferAfterMinutes, 
    maxMeetingsPerDay,
    minNoticeHours,
    bookingWindowDays,
    meetingLink,
    isAcceptingMeetings,
    workingHours 
  } = body;

  // Delete all existing schedules for this user (we'll replace them all)
  const { error: deleteError } = await supabase
    .from("agent_schedules")
    .delete()
    .eq("user_id", user.id);
  
  if (deleteError) {
    console.error("Error deleting existing schedules:", deleteError);
    return NextResponse.json({ 
      success: false, 
      error: "Failed to clear existing schedules",
      details: deleteError.message 
    }, { status: 500 });
  }

  // Insert all new schedules (supports multiple shifts per day)
  const schedulesToInsert = workingHours.map((wh: any) => ({
    user_id: user.id,
    organization_id: profile.organization_id,
    day_of_week: wh.dayOfWeek,
    start_time: wh.startTime,
    end_time: wh.endTime,
    is_active: wh.isActive,
    timezone: timezone ?? "America/New_York",
    meeting_duration_minutes: 30, // Always 30, locked
    buffer_before_minutes: bufferBeforeMinutes ?? 15,
    buffer_after_minutes: bufferAfterMinutes ?? 15,
    max_meetings_per_day: maxMeetingsPerDay ?? 6,
    min_notice_hours: minNoticeHours ?? 2,
    booking_window_days: bookingWindowDays ?? 14,
    meeting_link: meetingLink || null,
    is_accepting_meetings: isAcceptingMeetings ?? true,
  }));

  // Only insert active schedules
  const activeSchedules = schedulesToInsert.filter((s: any) => s.is_active);
  
  if (activeSchedules.length > 0) {
    const { error: insertError } = await supabase
      .from("agent_schedules")
      .insert(activeSchedules);
    
    if (insertError) {
      console.error("Error inserting schedules:", insertError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to save schedules",
        details: insertError.message 
      }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

