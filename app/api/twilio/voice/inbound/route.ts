import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildPhoneOrFilter, generatePhoneCandidates } from "@/lib/phoneUtils";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * POST /api/twilio/voice/inbound
 * Handle incoming phone calls from Twilio
 * Enhanced routing: assigned user → round-robin campaign → voicemail
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    // Extract Twilio call parameters
    const callSid = formData.get("CallSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const callStatus = formData.get("CallStatus") as string;
    
    console.log("Inbound call received:", {
      callSid,
      from,
      to,
      callStatus,
    });

    // Use service role client to bypass RLS (webhooks don't have user auth)
    const supabase = createServiceRoleClient();

    // STEP 1: Look up the Twilio phone number to get assigned user and campaign
    // Normalize destination number to improve matching (E.164 and digits-only)
    const cleanTo = to.replace(/\D/g, "");
    let twilioNumber = null;
    const { data: twilioNumberExact } = await supabase
      .from("twilio_phone_numbers")
      .select("assigned_user_id, campaign_id, voicemail_greeting, ring_timeout_seconds, organization_id, phone_number")
      .eq("phone_number", to)
      .single();

    if (twilioNumberExact) {
      twilioNumber = twilioNumberExact;
    } else {
      // Try digits-only match and ilike fallback
      const { data: twilioNumberClean } = await supabase
        .from("twilio_phone_numbers")
        .select("assigned_user_id, campaign_id, voicemail_greeting, ring_timeout_seconds, organization_id, phone_number")
        .or(`phone_number.eq.${cleanTo},phone_number.ilike.%${cleanTo}%`)
        .limit(1)
        .single();
      if (twilioNumberClean) {
        twilioNumber = twilioNumberClean;
      }
    }

    const assignedUserId = twilioNumber?.assigned_user_id || null;
    const campaignId = twilioNumber?.campaign_id || null;
    const organizationId = twilioNumber?.organization_id || null;
    const customVoicemailGreeting = twilioNumber?.voicemail_greeting || null;
    const ringTimeout = twilioNumber?.ring_timeout_seconds || 20;

    // Try to find the lead by phone number (multiple variants)
    const phoneCandidates = generatePhoneCandidates(from);
    let lead = null;
    if (phoneCandidates.length > 0) {
      const orFilter = buildPhoneOrFilter(phoneCandidates);
      const { data: leads, error: leadErr } = await supabase
        .from("search_results")
        .select("id, name, phone, organization_id")
        .or(orFilter)
        .limit(1);

      if (leadErr) {
        console.error("Lead lookup error:", leadErr);
      }
      lead = leads && leads.length > 0 ? leads[0] : null;
      console.log("Lead lookup result:", { found: !!lead, leadId: lead?.id });
    }
    const leadName = lead?.name || from;
    
    // Prefer organization from phone number; fallback to lead
    let finalOrganizationId = organizationId || lead?.organization_id || null;

    // Get organization call settings
    let orgSettings: any = null;
    if (finalOrganizationId) {
      const { data: settings } = await supabase
        .from("organization_call_settings")
        .select("*")
        .eq("organization_id", finalOrganizationId)
        .single();
      orgSettings = settings;
    }

    // Default voicemail message
    let voicemailMessage: string = customVoicemailGreeting || 
      orgSettings?.default_voicemail_message || 
      "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.";

    // Supported audio formats for Twilio <Play>
    const supportedFormats = [".wav", ".mp3", ".ogg", ".flac"];
    const isSupportedAudioUrl = (url: string) =>
      supportedFormats.some((fmt) => url.toLowerCase().endsWith(fmt));

    // STEP 2: Try to route to assigned user first
    // Always try to dial the assigned user's forwarding phone if they have one
    // Don't require availability checks - just ring their phone
    let forwardingPhone: string | null = null;
    let webrtcIdentity: string | null = null;
    let userId: string | null = null;

    console.log("=== CALL ROUTING DEBUG ===");
    console.log("Assigned user ID:", assignedUserId);
    console.log("Organization ID:", organizationId);

    if (assignedUserId) {
      userId = assignedUserId;
      
      // Get user's forwarding phone - always try to ring it if set
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("forwarding_phone")
        .eq("id", assignedUserId)
        .single();
      
      forwardingPhone = userProfile?.forwarding_phone || null;
      console.log("Forwarding phone:", forwardingPhone ? "Found" : "Not set");

      // If no forwarding phone, check for WebRTC
      // SIMPLIFIED: Just check if user is logged in with a webrtc_identity
      // Don't require is_available or schedule checks - let Twilio handle timeout
      if (!forwardingPhone) {
        const { data: assignedUser } = await supabase
          .from("agent_availability")
          .select("user_id, webrtc_identity, is_logged_in")
          .eq("user_id", assignedUserId)
          .single();

        console.log("Agent availability check:", {
          found: !!assignedUser,
          is_logged_in: assignedUser?.is_logged_in,
          has_webrtc: !!assignedUser?.webrtc_identity,
        });

        // Simplified check: if logged in and has webrtc_identity, try to dial
        // Let Twilio handle the timeout if they don't answer
        if (assignedUser?.is_logged_in && assignedUser?.webrtc_identity) {
          webrtcIdentity = assignedUser.webrtc_identity;
          console.log("WebRTC routing enabled for:", webrtcIdentity);
        } else {
          console.log("WebRTC not available - user not logged in or no identity");
        }
      }
    }

    // STEP 3: If no assigned user or assigned user unavailable, try campaign round-robin
    // We'll handle this in the action callback, but prepare the list here
    let campaignMemberIds: string[] = [];
    if (!forwardingPhone && !webrtcIdentity && campaignId && finalOrganizationId) {
      // Get campaign members (excluding assigned user if they exist)
      const { data: campaignMembers } = await supabase
        .from("campaign_members")
        .select("user_id")
        .eq("campaign_id", campaignId);

      if (campaignMembers && campaignMembers.length > 0) {
        const allMemberIds = campaignMembers.map(cm => cm.user_id);
        // Filter out assigned user if they're in the campaign
        campaignMemberIds = assignedUserId && allMemberIds.includes(assignedUserId)
          ? allMemberIds.filter(id => id !== assignedUserId)
          : allMemberIds;

        // Get available campaign members
        if (campaignMemberIds.length > 0) {
          const { data: availableAgents } = await supabase
            .from("agent_availability")
            .select("user_id, webrtc_identity, is_logged_in, is_available")
            .eq("organization_id", finalOrganizationId)
            .in("user_id", campaignMemberIds)
            .eq("is_logged_in", true)
            .eq("is_available", true)
            .order("last_seen_at", { ascending: false })
            .limit(10);

          if (availableAgents && availableAgents.length > 0) {
            // Check each agent's schedule and find first available
            for (const agent of availableAgents) {
              const { data: isAvailable } = await supabase.rpc("is_agent_available", {
                p_user_id: agent.user_id,
              });

              if (isAvailable) {
                // Store for round-robin fallback
                campaignMemberIds = availableAgents.map(a => a.user_id);
                break;
              }
            }
          }
        }
      }
    }

    // Get campaign_id for the call if lead exists
    let finalCampaignId: string | null = campaignId;
    if (lead && finalOrganizationId && !finalCampaignId) {
      const { data: campaignLead } = await supabase
        .from("campaign_leads")
        .select("campaign_id")
        .eq("lead_id", lead.id)
        .limit(1)
        .single();
      
      finalCampaignId = campaignLead?.campaign_id || null;
    }

    // ALWAYS log the call to database (even if no lead/user found)
    // This ensures voicemails can be saved later
    console.log("Inserting call record...", {
      hasLead: !!lead,
      hasUserId: !!(userId || assignedUserId),
      hasOrgId: !!finalOrganizationId,
    });

    // Ensure we have an organization_id - critical for RLS
    if (!finalOrganizationId) {
      console.error("CRITICAL: No organization_id found - cannot insert call");
      // Try to get organization from any available source
      if (lead?.organization_id) {
        finalOrganizationId = lead.organization_id;
        console.log("Using organization_id from lead:", finalOrganizationId);
      } else if (twilioNumber?.organization_id) {
        finalOrganizationId = twilioNumber.organization_id;
        console.log("Using organization_id from Twilio number (fallback):", finalOrganizationId);
      } else if (userId || assignedUserId) {
        // Fallback: get organization from assigned user's profile
        const { data: userOrgProfile } = await supabase
          .from("user_profiles")
          .select("organization_id")
          .eq("id", userId || assignedUserId)
          .single();
        if (userOrgProfile?.organization_id) {
          finalOrganizationId = userOrgProfile.organization_id;
          console.log("Using organization_id from assigned user profile (fallback):", finalOrganizationId);
        }
      }

      if (!finalOrganizationId) {
        console.error("Cannot proceed without organization_id");
      }
    }

    // Insert call record ALWAYS (not conditional)
    // This is critical - the call record must exist for status callbacks and voicemails
    if (!finalOrganizationId) {
      console.error("CRITICAL: Cannot insert call without organization_id");
      console.error("Call details:", {
        callSid,
        from,
        to,
        hasLead: !!lead,
        hasUserId: !!(userId || assignedUserId),
        twilioNumberOrgId: organizationId,
        leadOrgId: lead?.organization_id,
      });
    }

    const nowIso = new Date().toISOString();
    const { data: insertedCall, error: insertError } = await supabase.from("calls").insert({
      lead_id: lead?.id || null,
      user_id: userId || assignedUserId || null,
      organization_id: finalOrganizationId || null, // Will fail if null, but we log it
      campaign_id: finalCampaignId || null,
      phone_number: from,
      twilio_call_sid: callSid,
      call_type: "inbound",
      direction: "inbound",
      status: "initiated",
      initiated_at: nowIso,
    }).select();

    if (insertError) {
      console.error("CRITICAL: Failed to insert call to database:", insertError);
      console.error("Insert error details:", JSON.stringify(insertError, null, 2));
      console.error("Attempted insert data:", {
        lead_id: lead?.id || null,
        user_id: userId || assignedUserId || null,
        organization_id: finalOrganizationId,
        campaign_id: finalCampaignId || null,
        phone_number: from,
        twilio_call_sid: callSid,
      });
    } else {
      const callId = insertedCall?.[0]?.id;
      console.log("Successfully inserted call to database:", {
        callId,
        callSid,
        organizationId: finalOrganizationId,
        userId: userId || assignedUserId,
        leadId: lead?.id,
      });
    }

    // If we have a lead, immediately refresh its last_call_made_at for recency
    if (lead?.id && finalOrganizationId) {
      const { error: leadUpdateErr } = await supabase
        .from("search_results")
        .update({ last_call_made_at: nowIso })
        .eq("id", lead.id);
      if (leadUpdateErr) {
        console.error("Failed to update lead last_call_made_at on insert:", leadUpdateErr);
      } else {
        console.log("Updated lead last_call_made_at on insert:", { leadId: lead.id, time: nowIso });
      }
    }

    // Create TwiML response
    const twiml = new VoiceResponse();
    const shouldRecordCalls = orgSettings?.recording_enabled !== false;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!baseUrl) {
      console.error("Missing NEXT_PUBLIC_APP_URL; cannot build callback URLs");
      twiml.say(
        { voice: "alice" },
        "We are unable to take your call right now. Please try again later."
      );
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // If we still do not have an organization_id, fail fast with a friendly message
    if (!finalOrganizationId) {
      twiml.say(
        { voice: "alice" },
        "We cannot complete your call at the moment. Please try again later."
      );
      return new NextResponse(twiml.toString(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Build action URL with context for round-robin fallback
    const actionParams = new URLSearchParams({
      userId: userId || assignedUserId || "",
      callSid: callSid,
      attempt: "1", // First attempt (assigned user)
      campaignId: campaignId || "",
      campaignMemberIds: campaignMemberIds.join(","),
      organizationId: finalOrganizationId || "",
      leadId: lead?.id || "",
      voicemailMessage,
    });

    // Log routing decision
    console.log("Routing decision:", {
      hasWebRTC: !!webrtcIdentity,
      hasForwardingPhone: !!forwardingPhone,
      hasCampaignMembers: campaignMemberIds.length > 0,
    });

    if (webrtcIdentity && !forwardingPhone) {
      // Route to WebRTC client (browser) - assigned user
      console.log("Routing to WebRTC:", webrtcIdentity);
      // DON'T say anything to the caller - just ring their phone while we connect

      const dial = twiml.dial({
        callerId: from,
        timeout: ringTimeout,
        action: `${baseUrl}/api/twilio/voice/inbound/next?${actionParams.toString()}`,
        method: "POST",
        ...(shouldRecordCalls ? { record: "record-from-answer" as const } : {}),
        statusCallback: `${baseUrl}/api/twilio/voice/status?callSid=${callSid}`,
        statusCallbackEvent: ["completed", "answered", "no-answer", "busy", "failed"],
        statusCallbackMethod: "POST",
      } as any);

      // Connect silently to the agent (no whisper)
      dial.client(webrtcIdentity);
    } else if (forwardingPhone && forwardingPhone.trim() !== "") {
      console.log("Routing to forwarding phone:", forwardingPhone);
      // Forward the call to user's phone - assigned user
      // DON'T say anything to the caller - just ring their phone while we connect

      const dial = twiml.dial({
        callerId: from,
        timeout: ringTimeout,
        action: `${baseUrl}/api/twilio/voice/inbound/next?${actionParams.toString()}`,
        method: "POST",
        ...(shouldRecordCalls ? { record: "record-from-answer" as const } : {}),
        statusCallback: `${baseUrl}/api/twilio/voice/status?callSid=${callSid}`,
        statusCallbackEvent: ["completed", "answered", "no-answer", "busy", "failed"],
        statusCallbackMethod: "POST",
      } as any);

      // Connect silently to the agent (no whisper)
      dial.number(forwardingPhone);
    } else if (campaignMemberIds.length > 0) {
      // No assigned user available, go straight to round-robin
      console.log("Routing to campaign round-robin:", campaignMemberIds.length, "members");
      // This will be handled by the next handler
      const nextParams = new URLSearchParams({
        callSid: callSid,
        attempt: "1",
        campaignId: campaignId || "",
        campaignMemberIds: campaignMemberIds.join(","),
        organizationId: finalOrganizationId || "",
        leadId: lead?.id || "",
        voicemailMessage: encodeURIComponent(voicemailMessage),
      });
      
      // Redirect to next handler for round-robin
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${baseUrl}/api/twilio/voice/inbound/next?${nextParams.toString()}</Redirect></Response>`,
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    } else {
      // No routing options available, go directly to voicemail
      console.log("No routing options available - going to voicemail");
      
      // Check if voicemail greeting is a URL (audio file) or text
      const isAudioUrl = voicemailMessage.startsWith("http://") || voicemailMessage.startsWith("https://");
      const audioSupported = isAudioUrl && isSupportedAudioUrl(voicemailMessage);
      if (audioSupported) {
        twiml.play(voicemailMessage);
      } else if (isAudioUrl) {
        // URL but unsupported format (e.g. webm) - use default TTS instead of reading the URL
        console.log("Voicemail greeting URL is unsupported format, using default TTS");
        twiml.say({ voice: "alice" }, "Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.");
      } else {
        // Speak the custom text message
        twiml.say({ voice: "alice" }, voicemailMessage);
      }
      
      const recordingParams = new URLSearchParams({
        userId: assignedUserId || "",
        callSid: callSid,
      });
      
      // COST CONTROL: Only transcribe if enabled in org settings (default OFF)
      const transcriptionEnabled = orgSettings?.voicemail_transcription_enabled ?? false;
      
      twiml.record({
        maxLength: 120, // 2 minutes max
        transcribe: transcriptionEnabled,
        ...(transcriptionEnabled ? { transcribeCallback: `${baseUrl}/api/twilio/voice/transcribe?${recordingParams.toString()}` } : {}),
        action: `${baseUrl}/api/twilio/voice/recording?${recordingParams.toString()}`,
        method: "POST",
        recordingStatusCallback: `${baseUrl}/api/twilio/voice/status?callSid=${callSid}`,
        recordingStatusCallbackEvent: ["completed"],
        recordingStatusCallbackMethod: "POST",
      });
      
      if (!transcriptionEnabled) {
        console.log(`[TRANSCRIPTION_DISABLED] Voicemail for call ${callSid} will NOT be transcribed (org setting)`);
      }

      twiml.say({ voice: "alice" }, "Thank you. Goodbye.");
    }

    // Return TwiML response
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Error in inbound call webhook:", error);
    
    // Return error TwiML
    const twiml = new VoiceResponse();
    twiml.say(
      { voice: "alice" },
      "We're sorry, but we're experiencing technical difficulties. Please try again later."
    );
    
    return new NextResponse(twiml.toString(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}
