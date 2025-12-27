import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const FROM_EMAIL = "no-reply@autosalvageautomation.com";
const FROM_NAME = "Capital Governance Weekly Summary";

/**
 * GET /api/cron/governance-weekly-summary
 * Weekly admin email with experiment performance and capital spend
 * Runs Friday at 6pm (configured in vercel.json)
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
    
    // Get last 7 days
    const weekEnd = new Date(now);
    weekEnd.setUTCHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setUTCHours(0, 0, 0, 0);

    // Get all running experiments
    const { data: runningExperiments, error: expError } = await supabase
      .from("experiments")
      .select(`
        *,
        campaigns!inner(id, name, product_id)
      `)
      .eq("status", "running");
    
    // Load products for campaigns
    if (runningExperiments && runningExperiments.length > 0) {
      const productIds = runningExperiments
        .map((exp: any) => exp.campaigns?.product_id)
        .filter(Boolean);
      
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id, name")
          .in("id", productIds);
        
        // Attach products to campaigns
        for (const exp of runningExperiments) {
          if (exp.campaigns?.product_id) {
            const product = products?.find((p: any) => p.id === exp.campaigns.product_id);
            exp.campaigns.products = product || null;
          }
        }
      }
    }

    if (expError) {
      console.error("Error fetching running experiments:", expError);
      return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
    }

    if (!runningExperiments || runningExperiments.length === 0) {
      console.log("No running experiments found");
      return NextResponse.json({ 
        success: true, 
        message: "No running experiments to report on" 
      });
    }

    // Get all admins
    const { data: admins } = await supabase
      .from("user_profiles")
      .select("email, full_name")
      .in("role", ["admin", "manager"]);

    const adminEmails = admins?.map(a => a.email).filter(Boolean) || [];
    if (process.env.ADMIN_EMAIL && !adminEmails.includes(process.env.ADMIN_EMAIL)) {
      adminEmails.push(process.env.ADMIN_EMAIL);
    }

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return NextResponse.json({ success: true, message: "No admin emails" });
    }

    // Process each running experiment
    for (const experiment of runningExperiments) {
      try {
        await sendExperimentWeeklySummary(supabase, experiment, weekStart, weekEnd, adminEmails);
      } catch (error: any) {
        console.error(`Error sending summary for experiment ${experiment.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent weekly summaries for ${runningExperiments.length} experiment(s)`,
    });
  } catch (error: any) {
    console.error("Error in governance-weekly-summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Send weekly summary for a single experiment
 */
async function sendExperimentWeeklySummary(
  supabase: SupabaseClient,
  experiment: any,
  weekStart: Date,
  weekEnd: Date,
  adminEmails: string[]
) {
  if (!brevoClient) return;

  const campaign = experiment.campaigns;
  const product = campaign.products;
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = weekEnd.toISOString().split("T")[0];

  // Get performance events for the week
  const { data: events } = await supabase
    .from("performance_events")
    .select("*")
    .eq("experiment_id", experiment.id)
    .gte("event_timestamp", weekStart.toISOString())
    .lte("event_timestamp", weekEnd.toISOString());

  // Count events by type
  const qpcs = events?.filter(e => e.event_type === "qpc").length || 0;
  const installsScheduled = events?.filter(e => e.event_type === "install_scheduled").length || 0;
  const installsAttended = events?.filter(e => e.event_type === "install_attended").length || 0;
  const installsCompleted = events?.filter(e => e.event_type === "calculator_installed").length || 0;
  const paidConversions = events?.filter(e => e.event_type === "paid_conversion").length || 0;

  // Get campaign goals (rate-based per 40 hours)
  const { data: campaignGoals } = await supabase
    .from("campaign_goals")
    .select("proven_installs_per_40h, scheduled_appts_per_40h, conversations_per_40h, target_weekly_hours")
    .eq("campaign_id", campaign.id)
    .single();

  const provenInstallsPer40h = campaignGoals?.proven_installs_per_40h || 4;
  const scheduledApptsPer40h = campaignGoals?.scheduled_appts_per_40h || 8;
  const conversationsPer40h = campaignGoals?.conversations_per_40h || 200;
  const targetWeeklyHours = campaignGoals?.target_weekly_hours || 40;

  // Sum SDR hours from daily_sdr_summaries for the week
  const { data: dailySummaries } = await supabase
    .from("daily_sdr_summaries")
    .select("paid_hours")
    .gte("date", weekStartStr)
    .lte("date", weekEndStr);

  const sdrHours = dailySummaries?.reduce((sum, ds) => sum + (ds.paid_hours || 0), 0) || 0;

  // Calculate rate-based goals based on actual hours worked
  const hoursRatio = sdrHours > 0 ? sdrHours / 40 : 0;
  const provenInstallsGoal = Math.round(provenInstallsPer40h * hoursRatio);
  const scheduledApptsGoal = Math.round(scheduledApptsPer40h * hoursRatio);
  const conversationsGoal = Math.round(conversationsPer40h * hoursRatio);

  // Count proven installs (credits_remaining < 20) for the week
  const { count: provenInstallsCount } = await supabase
    .from("trial_pipeline")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", campaign.organization_id)
    .not("credits_remaining", "is", null)
    .lt("credits_remaining", 20)
    .gte("trial_started_at", weekStart.toISOString())
    .lte("trial_started_at", weekEnd.toISOString());

  // Count scheduled appointments for the week
  const { count: scheduledApptsCount } = await supabase
    .from("activation_meetings")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", campaign.organization_id)
    .gte("scheduled_start_at", weekStart.toISOString())
    .lte("scheduled_start_at", weekEnd.toISOString());

  // Count conversations (calls >= 30 seconds) for the week
  const { count: conversationsCount } = await supabase
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", campaign.organization_id)
    .eq("call_type", "outbound")
    .gte("duration", 30)
    .gte("initiated_at", weekStart.toISOString())
    .lte("initiated_at", weekEnd.toISOString());

  const provenInstalls = provenInstallsCount || 0;
  const scheduledAppts = scheduledApptsCount || 0;
  const conversations = conversationsCount || 0;

  // Get team members with hourly rates
  const { data: teamMembers } = await supabase
    .from("user_profiles")
    .select("id, full_name, email, hourly_rate_usd")
    .eq("organization_id", campaign.organization_id);

  // Get automatic time tracking from daily_sdr_summaries
  const { data: payrollSummaries } = await supabase
    .from("daily_sdr_summaries")
    .select("sdr_user_id, paid_hours")
    .gte("date", weekStartStr)
    .lte("date", weekEndStr);

  // Get manual time_logs
  const { data: manualTimeLogs } = await supabase
    .from("time_logs")
    .select("team_member_id, hours_logged")
    .gte("date", weekStartStr)
    .lte("date", weekEndStr);

  // Get bonuses for date range
  const { data: bonusEvents } = await supabase
    .from("bonus_events")
    .select("team_member_id, bonus_amount_usd")
    .gte("created_at", weekStart.toISOString())
    .lte("created_at", weekEnd.toISOString());

  // Calculate payroll per team member
  const payroll = (teamMembers || []).map((member) => {
    const autoHours = (payrollSummaries || [])
      .filter(s => s.sdr_user_id === member.id)
      .reduce((sum, s) => sum + parseFloat(s.paid_hours || 0), 0);
    const manualHours = (manualTimeLogs || [])
      .filter(t => t.team_member_id === member.id)
      .reduce((sum, t) => sum + parseFloat(t.hours_logged || 0), 0);
    const hoursWorked = autoHours + manualHours;
    const hourlyRate = member.hourly_rate_usd || 0;
    const basePay = hoursWorked * hourlyRate;
    const totalBonuses = (bonusEvents || [])
      .filter(b => b.team_member_id === member.id)
      .reduce((sum, b) => sum + parseFloat(b.bonus_amount_usd || 0), 0);
    return {
      name: member.full_name || member.email,
      hoursWorked,
      hourlyRate,
      basePay,
      bonuses: totalBonuses,
      totalPay: basePay + totalBonuses,
    };
  }).filter(m => m.hoursWorked > 0 || m.bonuses > 0);

  // Calculate payroll totals
  const payrollTotals = {
    hoursWorked: payroll.reduce((sum, p) => sum + p.hoursWorked, 0),
    basePay: payroll.reduce((sum, p) => sum + p.basePay, 0),
    bonuses: payroll.reduce((sum, p) => sum + p.bonuses, 0),
    totalPay: payroll.reduce((sum, p) => sum + p.totalPay, 0),
  };

  // Get budget burn data for campaign
  const { data: campaignBudget } = await supabase
    .from("campaigns")
    .select("capital_budget_usd")
    .eq("id", campaign.id)
    .single();

  const { data: allRevenue } = await supabase
    .from("revenue_events")
    .select("amount_usd")
    .eq("campaign_id", campaign.id);

  const { data: allCosts } = await supabase
    .from("cost_rollups")
    .select("cost_usd")
    .eq("campaign_id", campaign.id);

  const budgetBurn = {
    initialBudget: campaignBudget?.capital_budget_usd || 0,
    totalRevenue: (allRevenue || []).reduce((sum, r) => sum + parseFloat(r.amount_usd || 0), 0),
    totalCosts: (allCosts || []).reduce((sum, c) => sum + parseFloat(c.cost_usd || 0), 0),
    remaining: 0,
  };
  budgetBurn.remaining = budgetBurn.initialBudget + budgetBurn.totalRevenue - budgetBurn.totalCosts;

  // Get costs for the week
  const { data: weekCosts } = await supabase
    .from("cost_rollups")
    .select("*")
    .eq("campaign_id", campaign.id)
    .gte("date", weekStartStr)
    .lte("date", weekEndStr);

  const weekSpend = weekCosts?.reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0;

  // Get total costs (all time for this experiment)
  const { data: totalCosts } = await supabase
    .from("cost_rollups")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("experiment_id", experiment.id);

  const totalSpend = totalCosts?.reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0;

  // Calculate tranches consumed
  const tranchesConsumed = experiment.tranche_size_usd 
    ? Math.floor(totalSpend / experiment.tranche_size_usd)
    : 0;

  // Calculate capital cap % used
  const capPercent = experiment.capital_cap_usd 
    ? (totalSpend / experiment.capital_cap_usd) * 100
    : 0;

  // Calculate days since start
  const daysSinceStart = experiment.started_at
    ? Math.floor((new Date().getTime() - new Date(experiment.started_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Evaluation recommended?
  const evaluationRecommended = 
    (experiment.capital_cap_usd && capPercent >= 80) ||
    (experiment.time_cap_days && (experiment.time_cap_days - daysSinceStart) <= 3);

  // Build cost breakdown by source
  const costBySource = {
    labor: weekCosts?.filter(c => c.source === "labor").reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0,
    bonus: weekCosts?.filter(c => c.source === "bonus").reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0,
    twilio: weekCosts?.filter(c => c.source === "twilio").reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0,
    gcp: weekCosts?.filter(c => c.source === "gcp").reduce((sum, c) => sum + parseFloat(c.cost_usd), 0) || 0,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-crm.vercel.app";
  const experimentUrl = `${appUrl}/dashboard/admin/governance/experiments/${experiment.id}`;
  const playbookUrl = `${appUrl}/dashboard/admin/governance/campaigns/${campaign.id}?tab=playbook`;

  const subject = `Weekly Governance Summary - ${experiment.name} - ${weekStartStr} to ${weekEndStr}`;

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
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .primary { font-size: 32px; font-weight: bold; color: #1e40af; margin: 16px 0; }
        .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0; }
        h2 { font-size: 18px; font-weight: 600; color: #374151; margin: 24px 0 12px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { text-align: left; padding: 10px; background: #f9fafb; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
        td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
        .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 8px 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Weekly Governance Summary</h1>
            <p>${experiment.name} • ${weekStartStr} to ${weekEndStr}</p>
          </div>
          <div class="content">
            <h2>EXPERIMENT</h2>
            <p><strong>Campaign:</strong> ${campaign.name}</p>
            <p><strong>Product:</strong> ${product?.name || "N/A"}</p>
            <p><strong>Hypothesis:</strong> ${experiment.hypothesis || "N/A"}</p>
            
            <h2>SPEND</h2>
            <p><strong>This Week:</strong> $${weekSpend.toFixed(2)}</p>
            <p><strong>Total:</strong> $${totalSpend.toFixed(2)}</p>
            <p><strong>Capital Cap:</strong> $${experiment.capital_cap_usd || "N/A"}</p>
            <p><strong>Cap % Used:</strong> ${capPercent.toFixed(1)}%</p>
            <p><strong>Tranches Consumed:</strong> ${tranchesConsumed}</p>
            
            <h2>COST BREAKDOWN (This Week)</h2>
            <table>
              <tr><th>Source</th><th>Amount</th></tr>
              <tr><td>Labor</td><td>$${costBySource.labor.toFixed(2)}</td></tr>
              <tr><td>Bonuses</td><td>$${costBySource.bonus.toFixed(2)}</td></tr>
              <tr><td>Twilio</td><td>$${costBySource.twilio.toFixed(2)}</td></tr>
              <tr><td>GCP</td><td>$${costBySource.gcp.toFixed(2)}</td></tr>
            </table>
            
            <h2>WEEKLY GOALS (Rate-Based per 40h)</h2>
            <p><strong>Hours Worked:</strong> ${sdrHours.toFixed(1)}h (Target: ${targetWeeklyHours}h)</p>
            <table>
              <tr>
                <th>Goal</th>
                <th>Target (per 40h)</th>
                <th>Expected (${sdrHours.toFixed(1)}h)</th>
                <th>Actual</th>
                <th>% of Goal</th>
                <th>Status</th>
              </tr>
              <tr>
                <td>Proven Installs</td>
                <td>${provenInstallsPer40h}</td>
                <td>${provenInstallsGoal}</td>
                <td>${provenInstalls}</td>
                <td>${provenInstallsGoal > 0 ? Math.round((provenInstalls / provenInstallsGoal) * 100) : 0}%</td>
                <td>${provenInstalls >= provenInstallsGoal ? "✅ Met" : provenInstalls >= provenInstallsGoal * 0.75 ? "🟡 On Track" : "🔴 Behind"}</td>
              </tr>
              <tr>
                <td>Scheduled Appointments</td>
                <td>${scheduledApptsPer40h}</td>
                <td>${scheduledApptsGoal}</td>
                <td>${scheduledAppts}</td>
                <td>${scheduledApptsGoal > 0 ? Math.round((scheduledAppts / scheduledApptsGoal) * 100) : 0}%</td>
                <td>${scheduledAppts >= scheduledApptsGoal ? "✅ Met" : scheduledAppts >= scheduledApptsGoal * 0.75 ? "🟡 On Track" : "🔴 Behind"}</td>
              </tr>
              <tr>
                <td>Conversations</td>
                <td>${conversationsPer40h}</td>
                <td>${conversationsGoal}</td>
                <td>${conversations}</td>
                <td>${conversationsGoal > 0 ? Math.round((conversations / conversationsGoal) * 100) : 0}%</td>
                <td>${conversations >= conversationsGoal ? "✅ Met" : conversations >= conversationsGoal * 0.75 ? "🟡 On Track" : "🔴 Behind"}</td>
              </tr>
              <tr>
                <td>Target Weekly Hours</td>
                <td>${targetWeeklyHours}</td>
                <td>${targetWeeklyHours}</td>
                <td>${sdrHours.toFixed(1)}</td>
                <td>${Math.round((sdrHours / targetWeeklyHours) * 100) || 0}%</td>
                <td>${sdrHours >= targetWeeklyHours ? "✅ Met" : sdrHours >= targetWeeklyHours * 0.75 ? "🟡 On Track" : "🔴 Behind"}</td>
              </tr>
            </table>
            
            <h2>PERFORMANCE (This Week)</h2>
            <ul>
              <li><strong>QPCs:</strong> ${qpcs}</li>
              <li><strong>Installs Scheduled:</strong> ${installsScheduled}</li>
              <li><strong>Installs Attended:</strong> ${installsAttended}</li>
              <li><strong>Installs Completed:</strong> ${installsCompleted}</li>
              <li><strong>Paid Conversions:</strong> ${paidConversions}</li>
            </ul>
            
            <h2>PAYROLL SUMMARY</h2>
            <p><strong>Total Hours:</strong> ${payrollTotals.hoursWorked.toFixed(1)}h</p>
            <p><strong>Total Base Pay:</strong> $${payrollTotals.basePay.toFixed(2)}</p>
            <p><strong>Total Bonuses:</strong> $${payrollTotals.bonuses.toFixed(2)}</p>
            <p><strong>Grand Total:</strong> $${payrollTotals.totalPay.toFixed(2)}</p>
            
            <h3>Per-SDR Breakdown</h3>
            <table>
              <tr>
                <th>Name</th>
                <th>Hours</th>
                <th>Rate</th>
                <th>Base Pay</th>
                <th>Bonuses</th>
                <th>Total</th>
              </tr>
              ${payroll.map(p => `
              <tr>
                <td>${p.name}</td>
                <td>${p.hoursWorked.toFixed(1)}</td>
                <td>$${p.hourlyRate.toFixed(2)}/hr</td>
                <td>$${p.basePay.toFixed(2)}</td>
                <td>$${p.bonuses.toFixed(2)}</td>
                <td>$${p.totalPay.toFixed(2)}</td>
              </tr>
              `).join('')}
            </table>
            
            ${budgetBurn.initialBudget > 0 ? `
            <h2 style="color: #1f2937; margin-top: 24px;">BUDGET STATUS</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 12px;">
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">Initial Budget</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">$${budgetBurn.initialBudget.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #16a34a;">+ Revenue</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; color: #16a34a;">+$${budgetBurn.totalRevenue.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626;">- Costs</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; color: #dc2626;">-$${budgetBurn.totalCosts.toFixed(2)}</td>
              </tr>
              <tr style="font-weight: bold;">
                <td style="padding: 8px; border: 1px solid #e5e7eb;">Remaining</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; color: ${budgetBurn.remaining >= 0 ? '#2563eb' : '#dc2626'};">$${budgetBurn.remaining.toFixed(2)}</td>
              </tr>
            </table>
            ` : ''}
            
            ${evaluationRecommended ? `
            <div class="warning">
              <strong>⚠️ Evaluation Recommended</strong>
              <p>Capital cap ${capPercent >= 80 ? `is ${capPercent.toFixed(1)}% used` : ""}${experiment.time_cap_days && (experiment.time_cap_days - daysSinceStart) <= 3 ? ` or time cap is near (${experiment.time_cap_days - daysSinceStart} days remaining)` : ""}.</p>
            </div>
            ` : ""}
            
            <h2>ACTIONS</h2>
            <p>
              <a href="${experimentUrl}" class="button">View Experiment</a>
              <a href="${playbookUrl}" class="button">Open Playbook</a>
            </p>
          </div>
        </div>
        <div class="footer">
          <p>View full dashboard: ${appUrl}/dashboard/admin/governance</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Weekly Governance Summary - ${experiment.name} - ${weekStartStr} to ${weekEndStr}

EXPERIMENT
  Campaign: ${campaign.name}
  Product: ${product?.name || "N/A"}
  Hypothesis: ${experiment.hypothesis || "N/A"}

SPEND
  This Week: $${weekSpend.toFixed(2)}
  Total: $${totalSpend.toFixed(2)}
  Capital Cap: $${experiment.capital_cap_usd || "N/A"}
  Cap % Used: ${capPercent.toFixed(1)}%
  Tranches Consumed: ${tranchesConsumed}

COST BREAKDOWN (This Week)
  Labor: $${costBySource.labor.toFixed(2)}
  Bonuses: $${costBySource.bonus.toFixed(2)}
  Twilio: $${costBySource.twilio.toFixed(2)}
  GCP: $${costBySource.gcp.toFixed(2)}

WEEKLY GOALS (Rate-Based per 40h)
  Hours Worked: ${sdrHours.toFixed(1)}h (Target: ${targetWeeklyHours}h)
  
  Proven Installs: ${provenInstalls} / ${provenInstallsGoal} expected (${provenInstallsPer40h} per 40h)
  Scheduled Appointments: ${scheduledAppts} / ${scheduledApptsGoal} expected (${scheduledApptsPer40h} per 40h)
  Conversations: ${conversations} / ${conversationsGoal} expected (${conversationsPer40h} per 40h)
  Target Weekly Hours: ${sdrHours.toFixed(1)}h / ${targetWeeklyHours}h

PERFORMANCE (This Week)
  QPCs: ${qpcs}
  Installs Scheduled: ${installsScheduled}
  Installs Attended: ${installsAttended}
  Installs Completed: ${installsCompleted}
  Paid Conversions: ${paidConversions}

PAYROLL SUMMARY
  Total Hours: ${payrollTotals.hoursWorked.toFixed(1)}h
  Total Base Pay: $${payrollTotals.basePay.toFixed(2)}
  Total Bonuses: $${payrollTotals.bonuses.toFixed(2)}
  Grand Total: $${payrollTotals.totalPay.toFixed(2)}

  Per-SDR Breakdown:
${payroll.map(p => `    ${p.name}: ${p.hoursWorked.toFixed(1)}h × $${p.hourlyRate.toFixed(2)} = $${p.basePay.toFixed(2)} + $${p.bonuses.toFixed(2)} bonus = $${p.totalPay.toFixed(2)}`).join('\n')}

${budgetBurn.initialBudget > 0 ? `
BUDGET STATUS
-------------
Initial Budget: $${budgetBurn.initialBudget.toFixed(2)}
+ Revenue: +$${budgetBurn.totalRevenue.toFixed(2)}
- Costs: -$${budgetBurn.totalCosts.toFixed(2)}
= Remaining: $${budgetBurn.remaining.toFixed(2)}
` : ''}

${evaluationRecommended ? `⚠️ EVALUATION RECOMMENDED\n  Capital cap ${capPercent >= 80 ? `is ${capPercent.toFixed(1)}% used` : ""}${experiment.time_cap_days && (experiment.time_cap_days - daysSinceStart) <= 3 ? ` or time cap is near (${experiment.time_cap_days - daysSinceStart} days remaining)` : ""}.\n` : ""}

ACTIONS
  View Experiment: ${experimentUrl}
  Open Playbook: ${playbookUrl}

View full dashboard: ${appUrl}/dashboard/admin/governance
  `;

  // Send to all admins
  for (const email of adminEmails) {
    try {
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.textContent = textContent;
      sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
      sendSmtpEmail.to = [{ email }];
      sendSmtpEmail.tags = ["governance-weekly-summary"];

      await brevoClient.sendTransacEmail(sendSmtpEmail);
      console.log(`Sent governance weekly summary to ${email}`);
    } catch (emailError: any) {
      console.error(`Error sending governance weekly summary to ${email}:`, emailError);
    }
  }
}

/**
 * POST /api/cron/governance-weekly-summary
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

