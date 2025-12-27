import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/email
 * Get organization email settings
 */
export async function GET() {
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
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Fetch email settings
    const { data: settings, error } = await supabase
      .from("organization_email_settings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
      console.error("Error fetching email settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch email settings" },
        { status: 500 }
      );
    }

    // Return settings or defaults
    const formattedSettings = settings ? {
      id: settings.id,
      organizationId: settings.organization_id,
      defaultFromName: settings.default_from_name,
      defaultFromEmail: settings.default_from_email,
      defaultReplyTo: settings.default_reply_to,
      emailSignature: settings.email_signature,
      inboundSubdomain: settings.inbound_subdomain,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at,
    } : null;

    return NextResponse.json({
      success: true,
      settings: formattedSettings,
    });
  } catch (error) {
    console.error("Error in GET /api/settings/email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/email
 * Create or update organization email settings (admin only)
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

    // Get user's organization and verify admin role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can update email settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      defaultFromName,
      defaultFromEmail,
      defaultReplyTo,
      emailSignature,
      inboundSubdomain,
    } = body;

    // Check if settings already exist
    const { data: existing } = await supabase
      .from("organization_email_settings")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .single();

    let settings;
    let error;

    if (existing) {
      // Update existing settings
      const result = await supabase
        .from("organization_email_settings")
        .update({
          default_from_name: defaultFromName,
          default_from_email: defaultFromEmail,
          default_reply_to: defaultReplyTo,
          email_signature: emailSignature,
          inbound_subdomain: inboundSubdomain,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      settings = result.data;
      error = result.error;
    } else {
      // Create new settings
      const result = await supabase
        .from("organization_email_settings")
        .insert({
          organization_id: profile.organization_id,
          default_from_name: defaultFromName,
          default_from_email: defaultFromEmail,
          default_reply_to: defaultReplyTo,
          email_signature: emailSignature,
          inbound_subdomain: inboundSubdomain,
        })
        .select()
        .single();

      settings = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Error saving email settings:", error);
      return NextResponse.json(
        { error: "Failed to save email settings" },
        { status: 500 }
      );
    }

    const formattedSettings = {
      id: settings.id,
      organizationId: settings.organization_id,
      defaultFromName: settings.default_from_name,
      defaultFromEmail: settings.default_from_email,
      defaultReplyTo: settings.default_reply_to,
      emailSignature: settings.email_signature,
      inboundSubdomain: settings.inbound_subdomain,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at,
    };

    return NextResponse.json({
      success: true,
      settings: formattedSettings,
    });
  } catch (error) {
    console.error("Error in POST /api/settings/email:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

