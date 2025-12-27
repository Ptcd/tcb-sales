import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  calculateActivatorMetrics,
  calculateActivatorScoring,
  getWeekStart,
  getWeekEnd,
} from "@/lib/utils/performanceMetrics";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user profile to check role
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const targetUserId = searchParams.get("userId"); // For admin viewing others

  // Determine which user's metrics to show
  let activatorUserId = user.id;
  if (targetUserId && profile.role === "admin") {
    // Verify target user is in same org
    const { data: targetProfile } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .eq("id", targetUserId)
      .single();
    
    if (!targetProfile || targetProfile.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    
    activatorUserId = targetUserId;
  }

  // Default to current week if no dates provided
  const now = new Date();
  const weekStart = startDate ? new Date(startDate) : getWeekStart(now);
  const weekEnd = endDate ? new Date(endDate) : getWeekEnd(now);

  try {
    // Calculate current week metrics
    const metrics = await calculateActivatorMetrics(
      supabase,
      activatorUserId,
      weekStart,
      weekEnd
    );

    // Get last week for trend calculation
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekEnd);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

    const lastWeekMetrics = await calculateActivatorMetrics(
      supabase,
      activatorUserId,
      lastWeekStart,
      lastWeekEnd
    );

    // Calculate scoring
    const scoring = calculateActivatorScoring(metrics, lastWeekMetrics);

    return NextResponse.json({
      success: true,
      metrics,
      scoring,
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
    });
  } catch (error: any) {
    console.error("Error calculating Activator performance:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate performance" },
      { status: 500 }
    );
  }
}


