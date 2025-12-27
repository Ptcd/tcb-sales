import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Use service role for webhook (no user auth)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log env var status on module load (only once)
console.log("[Inbound Webhook] Supabase URL configured:", !!supabaseUrl);
console.log("[Inbound Webhook] Service key configured:", !!supabaseServiceKey);

/**
 * Verify Mailgun webhook signature
 */
function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string
): boolean {
  const encodedToken = crypto
    .createHmac("sha256", signingKey)
    .update(timestamp + token)
    .digest("hex");
  return encodedToken === signature;
}

/**
 * Extract lead ID from reply-to address
 * Format: lead-{uuid}@reply.domain.com or {uuid}@reply.domain.com
 */
function extractLeadIdFromRecipient(recipient: string): string | null {
  if (!recipient) return null;
  
  // Extract the local part (before @)
  const localPart = recipient.split("@")[0];
  
  // Check if it's in format "lead-{uuid}" or just "{uuid}"
  if (localPart.startsWith("lead-")) {
    return localPart.replace("lead-", "");
  }
  
  // Check if it looks like a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(localPart)) {
    return localPart;
  }
  
  return null;
}

/**
 * POST /api/email/inbound
 * Webhook endpoint for Mailgun to forward incoming emails
 * 
 * Mailgun sends inbound emails as multipart/form-data with:
 * - sender: From email address
 * - recipient: To email address (your reply address)
 * - subject: Email subject
 * - body-plain: Plain text content
 * - body-html: HTML content
 * - stripped-text: Text without quoted parts
 * - stripped-html: HTML without quoted parts
 * - Message-Id: Email message ID
 * - In-Reply-To: Original message ID (for threading)
 * - timestamp, token, signature: For verification
 * - attachments: File attachments (as files)
 */
export async function POST(request: NextRequest) {
  console.log("=== INBOUND EMAIL WEBHOOK CALLED ===");
  console.log("Content-Type:", request.headers.get("content-type"));
  
  try {
    const contentType = request.headers.get("content-type") || "";
    let emailData: any = {};

    // Parse based on content type
    if (contentType.includes("multipart/form-data")) {
      // Mailgun format
      const formData = await request.formData();
      
      // Convert FormData to object
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          // Handle file attachments later
          if (!emailData.attachments) emailData.attachments = [];
          emailData.attachments.push({
            filename: value.name,
            contentType: value.type,
            size: value.size,
            file: value,
          });
        } else {
          emailData[key] = value;
        }
      }
      
      console.log("Received Mailgun inbound email:", {
        sender: emailData.sender,
        recipient: emailData.recipient,
        subject: emailData.subject,
        timestamp: emailData.timestamp,
      });

      // Verify Mailgun signature if signing key is configured
      const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
      if (signingKey) {
        const timestamp = emailData.timestamp;
        const token = emailData.token;
        const signature = emailData.signature;

        if (!timestamp || !token || !signature) {
          console.error("Missing Mailgun signature fields");
          return NextResponse.json({ error: "Missing signature" }, { status: 401 });
        }

        if (!verifyMailgunSignature(timestamp, token, signature, signingKey)) {
          console.error("Invalid Mailgun signature");
          return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }
      }
    } else if (contentType.includes("application/json")) {
      // Brevo or other JSON format (backward compatibility)
      emailData = await request.json();
      
      console.log("Received JSON inbound email:", JSON.stringify(emailData, null, 2));

      // Verify Brevo webhook secret if configured
      const webhookSecret = process.env.BREVO_INBOUND_WEBHOOK_SECRET;
      if (webhookSecret) {
        const providedSecret = request.headers.get("x-webhook-secret");
        if (providedSecret !== webhookSecret) {
          console.error("Invalid webhook secret");
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
    } else {
      // Try to parse as form-urlencoded (some webhooks use this)
      const text = await request.text();
      const params = new URLSearchParams(text);
      for (const [key, value] of params.entries()) {
        emailData[key] = value;
      }
    }

    // Check env vars
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase configuration");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract sender info - handle multiple formats
    const fromEmail = 
      emailData.sender ||                          // Mailgun
      emailData.From?.Address ||                   // Brevo
      emailData.from?.address ||                   // Alternative
      emailData.from ||                            // Simple
      null;
    
    const fromName = 
      emailData["from-name"] ||                    // Mailgun
      emailData.From?.Name ||                      // Brevo
      emailData.from?.name ||                      // Alternative
      "";

    // Extract recipient info (the reply address with lead ID)
    const toEmail = 
      emailData.recipient ||                       // Mailgun
      (Array.isArray(emailData.To) ? emailData.To[0]?.Address : emailData.To) ||  // Brevo
      emailData.to ||                              // Simple
      null;

    // Extract email content
    const subject = 
      emailData.subject ||                         // Mailgun
      emailData.Subject ||                         // Brevo
      "(No Subject)";
    
    const htmlContent = 
      emailData["body-html"] ||                    // Mailgun
      emailData["stripped-html"] ||                // Mailgun stripped
      emailData.HtmlBody ||                        // Brevo
      emailData.html ||                            // Alternative
      "";
    
    const textContent = 
      emailData["body-plain"] ||                   // Mailgun
      emailData["stripped-text"] ||                // Mailgun stripped
      emailData.TextBody ||                        // Brevo
      emailData.text ||                            // Alternative
      "";
    
    const messageId = 
      emailData["Message-Id"] ||                   // Mailgun
      emailData.MessageId ||                       // Brevo
      emailData.messageId ||                       // Alternative
      null;
    
    const inReplyTo = 
      emailData["In-Reply-To"] ||                  // Mailgun
      emailData.InReplyTo ||                       // Brevo
      emailData.inReplyTo ||                       // Alternative
      null;

    const receivedAt = 
      emailData.Date ||                            // Mailgun
      emailData.date ||                            // Alternative
      new Date().toISOString();

    if (!fromEmail) {
      console.error("No sender email in webhook payload");
      return NextResponse.json({ error: "Missing sender email" }, { status: 400 });
    }

    // Try to extract lead ID from the recipient address
    // Format: lead-{uuid}@reply.junkcarcalc.com
    const extractedLeadId = extractLeadIdFromRecipient(toEmail);
    
    let lead = null;
    let organizationId: string | null = null;
    let campaignId: string | null = null;

    // First, try to find lead by extracted ID from recipient
    if (extractedLeadId) {
      const { data: leadById } = await supabase
        .from("search_results")
        .select("id, name, address, email, organization_id")
        .eq("id", extractedLeadId)
        .single();
      
      if (leadById) {
        lead = leadById;
        organizationId = leadById.organization_id;
        console.log("Found lead by recipient ID:", lead.id);
      }
    }

    // If not found by ID, try to find by sender email
    if (!lead) {
      const { data: leadByEmail } = await supabase
        .from("search_results")
        .select("id, name, address, email, organization_id")
        .ilike("email", fromEmail)
        .limit(1)
        .single();
      
      if (leadByEmail) {
        lead = leadByEmail;
        organizationId = leadByEmail.organization_id;
        console.log("Found lead by sender email:", lead.id);
      }
    }

    // Try to find campaign by recipient domain/address pattern
    if (toEmail && !campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id, organization_id")
        .ilike("email_address", `%${toEmail.split("@")[1]}%`)
        .limit(1)
        .single();
      
      if (campaign) {
        campaignId = campaign.id;
        organizationId = organizationId || campaign.organization_id;
      }
    }

    // Try to find thread by In-Reply-To header
    let threadId: string | null = null;
    if (inReplyTo) {
      const { data: originalEmail } = await supabase
        .from("email_messages")
        .select("thread_id, id, lead_id, organization_id")
        .eq("message_id", inReplyTo)
        .limit(1)
        .single();
      
      if (originalEmail) {
        threadId = originalEmail.thread_id || originalEmail.id;
        // If we didn't find lead by other means, use the one from original email
        if (!lead && originalEmail.lead_id) {
          const { data: originalLead } = await supabase
            .from("search_results")
            .select("id, name, address, organization_id")
            .eq("id", originalEmail.lead_id)
            .single();
          if (originalLead) {
            lead = originalLead;
            organizationId = originalLead.organization_id;
          }
        }
        organizationId = organizationId || originalEmail.organization_id;
      }
    }

    // If still no thread, try to match by sender email + lead
    if (!threadId && lead) {
      const { data: existingThread } = await supabase
        .from("email_messages")
        .select("thread_id, id")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (existingThread) {
        threadId = existingThread.thread_id || existingThread.id;
      }
    }

    // Generate a new thread ID if none found
    if (!threadId) {
      threadId = crypto.randomUUID();
    }

    // Save the inbound email
    console.log("Attempting to save email with data:", {
      lead_id: lead?.id || null,
      organization_id: organizationId,
      from_email: fromEmail,
      to_email: toEmail,
      subject: subject,
      direction: "inbound",
      thread_id: threadId,
    });

    const { data: savedEmail, error: saveError } = await supabase
      .from("email_messages")
      .insert({
        lead_id: lead?.id || null,
        campaign_id: campaignId,
        organization_id: organizationId,
        from_email: fromEmail,
        to_email: toEmail || "unknown",
        subject: subject,
        html_content: htmlContent || `<pre>${textContent}</pre>`,
        text_content: textContent,
        status: "received",
        direction: "inbound",
        is_read: false,
        thread_id: threadId,
        message_id: messageId,
        in_reply_to: inReplyTo,
        sent_at: receivedAt,
        lead_name: lead?.name || fromName || fromEmail.split("@")[0],
        lead_address: lead?.address || null,
      })
      .select()
      .single();

    if (saveError) {
      console.error("=== DATABASE SAVE ERROR ===");
      console.error("Error code:", saveError.code);
      console.error("Error message:", saveError.message);
      console.error("Error details:", saveError.details);
      console.error("Error hint:", saveError.hint);
      return NextResponse.json({ 
        error: "Failed to save email", 
        code: saveError.code,
        message: saveError.message,
        details: saveError.details
      }, { status: 500 });
    }
    
    console.log("Email saved successfully:", savedEmail?.id);

    // Handle attachments if present
    const attachments = emailData.attachments || [];
    if (attachments.length > 0 && savedEmail) {
      for (const attachment of attachments) {
        const filename = attachment.filename || attachment.Name || attachment.name || "attachment";
        const contentType = attachment.contentType || attachment.ContentType || attachment.type || "application/octet-stream";
        const size = attachment.size || attachment.ContentLength || attachment.contentLength || 0;
        
        console.log(`Attachment received: ${filename} (${contentType}, ${size} bytes)`);
        
        // Save attachment metadata
        await supabase.from("email_attachments").insert({
          email_message_id: savedEmail.id,
          filename: filename,
          content_type: contentType,
          size_bytes: size,
          storage_path: `inbound/${savedEmail.id}/${filename}`,
        });
      }
    }

    // Log activity if we found a lead
    if (lead) {
      await supabase.from("lead_activities").insert({
        lead_id: lead.id,
        organization_id: organizationId,
        activity_type: "email_received",
        description: `Received email: ${subject}`,
        activity_data: {
          email_id: savedEmail.id,
          from_email: fromEmail,
          subject: subject,
        },
      });
    }

    console.log("Inbound email saved successfully:", savedEmail.id, {
      leadId: lead?.id,
      threadId,
      organizationId,
    });

    // Mailgun expects a 200 response
    return NextResponse.json({
      success: true,
      emailId: savedEmail.id,
      leadId: lead?.id || null,
      threadId: threadId,
    });
  } catch (error: any) {
    console.error("=== INBOUND EMAIL ERROR ===");
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error?.message || "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/email/inbound
 * Health check endpoint for webhook verification
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Email inbound webhook is active (Mailgun/Brevo compatible)",
    timestamp: new Date().toISOString(),
  });
}
