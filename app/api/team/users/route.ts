import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/team/users
 * Get all users in the organization
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

    // Get user's organization
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

    // Get all users in the organization using service role to bypass RLS
    const serviceSupabase = createServiceRoleClient();
    const { data: userProfiles, error } = await serviceSupabase
      .from("user_profiles")
      .select(`
        id,
        full_name,
        role,
        phone_number,
        organization_id,
        email,
        is_activator,
        hourly_rate_usd
      `)
      .eq("organization_id", profile.organization_id);

    if (error) {
      console.error("Error fetching users:", error);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    // Get Twilio phone number assignments
    const { data: phoneAssignments } = await serviceSupabase
      .from("twilio_phone_numbers")
      .select("assigned_user_id, phone_number, campaign_id")
      .eq("organization_id", profile.organization_id)
      .not("assigned_user_id", "is", null);

    // Create a map of user_id -> assigned phone number
    const phoneAssignmentMap = new Map<string, { phone_number: string; campaign_id: string | null }>();
    phoneAssignments?.forEach((assignment: any) => {
      if (assignment.assigned_user_id) {
        phoneAssignmentMap.set(assignment.assigned_user_id, {
          phone_number: assignment.phone_number,
          campaign_id: assignment.campaign_id,
        });
      }
    });

    const users = (userProfiles || []).map((up: any) => {
      const phoneAssignment = phoneAssignmentMap.get(up.id);
      return {
        id: up.id,
        full_name: up.full_name,
        role: up.role,
        phone_number: phoneAssignment?.phone_number || up.phone_number, // Use assigned Twilio number if available
        assigned_twilio_number: phoneAssignment?.phone_number || null,
        assigned_campaign_id: phoneAssignment?.campaign_id || null,
        organization_id: up.organization_id,
        email: up.email || "No email",
        is_activator: up.is_activator || false,
        hourly_rate_usd: up.hourly_rate_usd || null,
      };
    });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Error in GET /api/team/users:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

