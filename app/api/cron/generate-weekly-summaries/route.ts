import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeWeeklyMetrics, getSalesWeekStart, getSalesWeekEnd, formatHours, formatEfficiency } from "@/lib/utils/sdrMetrics";
import { SupabaseClient } from "@supabase/supabase-js";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.BREVO_FROM_EMAIL || "";
const FROM_EMAIL = "no-reply@autosalvageautomation.com";
const FROM_NAME = "CRM Weekly Reports";

// Cache for org admins/managers to avoid repeated queries
const orgAdminCache = new Map<string, Array<{ email: string; full_name: string | null }>>();

/**
 * Helper: Get Live with Lead count for a week
 */
async function getLiveWithLeadCount(
  supabase: SupabaseClient,
  sdrUserId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const { count } = await supabase
    .from("trial_pipeline")
    .select("*", { count: "exact", head: true })
    .eq("owner_sdr_id", sdrUserId)
    .not("first_lead_received_at", "is", null)
    .gte("first_lead_received_at", weekStart.toISOString())
    .lt("first_lead_received_at", weekEnd.toISOString());
  return count || 0;
}

/**
 * Helper: Get Installs Completed count for a week
 */
async function getInstallsCompleted(
  supabase: SupabaseClient,
  activatorUserId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const { count } = await supabase
    .from("trial_pipeline")
    .select("*", { count: "exact", head: true })
    .eq("activator_user_id", activatorUserId)
    .not("calculator_modified_at", "is", null)
    .gte("calculator_modified_at", weekStart.toISOString())
    .lt("calculator_modified_at", weekEnd.toISOString());
  return count || 0;
}

/**
 * Helper: Get Upcoming Installs count (next 3 days)
 */
async function getUpcomingInstalls(
  supabase: SupabaseClient,
  sdrUserId?: string
): Promise<number> {
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  
  let query = supabase
    .from("activation_meetings")
    .select("*", { count: "exact", head: true })
    .eq("status", "scheduled")
    .gte("scheduled_start_at", now.toISOString())
    .lt("scheduled_start_at", threeDaysFromNow.toISOString());
  
  if (sdrUserId) {
    query = query.eq("scheduled_by_sdr_user_id", sdrUserId);
  }
  
  const { count } = await query;
  return count || 0;
}

/**
 * Helper: Get weeks at zero for SDR
 */
async function getWeeksAtZeroSDR(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("sdr_weekly_performance")
    .select("week_start, week_end")
    .eq("sdr_user_id", userId)
    .order("week_start", { ascending: false })
    .limit(4);
  
  let count = 0;
  for (const week of data || []) {
    // Check if live with lead is 0
    const weekStart = new Date(week.week_start);
    const weekEnd = new Date(week.week_end);
    const liveWithLead = await getLiveWithLeadCount(supabase, userId, weekStart, weekEnd);
    if (liveWithLead === 0) count++;
    else break;
  }
  return count;
}

/**
 * Helper: Get weeks at zero for Activator
 */
async function getWeeksAtZeroActivator(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("activator_weekly_performance")
    .select("completed_installs")
    .eq("activator_user_id", userId)
    .order("week_start", { ascending: false })
    .limit(4);
  
  let count = 0;
  for (const week of data || []) {
    if ((week.completed_installs || 0) === 0) count++;
    else break;
  }
  return count;
}

/**
 * Helper: Get SDR score band
 */
function getSDRBand(liveWithLead: number, hoursWorked: number): string {
  if (liveWithLead === 0) return 'let_go';
  const hoursFactor = hoursWorked / 40;
  const adjusted = liveWithLead / hoursFactor;
  if (adjusted >= 7) return 'exceeding';
  if (adjusted >= 5) return 'strong';
  if (adjusted >= 3) return 'good';
  return 'coaching';
}

/**
 * Helper: Get Activator score band
 */
function getActivatorBand(installsCompleted: number, hoursWorked: number): string {
  if (installsCompleted === 0) return 'let_go';
  const hoursFactor = hoursWorked / 40;
  const adjusted = installsCompleted / hoursFactor;
  if (adjusted >= 7) return 'exceeding';
  if (adjusted >= 5) return 'strong';
  if (adjusted >= 3) return 'good';
  return 'coaching';
}

/**
 * Helper: Get expected range
 */
function getExpectedRange(hoursWorked: number): string {
  const hoursFactor = hoursWorked / 40;
  const min = Math.round(3 * hoursFactor * 10) / 10;
  const max = Math.round(4 * hoursFactor * 10) / 10;
  return `${min}-${max}`;
}

/**
 * GET /api/cron/generate-weekly-summaries
 * Generate weekly SDR summaries and send email reports
 * Should run on Friday at 6pm (configured in vercel.json)
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
    
    // SALES WEEK BOUNDARY: Friday 5:00 PM Pacific to Friday 4:59 PM Pacific
    // This matches the dialer's "activated this week" metric
    // When cron runs on Friday evening, we want the week that JUST ended
    
    // Go back 1 day to ensure we get the COMPLETED week (not the one just starting)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Get the sales week boundaries
    const weekStartTimestamp = getSalesWeekStart(yesterday);
    const weekEndTimestamp = getSalesWeekEnd(yesterday);
    
    // Use calendar dates for summary records
    const weekStartStr = weekStartTimestamp.toISOString().split("T")[0];
    const weekEndStr = weekEndTimestamp.toISOString().split("T")[0];
    
    // Create Date objects for computeWeeklyMetrics (which expects Date objects)
    const weekStart = new Date(weekStartTimestamp);
    const weekEnd = new Date(weekEndTimestamp);
    
    console.log(`[Weekly Summary] Processing sales week:`);
    console.log(`  Start (Fri 5PM PT): ${weekStartTimestamp.toISOString()}`);
    console.log(`  End (Fri 4:59PM PT): ${weekEndTimestamp.toISOString()}`);
    console.log(`  Date range: ${weekStartStr} to ${weekEndStr}`);

    // Get all SDRs (users with role = 'member')
    const { data: sdrs, error: sdrsError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, organization_id")
      .eq("role", "member");

    if (sdrsError) {
      console.error("Error fetching SDRs:", sdrsError);
      return NextResponse.json(
        { error: "Failed to fetch SDRs" },
        { status: 500 }
      );
    }

    if (!sdrs || sdrs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No SDRs found",
        summaries_created: 0,
        emails_sent: 0,
      });
    }

    let summariesCreated = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    for (const sdr of sdrs) {
      try {
        // Check if SDR has any calls this week - skip if no activity
        // Use timestamp range (Monday 11 PM UTC → Friday 11 PM UTC)
        const { count: callCount } = await supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .eq("user_id", sdr.id)
          .gte("initiated_at", weekStartTimestamp.toISOString())
          .lte("initiated_at", weekEndTimestamp.toISOString());

        if (!callCount || callCount === 0) {
          console.log(`Skipping ${sdr.email} - no calls this week`);
          continue;
        }

        // Compute weekly aggregated metrics
        // computeWeeklyMetrics uses daily summaries which are keyed by calendar date
        // So we pass the calendar date range, but the actual data window is Monday 11 PM → Friday 11 PM
        const weeklyMetrics = await computeWeeklyMetrics(
          supabase,
          sdr.id,
          weekStart,
          weekEnd
        );

        // Calculate install appointments for the week
        // Booked: all appointments scheduled in this week
        const { count: installAppointmentsBooked } = await supabase
          .from("activation_meetings")
          .select("*", { count: "exact", head: true })
          .eq("scheduled_by_sdr_user_id", sdr.id)
          .gte("scheduled_start_at", weekStartTimestamp.toISOString())
          .lte("scheduled_start_at", weekEndTimestamp.toISOString());

        // Attended: appointments completed in this week
        const { count: installAppointmentsAttended } = await supabase
          .from("activation_meetings")
          .select("*", { count: "exact", head: true })
          .eq("scheduled_by_sdr_user_id", sdr.id)
          .eq("status", "completed")
          .gte("completed_at", weekStartTimestamp.toISOString())
          .lte("completed_at", weekEndTimestamp.toISOString());

        // Calculate Live with Lead for the week
        const liveWithLeadWeek = await getLiveWithLeadCount(supabase, sdr.id, weekStartTimestamp, weekEndTimestamp);
        const expectedRange = getExpectedRange(weeklyMetrics.paidHours);

        // Upsert weekly summary
        const { error: upsertError } = await supabase
          .from("weekly_sdr_summaries")
          .upsert(
            {
              sdr_user_id: sdr.id,
              week_start: weekStartStr,
              week_end: weekEndStr,
              paid_hours: weeklyMetrics.paidHours,
              active_hours: weeklyMetrics.activeHours,
              average_efficiency: weeklyMetrics.averageEfficiency,
              total_dials: weeklyMetrics.totalDials,
              conversations: weeklyMetrics.conversations,
              trials_started: weeklyMetrics.trialsStarted,
              paid_signups: weeklyMetrics.paidSignups,
              install_appointments_booked: installAppointmentsBooked || 0,
              install_appointments_attended: installAppointmentsAttended || 0,
            },
            {
              onConflict: "sdr_user_id,week_start,week_end",
            }
          );

        if (upsertError) {
          console.error(`Error upserting weekly summary for SDR ${sdr.id}:`, upsertError);
          errors.push(`Weekly summary upsert failed for ${sdr.email}`);
          continue;
        }

        summariesCreated++;

        // Send email to SDR
        if (sdr.email && brevoClient) {
          try {
            await sendSDRWeeklyEmail(
              sdr.email,
              sdr.full_name || sdr.email,
              weekStartStr,
              weekEndStr,
              {
                liveWithLeadWeek,
                hoursWeek: weeklyMetrics.paidHours,
                expectedRange,
                installAppointmentsAttended: installAppointmentsAttended || 0,
                installAppointmentsBooked: installAppointmentsBooked || 0,
                conversations: weeklyMetrics.conversations,
                convRate: weeklyMetrics.conversations > 0
                  ? ((installAppointmentsBooked || 0) / weeklyMetrics.conversations * 100).toFixed(1)
                  : "0.0",
              }
            );
            emailsSent++;
          } catch (emailError: any) {
            console.error(`Error sending weekly email to ${sdr.email}:`, emailError);
            errors.push(`Weekly email failed for ${sdr.email}`);
          }
        }
      } catch (sdrError: any) {
        console.error(`Error processing SDR ${sdr.id} for weekly:`, sdrError);
        errors.push(`Weekly processing failed for ${sdr.email}: ${sdrError.message}`);
      }
    }

    // Process Activators
    const { data: activators, error: activatorsError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name")
      .eq("is_activator", true);

    if (!activatorsError && activators) {
      for (const activator of activators) {
        try {
          // Get weekly performance data
          const { data: weeklyPerf } = await supabase
            .from("activator_weekly_performance")
            .select("*")
            .eq("activator_user_id", activator.id)
            .eq("week_start", weekStartStr)
            .eq("week_end", weekEndStr)
            .single();

          if (!weeklyPerf) {
            continue; // Skip if no performance data
          }

          const installsCompleted = Number(weeklyPerf.completed_installs || 0);
          const liveWithLeadFromBookings = await getLiveWithLeadCount(supabase, activator.id, weekStartTimestamp, weekEndTimestamp);
          const hours = Number(weeklyPerf.paid_hours || 0);
          const expectedRange = getExpectedRange(hours);
          const avgTimeToLive = Number(weeklyPerf.avg_time_to_live_hours || 0);
          
          // Get stalled count for this activator
          const { count: stalledCount } = await supabase
            .from("activation_meetings")
            .select("*", { count: "exact", head: true })
            .eq("activator_user_id", activator.id)
            .eq("status", "completed")
            .not("completed_at", "is", null)
            .lt("completed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

          // Get attended count for the week
          const { count: attendedWeek } = await supabase
            .from("activation_meetings")
            .select("*", { count: "exact", head: true })
            .eq("activator_user_id", activator.id)
            .eq("status", "completed")
            .gte("completed_at", weekStartTimestamp.toISOString())
            .lt("completed_at", weekEndTimestamp.toISOString());

          // Send Activator weekly email
          if (activator.email && brevoClient) {
            try {
              await sendActivatorWeeklyEmail(
                activator.email,
                activator.full_name || activator.email,
                weekStartStr,
                weekEndStr,
                {
                  installsCompletedWeek: installsCompleted,
                  liveWithLeadFromBookingsWeek: liveWithLeadFromBookings,
                  hoursWeek: hours,
                  expectedRange,
                  attendedWeek: attendedWeek || 0,
                  avgTimeToLive,
                  stalledCount: stalledCount || 0,
                }
              );
              emailsSent++;
            } catch (emailError: any) {
              console.error(`Error sending weekly email to ${activator.email}:`, emailError);
              errors.push(`Weekly email failed for ${activator.email}`);
            }
          }
        } catch (activatorError: any) {
          console.error(`Error processing Activator ${activator.id} for weekly:`, activatorError);
          errors.push(`Weekly processing failed for ${activator.email}: ${activatorError.message}`);
        }
      }
    }

    // Generate activator credits summary for admins
    let activatorCreditsSummary: Array<{
      activator_name: string;
      activator_email: string;
      activations_count: number;
      total_credits: number;
      avg_days_to_convert: number;
    }> = [];

    try {
      const { data: credits } = await supabase
        .from("activation_credits")
        .select(`
          activator_user_id,
          amount,
          days_to_convert,
          user_profiles!activation_credits_activator_user_id_fkey (
            full_name,
            email
          )
        `)
        .gte("credited_at", weekStartTimestamp.toISOString())
        .lte("credited_at", weekEndTimestamp.toISOString());

      if (credits && credits.length > 0) {
        // Group by activator
        const byActivator = new Map<string, {
          name: string;
          email: string;
          count: number;
          total: number;
          days: number[];
        }>();

        for (const credit of credits) {
          const activatorId = credit.activator_user_id;
          if (!activatorId) continue;

          const profiles = credit.user_profiles as { full_name: string | null; email: string }[] | null;
          const profile = Array.isArray(profiles) ? profiles[0] : profiles;
          if (!profile) continue;

          if (!byActivator.has(activatorId)) {
            byActivator.set(activatorId, {
              name: profile.full_name || profile.email,
              email: profile.email,
              count: 0,
              total: 0,
              days: [],
            });
          }

          const entry = byActivator.get(activatorId)!;
          entry.count++;
          entry.total += Number(credit.amount || 5.00);
          if (credit.days_to_convert) {
            entry.days.push(credit.days_to_convert);
          }
        }

        activatorCreditsSummary = Array.from(byActivator.values()).map(entry => ({
          activator_name: entry.name,
          activator_email: entry.email,
          activations_count: entry.count,
          total_credits: entry.total,
          avg_days_to_convert: entry.days.length > 0
            ? Math.round((entry.days.reduce((a, b) => a + b, 0) / entry.days.length) * 10) / 10
            : 0,
        }));
      }
    } catch (creditsError: any) {
      console.error("Error generating activator credits summary:", creditsError);
    }

    // Send ONE admin weekly summary email
    try {
      await sendAdminWeeklyEmail(
        supabase,
        weekStartStr,
        weekEndStr,
        weekStartTimestamp,
        weekEndTimestamp
      );
    } catch (adminError: any) {
      console.error("Error sending admin weekly email:", adminError);
      errors.push(`Admin weekly email failed: ${adminError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${summariesCreated} weekly summaries, sent ${emailsSent} emails`,
      summaries_created: summariesCreated,
      emails_sent: emailsSent,
      week_start: weekStartStr,
      week_end: weekEndStr,
      activator_credits: activatorCreditsSummary,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in generate-weekly-summaries:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Send SDR weekly summary email
 */
async function sendSDRWeeklyEmail(
  toEmail: string,
  name: string,
  weekStart: string,
  weekEnd: string,
  metrics: {
    liveWithLeadWeek: number;
    hoursWeek: number;
    expectedRange: string;
    installAppointmentsAttended: number;
    installAppointmentsBooked: number;
    conversations: number;
    convRate: string;
  }
) {
  if (!brevoClient) return;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const subject = `Weekly Summary - ${name} - ${formatDate(weekStart)} to ${formatDate(weekEnd)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 24px; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .primary { font-size: 32px; font-weight: bold; color: #1e40af; margin: 16px 0; }
        .secondary { font-size: 24px; font-weight: 600; color: #3b82f6; margin: 12px 0; }
        h2 { font-size: 18px; font-weight: 600; color: #374151; margin: 24px 0 12px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        li:last-child { border-bottom: none; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Weekly Summary</h1>
            <p>${name} • ${formatDate(weekStart)} – ${formatDate(weekEnd)}</p>
          </div>
          <div class="content">
            <h2>PRIMARY</h2>
            <p class="primary">Live calculators with a lead (week): ${metrics.liveWithLeadWeek}</p>
            <p class="secondary">Installs Booked (week): ${metrics.installAppointmentsBooked}</p>

            <h2>CONVERSION</h2>
            <ul>
              <li>Conversations: ${metrics.conversations}</li>
              <li>Installs Booked: ${metrics.installAppointmentsBooked}</li>
              <li>Conversion Rate: ${metrics.convRate}%</li>
            </ul>

            <h2>WEEK TO DATE</h2>
            <ul>
              <li>Live calculators with a lead: ${metrics.liveWithLeadWeek}</li>
              <li>Hours worked: ${formatHours(metrics.hoursWeek)}</li>
              <li>Expected range (hours-adjusted): ${metrics.expectedRange}</li>
            </ul>

            <h2>CONTEXT</h2>
            <ul>
              <li>Install appointments attended: ${metrics.installAppointmentsAttended}</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Weekly Summary - ${name} - ${formatDate(weekStart)} to ${formatDate(weekEnd)}

PRIMARY
  Live calculators with a lead (week): ${metrics.liveWithLeadWeek}
  Installs Booked (week): ${metrics.installAppointmentsBooked}

CONVERSION
  Conversations: ${metrics.conversations}
  Installs Booked: ${metrics.installAppointmentsBooked}
  Conversion Rate: ${metrics.convRate}%

WEEK TO DATE
  Live calculators with a lead: ${metrics.liveWithLeadWeek}
  Hours worked: ${formatHours(metrics.hoursWeek)}
  Expected range (hours-adjusted): ${metrics.expectedRange}

CONTEXT
  Install appointments attended: ${metrics.installAppointmentsAttended}

View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports
  `;

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.textContent = textContent;
  sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.tags = ["sdr-weekly-summary"];

  await brevoClient.sendTransacEmail(sendSmtpEmail);
}

/**
 * Send Activator weekly summary email
 */
async function sendActivatorWeeklyEmail(
  toEmail: string,
  name: string,
  weekStart: string,
  weekEnd: string,
  metrics: {
    installsCompletedWeek: number;
    liveWithLeadFromBookingsWeek: number;
    hoursWeek: number;
    expectedRange: string;
    attendedWeek: number;
    avgTimeToLive: number;
    stalledCount: number;
  }
) {
  if (!brevoClient) return;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const subject = `Weekly Summary - ${name} - ${formatDate(weekStart)} to ${formatDate(weekEnd)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; padding: 24px; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .primary { font-size: 32px; font-weight: bold; color: #047857; margin: 16px 0; }
        .secondary { font-size: 24px; font-weight: 600; color: #059669; margin: 12px 0; }
        h2 { font-size: 18px; font-weight: 600; color: #374151; margin: 24px 0 12px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        li:last-child { border-bottom: none; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Weekly Summary</h1>
            <p>${name} • ${formatDate(weekStart)} – ${formatDate(weekEnd)}</p>
          </div>
          <div class="content">
            <h2>PRIMARY</h2>
            <p class="primary">Installs completed (week): ${metrics.installsCompletedWeek}</p>
            <p class="secondary">Live with lead from your bookings (week): ${metrics.liveWithLeadFromBookingsWeek}</p>
            
            <h2>WEEK TO DATE</h2>
            <ul>
              <li>Installs completed: ${metrics.installsCompletedWeek}</li>
              <li>Live with lead (your bookings): ${metrics.liveWithLeadFromBookingsWeek}</li>
              <li>Hours worked: ${formatHours(metrics.hoursWeek)}</li>
              <li>Expected range (hours-adjusted): ${metrics.expectedRange}</li>
            </ul>
            
            <h2>CONTEXT</h2>
            <ul>
              <li>Install appointments attended: ${metrics.attendedWeek}</li>
              <li>Avg time to live: ${metrics.avgTimeToLive} hours</li>
              <li>Stalled installs (>7 days): ${metrics.stalledCount}</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Weekly Summary - ${name} - ${formatDate(weekStart)} to ${formatDate(weekEnd)}

PRIMARY
  Installs completed (week): ${metrics.installsCompletedWeek}
  Live with lead from your bookings (week): ${metrics.liveWithLeadFromBookingsWeek}

WEEK TO DATE
  Installs completed: ${metrics.installsCompletedWeek}
  Live with lead (your bookings): ${metrics.liveWithLeadFromBookingsWeek}
  Hours worked: ${formatHours(metrics.hoursWeek)}
  Expected range (hours-adjusted): ${metrics.expectedRange}

CONTEXT
  Install appointments attended: ${metrics.attendedWeek}
  Avg time to live: ${metrics.avgTimeToLive} hours
  Stalled installs (>7 days): ${metrics.stalledCount}

View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports
  `;

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.textContent = textContent;
  sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.tags = ["activator-weekly-summary"];

  await brevoClient.sendTransacEmail(sendSmtpEmail);
}

/**
 * Send Admin weekly summary (ONE email total)
 */
async function sendAdminWeeklyEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  weekStart: string,
  weekEnd: string,
  weekStartTimestamp: Date,
  weekEndTimestamp: Date
) {
  if (!brevoClient) return;

  // Get all admins
  const { data: admins } = await supabase
    .from("user_profiles")
    .select("email, full_name")
    .in("role", ["admin", "manager"]);

  const adminEmails = admins?.map(a => a.email).filter(Boolean) || [];
  if (ADMIN_EMAIL && !adminEmails.includes(ADMIN_EMAIL)) {
    adminEmails.push(ADMIN_EMAIL);
  }

  if (adminEmails.length === 0) {
    console.log("No admin emails found for weekly summary");
    return;
  }

  // Get all SDRs
  const { data: sdrs } = await supabase
    .from("user_profiles")
    .select("id, email, full_name")
    .eq("role", "member")
    .or("is_activator.is.null,is_activator.eq.false");

  // Get all Activators
  const { data: activators } = await supabase
    .from("user_profiles")
    .select("id, email, full_name")
    .eq("is_activator", true);

  // Process SDRs
  const sdrsByBand: {
    exceeding: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number; installsBooked: number; conversations: number; convRate: string }>;
    strong: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number; installsBooked: number; conversations: number; convRate: string }>;
    good: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number; installsBooked: number; conversations: number; convRate: string }>;
    coaching: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number; installsBooked: number; conversations: number; convRate: string }>;
    let_go: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero: number; installsBooked: number; conversations: number; convRate: string }>;
  } = {
    exceeding: [],
    strong: [],
    good: [],
    coaching: [],
    let_go: [],
  };

  let companyLiveWithLeadWeek = 0;
  let weekSdrInstalls = 0;
  let weekInstalls = 0;
  let weekInstallsWithLead = 0;

  for (const sdr of sdrs || []) {
    try {
      const liveWithLead = await getLiveWithLeadCount(supabase, sdr.id, weekStartTimestamp, weekEndTimestamp);
      companyLiveWithLeadWeek += liveWithLead;

      // Get hours from weekly performance or calculate
      const { data: weeklyPerf } = await supabase
        .from("sdr_weekly_performance")
        .select("paid_hours, conversations")
        .eq("sdr_user_id", sdr.id)
        .eq("week_start", weekStart)
        .eq("week_end", weekEnd)
        .single();

      const hours = Number(weeklyPerf?.paid_hours || 0);
      const conversations = Number(weeklyPerf?.conversations || 0);
      const band = getSDRBand(liveWithLead, hours);
      const expected = getExpectedRange(hours);
      const weeksAtZero = await getWeeksAtZeroSDR(supabase, sdr.id);

      // Get installs booked for this SDR this week
      const { count: installsBooked } = await supabase
        .from("activation_meetings")
        .select("*", { count: "exact", head: true })
        .eq("scheduled_by_sdr_user_id", sdr.id)
        .gte("scheduled_start_at", weekStartTimestamp.toISOString())
        .lte("scheduled_start_at", weekEndTimestamp.toISOString());

      const convRate = conversations > 0 ? ((installsBooked || 0) / conversations * 100).toFixed(1) : "0.0";

      const entry = {
        name: sdr.full_name || sdr.email,
        actual: liveWithLead,
        expected,
        hours: Math.round(hours * 10) / 10,
        installsBooked: installsBooked || 0,
        conversations,
        convRate,
      };

      if (band === 'let_go') {
        sdrsByBand.let_go.push({
          ...entry,
          weeksAtZero,
        });
      } else if (band === 'exceeding') {
        sdrsByBand.exceeding.push(entry);
      } else if (band === 'strong') {
        sdrsByBand.strong.push(entry);
      } else if (band === 'good') {
        sdrsByBand.good.push(entry);
      } else if (band === 'coaching') {
        sdrsByBand.coaching.push(entry);
      }

      // Funnel metrics - SDR installs (installs from their appointments)
      const { count: sdrInstalls } = await supabase
        .from("trial_pipeline")
        .select("*", { count: "exact", head: true })
        .eq("owner_sdr_id", sdr.id)
        .not("calculator_modified_at", "is", null)
        .gte("calculator_modified_at", weekStartTimestamp.toISOString())
        .lt("calculator_modified_at", weekEndTimestamp.toISOString());
      weekSdrInstalls += sdrInstalls || 0;
    } catch (error: any) {
      console.error(`Error processing SDR ${sdr.id} for weekly summary:`, error);
    }
  }

  // Process Activators
  const activatorsByBand: {
    exceeding: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number }>;
    strong: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number }>;
    good: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number }>;
    coaching: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number }>;
    let_go: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero: number }>;
  } = {
    exceeding: [],
    strong: [],
    good: [],
    coaching: [],
    let_go: [],
  };

  for (const activator of activators || []) {
    try {
      const installsCompleted = await getInstallsCompleted(supabase, activator.id, weekStartTimestamp, weekEndTimestamp);
      weekInstalls += installsCompleted;

      // Get hours
      const { data: weeklyPerf } = await supabase
        .from("activator_weekly_performance")
        .select("paid_hours")
        .eq("activator_user_id", activator.id)
        .eq("week_start", weekStart)
        .eq("week_end", weekEnd)
        .single();

      const hours = Number(weeklyPerf?.paid_hours || 0);
      const band = getActivatorBand(installsCompleted, hours);
      const expected = getExpectedRange(hours);
      const weeksAtZero = await getWeeksAtZeroActivator(supabase, activator.id);

      const entry = {
        name: activator.full_name || activator.email,
        actual: installsCompleted,
        expected,
        hours: Math.round(hours * 10) / 10,
      };

      if (band === 'let_go') {
        activatorsByBand.let_go.push({
          ...entry,
          weeksAtZero,
        });
      } else if (band === 'exceeding') {
        activatorsByBand.exceeding.push(entry);
      } else if (band === 'strong') {
        activatorsByBand.strong.push(entry);
      } else if (band === 'good') {
        activatorsByBand.good.push(entry);
      } else if (band === 'coaching') {
        activatorsByBand.coaching.push(entry);
      }
    } catch (error: any) {
      console.error(`Error processing Activator ${activator.id} for weekly summary:`, error);
    }
  }

  weekInstallsWithLead = companyLiveWithLeadWeek;

  // Get installs this week with URLs
  const { data: weekInstallsData } = await supabase
    .from('trial_pipeline')
    .select(`
      id,
      install_url,
      calculator_installed_at,
      first_lead_received_at,
      owner_sdr_id,
      assigned_activator_id,
      search_results!inner(name, website)
    `)
    .gte('calculator_installed_at', weekStartTimestamp.toISOString())
    .lt('calculator_installed_at', weekEndTimestamp.toISOString())
    .order('calculator_installed_at', { ascending: false });

  // Group by: with lead, without lead
  const installsWithLead = weekInstallsData?.filter((i: any) => i.first_lead_received_at) || [];
  const installsWithoutLead = weekInstallsData?.filter((i: any) => !i.first_lead_received_at) || [];

  // Get SDR and Activator names helper
  const getSdrName = async (sdrId: string | null) => {
    if (!sdrId) return 'Unknown';
    const { data } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', sdrId)
      .single();
    return data?.full_name || data?.email || 'Unknown';
  };

  const getActivatorName = async (activatorId: string | null) => {
    if (!activatorId) return 'Unknown';
    const { data } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', activatorId)
      .single();
    return data?.full_name || data?.email || 'Unknown';
  };

  // Build installs with names
  const installsWithLeadNames = await Promise.all(installsWithLead.map(async (i: any) => {
    const searchResults = Array.isArray(i.search_results) ? i.search_results[0] : i.search_results;
    return {
      accountName: searchResults?.name || 'Unknown',
      websiteUrl: i.install_url || searchResults?.website || '',
      sdrName: await getSdrName(i.owner_sdr_id),
      activatorName: await getActivatorName(i.assigned_activator_id),
    };
  }));

  const installsWithoutLeadNames = await Promise.all(installsWithoutLead.map(async (i: any) => {
    const searchResults = Array.isArray(i.search_results) ? i.search_results[0] : i.search_results;
    return {
      accountName: searchResults?.name || 'Unknown',
      websiteUrl: i.install_url || searchResults?.website || '',
      installedAt: i.calculator_installed_at,
      activatorName: await getActivatorName(i.assigned_activator_id),
    };
  }));

  // Get total upcoming installs (company-wide)
  const totalUpcomingInstalls = await getUpcomingInstalls(supabase);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderBand = (label: string, people: Array<{ name: string; actual: number; expected: string; hours: number; weeksAtZero?: number; installsBooked?: number; conversations?: number; convRate?: string }>) => {
    if (people.length === 0) return `<p><strong>${label}:</strong> (none)</p>`;
    const rows = people.map(p => {
      const sdrMetrics = p.installsBooked !== undefined ? `, Installs Booked: ${p.installsBooked}, Conv: ${p.convRate}%` : '';
      return `<li>${p.name} — Live+Lead: ${p.actual}/${p.expected}${sdrMetrics}, Hours: ${p.hours}h${p.weeksAtZero ? ` (${p.weeksAtZero} weeks at 0)` : ''}</li>`;
    }).join('');
    return `<h3>${label}</h3><ul>${rows}</ul>`;
  };

  // Build HTML email
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 24px; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .primary { font-size: 32px; font-weight: bold; color: #1e40af; margin: 16px 0; }
        h2 { font-size: 20px; font-weight: 700; color: #1f2937; margin: 24px 0 12px; }
        h3 { font-size: 16px; font-weight: 600; color: #374151; margin: 16px 0 8px; }
        ul { list-style: none; padding: 0; margin: 0 0 16px 0; }
        li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        li:last-child { border-bottom: none; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Weekly Performance Summary</h1>
            <p>${formatDate(weekStart)} to ${formatDate(weekEnd)}</p>
          </div>
          <div class="content">
            <h2>PRIMARY</h2>
            <p class="primary">Live calculators with a lead (week): ${companyLiveWithLeadWeek}</p>
            <p>Installs completed (week): ${weekInstalls}</p>
            
            <h2>SDR PERFORMANCE (Hours-Adjusted)</h2>
            ${renderBand('Exceeding (7+ at 40hrs)', sdrsByBand.exceeding)}
            ${renderBand('Strong (5-6 at 40hrs)', sdrsByBand.strong)}
            ${renderBand('Good (3-4 at 40hrs)', sdrsByBand.good)}
            ${renderBand('Needs Coaching (1-2 at 40hrs)', sdrsByBand.coaching)}
            ${renderBand('Let Go (0 over 2 weeks)', sdrsByBand.let_go)}
            
            <h2>ACTIVATOR PERFORMANCE (Hours-Adjusted)</h2>
            ${renderBand('Exceeding (7-8+ at 40hrs)', activatorsByBand.exceeding)}
            ${renderBand('Strong (5-6 at 40hrs)', activatorsByBand.strong)}
            ${renderBand('Good (3-4 at 40hrs)', activatorsByBand.good)}
            ${renderBand('Needs Coaching (1-2 at 40hrs)', activatorsByBand.coaching)}
            ${renderBand('Let Go (0 over 2 weeks)', activatorsByBand.let_go)}
            
            <h2>FUNNEL</h2>
            <p>Installs: ${weekSdrInstalls} → Installs: ${weekInstalls} → Live+Lead: ${weekInstallsWithLead}</p>
            
            <h2>INSTALL VERIFICATION</h2>

            <h3>Installed + First Lead Received (${installsWithLeadNames.length})</h3>
            ${installsWithLeadNames.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <thead>
                <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">Account</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">URL</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">SDR</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">Activator</th>
                </tr>
              </thead>
              <tbody>
                ${installsWithLeadNames.map(i => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-size: 14px;">${i.accountName}</td>
                    <td style="padding: 12px; font-size: 14px;"><a href="${i.websiteUrl}" style="color: #3b82f6;">${i.websiteUrl || '—'}</a></td>
                    <td style="padding: 12px; font-size: 14px;">${i.sdrName}</td>
                    <td style="padding: 12px; font-size: 14px;">${i.activatorName}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ` : '<p>None</p>'}

            <h3>Installed but NO Lead Yet - Needs Follow-up (${installsWithoutLeadNames.length})</h3>
            ${installsWithoutLeadNames.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <thead>
                <tr style="background: #fef2f2; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">Account</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">URL</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">Installed</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280;">Activator</th>
                </tr>
              </thead>
              <tbody>
                ${installsWithoutLeadNames.map(i => `
                  <tr style="background: #fef2f2; border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-size: 14px;">${i.accountName}</td>
                    <td style="padding: 12px; font-size: 14px;"><a href="${i.websiteUrl}" style="color: #3b82f6;">${i.websiteUrl || '—'}</a></td>
                    <td style="padding: 12px; font-size: 14px;">${formatDate(i.installedAt)}</td>
                    <td style="padding: 12px; font-size: 14px;">${i.activatorName}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ` : '<p>None</p>'}
            
            <h2>PIPELINE</h2>
            <p>Upcoming Installs (next 3 days): ${totalUpcomingInstalls}</p>
          </div>
        </div>
        <div class="footer">
          <p>View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports/weekly-summary</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const subject = `Weekly Performance Summary - ${formatDate(weekStart)} to ${formatDate(weekEnd)}`;

  const formatBandForText = (label: string, people: Array<any>) => {
    if (people.length === 0) return `${label}: (none)\n`;
    const rows = people.map(p => {
      const sdrMetrics = p.installsBooked !== undefined ? `, Installs Booked: ${p.installsBooked}, Conv: ${p.convRate}%` : '';
      return `  ${p.name} — Live+Lead: ${p.actual}/${p.expected}${sdrMetrics}, Hours: ${p.hours}h${p.weeksAtZero ? ` (${p.weeksAtZero} weeks at 0)` : ''}`;
    }).join('\n');
    return `${label}\n${rows}\n`;
  };

  const textContent = `
Weekly Performance Summary - ${formatDate(weekStart)} to ${formatDate(weekEnd)}

PRIMARY
  Live calculators with a lead (week): ${companyLiveWithLeadWeek}
  Installs completed (week): ${weekInstalls}

SDR PERFORMANCE (Hours-Adjusted)

${formatBandForText('Exceeding (7+ at 40hrs)', sdrsByBand.exceeding)}
${formatBandForText('Strong (5-6 at 40hrs)', sdrsByBand.strong)}
${formatBandForText('Good (3-4 at 40hrs)', sdrsByBand.good)}
${formatBandForText('Needs Coaching (1-2 at 40hrs)', sdrsByBand.coaching)}
${formatBandForText('Let Go (0 over 2 weeks)', sdrsByBand.let_go)}

ACTIVATOR PERFORMANCE (Hours-Adjusted)

${formatBandForText('Exceeding (7-8+ at 40hrs)', activatorsByBand.exceeding)}
${formatBandForText('Strong (5-6 at 40hrs)', activatorsByBand.strong)}
${formatBandForText('Good (3-4 at 40hrs)', activatorsByBand.good)}
${formatBandForText('Needs Coaching (1-2 at 40hrs)', activatorsByBand.coaching)}
${formatBandForText('Let Go (0 over 2 weeks)', activatorsByBand.let_go)}

FUNNEL
  Installs: ${weekSdrInstalls} → Installs: ${weekInstalls} → Live+Lead: ${weekInstallsWithLead}

PIPELINE
  Upcoming Installs (next 3 days): ${totalUpcomingInstalls}

View full reports: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard/reports/weekly-summary
  `;

  // Send ONE email to all admin emails
  for (const email of adminEmails) {
    try {
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.textContent = textContent;
      sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
      sendSmtpEmail.to = [{ email }];
      sendSmtpEmail.tags = ["admin-weekly-summary"];

      await brevoClient.sendTransacEmail(sendSmtpEmail);
      console.log(`Sent admin weekly summary to ${email}`);
    } catch (emailError: any) {
      console.error(`Error sending admin weekly summary to ${email}:`, emailError);
    }
  }
}

/**
 * POST /api/cron/generate-weekly-summaries
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

