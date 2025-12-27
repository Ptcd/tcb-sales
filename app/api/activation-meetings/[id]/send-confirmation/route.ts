import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  // Get meeting details with activator info
  const { data: meeting } = await supabase
    .from("activation_meetings")
    .select(`
      *,
      activator:user_profiles!activator_user_id(full_name),
      sdr:user_profiles!scheduled_by_sdr_user_id(full_name)
    `)
    .eq("id", id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Get activator's meeting link from agent_schedules
  const { data: schedule } = await supabase
    .from("agent_schedules")
    .select("meeting_link")
    .eq("user_id", meeting.activator_user_id)
    .not("meeting_link", "is", null)
    .limit(1)
    .single();

  const meetingLink = schedule?.meeting_link || null;

  // Format time in customer timezone
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "http://localhost:3000";

  // Send confirmation email to customer (if email provided)
  let customerEmailSent = false;
  if (meeting.email) {
    const customerEmailHtml = `
      <h2>Your Junk Car Calculator Onboarding is Scheduled</h2>
      <p>Hi ${meeting.attendee_name},</p>
      <p>Your onboarding call has been scheduled for:</p>
      <p style="font-size: 18px; font-weight: bold; color: #2563eb;">
        ${formattedTime} (${meeting.scheduled_timezone})
      </p>
      ${meetingLink ? `<p><strong>Meeting Link:</strong> <a href="${meetingLink}">${meetingLink}</a></p>` : ''}
      <p><strong>What to expect:</strong></p>
      <ul>
        <li>30-minute call to get your calculator set up</li>
        <li>We'll walk through configuration together</li>
        <li>Have access to your website ready if possible</li>
      </ul>
      <p><strong>Phone:</strong> We'll call you at ${meeting.phone}</p>
      <p>If you need to reschedule, please reply to this email or call us.</p>
    `;

    const customerResponse = await fetch(`${baseUrl}/api/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadIds: meeting.lead_id ? [meeting.lead_id] : [],
        subject: "Your Junk Car Calculator Onboarding is Scheduled",
        htmlContent: customerEmailHtml,
        campaignId: null, // Will need to handle this differently
      }),
    }).catch(err => {
      console.error("Failed to send customer confirmation:", err);
      return { ok: false };
    });

    customerEmailSent = customerResponse.ok;
  }

  // Send notification email to activator
  const { data: activatorProfile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("id", meeting.activator_user_id)
    .single();

  if (activatorProfile?.email) {
    const activatorEmailHtml = `
      <h2>New Onboarding Scheduled</h2>
      <p>You have a new onboarding scheduled:</p>
      <p style="font-size: 18px; font-weight: bold; color: #2563eb;">
        ${formattedTime} (${meeting.scheduled_timezone})
      </p>
      <p><strong>Attendee:</strong> ${meeting.attendee_name} (${meeting.attendee_role})</p>
      <p><strong>Phone:</strong> ${meeting.phone}</p>
      ${meeting.email ? `<p><strong>Email:</strong> ${meeting.email}</p>` : ''}
      <p><strong>Website Platform:</strong> ${meeting.website_platform}</p>
      <p><strong>Goal:</strong> ${meeting.goal}</p>
      ${meeting.objections ? `<p><strong>Objections:</strong> ${meeting.objections}</p>` : ''}
      ${meeting.notes ? `<p><strong>Notes:</strong> ${meeting.notes}</p>` : ''}
      ${meetingLink ? `<p><strong>Meeting Link:</strong> <a href="${meetingLink}">${meetingLink}</a></p>` : ''}
      <p>Scheduled by: ${(meeting.sdr as any)?.full_name || 'SDR'}</p>
    `;

    await fetch(`${baseUrl}/api/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadIds: [],
        to: activatorProfile.email,
        subject: `New Onboarding Scheduled: ${meeting.attendee_name}`,
        htmlContent: activatorEmailHtml,
        campaignId: null,
      }),
    }).catch(err => console.error("Failed to send activator notification:", err));
  }

  // Mark confirmation sent if customer email was sent
  if (customerEmailSent) {
    await supabase
      .from("activation_meetings")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({ success: true, customerEmailSent });
}

