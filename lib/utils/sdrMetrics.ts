import { SupabaseClient } from "@supabase/supabase-js";

/**
 * SDR Metrics Calculation Utilities
 * 
 * Session logic:
 * - A "session" is a block of calls where the gap between consecutive calls is < 30 minutes
 * - session_start = first call time - 5 minutes
 * - session_end = last call time + 5 minutes
 * - paid_hours = sum of all session durations
 * - active_hours = sum of all call durations
 * - efficiency = active_hours / paid_hours
 */

interface CallRecord {
  id: string;
  initiated_at: string;
  duration: number | null;
  status: string;
  outcome_code?: string;
  cta_attempted?: boolean;
  cta_result?: string;
}

interface Session {
  start: Date;
  end: Date;
  calls: CallRecord[];
  totalCallDuration: number; // seconds
}

interface DailyMetrics {
  paidHours: number;
  activeHours: number;
  efficiency: number;
  totalDials: number;
  conversations: number; // calls with duration >= 30 seconds
  // CTA metrics
  ctaAttempts: number;
  ctaAcceptances: number;
  // Outcome distribution
  outcomeDistribution: Record<string, number>;
}

interface JCCMetrics {
  trialsStarted: number;
  paidSignupsWeekToDate: number;
}

// Full SDR funnel metrics
export interface SDRFunnelMetrics {
  trialsStarted: number;
  trialsActivated: number;
  snippetsInstalled: number;
  paidConversions: number;
  totalMrr: number;
  // Conversion rates (percentages)
  activationRate: number;     // activated / started
  snippetRate: number;        // snippet / activated
  conversionRate: number;     // paid / started
}

// Campaign goals interface (matches database)
export interface CampaignGoals {
  target_dials_per_hour: number;
  target_conversations_per_hour: number;
  target_cta_attempts_per_hour: number;
  target_cta_acceptances_per_hour: number;
  target_trials_per_hour: number;
  weekly_dials_goal: number;
  weekly_trials_goal: number;
  min_conversation_rate_pct: number;
  min_trials_per_conversation_pct: number;
}

// Default goals if none set
export const DEFAULT_GOALS: CampaignGoals = {
  target_dials_per_hour: 50,
  target_conversations_per_hour: 5,
  target_cta_attempts_per_hour: 3,
  target_cta_acceptances_per_hour: 1.5,
  target_trials_per_hour: 0.5,
  weekly_dials_goal: 500,
  weekly_trials_goal: 10,
  min_conversation_rate_pct: 10,
  min_trials_per_conversation_pct: 10,
};

// Goal status - green (100%+), yellow (75-99%), red (<75%)
export type GoalStatus = 'green' | 'yellow' | 'red';

/**
 * Calculate goal status based on actual vs target
 */
export function getGoalStatus(actual: number, target: number): GoalStatus {
  if (target <= 0) return 'green';
  const ratio = actual / target;
  if (ratio >= 1) return 'green';
  if (ratio >= 0.75) return 'yellow';
  return 'red';
}

/**
 * Calculate metrics vs goals with status
 */
export interface MetricWithGoal {
  actual: number;
  normalizedPerHour: number;
  target: number;
  status: GoalStatus;
}

/**
 * Calculate all metrics with goal comparisons
 */
export function calculateMetricsWithGoals(
  metrics: DailyMetrics,
  goals: CampaignGoals,
  trialsStarted: number = 0
): {
  dialsPerHour: MetricWithGoal;
  conversationsPerHour: MetricWithGoal;
  ctaAttemptsPerHour: MetricWithGoal;
  ctaAcceptancesPerHour: MetricWithGoal;
  trialsPerHour: MetricWithGoal;
  conversationRate: MetricWithGoal;
  overallScore: number;
  overallStatus: GoalStatus;
} {
  const paidHours = metrics.paidHours || 1; // Avoid division by zero

  // Calculate normalized metrics
  const dialsPerHour = metrics.totalDials / paidHours;
  const conversationsPerHour = metrics.conversations / paidHours;
  const ctaAttemptsPerHour = metrics.ctaAttempts / paidHours;
  const ctaAcceptancesPerHour = metrics.ctaAcceptances / paidHours;
  const trialsPerHour = trialsStarted / paidHours;
  const conversationRate = metrics.totalDials > 0 
    ? (metrics.conversations / metrics.totalDials) * 100 
    : 0;

  const result = {
    dialsPerHour: {
      actual: metrics.totalDials,
      normalizedPerHour: Math.round(dialsPerHour * 10) / 10,
      target: goals.target_dials_per_hour,
      status: getGoalStatus(dialsPerHour, goals.target_dials_per_hour),
    },
    conversationsPerHour: {
      actual: metrics.conversations,
      normalizedPerHour: Math.round(conversationsPerHour * 10) / 10,
      target: goals.target_conversations_per_hour,
      status: getGoalStatus(conversationsPerHour, goals.target_conversations_per_hour),
    },
    ctaAttemptsPerHour: {
      actual: metrics.ctaAttempts,
      normalizedPerHour: Math.round(ctaAttemptsPerHour * 10) / 10,
      target: goals.target_cta_attempts_per_hour,
      status: getGoalStatus(ctaAttemptsPerHour, goals.target_cta_attempts_per_hour),
    },
    ctaAcceptancesPerHour: {
      actual: metrics.ctaAcceptances,
      normalizedPerHour: Math.round(ctaAcceptancesPerHour * 10) / 10,
      target: goals.target_cta_acceptances_per_hour,
      status: getGoalStatus(ctaAcceptancesPerHour, goals.target_cta_acceptances_per_hour),
    },
    trialsPerHour: {
      actual: trialsStarted,
      normalizedPerHour: Math.round(trialsPerHour * 100) / 100,
      target: goals.target_trials_per_hour,
      status: getGoalStatus(trialsPerHour, goals.target_trials_per_hour),
    },
    conversationRate: {
      actual: Math.round(conversationRate * 10) / 10,
      normalizedPerHour: Math.round(conversationRate * 10) / 10, // Same as actual for rates
      target: goals.min_conversation_rate_pct,
      status: getGoalStatus(conversationRate, goals.min_conversation_rate_pct),
    },
    overallScore: 0,
    overallStatus: 'green' as GoalStatus,
  };

  // Calculate overall score (average of all status ratios)
  const statusValues = [
    result.dialsPerHour,
    result.conversationsPerHour,
    result.ctaAttemptsPerHour,
    result.trialsPerHour,
  ];
  
  const avgRatio = statusValues.reduce((sum, m) => {
    const ratio = m.target > 0 ? m.normalizedPerHour / m.target : 1;
    return sum + Math.min(ratio, 1.5); // Cap at 150%
  }, 0) / statusValues.length;

  result.overallScore = Math.round(avgRatio * 100);
  result.overallStatus = getGoalStatus(avgRatio, 1);

  return result;
}

const SESSION_GAP_MINUTES = 30;  // Gaps over 30 min = off the clock
const SESSION_BUFFER_MINUTES = 5;  // 5 min credit before first call / after last call
const CONVERSATION_THRESHOLD_SECONDS = 30;

/**
 * Group calls into sessions based on 30-minute gap rule
 */
function groupCallsIntoSessions(calls: CallRecord[]): Session[] {
  if (calls.length === 0) return [];

  // Sort by initiated_at
  const sortedCalls = [...calls].sort(
    (a, b) => new Date(a.initiated_at).getTime() - new Date(b.initiated_at).getTime()
  );

  const sessions: Session[] = [];
  let currentSession: Session = {
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
function calculatePaidHours(sessions: Session[]): number {
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
function calculateActiveHours(sessions: Session[]): number {
  let totalSeconds = 0;
  for (const session of sessions) {
    totalSeconds += session.totalCallDuration;
  }
  return totalSeconds / 3600; // Convert to hours
}

/**
 * Compute daily metrics for an SDR within a date range
 * @param startDate - Start of the time window
 * @param endDate - End of the time window (optional, defaults to end of startDate's day)
 */
export async function computeDailyMetrics(
  supabase: SupabaseClient,
  sdrUserId: string,
  startDate: Date,
  endDate?: Date
): Promise<DailyMetrics> {
  // If endDate not provided, use end of startDate's day (backward compatibility)
  const startOfWindow = new Date(startDate);
  const endOfWindow = endDate ? new Date(endDate) : (() => {
    const e = new Date(startDate);
    e.setHours(23, 59, 59, 999);
    return e;
  })();

  // Fetch all calls for this SDR in the window (including CTA fields)
  const { data: calls, error } = await supabase
    .from("calls")
    .select("id, initiated_at, duration, status, outcome_code, cta_attempted, cta_result")
    .eq("user_id", sdrUserId)
    .gte("initiated_at", startOfWindow.toISOString())
    .lte("initiated_at", endOfWindow.toISOString())
    .order("initiated_at", { ascending: true });

  if (error) {
    console.error("Error fetching calls for metrics:", error);
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

  // Fetch emails sent by this user in the window
  const { data: emails } = await supabase
    .from("email_messages")
    .select("id, created_at, sent_at")
    .eq("user_id", sdrUserId)
    .eq("direction", "outbound")
    .in("status", ["sent", "delivered"])
    .gte("created_at", startOfWindow.toISOString())
    .lte("created_at", endOfWindow.toISOString());

  // Fetch SMS sent by this user in the window  
  const { data: smsMessages } = await supabase
    .from("sms_messages")
    .select("id, created_at, sent_at")
    .eq("user_id", sdrUserId)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .gte("created_at", startOfWindow.toISOString())
    .lte("created_at", endOfWindow.toISOString());

  // Convert emails and SMS to activity records (assume 1 minute each for email, 30 seconds for SMS)
  const emailActivities: CallRecord[] = (emails || []).map(e => ({
    id: e.id,
    initiated_at: e.sent_at || e.created_at,
    duration: 60, // 1 minute per email
    status: "completed",
  }));

  const smsActivities: CallRecord[] = (smsMessages || []).map(s => ({
    id: s.id,
    initiated_at: s.sent_at || s.created_at,
    duration: 30, // 30 seconds per SMS
    status: "completed",
  }));

  // Merge all activities with calls
  const allActivities = [...(calls || []), ...emailActivities, ...smsActivities];

  if (allActivities.length === 0) {
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

  // Group into sessions
  const sessions = groupCallsIntoSessions(allActivities);

  // Calculate metrics
  const paidHours = calculatePaidHours(sessions);
  const activeHours = calculateActiveHours(sessions);
  const efficiency = paidHours > 0 ? (activeHours / paidHours) * 100 : 0;

  // Only count actual calls for dials/conversations (not emails/SMS)
  const actualCalls = allActivities.filter(a => calls.some(c => c.id === a.id));
  const totalDials = actualCalls.length;
  const conversations = actualCalls.filter(
    (c) => (c.duration || 0) >= CONVERSATION_THRESHOLD_SECONDS
  ).length;

  // CTA metrics (only from calls)
  const ctaAttempts = actualCalls.filter((c) => c.cta_attempted === true).length;
  const ctaAcceptances = actualCalls.filter((c) => c.cta_result === 'ACCEPTED').length;

  // Outcome distribution (only from calls)
  const outcomeDistribution: Record<string, number> = {};
  for (const call of actualCalls) {
    const outcome = call.outcome_code || 'UNKNOWN';
    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
  }

  return {
    paidHours: Math.round(paidHours * 100) / 100,
    activeHours: Math.round(activeHours * 100) / 100,
    efficiency: Math.round(efficiency * 100) / 100,
    totalDials,
    conversations,
    ctaAttempts,
    ctaAcceptances,
    outcomeDistribution,
  };
}

/**
 * Get JCC-specific metrics (trials started and paid signups)
 * Only counts events for leads that are in the JCC campaign
 * @param startDate - Start of the time window
 * @param endDate - End of the time window (optional, defaults to end of startDate's day)
 */
export async function computeJCCMetrics(
  supabase: SupabaseClient,
  sdrUserId: string,
  startDate: Date,
  endDate?: Date
): Promise<JCCMetrics> {
  // Get the JCC campaign ID
  const { data: jccCampaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", "Junk Car Calculator")
    .single();

  if (campaignError || !jccCampaign) {
    console.log("JCC campaign not found for metrics");
    return { trialsStarted: 0, paidSignupsWeekToDate: 0 };
  }

  const jccCampaignId = jccCampaign.id;

  // Use provided date range or default to calendar day
  const startOfWindow = new Date(startDate);
  const endOfWindow = endDate ? new Date(endDate) : (() => {
    const e = new Date(startDate);
    e.setHours(23, 59, 59, 999);
    return e;
  })();

  // Calculate Monday of the week containing endOfWindow
  const weekEndDate = endDate || new Date(startDate);
  const dayOfWeek = weekEndDate.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(weekEndDate);
  weekStart.setDate(weekEndDate.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);

  // Get lead IDs that are in the JCC campaign
  const { data: jccLeads, error: jccLeadsError } = await supabase
    .from("campaign_leads")
    .select("lead_id")
    .eq("campaign_id", jccCampaignId);

  if (jccLeadsError || !jccLeads || jccLeads.length === 0) {
    console.log("No JCC campaign leads found");
    return { trialsStarted: 0, paidSignupsWeekToDate: 0 };
  }

  const jccLeadIds = jccLeads.map((l) => l.lead_id);

  // Count UNIQUE LEADS with trials started in the window
  // This prevents double-counting if a trial was re-sent to the same lead
  const { data: trialNotifications, error: trialsError } = await supabase
    .from("lead_notifications")
    .select("lead_id")
    .eq("sdr_user_id", sdrUserId)
    .eq("event_type", "trial_started")
    .in("lead_id", jccLeadIds)
    .gte("created_at", startOfWindow.toISOString())
    .lte("created_at", endOfWindow.toISOString());

  if (trialsError) {
    console.error("Error counting trials:", trialsError);
  }

  // Deduplicate by lead_id
  const uniqueTrialLeadIds = new Set(trialNotifications?.map(n => n.lead_id) || []);
  const trialsStarted = uniqueTrialLeadIds.size;

  // Count paid signups week-to-date (from Monday of week to end of window)
  // Only count notifications for leads that are in the JCC campaign
  const { count: paidSignupsWeekToDate, error: paidError } = await supabase
    .from("lead_notifications")
    .select("*", { count: "exact", head: true })
    .eq("sdr_user_id", sdrUserId)
    .eq("event_type", "paid_subscribed")
    .in("lead_id", jccLeadIds)
    .gte("created_at", weekStart.toISOString())
    .lte("created_at", endOfWindow.toISOString());

  if (paidError) {
    console.error("Error counting paid signups:", paidError);
  }

  return {
    trialsStarted: trialsStarted || 0,
    paidSignupsWeekToDate: paidSignupsWeekToDate || 0,
  };
}

/**
 * Get full SDR funnel metrics (all 4 stages)
 * Counts events for leads in the JCC campaign within a date range
 */
export async function computeSDRFunnelMetrics(
  supabase: SupabaseClient,
  sdrUserId: string,
  startDate: Date,
  endDate: Date
): Promise<SDRFunnelMetrics> {
  // Get the JCC campaign ID
  const { data: jccCampaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", "Junk Car Calculator")
    .single();

  if (campaignError || !jccCampaign) {
    console.log("JCC campaign not found for funnel metrics");
    return {
      trialsStarted: 0,
      trialsActivated: 0,
      snippetsInstalled: 0,
      paidConversions: 0,
      totalMrr: 0,
      activationRate: 0,
      snippetRate: 0,
      conversionRate: 0,
    };
  }

  const jccCampaignId = jccCampaign.id;
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Get lead IDs that are in the JCC campaign
  const { data: jccLeads, error: jccLeadsError } = await supabase
    .from("campaign_leads")
    .select("lead_id")
    .eq("campaign_id", jccCampaignId);

  if (jccLeadsError || !jccLeads || jccLeads.length === 0) {
    console.log("No JCC campaign leads found");
    return {
      trialsStarted: 0,
      trialsActivated: 0,
      snippetsInstalled: 0,
      paidConversions: 0,
      totalMrr: 0,
      activationRate: 0,
      snippetRate: 0,
      conversionRate: 0,
    };
  }

  const jccLeadIds = jccLeads.map((l) => l.lead_id);

  // Fetch all notifications first, then deduplicate by lead_id
  // This prevents double-counting if events were re-sent to the same lead
  const [trialsStartedData, snippetsInstalledData, paidConversionsData] = await Promise.all([
    supabase
      .from("lead_notifications")
      .select("lead_id")
      .eq("sdr_user_id", sdrUserId)
      .eq("event_type", "trial_started")
      .in("lead_id", jccLeadIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("lead_notifications")
      .select("lead_id")
      .eq("sdr_user_id", sdrUserId)
      .in("event_type", ["first_lead_received", "snippet_installed"]) // New event + legacy
      .in("lead_id", jccLeadIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("lead_notifications")
      .select("lead_id")
      .eq("sdr_user_id", sdrUserId)
      .eq("event_type", "paid_subscribed")
      .in("lead_id", jccLeadIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);

  // Get activated trials from trial_pipeline (calculator_modified + first_lead_received)
  const { data: activatedTrials } = await supabase
    .from("trial_pipeline")
    .select("crm_lead_id")
    .eq("owner_sdr_id", sdrUserId)
    .not("calculator_modified_at", "is", null)
    .not("first_lead_received_at", "is", null)
    .in("crm_lead_id", jccLeadIds)
    .gte("trial_started_at", startIso)
    .lte("trial_started_at", endIso);

  // Get total MRR from paid leads
  const { data: paidLeads } = await supabase
    .from("search_results")
    .select("client_mrr")
    .eq("assigned_to", sdrUserId)
    .eq("client_status", "paid")
    .in("id", jccLeadIds)
    .not("client_mrr", "is", null);

  const totalMrr = paidLeads?.reduce((sum, lead) => sum + (lead.client_mrr || 0), 0) || 0;

  // Deduplicate each by lead_id
  const started = new Set(trialsStartedData.data?.map(n => n.lead_id) || []).size;
  const activated = new Set(activatedTrials?.map(t => t.crm_lead_id) || []).size;
  const snippets = new Set(snippetsInstalledData.data?.map(n => n.lead_id) || []).size;
  const paid = new Set(paidConversionsData.data?.map(n => n.lead_id) || []).size;

  return {
    trialsStarted: started,
    trialsActivated: activated,
    snippetsInstalled: snippets,
    paidConversions: paid,
    totalMrr: Math.round(totalMrr * 100) / 100,
    activationRate: started > 0 ? Math.round((activated / started) * 1000) / 10 : 0,
    snippetRate: activated > 0 ? Math.round((snippets / activated) * 1000) / 10 : 0,
    conversionRate: started > 0 ? Math.round((paid / started) * 1000) / 10 : 0,
  };
}

/**
 * Compute weekly aggregated metrics for an SDR
 */
export async function computeWeeklyMetrics(
  supabase: SupabaseClient,
  sdrUserId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<{
  paidHours: number;
  activeHours: number;
  averageEfficiency: number;
  totalDials: number;
  conversations: number;
  trialsStarted: number;
  paidSignups: number;
  ctaAttempts: number;
  ctaAcceptances: number;
}> {
  // Fetch daily summaries for the week
  const { data: dailySummaries, error } = await supabase
    .from("daily_sdr_summaries")
    .select("*")
    .eq("sdr_user_id", sdrUserId)
    .gte("date", weekStart.toISOString().split("T")[0])
    .lte("date", weekEnd.toISOString().split("T")[0]);

  if (error) {
    console.error("Error fetching daily summaries for weekly aggregation:", error);
  }

  if (!dailySummaries || dailySummaries.length === 0) {
    return {
      paidHours: 0,
      activeHours: 0,
      averageEfficiency: 0,
      totalDials: 0,
      conversations: 0,
      trialsStarted: 0,
      paidSignups: 0,
      ctaAttempts: 0,
      ctaAcceptances: 0,
    };
  }

  // Aggregate metrics
  let totalPaidHours = 0;
  let totalActiveHours = 0;
  let totalDials = 0;
  let totalConversations = 0;
  let totalTrials = 0;
  let totalCtaAttempts = 0;
  let totalCtaAcceptances = 0;
  let weightedEfficiencySum = 0;

  for (const summary of dailySummaries) {
    totalPaidHours += parseFloat(summary.paid_hours) || 0;
    totalActiveHours += parseFloat(summary.active_hours) || 0;
    totalDials += summary.total_dials || 0;
    totalConversations += summary.conversations || 0;
    totalTrials += summary.trials_started || 0;
    totalCtaAttempts += summary.cta_attempts || 0;
    totalCtaAcceptances += summary.cta_acceptances || 0;
    
    // Time-weighted efficiency
    const dayPaidHours = parseFloat(summary.paid_hours) || 0;
    const dayEfficiency = parseFloat(summary.efficiency) || 0;
    weightedEfficiencySum += dayPaidHours * dayEfficiency;
  }

  // Calculate time-weighted average efficiency
  const averageEfficiency = totalPaidHours > 0 
    ? weightedEfficiencySum / totalPaidHours 
    : 0;

  // For paid signups, use the last day's week-to-date value (which should be the full week)
  const lastDaySummary = dailySummaries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  const paidSignups = lastDaySummary?.paid_signups_week_to_date || 0;

  return {
    paidHours: Math.round(totalPaidHours * 100) / 100,
    activeHours: Math.round(totalActiveHours * 100) / 100,
    averageEfficiency: Math.round(averageEfficiency * 100) / 100,
    totalDials,
    conversations: totalConversations,
    trialsStarted: totalTrials,
    paidSignups,
    ctaAttempts: totalCtaAttempts,
    ctaAcceptances: totalCtaAcceptances,
  };
}

/**
 * Fetch campaign goals for a specific campaign
 */
export async function fetchCampaignGoals(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CampaignGoals> {
  const { data: goals, error } = await supabase
    .from("campaign_goals")
    .select("*")
    .eq("campaign_id", campaignId)
    .single();

  if (error || !goals) {
    return DEFAULT_GOALS;
  }

  return {
    target_dials_per_hour: goals.target_dials_per_hour ?? DEFAULT_GOALS.target_dials_per_hour,
    target_conversations_per_hour: goals.target_conversations_per_hour ?? DEFAULT_GOALS.target_conversations_per_hour,
    target_cta_attempts_per_hour: goals.target_cta_attempts_per_hour ?? DEFAULT_GOALS.target_cta_attempts_per_hour,
    target_cta_acceptances_per_hour: goals.target_cta_acceptances_per_hour ?? DEFAULT_GOALS.target_cta_acceptances_per_hour,
    target_trials_per_hour: goals.target_trials_per_hour ?? DEFAULT_GOALS.target_trials_per_hour,
    weekly_dials_goal: goals.weekly_dials_goal ?? DEFAULT_GOALS.weekly_dials_goal,
    weekly_trials_goal: goals.weekly_trials_goal ?? DEFAULT_GOALS.weekly_trials_goal,
    min_conversation_rate_pct: goals.min_conversation_rate_pct ?? DEFAULT_GOALS.min_conversation_rate_pct,
    min_trials_per_conversation_pct: goals.min_trials_per_conversation_pct ?? DEFAULT_GOALS.min_trials_per_conversation_pct,
  };
}

/**
 * Get Monday of the week for a given date
 * @deprecated Use getSalesWeekStart for consistent Friday 5PM PT boundary
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get Friday of the week for a given date
 * @deprecated Use getSalesWeekEnd for consistent Friday 5PM PT boundary
 */
export function getWeekEnd(date: Date): Date {
  const monday = getWeekStart(date);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return friday;
}

/**
 * Get start of sales week (Friday 5:00 PM Pacific Time)
 * 
 * LOGIC EXPLANATION:
 * - Sales week runs Friday 5PM PT to Friday 4:59PM PT (7 days)
 * - Pacific is the latest US timezone, so 5PM PT means all US business is done
 * - This function finds the most recent Friday 5PM PT boundary
 * 
 * EXAMPLES (assuming current time is Tuesday Dec 24, 2024 at 10 AM PT):
 * - Day of week = 2 (Tuesday), so we go back 2+2=4 days to Friday Dec 20
 * - Return: Friday Dec 20, 5:00 PM PT (converted to UTC)
 * 
 * @param date - The reference date (defaults to now)
 * @returns Date object representing Friday 5PM Pacific in UTC
 */
export function getSalesWeekStart(date: Date = new Date()): Date {
  // Step 1: Get the current day/time in Pacific timezone
  const pacificParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  
  const pacificYear = parseInt(pacificParts.find(p => p.type === 'year')!.value);
  const pacificMonth = parseInt(pacificParts.find(p => p.type === 'month')!.value) - 1; // 0-indexed
  const pacificDay = parseInt(pacificParts.find(p => p.type === 'day')!.value);
  const pacificHour = parseInt(pacificParts.find(p => p.type === 'hour')!.value);
  const dayOfWeek = new Date(pacificYear, pacificMonth, pacificDay).getDay(); // 0=Sun, 5=Fri, 6=Sat
  
  // Step 2: Calculate how many days to go back to reach the last Friday 5PM PT
  // If it's Friday before 5PM, we need LAST Friday (7 days back)
  // If it's Friday after 5PM, THIS Friday is the start (0 days back)
  let daysBack: number;
  if (dayOfWeek === 5) { // Friday
    daysBack = pacificHour >= 17 ? 0 : 7; // 17 = 5 PM in 24-hour format
  } else if (dayOfWeek === 6) { // Saturday
    daysBack = 1; // Yesterday was Friday
  } else { // Sunday (0) through Thursday (4)
    // Sunday: 0 + 2 = 2 days back (to Friday)
    // Monday: 1 + 2 = 3 days back
    // Tuesday: 2 + 2 = 4 days back
    // Wednesday: 3 + 2 = 5 days back
    // Thursday: 4 + 2 = 6 days back
    daysBack = dayOfWeek + 2;
  }
  
  // Step 3: Calculate the Friday date in Pacific time
  const fridayPacific = new Date(pacificYear, pacificMonth, pacificDay);
  fridayPacific.setDate(fridayPacific.getDate() - daysBack);
  fridayPacific.setHours(17, 0, 0, 0); // 5:00 PM Pacific (in local time, but we'll convert)
  
  // Step 4: Convert Pacific time to UTC
  // We need to create a UTC date that represents 5PM Pacific on this Friday
  // The trick: create a date string in Pacific time, then parse it as UTC with offset
  
  // Get the offset for this specific date (handles DST)
  // Create a test date at this Friday to get the correct offset
  const testDate = new Date(Date.UTC(fridayPacific.getFullYear(), fridayPacific.getMonth(), fridayPacific.getDate(), 12, 0, 0));
  const offsetMinutes = getTimezoneOffsetMinutes('America/Los_Angeles', testDate);
  
  // Create UTC date: 5PM Pacific = UTC time - offset
  // If Pacific is UTC-8, then 5PM Pacific = 1AM next day UTC
  // So: UTC = Pacific + 8 hours = Pacific + offset
  // But offset is positive (480 minutes for UTC-8), so we add it
  const utcDate = new Date(Date.UTC(
    fridayPacific.getFullYear(),
    fridayPacific.getMonth(),
    fridayPacific.getDate(),
    17 + Math.floor(offsetMinutes / 60), // Add offset hours to 5PM
    offsetMinutes % 60, // Add offset minutes
    0
  ));
  
  return utcDate;
}

/**
 * Get end of sales week (Friday 4:59:59.999 PM Pacific Time)
 * This is exactly 7 days after the start, minus 1 millisecond
 * 
 * @param date - The reference date (defaults to now)
 * @returns Date object representing Friday 4:59:59.999 PM Pacific in UTC
 */
export function getSalesWeekEnd(date: Date = new Date()): Date {
  const weekStart = getSalesWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7); // Exactly 7 days later
  weekEnd.setMilliseconds(weekEnd.getMilliseconds() - 1); // Subtract 1ms to get 4:59:59.999
  return weekEnd;
}

/**
 * Helper: Get timezone offset in minutes for a specific timezone
 * Returns positive number for timezones behind UTC (e.g., Pacific = +480 or +420)
 * Pacific is UTC-8 (PST) or UTC-7 (PDT), so offset is positive
 */
function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  // Get the hour in the target timezone for this UTC timestamp
  const tzHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  }).format(date));
  
  // Get the hour in UTC for the same timestamp
  const utcHour = date.getUTCHours();
  
  // Calculate the difference
  // If Pacific is UTC-8, and UTC is 1 AM, Pacific should be 5 PM (17:00) previous day
  // So: tzHour = 17, utcHour = 1, diff = 17 - 1 = 16 hours
  // But we need offset = 8 hours (Pacific is 8 hours behind)
  // So: offset = 24 - diff when diff > 12
  let diffHours = tzHour - utcHour;
  
  // Handle day rollover
  if (diffHours > 12) {
    diffHours -= 24; // Previous day
  } else if (diffHours < -12) {
    diffHours += 24; // Next day
  }
  
  // Offset is how many hours to ADD to timezone time to get UTC
  // If Pacific is UTC-8, offset is +8 hours = +480 minutes
  // If diffHours = -8 (Pacific is 8 hours behind), offset = 8 hours = 480 minutes
  return -diffHours * 60;
}

/**
 * Format hours for display (e.g., "2.5h" or "2h 30m")
 */
export function formatHours(hours: number): string {
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

/**
 * Format efficiency percentage for display
 */
export function formatEfficiency(efficiency: number): string {
  return `${Math.round(efficiency)}%`;
}

/**
 * Compute daily metrics for an Activator (meeting-based)
 * - Counts completed meeting duration
 * - Adds 30 min prep time per meeting
 * - Adds 15 min follow-up for blocked/partial installs
 */
export async function computeActivatorMetrics(
  supabase: SupabaseClient,
  activatorUserId: string,
  date: Date
): Promise<{ paidHours: number; meetingsCompleted: number; installsProven: number }> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Get completed meetings for this activator today
  const { data: meetings } = await supabase
    .from("activation_meetings")
    .select("id, status, scheduled_start_at, scheduled_end_at, outcome")
    .eq("activator_user_id", activatorUserId)
    .gte("scheduled_start_at", startOfDay.toISOString())
    .lte("scheduled_start_at", endOfDay.toISOString());

  if (!meetings || meetings.length === 0) {
    return { paidHours: 0, meetingsCompleted: 0, installsProven: 0 };
  }

  let totalMinutes = 0;
  let meetingsCompleted = 0;
  let installsProven = 0;

  const PREP_TIME_MINUTES = 30;
  const FOLLOWUP_TIME_MINUTES = 15;

  for (const meeting of meetings) {
    if (meeting.status === "completed" || meeting.status === "no_show") {
      meetingsCompleted++;
      
      // Meeting duration (default 30 min if no end time)
      const start = new Date(meeting.scheduled_start_at);
      const end = meeting.scheduled_end_at ? new Date(meeting.scheduled_end_at) : new Date(start.getTime() + 30 * 60 * 1000);
      const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      
      totalMinutes += durationMinutes;
      totalMinutes += PREP_TIME_MINUTES; // Prep time

      // Extra follow-up time for blocked/partial
      if (meeting.outcome === "blocked" || meeting.outcome === "partial") {
        totalMinutes += FOLLOWUP_TIME_MINUTES;
      }

      // Count proven installs
      if (meeting.outcome === "installed") {
        installsProven++;
      }
    }
  }

  return {
    paidHours: Math.round((totalMinutes / 60) * 100) / 100,
    meetingsCompleted,
    installsProven,
  };
}

