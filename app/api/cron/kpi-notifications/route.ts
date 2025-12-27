import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

/**
 * GET /api/cron/kpi-notifications
 * Scheduled job to send KPI notification emails
 * Should be called by Vercel Cron or similar scheduler
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
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

    // Get all active KPI settings
    const { data: allSettings, error: settingsError } = await supabase
      .from("organization_kpi_settings")
      .select("*")
      .eq("is_active", true)
      .neq("notification_frequency", "disabled");

    if (settingsError) {
      console.error("Error fetching KPI settings:", settingsError);
      return NextResponse.json(
        { error: "Failed to fetch settings" },
        { status: 500 }
      );
    }

    if (!allSettings || allSettings.length === 0) {
      return NextResponse.json({ message: "No active KPI notifications configured" });
    }

    let emailsSent = 0;
    let errors = 0;

    for (const settings of allSettings) {
      try {
        // Check if it's time to send
        let shouldSend = false;

        if (settings.notification_frequency === "daily") {
          // Check if current time matches notification time (within 5 minutes)
          const [hours, minutes] = settings.notification_time.split(":").map(Number);
          const notificationTime = new Date();
          notificationTime.setHours(hours, minutes, 0, 0);
          const timeDiff = Math.abs(now.getTime() - notificationTime.getTime()) / (1000 * 60);
          shouldSend = timeDiff <= 5; // Within 5 minutes
        } else if (settings.notification_frequency === "weekly") {
          // Check if it's the right day and time
          const [hours, minutes] = settings.notification_time.split(":").map(Number);
          const notificationTime = new Date();
          notificationTime.setHours(hours, minutes, 0, 0);
          const timeDiff = Math.abs(now.getTime() - notificationTime.getTime()) / (1000 * 60);
          // Convert notification_day (1-7) to JavaScript day (0-6, where 0=Sunday)
          const targetDay = settings.notification_day === 7 ? 0 : settings.notification_day;
          shouldSend = currentDay === targetDay && timeDiff <= 5;
        }

        if (!shouldSend) {
          continue;
        }

        if (!settings.recipient_emails || settings.recipient_emails.length === 0) {
          console.log(`Skipping org ${settings.organization_id} - no recipient emails`);
          continue;
        }

        // Get yesterday's KPI data
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];
        const todayStr = now.toISOString().split("T")[0];

        // Fetch KPI data
        const { data: callKPIs } = await supabase
          .from("organization_call_kpis")
          .select("*")
          .eq("organization_id", settings.organization_id)
          .eq("call_date", yesterdayStr)
          .single();

        const { data: smsKPIs } = await supabase
          .from("organization_sms_kpis")
          .select("*")
          .eq("organization_id", settings.organization_id)
          .eq("sms_date", yesterdayStr)
          .single();

        // Build email content
        const totalCalls = callKPIs?.total_calls || 0;
        const answeredCalls = callKPIs?.answered_calls || 0;
        const connectRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : "0";
        const totalSMS = smsKPIs?.total_sms || 0;
        const callbacks = callKPIs?.callbacks_scheduled || 0;
        const avgDuration = callKPIs?.avg_duration_seconds || 0;

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
              .metric { background-color: white; padding: 15px; border-radius: 5px; margin: 10px 0; }
              .metric-value { font-size: 24px; font-weight: bold; color: #4F46E5; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Daily KPI Report - ${yesterdayStr}</h2>
              </div>
              <div class="content">
                <div class="metric">
                  <strong>Total Calls:</strong>
                  <div class="metric-value">${totalCalls}</div>
                  <p>${answeredCalls} answered (${connectRate}% connect rate)</p>
                </div>
                <div class="metric">
                  <strong>SMS Sent:</strong>
                  <div class="metric-value">${totalSMS}</div>
                </div>
                <div class="metric">
                  <strong>Callbacks Scheduled:</strong>
                  <div class="metric-value">${callbacks}</div>
                </div>
                <div class="metric">
                  <strong>Average Call Duration:</strong>
                  <div class="metric-value">${Math.floor(avgDuration / 60)}m ${Math.round(avgDuration % 60)}s</div>
                </div>
                <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
                  View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/admin/performance
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailText = `
Daily KPI Report - ${yesterdayStr}

Total Calls: ${totalCalls}
  - ${answeredCalls} answered (${connectRate}% connect rate)

SMS Sent: ${totalSMS}
Callbacks Scheduled: ${callbacks}
Average Call Duration: ${Math.floor(avgDuration / 60)}m ${Math.round(avgDuration % 60)}s

View full dashboard: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/admin/performance
        `;

        // Send email
        if (brevoClient && brevoApiKey) {
          const sendSmtpEmail = new brevo.SendSmtpEmail();
          sendSmtpEmail.subject = `Daily KPI Report - ${yesterdayStr}`;
          sendSmtpEmail.htmlContent = emailHtml;
          sendSmtpEmail.textContent = emailText;
          sendSmtpEmail.sender = {
            name: "CRM System",
            email: "no-reply@autosalvageautomation.com",
          };
          sendSmtpEmail.to = settings.recipient_emails.map((email: string) => ({ email }));

          await brevoClient.sendTransacEmail(sendSmtpEmail);
          emailsSent++;
          console.log(`KPI email sent to ${settings.recipient_emails.join(", ")} for org ${settings.organization_id}`);
        }
      } catch (error: any) {
        console.error(`Error sending KPI email for org ${settings.organization_id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent,
      errors,
      message: `Processed ${allSettings.length} organizations`,
    });
  } catch (error: any) {
    console.error("Error in KPI notification cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

