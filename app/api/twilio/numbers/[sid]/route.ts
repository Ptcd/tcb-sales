import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("Twilio credentials not configured");
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

// DELETE - Release a phone number
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sid: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!client) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    const { sid } = await params;

    // Release the phone number
    await client.incomingPhoneNumbers(sid).remove();

    return NextResponse.json({
      success: true,
      message: "Phone number released successfully",
    });
  } catch (error: any) {
    console.error("Error releasing phone number:", error);
    return NextResponse.json(
      { error: error.message || "Failed to release phone number" },
      { status: 500 }
    );
  }
}

// PATCH - Update phone number settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sid: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!client) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    const { sid } = await params;
    const { friendlyName } = await request.json();

    // Update the phone number
    const updatedNumber = await client.incomingPhoneNumbers(sid).update({
      friendlyName,
    });

    return NextResponse.json({
      success: true,
      number: {
        sid: updatedNumber.sid,
        phoneNumber: updatedNumber.phoneNumber,
        friendlyName: updatedNumber.friendlyName,
      },
    });
  } catch (error: any) {
    console.error("Error updating phone number:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update phone number" },
      { status: 500 }
    );
  }
}

