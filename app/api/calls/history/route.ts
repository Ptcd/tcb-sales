import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Call } from "@/lib/types";

/**
 * GET /api/calls/history
 * Get call history for the current user
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
    const status = searchParams.get("status");
    const outcome = searchParams.get("outcome");
    const needsFollowup = searchParams.get("needsFollowup") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Remove user_id filter - view already filters by organization via RLS
    let query = supabase
      .from("user_call_history")
      .select("*", { count: "exact" })
      .order("initiated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (leadId) query = query.eq("lead_id", leadId);
    if (status) query = query.eq("status", status);
    if (outcome) query = query.eq("outcome", outcome);
    
    // Filter for calls needing follow-up (no outcome and initiated more than 10 minutes ago)
    if (needsFollowup) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      query = query.is("outcome", null).lt("initiated_at", tenMinutesAgo);
    }

    const { data: calls, error, count } = await query;

    if (error) {
      console.error("Error fetching call history:", error);
      return NextResponse.json(
        { error: "Failed to fetch call history" },
        { status: 500 }
      );
    }

    // Transform to frontend format
    const formattedCalls: Call[] = (calls || []).map((c) => ({
      id: c.id,
      leadId: c.lead_id,
      userId: c.user_id,
      phoneNumber: c.phone_number,
      callType: c.call_type,
      status: c.status,
      duration: c.duration,
      direction: c.direction || 'outbound',
      voicemailLeft: c.voicemail_left || false,
      twilioCallSid: c.twilio_call_sid,
      twilioRecordingSid: c.twilio_recording_sid,
      recordingUrl: c.recording_url,
      notes: c.notes,
      outcome: c.outcome,
      callbackDate: c.callback_date,
      initiatedAt: c.initiated_at,
      answeredAt: c.answered_at,
      endedAt: c.ended_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      leadName: c.lead_name,
      leadAddress: c.lead_address,
      leadStatus: c.lead_status,
      callCount: c.call_count,
      lastCallMadeAt: c.last_call_made_at,
    }));

    return NextResponse.json({
      success: true,
      calls: formattedCalls,
      count: formattedCalls.length,
      total: count || 0,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Error in call history API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
