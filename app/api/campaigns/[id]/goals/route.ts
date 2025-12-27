import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/[id]/goals
 * Fetch campaign goals for a specific campaign
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: campaignId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's profile to check org membership
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify campaign belongs to user's organization
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch campaign goals
    const { data: goals, error: goalsError } = await supabase
      .from("campaign_goals")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    // It's okay if goals don't exist yet - return defaults
    if (goalsError && goalsError.code !== "PGRST116") {
      console.error("Error fetching campaign goals:", goalsError);
      return NextResponse.json(
        { error: "Failed to fetch goals" },
        { status: 500 }
      );
    }

    // Return goals or null (frontend will use defaults)
    return NextResponse.json({ goals: goals || null });
  } catch (error) {
    console.error("Error in GET /api/campaigns/[id]/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/campaigns/[id]/goals
 * Create or update campaign goals
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: campaignId } = await params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's profile to check admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Only admins can update campaign goals
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can update campaign goals" },
        { status: 403 }
      );
    }

    // Verify campaign belongs to user's organization
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const {
      proven_installs_per_40h,
      scheduled_appts_per_40h,
      conversations_per_40h,
      target_weekly_hours,
    } = body;

    // Upsert campaign goals (insert or update)
    const { data: goals, error: upsertError } = await supabase
      .from("campaign_goals")
      .upsert(
        {
          campaign_id: campaignId,
          proven_installs_per_40h: proven_installs_per_40h ?? 4,
          scheduled_appts_per_40h: scheduled_appts_per_40h ?? 8,
          conversations_per_40h: conversations_per_40h ?? 200,
          target_weekly_hours: target_weekly_hours ?? 40,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "campaign_id",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Error upserting campaign goals:", upsertError);
      return NextResponse.json(
        { error: "Failed to save goals", details: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ goals, message: "Goals saved successfully" });
  } catch (error) {
    console.error("Error in PUT /api/campaigns/[id]/goals:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



