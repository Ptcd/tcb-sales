import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /api/twilio/voice/whisper
 * Plays a whisper message to the agent when they answer
 * This tells them who's calling before connecting
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const leadName = url.searchParams.get("leadName") || "Unknown caller";
    const from = url.searchParams.get("from") || "";

    const twiml = new VoiceResponse();
    
    // Quick whisper to the agent (2-3 seconds)
    twiml.say(
      { voice: "alice" },
      `Call from ${leadName}.`
    );

    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error in whisper endpoint:", error);
    
    // Return empty TwiML (just connect the call)
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

