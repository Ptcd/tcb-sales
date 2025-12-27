import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchActivationQueue } from '@/lib/jcc-activation-api';
import { JCC_FEATURES_ENABLED } from '@/lib/config';

/**
 * GET /api/jcc/activation-queue
 * 
 * Fetches due activation calls from JCC.
 * Requires authenticated user with activator role.
 */
export async function GET(request: NextRequest) {
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

    // Check if user is activator or admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_activator, role')
      .eq('id', user.id)
      .single();

    if (!profile?.is_activator && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Activator role required' },
        { status: 403 }
      );
    }

    // Fetch from JCC
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '200');
    const data = await fetchActivationQueue(limit);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching activation queue:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch activation queue' },
      { status: 500 }
    );
  }
}

