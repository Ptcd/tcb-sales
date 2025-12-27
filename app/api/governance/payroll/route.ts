import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/governance/payroll
 * Calculate payroll for a date range
 * Query params: start_date, end_date (defaults to current week Mon-Fri)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  
  // Default to current week (Monday to Friday)
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const startDate = params.get("start_date") || monday.toISOString().split("T")[0];
  const endDate = params.get("end_date") || friday.toISOString().split("T")[0];

  // Get all team members with hourly rates
  const { data: teamMembers } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, hourly_rate_usd")
    .eq("organization_id", profile.organization_id);

  // Get automatic time tracking from daily_sdr_summaries
  const { data: dailySummaries } = await supabase
    .from("daily_sdr_summaries")
    .select("sdr_user_id, paid_hours, date")
    .gte("date", startDate)
    .lte("date", endDate);

  // Also get manual time_logs for admin adjustments
  const { data: manualTimeLogs } = await supabase
    .from("time_logs")
    .select("team_member_id, hours_logged")
    .gte("date", startDate)
    .lte("date", endDate);

  // Get bonuses for date range
  const { data: bonuses } = await supabase
    .from("bonus_events")
    .select("team_member_id, bonus_amount_usd")
    .gte("created_at", `${startDate}T00:00:00Z`)
    .lte("created_at", `${endDate}T23:59:59Z`);

  // Calculate per team member
  const payroll = (teamMembers || []).map((member) => {
    const memberSummaries = (dailySummaries || []).filter(s => s.sdr_user_id === member.id);
    const autoHours = memberSummaries.reduce((sum, s) => sum + parseFloat(s.paid_hours || 0), 0);
    const memberManualLogs = (manualTimeLogs || []).filter(t => t.team_member_id === member.id);
    const manualHours = memberManualLogs.reduce((sum, t) => sum + parseFloat(t.hours_logged || 0), 0);
    const hoursWorked = autoHours + manualHours;
    const memberBonuses = (bonuses || []).filter(b => b.team_member_id === member.id);
    const hourlyRate = member.hourly_rate_usd || 0;
    const basePay = hoursWorked * hourlyRate;
    const totalBonuses = memberBonuses.reduce((sum, b) => sum + parseFloat(b.bonus_amount_usd || 0), 0);
    const totalPay = basePay + totalBonuses;

    return {
      userId: member.id,
      name: member.full_name || member.email,
      email: member.email,
      hourlyRate,
      hoursWorked: parseFloat(hoursWorked.toFixed(2)),
      basePay: parseFloat(basePay.toFixed(2)),
      bonuses: parseFloat(totalBonuses.toFixed(2)),
      totalPay: parseFloat(totalPay.toFixed(2)),
    };
  }).filter(m => m.hoursWorked > 0 || m.bonuses > 0); // Only show people with activity

  // Calculate totals
  const totals = {
    hoursWorked: payroll.reduce((sum, p) => sum + p.hoursWorked, 0),
    basePay: payroll.reduce((sum, p) => sum + p.basePay, 0),
    bonuses: payroll.reduce((sum, p) => sum + p.bonuses, 0),
    totalPay: payroll.reduce((sum, p) => sum + p.totalPay, 0),
  };

  return NextResponse.json({
    startDate,
    endDate,
    payroll,
    totals,
  });
}


