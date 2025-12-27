import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/team/accept-invitation-for-user - Admin action to accept invitation for a specific user
export async function POST(request: Request) {
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

    // Check if current user is admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can accept invitations for other users' },
        { status: 403 }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Use the database function to accept the invitation
    const { data: result, error: rpcError } = await supabase
      .rpc('auto_accept_user_invitation', { user_email_param: email });

    if (rpcError) {
      console.error('Error accepting invitation:', rpcError);
      return NextResponse.json(
        { 
          error: 'Failed to accept invitation',
          details: rpcError.message 
        },
        { status: 500 }
      );
    }

    if (!result || result.length === 0) {
      return NextResponse.json(
        { error: 'No invitation found or user does not exist' },
        { status: 404 }
      );
    }

    const acceptanceResult = result[0];
    
    if (!acceptanceResult.success) {
      return NextResponse.json(
        { 
          error: acceptanceResult.message || 'Failed to accept invitation'
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: acceptanceResult.message,
      invitationId: acceptanceResult.invitation_id
    });

  } catch (error) {
    console.error('Error in POST /api/team/accept-invitation-for-user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

