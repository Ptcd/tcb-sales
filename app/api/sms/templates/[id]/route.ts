import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageTemplate } from "@/lib/utils/templatePermissions";

/**
 * PUT /api/sms/templates/[id]
 * Update an SMS template
 * Only admins and campaign managers can update templates
 */
export async function PUT(
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
    const { name, message, isActive } = await request.json();

    // Check if user can manage this template
    const permission = await canManageTemplate(supabase, user.id, id, "sms_templates");
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to edit this template" },
        { status: 403 }
      );
    }

    if (message && message.length > 1600) {
      return NextResponse.json(
        { error: "Message too long (max 1600 characters)" },
        { status: 400 }
      );
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (message !== undefined) updateData.message = message.trim();
    if (isActive !== undefined) updateData.is_active = isActive;

    const { data: template, error } = await supabase
      .from("sms_templates")
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
      console.error("Error updating SMS template:", error);
      return NextResponse.json(
        { error: "Failed to update template" },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Template updated successfully",
      template: {
        id: template.id,
        userId: template.user_id,
        organizationId: template.organization_id,
        campaignId: template.campaign_id,
        campaignName: (template as any).campaigns?.name || null,
        name: template.name,
        message: template.message,
        isActive: template.is_active,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error("Error in SMS template PUT API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sms/templates/[id]
 * Delete an SMS template
 * Only admins and campaign managers can delete templates
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

    // Check if user can manage this template
    const permission = await canManageTemplate(supabase, user.id, id, "sms_templates");
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to delete this template" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("sms_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting SMS template:", error);
      return NextResponse.json(
        { error: "Failed to delete template" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("Error in SMS template DELETE API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
