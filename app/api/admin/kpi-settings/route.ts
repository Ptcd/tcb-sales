import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/kpi-settings
 * Get KPI notification settings for organization
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: settings } = await supabase
      .from("organization_kpi_settings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .single();

    if (!settings) {
      // Return defaults
      return NextResponse.json({
        notification_frequency: "daily",
        notification_time: "09:00:00",
        notification_day: 1,
        recipient_emails: [],
        is_active: true,
      });
    }

    return NextResponse.json({
      notification_frequency: settings.notification_frequency,
      notification_time: settings.notification_time,
      notification_day: settings.notification_day,
      recipient_emails: settings.recipient_emails || [],
      is_active: settings.is_active,
    });
  } catch (error: any) {
    console.error("Error getting KPI settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/kpi-settings
 * Update KPI notification settings
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

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from("organization_kpi_settings")
      .upsert(
        {
          organization_id: profile.organization_id,
          notification_frequency: body.notification_frequency || "daily",
          notification_time: body.notification_time || "09:00:00",
          notification_day: body.notification_day || 1,
          recipient_emails: body.recipient_emails || [],
          is_active: body.is_active !== false,
        },
        {
          onConflict: "organization_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating KPI settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating KPI settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

