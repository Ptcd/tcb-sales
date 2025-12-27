#!/usr/bin/env node

/**
 * Regenerate Daily Summaries Script
 * 
 * Regenerates daily_sdr_summaries for specific dates by recalculating from raw call data
 * 
 * Usage: node scripts/regenerate-daily-summaries.js [start_date] [end_date]
 * Example: node scripts/regenerate-daily-summaries.js 2025-12-15 2025-12-19
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

// Import the metrics calculation functions
// Since we can't import TypeScript directly, we'll reimplement the logic
const SESSION_GAP_MINUTES = 30;
const SESSION_BUFFER_MINUTES = 5;

function groupCallsIntoSessions(calls) {
  if (calls.length === 0) return [];
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
      currentSession.end = callTime;
      currentSession.calls.push(call);
      currentSession.totalCallDuration += call.duration || 0;
    } else {
      sessions.push(currentSession);
      currentSession = {
        start: callTime,
        end: callTime,
        calls: [call],
        totalCallDuration: call.duration || 0,
      };
    }
  }
  sessions.push(currentSession);
  return sessions;
}

function calculatePaidHours(sessions) {
  let totalMinutes = 0;
  for (const session of sessions) {
    const sessionStart = new Date(session.start.getTime() - SESSION_BUFFER_MINUTES * 60 * 1000);
    const sessionEnd = new Date(session.end.getTime() + SESSION_BUFFER_MINUTES * 60 * 1000);
    const durationMinutes = (sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60);
    totalMinutes += durationMinutes;
  }
  return Math.round((totalMinutes / 60) * 100) / 100;
}

function calculateActiveHours(sessions) {
  let totalSeconds = 0;
  for (const session of sessions) {
    totalSeconds += session.totalCallDuration;
  }
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

async function computeDailyMetrics(sdrUserId, startDate, endDate) {
  const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
  const endIso = new Date(`${endDate}T23:59:59.999Z`).toISOString();

  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, initiated_at, duration, status, outcome_code, cta_attempted, cta_result")
    .eq("user_id", sdrUserId)
    .gte("initiated_at", startIso)
    .lte("initiated_at", endIso)
    .order("initiated_at", { ascending: true });

  if (error || !calls || calls.length === 0) {
    return {
      paidHours: 0,
      activeHours: 0,
      efficiency: 0,
      totalDials: 0,
      conversations: 0,
      ctaAttempts: 0,
      ctaAcceptances: 0,
      outcomeDistribution: {},
    };
  }

  const sessions = groupCallsIntoSessions(calls);
  const paidHours = calculatePaidHours(sessions);
  const activeHours = calculateActiveHours(sessions);
  const efficiency = paidHours > 0 ? Math.round((activeHours / paidHours) * 100 * 100) / 100 : 0;

  const totalDials = calls.length;
  const conversations = calls.filter(c => (c.duration || 0) >= 30).length;
  const ctaAttempts = calls.filter(c => c.cta_attempted === true).length;
  const ctaAcceptances = calls.filter(c => c.cta_result === 'ACCEPTED').length;

  const outcomeDistribution = {};
  for (const call of calls) {
    const outcome = call.outcome_code || 'UNKNOWN';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
  }

  return {
    paidHours,
    activeHours,
    efficiency,
    totalDials,
    conversations,
    ctaAttempts,
    ctaAcceptances,
    outcomeDistribution,
  };
}

async function computeJCCMetrics(sdrUserId, startDate, endDate) {
  const { data: jccCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", "Junk Car Calculator")
    .single();

  if (!jccCampaign) {
    return { trialsStarted: 0, paidSignupsWeekToDate: 0 };
  }

  const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
  const endIso = new Date(`${endDate}T23:59:59.999Z`).toISOString();

  const { data: jccLeads } = await supabase
    .from("campaign_leads")
    .select("lead_id")
    .eq("campaign_id", jccCampaign.id);

  if (!jccLeads || jccLeads.length === 0) {
    return { trialsStarted: 0, paidSignupsWeekToDate: 0 };
  }

  const jccLeadIds = jccLeads.map(l => l.lead_id);

  const { data: trialNotifications } = await supabase
    .from("lead_notifications")
    .select("lead_id")
    .eq("sdr_user_id", sdrUserId)
    .eq("event_type", "trial_started")
    .in("lead_id", jccLeadIds)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const uniqueTrialLeadIds = new Set(trialNotifications?.map(n => n.lead_id) || []);
  const trialsStarted = uniqueTrialLeadIds.size;

  // Calculate week start (Monday)
  const endDateObj = new Date(endDate);
  const dayOfWeek = endDateObj.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(endDateObj);
  weekStart.setDate(endDateObj.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);

  const { count: paidSignupsWeekToDate } = await supabase
    .from("lead_notifications")
    .select("*", { count: "exact", head: true })
    .eq("sdr_user_id", sdrUserId)
    .eq("event_type", "paid_subscribed")
    .in("lead_id", jccLeadIds)
    .gte("created_at", weekStart.toISOString())
    .lte("created_at", endIso);

  return {
    trialsStarted: trialsStarted || 0,
    paidSignupsWeekToDate: paidSignupsWeekToDate || 0,
  };
}

async function regenerateDailySummaries(startDate, endDate) {
  console.log("🔄 Regenerating Daily Summaries");
  console.log(`   Date Range: ${startDate} to ${endDate}\n`);

  // Get all SDRs
  const { data: sdrs, error: sdrsError } = await supabase
    .from("user_profiles")
    .select("id, email, full_name")
    .eq("role", "member");

  if (sdrsError || !sdrs || sdrs.length === 0) {
    console.error("❌ Error fetching SDRs:", sdrsError);
    process.exit(1);
  }

  console.log(`✅ Found ${sdrs.length} SDRs\n`);

  // Generate date range
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split("T")[0]);
  }

  let totalRegenerated = 0;

  for (const sdr of sdrs) {
    console.log(`\n📊 Processing ${sdr.full_name || sdr.email}...`);

    for (const date of dates) {
      // Calculate 24-hour window for this date (11 PM previous day to 11 PM current day UTC)
      const dateObj = new Date(`${date}T00:00:00.000Z`);
      const endOfWindow = new Date(dateObj);
      endOfWindow.setUTCHours(23, 0, 0, 0);
      const startOfWindow = new Date(endOfWindow);
      startOfWindow.setUTCDate(startOfWindow.getUTCDate() - 1);
      startOfWindow.setUTCHours(23, 0, 0, 0);

      // Compute metrics
      const dailyMetrics = await computeDailyMetrics(sdr.id, date, date);
      const jccMetrics = await computeJCCMetrics(sdr.id, date, date);

      // Skip if no activity
      if (dailyMetrics.totalDials === 0 && jccMetrics.trialsStarted === 0) {
        continue;
      }

      // Upsert daily summary
      const { error: upsertError } = await supabase
        .from("daily_sdr_summaries")
        .upsert(
          {
            sdr_user_id: sdr.id,
            date: date,
            paid_hours: dailyMetrics.paidHours,
            active_hours: dailyMetrics.activeHours,
            efficiency: dailyMetrics.efficiency,
            total_dials: dailyMetrics.totalDials,
            conversations: dailyMetrics.conversations,
            trials_started: jccMetrics.trialsStarted,
            paid_signups_week_to_date: jccMetrics.paidSignupsWeekToDate,
            cta_attempts: dailyMetrics.ctaAttempts,
            cta_acceptances: dailyMetrics.ctaAcceptances,
            outcome_distribution: dailyMetrics.outcomeDistribution,
          },
          {
            onConflict: "sdr_user_id,date",
          }
        );

      if (upsertError) {
        console.error(`   ❌ Error upserting summary for ${date}:`, upsertError);
      } else {
        console.log(`   ✅ Regenerated ${date}: ${dailyMetrics.totalDials} dials, ${dailyMetrics.paidHours.toFixed(2)}h paid`);
        totalRegenerated++;
      }
    }
  }

  console.log(`\n\n🎉 Regeneration complete!`);
  console.log(`   Total summaries regenerated: ${totalRegenerated}`);
  console.log(`\n💡 Next step: Run investigate-sdr-hours.js again to verify fixes`);
}

// Parse command line arguments
const startDate = process.argv[2] || "2025-12-15";
const endDate = process.argv[3] || "2025-12-19";

regenerateDailySummaries(startDate, endDate);


