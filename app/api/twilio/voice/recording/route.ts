import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as brevo from "@getbrevo/brevo";
import twilio from "twilio";

const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilioAccountSid && twilioAuthToken ? twilio(twilioAccountSid, twilioAuthToken) : null;
const twilioFromNumber = process.env.TWILIO_CRM_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

/**
 * POST /api/twilio/voice/recording
 * Called when a voicemail recording is complete
 * Sends email notifications to assigned user and admins
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const url = new URL(request.url);
    
    const callSid = formData.get("CallSid") as string;
    const recordingSid = formData.get("RecordingSid") as string;
    const recordingUrl = formData.get("RecordingUrl") as string;
    const recordingDuration = formData.get("RecordingDuration") as string;
    const userId = url.searchParams.get("userId");
    
    console.log("=== VOICEMAIL RECORDING CALLBACK ===");
    console.log("Recording callback:", {
      callSid,
      recordingSid,
      recordingUrl,
      recordingDuration,
      userId,
      formDataKeys: Array.from(formData.keys()),
    });

    // Use service role client
    const supabase = createServiceRoleClient();

    // Get call with lead and user info
    let { data: callData, error: callError } = await supabase
      .from("calls")
      .select(`
        id,
        lead_id,
        user_id,
        organization_id,
        phone_number,
        campaign_id,
        notes,
        search_results:lead_id (
          id,
          name,
          phone
        )
      `)
      .eq("twilio_call_sid", callSid)
      .single();

    // FALLBACK: If call record doesn't exist, try to create it from Twilio API
    if (callError || !callData) {
      console.warn("WARNING: No call found with twilio_call_sid:", callSid);
      console.warn("Call error details:", callError);
      
      // Try to get call info from Twilio API
      if (twilioClient) {
        try {
          const twilioCall = await twilioClient.calls(callSid).fetch();
          console.log("Fetched call from Twilio:", {
            from: twilioCall.from,
            to: twilioCall.to,
            status: twilioCall.status,
          });

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
                user_id: twilioNumber.assigned_user_id || userId || null,
                organization_id: twilioNumber.organization_id,
                campaign_id: twilioNumber.campaign_id || null,
                phone_number: twilioCall.from,
                twilio_call_sid: callSid,
                call_type: "inbound",
                direction: "inbound",
                status: "completed",
                initiated_at: twilioCall.dateCreated?.toISOString() || new Date().toISOString(),
              })
              .select(`
                id,
                lead_id,
                user_id,
                organization_id,
                phone_number,
                campaign_id,
                notes,
                search_results:lead_id (
                  id,
                  name,
                  phone
                )
              `)
              .single();

            if (insertError) {
              console.error("ERROR: Failed to create call record:", insertError);
            } else {
              console.log("SUCCESS: Created missing call record:", newCall?.id);
              callData = newCall;
              callError = null;
            }
          } else {
            console.error("ERROR: Could not find organization for phone number:", twilioCall.to);
          }
        } catch (twilioError: any) {
          console.error("ERROR: Failed to fetch call from Twilio:", twilioError);
        }
      }

      // If we still don't have call data, we can't proceed
      if (!callData) {
        console.error("CRITICAL: Cannot proceed without call record or organization");
        // Don't return error - Twilio expects 200 OK
        return new NextResponse("", { status: 200 });
      }
    }

    console.log("Found call record:", {
      callId: callData.id,
      leadId: callData.lead_id,
      userId: callData.user_id,
      organizationId: callData.organization_id,
    });

    // STEP 1: Find which Twilio number received this call
    // We need to get the "To" number from the call - this is stored in the call record
    // For now, we'll look up by matching the call's phone_number (caller) and organization
    // Actually, we need to get the Twilio number that was called
    // Since we don't store "To" in calls table, we'll need to find it via the call's context
    // For now, let's get the phone number owner from the call's user_id or find by organization
    
    // Get the phone number owner (assigned_user_id from twilio_phone_numbers)
    // We'll need to find which number was called - this should be passed in the URL or we can infer
    // For now, let's prioritize: if call has user_id, that's likely the assigned user
    let phoneNumberOwnerId: string | null = callData.user_id || null;
    let campaignInfo: { id: string; name: string } | null = null;

    // Try to find the Twilio number that received this call
    // We can infer from the organization and look for numbers with assigned users
    if (callData.organization_id) {
      // Get campaign info if available
      if (callData.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("id, name")
          .eq("id", callData.campaign_id)
          .single();
        campaignInfo = campaign ? { id: campaign.id, name: campaign.name } : null;
      }

      // If we have a campaign, try to find the phone number assigned to that campaign
      if (callData.campaign_id) {
        const { data: twilioNumber } = await supabase
          .from("twilio_phone_numbers")
          .select("assigned_user_id, campaign_id")
          .eq("organization_id", callData.organization_id)
          .eq("campaign_id", callData.campaign_id)
          .limit(1)
          .single();
        
        if (twilioNumber?.assigned_user_id) {
          phoneNumberOwnerId = twilioNumber.assigned_user_id;
        }
      } else {
        // No campaign, find any number in the organization with an assigned user
        const { data: twilioNumber } = await supabase
          .from("twilio_phone_numbers")
          .select("assigned_user_id")
          .eq("organization_id", callData.organization_id)
          .not("assigned_user_id", "is", null)
          .limit(1)
          .single();
        
        if (twilioNumber?.assigned_user_id) {
          phoneNumberOwnerId = twilioNumber.assigned_user_id;
        }
      }
    }

    // CAPITAL GOVERNANCE: Delete recording if duration < 150s
    const recordingDurationInt = parseInt(recordingDuration || "0", 10);
    if (recordingDurationInt > 0 && recordingDurationInt < 150 && twilioClient) {
      try {
        await twilioClient.recordings(recordingSid).remove();
        console.log(`[GOVERNANCE] Deleted recording ${recordingSid} (duration: ${recordingDurationInt}s < 150s)`);
        // Don't save recording info for short calls
        return NextResponse.json({ 
          success: true, 
          message: "Recording deleted (duration < 150s)" 
        });
      } catch (err: any) {
        console.error(`[GOVERNANCE] Failed to delete recording ${recordingSid}:`, err.message);
        // Continue to save if deletion fails (better to have it than lose it)
      }
    }

    // Update the call record with voicemail info
    console.log("Updating call record with voicemail info...");
    let updatedCall = callData;
    const { data: updatedCallData, error: updateError } = await supabase
      .from("calls")
      .update({
        recording_url: recordingUrl,
        twilio_recording_sid: recordingSid,
        voicemail_left: true,
        notes: callData.notes || "Voicemail left by caller",
        duration: recordingDurationInt,
        status: "completed",
        outcome: "no_answer",
        is_new: true, // Mark as unread
        ended_at: new Date().toISOString(),
      })
      .eq("twilio_call_sid", callSid)
      .select()
      .single();

    if (updateError) {
      console.error("ERROR: Failed to update call with recording:", updateError);
      console.error("Update error details:", JSON.stringify(updateError, null, 2));
      // Use existing call data if update fails
      updatedCall = callData;
    } else {
      updatedCall = updatedCallData;
      console.log("SUCCESS: Voicemail recording saved:", {
        recordingSid,
        recordingUrl,
        callId: updatedCall?.id,
        duration: recordingDuration,
      });
    }

    // Get transcription if available
    let transcription = "";
    if (updatedCall?.notes && updatedCall.notes.includes("Voicemail Transcription:")) {
      transcription = updatedCall.notes.replace("Voicemail Transcription: ", "");
    }

    // Get lead info
    const lead = callData.search_results as any;
    const leadName = lead?.name || callData.phone_number;
    const leadPhone = lead?.phone || callData.phone_number;

    // Get phone number owner (primary recipient) and organization admins for notifications
    const emailsToNotify: string[] = [];
    const phoneNumbersToNotify: Array<{ phone: string; userId: string }> = [];
    
    if (callData.organization_id) {
      // PRIORITY: Get phone number owner info (the user assigned to the Twilio number)
      if (phoneNumberOwnerId) {
        const { data: phoneOwner } = await supabase
          .from("user_profiles")
          .select("email, forwarding_phone, full_name")
          .eq("id", phoneNumberOwnerId)
          .single();
        
        if (phoneOwner?.email) {
          emailsToNotify.push(phoneOwner.email);
        }
        if (phoneOwner?.forwarding_phone) {
          phoneNumbersToNotify.push({
            phone: phoneOwner.forwarding_phone,
            userId: phoneNumberOwnerId,
          });
        }
      }

      // Also notify the call's user_id if different from phone owner
      if (callData.user_id && callData.user_id !== phoneNumberOwnerId) {
        const { data: callUser } = await supabase
          .from("user_profiles")
          .select("email, forwarding_phone")
          .eq("id", callData.user_id)
          .single();
        
        if (callUser?.email && !emailsToNotify.includes(callUser.email)) {
          emailsToNotify.push(callUser.email);
        }
        if (callUser?.forwarding_phone) {
          phoneNumbersToNotify.push({
            phone: callUser.forwarding_phone,
            userId: callData.user_id,
          });
        }
      }

      // Get admin info (secondary notification)
      const { data: admins } = await supabase
        .from("user_profiles")
        .select("id, email, forwarding_phone")
        .eq("organization_id", callData.organization_id)
        .eq("role", "admin");

      if (admins) {
        admins.forEach((admin) => {
          if (admin.email && !emailsToNotify.includes(admin.email)) {
            emailsToNotify.push(admin.email);
          }
          if (admin.forwarding_phone) {
            phoneNumbersToNotify.push({
              phone: admin.forwarding_phone,
              userId: admin.id,
            });
          }
        });
      }
    }

    // Send email notifications
    console.log("Email notification setup:", {
      hasBrevoClient: !!brevoClient,
      hasBrevoApiKey: !!brevoApiKey,
      emailsToNotifyCount: emailsToNotify.length,
      emailsToNotify: emailsToNotify,
    });

    if (brevoClient && brevoApiKey && emailsToNotify.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const callUrl = `${appUrl}/dashboard/call-history`;

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
            .content { background-color: #f9fafb; padding: 20px; border-radius: 0 0 5px 5px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px; }
            .info { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .transcription { background-color: #f3f4f6; padding: 15px; border-left: 4px solid #4F46E5; margin: 15px 0; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>New Voicemail Received</h2>
            </div>
            <div class="content">
              <p>You have received a new voicemail message.</p>
              
              <div class="info">
                <strong>From:</strong> ${leadName}<br>
                <strong>Phone:</strong> ${leadPhone}<br>
                ${campaignInfo ? `<strong>Campaign:</strong> ${campaignInfo.name}<br>` : ""}
                <strong>Duration:</strong> ${recordingDuration || "0"} seconds<br>
                <strong>Received:</strong> ${new Date().toLocaleString()}
              </div>

              ${transcription ? `
                <div class="transcription">
                  <strong>Transcription:</strong><br>
                  ${transcription}
                </div>
              ` : ""}

              <p>
                <a href="${callUrl}" class="button">View Call History</a>
              </p>

              <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
                You can listen to the voicemail recording in your call history.
              </p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
New Voicemail Received

You have received a new voicemail message.

From: ${leadName}
Phone: ${leadPhone}
${campaignInfo ? `Campaign: ${campaignInfo.name}\n` : ""}Duration: ${recordingDuration || "0"} seconds
Received: ${new Date().toLocaleString()}

${transcription ? `Transcription: ${transcription}` : ""}

View call history: ${callUrl}
      `;

      try {
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = `New Voicemail from ${leadName}`;
        sendSmtpEmail.htmlContent = emailHtml;
        sendSmtpEmail.textContent = emailText;
        sendSmtpEmail.sender = {
          name: "CRM System",
          email: "no-reply@autosalvageautomation.com",
        };
        sendSmtpEmail.to = emailsToNotify.map((email) => ({ email }));

        const emailResult = await brevoClient.sendTransacEmail(sendSmtpEmail);
        console.log(`SUCCESS: Voicemail notification emails sent to: ${emailsToNotify.join(", ")}`);
        console.log("Email result:", emailResult);
      } catch (emailError: any) {
        console.error("ERROR: Failed to send voicemail notification emails:", emailError);
        console.error("Email error details:", JSON.stringify(emailError, null, 2));
        // Don't fail the request if email fails
      }
    } else {
      console.warn("WARNING: Email notifications not sent - missing brevoClient, brevoApiKey, or no emails to notify");
    }

    // Send SMS notifications
    if (twilioClient && twilioFromNumber && phoneNumbersToNotify.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const callUrl = `${appUrl}/dashboard/call-history`;

      // Create SMS message (shortened for SMS)
      const smsMessage = `New voicemail from ${leadName} (${leadPhone}). ${transcription ? `Transcription: ${transcription.substring(0, 100)}${transcription.length > 100 ? "..." : ""}` : `Duration: ${recordingDuration}s`}. View: ${callUrl}`;

      // Send SMS to each phone number
      for (const { phone, userId } of phoneNumbersToNotify) {
        try {
          await twilioClient.messages.create({
            body: smsMessage,
            from: twilioFromNumber,
            to: phone,
          });

          // Log SMS in database
          await supabase.from("sms_messages").insert({
            lead_id: callData.lead_id,
            user_id: userId,
            organization_id: callData.organization_id,
            phone_number: phone,
            message: smsMessage,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          console.log(`Voicemail notification SMS sent to: ${phone}`);
        } catch (smsError: any) {
          console.error(`Error sending SMS to ${phone}:`, smsError);
          // Don't fail the request if SMS fails
        }
      }
    }

    return new NextResponse("", { status: 200 });
  } catch (error) {
    console.error("Error in recording callback:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

