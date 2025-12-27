#!/usr/bin/env node

/**
 * Reassign Trials to New Activator Script
 * Moves all trials, leads, and meetings from merrillholdings@gmail.com to jennyfertan322@gmail.com
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase credentials not set in .env.local");
  console.error("   Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function reassignTrials() {
  console.log("🚀 Starting trial reassignment...");
  console.log("   From: merrillholdings@gmail.com");
  console.log("   To:   jennyfertan322@gmail.com\n");

  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, "../supabase/migrations/20250122000000_reassign_trials_to_new_activator.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    // Execute the SQL
    console.log("📝 Executing migration SQL...");
    const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try direct query execution
      // Note: Supabase JS client doesn't support DO blocks directly
      // We'll need to break it down into individual queries
      console.log("⚠️  Direct SQL execution not available, breaking down into queries...\n");
      
      // Get user IDs
      const { data: oldUser, error: oldError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("email", "merrillholdings@gmail.com")
        .single();

      if (oldError || !oldUser) {
        throw new Error(`Old activator not found: merrillholdings@gmail.com`);
      }

      const { data: newUser, error: newError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("email", "jennyfertan322@gmail.com")
        .single();

      if (newError || !newUser) {
        throw new Error(`New activator not found: jennyfertan322@gmail.com`);
      }

      const oldActivatorId = oldUser.id;
      const newActivatorId = newUser.id;

      console.log(`   Old activator ID: ${oldActivatorId}`);
      console.log(`   New activator ID: ${newActivatorId}\n`);

      // Update trial_pipeline
      console.log("1️⃣  Updating trial_pipeline...");
      const { data: updatedTrials, count: count1, error: error1 } = await supabase
        .from("trial_pipeline")
        .update({ assigned_activator_id: newActivatorId, updated_at: new Date().toISOString() })
        .eq("assigned_activator_id", oldActivatorId)
        .select("*", { count: "exact" });

      if (error1) throw error1;
      const trialCount = count1 || 0;
      console.log(`   ✅ Updated ${trialCount} trials\n`);

      // Update search_results for active trial leads
      console.log("2️⃣  Updating search_results (trial leads)...");
      let count2 = 0;
      const { data: trialLeads, error: error2a } = await supabase
        .from("trial_pipeline")
        .select("crm_lead_id")
        .eq("assigned_activator_id", oldActivatorId)
        .not("trial_started_at", "is", null)
        .is("converted_at", null);

      if (error2a) throw error2a;

      if (trialLeads && trialLeads.length > 0) {
        const leadIds = trialLeads.map(tp => tp.crm_lead_id);
        const { count: count2Result, error: error2b } = await supabase
          .from("search_results")
          .update({ assigned_to: newActivatorId, updated_at: new Date().toISOString() })
          .eq("assigned_to", oldActivatorId)
          .in("id", leadIds)
          .not("lead_status", "in", "('converted','closed_won','closed_lost')")
          .select("*", { count: "exact", head: true });

        if (error2b) throw error2b;
        count2 = count2Result || 0;
        console.log(`   ✅ Updated ${count2} leads\n`);
      } else {
        console.log(`   ✅ No leads to update\n`);
      }

      // Update activation_meetings
      console.log("3️⃣  Updating activation_meetings...");
      const { data: updatedMeetings, count: count3, error: error3 } = await supabase
        .from("activation_meetings")
        .update({ activator_user_id: newActivatorId, updated_at: new Date().toISOString() })
        .eq("activator_user_id", oldActivatorId)
        .in("status", ["scheduled", "rescheduled"])
        .select("*", { count: "exact" });

      if (error3) throw error3;
      const meetingCount = count3 || 0;
      console.log(`   ✅ Updated ${meetingCount} meetings\n`);

      console.log("✅ SUCCESS! Reassignment complete!");
      console.log(`   - ${trialCount} trials reassigned`);
      console.log(`   - ${count2} leads reassigned`);
      console.log(`   - ${meetingCount} meetings reassigned`);

    } else {
      console.log("✅ Migration executed successfully!");
      console.log(data);
    }

  } catch (error) {
    console.error("❌ Error during reassignment:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
reassignTrials();

