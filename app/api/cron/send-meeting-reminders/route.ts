import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as brevo from "@getbrevo/brevo";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const FROM_EMAIL = process.env.DEFAULT_SENDER_EMAIL || "no-reply@autosalvageautomation.com";
const FROM_NAME = "Junk Car Calculator";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find meetings starting in 23-25 hours that haven't had reminder sent
  const now = new Date();
  const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const { data: meetings } = await supabase
    .from("activation_meetings")
    .select("*")
    .eq("status", "scheduled")
    .is("reminder_24h_sent_at", null)
    .gte("scheduled_start_at", in23Hours.toISOString())
    .lte("scheduled_start_at", in25Hours.toISOString());
  
  // Get meeting links from activator schedules
  const meetingLinksByActivator = new Map<string, string>();
  if (meetings) {
    const uniqueActivatorIds = [...new Set(meetings.map(m => m.activator_user_id))];
    for (const activatorId of uniqueActivatorIds) {
      const { data: schedule } = await supabase
        .from("agent_schedules")
        .select("meeting_link")
        .eq("user_id", activatorId)
        .not("meeting_link", "is", null)
        .limit(1)
        .single();
      
      if (schedule?.meeting_link) {
        meetingLinksByActivator.set(activatorId, schedule.meeting_link);
      }
    }
  }

  if (!meetings || meetings.length === 0) {
    return NextResponse.json({ success: true, sent: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000";

  let sent = 0;
  let smsSent = 0;
  
  for (const meeting of meetings) {
    const meetingLink = meetingLinksByActivator.get(meeting.activator_user_id);
    const startDate = new Date(meeting.scheduled_start_at);
    const formattedTime = startDate.toLocaleString("en-US", {
      timeZone: meeting.scheduled_timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    // Send email reminder
    if (meeting.email) {
      const emailHtml = `
        <h2>Reminder: Your Onboarding Call is Tomorrow!</h2>
        <p>Hi ${meeting.attendee_name},</p>
        <p>Just a reminder that your onboarding call is scheduled for:</p>
        <p style="font-size: 18px; font-weight: bold; color: #2563eb;">
          ${formattedTime} (${meeting.scheduled_timezone})
        </p>
        ${meetingLink ? `<p><strong>Meeting Link:</strong> <a href="${meetingLink}">${meetingLink}</a></p>` : ''}
        <p>We'll call you at <strong>${meeting.phone}</strong>.</p>
        <p>Please have access to your website ready if possible.</p>
        <p>Reply 1 to confirm, or reply to this email to reschedule.</p>
      `;

      // Send email directly via Brevo (bypassing campaign requirement for reminders)
      if (brevoClient) {
        try {
          const sendSmtpEmail = new brevo.SendSmtpEmail();
          sendSmtpEmail.subject = "Reminder: Your Onboarding Call is Tomorrow";
          sendSmtpEmail.htmlContent = emailHtml;
          sendSmtpEmail.sender = { 
            name: FROM_NAME, 
            email: FROM_EMAIL 
          };
          sendSmtpEmail.to = [{ email: meeting.email, name: meeting.attendee_name }];
          sendSmtpEmail.tags = ["reminder", `meeting_${meeting.id}`];

          await brevoClient.sendTransacEmail(sendSmtpEmail);
          sent++;
        } catch (brevoErr: any) {
          console.error(`Brevo error for reminder ${meeting.id}:`, brevoErr);
        }
      }
    }

    // Send SMS reminder (optional, enabled)
    if (meeting.phone) {
      try {
        const smsMessage = `Reminder: your onboarding is tomorrow at ${formattedTime} (${meeting.scheduled_timezone}). Reply 1 to confirm.${meetingLink ? ` Meeting: ${meetingLink}` : ''}`;
        
        const smsResponse = await fetch(`${baseUrl}/api/sms/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: meeting.lead_id,
            phoneNumber: meeting.phone,
            message: smsMessage,
          }),
        });

        if (smsResponse.ok) {
          smsSent++;
          
          // Log SMS event if trial_pipeline exists
          if (meeting.trial_pipeline_id) {
            try {
              await supabase
                .from("activation_events")
                .insert({
                  trial_pipeline_id: meeting.trial_pipeline_id,
                  event_type: "sms_sent",
                  actor_user_id: null, // System action
                  metadata: {
                    meeting_id: meeting.id,
                    phone: meeting.phone,
                    message_type: "reminder_24h",
                  },
                });
            } catch (err) {
              console.error("Failed to log SMS event:", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to send SMS reminder:", err);
      }
    }

    // Mark reminder sent (if email was sent)
    if (meeting.email && sent > 0) {
      await supabase
        .from("activation_meetings")
        .update({ reminder_24h_sent_at: new Date().toISOString() })
        .eq("id", meeting.id);
      
      // Log reminder_sent event
      if (meeting.trial_pipeline_id) {
        try {
          await supabase
            .from("activation_events")
            .insert({
              trial_pipeline_id: meeting.trial_pipeline_id,
              event_type: "reminder_sent",
              actor_user_id: null, // System action
              metadata: {
                meeting_id: meeting.id,
                reminder_type: "24h",
              },
            });
        } catch (err) {
          console.error("Failed to log reminder event:", err);
        }
      }
    }
  }

  return NextResponse.json({ success: true, sent, smsSent });
}

