import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/utils/userProfile";

/**
 * GET /api/auth/profile
 * Get current user's profile information
 * Auto-creates profile if it doesn't exist
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
    
    // Fetch full profile to get is_activator
    const { data: fullProfile } = await supabase
      .from("user_profiles")
      .select("is_activator")
      .eq("id", user.id)
      .single();
    
    return NextResponse.json({
      success: true,
      role: profile?.role || "member",
      is_activator: (fullProfile as any)?.is_activator || false,
      profile: profile || null,
    });
  } catch (error) {
    console.error("Error in GET /api/auth/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/profile
 * Update current user's profile (e.g., sdr_code)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    // Handle sdr_code update
    if ("sdr_code" in body) {
      const newCode = body.sdr_code?.trim().toLowerCase() || null;
      
      // Validate: only alphanumeric and hyphens, 3-30 chars
      if (newCode && !/^[a-z0-9-]{3,30}$/.test(newCode)) {
        return NextResponse.json(
          { error: "SDR code must be 3-30 characters, lowercase letters, numbers, and hyphens only" },
          { status: 400 }
        );
      }
      
      // Check if code is already taken by another user
      if (newCode) {
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("sdr_code", newCode)
          .neq("id", user.id)
          .single();
        
        if (existing) {
          return NextResponse.json(
            { error: "This SDR code is already taken by another user" },
            { status: 409 }
          );
        }
      }
      
      updates.sdr_code = newCode;
    }

    // Handle full_name update
    if ("full_name" in body) {
      updates.full_name = body.full_name?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Error in PATCH /api/auth/profile:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

