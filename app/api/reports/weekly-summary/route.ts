import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeekStart, getWeekEnd } from "@/lib/utils/performanceMetrics";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile to check role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const weekStartParam = searchParams.get("weekStart");

  // Default to current week if not provided
  const now = new Date();
  const weekStart = weekStartParam 
    ? new Date(weekStartParam) 
    : getWeekStart(now);
  const weekEnd = getWeekEnd(weekStart);

  const weekStartIso = weekStart.toISOString().split("T")[0];

  try {
    // Get all users in the organization
    const { data: orgUsers } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", profile.organization_id);

    if (!orgUsers) {
      return NextResponse.json({ success: true, summaries: [] });
    }

    const summaries = [];

    for (const orgUser of orgUsers) {
      // Get weekly performance data
      // Check if user is SDR or Activator (or both)
      // For now, we'll check both tables

      // Get SDR performance
      const { data: sdrPerf } = await supabase
        .from("sdr_weekly_performance")
        .select("*")
        .eq("sdr_user_id", orgUser.id)
        .eq("week_start", weekStartIso)
        .single();

      // Get Activator performance
      const { data: activatorPerf } = await supabase
        .from("activator_weekly_performance")
        .select("*")
        .eq("activator_user_id", orgUser.id)
        .eq("week_start", weekStartIso)
        .single();

      // Determine role - check if user has is_activator flag or has activator performance
      // For now, we'll use a simple heuristic: if they have activator performance, they're an activator
      // Otherwise, if they have SDR performance, they're an SDR
      const isActivator = !!activatorPerf;
      const isSDR = !!sdrPerf;

      if (!isSDR && !isActivator) {
        // Skip users with no performance data
        continue;
      }

      // Get performance notes for this week
      const { data: notes } = await supabase
        .from("performance_notes")
        .select("note, created_at, author_id")
        .eq("user_id", orgUser.id)
        .eq("week_start", weekStartIso)
        .order("created_at", { ascending: false })
        .limit(1);

      if (isSDR) {
        summaries.push({
          userId: orgUser.id,
          name: orgUser.full_name || orgUser.email || "Unknown",
          role: "SDR",
          hoursWorked: sdrPerf.hours_worked || 0,
          keyMetric: sdrPerf.install_appointments_attended || 0,
          expectedMin: sdrPerf.expected_attended_min || 0,
          expectedMax: sdrPerf.expected_attended_max || 0,
          scoreBand: sdrPerf.score_band || "red",
          trend: sdrPerf.trend || "flat",
          note: notes?.[0]?.note || null,
        });
      }

      if (isActivator) {
        summaries.push({
          userId: orgUser.id,
          name: orgUser.full_name || orgUser.email || "Unknown",
          role: "Activator",
          hoursWorked: activatorPerf.hours_worked || 0,
          keyMetric: activatorPerf.completed_installs || 0,
          expectedMin: activatorPerf.expected_installs_min || 0,
          expectedMax: activatorPerf.expected_installs_max || 0,
          scoreBand: activatorPerf.score_band || "red",
          trend: activatorPerf.trend || "flat",
          note: notes?.[0]?.note || null,
        });
      }
    }

    // Filter by visibility rules
    // SDR/Activator: own row only
    // Admin: all rows
    const filteredSummaries = profile.role === "admin"
      ? summaries
      : summaries.filter(s => s.userId === user.id);

    return NextResponse.json({
      success: true,
      summaries: filteredSummaries,
      weekStart: weekStartIso,
      weekEnd: weekEnd.toISOString().split("T")[0],
    });
  } catch (error: any) {
    console.error("Error fetching weekly summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch weekly summary" },
      { status: 500 }
    );
  }
}


