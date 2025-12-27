import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * POST /api/twilio/numbers/fix-webhooks
 * One-time fix to update specific phone numbers with correct webhook URLs
 * Only updates: 813 area code numbers and +12624390154
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!client) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.mkeautosalvage.com";
    const voiceUrl = `${baseUrl}/api/twilio/voice/inbound`;
    const smsUrl = `${baseUrl}/api/twilio/sms`;

    // Get all numbers from Twilio
    const allNumbers = await client.incomingPhoneNumbers.list();

    // Filter to only the specific numbers we want to fix:
    // - 813 area code numbers
    // - +12624390154
    const numbersToFix = allNumbers.filter((number) => {
      const phoneNumber = number.phoneNumber;
      return (
        phoneNumber.startsWith("+1813") || // 813 area code
        phoneNumber === "+12624390154"
      );
    });

    const results: { phoneNumber: string; status: string; error?: string }[] = [];

    for (const number of numbersToFix) {
      try {
        // Update the number's webhook URLs
        await client.incomingPhoneNumbers(number.sid).update({
          voiceUrl: voiceUrl,
          voiceMethod: "POST",
          smsUrl: smsUrl,
          smsMethod: "POST",
        });

        results.push({
          phoneNumber: number.phoneNumber,
          status: "updated",
        });

        console.log(`Updated webhook URLs for ${number.phoneNumber}`);
      } catch (updateError: any) {
        results.push({
          phoneNumber: number.phoneNumber,
          status: "failed",
          error: updateError.message,
        });

        console.error(`Failed to update ${number.phoneNumber}:`, updateError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Updated ${results.filter(r => r.status === "updated").length} of ${numbersToFix.length} numbers`,
      voiceUrl,
      smsUrl,
      results,
    });
  } catch (error: any) {
    console.error("Error fixing webhook URLs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fix webhook URLs" },
      { status: 500 }
    );
  }
}

