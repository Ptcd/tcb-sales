// Badge System - Single source of truth for lead status badges
// Maps dispositions, JCC events, and trial states to badge keys

// ============================================
// BADGE KEY TYPES
// ============================================
export type BadgeKey = 
  | 'new' 
  | 'recycle_cold' 
  | 'follow_up_scheduled' 
  | 'recycle_not_interested'
  // JCC-SPECIFIC BADGES (trial pipeline tracking)
  | 'trial_awaiting_activation'   // JCC: Trial started, waiting for activation
  | 'trial_activated'              // JCC: User logged in
  | 'trial_configured'             // JCC: Calculator settings modified
  | 'trial_embed_copied'           // JCC: Embed snippet copied
  | 'trial_live_first_lead'        // JCC: First real lead received
  | 'trial_stalled'                // JCC: Trial stalled (no progress)
  // END JCC-SPECIFIC BADGES
  | 'converted_recent' 
  | 'dnc' 
  | 'invalid_contact';

// JCC-specific badge keys (for easy identification in forks)
export const JCC_BADGE_KEYS: BadgeKey[] = [
  'trial_awaiting_activation',
  'trial_activated',
  'trial_configured',
  'trial_embed_copied',
  'trial_live_first_lead',
  'trial_stalled',
];

// ============================================
// DISPOSITION → BADGE MAPPING
// ============================================
export const DISPOSITION_TO_BADGE: Record<string, BadgeKey> = {
  'NO_ANSWER': 'recycle_cold',
  'BUSY': 'recycle_cold',
  'CALLBACK_SCHEDULED': 'follow_up_scheduled',
  'INTERESTED_INFO_SENT': 'follow_up_scheduled',
  'NOT_INTERESTED': 'recycle_not_interested', // soft no (default)
  'TRIAL_STARTED': 'trial_awaiting_activation',
  'WRONG_NUMBER': 'invalid_contact',
};

// ============================================
// DISPOSITION → FOLLOW-UP CADENCE
// ============================================
// null = manual required (Callback)
// number = auto-set days from today
export const DISPOSITION_TO_FOLLOWUP_DAYS: Record<string, number | null> = {
  'NO_ANSWER': 30,
  'BUSY': 30,
  'CALLBACK_SCHEDULED': null, // MUST be set manually
  'INTERESTED_INFO_SENT': 7, // default if not set manually
  'NOT_INTERESTED': 90, // soft no recycle
  'TRIAL_STARTED': 3,
  'WRONG_NUMBER': null, // no follow-up
};

// ============================================
// JCC EVENT → BADGE MAPPING (JCC-SPECIFIC)
// ============================================
// These mappings are only used when JCC features are enabled.
// All badge keys in this mapping are JCC-specific (see JCC_BADGE_KEYS above).
export const JCC_EVENT_TO_BADGE: Record<string, BadgeKey> = {
  'trial_started': 'trial_awaiting_activation',
  'password_set': 'trial_activated',
  'first_login': 'trial_activated',
  'calculator_modified': 'trial_configured',
  'embed_snippet_copied': 'trial_embed_copied',
  'first_lead_received': 'trial_live_first_lead',
  'paid_subscribed': 'converted_recent',
};

// ============================================
// BADGE DISPLAY CONFIG
// ============================================
export const BADGE_CONFIG: Record<BadgeKey, { label: string; color: string; bg: string }> = {
  'new': { 
    label: 'New Lead', 
    color: 'text-green-400', 
    bg: 'bg-green-500/20' 
  },
  'recycle_cold': { 
    label: 'Recycle', 
    color: 'text-slate-400', 
    bg: 'bg-slate-500/20' 
  },
  'follow_up_scheduled': { 
    label: 'Follow-Up', 
    color: 'text-blue-400', 
    bg: 'bg-blue-500/20' 
  },
  'recycle_not_interested': { 
    label: 'Not Interested', 
    color: 'text-red-400', 
    bg: 'bg-red-500/20' 
  },
  'trial_awaiting_activation': { 
    label: 'Trial Sent', 
    color: 'text-purple-400', 
    bg: 'bg-purple-500/20' 
  },
  'trial_activated': { 
    label: 'Activated', 
    color: 'text-indigo-400', 
    bg: 'bg-indigo-500/20' 
  },
  'trial_configured': { 
    label: 'Configured', 
    color: 'text-cyan-400', 
    bg: 'bg-cyan-500/20' 
  },
  'trial_embed_copied': { 
    label: 'Embed Copied', 
    color: 'text-teal-400', 
    bg: 'bg-teal-500/20' 
  },
  'trial_live_first_lead': { 
    label: 'Live!', 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-500/20' 
  },
  'trial_stalled': { 
    label: 'Stalled', 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/20' 
  },
  'converted_recent': { 
    label: 'Converted', 
    color: 'text-green-400', 
    bg: 'bg-green-500/20' 
  },
  'dnc': { 
    label: 'Do Not Contact', 
    color: 'text-gray-500', 
    bg: 'bg-gray-500/20' 
  },
  'invalid_contact': { 
    label: 'Invalid', 
    color: 'text-gray-500', 
    bg: 'bg-gray-500/20' 
  },
};

// ============================================
// TRIAL PIPELINE INTERFACE
// ============================================
export interface TrialPipeline {
  id?: string;
  crmLeadId: string;
  ownerSdrId?: string;
  jccUserId?: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  passwordSetAt?: string;
  firstLoginAt?: string;
  calculatorModifiedAt?: string;
  embedSnippetCopiedAt?: string;
  firstLeadReceivedAt?: string;
  convertedAt?: string;
  installUrl?: string;
  plan?: string;
  mrr?: number;
  lastEventAt?: string;
  bonusState: 'none' | 'pending' | 'paid';
}

// ============================================
// STALL DETECTION (computed on read)
// ============================================
export function computeStallReason(tp: TrialPipeline): string | null {
  if (!tp.trialStartedAt) return null;
  
  const now = Date.now();
  const hours = (ts: string | undefined): number => {
    if (!ts) return Infinity;
    return (now - new Date(ts).getTime()) / 3600000;
  };
  
  // 48h no password → no activation
  if (tp.trialStartedAt && !tp.passwordSetAt && hours(tp.trialStartedAt) > 48) {
    return 'no_activation_48h';
  }
  
  // 5 days (120h) no config → not configured
  if (tp.passwordSetAt && !tp.calculatorModifiedAt && hours(tp.passwordSetAt) > 120) {
    return 'no_config_5d';
  }
  
  // 7 days (168h) no lead → not live
  if (tp.embedSnippetCopiedAt && !tp.firstLeadReceivedAt && hours(tp.embedSnippetCopiedAt) > 168) {
    return 'no_lead_7d';
  }
  
  return null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get badge key from disposition code
 */
export function getBadgeFromDisposition(dispositionCode: string): BadgeKey {
  return DISPOSITION_TO_BADGE[dispositionCode] || 'new';
}

/**
 * Get follow-up days for disposition (null = manual required)
 */
export function getFollowUpDays(dispositionCode: string): number | null {
  return DISPOSITION_TO_FOLLOWUP_DAYS[dispositionCode] ?? null;
}

/**
 * Get badge key from JCC event type
 */
export function getBadgeFromJccEvent(eventType: string): BadgeKey | null {
  return JCC_EVENT_TO_BADGE[eventType] || null;
}

/**
 * Calculate follow-up date (days from now, set to 9 AM)
 */
export function calculateFollowUpDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Format date for datetime-local input
 */
export function formatDateTimeLocal(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

