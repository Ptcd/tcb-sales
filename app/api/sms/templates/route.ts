import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SMSTemplate } from "@/lib/types";
import { canManageTemplates } from "@/lib/utils/templatePermissions";

/**
 * GET /api/sms/templates
 * Get all SMS templates for the user's campaigns
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
      .from("sms_templates")
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching SMS templates:", error);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    // Transform to frontend format
    const formattedTemplates: SMSTemplate[] = (templates || []).map((t: any) => ({
      id: t.id,
      userId: t.user_id,
      organizationId: t.organization_id,
      campaignId: t.campaign_id,
      campaignName: t.campaigns?.name || null,
      name: t.name,
      message: t.message,
      isActive: t.is_active,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({
      success: true,
      templates: formattedTemplates,
      count: formattedTemplates.length,
    });
  } catch (error) {
    console.error("Error in SMS templates GET API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sms/templates
 * Create a new SMS template for a specific campaign
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

    const { name, message, isActive = true, campaignId } = await request.json();

    if (!name || !message) {
      return NextResponse.json(
        { error: "Name and message are required" },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign is required" },
        { status: 400 }
      );
    }

    if (message.length > 1600) {
      return NextResponse.json(
        { error: "Message too long (max 1600 characters)" },
        { status: 400 }
      );
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

    // Check if user can manage templates for this campaign
    const permission = await canManageTemplates(supabase, user.id, campaignId);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to manage templates for this campaign" },
        { status: 403 }
      );
    }

    const { data: template, error } = await supabase
      .from("sms_templates")
      .insert({
        user_id: user.id,
        organization_id: profile.organization_id,
        campaign_id: campaignId,
        name: name.trim(),
        message: message.trim(),
        is_active: isActive,
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
      console.error("Error creating SMS template:", error);
      return NextResponse.json(
        { error: "Failed to create template" },
        { status: 500 }
      );
    }

    const formattedTemplate: SMSTemplate = {
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
    };

    return NextResponse.json({
      success: true,
      message: "Template created successfully",
      template: formattedTemplate,
    });
  } catch (error) {
    console.error("Error in SMS templates POST API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
