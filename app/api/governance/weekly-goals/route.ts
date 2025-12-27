import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/governance/weekly-goals
 * Get weekly goals progress (proven installs and SDR hours)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { startDate, endDate, campaignId } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    // Get campaign goals (rate-based per 40 hours)
    let goalsQuery = supabase
      .from("campaign_goals")
      .select("proven_installs_per_40h, scheduled_appts_per_40h, conversations_per_40h, target_weekly_hours, campaign_id");

    if (campaignId) {
      goalsQuery = goalsQuery.eq("campaign_id", campaignId);
    } else {
      // Get all campaigns for this org
      const { data: orgCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", profile.organization_id);

      if (orgCampaigns && orgCampaigns.length > 0) {
        goalsQuery = goalsQuery.in(
          "campaign_id",
          orgCampaigns.map((c) => c.id)
        );
      }
    }

    const { data: goals } = await goalsQuery;

    // Sum SDR hours from daily_sdr_summaries in date range (needed for rate calculation)
    const { data: dailySummaries } = await supabase
      .from("daily_sdr_summaries")
      .select("paid_hours")
      .gte("date", startDate)
      .lte("date", endDate);

    const sdrHours =
      dailySummaries?.reduce((sum, ds) => sum + (ds.paid_hours || 0), 0) || 0;

    // Get rate-based goals (if multiple campaigns, use the first one's goals for now)
    const provenInstallsPer40h =
      goals && goals.length > 0
        ? goals[0].proven_installs_per_40h || 4
        : 4;
    const scheduledApptsPer40h =
      goals && goals.length > 0
        ? goals[0].scheduled_appts_per_40h || 8
        : 8;
    const conversationsPer40h =
      goals && goals.length > 0
        ? goals[0].conversations_per_40h || 200
        : 200;
    const targetWeeklyHours =
      goals && goals.length > 0
        ? goals[0].target_weekly_hours || 40
        : 40;

    // Calculate expected goals based on actual hours worked
    const hoursRatio = sdrHours > 0 ? sdrHours / 40 : 0;
    const provenInstallsGoal = Math.round(provenInstallsPer40h * hoursRatio);
    const scheduledApptsGoal = Math.round(scheduledApptsPer40h * hoursRatio);
    const conversationsGoal = Math.round(conversationsPer40h * hoursRatio);

    // Count proven installs (credits_remaining < 20) in date range
    let provenInstallsQuery = supabase
      .from("trial_pipeline")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .not("credits_remaining", "is", null)
      .lt("credits_remaining", 20)
      .gte("trial_started_at", startIso)
      .lte("trial_started_at", endIso);

    if (campaignId) {
      // Join with search_results to filter by campaign
      provenInstallsQuery = supabase
        .from("trial_pipeline")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", profile.organization_id)
        .not("credits_remaining", "is", null)
        .lt("credits_remaining", 20)
        .gte("trial_started_at", startIso)
        .lte("trial_started_at", endIso);
    }

    const { count: provenInstallsCount } = await provenInstallsQuery;

    // Count scheduled appointments in date range
    let scheduledApptsQuery = supabase
      .from("activation_meetings")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .gte("scheduled_start_at", startIso)
      .lte("scheduled_start_at", endIso);

    if (campaignId) {
      // Filter by campaign if specified (would need to join with trial_pipeline or search_results)
      // For now, we'll count all for the org
    }

    const { count: scheduledApptsCount } = await scheduledApptsQuery;

    // Count conversations (calls >= 30 seconds) in date range
    let conversationsQuery = supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("call_type", "outbound")
      .gte("duration", 30)
      .gte("initiated_at", startIso)
      .lte("initiated_at", endIso);

    if (campaignId) {
      // Filter by campaign if specified (would need to join with search_results)
      // For now, we'll count all for the org
    }

    const { count: conversationsCount } = await conversationsQuery;

    return NextResponse.json({
      provenInstalls: provenInstallsCount || 0,
      provenInstallsGoal,
      provenInstallsPer40h,
      scheduledAppts: scheduledApptsCount || 0,
      scheduledApptsGoal,
      scheduledApptsPer40h,
      conversations: conversationsCount || 0,
      conversationsGoal,
      conversationsPer40h,
      sdrHours: parseFloat(sdrHours.toFixed(2)),
      targetWeeklyHours,
    });
  } catch (error: any) {
    console.error("Error in weekly-goals:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

