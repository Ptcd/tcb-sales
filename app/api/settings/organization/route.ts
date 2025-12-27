import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/utils/userProfile";

/**
 * GET /api/settings/organization
 * Get organization settings (admin only)
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

    const profile = await ensureUserProfile(user.id, user.email ?? null);

    // Get organization settings
    const { data: settings, error } = await supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine - we'll create defaults
      console.error("Error fetching organization settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch settings" },
        { status: 500 }
      );
    }

    // Return settings or defaults
    return NextResponse.json({
      success: true,
      settings: settings || {
        organization_id: profile.organization_id,
        enable_email_scraping: true,
        enable_email_outreach: true,
        default_lead_assignment_mode: "manual",
        max_leads_per_search: 200,
      },
      isAdmin: profile.role === "admin",
    });
  } catch (error) {
    console.error("Error in GET /api/settings/organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/organization
 * Update organization settings (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await ensureUserProfile(user.id, user.email ?? null);
    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const updates = await request.json();

    // Validate updates
    const allowedFields = [
      "enable_email_scraping",
      "enable_email_outreach",
      "default_lead_assignment_mode",
      "max_leads_per_search",
    ];

    const filteredUpdates: any = {};
    for (const field of allowedFields) {
      if (field in updates) {
        filteredUpdates[field] = updates[field];
      }
    }

    // Update or insert settings
    const { data: settings, error } = await supabase
      .from("organization_settings")
      .upsert(
        {
          organization_id: profile.organization_id,
          ...filteredUpdates,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "organization_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating organization settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Error in PUT /api/settings/organization:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

