import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { 
  logContactAttempt, 
  mapCRMOutcomeToJCC,
  mapCRMOutcomeToNextAction 
} from '@/lib/jcc-activation-api';
import { JCCContactAttemptRequest, JCCNextActionType } from '@/lib/types';
import { JCC_FEATURES_ENABLED } from '@/lib/config';

/**
 * POST /api/jcc/contact-attempt
 * 
 * Logs a contact attempt to JCC after a call ends.
 * MUST be called after every outbound activation call.
 * 
 * Body: {
 *   client_id: string,
 *   crm_call_id: string,
 *   crm_outcome: string,        // CRM outcome code (NO_ANSWER, BUSY, etc.)
 *   notes: string,
 *   follow_up_at?: string,      // ISO timestamp if follow-up scheduled
 *   next_action_type?: string,  // Override auto-mapped next action
 * }
 */
export async function POST(request: NextRequest) {
  // JCC feature flag guard
  if (!JCC_FEATURES_ENABLED) {
    return NextResponse.json({ error: "JCC features are disabled" }, { status: 404 });
  }

  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await request.json();
    const { 
      client_id, 
      crm_call_id, 
      crm_outcome, 
      notes,
      follow_up_at,
      next_action_type: overrideNextAction,
    } = body;

    // Validate required fields
    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }
    if (!crm_call_id) {
      return NextResponse.json({ error: 'crm_call_id is required' }, { status: 400 });
    }
    if (!crm_outcome) {
      return NextResponse.json({ error: 'crm_outcome is required' }, { status: 400 });
    }

    // Map CRM outcome to JCC result
    const jccResult = mapCRMOutcomeToJCC(crm_outcome);
    
    // Determine next action type
    const nextActionType: JCCNextActionType = (overrideNextAction as JCCNextActionType) || mapCRMOutcomeToNextAction(crm_outcome);
    
    // Calculate default follow-up if not provided
    let followUpDate = follow_up_at;
    if (!followUpDate) {
      const now = new Date();
      if (crm_outcome === 'NO_ANSWER' || crm_outcome === 'LEFT_VM') {
        // Next day at 10am
        now.setDate(now.getDate() + 1);
        now.setHours(10, 0, 0, 0);
        followUpDate = now.toISOString();
      } else if (crm_outcome === 'BUSY') {
        // 2 hours from now
        now.setHours(now.getHours() + 2);
        followUpDate = now.toISOString();
      }
    }

    // Build JCC request
    const jccPayload: JCCContactAttemptRequest = {
      client_id,
      channel: 'call',
      direction: 'outbound',
      crm_call_id,
      result: jccResult,
      notes: notes || '',
      occurred_at: new Date().toISOString(),
    };

    // Add set_next_action if we have a follow-up
    if (followUpDate && nextActionType !== 'ready_to_kill') {
      jccPayload.set_next_action = {
        type: nextActionType,
        due_at: followUpDate,
      };
    }

    // Call JCC
    const result = await logContactAttempt(jccPayload);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error logging contact attempt:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to log contact attempt' },
      { status: 500 }
    );
  }
}

