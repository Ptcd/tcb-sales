import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/[id]/members
 * Get all members of a campaign
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

    // Verify campaign exists and belongs to organization
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get all members with user details
    const { data: members, error } = await supabase
      .from("campaign_members")
      .select(`
        id,
        campaign_id,
        user_id,
        role,
        created_at,
        user_profiles:user_id (
          id,
          full_name,
          email,
          role
        )
      `)
      .eq("campaign_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching campaign members:", error);
      return NextResponse.json(
        { error: "Failed to fetch members" },
        { status: 500 }
      );
    }

    return NextResponse.json({ members: members || [] });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns/[id]/members:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/members
 * Add or remove members from a campaign (admin only)
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

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
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
    const { action, user_ids, role } = body;

    if (!action || !["add", "remove"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be 'add' or 'remove'" },
        { status: 400 }
      );
    }

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json(
        { error: "user_ids array is required" },
        { status: 400 }
      );
    }

    // Verify all users belong to the organization
    const { data: users } = await supabase
      .from("user_profiles")
      .select("id")
      .in("id", user_ids)
      .eq("organization_id", profile.organization_id);

    if (!users || users.length !== user_ids.length) {
      return NextResponse.json(
        { error: "One or more users not found or not in your organization" },
        { status: 400 }
      );
    }

    if (action === "add") {
      // Add members to campaign
      const membersToAdd = user_ids.map((userId: string) => ({
        campaign_id: id,
        user_id: userId,
        organization_id: profile.organization_id,
        role: role || "member",
      }));

      const { data: added, error: addError } = await supabase
        .from("campaign_members")
        .upsert(membersToAdd, {
          onConflict: "campaign_id,user_id",
        })
        .select();

      if (addError) {
        console.error("Error adding members:", addError);
        return NextResponse.json(
          { error: "Failed to add members" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Added ${added?.length || 0} member(s) to campaign`,
        members: added,
      });
    } else {
      // Remove members from campaign
      const { error: removeError } = await supabase
        .from("campaign_members")
        .delete()
        .eq("campaign_id", id)
        .in("user_id", user_ids);

      if (removeError) {
        console.error("Error removing members:", removeError);
        return NextResponse.json(
          { error: "Failed to remove members" },
          { status: 500 }
        );
      }

      // Release any leads claimed by removed users
      await supabase
        .from("campaign_leads")
        .update({
          claimed_by: null,
          claimed_at: null,
          status: "available",
        })
        .eq("campaign_id", id)
        .in("claimed_by", user_ids);

      return NextResponse.json({
        success: true,
        message: `Removed ${user_ids.length} member(s) from campaign`,
      });
    }
  } catch (error: any) {
    console.error("Error in POST /api/campaigns/[id]/members:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

