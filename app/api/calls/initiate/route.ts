import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { Call } from "@/lib/types";
import twilio from "twilio";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { recordPerformanceEvent } from "@/lib/governance/record-event";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * POST /api/calls/initiate
 * Initiate a call to a lead using Twilio Voice
 */
export async function POST(request: NextRequest) {
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
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { leadId, phoneNumber, userPhone, callMode, voicemailMessage, twilioNumber, leadName } = await request.json();

    if (!leadId || !phoneNumber) {
      return NextResponse.json(
        { error: "Lead ID and phone number are required" },
        { status: 400 }
      );
    }

    // Get user's role for permission check
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = userProfile?.role === "admin";

    // Verify the lead exists and check permissions (use service role to bypass RLS)
    const serviceSupabase = createServiceRoleClient();
    
    console.log("[Call Initiate] Looking up lead:", { leadId, userOrgId: profile.organization_id });
    
    // Check if leadId is a UUID or a Place ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
    
    let lead;
    
    if (isUUID) {
      // Standard lookup by database ID
      const { data, error: leadError } = await serviceSupabase
        .from("search_results")
        .select("id, name, assigned_to, do_not_call, organization_id, assigned_campaign_id")
        .eq("id", leadId)
        .single();
      
      if (leadError) {
        console.error("[Call Initiate] Lead lookup error:", leadError);
        return NextResponse.json(
          { error: `Lead not found: ${leadError.message}` },
          { status: 404 }
        );
      }
      
      lead = data;
    } else {
      // leadId is a Place ID - find existing or create new lead
      const { data: existingLead } = await serviceSupabase
        .from("search_results")
        .select("id, name, assigned_to, do_not_call, organization_id, assigned_campaign_id")
        .eq("place_id", leadId)
        .eq("organization_id", profile.organization_id)
        .single();

      if (existingLead) {
        lead = existingLead;
      } else {
        // Create the lead on-the-fly
        const { data: newLead, error: createError } = await serviceSupabase
          .from("search_results")
          .insert({
            place_id: leadId,
            name: leadName || "Unknown",
            phone: phoneNumber,
            organization_id: profile.organization_id,
            created_by: user.id,
            lead_status: "new",
            lead_source: "google_maps",
          })
          .select()
          .single();
        
        if (createError) {
          console.error("[Call Initiate] Error creating lead:", createError);
          return NextResponse.json(
            { error: `Failed to create lead: ${createError.message}` },
            { status: 500 }
          );
        }
        
        lead = newLead;
      }
    }
    
    if (!lead) {
      console.error("[Call Initiate] Lead not found for ID:", leadId);
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    console.log("[Call Initiate] Found lead:", { id: lead.id, name: lead.name, leadOrgId: lead.organization_id });

    // Verify lead belongs to user's organization
    if (lead.organization_id !== profile.organization_id) {
      console.error("[Call Initiate] Organization mismatch:", { 
        leadOrgId: lead.organization_id, 
        userOrgId: profile.organization_id 
      });
      return NextResponse.json(
        { error: "Lead belongs to different organization" },
        { status: 404 }
      );
    }

    // Check do_not_call flag
    if (lead.do_not_call) {
      return NextResponse.json(
        { error: "This lead is marked as 'Do Not Call'" },
        { status: 403 }
      );
    }

    // Auto-claim: If lead is unassigned, assign it to the current user
    if (!lead.assigned_to) {
      await serviceSupabase
        .from("search_results")
        .update({ assigned_to: user.id })
        .eq("id", lead.id);
      console.log("[Call Initiate] Auto-assigned lead to user:", user.id);
    }

    // Parse and format phone number using libphonenumber-js
    let formattedPhone: string;
    
    try {
      const rawPhone = phoneNumber.trim();
      
      if (rawPhone.startsWith("+")) {
        // Has country code, parse directly
        if (!isValidPhoneNumber(rawPhone)) {
          return NextResponse.json(
            { error: `Invalid phone number format: ${phoneNumber}` },
            { status: 400 }
          );
        }
        const parsed = parsePhoneNumber(rawPhone);
        formattedPhone = parsed.format("E.164");
      } else {
        // No country code - try to detect
        const cleanedPhone = rawPhone.replace(/\D/g, "");
        
        if (cleanedPhone.length >= 10) {
          // Try with US country code first (most common)
          const withUS = `+1${cleanedPhone}`;
          if (isValidPhoneNumber(withUS)) {
            formattedPhone = parsePhoneNumber(withUS).format("E.164");
          } else {
            // Try Philippines: mobile numbers are 11 digits starting with 0 or 9
            // If it starts with 0, remove it first (domestic format)
            let phNumber = cleanedPhone;
            if (phNumber.length === 11 && phNumber.startsWith("0")) {
              phNumber = phNumber.substring(1); // Remove leading 0
            }
            if (phNumber.length === 10 && phNumber.startsWith("9")) {
              const withPH = `+63${phNumber}`;
              if (isValidPhoneNumber(withPH)) {
                formattedPhone = parsePhoneNumber(withPH).format("E.164");
              } else {
                // Try other formats
                const withPlus = `+${cleanedPhone}`;
                if (isValidPhoneNumber(withPlus)) {
                  formattedPhone = parsePhoneNumber(withPlus).format("E.164");
                } else {
                  return NextResponse.json(
                    { error: `Could not determine country code for: ${phoneNumber}` },
                    { status: 400 }
                  );
                }
              }
            } else {
              // Try other formats
              const withPlus = `+${cleanedPhone}`;
              if (isValidPhoneNumber(withPlus)) {
                formattedPhone = parsePhoneNumber(withPlus).format("E.164");
              } else {
                return NextResponse.json(
                  { error: `Invalid phone number format: ${phoneNumber}` },
                  { status: 400 }
                );
              }
            }
          }
        } else {
          return NextResponse.json(
            { error: `Phone number too short: ${phoneNumber}` },
            { status: 400 }
          );
        }
      }
    } catch (parseError: any) {
      console.error(`Error parsing phone number ${phoneNumber}:`, parseError);
      return NextResponse.json(
        { error: `Invalid phone number: ${phoneNumber}. ${parseError.message}` },
        { status: 400 }
      );
    }
    
    const toNumber = formattedPhone;

    let twilioCallSid: string;
    let callStatus: string;
    let fromNumber: string | null = null;

    // Try to make real Twilio call if configured
    if (client) {
      try {
        // COST CONTROL: Get org settings for recording and duration limits
        const { data: orgCallSettings } = await serviceSupabase
          .from("organization_call_settings")
          .select("recording_enabled, record_after_seconds, max_call_duration_sdr_seconds, max_call_duration_activator_seconds")
          .eq("organization_id", profile.organization_id)
          .single();

        // Recording defaults to OFF for cost savings
        const recordingEnabled = orgCallSettings?.recording_enabled ?? false;
        const recordAfterSeconds = orgCallSettings?.record_after_seconds ?? 30;

        // Get Twilio number to use - prioritize passed twilioNumber, then user's assigned, then org default
        if (twilioNumber) {
          fromNumber = twilioNumber;
        } else {
          // Check if user has an assigned phone number
          const { data: userProfile } = await supabase
            .from("user_profiles")
            .select("phone_number")
            .eq("id", user.id)
            .single();
          
          if (userProfile?.phone_number) {
            fromNumber = userProfile.phone_number;
          } else {
            // Fall back to organization default or env var
            fromNumber = process.env.TWILIO_CRM_PHONE_NUMBER || "+14147683131";
          }
        }

        if (!fromNumber) {
          return NextResponse.json(
            { error: "No Twilio phone numbers available with voice capability" },
            { status: 400 }
          );
        }

        // Create TwiML webhook URL with parameters
        const webhookUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice`);
        webhookUrl.searchParams.set("leadPhone", toNumber);
        webhookUrl.searchParams.set("callMode", callMode || "voicemail");
        if (userPhone) webhookUrl.searchParams.set("userPhone", userPhone);
        if (voicemailMessage) webhookUrl.searchParams.set("voicemailMessage", voicemailMessage);
        webhookUrl.searchParams.set("leadName", lead.name || "");
        webhookUrl.searchParams.set("fromNumber", fromNumber);

        // Determine who to call first based on call mode
        // For live calls: Call the AGENT first (Option 2 - Agent First)
        // For voicemail: Call the LEAD directly
        const firstCallTo = callMode === "live" && userPhone ? userPhone : toNumber;

        // IMPORTANT: Create call record FIRST (before Twilio call) to avoid race condition
        // Twilio callbacks can arrive before the API response returns
        const tempCallSid = `PENDING_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const { data: call, error: createError } = await supabase
          .from("calls")
          .insert({
            lead_id: lead.id,
            user_id: user.id,
            organization_id: profile.organization_id,
            phone_number: phoneNumber,
            call_type: "outbound",
            status: "initiated",
            twilio_call_sid: tempCallSid, // Temporary SID, will be updated
            initiated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError || !call) {
          console.error("Error creating call record:", createError);
          return NextResponse.json(
            { error: "Failed to create call record" },
            { status: 500 }
          );
        }

        // Now initiate call through Twilio
        // COST CONTROL: Build status callback URL with recording config
        const statusCallbackUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`);
        statusCallbackUrl.searchParams.set("callId", call.id);
        statusCallbackUrl.searchParams.set("recordingEnabled", recordingEnabled ? "1" : "0");
        statusCallbackUrl.searchParams.set("recordAfterSeconds", String(recordAfterSeconds));

        const twilioCall = await client.calls.create({
          to: firstCallTo,
          from: fromNumber,
          url: webhookUrl.toString(),
          statusCallback: statusCallbackUrl.toString(),
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          // COST CONTROL: Do NOT set record: true here
          // Recording will be started conditionally via API after threshold is met
        });

        twilioCallSid = twilioCall.sid;
        callStatus = twilioCall.status;

        // Update call record with real Twilio SID
        await supabase
          .from("calls")
          .update({
            twilio_call_sid: twilioCallSid,
            status: callStatus === "queued" ? "initiated" : callStatus,
          })
          .eq("id", call.id);

        // Log activity to lead activities (use lead.id which is always a UUID)
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          user_id: user.id,
          organization_id: profile.organization_id,
          activity_type: "call_made",
          description: `Called ${phoneNumber}`,
          activity_data: {
            call_id: call.id,
            phone_number: phoneNumber,
            call_type: "outbound",
            twilio_call_sid: twilioCallSid,
          },
        });

        const formattedCall: Call = {
          id: call.id,
          leadId: call.lead_id,
          userId: call.user_id,
          phoneNumber: call.phone_number,
          callType: call.call_type,
          status: (callStatus === "queued" ? "initiated" : callStatus) as Call["status"],
          duration: call.duration,
          twilioCallSid: twilioCallSid,
          twilioRecordingSid: call.twilio_recording_sid,
          recordingUrl: call.recording_url,
          notes: call.notes,
          outcome: call.outcome,
          callbackDate: call.callback_date,
          initiatedAt: call.initiated_at,
          answeredAt: call.answered_at,
          endedAt: call.ended_at,
          createdAt: call.created_at,
          updatedAt: call.updated_at,
          leadName: lead.name,
        };

        // Record governance event
        if (lead.assigned_campaign_id) {
          recordPerformanceEvent({
            campaignId: lead.assigned_campaign_id,
            eventType: 'dial_attempt',
            leadId: lead.id,
            userId: user.id,
          });
        }

        return NextResponse.json({
          success: true,
          message: "Call initiated successfully",
          call: formattedCall,
        });
      } catch (twilioError: any) {
        console.error("Twilio call error:", twilioError);
        return NextResponse.json(
          { error: `Failed to initiate call: ${twilioError.message}` },
          { status: 500 }
        );
      }
    } else {
      // Fallback to simulation if Twilio not configured
      twilioCallSid = `SIM${Math.random().toString(36).substr(2, 9)}`;
      callStatus = "simulated";
      console.warn("Twilio not configured. Call simulated.");

      // Create call record for simulated call
    const { data: call, error } = await supabase
      .from("calls")
      .insert({
        lead_id: lead.id,
        user_id: user.id,
        organization_id: profile.organization_id,
        phone_number: phoneNumber,
        call_type: "outbound",
        status: callStatus,
        twilio_call_sid: twilioCallSid,
        initiated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating call:", error);
      return NextResponse.json(
        { error: "Failed to initiate call" },
        { status: 500 }
      );
    }

    // Log activity to lead activities (use lead.id which is always a UUID)
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      user_id: user.id,
      organization_id: profile.organization_id,
      activity_type: "call_made",
      description: `Called ${phoneNumber}`,
      activity_data: {
        call_id: call.id,
        phone_number: phoneNumber,
        call_type: "outbound",
        twilio_call_sid: twilioCallSid,
      },
    });

    const formattedCall: Call = {
      id: call.id,
      leadId: call.lead_id,
      userId: call.user_id,
      phoneNumber: call.phone_number,
      callType: call.call_type,
      status: call.status,
      duration: call.duration,
      twilioCallSid: call.twilio_call_sid,
      twilioRecordingSid: call.twilio_recording_sid,
      recordingUrl: call.recording_url,
      notes: call.notes,
      outcome: call.outcome,
      callbackDate: call.callback_date,
      initiatedAt: call.initiated_at,
      answeredAt: call.answered_at,
      endedAt: call.ended_at,
      createdAt: call.created_at,
      updatedAt: call.updated_at,
      leadName: lead.name,
    };

    // === ACTIVATION SYSTEM: Track contact attempt ===
    // Update trial_pipeline: increment attempts, set last_contact, auto-progress queued->in_progress
    try {
      const { data: trialPipeline } = await serviceSupabase
        .from("trial_pipeline")
        .select("id, activation_status, rescue_attempts, assigned_activator_id")
        .eq("crm_lead_id", lead.id)
        .single();

      if (trialPipeline) {
        const updates: Record<string, any> = {
          last_contact_at: new Date().toISOString(),
          rescue_attempts: (trialPipeline.rescue_attempts || 0) + 1,
        };
        
        // Auto-transition queued -> in_progress on first contact
        if (trialPipeline.activation_status === 'queued') {
          updates.activation_status = 'in_progress';
        }

        // Auto-assign to current user if unassigned (first touch)
        if (!trialPipeline.assigned_activator_id) {
          updates.assigned_activator_id = user.id;
          console.log(`[Activation] Auto-assigned to ${user.id} on first call`);
        }

        await serviceSupabase
          .from("trial_pipeline")
          .update(updates)
          .eq("id", trialPipeline.id);
        
        console.log(`[Activation] Contact attempt logged for lead ${lead.id}, attempts: ${updates.rescue_attempts}`);
      }
    } catch (err) {
      // Don't fail the call if activation tracking fails
      console.error("[Activation] Failed to track contact attempt:", err);
    }
    // === END ACTIVATION TRACKING ===

    return NextResponse.json({
      success: true,
      message: "Call initiated successfully",
      call: formattedCall,
    });
    }
  } catch (error) {
    console.error("Error in initiate call API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
