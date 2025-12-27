import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDateInTimezone } from "@/lib/timezones";

// GET /api/activator-availability/slots?startDate=2025-12-20&endDate=2025-12-27&timezone=America/New_York
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  
  const startDate = searchParams.get("startDate"); // YYYY-MM-DD
  const endDate = searchParams.get("endDate");     // YYYY-MM-DD
  const timezone = searchParams.get("timezone") || "America/New_York";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
  }

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

  // 1. Get all activators
  const { data: activators } = await supabase
    .from("user_profiles")
    .select("id, full_name")
    .eq("organization_id", profile.organization_id)
    .eq("is_activator", true);

  if (!activators || activators.length === 0) {
    return NextResponse.json({ slots: [], message: "No activators available" });
  }

  // 2. Get schedules for all activators (with new settings)
  const activatorIds = activators.map(a => a.id);
  const { data: schedules } = await supabase
    .from("agent_schedules")
    .select("*")
    .in("user_id", activatorIds)
    .eq("is_accepting_meetings", true);
  
  // Get meeting links from schedules (first schedule per activator)
  const meetingLinksByActivator = new Map<string, string>();
  (schedules || []).forEach(schedule => {
    if (schedule.meeting_link && !meetingLinksByActivator.has(schedule.user_id)) {
      meetingLinksByActivator.set(schedule.user_id, schedule.meeting_link);
    }
  });

  // Group schedules by activator
  const schedulesByActivator = new Map<string, any[]>();
  (schedules || []).forEach(schedule => {
    if (!schedulesByActivator.has(schedule.user_id)) {
      schedulesByActivator.set(schedule.user_id, []);
    }
    schedulesByActivator.get(schedule.user_id)!.push(schedule);
  });

  // Filter to only activators with accepting schedules
  const acceptingActivators = activators.filter(a => 
    schedulesByActivator.has(a.id) && 
    schedulesByActivator.get(a.id)!.some(s => s.is_accepting_meetings)
  );

  if (acceptingActivators.length === 0) {
    return NextResponse.json({ slots: [], message: "No activators accepting meetings" });
  }

  // 3. Get existing meetings in date range
  const { data: existingMeetings } = await supabase
    .from("activation_meetings")
    .select("activator_user_id, scheduled_start_at, scheduled_end_at")
    .eq("organization_id", profile.organization_id)
    .in("status", ["scheduled"])
    .gte("scheduled_start_at", `${startDate}T00:00:00Z`)
    .lte("scheduled_start_at", `${endDate}T23:59:59Z`);

  // 4. Calculate date range with booking_window_days limit
  const now = new Date();
  const maxBookingDate = new Date(now);
  // Get the maximum booking_window_days from all schedules (use smallest to be conservative)
  const maxBookingWindow = Math.min(
    ...(schedules || [])
      .map(s => s.booking_window_days || 14)
      .filter(Boolean),
    14 // default fallback
  );
  maxBookingDate.setDate(now.getDate() + maxBookingWindow);
  
  // Limit endDate to booking window
  const requestedEnd = new Date(endDate);
  const effectiveEnd = requestedEnd > maxBookingDate ? maxBookingDate : requestedEnd;
  const effectiveStart = new Date(startDate);

  // 5. Generate slots
  const slots: Array<{
    start: string;
    end: string;
    activatorId: string;
    activatorName: string;
    meetingLink?: string;
    viewerDate: string;
  }> = [];

  const start = effectiveStart;
  const end = effectiveEnd;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dayOfWeek = d.getDay();

    for (const activator of acceptingActivators) {
      const activatorSchedules = schedulesByActivator.get(activator.id) || [];
      // Get ALL active shifts for this day (supports multiple shifts per day)
      const dayShifts = activatorSchedules.filter((s: any) => s.day_of_week === dayOfWeek && s.is_active);
      
      if (dayShifts.length === 0) continue;

      // Get settings from first shift (all shifts share same settings)
      const firstShift = dayShifts[0];
      const activatorTz = firstShift.timezone || "America/New_York";
      const duration = firstShift.meeting_duration_minutes || 30;
      const bufferBefore = firstShift.buffer_before_minutes || 15;
      const bufferAfter = firstShift.buffer_after_minutes || 15;
      const maxPerDay = firstShift.max_meetings_per_day || 6;
      const minNoticeHours = firstShift.min_notice_hours || 2;
      const meetingLink = meetingLinksByActivator.get(activator.id);

      // Count existing meetings for this activator on this day
      const meetingsThisDay = (existingMeetings || []).filter((m: any) => 
        m.activator_user_id === activator.id &&
        m.scheduled_start_at.startsWith(dateStr)
      ).length;

      if (meetingsThisDay >= maxPerDay) continue;

      // Process each shift for this day
      for (const daySchedule of dayShifts) {
        // Parse working hours in activator's timezone
        const [startHour, startMin] = daySchedule.start_time.split(":").map(Number);
        const [endHour, endMin] = daySchedule.end_time.split(":").map(Number);

        // Validate: Skip availability windows that cross midnight
        // End time must be after start time on the same day
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        if (endMinutes <= startMinutes) {
          // Invalid: availability window crosses midnight - skip this shift
          continue;
        }

      // Helper function to convert local time in activator's TZ to UTC
      // Uses a reliable method: create a date and use timezone formatting to find offset
      const localToUtc = (dateStr: string, hour: number, minute: number, tz: string): Date => {
        // Get the UTC offset for this date in the timezone
        // Create a reference date at noon UTC
        const refDate = new Date(`${dateStr}T12:00:00Z`);
        
        // Format it in the timezone to see what local time it represents
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        const tzParts = formatter.formatToParts(refDate);
        const tzRefHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '12');
        
        // Calculate offset: if UTC 12:00 shows as 7:00 in TZ, then TZ is UTC-5
        // So offset = 12 - tzRefHour
        const offsetHours = 12 - tzRefHour;
        
        // Convert local time to UTC: UTC = local + offset
        let utcHour = hour + offsetHours;
        let utcDate = new Date(`${dateStr}T00:00:00Z`);
        
        // Handle day boundaries
        if (utcHour < 0) {
          utcDate.setUTCDate(utcDate.getUTCDate() - 1);
          utcHour += 24;
        } else if (utcHour >= 24) {
          utcDate.setUTCDate(utcDate.getUTCDate() + 1);
          utcHour -= 24;
        }
        
        utcDate.setUTCHours(utcHour, minute, 0, 0);
        return utcDate;
      };

      // Convert start and end times to UTC
      const workdayStartUtc = localToUtc(dateStr, startHour, startMin, activatorTz);
      const workdayEndUtc = localToUtc(dateStr, endHour, endMin, activatorTz);
      
      // Validate: Ensure end time is after start time in UTC (should be true after validation above, but double-check)
      if (workdayEndUtc <= workdayStartUtc) {
        // Invalid slot - skip this day
        continue;
      }

      // Generate slots
      let slotStartUtc = new Date(workdayStartUtc);
      const slotIncrement = (duration + bufferBefore + bufferAfter) * 60000;

      while (slotStartUtc < workdayEndUtc) {
        const slotEndUtc = new Date(slotStartUtc.getTime() + duration * 60000);
        
        if (slotEndUtc > workdayEndUtc) break;

        // Check for conflicts (including buffers)
        const slotWithBufferStart = new Date(slotStartUtc.getTime() - bufferBefore * 60000);
        const slotWithBufferEnd = new Date(slotEndUtc.getTime() + bufferAfter * 60000);

        const hasConflict = (existingMeetings || []).some((m: any) => {
          if (m.activator_user_id !== activator.id) return false;
          const mStart = new Date(m.scheduled_start_at);
          const mEnd = new Date(m.scheduled_end_at);
          return (slotWithBufferStart < mEnd && slotWithBufferEnd > mStart);
        });

        // Apply filters: min_notice_hours and not in past
        const now = new Date();
        const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
        
        if (slotStartUtc > minNoticeTime && !hasConflict) {
          slots.push({
            start: slotStartUtc.toISOString(),
            end: slotEndUtc.toISOString(),
            activatorId: activator.id,
            activatorName: activator.full_name || "Activator",
            meetingLink: meetingLink || undefined,
            // Add viewer timezone date for correct day filtering
            viewerDate: getDateInTimezone(slotStartUtc, timezone),
          });
        }

        // Move to next slot
        slotStartUtc = new Date(slotStartUtc.getTime() + slotIncrement);
      }
      } // End of shift loop
    }
  }

  // Sort by time, then by activator meetings count (for round-robin)
  slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return NextResponse.json({ 
    success: true,
    slots,
    activatorCount: acceptingActivators.length,
  });
}

