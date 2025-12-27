import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateNextAction } from '@/lib/jcc-activation-api';
import { JCCNextActionRequest, JCCNextActionType, JCCBlocker } from '@/lib/types';
import { JCC_FEATURES_ENABLED } from '@/lib/config';

/**
 * POST /api/jcc/next-action
 * 
 * Updates next action in JCC (for scheduling follow-ups without a call).
 * 
 * Body: {
 *   client_id: string,
 *   next_action_type: string,
 *   next_action_due_at: string,  // ISO timestamp
 *   blockers?: string[],
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
    const { client_id, next_action_type, next_action_due_at, blockers } = body;

    // Validate
    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
    }
    if (!next_action_type) {
      return NextResponse.json({ error: 'next_action_type is required' }, { status: 400 });
    }
    if (!next_action_due_at) {
      return NextResponse.json({ error: 'next_action_due_at is required' }, { status: 400 });
    }

    // Build request
    const jccPayload: JCCNextActionRequest = {
      client_id,
      next_action_type: next_action_type as JCCNextActionType,
      next_action_due_at,
      blockers: blockers as JCCBlocker[],
    };

    // Call JCC
    const result = await updateNextAction(jccPayload);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error updating next action:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update next action' },
      { status: 500 }
    );
  }
}

