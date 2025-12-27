import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EmailTemplate } from "@/lib/types";
import { canManageTemplates } from "@/lib/utils/templatePermissions";

/**
 * GET /api/email/templates
 * Get all email templates for the authenticated user's campaigns
 * Templates are filtered by campaign membership (RLS) and include campaign info
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

    // Fetch templates with campaign information
    // RLS ensures users only see templates from campaigns they're members of
    const { data: templates, error } = await supabase
      .from("email_templates")
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching email templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    const formattedTemplates: EmailTemplate[] = templates.map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      organizationId: t.organization_id,
      campaignId: t.campaign_id,
      campaignName: t.campaigns?.name || null,
      name: t.name,
      subject: t.subject,
      htmlContent: t.html_content,
      textContent: t.text_content,
      isDefault: t.is_default,
      isQuick: t.is_quick,
      quickLabel: t.quick_label,
      displayOrder: t.display_order,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ templates: formattedTemplates });
  } catch (error) {
    console.error("Error in GET /api/email/templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/email/templates
 * Create a new email template for a specific campaign
 * Only admins and campaign managers can create templates
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

    // Get user's organization
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { name, subject, htmlContent, textContent, isQuick, quickLabel, displayOrder, campaignId } = await request.json();

    if (!name || !subject || !htmlContent) {
      return NextResponse.json(
        { error: "Name, subject, and HTML content are required" },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign is required" },
        { status: 400 }
      );
    }

    // Validate subject length
    if (subject.length > 200) {
      return NextResponse.json(
        { error: "Subject must be 200 characters or less" },
        { status: 400 }
      );
    }

    // Check if user can manage templates for this campaign
    const permission = await canManageTemplates(supabase, user.id, campaignId);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to manage templates for this campaign" },
        { status: 403 }
      );
    }

    const { data: template, error } = await supabase
      .from("email_templates")
      .insert({
        user_id: user.id,
        organization_id: profile.organization_id,
        campaign_id: campaignId,
        name,
        subject,
        html_content: htmlContent,
        text_content: textContent || null,
        is_default: false,
        is_quick: isQuick || false,
        quick_label: quickLabel || null,
        display_order: displayOrder || 0,
      })
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error("Error creating email template:", error);
      return NextResponse.json(
        { error: "Failed to create template" },
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
    console.error("Error in POST /api/email/templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
