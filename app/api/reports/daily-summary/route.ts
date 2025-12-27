import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reports/daily-summary
 * Fetch daily summary for the current user
 * 
 * Query params:
 * - date: YYYY-MM-DD format (defaults to today)
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
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Fetch summary for this user and date
    const { data: summary, error } = await supabase
      .from("daily_sdr_summaries")
      .select("*")
      .eq("sdr_user_id", user.id)
      .eq("date", date)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No summary found for this date
        return NextResponse.json({ summary: null }, { status: 200 });
      }
      console.error("Error fetching daily summary:", error);
      return NextResponse.json(
        { error: "Failed to fetch summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error("Error in daily-summary GET:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

