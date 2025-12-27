#!/usr/bin/env node

/**
 * SDR Hours Discrepancy Investigation Script
 * 
 * Recalculates hours from raw call data and compares to stored summaries
 * 
 * Usage: node scripts/investigate-sdr-hours.js [start_date] [end_date]
 * Example: node scripts/investigate-sdr-hours.js 2025-12-15 2025-12-20
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

// Constants from lib/utils/sdrMetrics.ts
const SESSION_GAP_MINUTES = 30;
const SESSION_BUFFER_MINUTES = 5;

/**
 * Group calls into sessions based on 30-minute gap rule
 */
function groupCallsIntoSessions(calls) {
  if (calls.length === 0) return [];

  // Sort by initiated_at
  const sortedCalls = [...calls].sort(
    (a, b) => new Date(a.initiated_at).getTime() - new Date(b.initiated_at).getTime()
  );

  const sessions = [];
  let currentSession = {
    start: new Date(sortedCalls[0].initiated_at),
    end: new Date(sortedCalls[0].initiated_at),
    calls: [sortedCalls[0]],
    totalCallDuration: sortedCalls[0].duration || 0,
  };

  for (let i = 1; i < sortedCalls.length; i++) {
    const call = sortedCalls[i];
    const callTime = new Date(call.initiated_at);
    const gapMinutes = (callTime.getTime() - currentSession.end.getTime()) / (1000 * 60);

    if (gapMinutes < SESSION_GAP_MINUTES) {
      // Same session - extend it
      currentSession.end = callTime;
      currentSession.calls.push(call);
      currentSession.totalCallDuration += call.duration || 0;
    } else {
      // New session - save current and start new
      sessions.push(currentSession);
      currentSession = {
        start: callTime,
        end: callTime,
        calls: [call],
        totalCallDuration: call.duration || 0,
      };
    }
  }

  // Don't forget the last session
  sessions.push(currentSession);

  return sessions;
}

/**
 * Calculate paid hours from sessions (with 5-minute buffers)
 */
function calculatePaidHours(sessions) {
  let totalMinutes = 0;

  for (const session of sessions) {
    // Add 5 minutes before first call and 5 minutes after last call
    const sessionStart = new Date(session.start.getTime() - SESSION_BUFFER_MINUTES * 60 * 1000);
    const sessionEnd = new Date(session.end.getTime() + SESSION_BUFFER_MINUTES * 60 * 1000);
    const durationMinutes = (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60);
    totalMinutes += durationMinutes;
  }

  return totalMinutes / 60; // Convert to hours
}

/**
 * Calculate active hours from total call duration
 */
function calculateActiveHours(sessions) {
  let totalSeconds = 0;
  for (const session of sessions) {
    totalSeconds += session.totalCallDuration;
  }
  return totalSeconds / 3600; // Convert to hours
}

/**
 * Format hours for display
 */
function formatHours(hours) {
  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

async function investigateSdrHours(startDate, endDate) {
  console.log("🔍 Investigating SDR Hours Discrepancy");
  console.log(`   Date Range: ${startDate} to ${endDate}\n`);

  try {
    // Step 1: Get all SDRs
    console.log("📋 Step 1: Fetching all SDRs...");
    const { data: sdrs, error: sdrsError } = await supabase
      .from("user_profiles")
      .select("id, full_name, email")
      .eq("role", "member");

    if (sdrsError || !sdrs || sdrs.length === 0) {
      console.error("❌ Error fetching SDRs:", sdrsError);
      process.exit(1);
    }

    console.log(`✅ Found ${sdrs.length} SDRs\n`);

    // Step 2: For each SDR, recalculate hours from raw call data
    const results = [];

    for (const sdr of sdrs) {
      console.log(`\n📊 Processing ${sdr.full_name || sdr.email} (${sdr.id})...`);

      // Get all calls in date range
      const startIso = `${startDate}T00:00:00.000Z`;
      const endIso = `${endDate}T23:59:59.999Z`;

      const { data: calls, error: callsError } = await supabase
        .from("calls")
        .select("id, initiated_at, duration, status")
        .eq("user_id", sdr.id)
        .gte("initiated_at", startIso)
        .lte("initiated_at", endIso)
        .order("initiated_at", { ascending: true });

      if (callsError) {
        console.error(`   ❌ Error fetching calls:`, callsError);
        continue;
      }

      if (!calls || calls.length === 0) {
        console.log(`   ⚠️  No calls found for this period`);
        continue;
      }

      // Recalculate hours using session logic
      const sessions = groupCallsIntoSessions(calls);
      const calculatedPaidHours = calculatePaidHours(sessions);
      const calculatedActiveHours = calculateActiveHours(sessions);
      const calculatedEfficiency = calculatedPaidHours > 0 
        ? (calculatedActiveHours / calculatedPaidHours) * 100 
        : 0;

      // Get stored summaries
      const { data: dailySummaries, error: summariesError } = await supabase
        .from("daily_sdr_summaries")
        .select("date, paid_hours, active_hours, efficiency, total_dials")
        .eq("sdr_user_id", sdr.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (summariesError) {
        console.error(`   ❌ Error fetching summaries:`, summariesError);
      }

      // Calculate totals from stored summaries
      const storedPaidHours = dailySummaries?.reduce((sum, s) => sum + (parseFloat(s.paid_hours) || 0), 0) || 0;
      const storedActiveHours = dailySummaries?.reduce((sum, s) => sum + (parseFloat(s.active_hours) || 0), 0) || 0;
      const storedEfficiency = storedPaidHours > 0 
        ? (storedActiveHours / storedPaidHours) * 100 
        : 0;

      // Calculate discrepancy
      const paidHoursDiff = storedPaidHours - calculatedPaidHours;
      const activeHoursDiff = storedActiveHours - calculatedActiveHours;

      // Store results
      results.push({
        sdr: sdr.full_name || sdr.email,
        sdrId: sdr.id,
        calls: calls.length,
        calculatedPaidHours,
        calculatedActiveHours,
        calculatedEfficiency,
        storedPaidHours,
        storedActiveHours,
        storedEfficiency,
        paidHoursDiff,
        activeHoursDiff,
        hasDiscrepancy: Math.abs(paidHoursDiff) > 0.01 || Math.abs(activeHoursDiff) > 0.01,
        dailySummaries: dailySummaries || [],
      });

      // Print summary
      console.log(`   📞 Total Calls: ${calls.length}`);
      console.log(`   ⏱️  Calculated: ${formatHours(calculatedPaidHours)} paid, ${formatHours(calculatedActiveHours)} active (${Math.round(calculatedEfficiency)}% efficiency)`);
      console.log(`   💾 Stored: ${formatHours(storedPaidHours)} paid, ${formatHours(storedActiveHours)} active (${Math.round(storedEfficiency)}% efficiency)`);
      
      if (Math.abs(paidHoursDiff) > 0.01) {
        console.log(`   ⚠️  DISCREPANCY: ${paidHoursDiff > 0 ? '+' : ''}${formatHours(paidHoursDiff)} paid hours difference`);
      } else {
        console.log(`   ✅ Hours match`);
      }
    }

    // Step 3: Print summary report
    console.log("\n\n" + "=".repeat(80));
    console.log("📊 SUMMARY REPORT");
    console.log("=".repeat(80) + "\n");

    const withDiscrepancies = results.filter(r => r.hasDiscrepancy);
    const withoutDiscrepancies = results.filter(r => !r.hasDiscrepancy);

    if (withDiscrepancies.length > 0) {
      console.log(`⚠️  ${withDiscrepancies.length} SDR(s) with discrepancies:\n`);
      withDiscrepancies.forEach(r => {
        console.log(`   ${r.sdr}:`);
        console.log(`      Calculated: ${formatHours(r.calculatedPaidHours)} paid`);
        console.log(`      Stored: ${formatHours(r.storedPaidHours)} paid`);
        console.log(`      Difference: ${r.paidHoursDiff > 0 ? '+' : ''}${formatHours(r.paidHoursDiff)}`);
        console.log();
      });
    }

    if (withoutDiscrepancies.length > 0) {
      console.log(`✅ ${withoutDiscrepancies.length} SDR(s) with matching hours\n`);
    }

    // Print detailed breakdown for discrepancies
    if (withDiscrepancies.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("📋 DETAILED BREAKDOWN (SDRs with discrepancies)");
      console.log("=".repeat(80) + "\n");

      for (const r of withDiscrepancies) {
        console.log(`\n${r.sdr} (${r.sdrId}):`);
        console.log(`   Total Calls: ${r.calls}`);
        console.log(`   Calculated Paid Hours: ${formatHours(r.calculatedPaidHours)}`);
        console.log(`   Stored Paid Hours: ${formatHours(r.storedPaidHours)}`);
        console.log(`   Difference: ${r.paidHoursDiff > 0 ? '+' : ''}${formatHours(r.paidHoursDiff)}`);
        
        if (r.dailySummaries.length > 0) {
          console.log(`\n   Daily Breakdown (stored):`);
          r.dailySummaries.forEach(s => {
            console.log(`      ${s.date}: ${formatHours(parseFloat(s.paid_hours) || 0)} paid, ${s.total_dials || 0} dials`);
          });
        }
      }
    }

    console.log("\n🎉 Investigation complete!");
    console.log("\n💡 Next Steps:");
    console.log("   If discrepancies found, regenerate daily summaries using:");
    console.log("   POST /api/cron/generate-daily-summaries");

  } catch (error) {
    console.error("❌ Investigation failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const startDate = process.argv[2] || "2025-12-15";
const endDate = process.argv[3] || "2025-12-20";

investigateSdrHours(startDate, endDate);


