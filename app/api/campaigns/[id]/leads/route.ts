import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/[id]/leads
 * Get all leads for a campaign with their claim status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify user is a member of this campaign or is admin
    const { data: membership } = await supabase
      .from("campaign_members")
      .select("campaign_id")
      .eq("campaign_id", id)
      .eq("user_id", user.id)
      .single();

    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!membership && userProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "You are not a member of this campaign" },
        { status: 403 }
      );
    }

    // Verify campaign exists and belongs to organization
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get all campaign leads with lead details
    const { data: campaignLeads, error } = await supabase
      .from("campaign_leads")
      .select(`
        id,
        campaign_id,
        lead_id,
        claimed_by,
        claimed_at,
        status,
        created_at,
        search_results:lead_id (
          id,
          name,
          phone,
          email,
          address,
          lead_status,
          assigned_to,
          last_contacted_at
        ),
        claimed_by_user:claimed_by (
          id,
          full_name,
          email
        )
      `)
      .eq("campaign_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching campaign leads:", error);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({ leads: campaignLeads || [] });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns/[id]/leads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

