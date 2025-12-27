import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { JCC_FEATURES_ENABLED } from "@/lib/config";

/**
 * POST /api/trials/provision
 * 
 * Provision a free trial on JCC for a prospect during a call.
 * This is called from the CRM when an SDR clicks "Start Free Trial".
 * 
 * Request body:
 * {
 *   leadId: string,           // CRM lead ID (required)
 *   businessName: string,     // Business name (required)
 *   contactName?: string,     // Contact name (optional)
 *   email: string,            // Email (required)
 *   phone?: string,           // Phone (optional)
 *   website?: string,         // Website (optional)
 *   source?: string,          // Source: "cold_call" | "inbound_call" | "manual"
 * }
 * 
 * Flow:
 * 1. Validate input
 * 2. Get SDR user info (for attribution)
 * 3. Call JCC's /api/provision-trial endpoint
 * 4. Update CRM lead status to "trial_started"
 * 5. Create sdr_client_links entry for attribution
 * 6. Log activity
 * 7. Return result
 */
export async function POST(request: NextRequest) {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const supabaseService = createServiceRoleClient();
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      leadId, 
      businessName, 
      contactName, 
      email, 
      phone, 
      website, 
      source = "cold_call" 
    } = body;

    // Validate required fields
    if (!leadId) {
      return NextResponse.json(
        { error: "leadId is required" },
        { status: 400 }
      );
    }

    if (!businessName?.trim()) {
      return NextResponse.json(
        { error: "businessName is required" },
        { status: 400 }
      );
    }

    if (!email?.trim()) {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Website URL validation and normalization
    if (!website?.trim()) {
      return NextResponse.json(
        { error: "Website URL is required to start a trial" },
        { status: 400 }
      );
    }

    // Normalize URL - add https:// if missing
    let normalizedWebsite = website.trim().toLowerCase();
    if (!normalizedWebsite.startsWith('http://') && !normalizedWebsite.startsWith('https://')) {
      normalizedWebsite = 'https://' + normalizedWebsite;
    }
    // Remove trailing slash
    normalizedWebsite = normalizedWebsite.replace(/\/+$/, '');

    // Get user's profile (for SDR code and organization)
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, organization_id, sdr_code, full_name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Verify lead exists and belongs to this organization
    const { data: lead, error: leadError } = await supabase
      .from("search_results")
      .select("id, name, email, phone, organization_id, client_status")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    if (lead.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Check if lead already has an active trial
    if (lead.client_status && lead.client_status !== "none") {
      return NextResponse.json(
        { 
          error: `Lead already has status: ${lead.client_status}. Cannot start a new trial.`,
          clientStatus: lead.client_status,
        },
        { status: 400 }
      );
    }

    // FIRST: Save all entered data to the lead record (before JCC API call)
    // This ensures data is saved even if JCC API fails
    const leadDataToSave: Record<string, any> = {
      last_contacted_at: new Date().toISOString(),
    };

    // Save all entered data back to the lead
    if (email?.trim()) {
      leadDataToSave.email = email.trim().toLowerCase();
    }
    if (businessName?.trim()) {
      leadDataToSave.name = businessName.trim();
    }
    if (phone?.trim()) {
      leadDataToSave.phone = phone.trim();
    }
    if (normalizedWebsite) {
      leadDataToSave.website = normalizedWebsite;
    }
    if (contactName?.trim()) {
      leadDataToSave.contact_name = contactName.trim();
    }

    // Save lead data immediately
    const { error: preSaveError } = await supabaseService
      .from("search_results")
      .update(leadDataToSave)
      .eq("id", leadId);

    if (preSaveError) {
      console.error("Error saving lead data:", preSaveError);
      // Don't fail - continue with trial provisioning
    } else {
      console.log("Lead data saved successfully:", Object.keys(leadDataToSave));
    }

    // Call JCC's provision-trial API
    const jccApiKey = process.env.JCC_PROVISION_API_KEY;
    const jccApiUrl = process.env.JCC_API_URL || "https://app.autosalvageautomation.com";

    if (!jccApiKey) {
      console.error("JCC_PROVISION_API_KEY not configured");
      return NextResponse.json(
        { error: "Trial provisioning not configured. Please contact support." },
        { status: 500 }
      );
    }

    const jccPayload = {
      email: email.trim().toLowerCase(),
      business_name: businessName.trim(),
      contact_name: contactName?.trim() || undefined,
      phone: phone?.trim() || undefined,
      website: normalizedWebsite || undefined,
      lead_id: leadId,
      sdr_user_id: user.id,
      source,
    };

    console.log("Calling JCC provision-trial API:", {
      url: `${jccApiUrl}/api/provision-trial`,
      payload: { ...jccPayload, email: "***" }, // Redact email in logs
    });

    let jccResponse;
    let jccData;
    
    try {
      jccResponse = await fetch(`${jccApiUrl}/api/provision-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": jccApiKey,
        },
        body: JSON.stringify(jccPayload),
      });
    } catch (fetchError: any) {
      console.error("Failed to reach JCC API:", fetchError);
      return NextResponse.json(
        { 
          error: "Unable to connect to trial provisioning service. Please try again.",
          details: fetchError.message,
        },
        { status: 503 }
      );
    }

    // Try to parse JSON response
    try {
      const responseText = await jccResponse.text();
      if (!responseText) {
        console.error("JCC API returned empty response");
        return NextResponse.json(
          { error: "Trial service returned empty response. The JCC API may not be ready yet." },
          { status: 502 }
        );
      }
      jccData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JCC API response:", parseError);
      return NextResponse.json(
        { 
          error: "Trial service returned invalid response. The JCC API may not be ready yet.",
          httpStatus: jccResponse.status,
        },
        { status: 502 }
      );
    }

    if (!jccResponse.ok) {
      console.error("JCC API error:", jccData);
      return NextResponse.json(
        { 
          error: jccData.error || "Failed to provision trial on JCC",
          details: jccData,
        },
        { status: jccResponse.status }
      );
    }

    console.log("JCC provision-trial response:", {
      success: jccData.success,
      userId: jccData.user_id,
      alreadyExists: jccData.already_exists,
    });

    // Update CRM lead with trial status (lead data was already saved earlier)
    const leadUpdateData: Record<string, any> = {
      lead_status: "trial_started",
      client_status: "trialing",
    };

    // Set SDR attribution (first touch only if not already set)
    if (profile.sdr_code) {
      // We'll handle first-touch vs last-touch in the query
      const { data: currentLead } = await supabaseService
        .from("search_results")
        .select("jcc_sdr_first_touch_code")
        .eq("id", leadId)
        .single();

      if (!currentLead?.jcc_sdr_first_touch_code) {
        leadUpdateData.jcc_sdr_first_touch_code = profile.sdr_code;
      }
      leadUpdateData.jcc_sdr_last_touch_code = profile.sdr_code;
    }

    const { error: leadUpdateError } = await supabaseService
      .from("search_results")
      .update(leadUpdateData)
      .eq("id", leadId);

    if (leadUpdateError) {
      console.error("Error updating lead:", leadUpdateError);
      // Don't fail the request - JCC trial was created successfully
    }

    // Create/update sdr_client_links entry for attribution tracking
    if (jccData.user_id) {
      const { data: existingLink } = await supabaseService
        .from("sdr_client_links")
        .select("id")
        .eq("user_id", jccData.user_id)
        .eq("crm_lead_id", leadId)
        .single();

      if (existingLink) {
        // Update existing link
        await supabaseService
          .from("sdr_client_links")
          .update({ sdr_user_id: user.id })
          .eq("id", existingLink.id);
      } else {
        // Create new link
        await supabaseService
          .from("sdr_client_links")
          .insert({
            user_id: jccData.user_id,
            crm_lead_id: leadId,
            sdr_user_id: user.id,
          });
      }
    }

    // Log activity
    await supabaseService.from("lead_activities").insert({
      lead_id: leadId,
      user_id: user.id,
      organization_id: profile.organization_id,
      activity_type: "status_change",
      description: jccData.already_exists 
        ? `Trial reactivated for existing account (${email})`
        : `Started 20-credit free trial on Junk Car Calculator`,
      activity_data: {
        action: "trial_provisioned",
        email: email.trim().toLowerCase(),
        jcc_user_id: jccData.user_id,
        already_exists: jccData.already_exists,
        credits: jccData.credits || 20,
        sdr_code: profile.sdr_code,
      },
    });

    // Randomly assign follow-up variant (50/50 A/B split)
    const followupVariant = Math.random() < 0.5 ? 'A' : 'B';
    
    // Create/update trial_pipeline with variant
    // First check if record exists to preserve owner_sdr_id attribution
    const { data: existingPipeline } = await supabaseService
      .from("trial_pipeline")
      .select("id, owner_sdr_id")
      .eq("crm_lead_id", leadId)
      .single();

    const pipelineData: Record<string, any> = {
      crm_lead_id: leadId,
      jcc_user_id: jccData.user_id,
      trial_started_at: new Date().toISOString(),
      followup_variant: followupVariant,
    };

    // Only set owner_sdr_id on NEW records, never overwrite existing
    if (!existingPipeline) {
      pipelineData.owner_sdr_id = user.id;
    }

    await supabaseService.from("trial_pipeline").upsert(
      pipelineData,
      { onConflict: 'crm_lead_id' }
    );

    // After the trial_pipeline upsert, link any existing activation_meeting
    const { data: trialPipeline } = await supabaseService
      .from("trial_pipeline")
      .select("id")
      .eq("crm_lead_id", leadId)
      .single();

    if (trialPipeline) {
      // Update any activation_meetings for this lead to link to the trial_pipeline
      await supabaseService
        .from("activation_meetings")
        .update({ trial_pipeline_id: trialPipeline.id })
        .eq("lead_id", leadId)
        .is("trial_pipeline_id", null);
    }

    // Only create SDR follow-up task for Variant B
    if (followupVariant === 'B') {
      // Schedule follow-up for 24 hours from now
      const followUpAt = new Date();
      followUpAt.setHours(followUpAt.getHours() + 24);
      
      await supabaseService.from("search_results").update({
        next_follow_up_at: followUpAt.toISOString(),
        badge_key: "trial_awaiting_activation",
      }).eq("id", leadId);
    }

    // Create lead_notification for trial_started so it shows in SDR funnel reports
    // This ensures trials started via dialer are tracked immediately
    const { error: notifError } = await supabaseService.from("lead_notifications").insert({
      lead_id: leadId,
      sdr_user_id: user.id,
      event_type: "trial_started",
      payload: {
        jcc_user_id: jccData.user_id,
        source: source,
        email: email.trim().toLowerCase(),
        business_name: businessName.trim(),
        provisioned_via: "dialer",
        followup_variant: followupVariant,  // Track variant
      },
    });
    if (notifError) {
      console.error("Failed to create lead_notification for trial_started:", notifError);
      // Don't fail the request - trial was created successfully
    } else {
      console.log(`Created lead_notification for trial_started, lead: ${leadId}, SDR: ${user.id}`);
    }

    return NextResponse.json({
      success: true,
      userId: jccData.user_id,
      email: jccData.email,
      credits: jccData.credits || 20,
      loginUrl: jccData.login_url,
      alreadyExists: jccData.already_exists || false,
    });
  } catch (error: any) {
    console.error("Error in trial provisioning:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trials/provision
 * Health check and documentation
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "POST /api/trials/provision",
    description: "Provision a JCC free trial for a prospect during a call",
    requiredFields: ["leadId", "businessName", "email"],
    optionalFields: ["contactName", "phone", "website", "source"],
    environment: {
      JCC_PROVISION_API_KEY: process.env.JCC_PROVISION_API_KEY ? "configured" : "NOT SET",
      JCC_API_URL: process.env.JCC_API_URL || "https://app.autosalvageautomation.com",
    },
  });
}

