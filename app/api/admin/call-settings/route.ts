import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/call-settings
 * Get organization call settings
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
      .from("organization_call_settings")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .single();

    if (!settings) {
      // Return defaults - COST OPTIMIZED: recording OFF by default
      return NextResponse.json({
        recording_enabled: false,
        recording_retention_days: 1,
        recording_retention_hours: 24,
        record_after_seconds: 30,
        voicemail_transcription_enabled: false,
        max_call_duration_sdr_seconds: 1200,
        max_call_duration_activator_seconds: 2700,
        default_ring_timeout: 30,
        default_voicemail_message:
          "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.",
      });
    }

    return NextResponse.json({
      recording_enabled: settings.recording_enabled ?? false,
      recording_retention_days: settings.recording_retention_days ?? 1,
      recording_retention_hours: settings.recording_retention_hours ?? 24,
      record_after_seconds: settings.record_after_seconds ?? 30,
      voicemail_transcription_enabled: settings.voicemail_transcription_enabled ?? false,
      max_call_duration_sdr_seconds: settings.max_call_duration_sdr_seconds ?? 1200,
      max_call_duration_activator_seconds: settings.max_call_duration_activator_seconds ?? 2700,
      default_ring_timeout: settings.default_ring_timeout ?? 30,
      default_voicemail_message: settings.default_voicemail_message ?? "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.",
    });
  } catch (error: any) {
    console.error("Error getting call settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/call-settings
 * Update organization call settings
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
      .from("organization_call_settings")
      .upsert(
        {
          organization_id: profile.organization_id,
          recording_enabled: body.recording_enabled ?? false,
          recording_retention_days: body.recording_retention_days ?? 1,
          recording_retention_hours: body.recording_retention_hours ?? 24,
          record_after_seconds: body.record_after_seconds ?? 30,
          voicemail_transcription_enabled: body.voicemail_transcription_enabled ?? false,
          max_call_duration_sdr_seconds: body.max_call_duration_sdr_seconds ?? 1200,
          max_call_duration_activator_seconds: body.max_call_duration_activator_seconds ?? 2700,
          default_ring_timeout: body.default_ring_timeout ?? 30,
          default_voicemail_message: body.default_voicemail_message,
        },
        {
          onConflict: "organization_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating call settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error updating call settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

