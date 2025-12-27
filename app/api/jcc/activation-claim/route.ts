import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { claimActivation } from '@/lib/jcc-activation-api';
import { JCC_FEATURES_ENABLED } from '@/lib/config';

/**
 * POST /api/jcc/activation-claim
 * 
 * Claims an activation account in JCC before dialing.
 * Body: { client_id: string }
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
    const { client_id } = body;

    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // Call JCC
    const result = await claimActivation(client_id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error claiming activation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to claim activation' },
      { status: 500 }
    );
  }
}

