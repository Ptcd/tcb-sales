import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/campaigns/[id]/leads/release
 * Release a claimed lead back to available pool
 */
export async function POST(
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
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

    const body = await request.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Get the campaign lead
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select("id, claimed_by")
      .eq("campaign_id", id)
      .eq("lead_id", lead_id)
      .single();

    if (!campaignLead) {
      return NextResponse.json(
        { error: "Lead not found in this campaign" },
        { status: 404 }
      );
    }

    // Only the user who claimed it or an admin can release it
    if (campaignLead.claimed_by !== user.id && profile.role !== "admin") {
      return NextResponse.json(
        { error: "You can only release leads you have claimed" },
        { status: 403 }
      );
    }

    // Release the lead
    const { data: released, error: releaseError } = await supabase
      .from("campaign_leads")
      .update({
        claimed_by: null,
        claimed_at: null,
        status: "available",
      })
      .eq("id", campaignLead.id)
      .select()
      .single();

    if (releaseError) {
      console.error("Error releasing lead:", releaseError);
      return NextResponse.json(
        { error: "Failed to release lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lead released successfully",
      campaign_lead: released,
    });
  } catch (error: any) {
    console.error("Error in POST /api/campaigns/[id]/leads/release:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

