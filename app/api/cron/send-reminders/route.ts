import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as brevo from "@getbrevo/brevo";
import { formatInTimezone } from "@/lib/timezones";

// Initialize Brevo
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const DEFAULT_SENDER_EMAIL = process.env.DEFAULT_SENDER_EMAIL || "noreply@junkcarcalc.com";
const DEFAULT_SENDER_NAME = process.env.DEFAULT_SENDER_NAME || "Junk Car Calc";

export async function GET(request: NextRequest) {
  try {
    // Auth check for CRON (could use secret header)
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // 1. Fetch due reminders
    const { data: messages, error: fetchError } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "scheduled")
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (fetchError) throw fetchError;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    const results = {
      success: 0,
      failed: 0,
      total: messages.length,
    };

    // 2. Process messages
    for (const msg of messages) {
      try {
        if (!brevoClient) {
          console.warn("Brevo client not initialized. Skipping send.");
          continue;
        }

        const payload = msg.payload as any;
        const customerTime = formatInTimezone(payload.scheduled_install_at, payload.customer_timezone || 'UTC', { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true,
          timeZoneName: 'short'
        });

        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = `Reminder: Your calculator install is scheduled for ${customerTime}`;
        sendSmtpEmail.sender = { name: DEFAULT_SENDER_NAME, email: DEFAULT_SENDER_EMAIL };
        sendSmtpEmail.to = [{ email: payload.email, name: payload.name }];
        
        sendSmtpEmail.htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
            <h2 style="color: #1e293b; margin-bottom: 24px;">Install Reminder</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              Hi ${payload.name},
            </p>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              This is a reminder that your calculator install for <strong>${payload.account_name}</strong> is scheduled for:
            </p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; margin: 24px 0; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #2563eb;">${customerTime}</div>
            </div>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              We will call you at <strong>${payload.phone}</strong> at the scheduled time. 
              If you need to reschedule, please reply to this email.
            </p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              Sent by Junk Car Calc CRM
            </p>
          </div>
        `;

        const response = await brevoClient.sendTransacEmail(sendSmtpEmail);
        
        // 3. Update status to sent
        await supabase
          .from("scheduled_messages")
          .update({ 
            status: 'sent', 
            provider_message_id: response.body.messageId,
            updated_at: new Date().toISOString() 
          })
          .eq("id", msg.id);

        results.success++;
      } catch (err: any) {
        console.error(`Failed to send reminder ${msg.id}:`, err);
        
        // Update status to failed
        await supabase
          .from("scheduled_messages")
          .update({ 
            status: 'failed', 
            error_message: err.message,
            updated_at: new Date().toISOString() 
          })
          .eq("id", msg.id);

        results.failed++;
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Error in send-reminders cron:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


