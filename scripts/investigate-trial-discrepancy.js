#!/usr/bin/env node

/**
 * Trial Count Discrepancy Investigation Script
 * 
 * Compares trial counts from two data sources:
 * 1. lead_notifications table (used by weekly email reports)
 * 2. calls table (used by dashboard)
 * 
 * Usage: node scripts/investigate-trial-discrepancy.js [email] [start_date] [end_date]
 * Example: node scripts/investigate-trial-discrepancy.js pantot22@gmail.com 2025-12-15 2025-12-20
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase credentials not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function investigateTrialDiscrepancy(sdrEmail, startDate, endDate) {
  console.log("🔍 Investigating Trial Count Discrepancy");
  console.log(`   SDR Email: ${sdrEmail}`);
  console.log(`   Date Range: ${startDate} to ${endDate}\n`);

  try {
    // Step 1: Get Danilo's user ID
    console.log("📋 Step 1: Looking up SDR user ID...");
    const { data: sdrProfile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email, sdr_code")
      .eq("email", sdrEmail)
      .single();

    if (profileError || !sdrProfile) {
      console.error(`❌ Could not find SDR with email: ${sdrEmail}`);
      console.error(`   Error: ${profileError?.message || "Not found"}`);
      process.exit(1);
    }

    console.log(`✅ Found SDR: ${sdrProfile.full_name || sdrProfile.email}`);
    console.log(`   User ID: ${sdrProfile.id}`);
    console.log(`   SDR Code: ${sdrProfile.sdr_code || "N/A"}\n`);

    const sdrUserId = sdrProfile.id;

    // Step 2: Query lead_notifications table
    console.log("📋 Step 2: Querying lead_notifications table...");
    const { data: leadNotifications, error: lnError } = await supabase
      .from("lead_notifications")
      .select(`
        id,
        lead_id,
        event_type,
        created_at,
        search_results (
          id,
          name,
          email,
          phone
        )
      `)
      .eq("sdr_user_id", sdrUserId)
      .eq("event_type", "trial_started")
      .gte("created_at", `${startDate}T00:00:00.000Z`)
      .lte("created_at", `${endDate}T23:59:59.999Z`)
      .order("created_at", { ascending: true });

    if (lnError) {
      console.error(`❌ Error querying lead_notifications:`, lnError);
    } else {
      console.log(`✅ Found ${leadNotifications?.length || 0} trial_started events in lead_notifications\n`);
      
      if (leadNotifications && leadNotifications.length > 0) {
        console.log("   Lead Notifications Details:");
        leadNotifications.forEach((ln, idx) => {
          const lead = ln.search_results;
          console.log(`   ${idx + 1}. ${lead?.name || "Unknown"} (${lead?.email || "No email"})`);
          console.log(`      Created: ${new Date(ln.created_at).toLocaleString()}`);
          console.log(`      Lead ID: ${ln.lead_id}`);
        });
        console.log();
      }
    }

    // Step 3: Query calls table
    console.log("📋 Step 3: Querying calls table...");
    const { data: calls, error: callsError } = await supabase
      .from("calls")
      .select(`
        id,
        lead_id,
        outcome_code,
        initiated_at,
        duration,
        status,
        search_results (
          id,
          name,
          email,
          phone
        )
      `)
      .eq("user_id", sdrUserId)
      .eq("outcome_code", "TRIAL_STARTED")
      .gte("initiated_at", `${startDate}T00:00:00.000Z`)
      .lte("initiated_at", `${endDate}T23:59:59.999Z`)
      .order("initiated_at", { ascending: true });

    if (callsError) {
      console.error(`❌ Error querying calls:`, callsError);
    } else {
      console.log(`✅ Found ${calls?.length || 0} calls with TRIAL_STARTED outcome\n`);
      
      if (calls && calls.length > 0) {
        console.log("   Calls Details:");
        calls.forEach((call, idx) => {
          const lead = call.search_results;
          console.log(`   ${idx + 1}. ${lead?.name || "Unknown"} (${lead?.email || "No email"})`);
          console.log(`      Initiated: ${new Date(call.initiated_at).toLocaleString()}`);
          console.log(`      Lead ID: ${call.lead_id || "No lead"}`);
          console.log(`      Duration: ${call.duration || 0}s`);
        });
        console.log();
      }
    }

    // Step 4: Check daily_sdr_summaries
    console.log("📋 Step 4: Checking daily_sdr_summaries...");
    const { data: dailySummaries, error: summariesError } = await supabase
      .from("daily_sdr_summaries")
      .select("*")
      .eq("sdr_user_id", sdrUserId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (summariesError) {
      console.error(`❌ Error querying daily_sdr_summaries:`, summariesError);
    } else {
      console.log(`✅ Found ${dailySummaries?.length || 0} daily summaries\n`);
      
      if (dailySummaries && dailySummaries.length > 0) {
        console.log("   Daily Summaries:");
        dailySummaries.forEach((summary) => {
          console.log(`   ${summary.date}: ${summary.trials_started || 0} trials started`);
        });
        console.log();
      }
    }

    // Step 5: Compare and analyze
    console.log("📊 Step 5: Analysis & Comparison\n");
    
    // Deduplicate lead_notifications by lead_id (same as computeJCCMetrics does)
    const uniqueTrialLeadIds = new Set((leadNotifications || []).map(ln => ln.lead_id).filter(Boolean));
    const lnUniqueCount = uniqueTrialLeadIds.size;
    const lnTotalCount = leadNotifications?.length || 0;
    const callsCount = calls?.length || 0;
    const totalFromSummaries = dailySummaries?.reduce((sum, s) => sum + (s.trials_started || 0), 0) || 0;

    console.log("   Summary:");
    console.log(`   • lead_notifications total events: ${lnTotalCount}`);
    console.log(`   • lead_notifications unique leads: ${lnUniqueCount} (deduplicated)`);
    console.log(`   • calls table count: ${callsCount}`);
    console.log(`   • daily_sdr_summaries total: ${totalFromSummaries}`);
    console.log(`   • Discrepancy (unique vs calls): ${Math.abs(lnUniqueCount - callsCount)} trials`);
    
    if (lnTotalCount > lnUniqueCount) {
      console.log(`   ⚠️  Note: ${lnTotalCount - lnUniqueCount} duplicate notifications found (same lead, multiple webhooks)\n`);
    } else {
      console.log();
    }

    // Find leads that are in one but not the other
    const lnLeadIds = new Set((leadNotifications || []).map(ln => ln.lead_id).filter(Boolean));
    const callsLeadIds = new Set((calls || []).map(c => c.lead_id).filter(Boolean));

    const onlyInNotifications = Array.from(lnLeadIds).filter(id => !callsLeadIds.has(id));
    const onlyInCalls = Array.from(callsLeadIds).filter(id => !lnLeadIds.has(id));

    if (onlyInNotifications.length > 0) {
      console.log(`   ⚠️  ${onlyInNotifications.length} trials in lead_notifications but NOT in calls:`);
      onlyInNotifications.forEach(leadId => {
        const ln = leadNotifications.find(n => n.lead_id === leadId);
        const lead = ln?.search_results;
        console.log(`      • ${lead?.name || "Unknown"} (${lead?.email || "No email"}) - Lead ID: ${leadId}`);
        console.log(`        Created: ${new Date(ln.created_at).toLocaleString()}`);
      });
      console.log();
    }

    if (onlyInCalls.length > 0) {
      console.log(`   ⚠️  ${onlyInCalls.length} trials in calls but NOT in lead_notifications:`);
      onlyInCalls.forEach(leadId => {
        const call = calls.find(c => c.lead_id === leadId);
        const lead = call?.search_results;
        console.log(`      • ${lead?.name || "Unknown"} (${lead?.email || "No email"}) - Lead ID: ${leadId}`);
        console.log(`        Initiated: ${new Date(call.initiated_at).toLocaleString()}`);
      });
      console.log();
    }

    // Recommendations
    console.log("💡 Recommendations:\n");
    
    if (lnUniqueCount > callsCount) {
      console.log("   ✅ lead_notifications table appears to be the more accurate source.");
      console.log("      This table receives webhooks from JCC when trials are actually created.");
      console.log("      The discrepancy suggests some trials were created but the corresponding");
      console.log("      call records were either lost during the data restoration or never updated.\n");
      
      console.log("   📝 Suggested Actions:");
      console.log(`      1. Trust the lead_notifications unique count (${lnUniqueCount} trials) as the source of truth`);
      console.log("      2. The daily_sdr_summaries shows " + totalFromSummaries + " trials, which is close to the unique count");
      console.log("      3. Consider updating the dashboard to use lead_notifications instead of calls");
      console.log("      4. Optionally backfill calls table with TRIAL_STARTED outcomes for missing leads");
    } else if (callsCount > lnUniqueCount) {
      console.log("   ⚠️  calls table has more trials than lead_notifications.");
      console.log("      This is unusual - it suggests calls were marked as TRIAL_STARTED but");
      console.log("      the webhooks from JCC never arrived or were lost.\n");
      
      console.log("   📝 Suggested Actions:");
      console.log("      1. Verify with JCC backend if these trials actually exist");
      console.log("      2. Check if webhook delivery failed during the data loss incident");
      console.log(`      3. Consider the calls count (${callsCount}) as potentially inflated`);
    } else {
      console.log("   ✅ Both sources match! No discrepancy found.");
    }

    console.log("\n🎉 Investigation complete!");

  } catch (error) {
    console.error("❌ Investigation failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const sdrEmail = process.argv[2] || "pantot22@gmail.com";
const startDate = process.argv[3] || "2025-12-15";
const endDate = process.argv[4] || "2025-12-20";

investigateTrialDiscrepancy(sdrEmail, startDate, endDate);

