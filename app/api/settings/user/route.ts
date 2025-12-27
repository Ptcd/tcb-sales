import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/utils/userProfile";

type UserSettingsResponse = {
  userId: string;
  preferredOutboundNumber: string | null;
  rememberOutboundNumber: boolean;
  autoCallSingleNumber: boolean;
  preferredCallMode: "webrtc" | "live" | "voicemail" | null;
};

const mapSettings = (row: any, userId: string): UserSettingsResponse => ({
  userId,
  preferredOutboundNumber: row?.preferred_outbound_number ?? null,
  rememberOutboundNumber: row?.remember_outbound_number ?? false,
  autoCallSingleNumber: row?.auto_call_single_number ?? true,
  preferredCallMode: row?.preferred_call_mode ?? "webrtc",
});

/**
 * GET /api/settings/user
 * Fetch the current user's personal settings (creates defaults if missing)
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

    // Ensure profile exists (creates org if new)
    await ensureUserProfile(user.id, user.email ?? null);

    // Fetch or create user settings row
    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching user settings:", error);
      return NextResponse.json(
        { error: "Failed to load user settings" },
        { status: 500 }
      );
    }

    let settingsRow = settings;

    // Create a default row if none exists
    if (!settingsRow) {
      const { data: inserted, error: insertError } = await supabase
        .from("user_settings")
        .insert({
          user_id: user.id,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Error creating default user settings:", insertError);
        return NextResponse.json(
          { error: "Failed to initialize user settings" },
          { status: 500 }
        );
      }

      settingsRow = inserted;
    }

    return NextResponse.json({
      success: true,
      settings: mapSettings(settingsRow, user.id),
    });
  } catch (err) {
    console.error("Error in GET /api/settings/user:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/user
 * Update the current user's personal settings
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

    await ensureUserProfile(user.id, user.email ?? null);

    const payload = await request.json();
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if ("preferredOutboundNumber" in payload) {
      updates.preferred_outbound_number = payload.preferredOutboundNumber || null;
    }

    if ("rememberOutboundNumber" in payload) {
      updates.remember_outbound_number = !!payload.rememberOutboundNumber;
    }

    if ("autoCallSingleNumber" in payload) {
      updates.auto_call_single_number = !!payload.autoCallSingleNumber;
    }

  if ("preferredCallMode" in payload) {
    updates.preferred_call_mode = payload.preferredCallMode || null;
  }

    const { data: settings, error } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          ...updates,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    if (error || !settings) {
      console.error("Error updating user settings:", error);
      return NextResponse.json(
        { error: "Failed to update user settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: mapSettings(settings, user.id),
    });
  } catch (err) {
    console.error("Error in PUT /api/settings/user:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

