import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceRoleClient } from "@/lib/supabase/server";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /api/twilio/voice
 * TwiML webhook - Twilio calls this when a call is initiated
 * This tells Twilio what to do with the call
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const callSid = body.get("CallSid") as string;
    const callStatus = body.get("CallStatus") as string;
    
    console.log(`Voice webhook called - CallSid: ${callSid}, Status: ${callStatus}`);

    const twiml = new VoiceResponse();

    // Get parameters from query
    const url = new URL(request.url);
    const leadPhone = url.searchParams.get("leadPhone");
    const userPhone = url.searchParams.get("userPhone");
    const leadName = url.searchParams.get("leadName");
    const callMode = url.searchParams.get("callMode") || "voicemail";
    const voicemailMessage = url.searchParams.get("voicemailMessage");

    console.log("Webhook params:", { leadPhone, userPhone, leadName, callMode });

    if (!leadPhone) {
      console.error("No leadPhone provided in webhook");
      twiml.say("Error: No destination number provided.");
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Check if this is a WebRTC call (from browser)
    const webrtcIdentity = url.searchParams.get("webrtcIdentity");
    const isWebRTC = !!webrtcIdentity;

    if (isWebRTC && leadPhone) {
      // WebRTC outbound call from browser - connect directly to lead
      console.log("WebRTC call mode - connecting to lead:", leadPhone);
      
      const fromNumber = url.searchParams.get("fromNumber") || body.get("From") as string;
      
      // Get org settings for recording
      const supabase = createServiceRoleClient();
      const { data: orgSettings } = await supabase
        .from("organization_call_settings")
        .select("recording_enabled")
        .eq("organization_id", url.searchParams.get("organizationId") || "")
        .single();
      
      const shouldRecord = orgSettings?.recording_enabled !== false;
      
      const dial = twiml.dial({
        callerId: fromNumber,
        timeout: 30,
        answerOnBridge: true,
        ...(shouldRecord ? { record: "record-from-answer" as const } : {}),
      });
      
      dial.number(leadPhone);
      
      console.log("TwiML generated for WebRTC call");
    } else if (callMode === "live" && userPhone && leadPhone) {
      // Live call mode - AGENT ANSWERS FIRST, then we dial the LEAD
      // This webhook fires when the agent answers their phone
      console.log("Live call mode - agent answered, now dialing lead:", leadPhone);
      
      // Get the Twilio number and caller ID
      const fromNumber = url.searchParams.get("fromNumber") || body.get("From") as string;
      console.log("Using Twilio number as caller ID:", fromNumber);
      
      // Tell the agent we're connecting them to the lead
      twiml.say(
        {
          voice: "alice",
          language: "en-US",
        },
        `Connecting you to ${leadName || "your lead"}. Please hold.`
      );
      
      // Now dial the LEAD and bridge the call
      const dial = twiml.dial({
        callerId: fromNumber, // Show Twilio number to lead
        timeout: 30,
        record: "record-from-answer",
        answerOnBridge: true, // Only connect when lead answers
      });
      
      dial.number(leadPhone);
      
      console.log("TwiML generated for live call (agent-first flow)");
    } else {
      // Voicemail drop mode - Play message to lead when they answer
      // First, say the message
      if (voicemailMessage) {
        twiml.say(voicemailMessage);
      } else if (leadName) {
        twiml.say(`Hi, this is a message for ${leadName}. We'd like to discuss a potential business opportunity. Please call us back at your earliest convenience. Thank you!`);
      } else {
        twiml.say("Hello! We'd like to discuss a potential business opportunity. Please call us back. Thank you!");
      }
      
      // Then hang up
      twiml.hangup();
    }

    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Error in voice webhook:", error);
    
    const twiml = new VoiceResponse();
    twiml.say("An error occurred. Please try again.");
    
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }
}

/**
 * GET /api/twilio/voice
 * Health check for voice webhook
 */
export async function GET() {
  return NextResponse.json({
    message: "Twilio Voice webhook endpoint",
    status: "active",
  });
}

