import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/reassign-rep
 * Admin-only endpoint to reassign all leads from one rep to another
 * Used when a salesperson leaves and their CRM needs to be merged
 * 
 * Accepts either user IDs or email addresses for fromUser and toUser
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

    const { fromUserId, toUserId, fromEmail, toEmail, statusFilter } = await request.json();

    // Resolve user IDs from emails if provided
    let resolvedFromUserId = fromUserId;
    let resolvedToUserId = toUserId;

    // If emails are provided, look up the user IDs
    if (fromEmail && !fromUserId) {
      const { data: fromUser } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("email", fromEmail.toLowerCase())
        .single();
      
      if (!fromUser) {
        return NextResponse.json(
          { error: `User not found with email: ${fromEmail}` },
          { status: 404 }
        );
      }
      resolvedFromUserId = fromUser.id;
    }

    if (toEmail && !toUserId) {
      const { data: toUser } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("email", toEmail.toLowerCase())
        .single();
      
      if (!toUser) {
        return NextResponse.json(
          { error: `User not found with email: ${toEmail}` },
          { status: 404 }
        );
      }
      resolvedToUserId = toUser.id;
    }

    if (!resolvedFromUserId || !resolvedToUserId) {
      return NextResponse.json(
        { error: "fromUserId/fromEmail and toUserId/toEmail are required" },
        { status: 400 }
      );
    }

    if (resolvedFromUserId === resolvedToUserId) {
      return NextResponse.json(
        { error: "Cannot reassign leads to the same user" },
        { status: 400 }
      );
    }

    // Verify both users are in the same organization
    const { data: users } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .in("id", [resolvedFromUserId, resolvedToUserId])
      .eq("organization_id", profile.organization_id);

    if (!users || users.length !== 2) {
      return NextResponse.json(
        { error: "One or both users not found or not in your organization" },
        { status: 404 }
      );
    }
    
    // Use resolved IDs for the rest of the function
    const fromUserId_resolved = resolvedFromUserId;
    const toUserId_resolved = resolvedToUserId;

    // Build update query
    let updateQuery = supabase
      .from("search_results")
      .update({
        assigned_to: toUserId_resolved,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", fromUserId_resolved);

    // Optional status filter (e.g., only reassign 'new' or 'contacted' leads)
    if (statusFilter && Array.isArray(statusFilter) && statusFilter.length > 0) {
      updateQuery = updateQuery.in("lead_status", statusFilter);
    }

    // Get count before update for reporting
    const { count: beforeCount } = await supabase
      .from("search_results")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", fromUserId_resolved);

    // Perform the update
    const { data: updatedLeads, error } = await updateQuery.select();

    if (error) {
      console.error("Error reassigning leads:", error);
      return NextResponse.json(
        { error: "Failed to reassign leads" },
        { status: 500 }
      );
    }

    // Note: Historical activities (calls, SMS, emails) remain attributed to the original rep
    // for reporting accuracy. Only the lead ownership (assigned_to) changes.

    return NextResponse.json({
      success: true,
      reassignedCount: updatedLeads?.length || 0,
      totalLeadsBefore: beforeCount || 0,
      message: `Successfully reassigned ${updatedLeads?.length || 0} lead(s)`,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/reassign-rep:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

