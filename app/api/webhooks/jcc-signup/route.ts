import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { JCC_FEATURES_ENABLED } from "@/lib/config";

/**
 * POST /api/webhooks/jcc-signup
 * 
 * Webhook called by the Junk Car Calculator app when a user signs up.
 * This automatically creates/updates an sdr_client_links entry to link
 * the JCC user to their CRM lead and SDR.
 * 
 * Request body:
 * {
 *   user_id: string,              // JCC profile/user ID (required)
 *   email?: string,               // User's email (for matching/creating CRM lead)
 *   phone?: string,               // User's phone (for matching/creating CRM lead)
 *   crm_lead_id?: string,         // Explicit CRM lead ID (if passed through signup flow)
 *   sdr_first_touch_code?: string, // First-touch SDR attribution code
 *   sdr_last_touch_code?: string,  // Last-touch SDR attribution code
 * }
 * 
 * Priority for matching:
 * 1. If crm_lead_id is provided, use it directly
 * 2. Otherwise, try to match by email
 * 3. Otherwise, try to match by phone
 * 4. If no match found: auto-create a new lead with the provided email/phone
 * 
 * SDR Attribution:
 * - First-touch: Only set if not already present (first write wins)
 * - Last-touch: Always overwritten with latest value
 */
export async function POST(request: NextRequest) {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  try {
    // Verify webhook secret if set
    const authHeader = request.headers.get("authorization");
    const webhookSecret = process.env.JCC_WEBHOOK_SECRET;
    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      user_id, 
      email, 
      phone, 
      crm_lead_id,
      sdr_first_touch_code,
      sdr_last_touch_code,
    } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    if (!email && !phone && !crm_lead_id) {
      return NextResponse.json(
        { error: "At least one of email, phone, or crm_lead_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // Get the JCC campaign ID
    const { data: jccCampaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("name", "Junk Car Calculator")
      .single();

    if (campaignError || !jccCampaign) {
      console.error("JCC campaign not found");
      return NextResponse.json(
        { error: "Junk Car Calculator campaign not found" },
        { status: 404 }
      );
    }

    const jccCampaignId = jccCampaign.id;

    let matchedLeadId: string | null = null;
    let matchedSdrUserId: string | null = null;
    let matchMethod: string = "none";

    // Priority 1: Use explicit crm_lead_id if provided
    if (crm_lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from("search_results")
        .select("id, assigned_to")
        .eq("id", crm_lead_id)
        .single();

      if (!leadError && lead) {
        matchedLeadId = lead.id;
        matchedSdrUserId = lead.assigned_to;
        matchMethod = "crm_lead_id";
      }
    }

    // Priority 2: Match by email
    if (!matchedLeadId && email) {
      const normalizedEmail = email.toLowerCase().trim();
      const { data: leads, error: emailError } = await supabase
        .from("search_results")
        .select("id, assigned_to")
        .ilike("email", normalizedEmail)
        .limit(1);

      if (!emailError && leads && leads.length > 0) {
        matchedLeadId = leads[0].id;
        matchedSdrUserId = leads[0].assigned_to;
        matchMethod = "email";
      }
    }

    // Priority 3: Match by phone
    if (!matchedLeadId && phone) {
      // Normalize phone - strip non-digits for comparison
      const normalizedPhone = phone.replace(/\D/g, "");
      const phoneVariants = [
        normalizedPhone,
        `+1${normalizedPhone}`,
        `1${normalizedPhone}`,
        normalizedPhone.slice(-10), // Last 10 digits
      ];

      // Try to find a match with any phone variant
      for (const phoneVariant of phoneVariants) {
        if (matchedLeadId) break;

        const { data: leads, error: phoneError } = await supabase
          .from("search_results")
          .select("id, assigned_to, phone")
          .limit(100); // Get a batch and filter

        if (!phoneError && leads) {
          const matchedLead = leads.find((lead) => {
            if (!lead.phone) return false;
            const leadPhone = lead.phone.replace(/\D/g, "");
            return (
              leadPhone === phoneVariant ||
              leadPhone.endsWith(phoneVariant) ||
              phoneVariant.endsWith(leadPhone)
            );
          });

          if (matchedLead) {
            matchedLeadId = matchedLead.id;
            matchedSdrUserId = matchedLead.assigned_to;
            matchMethod = "phone";
          }
        }
      }
    }

    // Try to find the SDR by their tracking code (for ownership assignment)
    let sdrFromTrackingCode: string | null = null;
    const trackingCode = sdr_first_touch_code || sdr_last_touch_code;
    
    if (trackingCode) {
      const { data: sdrProfile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("sdr_code", trackingCode)
        .single();
      
      if (sdrProfile) {
        sdrFromTrackingCode = sdrProfile.id;
        console.log(`Found SDR ${sdrFromTrackingCode} for tracking code ${trackingCode}`);
      } else {
        console.log(`No SDR found for tracking code ${trackingCode}`);
      }
    }

    // If no lead found, auto-create one
    let leadWasCreated = false;
    if (!matchedLeadId) {
      // Need at least email or phone to create a lead
      if (!email && !phone) {
        console.log(`Cannot create lead for JCC signup: no email or phone provided. user_id=${user_id}`);
        return NextResponse.json(
          { error: "No identifying info (email/phone) to create lead." },
          { status: 400 }
        );
      }

      console.log(`No existing lead found. Creating new lead for JCC signup: user_id=${user_id}, email=${email}, phone=${phone}`);

      // Get the organization ID from the JCC campaign
      const { data: jccCampaignWithOrg } = await supabase
        .from("campaigns")
        .select("organization_id")
        .eq("id", jccCampaignId)
        .single();

      const organizationId = jccCampaignWithOrg?.organization_id;

      // We need a search_history_id for the foreign key constraint
      // Create a placeholder search history entry for JCC signups
      let searchHistoryId: string | null = null;
      
      // First, try to find an existing JCC signup search history for this org
      const { data: existingHistory } = await supabase
        .from("search_history")
        .select("id")
        .eq("keyword", "JCC Signup")
        .eq("location", "Auto-created")
        .limit(1)
        .single();

      if (existingHistory) {
        searchHistoryId = existingHistory.id;
      } else {
        // Create a placeholder search history entry
        // We need a user_id for the search_history - use any admin from the org
        const { data: adminUser } = await supabase
          .from("user_profiles")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("role", "admin")
          .limit(1)
          .single();

        if (adminUser) {
          const { data: newHistory, error: historyError } = await supabase
            .from("search_history")
            .insert({
              user_id: adminUser.id,
              keyword: "JCC Signup",
              location: "Auto-created",
              result_count: 0,
              results_found: 0,
            })
            .select("id")
            .single();

          if (!historyError && newHistory) {
            searchHistoryId = newHistory.id;
          }
        }
      }

      if (!searchHistoryId) {
        console.error("Could not create or find search_history for JCC signup");
        return NextResponse.json(
          { error: "Failed to create lead - no search history available" },
          { status: 500 }
        );
      }

      // Create the new lead
      const newLeadData: Record<string, any> = {
        search_history_id: searchHistoryId,
        name: email?.split("@")[0] || phone || "JCC Signup",
        address: "Auto-created from JCC signup",
        place_id: `jcc_signup_${user_id}_${Date.now()}`,
        lead_source: "jcc_signup",
        lead_status: "new",
        client_status: "trialing",
        organization_id: organizationId,
      };

      if (email) {
        newLeadData.email = email.toLowerCase().trim();
      }
      if (phone) {
        newLeadData.phone = phone;
      }
      
      // Assign to SDR from tracking code if found
      if (sdrFromTrackingCode) {
        newLeadData.assigned_to = sdrFromTrackingCode;
        matchedSdrUserId = sdrFromTrackingCode;
        console.log(`Assigning new lead to SDR ${sdrFromTrackingCode} based on tracking code`);
      }

      const { data: newLead, error: createLeadError } = await supabase
        .from("search_results")
        .insert(newLeadData)
        .select("id")
        .single();

      if (createLeadError || !newLead) {
        console.error("Failed to create lead for JCC signup:", createLeadError);
        return NextResponse.json(
          { error: "Failed to create lead" },
          { status: 500 }
        );
      }

      matchedLeadId = newLead.id;
      matchMethod = "created";
      leadWasCreated = true;
      console.log(`Created new lead ${matchedLeadId} for JCC signup user_id=${user_id}`);
    }

    // Check if lead is in the JCC campaign
    let campaignLead: { id: string; claimed_by: string | null } | null = null;
    
    const { data: existingCampaignLead, error: campaignLeadError } = await supabase
      .from("campaign_leads")
      .select("id, claimed_by")
      .eq("lead_id", matchedLeadId)
      .eq("campaign_id", jccCampaignId)
      .single();

    if (campaignLeadError || !existingCampaignLead) {
      // Lead is not in the JCC campaign - add it
      console.log(`Lead ${matchedLeadId} not in JCC campaign, adding it now`);
      
      const { data: jccCampaignWithOrg } = await supabase
        .from("campaigns")
        .select("organization_id")
        .eq("id", jccCampaignId)
        .single();

      // If we have an SDR from tracking code, claim the lead for them
      const campaignLeadData: Record<string, any> = {
        campaign_id: jccCampaignId,
        lead_id: matchedLeadId,
        organization_id: jccCampaignWithOrg?.organization_id,
        status: sdrFromTrackingCode ? "claimed" : "available",
      };
      
      if (sdrFromTrackingCode) {
        campaignLeadData.claimed_by = sdrFromTrackingCode;
        campaignLeadData.claimed_at = new Date().toISOString();
        console.log(`Claiming lead in campaign for SDR ${sdrFromTrackingCode}`);
      }

      const { data: newCampaignLead, error: addToCampaignError } = await supabase
        .from("campaign_leads")
        .insert(campaignLeadData)
        .select("id, claimed_by")
        .single();

      if (addToCampaignError) {
        console.error("Failed to add lead to JCC campaign:", addToCampaignError);
        // Don't fail the whole request, just log it
      } else {
        campaignLead = newCampaignLead;
      }
    } else {
      campaignLead = existingCampaignLead;
      
      // If existing lead is unclaimed but we have an SDR from tracking code, claim it
      if (!existingCampaignLead.claimed_by && sdrFromTrackingCode) {
        console.log(`Claiming existing campaign lead for SDR ${sdrFromTrackingCode}`);
        await supabase
          .from("campaign_leads")
          .update({
            claimed_by: sdrFromTrackingCode,
            claimed_at: new Date().toISOString(),
            status: "claimed",
          })
          .eq("id", existingCampaignLead.id);
        
        campaignLead = { ...existingCampaignLead, claimed_by: sdrFromTrackingCode };
      }
    }

    // Use claimed_by from campaign_leads if assigned_to is not set
    if (!matchedSdrUserId && campaignLead?.claimed_by) {
      matchedSdrUserId = campaignLead.claimed_by;
    }
    
    // If we still don't have an SDR but have one from tracking code, use it
    if (!matchedSdrUserId && sdrFromTrackingCode) {
      matchedSdrUserId = sdrFromTrackingCode;
    }
    
    // If we found an SDR from tracking code and the lead doesn't have an owner, assign them
    if (sdrFromTrackingCode && !leadWasCreated) {
      // Check if lead needs assigned_to updated
      const { data: currentLead } = await supabase
        .from("search_results")
        .select("assigned_to")
        .eq("id", matchedLeadId)
        .single();
      
      if (currentLead && !currentLead.assigned_to) {
        console.log(`Assigning existing lead ${matchedLeadId} to SDR ${sdrFromTrackingCode} from tracking code`);
        await supabase
          .from("search_results")
          .update({ assigned_to: sdrFromTrackingCode })
          .eq("id", matchedLeadId);
      }
    }

    // If still no SDR, that's okay for new leads - we'll skip the sdr_client_links creation
    // but still create the lead and store attribution
    const canCreateSdrLink = !!matchedSdrUserId;

    // Create or update sdr_client_links (only if we have an SDR)
    let linkAction: "updated" | "created" | "skipped" = "skipped";
    
    if (canCreateSdrLink) {
      const { data: existingLink, error: existingError } = await supabase
        .from("sdr_client_links")
        .select("id")
        .eq("user_id", user_id)
        .eq("crm_lead_id", matchedLeadId)
        .single();

      if (existingLink) {
        // Link already exists, update it
        const { error: updateError } = await supabase
          .from("sdr_client_links")
          .update({
            sdr_user_id: matchedSdrUserId,
          })
          .eq("id", existingLink.id);

        if (updateError) {
          console.error("Error updating sdr_client_links:", updateError);
          return NextResponse.json(
            { error: "Failed to update client link" },
            { status: 500 }
          );
        }
        linkAction = "updated";
      } else {
        // Create new link
        const { error: insertError } = await supabase
          .from("sdr_client_links")
          .insert({
            user_id,
            crm_lead_id: matchedLeadId,
            sdr_user_id: matchedSdrUserId,
          });

        if (insertError) {
          console.error("Error inserting sdr_client_links:", insertError);
          return NextResponse.json(
            { error: "Failed to create client link" },
            { status: 500 }
          );
        }
        linkAction = "created";
      }
    } else {
      console.log(`No SDR assigned for lead ${matchedLeadId}, skipping sdr_client_links creation`);
    }

    // Update SDR attribution on the lead record
    let attributionSet = { first_touch: null as string | null, last_touch: null as string | null };
    
    if (sdr_first_touch_code || sdr_last_touch_code) {
      // Fetch the existing lead to check current first-touch value
      const { data: existingLead } = await supabase
        .from("search_results")
        .select("jcc_sdr_first_touch_code, jcc_sdr_last_touch_code")
        .eq("id", matchedLeadId)
        .single();

      const attributionUpdates: Record<string, string> = {};

      // First-touch: only set if not already present (first write wins)
      if (sdr_first_touch_code && !existingLead?.jcc_sdr_first_touch_code) {
        attributionUpdates.jcc_sdr_first_touch_code = sdr_first_touch_code;
        attributionSet.first_touch = sdr_first_touch_code;
      }

      // Last-touch: always overwrite with latest value
      if (sdr_last_touch_code) {
        attributionUpdates.jcc_sdr_last_touch_code = sdr_last_touch_code;
        attributionSet.last_touch = sdr_last_touch_code;
      }

      if (Object.keys(attributionUpdates).length > 0) {
        const { error: attributionError } = await supabase
          .from("search_results")
          .update(attributionUpdates)
          .eq("id", matchedLeadId);

        if (attributionError) {
          console.error("Failed to update SDR attribution on lead", {
            leadId: matchedLeadId,
            attributionError,
          });
          // Don't fail the whole request - attribution is supplementary
        } else {
          console.log(`Updated SDR attribution on lead ${matchedLeadId}:`, attributionUpdates);
        }
      }
    }

    // Update lead_status so it's excluded from SDR queue
    await supabase.from("search_results")
      .update({ lead_status: "trial_started" })
      .eq("id", matchedLeadId);

    // Create trial_pipeline entry for this signup
    // This will be updated by subsequent jcc-event webhooks
    const { error: pipelineError } = await supabase
      .from("trial_pipeline")
      .upsert({
        crm_lead_id: matchedLeadId,
        owner_sdr_id: matchedSdrUserId,
        jcc_user_id: user_id,
        trial_started_at: new Date().toISOString(),
        bonus_state: "none",
      }, { onConflict: "crm_lead_id" });

    if (pipelineError) {
      console.error("Failed to create trial_pipeline entry:", pipelineError);
      // Don't fail the whole request - pipeline entry is supplementary
    } else {
      console.log(`Created trial_pipeline entry for lead ${matchedLeadId}`);
    }

    // Create lead_notification for trial_started so it shows in SDR funnel reports
    if (matchedSdrUserId) {
      const { error: notifError } = await supabase.from("lead_notifications").insert({
        lead_id: matchedLeadId,
        sdr_user_id: matchedSdrUserId,
        event_type: "trial_started",
        payload: {
          jcc_user_id: user_id,
          source: "jcc_signup",
          email: email || null,
          phone: phone || null,
        },
      });
      if (notifError) {
        console.error("Failed to create lead_notification:", notifError);
      } else {
        console.log(`Created lead_notification for trial_started, SDR: ${matchedSdrUserId}`);
      }
    }

    // Get org ID
    const { data: jccCampaignForOrg } = await supabase
      .from("campaigns")
      .select("organization_id")
      .eq("id", jccCampaignId)
      .single();

    // Find activator for this org
    const { data: activator } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", jccCampaignForOrg?.organization_id)
      .eq("is_activator", true)
      .single();

    // Update lead: set badge and route to activator
    const updateData: Record<string, any> = {
      badge_key: "trial_awaiting_activation",
      next_follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // +3 days
    };

    // Route to activator if one exists (keep owner_sdr_id for attribution)
    if (activator) {
      updateData.assigned_to = activator.id;
    }

    await supabase
      .from("search_results")
      .update(updateData)
      .eq("id", matchedLeadId);

    return NextResponse.json({
      success: true,
      message: leadWasCreated 
        ? "Lead created and processed" 
        : `Lead matched and client link ${linkAction}`,
      lead_action: leadWasCreated ? "created" : "matched",
      link_action: linkAction,
      user_id,
      crm_lead_id: matchedLeadId,
      sdr_user_id: matchedSdrUserId,
      match_method: matchMethod,
      attribution_set: attributionSet,
    });
  } catch (error: any) {
    console.error("Error in jcc-signup webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/jcc-signup
 * Health check and documentation endpoint
 */
export async function GET() {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  return NextResponse.json({
    status: "ok",
    endpoint: "jcc-signup webhook",
    description: "POST to this endpoint when a JCC signup occurs. Auto-creates leads if not found and links to SDR.",
    request_body: {
      user_id: "string (required) - JCC profile/user ID",
      email: "string (optional) - User's email for matching/creating lead",
      phone: "string (optional) - User's phone for matching/creating lead",
      crm_lead_id: "string (optional) - Explicit CRM lead ID",
      sdr_first_touch_code: "string (optional) - First-touch SDR attribution code",
      sdr_last_touch_code: "string (optional) - Last-touch SDR attribution code",
    },
    behavior: {
      matching: "Tries crm_lead_id → email → phone in order",
      auto_create: "If no lead found, creates one using email/phone (requires at least one)",
      attribution: {
        first_touch: "Only set once (first write wins)",
        last_touch: "Always updated with latest value",
      },
      campaign: "Lead is auto-added to 'Junk Car Calculator' campaign if not already in it",
    },
  });
}

