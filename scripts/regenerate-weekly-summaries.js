#!/usr/bin/env node

/**
 * Regenerate Weekly Summaries Script
 * 
 * Regenerates weekly_sdr_summaries for a specific week and resends emails
 * 
 * Usage: node scripts/regenerate-weekly-summaries.js [week_start] [week_end]
 * Example: node scripts/regenerate-weekly-summaries.js 2025-12-15 2025-12-19
 */

const { createClient } = require("@supabase/supabase-js");
const brevo = require("@getbrevo/brevo");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.BREVO_FROM_EMAIL || "";
const FROM_EMAIL = "no-reply@autosalvageautomation.com";
const FROM_NAME = "CRM Weekly Reports";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase credentials not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Initialize Brevo
const brevoClient = BREVO_API_KEY ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && BREVO_API_KEY) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);
}

// Cache for org admins/managers
const orgAdminCache = new Map();

/**
 * Compute weekly aggregated metrics from daily summaries
 */
async function computeWeeklyMetrics(sdrUserId, weekStart, weekEnd) {
  const { data: dailySummaries, error } = await supabase
    .from("daily_sdr_summaries")
    .select("*")
    .eq("sdr_user_id", sdrUserId)
    .gte("date", weekStart)
    .lte("date", weekEnd);

  if (error) {
    console.error("Error fetching daily summaries:", error);
  }

  if (!dailySummaries || dailySummaries.length === 0) {
    return {
      paidHours: 0,
      activeHours: 0,
      averageEfficiency: 0,
      totalDials: 0,
      conversations: 0,
      trialsStarted: 0,
      paidSignups: 0,
      ctaAttempts: 0,
      ctaAcceptances: 0,
    };
  }

  // Aggregate metrics
  let totalPaidHours = 0;
  let totalActiveHours = 0;
  let totalDials = 0;
  let totalConversations = 0;
  let totalTrials = 0;
  let totalCtaAttempts = 0;
  let totalCtaAcceptances = 0;
  let weightedEfficiencySum = 0;

  for (const summary of dailySummaries) {
    totalPaidHours += parseFloat(summary.paid_hours) || 0;
    totalActiveHours += parseFloat(summary.active_hours) || 0;
    totalDials += summary.total_dials || 0;
    totalConversations += summary.conversations || 0;
    totalTrials += summary.trials_started || 0;
    totalCtaAttempts += summary.cta_attempts || 0;
    totalCtaAcceptances += summary.cta_acceptances || 0;
    
    // Time-weighted efficiency
    const dayPaidHours = parseFloat(summary.paid_hours) || 0;
    const dayEfficiency = parseFloat(summary.efficiency) || 0;
    weightedEfficiencySum += dayPaidHours * dayEfficiency;
  }

  // Calculate time-weighted average efficiency
  const averageEfficiency = totalPaidHours > 0 
    ? weightedEfficiencySum / totalPaidHours 
    : 0;

  // For paid signups, use the last day's week-to-date value
  const lastDaySummary = dailySummaries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  const paidSignups = lastDaySummary?.paid_signups_week_to_date || 0;

  return {
    paidHours: Math.round(totalPaidHours * 100) / 100,
    activeHours: Math.round(totalActiveHours * 100) / 100,
    averageEfficiency: Math.round(averageEfficiency * 100) / 100,
    totalDials,
    conversations: totalConversations,
    trialsStarted: totalTrials,
    paidSignups,
    ctaAttempts: totalCtaAttempts,
    ctaAcceptances: totalCtaAcceptances,
  };
}

/**
 * Format hours for display
 */
function formatHours(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

/**
 * Format efficiency percentage
 */
function formatEfficiency(efficiency) {
  return `${Math.round(efficiency)}%`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Send weekly summary email
 */
async function sendWeeklyEmail(
  toEmail,
  sdrName,
  weekStart,
  weekEnd,
  weeklyMetrics,
  isAdminCopy = false,
  activatorCredits = []
) {
  if (!brevoClient) {
    console.warn(`⚠️  Brevo not configured. Skipping email to ${toEmail}`);
    return;
  }

  const subject = isAdminCopy
    ? `[Admin Copy] Weekly SDR Summary – ${sdrName} – ${formatDate(weekStart)} to ${formatDate(weekEnd)}`
    : `Weekly SDR Summary – ${sdrName} – ${formatDate(weekStart)} to ${formatDate(weekEnd)}`;

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
        .highlight-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .highlight-box { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
        .highlight-box.primary { background: linear-gradient(135deg, #d1fae5 0%, #ccfbf1 100%); }
        .highlight-value { font-size: 32px; font-weight: 700; color: #047857; }
        .highlight-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
        .section-title { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .breakdown { background: #f9fafb; border-radius: 8px; padding: 16px; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { color: #6b7280; }
        .breakdown-value { font-weight: 600; color: #1f2937; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
        .badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Weekly SDR Summary</h1>
            <p>${sdrName} • ${formatDate(weekStart)} – ${formatDate(weekEnd)}</p>
            <span class="badge">📊 Week in Review</span>
          </div>
          <div class="content">
            <div class="highlight-grid">
              <div class="highlight-box primary">
                <div class="highlight-value">${formatHours(weeklyMetrics.paidHours)}</div>
                <div class="highlight-label">Total Paid Hours</div>
              </div>
              <div class="highlight-box primary">
                <div class="highlight-value">${weeklyMetrics.trialsStarted}</div>
                <div class="highlight-label">Trials Started</div>
              </div>
              <div class="highlight-box">
                <div class="highlight-value">${weeklyMetrics.paidSignups}</div>
                <div class="highlight-label">Paid Signups</div>
              </div>
              <div class="highlight-box">
                <div class="highlight-value">${formatEfficiency(weeklyMetrics.averageEfficiency)}</div>
                <div class="highlight-label">Avg Efficiency</div>
              </div>
            </div>
            
            <div class="section-title">Weekly Breakdown</div>
            <div class="breakdown">
              <div class="breakdown-row">
                <span class="breakdown-label">Total Dials</span>
                <span class="breakdown-value">${weeklyMetrics.totalDials}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Conversations (30s+)</span>
                <span class="breakdown-value">${weeklyMetrics.conversations}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Active Time on Calls</span>
                <span class="breakdown-value">${formatHours(weeklyMetrics.activeHours)}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Total Paid Hours</span>
                <span class="breakdown-value">${formatHours(weeklyMetrics.paidHours)}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">JCC Trials Started</span>
                <span class="breakdown-value">${weeklyMetrics.trialsStarted}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">JCC Paid Signups</span>
                <span class="breakdown-value">${weeklyMetrics.paidSignups}</span>
              </div>
            </div>
            ${isAdminCopy && activatorCredits.length > 0 ? `
            <div class="section-title" style="margin-top: 24px;">Activator Credits (This Week)</div>
            <div class="breakdown">
              ${activatorCredits.map(ac => `
                <div class="breakdown-row">
                  <span class="breakdown-label">${ac.activator_name}</span>
                  <span class="breakdown-value">${ac.activations_count} activations • $${ac.total_credits.toFixed(2)} • ${ac.avg_days_to_convert.toFixed(1)}d avg</span>
                </div>
              `).join('')}
            </div>
            ` : ''}
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
Weekly SDR Summary – ${sdrName} – ${formatDate(weekStart)} to ${formatDate(weekEnd)}

=== 80/20 HIGHLIGHTS ===
Total Paid Hours: ${formatHours(weeklyMetrics.paidHours)}
Trials Started: ${weeklyMetrics.trialsStarted}
Paid Signups: ${weeklyMetrics.paidSignups}
Average Efficiency: ${formatEfficiency(weeklyMetrics.averageEfficiency)}

=== WEEKLY BREAKDOWN ===
Total Dials: ${weeklyMetrics.totalDials}
Conversations (30s+): ${weeklyMetrics.conversations}
Active Time: ${formatHours(weeklyMetrics.activeHours)}
Total Paid Hours: ${formatHours(weeklyMetrics.paidHours)}
JCC Trials Started: ${weeklyMetrics.trialsStarted}
JCC Paid Signups: ${weeklyMetrics.paidSignups}

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

async function regenerateWeeklySummaries(weekStartStr, weekEndStr) {
  console.log("🔄 Regenerating Weekly Summaries");
  console.log(`   Week: ${weekStartStr} to ${weekEndStr}\n`);

  // Calculate timestamp range (Monday 11 PM UTC → Friday 11 PM UTC)
  const weekEndDate = new Date(`${weekEndStr}T00:00:00.000Z`);
  const weekStartDate = new Date(`${weekStartStr}T00:00:00.000Z`);
  
  const weekEndTimestamp = new Date(weekEndDate);
  weekEndTimestamp.setUTCHours(23, 0, 0, 0);
  
  const weekStartTimestamp = new Date(weekStartDate);
  weekStartTimestamp.setUTCHours(23, 0, 0, 0);
  weekStartTimestamp.setUTCDate(weekStartTimestamp.getUTCDate() - 1); // Previous day 11 PM

  // Get all SDRs
  const { data: sdrs, error: sdrsError } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, organization_id")
    .eq("role", "member");

  if (sdrsError || !sdrs || sdrs.length === 0) {
    console.error("❌ Error fetching SDRs:", sdrsError);
    process.exit(1);
  }

  console.log(`✅ Found ${sdrs.length} SDRs\n`);

  let summariesCreated = 0;
  let emailsSent = 0;
  const errors = [];

  for (const sdr of sdrs) {
    try {
      // Check if SDR has any calls this week
      const { count: callCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("user_id", sdr.id)
        .gte("initiated_at", weekStartTimestamp.toISOString())
        .lte("initiated_at", weekEndTimestamp.toISOString());

      if (!callCount || callCount === 0) {
        console.log(`⏭️  Skipping ${sdr.full_name || sdr.email} - no calls this week`);
        continue;
      }

      // Compute weekly metrics from corrected daily summaries
      const weeklyMetrics = await computeWeeklyMetrics(sdr.id, weekStartStr, weekEndStr);

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
          },
          {
            onConflict: "sdr_user_id,week_start,week_end",
          }
        );

      if (upsertError) {
        console.error(`❌ Error upserting weekly summary for ${sdr.email}:`, upsertError);
        errors.push(`Weekly summary upsert failed for ${sdr.email}`);
        continue;
      }

      summariesCreated++;
      console.log(`✅ Regenerated summary for ${sdr.full_name || sdr.email}:`);
      console.log(`   ${formatHours(weeklyMetrics.paidHours)} paid, ${weeklyMetrics.trialsStarted} trials, ${weeklyMetrics.totalDials} dials`);

      // Send email to SDR
      if (sdr.email && brevoClient) {
        try {
          await sendWeeklyEmail(
            sdr.email,
            sdr.full_name || sdr.email,
            weekStartStr,
            weekEndStr,
            weeklyMetrics
          );
          emailsSent++;
          console.log(`   📧 Email sent to SDR`);
        } catch (emailError) {
          console.error(`   ❌ Error sending email to ${sdr.email}:`, emailError.message);
          errors.push(`Weekly email failed for ${sdr.email}`);
        }
      }

      // Send copies to all admins and managers
      if (brevoClient && sdr.organization_id) {
        // Get activator credits for this org this week
        const { data: orgCredits } = await supabase
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
          .eq("organization_id", sdr.organization_id)
          .gte("credited_at", weekStartTimestamp.toISOString())
          .lte("credited_at", weekEndTimestamp.toISOString());

        // Group activator credits
        const activatorCredits = [];

        if (orgCredits && orgCredits.length > 0) {
          const byActivator = new Map();

          for (const credit of orgCredits) {
            const activatorId = credit.activator_user_id;
            if (!activatorId) continue;
            const profiles = credit.user_profiles;
            const profile = Array.isArray(profiles) ? profiles[0] : profiles;
            if (!profile) continue;

            if (!byActivator.has(activatorId)) {
              byActivator.set(activatorId, {
                name: profile.full_name || profile.email,
                count: 0,
                total: 0,
                days: [],
              });
            }

            const entry = byActivator.get(activatorId);
            entry.count++;
            entry.total += Number(credit.amount || 5.00);
            if (credit.days_to_convert) {
              entry.days.push(credit.days_to_convert);
            }
          }

          activatorCredits.push(...Array.from(byActivator.values()).map(entry => ({
            activator_name: entry.name,
            activations_count: entry.count,
            total_credits: entry.total,
            avg_days_to_convert: entry.days.length > 0
              ? Math.round((entry.days.reduce((a, b) => a + b, 0) / entry.days.length) * 10) / 10
              : 0,
          })));
        }

        // Get admins/managers
        let orgAdmins = orgAdminCache.get(sdr.organization_id);
        if (!orgAdmins) {
          const { data: adminsData } = await supabase
            .from("user_profiles")
            .select("email, full_name")
            .eq("organization_id", sdr.organization_id)
            .in("role", ["admin", "manager"]);
          orgAdmins = adminsData || [];
          orgAdminCache.set(sdr.organization_id, orgAdmins);
        }

        // Send to each admin/manager
        for (const admin of orgAdmins) {
          if (admin.email && admin.email !== sdr.email) {
            try {
              await sendWeeklyEmail(
                admin.email,
                sdr.full_name || sdr.email,
                weekStartStr,
                weekEndStr,
                weeklyMetrics,
                true, // isAdminCopy
                activatorCredits
              );
              emailsSent++;
              console.log(`   📧 Email sent to admin: ${admin.email}`);
            } catch (emailError) {
              console.error(`   ❌ Error sending admin copy to ${admin.email}:`, emailError.message);
            }
          }
        }

        // Also send to hardcoded ADMIN_EMAIL if set
        if (ADMIN_EMAIL && !orgAdmins.some(a => a.email === ADMIN_EMAIL) && ADMIN_EMAIL !== sdr.email) {
          try {
            await sendWeeklyEmail(
              ADMIN_EMAIL,
              sdr.full_name || sdr.email,
              weekStartStr,
              weekEndStr,
              weeklyMetrics,
              true, // isAdminCopy
              activatorCredits
            );
            emailsSent++;
            console.log(`   📧 Email sent to ${ADMIN_EMAIL}`);
          } catch (emailError) {
            console.error(`   ❌ Error sending admin copy to ${ADMIN_EMAIL}:`, emailError.message);
          }
        }
      }
    } catch (sdrError) {
      console.error(`❌ Error processing ${sdr.email}:`, sdrError.message);
      errors.push(`Weekly processing failed for ${sdr.email}: ${sdrError.message}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY");
  console.log("=".repeat(80));
  console.log(`   Summaries regenerated: ${summariesCreated}`);
  console.log(`   Emails sent: ${emailsSent}`);
  if (errors.length > 0) {
    console.log(`   Errors: ${errors.length}`);
    errors.forEach(e => console.log(`      - ${e}`));
  }
  console.log("\n🎉 Regeneration complete!");
}

// Parse command line arguments
const weekStart = process.argv[2] || "2025-12-15";
const weekEnd = process.argv[3] || "2025-12-19";

regenerateWeeklySummaries(weekStart, weekEnd);


