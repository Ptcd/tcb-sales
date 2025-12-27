import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EmailTemplate } from "@/lib/types";
import { canManageTemplate } from "@/lib/utils/templatePermissions";

/**
 * PATCH /api/email/templates/[id]
 * Update an email template
 * Only admins and campaign managers can update templates
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
    const { name, subject, htmlContent, textContent, isQuick, quickLabel } = await request.json();

    // Check if user can manage this template
    const permission = await canManageTemplate(supabase, user.id, id, "email_templates");
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to edit this template" },
        { status: 403 }
      );
    }

    // Verify template exists and check if default
    const { data: existing } = await supabase
      .from("email_templates")
      .select("id, is_default")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Prevent editing default templates
    if (existing.is_default) {
      return NextResponse.json(
        { error: "Cannot edit default templates" },
        { status: 403 }
      );
    }

    // Validate subject length
    if (subject && subject.length > 200) {
      return NextResponse.json(
        { error: "Subject must be 200 characters or less" },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (subject !== undefined) updateData.subject = subject;
    if (htmlContent !== undefined) updateData.html_content = htmlContent;
    if (textContent !== undefined) updateData.text_content = textContent;
    if (isQuick !== undefined) updateData.is_quick = isQuick;
    if (quickLabel !== undefined) updateData.quick_label = quickLabel;

    const { data: template, error } = await supabase
      .from("email_templates")
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
      console.error("Error updating email template:", error);
      return NextResponse.json(
        { error: "Failed to update template" },
        { status: 500 }
      );
    }

    const formattedTemplate: EmailTemplate = {
      id: template.id,
      userId: template.user_id,
      organizationId: template.organization_id,
      campaignId: template.campaign_id,
      campaignName: (template as any).campaigns?.name || null,
      name: template.name,
      subject: template.subject,
      htmlContent: template.html_content,
      textContent: template.text_content,
      isDefault: template.is_default,
      isQuick: template.is_quick,
      quickLabel: template.quick_label,
      displayOrder: template.display_order,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
    };

    return NextResponse.json({
      success: true,
      template: formattedTemplate,
    });
  } catch (error) {
    console.error("Error in PATCH /api/email/templates/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/email/templates/[id]
 * Delete an email template
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
    const permission = await canManageTemplate(supabase, user.id, id, "email_templates");
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to delete this template" },
        { status: 403 }
      );
    }

    // Verify template exists and check if default
    const { data: existing } = await supabase
      .from("email_templates")
      .select("id, is_default")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Prevent deleting default templates
    if (existing.is_default) {
      return NextResponse.json(
        { error: "Cannot delete default templates" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from("email_templates")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting email template:", error);
      return NextResponse.json(
        { error: "Failed to delete template" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/email/templates/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
