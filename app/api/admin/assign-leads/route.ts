import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/assign-leads
 * Admin-only endpoint to bulk assign leads to reps
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

    const { leadIds, assignedTo } = await request.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "leadIds array is required" },
        { status: 400 }
      );
    }

    if (!assignedTo) {
      return NextResponse.json(
        { error: "assignedTo user ID is required" },
        { status: 400 }
      );
    }

    // Verify assignedTo user is in the same organization
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .eq("id", assignedTo)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { error: "Target user not found or not in your organization" },
        { status: 404 }
      );
    }

    // Update leads
    const { data: updatedLeads, error } = await supabase
      .from("search_results")
      .update({
        assigned_to: assignedTo,
        updated_at: new Date().toISOString(),
      })
      .in("id", leadIds)
      .eq("organization_id", profile.organization_id)
      .select();

    if (error) {
      console.error("Error assigning leads:", error);
      return NextResponse.json(
        { error: "Failed to assign leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assignedCount: updatedLeads?.length || 0,
      leads: updatedLeads,
    });
  } catch (error) {
    console.error("Error in POST /api/admin/assign-leads:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

