// Phone numbers API route - handles GET (list) and POST (purchase)
import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("Twilio credentials not configured");
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;
const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

// GET - List all phone numbers and sync to database
export async function GET() {
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

    // Get all phone numbers from Twilio
    const numbers = await client.incomingPhoneNumbers.list();

    const formattedNumbers = numbers.map((number) => ({
      sid: number.sid,
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      capabilities: number.capabilities,
      dateCreated: number.dateCreated,
      voiceUrl: number.voiceUrl,
      smsUrl: number.smsUrl,
    }));

    // Sync Twilio numbers to database (upsert)
    // Use service role to bypass RLS
    const serviceSupabase = createServiceRoleClient();
    
    for (const number of numbers) {
      const { error: upsertError } = await serviceSupabase
        .from("twilio_phone_numbers")
        .upsert(
          {
            sid: number.sid,
            phone_number: number.phoneNumber,
            friendly_name: number.friendlyName || number.phoneNumber,
            organization_id: profile.organization_id,
            capabilities: number.capabilities,
          },
          { 
            onConflict: "sid",
            ignoreDuplicates: false 
          }
        );

      if (upsertError) {
        console.error("Error syncing Twilio number to DB:", upsertError, number.phoneNumber);
      }
    }

    console.log(`Synced ${numbers.length} Twilio numbers to database for org ${profile.organization_id}`);

    return NextResponse.json({ numbers: formattedNumbers });
  } catch (error: any) {
    console.error("Error fetching phone numbers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch phone numbers" },
      { status: 500 }
    );
  }
}

// POST - Purchase a phone number
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

    const { phoneNumber, friendlyName } = await request.json();

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const voiceHandlerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/inbound`;
    const smsHandlerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/sms`;

    const purchasePayload: any = {
      phoneNumber,
      friendlyName: friendlyName || phoneNumber,
      smsUrl: smsHandlerUrl,
      smsMethod: "POST",
    };

    if (twimlAppSid) {
      purchasePayload.voiceApplicationSid = twimlAppSid;
      purchasePayload.voiceMethod = "POST";
    } else {
      purchasePayload.voiceUrl = voiceHandlerUrl;
      purchasePayload.voiceMethod = "POST";
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

    // Purchase the phone number
    const purchasedNumber = await client.incomingPhoneNumbers.create(
      purchasePayload
    );

    // Add purchased number to Messaging Service sender pool (A2P 10DLC compliance)
    if (messagingServiceSid) {
      try {
        await client.messaging.v1
          .services(messagingServiceSid)
          .phoneNumbers.create({ phoneNumberSid: purchasedNumber.sid });
      } catch (err) {
        console.error(
          "Failed to add number to Messaging Service sender pool",
          purchasedNumber.sid,
          err
        );
      }
    } else {
      console.warn("TWILIO_MESSAGING_SERVICE_SID not set; skipping sender pool add");
    }

    // Store in database with organization_id
    const { error: dbError } = await supabase
      .from("twilio_phone_numbers")
      .insert({
        sid: purchasedNumber.sid,
        phone_number: purchasedNumber.phoneNumber,
        friendly_name: purchasedNumber.friendlyName || phoneNumber,
        organization_id: profile.organization_id,
        capabilities: purchasedNumber.capabilities,
      });

    if (dbError) {
      console.error("Error saving Twilio number to DB:", dbError);
      // Don't fail the request, but log it
    }

    return NextResponse.json({
      success: true,
      number: {
        sid: purchasedNumber.sid,
        phoneNumber: purchasedNumber.phoneNumber,
        friendlyName: purchasedNumber.friendlyName,
      },
    });
  } catch (error: any) {
    console.error("Error purchasing phone number:", error);
    return NextResponse.json(
      { error: error.message || "Failed to purchase phone number" },
      { status: 500 }
    );
  }
}

