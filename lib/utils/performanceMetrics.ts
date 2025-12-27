import { SupabaseClient } from "@supabase/supabase-js";
import { computeDailyMetrics } from "./sdrMetrics";

/**
 * Performance Metrics Calculation Utilities
 * 
 * Calculates role-specific metrics for SDRs and Activators
 * with hours-normalized scoring bands
 */

export type ScoreBand = 'green' | 'yellow' | 'orange' | 'red';
export type Trend = 'up' | 'down' | 'flat';

// ============================================
// SDR Performance Metrics
// ============================================

export interface SDRPerformanceMetrics {
  hoursWorked: number;
  installAppointmentsAttended: number;
  installAppointmentsBooked: number;
  showRate: number; // attended / booked * 100
  conversations: number;
  dials: number;
}

export interface SDRScoring {
  expectedAttendedMin: number;
  expectedAttendedMax: number;
  scoreBand: ScoreBand;
  trend: Trend;
}

/**
 * Calculate SDR performance metrics for a date range
 */
export async function calculateSDRMetrics(
  supabase: SupabaseClient,
  sdrUserId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<SDRPerformanceMetrics> {
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  // Calculate hours using existing call session logic
  const dailyMetrics = await computeDailyMetrics(
    supabase,
    sdrUserId,
    weekStart,
    weekEnd
  );
  const hoursWorked = dailyMetrics.paidHours;

  // Get install appointments attended (status = 'completed')
  const { count: attendedCount } = await supabase
    .from("activation_meetings")
    .select("*", { count: "exact", head: true })
    .eq("scheduled_by_sdr_user_id", sdrUserId)
    .eq("status", "completed")
    .gte("completed_at", weekStartIso)
    .lt("completed_at", weekEndIso);

  // Get install appointments booked (all scheduled in range)
  const { count: bookedCount } = await supabase
    .from("activation_meetings")
    .select("*", { count: "exact", head: true })
    .eq("scheduled_by_sdr_user_id", sdrUserId)
    .gte("scheduled_start_at", weekStartIso)
    .lt("scheduled_start_at", weekEndIso);

  // Get conversations and dials from calls
  const { data: calls } = await supabase
    .from("calls")
    .select("duration")
    .eq("user_id", sdrUserId)
    .gte("initiated_at", weekStartIso)
    .lt("initiated_at", weekEndIso);

  const dials = calls?.length || 0;
  const conversations = calls?.filter(c => (c.duration || 0) >= 30).length || 0;

  const attended = attendedCount || 0;
  const booked = bookedCount || 0;
  const showRate = booked > 0 ? (attended / booked) * 100 : 0;

  return {
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    installAppointmentsAttended: attended,
    installAppointmentsBooked: booked,
    showRate: Math.round(showRate * 100) / 100,
    conversations,
    dials,
  };
}

/**
 * Calculate SDR scoring bands and expected ranges
 * Baseline: 40 hrs/week → 8-15 attended appointments
 */
export function calculateSDRScoring(
  metrics: SDRPerformanceMetrics,
  lastWeekMetrics?: SDRPerformanceMetrics
): SDRScoring {
  const hoursFactor = metrics.hoursWorked / 40;
  
  // Expected range: 8-15 for 40 hours, scaled by hours factor
  const expectedAttendedMin = Math.max(0, Math.round(8 * hoursFactor * 100) / 100);
  const expectedAttendedMax = Math.round(15 * hoursFactor * 100) / 100;

  // Calculate score band
  let scoreBand: ScoreBand = 'red';
  const attended = metrics.installAppointmentsAttended;
  
  if (attended >= 12 * hoursFactor) {
    scoreBand = 'green';
  } else if (attended >= 8 * hoursFactor) {
    scoreBand = 'yellow';
  } else if (attended > 0) {
    scoreBand = 'orange';
  } else {
    scoreBand = 'red';
  }

  // Calculate trend
  let trend: Trend = 'flat';
  if (lastWeekMetrics) {
    const thisWeek = attended;
    const lastWeek = lastWeekMetrics.installAppointmentsAttended;
    if (thisWeek > lastWeek * 1.1) {
      trend = 'up';
    } else if (thisWeek < lastWeek * 0.9) {
      trend = 'down';
    } else {
      trend = 'flat';
    }
  }

  return {
    expectedAttendedMin,
    expectedAttendedMax,
    scoreBand,
    trend,
  };
}

// ============================================
// Activator Performance Metrics
// ============================================

export interface ActivatorPerformanceMetrics {
  hoursWorked: number;
  attendedAppointments: number;
  completedInstalls: number; // first_lead_received_at set
  completionRate: number; // completed / attended * 100
  avgTimeToLiveHours: number; // attended → first_lead
  pctLeadWithin72h: number;
  stalledInstalls: number; // 7+ days no first_lead
}

export interface ActivatorScoring {
  expectedInstallsMin: number;
  expectedInstallsMax: number;
  scoreBand: ScoreBand;
  trend: Trend;
}

/**
 * Calculate Activator performance metrics for a date range
 */
export async function calculateActivatorMetrics(
  supabase: SupabaseClient,
  activatorUserId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<ActivatorPerformanceMetrics> {
  const weekStartIso = weekStart.toISOString();
  const weekEndIso = weekEnd.toISOString();

  // Calculate hours using existing call session logic
  const dailyMetrics = await computeDailyMetrics(
    supabase,
    activatorUserId,
    weekStart,
    weekEnd
  );
  const hoursWorked = dailyMetrics.paidHours;

  // Get attended appointments (status = 'completed')
  const { data: attendedMeetings } = await supabase
    .from("activation_meetings")
    .select("id, completed_at, trial_pipeline_id")
    .eq("activator_user_id", activatorUserId)
    .eq("status", "completed")
    .gte("completed_at", weekStartIso)
    .lt("completed_at", weekEndIso);

  const attendedAppointments = attendedMeetings?.length || 0;

  // Get completed installs (first_lead_received_at set)
  // Join with trial_pipeline to check for first_lead_received_at
  const { data: completedInstallsData } = await supabase
    .from("trial_pipeline")
    .select("id, first_lead_received_at, crm_lead_id")
    .not("first_lead_received_at", "is", null)
    .gte("first_lead_received_at", weekStartIso)
    .lt("first_lead_received_at", weekEndIso);

  // Filter to only those with attended meetings by this activator
  const attendedMeetingIds = new Set(attendedMeetings?.map(m => m.trial_pipeline_id) || []);
  const completedInstalls = completedInstallsData?.filter(
    tp => attendedMeetingIds.has(tp.id)
  ).length || 0;

  // Calculate completion rate
  const completionRate = attendedAppointments > 0
    ? (completedInstalls / attendedAppointments) * 100
    : 0;

  // Calculate average time to live (attended → first_lead)
  let avgTimeToLiveHours = 0;
  if (attendedMeetings && completedInstallsData) {
    const timeToLiveValues: number[] = [];
    
    for (const meeting of attendedMeetings) {
      if (!meeting.completed_at || !meeting.trial_pipeline_id) continue;
      
      const trialPipeline = completedInstallsData.find(
        tp => tp.id === meeting.trial_pipeline_id
      );
      
      if (trialPipeline?.first_lead_received_at) {
        const completedAt = new Date(meeting.completed_at).getTime();
        const firstLeadAt = new Date(trialPipeline.first_lead_received_at).getTime();
        const hours = (firstLeadAt - completedAt) / (1000 * 60 * 60);
        if (hours > 0) {
          timeToLiveValues.push(hours);
        }
      }
    }
    
    if (timeToLiveValues.length > 0) {
      avgTimeToLiveHours = timeToLiveValues.reduce((a, b) => a + b, 0) / timeToLiveValues.length;
    }
  }

  // Calculate % with lead within 72 hours
  let pctLeadWithin72h = 0;
  if (attendedMeetings && completedInstallsData) {
    let within72h = 0;
    
    for (const meeting of attendedMeetings) {
      if (!meeting.completed_at || !meeting.trial_pipeline_id) continue;
      
      const trialPipeline = completedInstallsData.find(
        tp => tp.id === meeting.trial_pipeline_id
      );
      
      if (trialPipeline?.first_lead_received_at) {
        const completedAt = new Date(meeting.completed_at).getTime();
        const firstLeadAt = new Date(trialPipeline.first_lead_received_at).getTime();
        const hours = (firstLeadAt - completedAt) / (1000 * 60 * 60);
        if (hours <= 72) {
          within72h++;
        }
      }
    }
    
    pctLeadWithin72h = attendedAppointments > 0
      ? (within72h / attendedAppointments) * 100
      : 0;
  }

  // Calculate stalled installs (attended > 7 days ago, no first_lead)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const { data: stalledData } = await supabase
    .from("activation_meetings")
    .select("trial_pipeline_id")
    .eq("activator_user_id", activatorUserId)
    .eq("status", "completed")
    .lt("completed_at", sevenDaysAgo.toISOString())
    .not("trial_pipeline_id", "is", null);

  const stalledMeetingIds = new Set(stalledData?.map(m => m.trial_pipeline_id).filter(Boolean) || []);
  
  let stalledInstalls = 0;
  if (stalledMeetingIds.size > 0) {
    const { data: stalledTrials } = await supabase
      .from("trial_pipeline")
      .select("id")
      .in("id", Array.from(stalledMeetingIds))
      .is("first_lead_received_at", null);
    
    stalledInstalls = stalledTrials?.length || 0;
  }

  return {
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    attendedAppointments,
    completedInstalls,
    completionRate: Math.round(completionRate * 100) / 100,
    avgTimeToLiveHours: Math.round(avgTimeToLiveHours * 100) / 100,
    pctLeadWithin72h: Math.round(pctLeadWithin72h * 100) / 100,
    stalledInstalls,
  };
}

/**
 * Calculate Activator scoring bands and expected ranges
 * Baseline: 40 hrs/week → 3-8 completed installs
 */
export function calculateActivatorScoring(
  metrics: ActivatorPerformanceMetrics,
  lastWeekMetrics?: ActivatorPerformanceMetrics
): ActivatorScoring {
  const hoursFactor = metrics.hoursWorked / 40;
  
  // Expected range: 3-8 for 40 hours, scaled by hours factor
  const expectedInstallsMin = Math.max(0, Math.round(3 * hoursFactor * 100) / 100);
  const expectedInstallsMax = Math.round(8 * hoursFactor * 100) / 100;

  // Calculate score band
  let scoreBand: ScoreBand = 'red';
  const completed = metrics.completedInstalls;
  
  // Green: >= 6 * hoursFactor AND completion_rate > 80% AND low stalled
  if (completed >= 6 * hoursFactor && 
      metrics.completionRate > 80 && 
      metrics.stalledInstalls <= 1) {
    scoreBand = 'green';
  } 
  // Yellow: >= 3 * hoursFactor AND < 6 * hoursFactor
  else if (completed >= 3 * hoursFactor && completed < 6 * hoursFactor) {
    scoreBand = 'yellow';
  } 
  // Orange: < 3 * hoursFactor AND > 0
  else if (completed > 0) {
    scoreBand = 'orange';
  } 
  // Red: < 2 * hoursFactor (or 0)
  else {
    scoreBand = 'red';
  }

  // Calculate trend
  let trend: Trend = 'flat';
  if (lastWeekMetrics) {
    const thisWeek = completed;
    const lastWeek = lastWeekMetrics.completedInstalls;
    if (thisWeek > lastWeek * 1.1) {
      trend = 'up';
    } else if (thisWeek < lastWeek * 0.9) {
      trend = 'down';
    } else {
      trend = 'flat';
    }
  }

  return {
    expectedInstallsMin,
    expectedInstallsMax,
    scoreBand,
    trend,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get Monday of the week for a given date
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
 * Get Sunday of the week for a given date
 */
export function getWeekEnd(date: Date): Date {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
}

/**
 * Format score band for display
 */
export function formatScoreBand(band: ScoreBand): { label: string; color: string; emoji: string } {
  switch (band) {
    case 'green':
      return { label: 'Top Performer', color: 'text-green-600', emoji: '🟢' };
    case 'yellow':
      return { label: 'Meeting Expectations', color: 'text-yellow-600', emoji: '🟡' };
    case 'orange':
      return { label: 'Needs Coaching', color: 'text-orange-600', emoji: '🟠' };
    case 'red':
      return { label: 'At Risk', color: 'text-red-600', emoji: '🔴' };
  }
}

/**
 * Format trend for display
 */
export function formatTrend(trend: Trend): { label: string; icon: string; color: string } {
  switch (trend) {
    case 'up':
      return { label: 'Up', icon: '↑', color: 'text-green-600' };
    case 'down':
      return { label: 'Down', icon: '↓', color: 'text-red-600' };
    case 'flat':
      return { label: 'Flat', icon: '→', color: 'text-gray-600' };
  }
}

