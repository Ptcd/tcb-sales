import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeDailyMetrics, computeJCCMetrics, computeActivatorMetrics, formatHours, formatEfficiency } from "@/lib/utils/sdrMetrics";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.BREVO_FROM_EMAIL || "";
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || "noreply@example.com";
const FROM_NAME = "CRM Daily Reports";

/**
 * GET /api/cron/generate-daily-summaries
 * Generate daily SDR summaries and send email reports
 * Should run daily at 6pm (configured in vercel.json)
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
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];

    // Get all SDRs (users with role = 'member')
    const { data: sdrs, error: sdrsError } = await supabase
      .from("user_profiles")
      .select("id, email, name, organization_id")
      .eq("role", "member");

    // Get all activators
    const { data: activators, error: activatorsError } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, organization_id")
      .eq("is_activator", true);

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
        // Compute daily metrics
        const dailyMetrics = await computeDailyMetrics(supabase, sdr.id, today);
        const jccMetrics = await computeJCCMetrics(supabase, sdr.id, today);

        // Skip SDRs with no activity today - don't send empty reports
        if (dailyMetrics.totalDials === 0 && jccMetrics.trialsStarted === 0) {
          console.log(`Skipping ${sdr.email} - no activity today`);
          continue;
        }

        // Upsert daily summary
        const { error: upsertError } = await supabase
          .from("daily_sdr_summaries")
          .upsert(
            {
              sdr_user_id: sdr.id,
              date: dateStr,
              paid_hours: dailyMetrics.paidHours,
              active_hours: dailyMetrics.activeHours,
              efficiency: dailyMetrics.efficiency,
              total_dials: dailyMetrics.totalDials,
              conversations: dailyMetrics.conversations,
              trials_started: jccMetrics.trialsStarted,
              paid_signups_week_to_date: jccMetrics.paidSignupsWeekToDate,
            },
            {
              onConflict: "sdr_user_id,date",
            }
          );

        if (upsertError) {
          console.error(`Error upserting summary for SDR ${sdr.id}:`, upsertError);
          errors.push(`Summary upsert failed for ${sdr.email}`);
          continue;
        }

        summariesCreated++;

        // Send email to SDR
        if (sdr.email && brevoClient) {
          try {
            await sendDailyEmail(
              sdr.email,
              sdr.name || sdr.email,
              dateStr,
              dailyMetrics,
              jccMetrics
            );
            emailsSent++;
          } catch (emailError: any) {
            console.error(`Error sending email to ${sdr.email}:`, emailError);
            errors.push(`Email failed for ${sdr.email}`);
          }
        }

        // Send copy to admin
        if (ADMIN_EMAIL && brevoClient && ADMIN_EMAIL !== sdr.email) {
          try {
            await sendDailyEmail(
              ADMIN_EMAIL,
              sdr.name || sdr.email,
              dateStr,
              dailyMetrics,
              jccMetrics,
              true // isAdminCopy
            );
            emailsSent++;
          } catch (emailError: any) {
            console.error(`Error sending admin copy:`, emailError);
          }
        }
      } catch (sdrError: any) {
        console.error(`Error processing SDR ${sdr.id}:`, sdrError);
        errors.push(`Processing failed for ${sdr.email}: ${sdrError.message}`);
      }
    }

    // Process activators
    for (const activator of activators || []) {
      try {
        const activatorMetrics = await computeActivatorMetrics(supabase, activator.id, today);
        
        if (activatorMetrics.meetingsCompleted === 0) {
          console.log(`Skipping activator ${activator.email} - no meetings today`);
          continue;
        }

        // Upsert activator daily summary
        const { error: upsertError } = await supabase
          .from("daily_sdr_summaries")
          .upsert({
            sdr_user_id: activator.id,
            date: dateStr,
            paid_hours: activatorMetrics.paidHours,
            active_hours: activatorMetrics.paidHours, // Same for activators
            efficiency: 100, // Activators don't have efficiency metric
            total_dials: 0,
            conversations: activatorMetrics.meetingsCompleted,
            trials_started: activatorMetrics.installsProven,
          }, {
            onConflict: "sdr_user_id,date",
          });

        if (upsertError) {
          console.error(`Error upserting activator summary for ${activator.id}:`, upsertError);
          errors.push(`Activator summary upsert failed for ${activator.email}`);
          continue;
        }

        summariesCreated++;
      } catch (err: any) {
        console.error(`Error processing activator ${activator.id}:`, err);
        errors.push(`Processing failed for activator ${activator.email}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Generated ${summariesCreated} summaries, sent ${emailsSent} emails`,
      summaries_created: summariesCreated,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in generate-daily-summaries:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Send daily summary email
 */
async function sendDailyEmail(
  toEmail: string,
  sdrName: string,
  date: string,
  dailyMetrics: {
    paidHours: number;
    activeHours: number;
    efficiency: number;
    totalDials: number;
    conversations: number;
  },
  jccMetrics: {
    trialsStarted: number;
    paidSignupsWeekToDate: number;
  },
  isAdminCopy: boolean = false
) {
  if (!brevoClient) return;

  const subject = isAdminCopy
    ? `[Admin Copy] Daily SDR Summary – ${sdrName} – ${date}`
    : `Daily SDR Summary – ${sdrName} – ${date}`;

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
        .highlight-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .highlight-box { background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center; }
        .highlight-box.primary { background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%); }
        .highlight-value { font-size: 32px; font-weight: 700; color: #1e40af; }
        .highlight-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
        .section-title { font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .breakdown { background: #f9fafb; border-radius: 8px; padding: 16px; }
        .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .breakdown-row:last-child { border-bottom: none; }
        .breakdown-label { color: #6b7280; }
        .breakdown-value { font-weight: 600; color: #1f2937; }
        .footer { text-align: center; padding: 16px; color: #9ca3af; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>Daily SDR Summary</h1>
            <p>${sdrName} • ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div class="content">
            <div class="highlight-grid">
              <div class="highlight-box primary">
                <div class="highlight-value">${formatHours(dailyMetrics.paidHours)}</div>
                <div class="highlight-label">Paid Hours</div>
              </div>
              <div class="highlight-box primary">
                <div class="highlight-value">${jccMetrics.trialsStarted}</div>
                <div class="highlight-label">Trials Started</div>
              </div>
              <div class="highlight-box">
                <div class="highlight-value">${jccMetrics.paidSignupsWeekToDate}</div>
                <div class="highlight-label">Paid Signups (WTD)</div>
              </div>
              <div class="highlight-box">
                <div class="highlight-value">${formatEfficiency(dailyMetrics.efficiency)}</div>
                <div class="highlight-label">Efficiency</div>
              </div>
            </div>
            
            <div class="section-title">Daily Breakdown</div>
            <div class="breakdown">
              <div class="breakdown-row">
                <span class="breakdown-label">Total Dials</span>
                <span class="breakdown-value">${dailyMetrics.totalDials}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Conversations (30s+)</span>
                <span class="breakdown-value">${dailyMetrics.conversations}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Active Time on Calls</span>
                <span class="breakdown-value">${formatHours(dailyMetrics.activeHours)}</span>
              </div>
              <div class="breakdown-row">
                <span class="breakdown-label">Paid Hours</span>
                <span class="breakdown-value">${formatHours(dailyMetrics.paidHours)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Daily SDR Summary – ${sdrName} – ${date}

=== 80/20 HIGHLIGHTS ===
Paid Hours: ${formatHours(dailyMetrics.paidHours)}
Trials Started: ${jccMetrics.trialsStarted}
Paid Signups (Week to Date): ${jccMetrics.paidSignupsWeekToDate}
Efficiency: ${formatEfficiency(dailyMetrics.efficiency)}

=== BREAKDOWN ===
Total Dials: ${dailyMetrics.totalDials}
Conversations (30s+): ${dailyMetrics.conversations}
Active Time: ${formatHours(dailyMetrics.activeHours)}
Paid Hours: ${formatHours(dailyMetrics.paidHours)}

View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL || 'https://your-crm.vercel.app'}/dashboard
  `;

  const sendSmtpEmail = new brevo.SendSmtpEmail();
  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.textContent = textContent;
  sendSmtpEmail.sender = { name: FROM_NAME, email: FROM_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.tags = ["sdr-daily-summary"];

  await brevoClient.sendTransacEmail(sendSmtpEmail);
}

/**
 * POST /api/cron/generate-daily-summaries
 * Manual trigger for testing
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

