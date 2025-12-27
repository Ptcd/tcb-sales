import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/voicemails
 * Get all voicemails (inbound calls with recordings)
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const onlyNew = searchParams.get("onlyNew") === "true";

    // Query voicemails from user_call_history view
    let query = supabase
      .from("user_call_history")
      .select("*", { count: "exact" })
      .eq("direction", "inbound")
      .eq("voicemail_left", true)
      .order("initiated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by new/unread only
    if (onlyNew) {
      query = query.eq("is_new", true);
    }

    const { data: voicemails, error, count } = await query;

    if (error) {
      console.error("Error fetching voicemails:", error);
      return NextResponse.json(
        { error: "Failed to fetch voicemails" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      voicemails: voicemails || [],
      count: voicemails?.length || 0,
      total: count || 0,
      offset,
      limit,
    });
  } catch (error) {
    console.error("Error in voicemails API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


