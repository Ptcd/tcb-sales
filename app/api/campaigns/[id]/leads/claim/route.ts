import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/campaigns/[id]/leads/claim
 * Claim a lead for a campaign
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify user is a member of this campaign
    const { data: membership } = await supabase
      .from("campaign_members")
      .select("campaign_id")
      .eq("campaign_id", id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this campaign" },
        { status: 403 }
      );
    }

    // Verify campaign exists and belongs to organization
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, organization_id, lead_filters")
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

    // Verify lead exists and belongs to organization, fetch all fields needed for filtering
    const { data: lead } = await supabase
      .from("search_results")
      .select("id, organization_id, website, phone, email, rating, review_count")
      .eq("id", lead_id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Check campaign lead filters
    const filters = campaign.lead_filters || {};
    const failures: string[] = [];

    if (filters.require_website && (!lead.website || lead.website.trim() === "")) {
      failures.push("Website is required");
    }
    if (filters.require_phone && (!lead.phone || lead.phone.trim() === "")) {
      failures.push("Phone number is required");
    }
    if (filters.require_email && (!lead.email || lead.email.trim() === "")) {
      failures.push("Email is required");
    }
    if (filters.min_rating !== undefined && filters.min_rating !== null) {
      const leadRating = lead.rating || 0;
      if (leadRating < filters.min_rating) {
        failures.push(`Minimum rating of ${filters.min_rating} required (lead has ${leadRating})`);
      }
    }
    if (filters.min_reviews !== undefined && filters.min_reviews !== null) {
      const leadReviews = lead.review_count || 0;
      if (leadReviews < filters.min_reviews) {
        failures.push(`Minimum ${filters.min_reviews} reviews required (lead has ${leadReviews})`);
      }
    }

    if (failures.length > 0) {
      return NextResponse.json(
        {
          error: "Lead does not meet campaign filter requirements",
          failures,
        },
        { status: 400 }
      );
    }

    // Check if lead is already claimed in this campaign
    const { data: existingClaim } = await supabase
      .from("campaign_leads")
      .select("id, claimed_by, status")
      .eq("campaign_id", id)
      .eq("lead_id", lead_id)
      .single();

    if (existingClaim) {
      if (existingClaim.claimed_by === user.id) {
        // User already claimed it, just return success
        return NextResponse.json({
          success: true,
          message: "Lead already claimed by you",
          already_claimed: true,
        });
      }

      if (existingClaim.status === "claimed" && existingClaim.claimed_by) {
        // Check if the user who claimed it is still in the campaign
        const { data: claimer } = await supabase
          .from("campaign_members")
          .select("user_id")
          .eq("campaign_id", id)
          .eq("user_id", existingClaim.claimed_by)
          .single();

        if (claimer) {
          return NextResponse.json(
            {
              error: "Lead is already claimed by another team member in this campaign",
              claimed_by: existingClaim.claimed_by,
            },
            { status: 409 }
          );
        }
      }
    }

    // Claim the lead (upsert to create or update)
    const { data: campaignLead, error: claimError } = await supabase
      .from("campaign_leads")
      .upsert(
        {
          campaign_id: id,
          lead_id: lead_id,
          organization_id: profile.organization_id,
          claimed_by: user.id,
          claimed_at: new Date().toISOString(),
          status: "claimed",
        },
        {
          onConflict: "campaign_id,lead_id",
        }
      )
      .select()
      .single();

    if (claimError) {
      console.error("Error claiming lead:", claimError);
      return NextResponse.json(
        { error: "Failed to claim lead" },
        { status: 500 }
      );
    }

    // Update the lead's assigned_to field to the user
    await supabase
      .from("search_results")
      .update({ assigned_to: user.id })
      .eq("id", lead_id);

    return NextResponse.json({
      success: true,
      message: "Lead claimed successfully",
      campaign_lead: campaignLead,
    });
  } catch (error: any) {
    console.error("Error in POST /api/campaigns/[id]/leads/claim:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

