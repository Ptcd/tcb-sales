import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageTemplates } from "@/lib/utils/templatePermissions";

export interface CallScript {
  id: string;
  campaignId: string;
  campaignName?: string;
  organizationId: string;
  name: string;
  content: string;
  displayOrder: number;
  isActive: boolean;
  badgeKey?: string;
  scriptKey?: string;      // NEW: Machine-readable key
  category?: string;        // NEW: Script category
  priority?: number;       // NEW: Priority within category
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/call-scripts
 * Get all call scripts for the user's campaigns
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

    // Get optional filters
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const badgeKey = searchParams.get("badgeKey");
    const scriptKey = searchParams.get("scriptKey");

    // Build query
    let query = supabase
      .from("call_scripts")
      .select(`
        *,
        campaigns:campaign_id (
          id,
          name
        )
      `)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }
    
    if (badgeKey) {
      query = query.eq("badge_key", badgeKey);
    }
    
    if (scriptKey) {
      query = query.eq("script_key", scriptKey);
    }

    const { data: scripts, error } = await query;

    if (error) {
      console.error("Error fetching call scripts:", error);
      return NextResponse.json(
        { error: "Failed to fetch scripts" },
        { status: 500 }
      );
    }

    const formattedScripts: CallScript[] = (scripts || []).map((s: any) => ({
      id: s.id,
      campaignId: s.campaign_id,
      campaignName: s.campaigns?.name || null,
      organizationId: s.organization_id,
      name: s.name,
      content: s.content,
      displayOrder: s.display_order,
      isActive: s.is_active,
      badgeKey: s.badge_key || undefined,
      scriptKey: s.script_key || undefined,      // NEW
      category: s.category || undefined,          // NEW
      priority: s.priority || undefined,          // NEW
      createdBy: s.created_by,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return NextResponse.json({
      success: true,
      scripts: formattedScripts,
    });
  } catch (error) {
    console.error("Error in GET /api/call-scripts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/call-scripts
 * Create a new call script
 * Only admins and campaign managers can create scripts
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

    const { name, content, campaignId, displayOrder, isActive, badgeKey, scriptKey, category, priority } = await request.json();

    if (!name || !content || !campaignId) {
      return NextResponse.json(
        { error: "Name, content, and campaignId are required" },
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

    // Check permissions
    const permission = await canManageTemplates(supabase, user.id, campaignId);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: permission.reason || "You don't have permission to manage scripts for this campaign" },
        { status: 403 }
      );
    }

    const { data: script, error } = await supabase
      .from("call_scripts")
      .insert({
        campaign_id: campaignId,
        organization_id: profile.organization_id,
        name: name.trim(),
        content: content.trim(),
        display_order: displayOrder || 0,
        is_active: isActive !== false,
        badge_key: badgeKey || null,
        script_key: scriptKey || null,       // NEW
        category: category || null,           // NEW
        priority: priority || 0,              // NEW
        created_by: user.id,
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
      console.error("Error creating call script:", error);
      return NextResponse.json(
        { error: "Failed to create script" },
        { status: 500 }
      );
    }

    const formattedScript: CallScript = {
      id: script.id,
      campaignId: script.campaign_id,
      campaignName: (script as any).campaigns?.name || null,
      organizationId: script.organization_id,
      name: script.name,
      content: script.content,
      displayOrder: script.display_order,
      isActive: script.is_active,
      badgeKey: script.badge_key || undefined,
      scriptKey: script.script_key || undefined,      // NEW
      category: script.category || undefined,          // NEW
      priority: script.priority || undefined,          // NEW
      createdBy: script.created_by,
      createdAt: script.created_at,
      updatedAt: script.updated_at,
    };

    return NextResponse.json({
      success: true,
      script: formattedScript,
    });
  } catch (error) {
    console.error("Error in POST /api/call-scripts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


