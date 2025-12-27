import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/voicemails/[id]/recording
 * Proxy Twilio recording with authentication
 */
export async function GET(
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

    const { id } = await params;

    // Get the voicemail recording URL from database
    const { data: call, error } = await supabase
      .from("calls")
      .select("recording_url, twilio_recording_sid")
      .eq("id", id)
      .single();

    if (error || !call?.recording_url) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    // Fetch the recording from Twilio with authentication
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    if (!twilioAccountSid || !twilioAuthToken) {
      return NextResponse.json(
        { error: "Twilio credentials not configured" },
        { status: 500 }
      );
    }

    // Create basic auth header
    const authHeader = `Basic ${Buffer.from(
      `${twilioAccountSid}:${twilioAuthToken}`
    ).toString("base64")}`;

    // Fetch the recording from Twilio
    const response = await fetch(call.recording_url, {
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch recording from Twilio:", response.statusText);
      return NextResponse.json(
        { error: "Failed to fetch recording" },
        { status: response.status }
      );
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer();

    // Return the audio with proper headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "private, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error in recording proxy API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

