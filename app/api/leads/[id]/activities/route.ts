import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LeadActivity } from "@/lib/types";

/**
 * GET /api/leads/[id]/activities
 * Gets all activities for a lead
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leadId } = await params;

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, search_history_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // RLS will automatically filter by organization - no need to check user_id
    // Get all activities for the lead
    const { data: activities, error: activitiesError } = await supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    if (activitiesError) {
      console.error("Error fetching activities:", activitiesError);
      return NextResponse.json(
        { error: "Failed to fetch activities" },
        { status: 500 }
      );
    }

    // Transform to frontend format
    const formattedActivities: LeadActivity[] = (activities || []).map((activity) => ({
      id: activity.id,
      leadId: activity.lead_id,
      userId: activity.user_id,
      activityType: activity.activity_type,
      activityData: activity.activity_data || {},
      description: activity.description || undefined,
      createdAt: activity.created_at,
    }));

    return NextResponse.json({
      success: true,
      activities: formattedActivities,
      count: formattedActivities.length,
    });
  } catch (error) {
    console.error("Error in get activities API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

