import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/team/users/[id]/campaigns
 * Get all campaigns a user belongs to
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Verify target user is in same organization
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", id)
      .single();

    if (!targetUser || targetUser.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "User not found or not in your organization" },
        { status: 404 }
      );
    }

    // Get all campaigns the user belongs to
    const { data: memberships, error } = await supabase
      .from("campaign_members")
      .select(`
        campaign_id,
        role,
        campaigns:campaign_id (
          id,
          name,
          status,
          description
        )
      `)
      .eq("user_id", id);

    if (error) {
      console.error("Error fetching user campaigns:", error);
      return NextResponse.json(
        { error: "Failed to fetch campaigns" },
        { status: 500 }
      );
    }

    const campaigns = (memberships || []).map((m: any) => ({
      id: m.campaigns.id,
      name: m.campaigns.name,
      status: m.campaigns.status,
      description: m.campaigns.description,
      role: m.role,
    }));

    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("Error in GET /api/team/users/[id]/campaigns:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

