import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/team/accept-invite - Accept invitation and join team
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { token, userId } = await request.json();

    if (!token || !userId) {
      return NextResponse.json(
        { error: 'Token and userId are required' },
        { status: 400 }
      );
    }

    // Get invitation
    const { data: invitation, error: invitationError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: 'Invalid invitation' },
        { status: 404 }
      );
    }

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from('team_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      );
    }

    // Check if invitation has already been accepted
    if (invitation.status === 'accepted') {
      return NextResponse.json(
        { error: 'Invitation has already been accepted' },
        { status: 400 }
      );
    }

    // Get user's email to verify it matches invitation
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email does not match invitation' },
        { status: 400 }
      );
    }

    // Extract first_name from user metadata (set during signUp)
    const firstName = user.user_metadata?.first_name || null;

    // Check if user already has a profile (from auto-creation)
    const { data: existingProfiles, error: profileCheckError } = await supabase
      .from('user_profiles')
      .select('id, organization_id, full_name')
      .eq('id', userId)
      .limit(1);
    
    const existingProfile = existingProfiles && existingProfiles.length > 0 ? existingProfiles[0] : null;

    if (existingProfile) {
      // User already has a profile, update it to join the new organization
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          organization_id: invitation.organization_id,
          role: invitation.role,
          email: user.email,
          // Only update full_name if it's not already set
          ...(firstName && !existingProfile.full_name ? { full_name: firstName } : {})
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error updating user profile:', updateError);
        return NextResponse.json(
          { error: 'Failed to accept invitation' },
          { status: 500 }
        );
      }

      // Delete the old organization if user was the only member
      if (existingProfile.organization_id) {
        const { data: otherMembers } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('organization_id', existingProfile.organization_id);

        if (!otherMembers || otherMembers.length === 0) {
          await supabase
            .from('organizations')
            .delete()
            .eq('id', existingProfile.organization_id);
        }
      }
    } else {
      // Create new profile for user
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          organization_id: invitation.organization_id,
          role: invitation.role,
          email: user.email,
          full_name: firstName
        });

      if (insertError) {
        console.error('Error creating user profile:', insertError);
        return NextResponse.json(
          { error: 'Failed to accept invitation' },
          { status: 500 }
        );
      }
    }

    // Mark invitation as accepted using database function (bypasses RLS)
    const { error: acceptError } = await supabase
      .rpc('accept_team_invitation', { invitation_token: token });

    if (acceptError) {
      console.error('Error updating invitation status:', acceptError);
      console.error('Invitation token:', token);
      // Try direct update as fallback
      const { error: fallbackError } = await supabase
        .from('team_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitation.id);
      
      if (fallbackError) {
        console.error('Fallback update also failed:', fallbackError);
        console.log('Profile was created successfully, invitation status may need manual update');
      } else {
        console.log('✅ Invitation marked as accepted (fallback method):', invitation.id);
      }
    } else {
      console.log('✅ Invitation marked as accepted:', invitation.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined the team'
    });

  } catch (error) {
    console.error('Error in POST /api/team/accept-invite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

