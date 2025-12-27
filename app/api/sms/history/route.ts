import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SMSMessage } from "@/lib/types";

/**
 * GET /api/sms/history
 * Get SMS history for the current user
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

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Remove user_id filter - view already filters by organization via RLS
    let query = supabase
      .from("user_sms_history")
      .select("*", { count: "exact" })
      .order("sent_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by lead if specified
    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    const { data: messages, error, count } = await query;

    if (error) {
      console.error("Error fetching SMS history:", error);
      return NextResponse.json(
        { error: "Failed to fetch SMS history" },
        { status: 500 }
      );
    }

    // Transform to frontend format
    const formattedMessages: SMSMessage[] = (messages || []).map((m) => ({
      id: m.id,
      leadId: m.lead_id,
      userId: m.user_id,
      templateId: m.template_id,
      phoneNumber: m.phone_number,
      message: m.message,
      status: m.status,
      twilioSid: m.twilio_sid,
      errorMessage: m.error_message,
      sentAt: m.sent_at,
      deliveredAt: m.delivered_at,
      createdAt: m.created_at,
      leadName: m.lead_name,
      leadAddress: m.lead_address,
      leadStatus: m.lead_status,
      templateName: m.template_name,
    }));

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
      count: formattedMessages.length,
      total: count || 0,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Error in SMS history API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

