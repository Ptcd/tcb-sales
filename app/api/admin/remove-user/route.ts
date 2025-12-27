import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/remove-user
 * Permanently remove a user from the organization including:
 * 1. Reassign all their leads to another user
 * 2. Remove from all campaigns
 * 3. Delete from user_profiles
 * 4. Delete from Supabase Auth (auth.users)
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

    // Verify user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { userIdToRemove, reassignToUserId, deleteFromAuth } = await request.json();

    if (!userIdToRemove) {
      return NextResponse.json(
        { error: "userIdToRemove is required" },
        { status: 400 }
      );
    }

    if (userIdToRemove === user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 }
      );
    }

    // Verify target user is in same organization
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("organization_id, full_name, email")
      .eq("id", userIdToRemove)
      .single();

    if (!targetUser || targetUser.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "User not found or not in your organization" },
        { status: 404 }
      );
    }

    // If reassignToUserId is provided, verify they're in the same org
    if (reassignToUserId) {
      const { data: reassignUser } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", reassignToUserId)
        .single();

      if (!reassignUser || reassignUser.organization_id !== profile.organization_id) {
        return NextResponse.json(
          { error: "Reassign target user not found or not in your organization" },
          { status: 404 }
        );
      }
    }

    let leadsReassigned = 0;

    // Step 1: Reassign all leads from this user
    if (reassignToUserId) {
      // Reassign leads to the specified user
      const { data: updatedLeads, error: reassignError } = await supabase
        .from("search_results")
        .update({
          assigned_to: reassignToUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id)
        .eq("assigned_to", userIdToRemove)
        .select();

      if (reassignError) {
        console.error("Error reassigning leads:", reassignError);
      } else {
        leadsReassigned = updatedLeads?.length || 0;
      }

      // Also update campaign_leads if any
      await supabase
        .from("campaign_leads")
        .update({
          claimed_by: reassignToUserId,
          claimed_at: new Date().toISOString(),
        })
        .eq("claimed_by", userIdToRemove);
    } else {
      // Unassign all leads (set assigned_to to null)
      const { data: unassignedLeads } = await supabase
        .from("search_results")
        .update({
          assigned_to: null,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", profile.organization_id)
        .eq("assigned_to", userIdToRemove)
        .select();

      leadsReassigned = unassignedLeads?.length || 0;

      // Release campaign leads back to pool
      await supabase
        .from("campaign_leads")
        .update({
          claimed_by: null,
          claimed_at: null,
          status: "available",
        })
        .eq("claimed_by", userIdToRemove);
    }

    // Step 2: Remove user from all campaigns
    await supabase
      .from("campaign_members")
      .delete()
      .eq("user_id", userIdToRemove);

    // Step 3: Delete from user_profiles
    const { error: profileDeleteError } = await supabase
      .from("user_profiles")
      .delete()
      .eq("id", userIdToRemove)
      .eq("organization_id", profile.organization_id);

    if (profileDeleteError) {
      console.error("Error deleting user profile:", profileDeleteError);
      return NextResponse.json(
        { error: "Failed to delete user profile: " + profileDeleteError.message },
        { status: 500 }
      );
    }

    // Step 4: Delete from Supabase Auth (if requested)
    let authDeleted = false;
    if (deleteFromAuth !== false) {
      try {
        const adminClient = createServiceRoleClient();
        const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userIdToRemove);

        if (authDeleteError) {
          console.error("Error deleting from auth:", authDeleteError);
          // Don't fail the whole operation, just log it
          // The user profile is already deleted
        } else {
          authDeleted = true;
        }
      } catch (authError) {
        console.error("Error with admin auth client:", authError);
        // Continue anyway - profile is deleted
      }
    }

    return NextResponse.json({
      success: true,
      message: `User permanently removed`,
      user_removed: {
        id: userIdToRemove,
        name: targetUser.full_name || targetUser.email,
        email: targetUser.email,
      },
      leads_reassigned: leadsReassigned,
      reassigned_to: reassignToUserId || null,
      auth_deleted: authDeleted,
    });
  } catch (error: any) {
    console.error("Error in POST /api/admin/remove-user:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
