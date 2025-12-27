import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildPhoneOrFilter, generatePhoneCandidates } from "@/lib/phoneUtils";
import twilio from "twilio";
import { recordPerformanceEvent } from "@/lib/governance/record-event";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilioAccountSid && twilioAuthToken ? twilio(twilioAccountSid, twilioAuthToken) : null;

/**
 * POST /api/twilio/voice/status
 * Callback from Twilio with call status updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const url = new URL(request.url);
    
    // Get all possible parameter variations from Twilio
    const callSid = url.searchParams.get("callSid") || (body.get("CallSid") as string);
    const callStatus = body.get("CallStatus") as string;
    const dialCallStatus = body.get("DialCallStatus") as string;
    const callDuration = body.get("CallDuration") as string;
    const dialCallDuration = body.get("DialCallDuration") as string;
    const recordingUrl = body.get("RecordingUrl") as string;
    const fromNumber = (body.get("From") as string) || "";
    const toNumber = (body.get("To") as string) || "";

    console.log("Call status callback received:", {
      callSid,
      callStatus,
      dialCallStatus,
      callDuration,
      dialCallDuration,
      recordingUrl,
      allParams: Array.from(body.entries()),
    });

    if (!callSid) {
      console.error("No CallSid provided in webhook");
      return NextResponse.json({ error: "No CallSid provided" }, { status: 400 });
    }

    // Use service role key to bypass RLS for webhooks (no user authentication)
    const supabase = createServiceRoleClient();

    // Use either DialCallStatus or CallStatus
    const statusToUse = dialCallStatus || callStatus;
    const durationToUse = dialCallDuration || callDuration;

    // Map Twilio status to our status
    let status = statusToUse?.toLowerCase() || "completed";
    if (status === "completed") status = "answered";
    if (status === "no-answer") status = "no_answer";

    // Update call record
    const nowIso = new Date().toISOString();
    const updateData: any = {
      status,
      updated_at: nowIso,
    };

    if (durationToUse) {
      const duration = parseInt(durationToUse, 10);
      updateData.duration = duration;
      updateData.ended_at = nowIso;
      if (status === "answered" || duration > 0) {
        updateData.answered_at = nowIso;
      }
      console.log(`Updating call ${callSid} with duration: ${duration}s, status: ${status}`);
    }

    if (recordingUrl) {
      updateData.recording_url = recordingUrl;
    }

    // First check if the call exists - with retry for race condition
    let existingCall = null;
    let fetchError = null;
    
    // Retry up to 3 times with 500ms delay to handle race condition
    // where Twilio callback arrives before DB insert completes
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("calls")
        .select("id, status, twilio_call_sid, lead_id, organization_id, phone_number")
        .eq("twilio_call_sid", callSid)
        .single();
      
      existingCall = data;
      fetchError = error;
      
      if (existingCall) {
        break; // Found it
      }
      
      // Also check for pending calls that will be updated with this SID
      // (In case DB write is still in progress)
      if (attempt < 2) {
        console.log(`Call ${callSid} not found, retry ${attempt + 1}/3...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (fetchError || !existingCall) {
      console.warn(`Call not found in database for SID ${callSid} after retries, attempting to create from Twilio API`);
      
      // Try to create call record from Twilio API (fallback)
      if (twilioClient) {
        try {
          const twilioCall = await twilioClient.calls(callSid).fetch();
          
          // Find organization from the "To" number
          const { data: twilioNumber } = await supabase
            .from("twilio_phone_numbers")
            .select("organization_id, assigned_user_id, campaign_id")
            .eq("phone_number", twilioCall.to)
            .single();

          if (twilioNumber?.organization_id) {
            // Try to find lead by caller's phone number
            const { data: leads } = await supabase
              .from("search_results")
              .select("id, organization_id")
              .eq("organization_id", twilioNumber.organization_id)
              .or(`phone.eq.${twilioCall.from},phone.ilike.%${twilioCall.from.replace(/\D/g, "")}%`)
              .limit(1)
              .single();

            // Create the call record
            const { data: newCall, error: insertError } = await supabase
              .from("calls")
              .insert({
                lead_id: leads?.id || null,
                user_id: twilioNumber.assigned_user_id || null,
                organization_id: twilioNumber.organization_id,
                campaign_id: twilioNumber.campaign_id || null,
                phone_number: twilioCall.from,
                twilio_call_sid: callSid,
                call_type: "inbound",
                direction: "inbound",
                status: "initiated",
                initiated_at: twilioCall.dateCreated?.toISOString() || new Date().toISOString(),
              })
              .select()
              .single();

            if (insertError || !newCall) {
              console.error("Failed to create call record from Twilio API:", insertError);
              return NextResponse.json({ 
                error: "Call not found and could not be created",
                callSid,
                details: insertError?.message || fetchError?.message 
              }, { status: 404 });
            }
            
            console.log(`Created call record from Twilio API: ${newCall.id}`);
            // Continue with update using the newly created call
            const { error: updateError } = await supabase
              .from("calls")
              .update(updateData)
              .eq("id", newCall.id);

            if (updateError) {
              console.error("Error updating newly created call:", updateError);
              return NextResponse.json({ 
                error: "Database update failed",
                details: updateError.message 
              }, { status: 500 });
            }

            return NextResponse.json({ success: true, created: true });
          }
        } catch (twilioError: any) {
          console.error("Error fetching call from Twilio API:", twilioError);
        }
      }
      
      console.error(`Call not found in database for SID ${callSid}:`, fetchError);
      return NextResponse.json({ 
        error: "Call not found",
        callSid,
        details: fetchError?.message 
      }, { status: 404 });
    }

    console.log(`Found call in database: ID=${existingCall.id}, CurrentStatus=${existingCall.status}`);

    const { data: updatedCalls, error: updateError } = await supabase
      .from("calls")
      .update(updateData)
      .eq("twilio_call_sid", callSid)
      .select("id, lead_id, initiated_at, answered_at, duration, organization_id, phone_number, user_id, campaign_id");

    if (updateError) {
      console.error("Error updating call in database:", updateError);
      return NextResponse.json({ 
        error: "Database update failed",
        details: updateError.message 
      }, { status: 500 });
    } else {
      console.log(`Successfully updated call ${callSid} with:`, updateData);
    }

    // COST CONTROL: Conditional recording - only start after threshold
    const recordingEnabled = url.searchParams.get("recordingEnabled") === "1";
    const recordAfterSeconds = parseInt(url.searchParams.get("recordAfterSeconds") || "30");
    const callId = url.searchParams.get("callId");

    // Only trigger recording logic when call becomes in-progress (answered)
    if (twilioClient && recordingEnabled && (statusToUse === "in-progress" || statusToUse === "answered")) {
      console.log(`[COST_CONTROL] Call ${callSid} answered, will start recording after ${recordAfterSeconds}s`);
      
      // Start recording after threshold (non-blocking)
      setTimeout(async () => {
        try {
          // Check if call is still active before starting recording
          const twilioCall = await twilioClient.calls(callSid).fetch();
          if (twilioCall.status === "in-progress") {
            await twilioClient.calls(callSid).recordings.create({
              recordingChannels: "dual",
            });
            console.log(`[RECORDING_STARTED] Call ${callSid} recording started after ${recordAfterSeconds}s threshold`);
          } else {
            console.log(`[RECORDING_SKIPPED_SHORT_CALL] Call ${callSid} ended before ${recordAfterSeconds}s threshold (status: ${twilioCall.status})`);
          }
        } catch (err: any) {
          // Call likely ended before threshold - this is expected and saves money!
          console.log(`[RECORDING_SKIPPED] Call ${callSid} - ${err.message}`);
        }
      }, recordAfterSeconds * 1000);
    }

    // COST CONTROL: Max duration enforcement
    const updatedCall = updatedCalls?.[0];
    if (twilioClient && updatedCall && (statusToUse === "in-progress" || statusToUse === "answered")) {
      // Get user role to determine max duration
      const { data: userProfile } = await supabase
        .from("user_profiles")
        .select("role, is_activator")
        .eq("id", updatedCall.user_id)
        .single();

      // Get org settings for max duration
      const { data: orgSettings } = await supabase
        .from("organization_call_settings")
        .select("max_call_duration_sdr_seconds, max_call_duration_activator_seconds")
        .eq("organization_id", updatedCall.organization_id)
        .single();

      const isActivator = userProfile?.is_activator || userProfile?.role === "activator";
      const maxDurationSeconds = isActivator
        ? (orgSettings?.max_call_duration_activator_seconds || 2700) // 45 min default
        : (orgSettings?.max_call_duration_sdr_seconds || 1200); // 20 min default

      console.log(`[COST_CONTROL] Call ${callSid} max duration: ${maxDurationSeconds}s (isActivator: ${isActivator})`);

      // Schedule auto-termination at max duration
      setTimeout(async () => {
        try {
          const twilioCall = await twilioClient.calls(callSid).fetch();
          if (twilioCall.status === "in-progress") {
            // Terminate the call
            await twilioClient.calls(callSid).update({ status: "completed" });
            
            // Log the termination
            await supabase.from("calls").update({
              outcome_code: "MAX_DURATION_REACHED",
              notes: `Call auto-terminated at ${Math.round(maxDurationSeconds / 60)} minute limit to control costs`,
            }).eq("twilio_call_sid", callSid);
            
            console.log(`[MAX_DURATION_REACHED] Call ${callSid} terminated at ${maxDurationSeconds}s limit`);
          }
        } catch (err: any) {
          // Call already ended, which is fine
          console.log(`[MAX_DURATION_CHECK] Call ${callSid} already ended - ${err.message}`);
        }
      }, maxDurationSeconds * 1000);
    }

    // Update lead call stats for recency/duration if we have lead_id
    // Note: updatedCall is already declared above in max duration section
    const updatedCallForLead = updatedCalls?.[0];

    // If we still don't have a lead_id, try to find the lead by phone number now
    if (updatedCallForLead && !updatedCallForLead.lead_id) {
      const phoneCandidates = generatePhoneCandidates(updatedCallForLead.phone_number || fromNumber);
      if (phoneCandidates.length > 0 && updatedCallForLead.organization_id) {
        const orFilter = buildPhoneOrFilter(phoneCandidates);
        const { data: foundLead, error: leadErr } = await supabase
          .from("search_results")
          .select("id")
          .eq("organization_id", updatedCallForLead.organization_id)
          .or(orFilter)
          .limit(1)
          .single();

        if (leadErr) {
          console.error("Status callback lead lookup error:", leadErr);
        } else if (foundLead?.id) {
          console.log(`Status callback associated call ${updatedCallForLead.id} with lead ${foundLead.id}`);
          await supabase
            .from("calls")
            .update({ lead_id: foundLead.id })
            .eq("id", updatedCallForLead.id);
          updatedCallForLead.lead_id = foundLead.id;
        }
      } else {
        console.warn("Status callback: cannot look up lead (missing org or phone)");
      }
    }

    // Update lead call stats for recency/duration if we have lead_id
    // Use updatedCall from max duration section if available, otherwise use updatedCallForLead
    const finalUpdatedCall = updatedCall || updatedCallForLead;
    if (finalUpdatedCall?.lead_id) {
      await supabase
        .from("search_results")
        .update({
          last_call_made_at: updateData.ended_at || updateData.updated_at || nowIso,
        })
        .eq("id", finalUpdatedCall.lead_id);
      // Note: call_count/total_call_duration are maintained by triggers on insert;
      // here we ensure last_call_made_at stays fresh on status updates.
    }

    // CAPITAL GOVERNANCE: Record performance events when call completes
    if (finalUpdatedCall && durationToUse && (statusToUse === "completed" || statusToUse === "answered")) {
      const callDuration = parseInt(durationToUse, 10);
      const campaignId = finalUpdatedCall.campaign_id || null;
      
      if (campaignId) {
        // Get call outcome from calls table
        const { data: callWithOutcome } = await supabase
          .from("calls")
          .select("outcome, outcome_code")
          .eq("id", finalUpdatedCall.id)
          .single();
        
        const outcome = callWithOutcome?.outcome || callWithOutcome?.outcome_code || "";
        
        // Record conversation if > 10 seconds
        if (callDuration > 10) {
          await recordPerformanceEvent({
            campaignId,
            eventType: 'conversation',
            leadId: finalUpdatedCall.lead_id,
            userId: finalUpdatedCall.user_id,
            metadata: { 
              duration_seconds: callDuration,
              call_id: finalUpdatedCall.id,
            },
            eventTimestamp: finalUpdatedCall.answered_at || finalUpdatedCall.initiated_at || nowIso,
          });
        }

        // Record QPC if >= 150 seconds AND outcome is Schedule/Info/Callback
        const qpcOutcomes = ['ONBOARDING_SCHEDULED', 'INTERESTED_INFO_SENT', 'CALLBACK'];
        if (callDuration >= 150 && qpcOutcomes.includes(outcome)) {
          await recordPerformanceEvent({
            campaignId,
            eventType: 'qpc',
            leadId: finalUpdatedCall.lead_id,
            userId: finalUpdatedCall.user_id,
            metadata: { 
              duration_seconds: callDuration, 
              outcome,
              call_id: finalUpdatedCall.id,
            },
            eventTimestamp: finalUpdatedCall.answered_at || finalUpdatedCall.initiated_at || nowIso,
          });
        }
      }
    }

    // CAPITAL GOVERNANCE: Delete recording if duration < 150s
    // Note: Recording SID comes from recording callback, but we can check here if we have it
    if (finalUpdatedCall && durationToUse && twilioClient) {
      const callDuration = parseInt(durationToUse, 10);
      if (callDuration < 150) {
        // Try to get recording SID from calls table (set by recording callback)
        const { data: callWithRecording } = await supabase
          .from("calls")
          .select("twilio_recording_sid")
          .eq("id", finalUpdatedCall.id)
          .single();
        
        if (callWithRecording?.twilio_recording_sid) {
          try {
            await twilioClient.recordings(callWithRecording.twilio_recording_sid).remove();
            console.log(`[GOVERNANCE] Deleted recording ${callWithRecording.twilio_recording_sid} (duration: ${callDuration}s < 150s)`);
            
            // Update call record to remove recording reference
            await supabase
              .from("calls")
              .update({ 
                twilio_recording_sid: null,
                recording_url: null,
              })
              .eq("id", finalUpdatedCall.id);
          } catch (err: any) {
            console.error(`[GOVERNANCE] Failed to delete recording ${callWithRecording.twilio_recording_sid}:`, err.message);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in call status callback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/twilio/voice/status
 * Health check
 */
export async function GET() {
  return NextResponse.json({
    message: "Twilio Voice status callback endpoint",
    status: "active",
  });
}

