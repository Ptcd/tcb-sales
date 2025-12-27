import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EmailMessage } from "@/lib/types";

/**
 * GET /api/email/history
 * Get email history for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");
    const status = searchParams.get("status");
    const template = searchParams.get("template");
    const direction = searchParams.get("direction"); // 'inbound', 'outbound', or null for all

    // Remove user_id filter - RLS will filter by organization_id automatically
    let query = supabase
      .from("email_messages")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (template) {
      query = query.eq("template_id", template);
    }

    if (direction) {
      query = query.eq("direction", direction);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      console.error("Error fetching email history:", error);
      return NextResponse.json(
        { error: "Failed to fetch email history" },
        { status: 500 }
      );
    }

    const formattedMessages: EmailMessage[] = (messages || []).map((m) => ({
      id: m.id,
      leadId: m.lead_id,
      userId: m.user_id,
      organizationId: m.organization_id,
      templateId: m.template_id,
      campaignId: m.campaign_id,
      toEmail: m.to_email,
      fromEmail: m.from_email,
      subject: m.subject,
      htmlContent: m.html_content,
      textContent: m.text_content,
      status: m.status,
      direction: m.direction || "outbound",
      isRead: m.is_read ?? true,
      threadId: m.thread_id,
      inReplyTo: m.in_reply_to,
      messageId: m.message_id,
      scheduledFor: m.scheduled_for,
      isScheduled: m.is_scheduled,
      providerMessageId: m.provider_message_id,
      openedAt: m.opened_at,
      clickedAt: m.clicked_at,
      bouncedAt: m.bounced_at,
      sentAt: m.sent_at,
      errorMessage: m.error_message,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      leadName: m.lead_name,
      leadAddress: m.lead_address,
      templateName: m.template_name,
    }));

    return NextResponse.json({
      messages: formattedMessages,
      total: count || 0,
    });
  } catch (error) {
    console.error("Error in GET /api/email/history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

