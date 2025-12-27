import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/twilio/sms
 * Webhook for incoming SMS messages from Twilio
 * This endpoint receives SMS replies from leads
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    
    // Extract Twilio parameters
    const from = body.get("From") as string; // Lead's phone number
    const to = body.get("To") as string; // Your Twilio number
    const messageBody = body.get("Body") as string;
    const messageSid = body.get("MessageSid") as string;
    const messageStatus = body.get("SmsStatus") as string;

    if (!from || !messageBody) {
      console.error("Missing required SMS parameters");
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Use service role to bypass RLS (webhook has no user context)
    const supabase = createServiceRoleClient();

    // Normalize phone number for matching (E.164 format)
    const normalizePhone = (phone: string): string => {
      // Remove all non-digits
      let digits = phone.replace(/\D/g, "");
      // If it starts with 1 and has 11 digits, remove the leading 1
      if (digits.length === 11 && digits.startsWith("1")) {
        digits = digits.substring(1);
      }
      // Return in E.164 format
      return `+1${digits}`;
    };

    const normalizedFrom = normalizePhone(from);
    const phoneWithoutPlus = normalizedFrom.substring(2);

    console.log("[SMS Webhook] Inbound SMS from:", from);
    console.log("[SMS Webhook] Normalized from:", normalizedFrom);
    console.log("[SMS Webhook] Phone without plus:", phoneWithoutPlus);
    console.log("[SMS Webhook] To (Twilio number):", to);

    const { data: allLeads, error: leadError } = await supabase
      .from("search_results")
      .select("id, name, phone, organization_id");

    if (leadError) {
      console.error("Error finding lead:", leadError);
      return NextResponse.json(
        { error: "Failed to find lead" },
        { status: 500 }
      );
    }

    console.log("[SMS Webhook] Total leads in DB:", allLeads?.length || 0);

    const matchingLeads = (allLeads || []).filter((lead) => {
      if (!lead.phone) return false;
      const normalizedLeadPhone = normalizePhone(lead.phone);
      const leadWithoutPlus = normalizedLeadPhone.substring(2);
      const isMatch = normalizedLeadPhone === normalizedFrom ||
        normalizedLeadPhone === from ||
        leadWithoutPlus === phoneWithoutPlus;
      
      if (lead.phone && lead.phone.includes(phoneWithoutPlus.slice(-7))) {
        console.log("[SMS Webhook] Potential match - Lead phone:", lead.phone, "Normalized:", normalizedLeadPhone, "Match:", isMatch);
      }
      return isMatch;
    });

    console.log("[SMS Webhook] Matching leads found:", matchingLeads.length);
    if (matchingLeads.length > 0) {
      console.log("[SMS Webhook] First match:", { id: matchingLeads[0].id, name: matchingLeads[0].name, phone: matchingLeads[0].phone });
    }

    let lead = matchingLeads.length > 0 ? matchingLeads[0] : null;

    // If no lead found, try to find organization from Twilio number and create a manual lead
    if (!lead) {
      // Find which organization owns this Twilio number
      const { data: twilioNumber } = await supabase
        .from("twilio_phone_numbers")
        .select("organization_id")
        .eq("phone_number", to)
        .single();
      
      if (!twilioNumber?.organization_id) {
        return new NextResponse(
          `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
          {
            headers: { "Content-Type": "text/xml" },
            status: 200,
          }
        );
      }
      
      // Create a new manual lead for this number
      const { data: newLead, error: createError } = await supabase
        .from("search_results")
        .insert({
          name: `Unknown (${from})`,
          phone: normalizedFrom,
          organization_id: twilioNumber.organization_id,
          lead_source: "manual",
          lead_status: "new",
        })
        .select()
        .single();
      
      if (createError || !newLead) {
        console.error("Error creating manual lead:", createError);
        return new NextResponse(
          `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
          {
            headers: { "Content-Type": "text/xml" },
            status: 200,
          }
        );
      }
      
      lead = newLead;
    }

    // Ensure we have a lead at this point
    if (!lead) {
      console.error("Failed to find or create lead for", from);
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        {
          headers: { "Content-Type": "text/xml" },
          status: 200,
        }
      );
    }

    // Get the user_id from the lead's organization (use the first admin/member)
    const { data: orgUser } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", lead.organization_id)
      .limit(1)
      .single();

    const userId = orgUser?.id;

    if (!userId) {
      console.error("No user found for organization");
      return NextResponse.json(
        { error: "No user found" },
        { status: 500 }
      );
    }

    // Save the inbound SMS
    const messageData = {
      lead_id: lead.id,
      user_id: userId,
      organization_id: lead.organization_id,
      phone_number: from,
      message: messageBody,
      status: "delivered",
      twilio_sid: messageSid,
      direction: "inbound",
      is_read: false,
      sent_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    };

    console.log("[SMS Webhook] Saving message with data:", {
      lead_id: messageData.lead_id,
      phone_number: messageData.phone_number,
      direction: messageData.direction,
      organization_id: messageData.organization_id,
    });

    const { data: insertedMessage, error: insertError } = await supabase
      .from("sms_messages")
      .insert(messageData)
      .select()
      .single();

    if (insertError) {
      console.error("[SMS Webhook] Error saving inbound SMS:", insertError);
      console.error("[SMS Webhook] Insert error details:", JSON.stringify(insertError));
      return NextResponse.json(
        { error: "Failed to save message" },
        { status: 500 }
      );
    }

    console.log("[SMS Webhook] Message saved successfully:", insertedMessage?.id);

    // Create activity record (if activity_type supports it)
    try {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        user_id: userId,
        organization_id: lead.organization_id,
        activity_type: "sms_sent", // Use sms_sent as fallback since sms_received might not be in enum
        description: `Received SMS: ${messageBody.substring(0, 50)}${messageBody.length > 50 ? "..." : ""}`,
        activity_data: {
          phone_number: from,
          message: messageBody,
          twilio_sid: messageSid,
          direction: "inbound",
        },
      });
    } catch (activityError) {
      console.error("Error creating activity (non-critical):", activityError);
    }

    // Return empty TwiML response (no auto-reply)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      {
        headers: { "Content-Type": "text/xml" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error processing inbound SMS:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      {
        headers: { "Content-Type": "text/xml" },
        status: 500,
      }
    );
  }
}

/**
 * GET /api/twilio/sms
 * Health check
 */
export async function GET() {
  return NextResponse.json({
    message: "Twilio SMS webhook endpoint",
    status: "active",
  });
}

