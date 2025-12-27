import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns
 * List all campaigns for the user's organization
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const scope = request.nextUrl.searchParams.get("scope"); // e.g., "member"

    let campaignIds: string[] | null = null;
    if (scope === "member") {
      const { data: memberships } = await supabase
        .from("campaign_members")
        .select("campaign_id")
        .eq("user_id", user.id);
      campaignIds = (memberships || []).map((m) => m.campaign_id);

      // If user has no campaigns, return empty list early
      if (campaignIds.length === 0) {
        return NextResponse.json({ campaigns: [] });
      }
    }

    // Get all campaigns for the organization
    let query = supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    if (scope === "member" && campaignIds) {
      query = query.in("id", campaignIds);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error("Error fetching campaigns:", error);
      return NextResponse.json(
        { error: "Failed to fetch campaigns" },
        { status: 500 }
      );
    }

    // For each campaign, get member count and lead count
    const campaignsWithStats = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        const [membersResult, leadsResult] = await Promise.all([
          supabase
            .from("campaign_members")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id),
          supabase
            .from("campaign_leads")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id),
        ]);

        return {
          ...campaign,
          member_count: membersResult.count || 0,
          lead_count: leadsResult.count || 0,
        };
      })
    );

    return NextResponse.json({ campaigns: campaignsWithStats });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns
 * Create a new campaign (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, status, lead_filters } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Campaign name is required" },
        { status: 400 }
      );
    }

    // Validate and process lead_filters if provided
    let validFilters: any = {};
    if (lead_filters !== undefined) {
      if (typeof lead_filters !== "object" || lead_filters === null || Array.isArray(lead_filters)) {
        return NextResponse.json(
          { error: "lead_filters must be an object" },
          { status: 400 }
        );
      }
      
      // Validate filter fields
      if (lead_filters.require_website !== undefined) {
        validFilters.require_website = !!lead_filters.require_website;
      }
      if (lead_filters.require_phone !== undefined) {
        validFilters.require_phone = !!lead_filters.require_phone;
      }
      if (lead_filters.require_email !== undefined) {
        validFilters.require_email = !!lead_filters.require_email;
      }
      if (lead_filters.min_rating !== undefined) {
        const rating = Number(lead_filters.min_rating);
        if (isNaN(rating) || rating < 0 || rating > 5) {
          return NextResponse.json(
            { error: "min_rating must be a number between 0 and 5" },
            { status: 400 }
          );
        }
        validFilters.min_rating = rating;
      }
      if (lead_filters.min_reviews !== undefined) {
        const reviews = Number(lead_filters.min_reviews);
        if (isNaN(reviews) || reviews < 0) {
          return NextResponse.json(
            { error: "min_reviews must be a non-negative number" },
            { status: 400 }
          );
        }
        validFilters.min_reviews = reviews;
      }
    }

    // Check if campaign with same name already exists
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("name", name.trim())
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A campaign with this name already exists" },
        { status: 409 }
      );
    }

    const insertData: any = {
      organization_id: profile.organization_id,
      name: name.trim(),
      description: description || null,
      status: status || "active",
    };

    if (lead_filters !== undefined) {
      insertData.lead_filters = Object.keys(validFilters).length > 0 ? validFilters : {};
    }

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error creating campaign:", error);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/campaigns:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

