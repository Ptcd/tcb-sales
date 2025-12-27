import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/call-forwarding
 * Get user's call forwarding settings
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

    // Get user's profile with call forwarding settings
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("forwarding_phone, call_status, voicemail_message")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Error fetching call forwarding settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: {
        forwarding_phone: profile.forwarding_phone,
        call_status: profile.call_status || "available",
        voicemail_message: profile.voicemail_message || "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.",
      },
    });
  } catch (error) {
    console.error("Error in GET /api/settings/call-forwarding:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/call-forwarding
 * Update user's call forwarding settings
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

    const { forwarding_phone, call_status, voicemail_message } = await request.json();

    // Validate call_status
    if (call_status && !["available", "unavailable"].includes(call_status)) {
      return NextResponse.json(
        { error: "Invalid call status" },
        { status: 400 }
      );
    }

    // Validate phone number format if provided
    if (forwarding_phone && forwarding_phone.trim() !== "") {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      const cleanedPhone = forwarding_phone.replace(/[\s()-]/g, "");
      if (!phoneRegex.test(cleanedPhone)) {
        return NextResponse.json(
          { error: "Invalid phone number format. Use international format (e.g., +1234567890)" },
          { status: 400 }
        );
      }
    }

    // Update user profile
    const updateData: any = {};
    if (forwarding_phone !== undefined) updateData.forwarding_phone = forwarding_phone.trim() || null;
    if (call_status !== undefined) updateData.call_status = call_status;
    if (voicemail_message !== undefined) updateData.voicemail_message = voicemail_message.trim();

    const { error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("id", user.id);

    if (error) {
      console.error("Error updating call forwarding settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Call forwarding settings updated successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/settings/call-forwarding:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

