import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications/lead-notifications
 * Fetch lead notifications for the current SDR
 * 
 * Query params:
 * - unread_only: "true" to only fetch unread notifications (default: true)
 * - limit: number of notifications to fetch (default: 20)
 * - lead_id: optional filter by specific lead
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
    const unreadOnly = searchParams.get("unread_only") !== "false";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const leadId = searchParams.get("lead_id");

    // Build query
    let query = supabase
      .from("lead_notifications")
      .select(`
        id,
        lead_id,
        sdr_user_id,
        event_type,
        payload,
        created_at,
        read,
        search_results!inner (
          id,
          name,
          phone,
          email,
          address
        )
      `)
      .eq("sdr_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("read", false);
    }

    if (leadId) {
      query = query.eq("lead_id", leadId);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error("Error fetching lead notifications:", error);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    // Get unread count
    const { count: unreadCount, error: countError } = await supabase
      .from("lead_notifications")
      .select("*", { count: "exact", head: true })
      .eq("sdr_user_id", user.id)
      .eq("read", false);

    if (countError) {
      console.error("Error counting unread notifications:", countError);
    }

    // Transform notifications to include lead info at top level
    const transformedNotifications = (notifications || []).map((n: any) => ({
      id: n.id,
      lead_id: n.lead_id,
      sdr_user_id: n.sdr_user_id,
      event_type: n.event_type,
      payload: n.payload,
      created_at: n.created_at,
      read: n.read,
      lead_name: n.search_results?.name || "Unknown Lead",
      lead_phone: n.search_results?.phone,
      lead_email: n.search_results?.email,
      lead_address: n.search_results?.address,
    }));

    return NextResponse.json({
      success: true,
      notifications: transformedNotifications,
      unread_count: unreadCount || 0,
    });
  } catch (error: any) {
    console.error("Error in lead-notifications GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications/lead-notifications
 * Mark notifications as read
 * 
 * Body:
 * - notification_ids: array of notification IDs to mark as read
 * - mark_all_read: boolean to mark all as read (ignores notification_ids)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notification_ids, mark_all_read } = body;

    if (mark_all_read) {
      // Mark all unread notifications as read for this user
      const { error } = await supabase
        .from("lead_notifications")
        .update({ read: true })
        .eq("sdr_user_id", user.id)
        .eq("read", false);

      if (error) {
        console.error("Error marking all notifications as read:", error);
        return NextResponse.json(
          { error: "Failed to mark notifications as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "All notifications marked as read",
      });
    }

    if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
      return NextResponse.json(
        { error: "notification_ids array is required" },
        { status: 400 }
      );
    }

    // Mark specific notifications as read (only if they belong to this user)
    const { error } = await supabase
      .from("lead_notifications")
      .update({ read: true })
      .in("id", notification_ids)
      .eq("sdr_user_id", user.id);

    if (error) {
      console.error("Error marking notifications as read:", error);
      return NextResponse.json(
        { error: "Failed to mark notifications as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${notification_ids.length} notification(s) as read`,
    });
  } catch (error: any) {
    console.error("Error in lead-notifications PATCH:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

