import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

/**
 * POST /api/calls/[id]/cancel
 * Cancel a stuck/pending call - updates status in DB and tries to cancel in Twilio
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const supabaseService = createServiceRoleClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

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

    // Get the call to verify ownership and get Twilio SID
    const { data: call, error: callError } = await supabaseService
      .from("calls")
      .select("id, user_id, organization_id, twilio_call_sid, status")
      .eq("id", id)
      .single();

    if (callError || !call) {
      // Call might not exist yet if the API request failed - just return success
      console.log(`Cancel request for call ${id} - call not found in DB`);
      return NextResponse.json({ success: true, message: "Call not found" });
    }

    // Verify ownership: user must own the call OR be an admin in the same org
    const isAdmin = profile.role === "admin";
    if (!isAdmin && call.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify organization match
    if (call.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Try to cancel in Twilio if we have a call SID
    if (call.twilio_call_sid && accountSid && authToken) {
      try {
        const twilioClient = twilio(accountSid, authToken);
        
        // Update call status to "canceled" in Twilio
        // This will stop the call if it's still in progress
        await twilioClient.calls(call.twilio_call_sid).update({
          status: "canceled",
        });
        
        console.log(`Cancelled Twilio call ${call.twilio_call_sid}`);
      } catch (twilioError: any) {
        // Log but don't fail - the call might already be completed/cancelled
        console.log(
          `Could not cancel Twilio call ${call.twilio_call_sid}: ${twilioError.message}`
        );
      }
    }

    // Update call status in database
    const { error: updateError } = await supabaseService
      .from("calls")
      .update({
        status: "cancelled",
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error(`Error updating call ${id} status:`, updateError);
      // Don't fail - the important thing is the UI can proceed
    }

    return NextResponse.json({
      success: true,
      message: "Call cancelled",
    });
  } catch (error: any) {
    console.error("Error cancelling call:", error);
    // Return success anyway - we don't want to block the UI
    return NextResponse.json({
      success: true,
      message: "Cancel request processed",
    });
  }
}


