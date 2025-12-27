import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as brevo from "@getbrevo/brevo";

// Initialize Brevo
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

// Inbound domain for Reply-To headers (e.g., "reply.junkcarcalc.com")
const INBOUND_DOMAIN = process.env.MAILGUN_INBOUND_DOMAIN || process.env.INBOUND_EMAIL_DOMAIN || null;

// Default sender email - MUST be verified in Brevo!
// Set this in your environment variables
const DEFAULT_SENDER_EMAIL = process.env.DEFAULT_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || "noreply@yourdomain.com";
const DEFAULT_SENDER_NAME = process.env.DEFAULT_SENDER_NAME || "Junk Car Calc";

/**
 * Generate a Reply-To address that includes the lead ID for routing
 * Format: lead-{leadId}@reply.domain.com
 */
function generateReplyToAddress(leadId: string, domain: string | null): string | null {
  if (!domain) return null;
  return `lead-${leadId}@${domain}`;
}

/**
 * POST /api/email/send
 * Send emails to selected leads (bulk or single)
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

    // Get user's organization and SDR code
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("organization_id, sdr_code")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Generate tracking URL if user has SDR code
    const JCC_SIGNUP_BASE_URL = process.env.NEXT_PUBLIC_JCC_SIGNUP_URL || "https://autosalvageautomation.com/try-the-calculator";
    const trackingUrl = profile.sdr_code 
      ? `${JCC_SIGNUP_BASE_URL}?sdr=${encodeURIComponent(profile.sdr_code)}`
      : "";

    const { leadIds, templateId, subject, htmlContent, textContent, fromName, fromEmail, isScheduled, scheduledFor, campaignId } = await request.json();

    if (!leadIds || leadIds.length === 0) {
      return NextResponse.json(
        { error: "At least one lead is required" },
        { status: 400 }
      );
    }

    if (!subject || !htmlContent) {
      return NextResponse.json(
        { error: "Subject and content are required" },
        { status: 400 }
      );
    }

    // Fetch leads
    const { data: leads, error: leadsError } = await supabase
      .from("search_results")
      .select("id, name, address, email, phone")
      .in("id", leadIds);

    console.log("Fetching leads:", { leadIds, leadsFound: leads?.length, error: leadsError });

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Database error fetching leads" },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      console.error("No leads found for IDs:", leadIds);
      return NextResponse.json(
        { error: "No valid leads found" },
        { status: 404 }
      );
    }

    // Filter leads with valid emails
    const leadsWithEmail = leads.filter(lead => lead.email && lead.email.includes('@'));
    
    if (leadsWithEmail.length === 0) {
      return NextResponse.json(
        { error: "No leads have valid email addresses" },
        { status: 400 }
      );
    }

    // Campaign required
    if (!campaignId) {
      return NextResponse.json(
        { error: "A campaign is required to send emails." },
        { status: 400 }
      );
    }

    // Get campaign and validate org + email settings
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id, email_address, email_from_name")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (!campaign.email_address) {
      return NextResponse.json(
        { error: "Campaign is missing sender email. Add email settings to the campaign before sending." },
        { status: 400 }
      );
    }

    // Verify user is a member of the campaign
    const { data: membership, error: membershipError } = await supabase
      .from("campaign_members")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "You must be a member of this campaign to send emails." },
        { status: 403 }
      );
    }

    // Get template name if templateId provided
    let templateName: string | null = null;
    if (templateId) {
      const { data: template } = await supabase
        .from("email_templates")
        .select("name")
        .eq("id", templateId)
        .single();
      templateName = template?.name || null;
    }

    // Use campaign sender (required). DO NOT use user's personal email.
    const senderEmail = campaign.email_address;
    const senderName = (fromName && fromName.trim()) || campaign.email_from_name || DEFAULT_SENDER_NAME;

    const results = {
      success: 0,
      failed: 0,
      total: leadsWithEmail.length,
      messages: [] as any[],
    };

    // Send emails
    for (const lead of leadsWithEmail) {
      try {
        // Personalize content
        const personalizedSubject = replaceVariables(subject, lead, senderName, trackingUrl, lead.phone);
        const personalizedHtml = replaceVariables(htmlContent, lead, senderName, trackingUrl, lead.phone);
        const personalizedText = textContent ? replaceVariables(textContent, lead, senderName, trackingUrl, lead.phone) : undefined;

        let providerMessageId: string | null = null;
        let status: string = "pending";
        let errorMessage: string | null = null;

        // If scheduled, don't send now - just save to database
        if (isScheduled) {
          status = "scheduled";
          results.success++;
        }
        // Try to send with Brevo if configured and not scheduled
        else if (brevoClient) {
          try {
            const sendSmtpEmail = new brevo.SendSmtpEmail();
            sendSmtpEmail.subject = personalizedSubject;
            sendSmtpEmail.htmlContent = personalizedHtml;
            sendSmtpEmail.textContent = personalizedText;
            sendSmtpEmail.sender = { 
              name: senderName, 
              email: senderEmail 
            };
            
            // Set Reply-To address for inbound routing
            // Priority: 1) Lead-specific reply address (for Mailgun routing)
            //           2) User-provided fromEmail
            //           3) Default to sender email
            const leadReplyTo = generateReplyToAddress(lead.id, INBOUND_DOMAIN);
            if (leadReplyTo) {
              // Use lead-specific reply address so replies route to our webhook
              sendSmtpEmail.replyTo = { 
                email: leadReplyTo,
                name: senderName 
              };
            } else if (fromEmail && fromEmail.trim() !== "") {
              sendSmtpEmail.replyTo = { email: fromEmail };
            }
            
            sendSmtpEmail.to = [
              { 
                email: lead.email!, 
                name: lead.name || "" 
              }
            ];
            sendSmtpEmail.tags = ["outreach", `lead_${lead.id}`];

            // Add custom headers for threading
            sendSmtpEmail.headers = {
              "X-Lead-ID": lead.id,
              "X-Organization-ID": profile.organization_id,
            };

            const response = await brevoClient.sendTransacEmail(sendSmtpEmail);
            
            providerMessageId = response.body.messageId || null;
            status = "sent";
            results.success++;
          } catch (brevoErr: any) {
            console.error(`Brevo error for ${lead.email}:`, brevoErr);
            errorMessage = brevoErr.message || "Failed to send";
            status = "failed";
            results.failed++;
          }
        } else {
          // Simulate email sending if Brevo not configured
          console.warn("Brevo not configured. Email simulated.");
          providerMessageId = `SIM-${Math.random().toString(36).substr(2, 9)}`;
          status = "sent";
          results.success++;
        }

        // Generate a unique message ID for threading
        const generatedMessageId = `<${crypto.randomUUID()}@${INBOUND_DOMAIN || 'crm.local'}>`;
        const replyToAddress = generateReplyToAddress(lead.id, INBOUND_DOMAIN);

        // Save to database
        const { data: message, error: dbError } = await supabase
          .from("email_messages")
          .insert({
            user_id: user.id,
            organization_id: profile.organization_id,
            lead_id: lead.id,
            template_id: templateId || null,
            campaign_id: campaignId || null,
            to_email: lead.email!,
            from_email: senderEmail,
            subject: personalizedSubject,
            html_content: personalizedHtml,
            text_content: personalizedText || null,
            status: isScheduled ? "scheduled" : status,
            direction: "outbound",
            is_read: true,
            is_scheduled: isScheduled || false,
            scheduled_for: isScheduled ? scheduledFor : null,
            provider_message_id: providerMessageId,
            message_id: generatedMessageId,
            sent_at: (!isScheduled && status === "sent") ? new Date().toISOString() : null,
            error_message: errorMessage,
            lead_name: lead.name,
            lead_address: lead.address,
            template_name: templateName,
          })
          .select()
          .single();

        if (dbError) {
          console.error("Error saving email message:", dbError);
        }

        // Log activity
        if (status === "sent" || status === "scheduled") {
          await supabase.from("lead_activities").insert({
            lead_id: lead.id,
            user_id: user.id,
            organization_id: profile.organization_id,
            activity_type: status === "scheduled" ? "email_scheduled" : "email_sent",
            description: status === "scheduled" 
              ? `Scheduled email for ${new Date(scheduledFor).toLocaleString()}: ${personalizedSubject}`
              : `Sent email: ${personalizedSubject}`,
            activity_data: {
              email_id: message?.id,
              to_email: lead.email,
              subject: personalizedSubject,
              scheduled_for: isScheduled ? scheduledFor : null,
            },
          });
        }

        results.messages.push({
          leadId: lead.id,
          leadName: lead.name,
          toEmail: lead.email,
          status,
          messageId: message?.id,
          providerMessageId,
          errorMessage,
        });
      } catch (err: any) {
        console.error(`Error processing email for lead ${lead.id}:`, err);
        results.failed++;
        results.messages.push({
          leadId: lead.id,
          leadName: lead.name,
          toEmail: lead.email,
          status: "failed",
          errorMessage: err.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${results.success} emails, ${results.failed} failed`,
      results,
    });
  } catch (error) {
    console.error("Error in POST /api/email/send:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to replace variables in content
function replaceVariables(
  content: string,
  lead: any,
  senderName: string,
  trackingUrl: string,
  senderPhone?: string
): string {
  return content
    .replace(/\{\{name\}\}/g, lead.name || "there")
    .replace(/\{\{address\}\}/g, lead.address || "your location")
    .replace(/\{\{email\}\}/g, lead.email || "")
    .replace(/\{\{phone\}\}/g, senderPhone || "")
    .replace(/\{\{sender_name\}\}/g, senderName)
    .replace(/\{\{tracking_url\}\}/g, trackingUrl)
    .replace(/\{\{unsubscribe_url\}\}/g, process.env.NEXT_PUBLIC_APP_URL + "/unsubscribe");
}

