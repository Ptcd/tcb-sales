import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/voicemails/settings
 * Get voicemail greeting settings for user's assigned phone numbers
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

    // Get user's assigned phone numbers
    const { data: phoneNumbers } = await supabase
      .from("twilio_phone_numbers")
      .select("id, phone_number, voicemail_greeting")
      .eq("assigned_user_id", user.id);

    return NextResponse.json({
      phoneNumbers: phoneNumbers || [],
    });
  } catch (error: any) {
    console.error("Error fetching voicemail settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch voicemail settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/voicemails/settings
 * Update voicemail greeting for a phone number
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

    const { phoneNumberId, voicemailGreeting } = await request.json();

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "Phone number ID is required" },
        { status: 400 }
      );
    }

    // Verify the phone number is assigned to this user
    const { data: phoneNumber } = await supabase
      .from("twilio_phone_numbers")
      .select("id, assigned_user_id")
      .eq("id", phoneNumberId)
      .single();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number not found" },
        { status: 404 }
      );
    }

    if (phoneNumber.assigned_user_id !== user.id) {
      return NextResponse.json(
        { error: "Not authorized to update this phone number" },
        { status: 403 }
      );
    }

    // Update the voicemail greeting
    const serviceSupabase = createServiceRoleClient();
    const { error: updateError } = await serviceSupabase
      .from("twilio_phone_numbers")
      .update({
        voicemail_greeting: voicemailGreeting || null,
      })
      .eq("id", phoneNumberId);

    if (updateError) {
      console.error("Error updating voicemail greeting:", updateError);
      return NextResponse.json(
        { error: "Failed to update voicemail greeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Voicemail greeting updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating voicemail settings:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update voicemail settings" },
      { status: 500 }
    );
  }
}

