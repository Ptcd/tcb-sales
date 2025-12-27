import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import twilio from "twilio";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

// Map Twilio SMS status to our DB allowed values: pending, sent, delivered, failed, queued
function mapTwilioStatus(twilioStatus: string): string {
  const statusMap: Record<string, string> = {
    queued: "queued",
    accepted: "queued",
    sending: "sent",
    sent: "sent",
    delivered: "delivered",
    undelivered: "failed",
    failed: "failed",
    canceled: "failed",
    cancelled: "failed",
  };
  return statusMap[twilioStatus] || "pending";
}

/**
 * GET /api/conversations/[leadId]
 * Get all messages (SMS and email) for a specific lead conversation
 * 
 * Query params:
 * - type: "all" | "sms" | "email" (default: "all")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId } = await params;
    const serviceSupabase = createServiceRoleClient();

    // Check if this is a phone-based conversation (orphaned messages)
    if (leadId.startsWith("phone_")) {
      // Extract phone number from the ID
      const phoneDigits = leadId.replace("phone_", "");
      
      // Get user's organization
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        return NextResponse.json({ error: "User profile not found" }, { status: 404 });
      }

      // Fetch messages by phone number (last 10 digits match)
      const { data: messages, error: messagesError } = await serviceSupabase
        .from("sms_messages")
        .select("*")
        .order("sent_at", { ascending: true });

      if (messagesError) {
        console.error("Error fetching messages:", messagesError);
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
      }

      // Filter messages by phone number match
      const filteredMessages = (messages || []).filter((msg) => {
        const msgPhoneDigits = (msg.phone_number || "").replace(/\D/g, "").slice(-10);
        return msgPhoneDigits === phoneDigits.slice(-10);
      });

      // Mark as read
      for (const msg of filteredMessages) {
        if (msg.direction === "inbound" && !msg.is_read) {
          await serviceSupabase
            .from("sms_messages")
            .update({ is_read: true })
            .eq("id", msg.id);
        }
      }

      // Create a fake lead object for the response
      const fakeLead = {
        id: leadId,
        name: `Unknown (+${phoneDigits})`,
        phone: `+${phoneDigits}`,
        address: null,
        email: null,
        website: null,
        lead_status: "new",
        organization_id: profile.organization_id,
      };

      return NextResponse.json({
        success: true,
        lead: fakeLead,
        messages: filteredMessages,
        total: filteredMessages.length,
      }, {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    // Regular lead lookup
    const { data: lead, error: leadError } = await serviceSupabase
      .from("search_results")
      .select("id, name, phone, address, email, website, lead_status, organization_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get all messages for this lead by lead_id OR by phone number match
    // This handles cases where inbound messages might have been saved with a different lead_id
    const normalizedLeadPhone = lead.phone?.replace(/\D/g, "").slice(-10) || "";
    
    // First get messages by lead_id
    const { data: messagesByLeadId, error: messagesError } = await serviceSupabase
      .from("sms_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 }
      );
    }

    // Also get messages by phone number match (for inbound messages that might have different lead_id)
    let allMessages = messagesByLeadId || [];
    if (normalizedLeadPhone) {
      const { data: messagesByPhone } = await serviceSupabase
        .from("sms_messages")
        .select("*")
        .order("sent_at", { ascending: true });
      
      if (messagesByPhone) {
        const existingIds = new Set(allMessages.map(m => m.id));
        const phoneMatches = messagesByPhone.filter(m => {
          if (existingIds.has(m.id)) return false; // Already included
          const normalizedMsgPhone = m.phone_number?.replace(/\D/g, "").slice(-10) || "";
          return normalizedMsgPhone === normalizedLeadPhone;
        });
        allMessages = [...allMessages, ...phoneMatches].sort(
          (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        );
      }
    }
    
    // Get message type filter from query params
    const { searchParams } = new URL(request.url);
    const messageType = searchParams.get("type") || "all";

    // Add type field to SMS messages
    const smsMessages = allMessages.map(m => ({ ...m, type: "sms" as const }));

    // Fetch email messages for this lead (if type allows)
    let emailMessages: any[] = [];
    if (messageType === "all" || messageType === "email") {
      const leadEmail = lead.email?.toLowerCase();
      
      // Fetch emails by lead_id
      const { data: emailsByLeadId } = await serviceSupabase
        .from("email_messages")
        .select("*")
        .eq("lead_id", leadId)
        .order("sent_at", { ascending: true, nullsFirst: false });
      
      let allEmails = emailsByLeadId || [];
      
      // Also fetch emails by email address match
      if (leadEmail) {
        const { data: emailsByAddress } = await serviceSupabase
          .from("email_messages")
          .select("*")
          .or(`from_email.ilike.${leadEmail},to_email.ilike.${leadEmail}`)
          .order("sent_at", { ascending: true, nullsFirst: false });
        
        if (emailsByAddress) {
          const existingIds = new Set(allEmails.map(e => e.id));
          const addressMatches = emailsByAddress.filter(e => !existingIds.has(e.id));
          allEmails = [...allEmails, ...addressMatches];
        }
      }
      
      // Transform email messages to match SMS format
      emailMessages = allEmails.map(e => ({
        id: e.id,
        lead_id: e.lead_id,
        direction: e.direction || "outbound",
        message: e.subject || "(No subject)",
        html_content: e.html_content,
        text_content: e.text_content,
        sent_at: e.sent_at || e.created_at,
        is_read: e.is_read ?? true,
        status: e.status,
        from_email: e.from_email,
        to_email: e.to_email,
        thread_id: e.thread_id,
        opened_at: e.opened_at,
        clicked_at: e.clicked_at,
        type: "email" as const,
      }));
    }

    // Filter messages based on type
    let filteredSmsMessages = messageType === "email" ? [] : smsMessages;
    let filteredEmailMessages = messageType === "sms" ? [] : emailMessages;

    // Combine and sort all messages
    const combinedMessages = [...filteredSmsMessages, ...filteredEmailMessages].sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    );

    // Mark all unread inbound SMS messages as read
    const unreadSmsIds = filteredSmsMessages
      .filter(m => m.direction === "inbound" && !m.is_read)
      .map(m => m.id);
    
    if (unreadSmsIds.length > 0) {
      const { error: updateError } = await serviceSupabase
        .from("sms_messages")
        .update({ is_read: true })
        .in("id", unreadSmsIds);

      if (updateError) {
        console.error("Error marking SMS messages as read:", updateError);
      }
    }

    // Mark all unread inbound email messages as read
    const unreadEmailIds = filteredEmailMessages
      .filter(m => m.direction === "inbound" && !m.is_read)
      .map(m => m.id);
    
    if (unreadEmailIds.length > 0) {
      const { error: updateError } = await serviceSupabase
        .from("email_messages")
        .update({ is_read: true })
        .in("id", unreadEmailIds);

      if (updateError) {
        console.error("Error marking email messages as read:", updateError);
      }
    }

    return NextResponse.json({
      success: true,
      lead,
      messages: combinedMessages,
      sms_count: filteredSmsMessages.length,
      email_count: filteredEmailMessages.length,
      total: combinedMessages.length,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error in conversation API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/conversations/[leadId]
 * Send a new SMS message in a conversation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { leadId } = await params;
    const body = await request.json();
    const { message, phone: phoneFromBody, name: nameFromBody } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get user's organization, SDR code, and name for sender_name
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, sdr_code, full_name")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Get sender name (user's name or fallback to email username)
    const senderName = profile.full_name || user.email?.split("@")[0] || "Your Team";

    // Generate tracking URL if user has SDR code
    const JCC_SIGNUP_BASE_URL = process.env.NEXT_PUBLIC_JCC_SIGNUP_URL || "https://autosalvageautomation.com/try-the-calculator";
    const trackingUrl = profile.sdr_code 
      ? `${JCC_SIGNUP_BASE_URL}?sdr=${encodeURIComponent(profile.sdr_code)}`
      : "";

    const serviceSupabase = createServiceRoleClient();
    
    // Handle phone-based conversations (orphaned messages)
    let lead: any;
    let phoneToUse: string;
    
    if (leadId.startsWith("phone_")) {
      const phoneDigits = leadId.replace("phone_", "");
      phoneToUse = `+${phoneDigits}`;
      lead = {
        id: leadId,
        name: `Unknown (+${phoneDigits})`,
        phone: phoneToUse,
      };
    } else {
      // Check if leadId is a UUID or a Place ID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);
      
      let leadData;
      
      if (isUUID) {
        // Standard lookup by database ID
        const { data, error: leadError } = await serviceSupabase
          .from("search_results")
          .select("id, name, phone, address")
          .eq("id", leadId)
          .single();

        if (leadError || !data) {
          return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }
        
        leadData = data;
      } else {
        // leadId is a Place ID - find existing or create new
        const { data: existingLead } = await serviceSupabase
          .from("search_results")
          .select("id, name, phone, address")
          .eq("place_id", leadId)
          .eq("organization_id", profile.organization_id)
          .single();

        if (existingLead) {
          leadData = existingLead;
        } else {
          // Lead doesn't exist - create it on the fly using phone/name from request body
          if (!phoneFromBody) {
            return NextResponse.json(
              { error: "Lead not found and phone number required to create new lead." },
              { status: 404 }
            );
          }
          
          // Create the lead
          const { data: newLead, error: createError } = await serviceSupabase
            .from("search_results")
            .insert({
              place_id: leadId,
              name: nameFromBody || "Unknown",
              phone: phoneFromBody,
              organization_id: profile.organization_id,
              created_by: user.id,
              lead_status: "new",
              lead_source: "google_maps",
              assigned_to: user.id, // Auto-assign to creator
            })
            .select()
            .single();
          
          if (createError || !newLead) {
            console.error("[SMS Send] Error creating lead:", createError);
            return NextResponse.json(
              { error: "Failed to create lead" },
              { status: 500 }
            );
          }
          
          leadData = newLead;
          console.log("[SMS Send] Created new lead:", newLead.id);
        }
      }

      if (!leadData.phone) {
        return NextResponse.json(
          { error: "Lead has no phone number" },
          { status: 400 }
        );
      }
      
      lead = leadData;
      phoneToUse = leadData.phone;
      
      // Auto-claim: If lead is unassigned, assign it to the current user
      const { data: fullLead } = await serviceSupabase
        .from("search_results")
        .select("assigned_to")
        .eq("id", leadData.id)
        .single();
      
      if (fullLead && !fullLead.assigned_to) {
        await serviceSupabase
          .from("search_results")
          .update({ assigned_to: user.id })
          .eq("id", leadData.id);
        console.log("[SMS Send] Auto-assigned lead to user:", user.id);
      }
    }

    if (!twilioClient) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 500 }
      );
    }

    // Parse and format phone number
    let formattedPhone: string;
    try {
      const rawPhone = phoneToUse.trim();
      if (rawPhone.startsWith("+")) {
        if (!isValidPhoneNumber(rawPhone)) {
          throw new Error("Invalid phone number format");
        }
        const parsed = parsePhoneNumber(rawPhone);
        formattedPhone = parsed.format("E.164");
      } else {
        const cleanedPhone = rawPhone.replace(/\D/g, "");
        
        // Handle case where number already has country code (e.g., 12627770909)
        if (cleanedPhone.length === 11 && cleanedPhone.startsWith("1")) {
          // Already has US country code, just add +
          const withPlus = `+${cleanedPhone}`;
          if (isValidPhoneNumber(withPlus)) {
            formattedPhone = parsePhoneNumber(withPlus).format("E.164");
          } else {
            throw new Error("Invalid phone number format");
          }
        } else if (cleanedPhone.length === 10) {
          // Standard 10-digit US number, add +1
          const withUS = `+1${cleanedPhone}`;
          if (isValidPhoneNumber(withUS)) {
            formattedPhone = parsePhoneNumber(withUS).format("E.164");
          } else {
            throw new Error("Invalid phone number format");
          }
        } else if (cleanedPhone.length > 11) {
          // Might be international, try with just +
          const withPlus = `+${cleanedPhone}`;
          if (isValidPhoneNumber(withPlus)) {
            formattedPhone = parsePhoneNumber(withPlus).format("E.164");
          } else {
            throw new Error("Invalid phone number format");
          }
        } else {
          throw new Error("Phone number too short");
        }
      }
    } catch (parseError: any) {
      return NextResponse.json(
        { error: `Invalid phone number: ${parseError.message}` },
        { status: 400 }
      );
    }

    // Send SMS via Twilio Messaging Service (A2P 10DLC compliant) using assigned number
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!messagingServiceSid) {
      return NextResponse.json(
        { error: "Messaging Service SID not configured" },
        { status: 500 }
      );
    }

    // Get user's assigned phone number or fall back to org default
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("phone_number")
      .eq("id", user.id)
      .single();

    const fromNumber = userProfile?.phone_number || process.env.TWILIO_CRM_PHONE_NUMBER || null;
    if (!fromNumber) {
      return NextResponse.json(
        { error: "No sending number configured" },
        { status: 500 }
      );
    }

    // Personalize message with lead data, sender info, and tracking URL
    const personalizedMessage = message.trim()
      .replace(/\{\{name\}\}/g, lead.name || "there")
      .replace(/\{\{address\}\}/g, lead.address || "")
      .replace(/\{\{phone\}\}/g, lead.phone || "")
      .replace(/\{\{sender_name\}\}/g, senderName)
      .replace(/\{\{tracking_url\}\}/g, trackingUrl || "#");

    const twilioMessage = await twilioClient.messages.create({
      to: formattedPhone,
      messagingServiceSid,
      from: fromNumber, // ensure Twilio uses the assigned number in the sender pool
      body: personalizedMessage,
    });

    console.log("[SMS Send] Twilio sent", {
      leadIdParam: leadId,
      actualLeadId: lead.id,
      to: formattedPhone,
      from: fromNumber,
      twilioSid: twilioMessage.sid,
      status: twilioMessage.status,
      org: profile.organization_id,
    });

    // Save SMS to database (use null for phone-based conversation, otherwise the DB lead UUID)
    const actualLeadId = leadId.startsWith("phone_") ? null : lead.id;
    const { data: savedMessage, error: saveError } = await serviceSupabase
      .from("sms_messages")
      .insert({
        lead_id: actualLeadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        phone_number: formattedPhone,
        message: personalizedMessage,
        status: mapTwilioStatus(twilioMessage.status),
        twilio_sid: twilioMessage.sid,
        direction: "outbound",
        is_read: true,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving SMS to database:", saveError);
      console.error("Insert values:", {
        lead_id: actualLeadId,
        user_id: user.id,
        organization_id: profile.organization_id,
        phone_number: formattedPhone,
        status: mapTwilioStatus(twilioMessage.status),
      });
      // Return error details so frontend knows what happened
      return NextResponse.json({
        success: false,
        error: "Failed to save message to database",
        details: saveError.message || saveError.code || JSON.stringify(saveError),
        twilioSent: true,
        twilioSid: twilioMessage.sid,
      }, { status: 500 });
    }

    // Create activity record (only for real leads)
    if (actualLeadId) {
      try {
        await serviceSupabase.from("lead_activities").insert({
          lead_id: actualLeadId,
          user_id: user.id,
          organization_id: profile.organization_id,
          activity_type: "sms_sent",
          description: `Sent SMS: ${message.trim().substring(0, 50)}${message.trim().length > 50 ? "..." : ""}`,
          activity_data: {
            phone_number: formattedPhone,
            message: message.trim().substring(0, 500),
            twilio_sid: twilioMessage.sid,
          },
        });
      } catch (activityError) {
        console.error("Error creating activity (non-critical):", activityError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "SMS sent successfully",
      data: {
        twilioSid: twilioMessage.sid,
        status: twilioMessage.status,
        savedMessage,
        actualLeadId,
      },
    });
  } catch (error: any) {
    console.error("Error sending SMS in conversation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send SMS" },
      { status: 500 }
    );
  }
}

