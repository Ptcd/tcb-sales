import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /api/twilio/voice/inbound/next
 * Sequential dial handler for round-robin routing
 * Called when a dial attempt fails (no answer, busy, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = new URL(request.url);
    
    // Get call parameters
    const callSid = formData.get("CallSid") as string;
    const dialCallStatus = formData.get("DialCallStatus") as string;
    const dialCallDuration = formData.get("DialCallDuration") as string;
    
    // Get routing context from URL params
    const attempt = parseInt(url.searchParams.get("attempt") || "1");
    const campaignId = url.searchParams.get("campaignId") || "";
    const campaignMemberIdsStr = url.searchParams.get("campaignMemberIds") || "";
    const organizationId = url.searchParams.get("organizationId") || "";
    const leadId = url.searchParams.get("leadId") || "";
    const voicemailMessage = url.searchParams.get("voicemailMessage") || "";
    const userId = url.searchParams.get("userId") || "";
    
    console.log("Sequential dial handler:", {
      callSid,
      dialCallStatus,
      attempt,
      campaignId,
      campaignMemberIds: campaignMemberIdsStr,
    });

    // Use service role client
    const supabase = createServiceRoleClient();

    // Update call status if previous attempt completed
    if (dialCallStatus === "completed") {
      await supabase
        .from("calls")
        .update({
          status: "completed",
          duration: parseInt(dialCallDuration || "0"),
          ended_at: new Date().toISOString(),
        })
        .eq("twilio_call_sid", callSid);
      
      // Call was answered, we're done
      const twiml = new VoiceResponse();
      twiml.say({ voice: "alice" }, "Thank you for calling. Goodbye.");
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Update call status for failed attempt
    await supabase
      .from("calls")
      .update({
        status: dialCallStatus === "busy" ? "busy" : "no_answer",
        duration: parseInt(dialCallDuration || "0"),
      })
      .eq("twilio_call_sid", callSid);

    // Parse campaign member IDs
    const campaignMemberIds = campaignMemberIdsStr
      .split(",")
      .filter(id => id.trim() !== "");

    // Maximum 3 round-robin attempts (excluding the initial assigned user attempt)
    const maxRoundRobinAttempts = 3;
    const nextAttempt = attempt + 1;
    const roundRobinIndex = attempt - 1; // First round-robin attempt is index 0

    // Check if we should try round-robin
    if (campaignMemberIds.length > 0 && roundRobinIndex < maxRoundRobinAttempts && roundRobinIndex < campaignMemberIds.length) {
      const nextUserId = campaignMemberIds[roundRobinIndex];
      
      // Get next user's contact info
      const { data: nextUser } = await supabase
        .from("agent_availability")
        .select("user_id, webrtc_identity, is_logged_in, is_available")
        .eq("user_id", nextUserId)
        .single();

      if (nextUser && nextUser.is_logged_in && nextUser.is_available) {
        // Check if user is available using schedule function
        const { data: isAvailable } = await supabase.rpc("is_agent_available", {
          p_user_id: nextUserId,
        });

        if (isAvailable) {
          // Get forwarding phone or WebRTC
          const { data: userProfile } = await supabase
            .from("user_profiles")
            .select("forwarding_phone, full_name, email")
            .eq("id", nextUserId)
            .single();

          const forwardingPhone = userProfile?.forwarding_phone || null;
          const webrtcIdentity = nextUser.webrtc_identity;

          // Get lead name for announcement
          let leadName = "a caller";
          if (leadId) {
            const { data: lead } = await supabase
              .from("search_results")
              .select("name, phone")
              .eq("id", leadId)
              .single();
            leadName = lead?.name || lead?.phone || "a caller";
          }

          // Update call with new user
          await supabase
            .from("calls")
            .update({
              user_id: nextUserId,
            })
            .eq("twilio_call_sid", callSid);

          const twiml = new VoiceResponse();
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
          
          // Build next action URL
          const nextActionParams = new URLSearchParams({
            callSid: callSid,
            attempt: nextAttempt.toString(),
            campaignId: campaignId,
            campaignMemberIds: campaignMemberIds.join(","),
            organizationId: organizationId,
            leadId: leadId,
            voicemailMessage: voicemailMessage,
            userId: nextUserId,
          });

          // Get organization settings for recording
          let shouldRecordCalls = true;
          if (organizationId) {
            const { data: orgSettings } = await supabase
              .from("organization_call_settings")
              .select("recording_enabled")
              .eq("organization_id", organizationId)
              .single();
            shouldRecordCalls = orgSettings?.recording_enabled !== false;
          }

          if (webrtcIdentity && !forwardingPhone) {
            // Route to WebRTC client - NO announcement to caller

            // Get caller ID from form data or use default
            const callerId = formData.get("From") as string || formData.get("Caller") as string || "";
            
            const dial = twiml.dial({
              callerId: callerId,
              timeout: 10, // 10 seconds for round-robin attempts
              action: `${baseUrl}/api/twilio/voice/inbound/next?${nextActionParams.toString()}`,
              method: "POST",
              ...(shouldRecordCalls ? { record: "record-from-answer" as const } : {}),
              statusCallback: `${baseUrl}/api/twilio/voice/status?callSid=${callSid}`,
              statusCallbackEvent: ["completed", "answered", "no-answer", "busy", "failed"],
              statusCallbackMethod: "POST",
            } as any);

            // Connect silently to the agent (no whisper)
            dial.client(webrtcIdentity);
          } else if (forwardingPhone && forwardingPhone.trim() !== "") {
            // Forward to phone number - NO announcement to caller

            // Get caller ID from form data or use default
            const callerId = formData.get("From") as string || formData.get("Caller") as string || "";

            const dial = twiml.dial({
              callerId: callerId,
              timeout: 10, // 10 seconds for round-robin attempts
              action: `${baseUrl}/api/twilio/voice/inbound/next?${nextActionParams.toString()}`,
              method: "POST",
              ...(shouldRecordCalls ? { record: "record-from-answer" as const } : {}),
              statusCallback: `${baseUrl}/api/twilio/voice/status?callSid=${callSid}`,
              statusCallbackEvent: ["completed", "answered", "no-answer", "busy", "failed"],
              statusCallbackMethod: "POST",
            } as any);

            // Connect silently to the agent (no whisper)
            dial.number(forwardingPhone);
          } else {
            // No contact method, continue to next or voicemail
            return handleVoicemailOrNext(callSid, campaignMemberIds, roundRobinIndex, maxRoundRobinAttempts, voicemailMessage, userId, formData);
          }

          return new NextResponse(twiml.toString(), {
            status: 200,
            headers: { "Content-Type": "text/xml" },
          });
        }
      }
    }

    // No more round-robin attempts available, go to voicemail
    return handleVoicemailOrNext(callSid, campaignMemberIds, roundRobinIndex, maxRoundRobinAttempts, voicemailMessage, userId, formData);
  } catch (error) {
    console.error("Error in sequential dial handler:", error);
    
    const twiml = new VoiceResponse();
    twiml.say({ voice: "alice" }, "We're sorry, but we're experiencing technical difficulties. Please try again later.");
    
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}

/**
 * Helper function to handle voicemail or continue to next round-robin
 */
async function handleVoicemailOrNext(
  callSid: string,
  campaignMemberIds: string[],
  roundRobinIndex: number,
  maxRoundRobinAttempts: number,
  voicemailMessage: string,
  userId: string,
  formData: FormData
): Promise<NextResponse> {
  const twiml = new VoiceResponse();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  // Check if we should try one more round-robin attempt
  if (campaignMemberIds.length > 0 && roundRobinIndex < maxRoundRobinAttempts && roundRobinIndex < campaignMemberIds.length) {
    // This shouldn't happen, but just in case, fall through to voicemail
  }

  // Go to voicemail
  const finalVoicemailMessage = voicemailMessage || 
    "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.";

  const supportedFormats = [".wav", ".mp3", ".ogg", ".flac"];
  const isAudioUrl = finalVoicemailMessage.startsWith("http://") || finalVoicemailMessage.startsWith("https://");
  const audioSupported = isAudioUrl && supportedFormats.some((fmt) => finalVoicemailMessage.toLowerCase().endsWith(fmt));
  if (audioSupported) {
    twiml.play(finalVoicemailMessage);
  } else if (isAudioUrl) {
    // URL but unsupported format (e.g. webm) - use default TTS instead of reading the URL
    console.log("Voicemail greeting URL is unsupported format, using default TTS");
    twiml.say({ voice: "alice" }, "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.");
  } else {
    // Speak the custom text message
    twiml.say({ voice: "alice" }, finalVoicemailMessage);
  }
  
  const recordingParams = new URLSearchParams({
    userId: userId || "",
    callSid: callSid,
  });
  
  // COST CONTROL: Transcription disabled by default to save $0.05/voicemail
  // TODO: Could add org settings lookup here if needed, but default OFF is safest
  const transcriptionEnabled = false;
  
  twiml.record({
    maxLength: 120, // 2 minutes max
    transcribe: transcriptionEnabled,
    ...(transcriptionEnabled ? { transcribeCallback: `${baseUrl}/api/twilio/voice/transcribe?${recordingParams.toString()}` } : {}),
    action: `${baseUrl}/api/twilio/voice/recording?${recordingParams.toString()}`,
    method: "POST",
  });

  twiml.say({ voice: "alice" }, "Thank you. Goodbye.");

  return new NextResponse(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

