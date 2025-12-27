import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/calls/stats
 * Get call statistics for the current user
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

    // Get stats using the function
    const { data: stats, error } = await supabase.rpc("get_user_call_stats", {
      user_uuid: user.id,
    });

    if (error) {
      console.error("Error fetching call stats:", error);
      return NextResponse.json(
        { error: "Failed to fetch call statistics" },
        { status: 500 }
      );
    }

    // Database returns snake_case
    const dbStats = stats?.[0] || {
      total_calls: 0,
      answered_calls: 0,
      total_duration: 0,
      avg_duration: 0,
      calls_today: 0,
      callback_requests: 0,
    };

    return NextResponse.json({
      success: true,
      stats: {
        totalCalls: Number(dbStats.total_calls),
        answeredCalls: Number(dbStats.answered_calls),
        totalDuration: Number(dbStats.total_duration),
        avgDuration: Number(dbStats.avg_duration),
        callsToday: Number(dbStats.calls_today),
        callbackRequests: Number(dbStats.callback_requests),
      },
    });
  } catch (error) {
    console.error("Error in call stats API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
