import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import twilio from "twilio";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID; // Optional: Use Messaging Service for A2P

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * POST /api/sms/send
 * Send SMS to selected leads
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

    const { leadIds, message, templateId } = await request.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: "Lead IDs are required" },
        { status: 400 }
      );
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get leads with phone numbers (includes manual leads with search_history_id = null)
    const { data: leads, error: leadsError } = await supabase
      .from("search_results")
      .select("id, name, phone, address, search_history_id, organization_id")
      .in("id", leadIds)
      .not("phone", "is", null);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { error: "No leads found with phone numbers" },
        { status: 404 }
      );
    }

    // Verify all leads belong to user's organization
    const invalidLeads = leads.filter(lead => lead.organization_id !== profile.organization_id);
    if (invalidLeads.length > 0) {
      return NextResponse.json(
        { error: "Some leads do not belong to your organization" },
        { status: 403 }
      );
    }

    // Use dedicated CRM Twilio number for SMS
    // This is the number purchased specifically for the Outreach CRM
    const fromNumber = process.env.TWILIO_CRM_PHONE_NUMBER || "+14147683131";

    const sentMessages = [];
    const failedMessages = [];

    // Send SMS to each lead
    for (const lead of leads) {
      try {
        // Personalize message with lead data, sender info, and tracking URL
        const personalizedMessage = message.trim()
          .replace(/\{\{name\}\}/g, lead.name || "there")
          .replace(/\{\{address\}\}/g, lead.address || "")
          .replace(/\{\{phone\}\}/g, lead.phone || "")
          .replace(/\{\{sender_name\}\}/g, senderName)
          .replace(/\{\{tracking_url\}\}/g, trackingUrl || "#");

        // Parse and format phone number using libphonenumber-js
        let formattedPhone: string;
        
        try {
          // Try to parse the phone number (with or without country code)
          // If it doesn't start with +, try parsing with US as default
          const rawPhone = lead.phone.trim();
          
          if (rawPhone.startsWith("+")) {
            // Has country code, parse directly
            if (!isValidPhoneNumber(rawPhone)) {
              throw new Error("Invalid phone number format");
            }
            const parsed = parsePhoneNumber(rawPhone);
            formattedPhone = parsed.format("E.164");
          } else {
            // No country code - try to detect or use US as fallback
            const cleanedPhone = rawPhone.replace(/\D/g, "");
            
            // Handle case where number already has US country code (e.g., 12627770909)
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
            } else if (cleanedPhone.length >= 10) {
              // Try Philippines: mobile numbers are 11 digits starting with 0 or 10 digits starting with 9
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
                  throw new Error("Could not determine country code");
                }
              } else {
                // For other lengths, try to parse as-is or with + prefix
                const withPlus = `+${cleanedPhone}`;
                if (isValidPhoneNumber(withPlus)) {
                  formattedPhone = parsePhoneNumber(withPlus).format("E.164");
                } else {
                  throw new Error("Invalid phone number format");
                }
              }
            } else {
              throw new Error("Phone number too short");
            }
          }
        } catch (parseError) {
          console.error(`Error parsing phone number ${lead.phone}:`, parseError);
          failedMessages.push({
            leadId: lead.id,
            error: `Invalid phone number: ${lead.phone}`,
          });
          continue;
        }

        let twilioSid: string;
        let status: string;

        // Send via Twilio if configured and fromNumber is available
        if (client && fromNumber) {
          try {
            // Always use Messaging Service for 10DLC compliance, with explicit from
            if (!messagingServiceSid) {
              throw new Error("TWILIO_MESSAGING_SERVICE_SID is not configured");
            }
            if (!fromNumber) {
              throw new Error("TWILIO_CRM_PHONE_NUMBER is not configured");
            }

            const twilioMessage = await client.messages.create({
              body: personalizedMessage,
              to: formattedPhone,
              messagingServiceSid,
              from: fromNumber, // ensure the specific number in the sender pool is used
            });

            console.log("[Bulk SMS Send] Twilio sent", {
              leadId: lead.id,
              to: formattedPhone,
              from: fromNumber,
              twilioSid: twilioMessage.sid,
              status: twilioMessage.status,
            });
            
            twilioSid = twilioMessage.sid;
            
            // Map Twilio status to our allowed status values
            const twilioStatus = twilioMessage.status;
            if (twilioStatus === "queued") {
              status = "queued";
            } else if (twilioStatus === "accepted" || twilioStatus === "sending" || twilioStatus === "sent") {
              status = "sent";
            } else if (twilioStatus === "delivered") {
              status = "delivered";
            } else if (twilioStatus === "failed" || twilioStatus === "undelivered") {
              status = "failed";
            } else {
              // Default to sent for any unknown status
              status = "sent";
              console.warn(`Unknown Twilio status: ${twilioStatus}, defaulting to 'sent'`);
            }
          } catch (twilioError: any) {
            console.error(`Twilio error sending to ${formattedPhone}:`, twilioError);
            failedMessages.push({
              leadId: lead.id,
              error: twilioError.message || "Failed to send SMS via Twilio",
            });
            continue;
          }
        } else {
          // Fallback to simulation mode if Twilio not configured
          twilioSid = `SIM${Math.random().toString(36).substr(2, 9)}`;
          status = "sent"; // Use 'sent' instead of 'simulated' to match DB constraint
          console.warn("Twilio not configured or no phone numbers available. SMS simulated.");
        }

        // Log the SMS message
        const { data: smsMessage, error: smsError } = await supabase
          .from("sms_messages")
          .insert({
            lead_id: lead.id,
            user_id: user.id,
            organization_id: profile.organization_id,
            template_id: templateId || null,
            phone_number: lead.phone,
            message: personalizedMessage,
            status: status,
            twilio_sid: twilioSid,
            sent_at: new Date().toISOString(),
            direction: "outbound",
            is_read: true, // Outbound messages are always "read" by us
          })
          .select()
          .single();

        if (smsError) {
          console.error("Error logging SMS:", smsError);
          console.error("SMS Error Details:", JSON.stringify(smsError, null, 2));
          failedMessages.push({
            leadId: lead.id,
            error: `Failed to log message: ${smsError.message || smsError.code || "Unknown error"}`,
          });
          continue;
        }

        console.log("SMS saved successfully:", smsMessage?.id);

        // Create activity record
        await supabase.from("lead_activities").insert({
          lead_id: lead.id,
          user_id: user.id,
          organization_id: profile.organization_id,
          activity_type: "sms_sent",
          activity_data: { message_id: smsMessage.id },
          description: `SMS sent: ${message.substring(0, 50)}${message.length > 50 ? "..." : ""}`,
        });

        sentMessages.push({
          leadId: lead.id,
          leadName: lead.name,
          messageId: smsMessage.id,
        });
      } catch (error) {
        console.error(`Error sending SMS to lead ${lead.id}:`, error);
        failedMessages.push({
          leadId: lead.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully sent ${sentMessages.length} SMS messages`,
      sent: sentMessages,
      failed: failedMessages,
      sentCount: sentMessages.length,
      failedCount: failedMessages.length,
      totalAttempted: leads.length,
    });
  } catch (error) {
    console.error("Error in SMS send API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

