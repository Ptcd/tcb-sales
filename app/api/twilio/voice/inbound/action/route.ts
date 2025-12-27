import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /api/twilio/voice/inbound/action
 * Called after dial attempt completes (answered, busy, no-answer, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const callSid = formData.get("CallSid") as string;
    const dialCallStatus = formData.get("DialCallStatus") as string;
    const dialCallDuration = formData.get("DialCallDuration") as string;
    
    console.log("Dial action callback:", {
      callSid,
      dialCallStatus,
      dialCallDuration,
    });

    // Use service role client
    const supabase = createServiceRoleClient();

    // Update call status in database
    await supabase
      .from("calls")
      .update({
        status: dialCallStatus === "completed" ? "completed" : "no_answer",
        duration: parseInt(dialCallDuration || "0"),
        ended_at: new Date().toISOString(),
      })
      .eq("twilio_call_sid", callSid);

    const twiml = new VoiceResponse();

    // If call wasn't answered, offer voicemail
    if (dialCallStatus !== "completed") {
      twiml.say(
        { voice: "alice" },
        "We're sorry, but no one is available to take your call. Please leave a message after the beep."
      );
      
      // COST CONTROL: Transcription disabled by default to save $0.05/voicemail
      const transcriptionEnabled = false;
      
      twiml.record({
        maxLength: 120,
        transcribe: transcriptionEnabled,
        ...(transcriptionEnabled ? { transcribeCallback: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/twilio/voice/transcribe` } : {}),
        action: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/twilio/voice/recording`,
        method: "POST",
      });

      twiml.say({ voice: "alice" }, "Thank you. Goodbye.");
    } else {
      // Call was completed successfully
      twiml.say({ voice: "alice" }, "Thank you for calling. Goodbye.");
    }

    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error in dial action callback:", error);
    
    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice" }, "Goodbye.");
    
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}

