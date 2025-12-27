import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";

/**
 * GET /api/twilio/voice/token
 * Generate a Twilio Access Token for WebRTC Voice SDK
 * This allows agents to make/receive calls directly from their browser
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
      .select("organization_id, id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Check for required Twilio credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
      console.error("Missing Twilio credentials:", {
        hasAccountSid: !!accountSid,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasTwimlAppSid: !!twimlAppSid,
      });
      return NextResponse.json(
        { error: "Twilio Voice SDK not configured. Please contact your administrator." },
        { status: 500 }
      );
    }

    // Create a unique identity for this user (using their user ID)
    const identity = `user_${user.id}`;

    // Create Access Token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create a voice grant
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true, // Allow incoming calls
    });

    // Create the token
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: identity,
      ttl: 3600, // Token expires in 1 hour
    });

    token.addGrant(voiceGrant);

    // Return the token and identity
    return NextResponse.json({
      token: token.toJwt(),
      identity: identity,
      expiresIn: 3600,
    });
  } catch (error: any) {
    console.error("Error generating Twilio token:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate access token" },
      { status: 500 }
    );
  }
}

