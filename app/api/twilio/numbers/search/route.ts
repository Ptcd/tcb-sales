import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("Twilio credentials not configured");
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

// POST - Search available phone numbers
export async function POST(request: Request) {
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

    const { areaCode, country = "US", type = "local" } = await request.json();

    // Search for available phone numbers
    let numbers;
    if (type === "tollfree") {
      numbers = await client.availablePhoneNumbers(country).tollFree.list({
        limit: 20,
      });
    } else {
      numbers = await client.availablePhoneNumbers(country).local.list({
        areaCode: areaCode || undefined,
        limit: 20,
      });
    }

    const formattedNumbers = numbers.map((number) => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: number.capabilities,
      locality: number.locality,
      region: number.region,
      postalCode: number.postalCode,
    }));

    return NextResponse.json({ numbers: formattedNumbers });
  } catch (error: any) {
    console.error("Error searching phone numbers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search phone numbers" },
      { status: 500 }
    );
  }
}

