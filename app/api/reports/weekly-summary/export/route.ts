import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeekStart } from "@/lib/utils/performanceMetrics";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile to check role - only admins can export
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const weekStartParam = searchParams.get("weekStart");

  // Default to current week if not provided
  const now = new Date();
  const weekStart = weekStartParam 
    ? new Date(weekStartParam) 
    : getWeekStart(now);

  const weekStartIso = weekStart.toISOString().split("T")[0];

  try {
    // Get all users in the organization
    const { data: orgUsers } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, role")
      .eq("organization_id", profile.organization_id);

    if (!orgUsers) {
      return NextResponse.json({ success: true, markdown: "" });
    }

    const rows: string[] = [];

    for (const orgUser of orgUsers) {
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

      const isActivator = !!activatorPerf;
      const isSDR = !!sdrPerf;

      if (!isSDR && !isActivator) {
        continue;
      }

      if (isSDR) {
        const name = orgUser.full_name || orgUser.email || "Unknown";
        const hours = sdrPerf.hours_worked || 0;
        const metric = sdrPerf.install_appointments_attended || 0;
        const expected = `${sdrPerf.expected_attended_min || 0}-${sdrPerf.expected_attended_max || 0}`;
        const band = sdrPerf.score_band || "red";
        const trend = sdrPerf.trend === "up" ? "↑" : sdrPerf.trend === "down" ? "↓" : "→";
        
        rows.push(`| ${name} | SDR | ${hours}h | ${metric} | ${expected} | ${metric} | ${band} | ${trend} |`);
      }

      if (isActivator) {
        const name = orgUser.full_name || orgUser.email || "Unknown";
        const hours = activatorPerf.hours_worked || 0;
        const metric = activatorPerf.completed_installs || 0;
        const expected = `${activatorPerf.expected_installs_min || 0}-${activatorPerf.expected_installs_max || 0}`;
        const band = activatorPerf.score_band || "red";
        const trend = activatorPerf.trend === "up" ? "↑" : activatorPerf.trend === "down" ? "↓" : "→";
        
        rows.push(`| ${name} | Activator | ${hours}h | ${metric} | ${expected} | ${metric} | ${band} | ${trend} |`);
      }
    }

    const markdown = `# Weekly Performance Summary\n\nWeek of ${weekStartIso}\n\n| Name | Role | Hours | Key Metric | Expected | Actual | Band | Trend |\n|------|------|-------|------------|----------|--------|------|-------|\n${rows.join("\n")}`;

    return NextResponse.json({
      success: true,
      markdown,
    });
  } catch (error: any) {
    console.error("Error exporting weekly summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to export weekly summary" },
      { status: 500 }
    );
  }
}


