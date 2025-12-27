import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * POST /api/calls/webrtc
 * Initiate a WebRTC call from browser to a lead
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
      .select("organization_id, id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    const { leadId, phoneNumber, twilioNumber, leadName } = await request.json();

    if (!leadId || !phoneNumber) {
      return NextResponse.json(
        { error: "Lead ID and phone number are required" },
        { status: 400 }
      );
    }

    // Verify the lead exists and check permissions (use service role to bypass RLS)
    const serviceSupabase = createServiceRoleClient();
    
    console.log("[WebRTC Call] Looking up lead:", { leadId, userOrgId: profile.organization_id });
    
    // Check if leadId is a UUID or a Place ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
    
    let lead;
    
    if (isUUID) {
      // Standard lookup by database ID
      const { data, error: leadError } = await serviceSupabase
        .from("search_results")
        .select("id, name, assigned_to, do_not_call, organization_id")
        .eq("id", leadId)
        .single();
      
      if (leadError) {
        console.error("[WebRTC Call] Lead lookup error:", leadError);
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
        .select("id, name, assigned_to, do_not_call, organization_id")
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
          console.error("[WebRTC Call] Error creating lead:", createError);
          return NextResponse.json(
            { error: `Failed to create lead: ${createError.message}` },
            { status: 500 }
          );
        }
        
        lead = newLead;
      }
    }
    
    if (!lead) {
      console.error("[WebRTC Call] Lead not found for ID:", leadId);
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    console.log("[WebRTC Call] Found lead:", { id: lead.id, name: lead.name, leadOrgId: lead.organization_id });

    // Verify lead belongs to user's organization
    if (lead.organization_id !== profile.organization_id) {
      console.error("[WebRTC Call] Organization mismatch:", { 
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
      console.log("[WebRTC Call] Auto-assigned lead to user:", user.id);
    }

    // Parse and format phone number
    let formattedPhone: string;
    try {
      const rawPhone = phoneNumber.trim();
      
      if (rawPhone.startsWith("+")) {
        if (!isValidPhoneNumber(rawPhone)) {
          return NextResponse.json(
            { error: `Invalid phone number format: ${phoneNumber}` },
            { status: 400 }
          );
        }
        const parsed = parsePhoneNumber(rawPhone);
        formattedPhone = parsed.format("E.164");
      } else {
        const cleanedPhone = rawPhone.replace(/\D/g, "");
        if (cleanedPhone.length >= 10) {
          const withUS = `+1${cleanedPhone}`;
          if (isValidPhoneNumber(withUS)) {
            formattedPhone = parsePhoneNumber(withUS).format("E.164");
          } else {
            return NextResponse.json(
              { error: `Invalid phone number format: ${phoneNumber}` },
              { status: 400 }
            );
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
        { error: `Invalid phone number: ${phoneNumber}` },
        { status: 400 }
      );
    }

    // Get or create agent availability record
    const { data: availability } = await supabase
      .from("agent_availability")
      .select("webrtc_identity")
      .eq("user_id", user.id)
      .single();

    if (!availability?.webrtc_identity) {
      return NextResponse.json(
        { error: "WebRTC not initialized. Please refresh the page." },
        { status: 400 }
      );
    }

    // Get Twilio number to use - check user's assigned number first, then org default, then env var
    let fromNumber = twilioNumber;
    
    if (!fromNumber) {
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

    if (!client) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    // Create TwiML webhook URL for WebRTC call
    const webhookUrl = new URL(`${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice`);
    webhookUrl.searchParams.set("leadPhone", formattedPhone);
    webhookUrl.searchParams.set("webrtcIdentity", availability.webrtc_identity);
    webhookUrl.searchParams.set("fromNumber", fromNumber);
    webhookUrl.searchParams.set("leadName", lead.name || "");
    webhookUrl.searchParams.set("organizationId", profile.organization_id);

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

    // Now make the Twilio call
    let twilioCallSid: string;
    let callStatus: string;

    try {
      const twilioCall = await client.calls.create({
        to: `client:${availability.webrtc_identity}`, // Call the WebRTC client identity
        from: fromNumber,
        url: webhookUrl.toString(),
        statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        record: true,
      });

      twilioCallSid = twilioCall.sid;
      callStatus = twilioCall.status;
    } catch (twilioError: any) {
      console.error("Twilio call error:", twilioError);
      // Clean up the placeholder call record
      await supabase.from("calls").delete().eq("id", call.id);
      return NextResponse.json(
        { error: `Failed to initiate call: ${twilioError.message}` },
        { status: 500 }
      );
    }

    // Update call record with real Twilio SID
    const { error: updateError } = await supabase
      .from("calls")
      .update({
        twilio_call_sid: twilioCallSid,
        status: callStatus === "queued" ? "initiated" : callStatus,
      })
      .eq("id", call.id);

    if (updateError) {
      console.error("Error updating call with Twilio SID:", updateError);
      // Don't fail - call was made, just log the error
    }

    // Log activity (use lead.id which is always a UUID)
    await supabase.from("lead_activities").insert({
      lead_id: lead.id,
      user_id: user.id,
      organization_id: profile.organization_id,
      activity_type: "call_made",
      description: `Called ${phoneNumber} via WebRTC`,
      activity_data: {
        call_id: call.id,
        phone_number: phoneNumber,
        call_type: "outbound",
        twilio_call_sid: twilioCallSid,
        method: "webrtc",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Call initiated successfully",
      call: {
        id: call.id,
        twilioCallSid: twilioCallSid, // Use actual SID, not temp placeholder
        status: callStatus === "queued" ? "initiated" : callStatus,
      },
    });
  } catch (error: any) {
    console.error("Error in WebRTC call API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

