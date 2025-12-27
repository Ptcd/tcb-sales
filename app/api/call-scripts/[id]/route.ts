import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Check if user can manage a specific call script
 */
async function canManageScript(
  supabase: any,
  userId: string,
  scriptId: string
): Promise<{ allowed: boolean; reason?: string; script?: any }> {
  // Get the script's campaign_id
  const { data: script } = await supabase
    .from("call_scripts")
    .select("campaign_id, organization_id")
    .eq("id", scriptId)
    .single();

  if (!script) {
    return { allowed: false, reason: "Script not found" };
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .single();

  if (!profile) {
    return { allowed: false, reason: "User profile not found" };
  }

  // Admins can manage all scripts in their org
  if (profile.role === "admin" && profile.organization_id === script.organization_id) {
    return { allowed: true, script };
  }

  // Check if user is a campaign manager
  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", script.campaign_id)
    .eq("user_id", userId)
    .single();

  if (membership?.role === "manager") {
    return { allowed: true, script };
  }

  return {
    allowed: false,
    reason: "Only admins and campaign managers can manage call scripts",
  };
}

/**
 * PATCH /api/call-scripts/[id]
 * Update a call script
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { name, content, displayOrder, isActive, badgeKey, scriptKey, category, priority } = await request.json();

    // Check permissions
    const permission = await canManageScript(supabase, user.id, id);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "Permission denied" },
        { status: 403 }
      );
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (displayOrder !== undefined) updateData.display_order = displayOrder;
    if (isActive !== undefined) updateData.is_active = isActive;
    if (badgeKey !== undefined) updateData.badge_key = badgeKey || null;
    if (scriptKey !== undefined) updateData.script_key = scriptKey || null;
    if (category !== undefined) updateData.category = category || null;
    if (priority !== undefined) updateData.priority = priority || 0;

    const { data: script, error } = await supabase
      .from("call_scripts")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error("Error updating call script:", error);
      return NextResponse.json(
        { error: "Failed to update script" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      script: {
        id: script.id,
        campaignId: script.campaign_id,
        campaignName: (script as any).campaigns?.name || null,
        organizationId: script.organization_id,
        name: script.name,
        content: script.content,
        displayOrder: script.display_order,
        isActive: script.is_active,
        badgeKey: script.badge_key || undefined,
        scriptKey: script.script_key || undefined,
        category: script.category || undefined,
        priority: script.priority || undefined,
        createdBy: script.created_by,
        createdAt: script.created_at,
        updatedAt: script.updated_at,
      },
    });
  } catch (error) {
    console.error("Error in PATCH /api/call-scripts/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/call-scripts/[id]
 * Delete a call script
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check permissions
    const permission = await canManageScript(supabase, user.id, id);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "Permission denied" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("call_scripts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting call script:", error);
      return NextResponse.json(
        { error: "Failed to delete script" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/call-scripts/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


