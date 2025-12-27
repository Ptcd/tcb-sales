export type LeadStatus = 'new' | 'contacted' | 'interested' | 'trial_started' | 'follow_up' | 'closed_won' | 'closed_lost' | 'not_interested' | 'converted';

export type LostReason = 'price' | 'timing' | 'ghosted' | 'not_a_fit' | 'went_with_competitor' | 'other';

export const LOST_REASON_OPTIONS: { value: LostReason; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing' },
  { value: 'ghosted', label: 'Ghosted' },
  { value: 'not_a_fit', label: 'Not a Fit' },
  { value: 'went_with_competitor', label: 'Went with Competitor' },
  { value: 'other', label: 'Other' },
];

export type ClientStatus = 
  | 'none' 
  | 'trialing' 
  | 'trial_activated'     // User logged in or changed settings
  | 'snippet_installed'   // User installed calculator on their website
  | 'trial_qualified' 
  | 'credits_low' 
  | 'trial_expiring' 
  | 'paid';

// Badge key type (single source of truth for lead status)
export type BadgeKey = 
  | 'new' 
  | 'recycle_cold' 
  | 'follow_up_scheduled' 
  | 'recycle_not_interested'
  | 'trial_awaiting_activation' 
  | 'trial_activated' 
  | 'trial_configured'
  | 'trial_embed_copied' 
  | 'trial_live_first_lead' 
  | 'trial_stalled'
  | 'converted_recent' 
  | 'dnc' 
  | 'invalid_contact';

export interface BusinessResult {
  id: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  placeId: string;
  latitude?: number;
  longitude?: number;
  leadStatus?: LeadStatus;
  assignedTo?: string;
  lastContactedAt?: string;
  updatedAt?: string;
  notesCount?: number;
  activitiesCount?: number;
  nextActionAt?: string;
  nextActionNote?: string;
  leadTimezone?: string | null;
  timezoneSource?: 'coords' | 'phone' | 'manual' | null;
  contactName?: string; // Contact person's name (e.g., "Jim Smith")
  // Deduplication/ownership fields
  isExistingLead?: boolean;
  existingLeadId?: string;
  existingOwnerId?: string;
  existingOwnerName?: string;
  leadSource?: 'google_maps' | 'manual' | 'import' | 'inbound_call' | 'jcc_signup';
  // Campaign claim tracking
  isClaimedInCampaign?: boolean;
  isClaimedByOther?: boolean;
  // Client status fields (from Control Tower)
  clientStatus?: ClientStatus;
  clientCreditsLeft?: number;
  clientPlan?: string;
  clientTrialEndsAt?: string;
  // Client funnel tracking (from JCC events)
  clientActivatedAt?: string;
  clientSnippetInstalledAt?: string;
  clientSnippetDomain?: string;
  clientMrr?: number;
  clientPaidAt?: string;
  // SDR attribution tracking (from JCC signup)
  jccSdrFirstTouchCode?: string;
  jccSdrLastTouchCode?: string;
  // Badge system fields
  badgeKey?: BadgeKey;
  doNotContact?: boolean;
  ownerSdrId?: string;
  nextFollowUpAt?: string;
  // Lost reason fields (for closed_lost status)
  lostReason?: LostReason;
  lostReasonNotes?: string;
  // Trial pipeline data (from My Trials view)
  trialPipeline?: {
    trialStartedAt?: string;
    trialEndsAt?: string;
    convertedAt?: string;
    plan?: string;
    mrr?: number;
    bonusState?: 'none' | 'pending' | 'paid';
    lastEventAt?: string;
  } | null;
}

export interface LeadNotification {
  id: string;
  leadId: string;
  sdrUserId: string;
  eventType: string;
  payload: Record<string, any>;
  createdAt: string;
  read: boolean;
  leadName?: string;
  leadPhone?: string;
  leadEmail?: string;
  leadAddress?: string;
}

export interface SearchParams {
  keyword: string;
  location: string;
  resultCount: number;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  keyword: string;
  location: string;
  result_count: number;
  results_found: number;
  created_at: string;
}

export interface LeadNote {
  id: string;
  leadId: string;
  userId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type ActivityType = 'status_change' | 'note_added' | 'assigned' | 'contacted' | 'email_sent' | 'sms_sent' | 'call_made';

export interface LeadActivity {
  id: string;
  leadId: string;
  userId: string;
  activityType: ActivityType;
  activityData?: Record<string, any>;
  description?: string;
  createdAt: string;
}

export type SMSStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'queued';

export interface SMSTemplate {
  id: string;
  userId: string;
  organizationId?: string;
  campaignId?: string;
  campaignName?: string;
  name: string;
  message: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SMSMessage {
  id: string;
  leadId: string;
  userId: string;
  templateId?: string;
  phoneNumber: string;
  message: string;
  status: SMSStatus;
  twilioSid?: string;
  errorMessage?: string;
  sentAt: string;
  deliveredAt?: string;
  createdAt: string;
  // From view
  leadName?: string;
  leadAddress?: string;
  leadStatus?: LeadStatus;
  templateName?: string;
}

export type CallStatus = 'initiated' | 'ringing' | 'answered' | 'completed' | 'busy' | 'no_answer' | 'failed' | 'cancelled';
export type CallType = 'inbound' | 'outbound';
export type CallOutcome = 'interested' | 'not_interested' | 'callback_requested' | 'no_answer' | 'busy' | 'wrong_number' | 'do_not_call';

// Enhanced outcome codes for detailed reporting
export type CallOutcomeCode = 
  | 'NO_ANSWER' 
  | 'BUSY' 
  | 'WRONG_NUMBER' 
  | 'NOT_INTERESTED' 
  | 'INTERESTED_INFO_SENT' 
  | 'TRIAL_STARTED' 
  | 'CALLBACK_SCHEDULED'
  | 'ONBOARDING_SCHEDULED'
  | 'SCHEDULE_REFUSED'
  | 'DM_UNAVAILABLE';

// CTA (Call-to-Action) result tracking
export type CTAResult = 
  | 'NOT_OFFERED' 
  | 'ACCEPTED' 
  | 'DECLINED' 
  | 'OTHER_TOOL' 
  | 'NEEDS_MANAGER';

// Map user-facing outcome labels to internal codes
export const OUTCOME_LABEL_TO_CODE: Record<string, CallOutcomeCode> = {
  'No Answer / Voicemail': 'NO_ANSWER',
  'Busy / Call Dropped': 'BUSY',
  'Wrong Number': 'WRONG_NUMBER',
  'Not Interested': 'NOT_INTERESTED',
  'Interested – Info Sent': 'INTERESTED_INFO_SENT',
  'Interested – Trial Started on Call': 'TRIAL_STARTED',
  'Callback Scheduled': 'CALLBACK_SCHEDULED',
  'Onboarding Scheduled': 'ONBOARDING_SCHEDULED',
  'Schedule Refused': 'SCHEDULE_REFUSED',
  'Decision Maker Unavailable': 'DM_UNAVAILABLE',
};

// User-facing outcome options for the dropdown
export const OUTCOME_OPTIONS = [
  { value: 'NO_ANSWER', label: 'No Answer / Voicemail' },
  { value: 'BUSY', label: 'Busy / Call Dropped' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'INTERESTED_INFO_SENT', label: 'Interested – Info Sent' },
  { value: 'TRIAL_STARTED', label: 'Interested – Trial Started on Call' },
  { value: 'CALLBACK_SCHEDULED', label: 'Callback Scheduled' },
  { value: 'ONBOARDING_SCHEDULED', label: 'Onboarding Scheduled' },
  { value: 'SCHEDULE_REFUSED', label: 'Schedule Refused' },
  { value: 'DM_UNAVAILABLE', label: 'Decision Maker Unavailable' },
];

// CTA result options
export const CTA_RESULT_OPTIONS = [
  { value: 'ACCEPTED', label: 'Accepted – Link Sent' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'OTHER_TOOL', label: 'Already Using Another Solution' },
  { value: 'NEEDS_MANAGER', label: 'Needs Manager Approval' },
];

// Campaign goals interface
export interface CampaignGoals {
  id: string;
  campaignId: string;
  targetDialsPerHour: number;
  targetConversationsPerHour: number;
  targetCtaAttemptsPerHour: number;
  targetCtaAcceptancesPerHour: number;
  targetTrialsPerHour: number;
  weeklyDialsGoal: number;
  weeklyTrialsGoal: number;
  minConversationRatePct: number;
  minTrialsPerConversationPct: number;
  targetAvgCallDurationSeconds: number;
  effectiveStartDate: string;
  createdAt: string;
  updatedAt: string;
}

// Default campaign goals
export const DEFAULT_CAMPAIGN_GOALS: Omit<CampaignGoals, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'> = {
  targetDialsPerHour: 50,
  targetConversationsPerHour: 5,
  targetCtaAttemptsPerHour: 3,
  targetCtaAcceptancesPerHour: 1.5,
  targetTrialsPerHour: 0.5,
  weeklyDialsGoal: 500,
  weeklyTrialsGoal: 10,
  minConversationRatePct: 10,
  minTrialsPerConversationPct: 10,
  targetAvgCallDurationSeconds: 120,
  effectiveStartDate: new Date().toISOString().split('T')[0],
};

export interface Call {
  id: string;
  leadId: string;
  userId: string;
  phoneNumber: string;
  callType: CallType;
  status: CallStatus;
  duration?: number;
  direction?: string; // 'inbound' | 'outbound'
  voicemailLeft?: boolean;
  isNew?: boolean; // Whether call/voicemail is unread
  twilioCallSid?: string;
  twilioRecordingSid?: string;
  recordingUrl?: string;
  notes?: string;
  outcome?: CallOutcome;
  outcomeCode?: CallOutcomeCode; // Enhanced outcome for reporting
  callbackDate?: string;
  // CTA tracking
  ctaAttempted?: boolean;
  ctaResult?: CTAResult;
  ctaSentViaSms?: boolean;
  ctaSentViaEmail?: boolean;
  // Timestamps
  initiatedAt: string;
  answeredAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  // From view
  leadName?: string;
  leadAddress?: string;
  leadStatus?: LeadStatus;
  callCount?: number;
  lastCallMadeAt?: string;
  campaignId?: string;
}

export interface CallStats {
  totalCalls: number;
  answeredCalls: number;
  totalDuration: number;
  avgDuration: number;
  callsToday: number;
  callbackRequests: number;
}

export type EmailStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

export interface EmailTemplate {
  id: string;
  userId: string;
  organizationId?: string;
  campaignId?: string;
  campaignName?: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  isDefault: boolean;
  isQuick?: boolean;
  quickLabel?: string;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export type EmailDirection = 'inbound' | 'outbound';

export interface EmailMessage {
  id: string;
  leadId?: string;
  userId: string;
  organizationId?: string;
  templateId?: string;
  campaignId?: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  status: EmailStatus;
  direction: EmailDirection;
  isRead: boolean;
  threadId?: string;
  inReplyTo?: string;
  messageId?: string;
  scheduledFor?: string;
  isScheduled?: boolean;
  providerMessageId?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  // From view
  leadName?: string;
  leadAddress?: string;
  leadStatus?: LeadStatus;
  templateName?: string;
  campaignName?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  emailMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  url?: string;
  createdAt: string;
}

export interface OrganizationEmailSettings {
  id: string;
  organizationId: string;
  defaultFromName?: string;
  defaultFromEmail?: string;
  defaultReplyTo?: string;
  emailSignature?: string;
  inboundSubdomain?: string;
  createdAt: string;
  updatedAt: string;
}

// Team Management Types
export type UserRole = 'admin' | 'member';
export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  organizationId: string;
  role: UserRole;
  fullName?: string;
  email?: string; // From auth.users
  createdAt: string;
  updatedAt: string;
}

export interface TeamInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  invitedByName?: string;
  token: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
}

// Trial Provisioning Types (JCC Integration)
export interface TrialProvisionRequest {
  leadId: string;
  businessName: string;
  contactName?: string;
  email: string;
  phone?: string;
  website?: string;
  source?: 'cold_call' | 'inbound_call' | 'manual';
}

export interface TrialProvisionResponse {
  success: boolean;
  userId?: string;
  email?: string;
  credits?: number;
  loginUrl?: string;
  alreadyExists?: boolean;
  error?: string;
}

// Trial Pipeline interface (snapshot of trial lifecycle)
export interface TrialPipeline {
  id: string;
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
  createdAt?: string;
  updatedAt?: string;
}

// ============================================
// DIALER MODE TYPES
// ============================================

// The mode the dialer is operating in
export type DialerModeType = 'PROSPECTING' | 'FOLLOWUPS' | 'ACTIVATION';

// Script categories for organizing scripts
export type ScriptCategory = 'PROSPECT' | 'FOLLOWUP' | 'RESCUE' | 'CONVERT';

// Standard script keys - use these exact strings when creating scripts
export type StandardScriptKey = 
  // Prospecting
  | 'PROSPECT_OPENER_GATEKEEPER'
  | 'PROSPECT_OPENER_DECISIONMAKER'
  | 'PROSPECT_PITCH_CORE'
  | 'PROSPECT_OBJECTION_BUSY'
  | 'PROSPECT_OBJECTION_ALREADY_HAVE_SOLUTION'
  | 'PROSPECT_CLOSE_TRIAL'
  // Follow-ups
  | 'TRIAL_FOLLOWUP_1'
  | 'TRIAL_FOLLOWUP_2'
  | 'TRIAL_FOLLOWUP_3'
  // Rescues
  | 'RESCUE_PASSWORD_NOT_SET'
  | 'RESCUE_NOT_ACTIVATED'
  // Conversion
  | 'CONVERT_TO_PAID_NUDGE'
  | 'CANCEL_SAVE_OFFER';

// Rescue queue statistics returned from API
export interface RescueQueueStats {
  rescueA: number;  // Password not set count
  rescueB: number;  // Not activated count
  total: number;    // Combined total
}

// Extended call script interface with new fields
export interface CallScriptExtended {
  id: string;
  campaignId: string;
  campaignName?: string;
  organizationId: string;
  name: string;
  content: string;
  displayOrder: number;
  isActive: boolean;
  badgeKey?: string;
  scriptKey?: string;      // NEW: Machine-readable key
  category?: ScriptCategory; // NEW: Script category
  priority?: number;       // NEW: Priority within category
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// JCC ACTIVATION INTEGRATION TYPES
// ============================================

// JCC activation status values
export type JCCActivationStatus = 
  | 'queued' 
  | 'in_progress' 
  | 'activated' 
  | 'killed';

// JCC next action types
export type JCCNextActionType = 
  | 'call_customer' 
  | 'waiting_customer' 
  | 'waiting_dev' 
  | 'needs_website' 
  | 'ready_to_kill';

// JCC contact attempt result
export type JCCContactResult = 
  | 'no_answer' 
  | 'left_vm' 
  | 'connected' 
  | 'scheduled' 
  | 'wrong_number';

// JCC blocker types
export type JCCBlocker = 
  | 'ghosting' 
  | 'no_website' 
  | 'needs_dev' 
  | 'fear_of_install' 
  | 'do_it_later';

// Checklist item from JCC
export interface JCCChecklistItem {
  key: 'login' | 'settings' | 'install' | 'test_lead';
  completed: boolean;
  completed_at: string | null;
}

// Single activation record from JCC queue
export interface JCCActivationRecord {
  client_id: string;
  business_name: string;
  contact_name: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  
  // Activation state
  activation_status: JCCActivationStatus;
  activation_owner: string | null;
  
  // Progress
  checklist: JCCChecklistItem[];
  blockers: JCCBlocker[];
  
  // Contact history
  rescue_attempts: number;
  last_contact_at: string | null;
  last_contact_result: JCCContactResult | null;
  
  // Next action
  next_action_type: JCCNextActionType;
  next_action_due_at: string;
  
  // Trial info
  trial_started_at: string;
  trial_age_days: number;
  
  // Deep link to JCC
  deep_link: string;
}

// Response from GET /api/activation/queue
export interface JCCActivationQueueResponse {
  success: boolean;
  queue: JCCActivationRecord[];
  total: number;
}

// Request body for POST /api/activation/claim
export interface JCCClaimRequest {
  client_id: string;
}

// Response from POST /api/activation/claim
export interface JCCClaimResponse {
  success: boolean;
  claimed: boolean;
  claimed_by?: string; // If already claimed by someone else
  error?: string;
}

// Request body for POST /api/activation/contact-attempt
export interface JCCContactAttemptRequest {
  client_id: string;
  channel: 'call' | 'sms' | 'email';
  direction: 'outbound' | 'inbound';
  crm_call_id: string;
  result: JCCContactResult;
  notes: string;
  occurred_at: string; // ISO timestamp
  set_next_action?: {
    type: JCCNextActionType;
    due_at: string; // ISO timestamp
  };
}

// Response from POST /api/activation/contact-attempt
export interface JCCContactAttemptResponse {
  success: boolean;
  rescue_attempts: number; // New count after increment
  error?: string;
}

// Request body for POST /api/activation/next-action
export interface JCCNextActionRequest {
  client_id: string;
  next_action_type: JCCNextActionType;
  next_action_due_at: string; // ISO timestamp
  blockers?: JCCBlocker[];
}

// Response from POST /api/activation/next-action
export interface JCCNextActionResponse {
  success: boolean;
  error?: string;
}

// CRM Activation Status (matches database enum)
export type ActivationStatus = 'queued' | 'in_progress' | 'scheduled' | 'attended' | 'no_show' | 'activated' | 'killed';

// CRM Kill Reasons
export type ActivationKillReason = 'no_access' | 'no_response' | 'no_technical_owner' | 'no_urgency' | 'other';

export const ACTIVATION_STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'attended', label: 'Attended' },
  { value: 'no_show', label: 'No-Show' },
  { value: 'activated', label: 'Activated' },
  { value: 'killed', label: 'Killed' },
];

export const KILL_REASON_OPTIONS = [
  { value: 'no_access', label: 'No access to website' },
  { value: 'no_response', label: 'No response after multiple attempts' },
  { value: 'no_technical_owner', label: 'No technical owner available' },
  { value: 'no_urgency', label: 'No urgency / wants to do it later' },
  { value: 'other', label: 'Other' },
];

// ============================================
// ACTIVATION CALENDAR TYPES
// ============================================

export type ActivationMeetingStatus = 'scheduled' | 'completed' | 'no_show' | 'rescheduled' | 'canceled';
export type AttendeeRole = 'owner' | 'web_guy' | 'office_manager' | 'other';
export type WebsitePlatform = 'wordpress' | 'wix' | 'squarespace' | 'shopify' | 'none' | 'unknown' | 'other';

export interface ActivationMeeting {
  id: string;
  trialPipelineId: string | null;
  leadId: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  scheduledTimezone: string;
  activatorUserId: string;
  activatorName?: string | null; // Full name of the activator assigned to this meeting
  scheduledBySdrUserId: string;
  scheduledBySdrName?: string;
  organizationId: string;
  status: ActivationMeetingStatus;
  attendeeName: string;
  attendeeRole: AttendeeRole;
  phone: string;
  email: string | null;
  websitePlatform: WebsitePlatform;
  websiteUrl?: string | null;
  goal: string;
  objections: string | null;
  notes: string | null;
  confirmationSentAt: string | null;
  reminder24hSentAt: string | null;
  rescheduledFromId: string | null;
  sdrConfirmedUnderstandsInstall?: boolean;
  sdrConfirmedAgreedInstall?: boolean;
  sdrConfirmedWillAttend?: boolean;
  accessMethod?: 'credentials' | 'web_person' | 'both' | null;
  webPersonEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableSlot {
  start: string; // ISO timestamp
  end: string;   // ISO timestamp
  activatorId: string;
  activatorName: string;
  meetingLink?: string;
  viewerDate?: string; // Date string (YYYY-MM-DD) in viewer's timezone
}

export interface ActivatorAvailabilitySettings {
  userId: string;
  timezone: string;
  meetingDurationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxMeetingsPerDay: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  meetingLink?: string;
  isAcceptingMeetings: boolean;
  workingHours: {
    dayOfWeek: number; // 0=Sunday, 6=Saturday
    startTime: string; // "09:00"
    endTime: string;   // "17:00"
    isActive: boolean;
  }[];
}

export const ATTENDEE_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner / Decision Maker' },
  { value: 'web_guy', label: 'Web Developer / IT' },
  { value: 'office_manager', label: 'Office Manager' },
  { value: 'other', label: 'Other' },
];

export const WEBSITE_PLATFORM_OPTIONS = [
  { value: 'wordpress', label: 'WordPress' },
  { value: 'wix', label: 'Wix' },
  { value: 'squarespace', label: 'Squarespace' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'none', label: 'No Website' },
  { value: 'unknown', label: "Don't Know" },
  { value: 'other', label: 'Other' },
];
