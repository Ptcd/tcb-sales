import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/recycle-bin
 * Fetches all soft-deleted items from the organization
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

    // Fetch all deleted items from different tables
    // RLS policies will automatically filter by organization and deleted_at IS NOT NULL

    // Get deleted search histories
    const { data: searchHistories } = await supabase
      .from("search_history")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    // Get deleted leads (search results)
    const { data: leads } = await supabase
      .from("search_results")
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    // Get deleted SMS messages
    const { data: smsMessages } = await supabase
      .from("sms_messages")
      .select("*, search_results(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    // Get deleted emails
    const { data: emails } = await supabase
      .from("email_messages")
      .select("*, search_results(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    // Get deleted calls
    const { data: calls } = await supabase
      .from("calls")
      .select("*, search_results(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    // Calculate days until permanent deletion for each item
    const calculateDaysRemaining = (deletedAt: string) => {
      const deleted = new Date(deletedAt);
      const expiresAt = new Date(deleted.getTime() + 30 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      return Math.max(0, daysRemaining);
    };

    // Format items with type and expiration info
    const items = [
      ...(searchHistories || []).map((item) => ({
        ...item,
        type: "search_history" as const,
        title: `${item.keyword} in ${item.location}`,
        subtitle: `${item.results_found || 0} results`,
        daysRemaining: calculateDaysRemaining(item.deleted_at),
      })),
      ...(leads || []).map((item) => ({
        ...item,
        type: "lead" as const,
        title: item.name,
        subtitle: item.phone || item.email || item.address || "No contact info",
        daysRemaining: calculateDaysRemaining(item.deleted_at),
      })),
      ...(smsMessages || []).map((item) => ({
        ...item,
        type: "sms" as const,
        title: `SMS to ${Array.isArray(item.search_results) ? item.search_results[0]?.name : item.search_results?.name || "Unknown"}`,
        subtitle: item.message?.substring(0, 60) + (item.message?.length > 60 ? "..." : ""),
        daysRemaining: calculateDaysRemaining(item.deleted_at),
      })),
      ...(emails || []).map((item) => ({
        ...item,
        type: "email" as const,
        title: `Email to ${Array.isArray(item.search_results) ? item.search_results[0]?.name : item.search_results?.name || "Unknown"}`,
        subtitle: item.subject || "No subject",
        daysRemaining: calculateDaysRemaining(item.deleted_at),
      })),
      ...(calls || []).map((item) => ({
        ...item,
        type: "call" as const,
        title: `Call to ${Array.isArray(item.search_results) ? item.search_results[0]?.name : item.search_results?.name || "Unknown"}`,
        subtitle: `${item.duration || 0}s - ${item.status || "Unknown"}`,
        daysRemaining: calculateDaysRemaining(item.deleted_at),
      })),
    ];

    // Sort by deleted_at (most recent first)
    items.sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());

    return NextResponse.json({
      success: true,
      items,
      count: items.length,
    });
  } catch (error) {
    console.error("Error fetching recycle bin items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

