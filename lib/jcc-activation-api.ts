/**
 * JCC Activation API Client
 * 
 * Server-side only. Uses JCC_ACTIVATION_SERVICE_TOKEN for auth.
 * All methods throw on error.
 */

import {
  JCCActivationQueueResponse,
  JCCClaimRequest,
  JCCClaimResponse,
  JCCContactAttemptRequest,
  JCCContactAttemptResponse,
  JCCNextActionRequest,
  JCCNextActionResponse,
  JCCContactResult,
  JCCNextActionType,
} from './types';

const JCC_API_URL = process.env.JCC_API_URL || 'https://app.autosalvageautomation.com';
// Reuse the same API key used for trial provisioning - no need for separate tokens
const JCC_SERVICE_TOKEN = process.env.JCC_PROVISION_API_KEY;

/**
 * Make authenticated request to JCC API
 * Uses x-api-key header for server-to-server auth
 */
async function jccFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!JCC_SERVICE_TOKEN) {
    throw new Error('JCC_PROVISION_API_KEY not configured');
  }

  const url = `${JCC_API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': JCC_SERVICE_TOKEN,
      ...options.headers,
    },
  });

  // Try to parse JSON response
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`JCC API error: ${response.status} (invalid JSON)`);
  }

  if (!response.ok) {
    throw new Error(data.error || `JCC API error: ${response.status}`);
  }

  return data as T;
}

/**
 * Fetch activation queue from JCC
 * GET /api/activation/queue?due=1&limit=200
 */
export async function fetchActivationQueue(
  limit: number = 200
): Promise<JCCActivationQueueResponse> {
  return jccFetch<JCCActivationQueueResponse>(
    `/api/activation/queue?due=1&limit=${limit}`
  );
}

/**
 * Claim an activation account
 * POST /api/activation/claim
 */
export async function claimActivation(
  clientId: string
): Promise<JCCClaimResponse> {
  const body: JCCClaimRequest = { client_id: clientId };
  
  return jccFetch<JCCClaimResponse>('/api/activation/claim', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Log a contact attempt (MUST be called after every outbound call)
 * POST /api/activation/contact-attempt
 */
export async function logContactAttempt(
  payload: JCCContactAttemptRequest
): Promise<JCCContactAttemptResponse> {
  return jccFetch<JCCContactAttemptResponse>('/api/activation/contact-attempt', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Update next action (for scheduling follow-ups without a call)
 * POST /api/activation/next-action
 */
export async function updateNextAction(
  payload: JCCNextActionRequest
): Promise<JCCNextActionResponse> {
  return jccFetch<JCCNextActionResponse>('/api/activation/next-action', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Map CRM outcome code to JCC contact result
 */
export function mapCRMOutcomeToJCC(crmOutcome: string): JCCContactResult {
  const mapping: Record<string, JCCContactResult> = {
    'NO_ANSWER': 'no_answer',
    'BUSY': 'no_answer',
    'LEFT_VM': 'left_vm',
    'VOICEMAIL': 'left_vm',
    'CALLBACK_SCHEDULED': 'scheduled',
    'INTERESTED_INFO_SENT': 'connected',
    'TRIAL_STARTED': 'connected',
    'NOT_INTERESTED': 'connected',
    'WRONG_NUMBER': 'wrong_number',
  };
  return mapping[crmOutcome] || 'no_answer';
}

/**
 * Map CRM outcome to JCC next action type
 */
export function mapCRMOutcomeToNextAction(crmOutcome: string): JCCNextActionType {
  const mapping: Record<string, JCCNextActionType> = {
    'NO_ANSWER': 'call_customer',
    'BUSY': 'call_customer',
    'LEFT_VM': 'call_customer',
    'VOICEMAIL': 'call_customer',
    'CALLBACK_SCHEDULED': 'call_customer',
    'INTERESTED_INFO_SENT': 'waiting_customer',
    'TRIAL_STARTED': 'waiting_customer',
    'NOT_INTERESTED': 'ready_to_kill',
    'WRONG_NUMBER': 'ready_to_kill',
  };
  return mapping[crmOutcome] || 'call_customer';
}

// ============================================
// CRM → JCC WORKFLOW SYNC
// ============================================

/**
 * Workflow update payload for syncing CRM state to JCC
 */
export interface JCCWorkflowUpdatePayload {
  user_id: string;
  activation_status?: 'not_started' | 'in_progress' | 'scheduled' | 'activated' | 'killed';
  assigned_activator_id?: string | null;
  crm_next_action?: string | null;
  last_contact_at?: string | null;
  scheduled_install_at?: string | null;
  scheduled_timezone?: string | null;
  scheduled_with_name?: string | null;
  scheduled_with_role?: string | null;
  notes?: string | null;
  scheduled_by_user_id?: string | null;
  technical_owner_name?: string | null;
  calendar_invite_sent?: boolean;
  killed_at?: string | null;
  kill_reason?: string | null;
  kill_note?: string | null;
  rescue_attempts?: number;
}

/**
 * Response from workflow update
 */
export interface JCCWorkflowUpdateResponse {
  success: boolean;
  user_id?: string;
  activation_status?: string;
  error?: string;
}

/**
 * Activation signals response (milestones for gating)
 */
export interface JCCActivationSignalsResponse {
  user_id: string;
  milestones: {
    password_set: boolean;
    login_count: number;
    calculator_configured: boolean;
    snippet_copied: boolean;
    test_lead_received: boolean;
    first_lead_at: string | null;
  };
  can_activate: boolean;
}

/**
 * Sync workflow state from CRM to JCC
 * POST /api/control-tower/activation/workflow-update
 */
export async function syncWorkflowToJCC(
  payload: JCCWorkflowUpdatePayload
): Promise<JCCWorkflowUpdateResponse> {
  try {
    return await jccFetch<JCCWorkflowUpdateResponse>(
      '/api/control-tower/activation/workflow-update',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  } catch (error: any) {
    console.error('Failed to sync workflow to JCC:', error.message);
    // Return error response instead of throwing - sync failures shouldn't break CRM
    return { success: false, error: error.message };
  }
}

/**
 * Get activation signals for a specific user (for gating)
 * GET /api/control-tower/activation/signals/{user_id}
 */
export async function getActivationSignals(
  userId: string
): Promise<JCCActivationSignalsResponse | null> {
  try {
    return await jccFetch<JCCActivationSignalsResponse>(
      `/api/control-tower/activation/signals/${userId}`
    );
  } catch (error: any) {
    console.error('Failed to get activation signals from JCC:', error.message);
    return null;
  }
}

/**
 * Map CRM activation status to JCC activation status
 */
export function mapCRMStatusToJCC(crmStatus: string): JCCWorkflowUpdatePayload['activation_status'] {
  const mapping: Record<string, JCCWorkflowUpdatePayload['activation_status']> = {
    'queued': 'not_started',
    'in_progress': 'in_progress',
    'scheduled': 'scheduled',
    'activated': 'activated',
    'killed': 'killed',
  };
  return mapping[crmStatus] || 'not_started';
}

/**
 * Map CRM kill reason to JCC kill reason
 */
export function mapCRMKillReasonToJCC(crmReason: string): string {
  const mapping: Record<string, string> = {
    'no_access': 'no_website',
    'no_response': 'ghosting',
    'no_technical_owner': 'no_technical_owner',
    'no_urgency': 'no_urgency',
    'other': 'other',
  };
  return mapping[crmReason] || 'other';
}

