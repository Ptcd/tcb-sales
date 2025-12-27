import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateSDRMetrics,
  calculateSDRScoring,
  calculateActivatorMetrics,
  calculateActivatorScoring,
  getWeekStart,
  getWeekEnd,
} from "@/lib/utils/performanceMetrics";

/**
 * GET /api/cron/generate-weekly-performance
 * Generate weekly performance snapshots for SDRs and Activators
 * Should run on Fridays at 6 PM PT (configured in vercel.json)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const now = new Date();
    
    // Get the week that just ended (current week)
    const weekStart = getWeekStart(now);
    const weekEnd = getWeekEnd(weekStart);
    
    const weekStartIso = weekStart.toISOString().split("T")[0];
    const weekEndIso = weekEnd.toISOString().split("T")[0];

    console.log(`[Weekly Performance] Processing week: ${weekStartIso} to ${weekEndIso}`);

    // Get all users in the system
    const { data: allUsers, error: usersError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, organization_id, is_activator");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    if (!allUsers || allUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users found",
        sdr_summaries_created: 0,
        activator_summaries_created: 0,
      });
    }

    let sdrSummariesCreated = 0;
    let activatorSummariesCreated = 0;
    const errors: string[] = [];

    for (const user of allUsers) {
      try {
        // Check if user has any activity this week (calls or meetings)
        const { count: callCount } = await supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("initiated_at", weekStart.toISOString())
          .lt("initiated_at", weekEnd.toISOString());

        const { count: meetingCount } = await supabase
          .from("activation_meetings")
          .select("*", { count: "exact", head: true })
          .or(`scheduled_by_sdr_user_id.eq.${user.id},activator_user_id.eq.${user.id}`)
          .gte("scheduled_start_at", weekStart.toISOString())
          .lt("scheduled_start_at", weekEnd.toISOString());

        // Skip if no activity
        if ((!callCount || callCount === 0) && (!meetingCount || meetingCount === 0)) {
          continue;
        }

        // Process SDR performance (if user has SDR activity)
        const hasSdrActivity = callCount && callCount > 0;
        if (hasSdrActivity) {
          try {
            const metrics = await calculateSDRMetrics(
              supabase,
              user.id,
              weekStart,
              weekEnd
            );

            // Get last week for trend
            const lastWeekStart = new Date(weekStart);
            lastWeekStart.setDate(lastWeekStart.getDate() - 7);
            const lastWeekEnd = new Date(weekEnd);
            lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

            const lastWeekMetrics = await calculateSDRMetrics(
              supabase,
              user.id,
              lastWeekStart,
              lastWeekEnd
            );

            const scoring = calculateSDRScoring(metrics, lastWeekMetrics);

            // Upsert SDR weekly performance
            const { error: upsertError } = await supabase
              .from("sdr_weekly_performance")
              .upsert(
                {
                  sdr_user_id: user.id,
                  week_start: weekStartIso,
                  week_end: weekEndIso,
                  hours_worked: metrics.hoursWorked,
                  install_appointments_attended: metrics.installAppointmentsAttended,
                  install_appointments_booked: metrics.installAppointmentsBooked,
                  show_rate: metrics.showRate,
                  conversations: metrics.conversations,
                  dials: metrics.dials,
                  expected_attended_min: scoring.expectedAttendedMin,
                  expected_attended_max: scoring.expectedAttendedMax,
                  score_band: scoring.scoreBand,
                  trend: scoring.trend,
                },
                {
                  onConflict: "sdr_user_id,week_start",
                }
              );

            if (upsertError) {
              console.error(`Error upserting SDR performance for ${user.id}:`, upsertError);
              errors.push(`SDR performance upsert failed for ${user.email}`);
            } else {
              sdrSummariesCreated++;
            }
          } catch (sdrError: any) {
            console.error(`Error calculating SDR metrics for ${user.id}:`, sdrError);
            errors.push(`SDR metrics calculation failed for ${user.email}: ${sdrError.message}`);
          }
        }

        // Process Activator performance (if user is activator or has activator activity)
        const isActivator = user.is_activator || false;
        const hasActivatorActivity = meetingCount && meetingCount > 0;
        
        if (isActivator || hasActivatorActivity) {
          try {
            const metrics = await calculateActivatorMetrics(
              supabase,
              user.id,
              weekStart,
              weekEnd
            );

            // Get last week for trend
            const lastWeekStart = new Date(weekStart);
            lastWeekStart.setDate(lastWeekStart.getDate() - 7);
            const lastWeekEnd = new Date(weekEnd);
            lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

            const lastWeekMetrics = await calculateActivatorMetrics(
              supabase,
              user.id,
              lastWeekStart,
              lastWeekEnd
            );

            const scoring = calculateActivatorScoring(metrics, lastWeekMetrics);

            // Upsert Activator weekly performance
            const { error: upsertError } = await supabase
              .from("activator_weekly_performance")
              .upsert(
                {
                  activator_user_id: user.id,
                  week_start: weekStartIso,
                  week_end: weekEndIso,
                  hours_worked: metrics.hoursWorked,
                  attended_appointments: metrics.attendedAppointments,
                  completed_installs: metrics.completedInstalls,
                  completion_rate: metrics.completionRate,
                  avg_time_to_live_hours: metrics.avgTimeToLiveHours,
                  pct_lead_within_72h: metrics.pctLeadWithin72h,
                  stalled_installs: metrics.stalledInstalls,
                  expected_installs_min: scoring.expectedInstallsMin,
                  expected_installs_max: scoring.expectedInstallsMax,
                  score_band: scoring.scoreBand,
                  trend: scoring.trend,
                },
                {
                  onConflict: "activator_user_id,week_start",
                }
              );

            if (upsertError) {
              console.error(`Error upserting Activator performance for ${user.id}:`, upsertError);
              errors.push(`Activator performance upsert failed for ${user.email}`);
            } else {
              activatorSummariesCreated++;
            }
          } catch (activatorError: any) {
            console.error(`Error calculating Activator metrics for ${user.id}:`, activatorError);
            errors.push(`Activator metrics calculation failed for ${user.email}: ${activatorError.message}`);
          }
        }
      } catch (userError: any) {
        console.error(`Error processing user ${user.id}:`, userError);
        errors.push(`User processing failed for ${user.email}: ${userError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${sdrSummariesCreated} SDR summaries and ${activatorSummariesCreated} Activator summaries`,
      sdr_summaries_created: sdrSummariesCreated,
      activator_summaries_created: activatorSummariesCreated,
      week_start: weekStartIso,
      week_end: weekEndIso,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in generate-weekly-performance:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/generate-weekly-performance
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}


