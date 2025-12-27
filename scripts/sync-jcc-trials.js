#!/usr/bin/env node

/**
 * JCC Trial Sync Script
 * Pulls active trials from JCC system and imports them into CRM Activations.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const JCC_API_URL = "https://app.autosalvageautomation.com/api/control-tower/clients";
const JCC_API_KEY = process.env.JCC_PROVISION_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!JCC_API_KEY) {
  console.error("❌ JCC_PROVISION_API_KEY not set in .env.local");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase credentials not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function syncTrials() {
  console.log("🚀 Starting JCC Trial Sync...");

  try {
    // 1. Fetch clients from JCC
    console.log("📡 Fetching clients from JCC API...");
    const response = await fetch(JCC_API_URL, {
      headers: {
        "x-api-key": JCC_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`JCC API responded with ${response.status}: ${await response.text()}`);
    }

    const rawResponse = await response.json();
    console.log("📦 Raw API response type:", typeof rawResponse);

    // Handle different response formats
    let clients;
    if (Array.isArray(rawResponse)) {
      clients = rawResponse;
    } else if (rawResponse?.data && Array.isArray(rawResponse.data)) {
      clients = rawResponse.data;
    } else if (rawResponse?.clients && Array.isArray(rawResponse.clients)) {
      clients = rawResponse.clients;
    } else {
      console.error("❌ Unexpected API response format:", JSON.stringify(rawResponse, null, 2).slice(0, 500));
      throw new Error("JCC API returned unexpected format - not an array");
    }

    console.log(`✅ Received ${clients.length} clients from JCC.`);

    // Debug: Show sample client structure
    if (clients.length > 0) {
      console.log("📋 Sample client structure:", JSON.stringify(clients[0], null, 2));
    }

    // 2. Filter for active trials
    const now = new Date();
    const trialClients = clients.filter((c) => 
      c.subscription_status === "trial" || 
      c.subscription_status === "trialing" ||
      c.status === "trial" ||
      c.status === "trialing" ||
      (c.trial_end && new Date(c.trial_end) > now) ||
      (c.trialEnd && new Date(c.trialEnd) > now)
    );

    console.log(`🔍 Found ${trialClients.length} active trials to sync.`);

    // 3. Get JCC Campaign info
    const { data: jccCampaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, organization_id")
      .eq("name", "Junk Car Calculator")
      .single();

    if (campaignError || !jccCampaign) {
      throw new Error("Could not find 'Junk Car Calculator' campaign in CRM. Please create it first.");
    }

    // 4. Get current activator (if any)
    const { data: activator } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("organization_id", jccCampaign.organization_id)
      .eq("is_activator", true)
      .limit(1)
      .single();

    if (activator) {
      console.log(`👤 Found activator: ${activator.id}. New trials will be assigned to them.`);
    } else {
      console.log("⚠️ No activator found for organization. Trials will remain unassigned.");
    }

    // 5. Get placeholder search history for JCC Sync
    let { data: syncHistory } = await supabase
      .from("search_history")
      .select("id")
      .eq("keyword", "JCC Sync")
      .limit(1)
      .single();

    if (!syncHistory) {
      console.log("📝 Creating 'JCC Sync' placeholder search history...");
      // Use any admin for the search history user_id
      const { data: adminUser } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("organization_id", jccCampaign.organization_id)
        .eq("role", "admin")
        .limit(1)
        .single();

      const { data: newHistory, error: historyError } = await supabase
        .from("search_history")
        .insert({
          user_id: adminUser?.id || "00000000-0000-0000-0000-000000000000",
          keyword: "JCC Sync",
          location: "JCC Import",
          result_count: 1,
          results_found: 1,
        })
        .select("id")
        .single();
      
      if (historyError) throw historyError;
      syncHistory = newHistory;
    }

    // 6. Process each trial
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const trial of trialClients) {
      try {
        const email = trial.email.toLowerCase().trim();
        
        // Step A: Find or create lead
        let leadId;
        const { data: existingLead } = await supabase
          .from("search_results")
          .select("id")
          .ilike("email", email)
          .limit(1)
          .single();

        if (existingLead) {
          leadId = existingLead.id;
          console.log(`📝 Matching existing lead for ${email}`);
          updatedCount++;
        } else {
          console.log(`✨ Creating new lead for ${email}`);
          const { data: newLead, error: createError } = await supabase
            .from("search_results")
            .insert({
              search_history_id: syncHistory.id,
              name: trial.business_name || email.split("@")[0],
              email: email,
              phone: trial.phone || null,
              address: trial.address || "Imported from JCC",
              place_id: `jcc_sync_${trial.id}_${Date.now()}`,
              lead_source: "jcc_signup",
              lead_status: "new",
              client_status: "trialing",
              badge_key: "trial_awaiting_activation",
              organization_id: jccCampaign.organization_id,
              assigned_to: activator?.id || null,
            })
            .select("id")
            .single();

          if (createError) {
            console.error(`❌ Error creating lead for ${email}:`, createError);
            skippedCount++;
            continue;
          }
          leadId = newLead.id;
          createdCount++;
        }

        // Step B: Add to JCC campaign
        await supabase
          .from("campaign_leads")
          .upsert({
            campaign_id: jccCampaign.id,
            lead_id: leadId,
            organization_id: jccCampaign.organization_id,
            status: activator ? "claimed" : "available",
            claimed_by: activator?.id || null,
            claimed_at: activator ? new Date().toISOString() : null,
          }, { onConflict: "campaign_id,lead_id" });

        // Step C: Create/Update trial_pipeline
        await supabase
          .from("trial_pipeline")
          .upsert({
            crm_lead_id: leadId,
            jcc_user_id: trial.id,
            trial_started_at: trial.signupDate || new Date().toISOString(),
            trial_ends_at: trial.trial_end || null,
            first_lead_received_at: trial.lastQuoteDate || null,
            activation_status: 'queued',
            bonus_state: "none",
            updated_at: new Date().toISOString(),
          }, { onConflict: "crm_lead_id" });

        // Step D: Create/Update sdr_client_links
        await supabase
          .from("sdr_client_links")
          .upsert({
            user_id: trial.id,
            crm_lead_id: leadId,
          }, { onConflict: "user_id,crm_lead_id" });

        // Step E: Update lead badge and assigned_to if it was an existing lead
        if (existingLead) {
          await supabase
            .from("search_results")
            .update({
              badge_key: "trial_awaiting_activation",
              client_status: "trialing",
              assigned_to: activator?.id || undefined, // Only update if activator exists
            })
            .eq("id", leadId);
        }

      } catch (innerError) {
        console.error(`❌ Failed to sync trial ${trial.email}:`, innerError.message);
        skippedCount++;
      }
    }

    console.log("\n📊 Sync Summary:");
    console.log(`   ✅ Created: ${createdCount}`);
    console.log(`   🔄 Updated: ${updatedCount}`);
    console.log(`   ⚠️  Skipped: ${skippedCount}`);
    console.log("\n🎉 Sync Complete!");

  } catch (error) {
    console.error("❌ Sync failed:", error.message);
    process.exit(1);
  }
}

syncTrials();

