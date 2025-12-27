import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications/unread-counts
 * Get unread counts for SMS and voicemails
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

    // Get unread SMS count (from conversation_threads view)
    const { data: unreadSms, error: smsError } = await supabase
      .from("conversation_threads")
      .select("unread_count", { count: "exact" });

    // Calculate total unread SMS
    const totalUnreadSms = unreadSms?.reduce((sum, thread) => sum + (thread.unread_count || 0), 0) || 0;

    // Get unread voicemail count
    const { count: unreadVoicemails, error: vmError } = await supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("direction", "inbound")
      .eq("voicemail_left", true)
      .eq("is_new", true);

    if (smsError || vmError) {
      console.error("Error fetching unread counts:", { smsError, vmError });
      return NextResponse.json(
        { error: "Failed to fetch unread counts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      counts: {
        unreadSms: totalUnreadSms,
        unreadVoicemails: unreadVoicemails || 0,
        total: totalUnreadSms + (unreadVoicemails || 0),
      },
    });
  } catch (error) {
    console.error("Error in unread counts API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


