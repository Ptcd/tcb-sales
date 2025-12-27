import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessResult } from "@/lib/types";

/**
 * GET /api/leads/followups
 * Get leads that need follow-up today (next_action_at <= now)
 * Query params: scope=mine|all
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

    // Get user's organization and role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "mine"; // mine or all

    // Build query for follow-ups
    let query = supabase
      .from("search_results")
      .select(`
        id,
        place_id,
        name,
        address,
        phone,
        email,
        website,
        rating,
        review_count,
        latitude,
        longitude,
        lead_status,
        assigned_to,
        last_contacted_at,
        updated_at,
        next_action_at,
        next_action_note,
        organization_id
      `)
      .eq("organization_id", profile.organization_id)
      .not("next_action_at", "is", null)
      .lte("next_action_at", new Date().toISOString())
      .neq("lead_status", "closed_won")
      .neq("lead_status", "closed_lost");

    // Filter by assigned user if scope is "mine"
    if (scope === "mine") {
      query = query.eq("assigned_to", user.id);
    }

    // Order by next_action_at ascending (earliest first)
    query = query.order("next_action_at", { ascending: true });

    const { data: leads, error } = await query;

    if (error) {
      console.error("Error fetching follow-ups:", error);
      return NextResponse.json(
        { error: "Failed to fetch follow-ups" },
        { status: 500 }
      );
    }

    // Get latest activity for each lead
    const leadIds = (leads || []).map((l: any) => l.id);
    let latestActivities: Record<string, any> = {};

    if (leadIds.length > 0) {
      const { data: activities } = await supabase
        .from("lead_activities")
        .select("lead_id, description, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false });

      if (activities) {
        // Get the latest activity per lead
        for (const activity of activities) {
          if (!latestActivities[activity.lead_id]) {
            latestActivities[activity.lead_id] = activity;
          }
        }
      }
    }

    // Transform to BusinessResult format
    const businessResults: BusinessResult[] = (leads || []).map((lead: any) => ({
      id: lead.id,
      placeId: lead.place_id,
      name: lead.name,
      address: lead.address,
      phone: lead.phone || undefined,
      email: lead.email || undefined,
      website: lead.website || undefined,
      rating: lead.rating || undefined,
      reviewCount: lead.review_count || undefined,
      latitude: lead.latitude || undefined,
      longitude: lead.longitude || undefined,
      leadStatus: lead.lead_status as any,
      assignedTo: lead.assigned_to || undefined,
      lastContactedAt: lead.last_contacted_at || undefined,
      updatedAt: lead.updated_at || undefined,
      nextActionAt: lead.next_action_at || undefined,
      nextActionNote: lead.next_action_note || undefined,
    }));

    return NextResponse.json({
      success: true,
      leads: businessResults,
      count: businessResults.length,
      latestActivities,
    });
  } catch (error: any) {
    console.error("Error in GET /api/leads/followups:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

