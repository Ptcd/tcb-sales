import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * PUT /api/admin/users/[id]/phone-number
 * Assign a Twilio phone number to a user (admin only)
 * Now uses twilio_phone_numbers.assigned_user_id instead of user_profiles.phone_number
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can assign phone numbers" },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await params;
    const { phoneNumber, campaignId, voicemailGreeting, ringTimeoutSeconds } = await request.json();

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    // Verify target user is in the same organization
    const { data: targetUser } = await supabase
      .from("user_profiles")
      .select("id, organization_id")
      .eq("id", targetUserId)
      .single();

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (targetUser.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Cannot assign phone number to user in different organization" },
        { status: 403 }
      );
    }

    // Verify campaign is in same organization if provided
    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, organization_id")
        .eq("id", campaignId)
        .single();

      if (!campaign) {
        return NextResponse.json(
          { error: "Campaign not found" },
          { status: 404 }
        );
      }

      if (campaign.organization_id !== profile.organization_id) {
        return NextResponse.json(
          { error: "Cannot assign phone number to campaign in different organization" },
          { status: 403 }
        );
      }
    }

    // Use service role to bypass RLS
    const serviceSupabase = createServiceRoleClient();

    // Find the Twilio phone number in the database
    const { data: twilioNumber, error: findError } = await serviceSupabase
      .from("twilio_phone_numbers")
      .select("id, phone_number, organization_id")
      .eq("phone_number", phoneNumber.trim())
      .eq("organization_id", profile.organization_id)
      .single();

    if (findError || !twilioNumber) {
      return NextResponse.json(
        { error: "Twilio phone number not found in your organization" },
        { status: 404 }
      );
    }

    // Update the twilio_phone_numbers record with assigned user
    const updateData: any = {
      assigned_user_id: targetUserId,
    };

    if (campaignId !== undefined) {
      updateData.campaign_id = campaignId || null;
    }

    if (voicemailGreeting !== undefined) {
      updateData.voicemail_greeting = voicemailGreeting || null;
    }

    if (ringTimeoutSeconds !== undefined) {
      updateData.ring_timeout_seconds = ringTimeoutSeconds || 20;
    }

    const { error: updateError } = await serviceSupabase
      .from("twilio_phone_numbers")
      .update(updateData)
      .eq("id", twilioNumber.id);

    if (updateError) {
      console.error("Error updating phone number assignment:", updateError);
      return NextResponse.json(
        { error: "Failed to assign phone number" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Phone number assigned successfully",
    });
  } catch (error: any) {
    console.error("Error in PUT /api/admin/users/[id]/phone-number:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]/phone-number
 * Remove phone number assignment from a user (admin only)
 * Removes assigned_user_id from twilio_phone_numbers
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, organization_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can remove phone number assignments" },
        { status: 403 }
      );
    }

    const { id: targetUserId } = await params;
    const { phoneNumber } = await request.json().catch(() => ({}));

    // Use service role to bypass RLS
    const serviceSupabase = createServiceRoleClient();

    if (phoneNumber) {
      // Remove assignment from specific phone number
      const { error: updateError } = await serviceSupabase
        .from("twilio_phone_numbers")
        .update({ assigned_user_id: null })
        .eq("phone_number", phoneNumber)
        .eq("organization_id", profile.organization_id)
        .eq("assigned_user_id", targetUserId);

      if (updateError) {
        console.error("Error removing phone number assignment:", updateError);
        return NextResponse.json(
          { error: "Failed to remove phone number assignment" },
          { status: 500 }
        );
      }
    } else {
      // Remove assignment from all phone numbers for this user
      const { error: updateError } = await serviceSupabase
        .from("twilio_phone_numbers")
        .update({ assigned_user_id: null })
        .eq("assigned_user_id", targetUserId)
        .eq("organization_id", profile.organization_id);

      if (updateError) {
        console.error("Error removing phone number assignments:", updateError);
        return NextResponse.json(
          { error: "Failed to remove phone number assignments" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Phone number assignment removed successfully",
    });
  } catch (error: any) {
    console.error("Error in DELETE /api/admin/users/[id]/phone-number:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
