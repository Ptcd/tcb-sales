import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/agents/status
 * Get current agent availability status
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

    // Get or create availability record
    let { data: availability } = await supabase
      .from("agent_availability")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!availability) {
      // Create default availability record
      const { data: newAvailability, error } = await supabase
        .from("agent_availability")
        .insert({
          user_id: user.id,
          organization_id: profile.organization_id,
          is_logged_in: false,
          is_available: true,
          webrtc_identity: `user_${user.id}`,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating availability:", error);
        return NextResponse.json(
          { error: "Failed to create availability record" },
          { status: 500 }
        );
      }

      availability = newAvailability;
    }

    return NextResponse.json({
      isLoggedIn: availability.is_logged_in,
      isAvailable: availability.is_available,
      webrtcIdentity: availability.webrtc_identity,
      lastSeenAt: availability.last_seen_at,
    });
  } catch (error: any) {
    console.error("Error getting agent status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents/status
 * Update agent availability status
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

    const { isLoggedIn, isAvailable, webrtcIdentity } = await request.json();

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

    // Update or create availability record
    const updateData: any = {
      last_seen_at: new Date().toISOString(),
    };

    if (typeof isLoggedIn === "boolean") {
      updateData.is_logged_in = isLoggedIn;
    }
    if (typeof isAvailable === "boolean") {
      updateData.is_available = isAvailable;
    }
    if (webrtcIdentity) {
      updateData.webrtc_identity = webrtcIdentity;
    }

    const { data: availability, error } = await supabase
      .from("agent_availability")
      .upsert(
        {
          user_id: user.id,
          organization_id: profile.organization_id,
          webrtc_identity: webrtcIdentity || `user_${user.id}`,
          ...updateData,
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating availability:", error);
      return NextResponse.json(
        { error: "Failed to update availability" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      availability: {
        isLoggedIn: availability.is_logged_in,
        isAvailable: availability.is_available,
        webrtcIdentity: availability.webrtc_identity,
        lastSeenAt: availability.last_seen_at,
      },
    });
  } catch (error: any) {
    console.error("Error updating agent status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

