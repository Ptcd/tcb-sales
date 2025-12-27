import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSalesWeekStart } from "@/lib/utils/sdrMetrics";

/**
 * GET /api/reports/dialer-kpis
 * Returns real-time KPIs for the dialer mode
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current timestamps in Central Time (America/Chicago)
    const now = new Date();

    // Helper to get Central Time offset dynamically (handles CST vs CDT)
    function getCentralTimeOffset(): number {
      // Create a test date and compare UTC vs Central
      const testDate = new Date();
      const utcHour = testDate.getUTCHours();
      const centralHour = parseInt(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "2-digit",
        hour12: false,
      }).format(testDate));
      // Offset is the difference (can be -5 for CDT or -6 for CST)
      let offset = centralHour - utcHour;
      if (offset > 12) offset -= 24;
      if (offset < -12) offset += 24;
      return offset;
    }

    function getStartOfDayCentral(): string {
      // Get today's date components in Central Time
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      
      const year = parts.find(p => p.type === "year")?.value;
      const month = parts.find(p => p.type === "month")?.value;
      const day = parts.find(p => p.type === "day")?.value;
      
      // Get current offset (e.g., -6 for CST, -5 for CDT)
      const offset = getCentralTimeOffset();
      
      // Midnight Central in UTC: if offset is -6, midnight Central = 06:00 UTC
      const midnightUTCHour = -offset;
      
      return `${year}-${month}-${day}T${String(midnightUTCHour).padStart(2, "0")}:00:00.000Z`;
    }

    function getStartOfHourCentral(): string {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(now);
      
      const year = parts.find(p => p.type === "year")?.value;
      const month = parts.find(p => p.type === "month")?.value;
      const day = parts.find(p => p.type === "day")?.value;
      const hour = parts.find(p => p.type === "hour")?.value;
      
      // Get current offset dynamically
      const offset = getCentralTimeOffset();
      const absOffset = Math.abs(offset);
      const offsetStr = offset >= 0 
        ? `+${String(absOffset).padStart(2, "0")}:00` 
        : `-${String(absOffset).padStart(2, "0")}:00`;
      
      // Create date with proper timezone offset
      const centralDateStr = `${year}-${month}-${day}T${hour}:00:00${offsetStr}`;
      return new Date(centralDateStr).toISOString();
    }

    const startOfDayIso = getStartOfDayCentral();
    const startOfHourIso = getStartOfHourCentral();
    
    // Debug log to verify timezone calculation
    console.log(`[Dialer KPIs] Central Time offset: ${getCentralTimeOffset()}, Start of day: ${startOfDayIso}`);

    // Calls this hour
    const { count: callsThisHour } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .gte("initiated_at", startOfHourIso);

    // Calls today
    const { count: callsToday } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .gte("initiated_at", startOfDayIso);

    // Conversations today (calls with conversation outcomes: NOT_INTERESTED, INTERESTED_INFO_SENT, TRIAL_STARTED, CALLBACK_SCHEDULED)
    const { count: conversationsToday } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .gte("initiated_at", startOfDayIso)
      .in("outcome_code", ["NOT_INTERESTED", "INTERESTED_INFO_SENT", "TRIAL_STARTED", "CALLBACK_SCHEDULED"]);

    // CTA attempts today
    const { count: ctaAttemptsToday } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .eq("cta_attempted", true)
      .gte("initiated_at", startOfDayIso);

    // CTA accepted today
    const { count: ctaAcceptedToday } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .eq("cta_result", "ACCEPTED")
      .gte("initiated_at", startOfDayIso);

    // Trials started today (from lead_notifications - actual provisioned trials)
    const { count: trialsStartedToday } = await supabase
      .from("lead_notifications")
      .select("*", { count: "exact", head: true })
      .eq("sdr_user_id", user.id)
      .eq("event_type", "trial_started")
      .gte("created_at", startOfDayIso);

    // Trials confirmed today (customer activated their account)
    // Activation = calculator modified AND first lead received
    const { data: todayTrials } = await supabase
      .from("trial_pipeline")
      .select("id, calculator_modified_at, first_lead_received_at")
      .eq("owner_sdr_id", user.id)
      .gte("trial_started_at", startOfDayIso);

    const trialsConfirmedToday = (todayTrials || []).filter(t =>
      t.calculator_modified_at && t.first_lead_received_at
    ).length;

    // Trials confirmed THIS SALES WEEK (Friday 5PM PT to now)
    // Sales week boundary ensures all US timezones have finished Friday
    const salesWeekStartDate = getSalesWeekStart(now);
    const salesWeekStartIso = salesWeekStartDate.toISOString();
    console.log(`[Dialer KPIs] Sales week start (Fri 5PM PT): ${salesWeekStartIso}`);

    const { data: weekTrials } = await supabase
      .from("trial_pipeline")
      .select("id, calculator_modified_at, first_lead_received_at")
      .eq("owner_sdr_id", user.id)
      .gte("trial_started_at", salesWeekStartIso);

    const trialsConfirmedThisWeek = (weekTrials || []).filter(t =>
      t.calculator_modified_at && t.first_lead_received_at
    ).length;

    // Legacy: Trials from call outcomes (for backwards compatibility)
    const { count: trialsToday } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .eq("outcome_code", "TRIAL_STARTED")
      .gte("initiated_at", startOfDayIso);

    // Onboardings scheduled today (from activation_meetings)
    const { count: onboardingsScheduledToday } = await supabase
      .from("activation_meetings")
      .select("*", { count: "exact", head: true })
      .eq("scheduled_by_sdr_user_id", user.id)
      .gte("scheduled_start_at", startOfDayIso);

    // Onboardings attended today (status = completed, scheduled by this SDR)
    const { count: onboardingsAttendedToday } = await supabase
      .from("activation_meetings")
      .select("*", { count: "exact", head: true })
      .eq("scheduled_by_sdr_user_id", user.id)
      .eq("status", "completed")
      .gte("scheduled_start_at", startOfDayIso);

    // Calculate show rate (attended / scheduled, as percentage)
    let showRatePercent = 0;
    if (onboardingsScheduledToday && onboardingsScheduledToday > 0) {
      showRatePercent = ((onboardingsAttendedToday || 0) / onboardingsScheduledToday) * 100;
    }

    // Average call duration today (for completed calls)
    const { data: durationData } = await supabase
      .from("calls")
      .select("duration")
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .eq("status", "completed")
      .gte("initiated_at", startOfDayIso)
      .not("duration", "is", null);

    let avgCallDuration = 0;
    if (durationData && durationData.length > 0) {
      const totalDuration = durationData.reduce((sum, call) => sum + (call.duration || 0), 0);
      avgCallDuration = totalDuration / durationData.length;
    }

    // Calculate calls per hour rate
    // Based on hours worked today (from first call to now)
    const { data: firstCallToday } = await supabase
      .from("calls")
      .select("initiated_at")
      .eq("user_id", user.id)
      .eq("call_type", "outbound")
      .gte("initiated_at", startOfDayIso)
      .order("initiated_at", { ascending: true })
      .limit(1)
      .single();

    let callsPerHour = 0;
    if (firstCallToday && callsToday) {
      const firstCallTime = new Date(firstCallToday.initiated_at);
      const hoursWorked = Math.max(0.5, (now.getTime() - firstCallTime.getTime()) / (1000 * 60 * 60));
      callsPerHour = callsToday / hoursWorked;
    }

    return NextResponse.json({
      callsThisHour: callsThisHour || 0,
      callsToday: callsToday || 0,
      conversationsToday: conversationsToday || 0,
      ctaAttemptsToday: ctaAttemptsToday || 0,
      ctaAcceptedToday: ctaAcceptedToday || 0,
      trialsToday: trialsToday || 0,
      trialsStartedToday: trialsStartedToday || 0,
      onboardingsScheduledToday: onboardingsScheduledToday || 0,
      onboardingsAttendedToday: onboardingsAttendedToday || 0,
      showRatePercent: Math.round(showRatePercent * 10) / 10,
      trialsConfirmedToday: trialsConfirmedToday || 0,
      trialsConfirmedThisWeek: trialsConfirmedThisWeek || 0,
      avgCallDuration: Math.round(avgCallDuration),
      callsPerHour: Math.round(callsPerHour * 10) / 10,
    });
  } catch (error) {
    console.error("Error in GET /api/reports/dialer-kpis:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

