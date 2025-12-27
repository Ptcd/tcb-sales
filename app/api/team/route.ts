import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/team - Get team members
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's profile to get organization_id
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Get all team members in the organization
    const { data: members, error: membersError } = await supabase
      .from('user_profiles')
      .select('id, role, full_name, email, created_at')
      .eq('organization_id', profile.organization_id);

    if (membersError) {
      console.error('Error fetching team members:', membersError);
      return NextResponse.json(
        { error: 'Failed to fetch team members' },
        { status: 500 }
      );
    }

    // Emails are now stored in user_profiles.email, so we already have them in members
    const membersWithEmail = members || [];

    return NextResponse.json({
      members: membersWithEmail,
      currentUserRole: profile.role
    });

  } catch (error) {
    console.error('Error in GET /api/team:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

