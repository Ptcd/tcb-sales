import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import * as brevo from '@getbrevo/brevo';

// Initialize Brevo
const brevoApiKey = process.env.BREVO_API_KEY;
const brevoClient = brevoApiKey ? new brevo.TransactionalEmailsApi() : null;
if (brevoClient && brevoApiKey) {
  brevoClient.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

// POST /api/team/invite - Send team invitation
export async function POST(request: Request) {
  try {
    console.log('📧 Starting invitation process...');
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('User auth check:', { hasUser: !!user, error: userError?.message });
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json(
        { error: 'User profile not found. Please contact support.' },
        { status: 404 }
      );
    }

    if (!profile.organization_id) {
      console.error('User profile missing organization_id:', profile);
      return NextResponse.json(
        { error: 'Your account is not associated with an organization. Please contact support.' },
        { status: 400 }
      );
    }

    // Get organization name
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', profile.organization_id)
      .single();

    if (orgError) {
      console.error('Error fetching organization:', orgError);
      // Continue anyway, we can use a default name
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can invite team members' },
        { status: 403 }
      );
    }

    const { email, role = 'member' } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user already exists in the organization (optional check via admin API)
    let existingUser = null;
    try {
      const { data: { users }, error: existingUserError } = await supabase.auth.admin.listUsers();
      if (!existingUserError && users) {
        existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (existingUser) {
          // Check if user is already in the organization
          const { data: existingProfile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', existingUser.id)
            .eq('organization_id', profile.organization_id)
            .single();

          if (existingProfile) {
            return NextResponse.json(
              { error: 'User is already a member of this organization' },
              { status: 400 }
            );
          }
        }
      }
    } catch (adminError) {
      // Admin API not available or failed, continue with invitation
      // We'll check via user_profiles table if user already exists after they sign up
      console.log('Admin API check failed (non-critical):', adminError);
    }

    // Check if invitation already exists and handle it
    const { data: existingInvitations, error: invitationCheckError } = await supabase
      .from('team_invitations')
      .select('id, status')
      .eq('email', email.toLowerCase())
      .eq('organization_id', profile.organization_id)
      .limit(1);

    if (invitationCheckError) {
      console.error('Error checking existing invitations:', invitationCheckError);
      // Continue anyway, don't block invitation
    } else if (existingInvitations && existingInvitations.length > 0) {
      const existingInvitation = existingInvitations[0];
      
      if (existingInvitation.status === 'pending') {
        return NextResponse.json(
          { error: 'An invitation has already been sent to this email' },
          { status: 400 }
        );
      }
      
      // If invitation is accepted or expired, delete it so we can create a new one
      if (existingInvitation.status === 'accepted' || existingInvitation.status === 'expired') {
        console.log(`Deleting old ${existingInvitation.status} invitation for ${email} to create a new one`);
        const { error: deleteError } = await supabase
          .from('team_invitations')
          .delete()
          .eq('id', existingInvitation.id);
        
        if (deleteError) {
          console.error('Error deleting old invitation:', deleteError);
          // Continue anyway - the insert might fail but we'll handle that below
        }
      }
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    // Create invitation
    const { data: invitation, error: invitationError } = await supabase
      .from('team_invitations')
      .insert({
        organization_id: profile.organization_id,
        email: email.toLowerCase(),
        role,
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
        status: 'pending'
      })
      .select()
      .single();

    if (invitationError) {
      console.error('❌ Error creating invitation:', invitationError);
      console.error('Invitation error details:', {
        message: invitationError.message,
        code: invitationError.code,
        details: invitationError.details,
        hint: invitationError.hint
      });
      
      // Check if it's a constraint violation
      if (invitationError.code === '23505') { // Unique violation
        // Try to get the existing invitation to show better error
        const { data: existing } = await supabase
          .from('team_invitations')
          .select('status')
          .eq('email', email.toLowerCase())
          .eq('organization_id', profile.organization_id)
          .single();
        
        if (existing?.status === 'pending') {
          return NextResponse.json(
            { error: 'An invitation has already been sent to this email. Please wait for it to be accepted or expired.' },
            { status: 400 }
          );
        } else {
          return NextResponse.json(
            { error: 'Unable to create invitation. Please try again in a moment.' },
            { status: 400 }
          );
        }
      }
      
      // Check if it's an RLS policy issue
      if (invitationError.code === '42501' || invitationError.message?.includes('permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied. Please ensure RLS policies are properly configured.' },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to create invitation',
          details: invitationError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }
    
    if (!invitation) {
      console.error('❌ Invitation created but no data returned');
      return NextResponse.json(
        { error: 'Failed to create invitation - no data returned' },
        { status: 500 }
      );
    }

    // Generate invitation link
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?invite=${token}`;
    
    // Get organization name
    const orgName = organization?.name || 'the team';
    const inviterName = user.email || 'Team Admin';

    // Send invitation email via Brevo
    if (brevoClient && brevoApiKey) {
      try {
        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = `You've been invited to join ${orgName}`;
        sendSmtpEmail.htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">You've been invited to join ${orgName}</h2>
            <p>Hi there,</p>
            <p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Outreach CRM.</p>
            <p>As a team member, you'll be able to:</p>
            <ul>
              <li>View and manage leads</li>
              <li>Send SMS and make calls</li>
              <li>Send emails and track outreach</li>
              <li>Collaborate with your team</li>
            </ul>
            <p style="margin: 30px 0;">
              <a href="${invitationLink}" 
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Accept Invitation
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">
              Or copy and paste this link into your browser:<br>
              <a href="${invitationLink}" style="color: #2563eb; word-break: break-all;">${invitationLink}</a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              This invitation will expire in 7 days.
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 40px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `;
        sendSmtpEmail.textContent = `
You've been invited to join ${orgName}

${inviterName} has invited you to join ${orgName} on Outreach CRM.

As a team member, you'll be able to:
- View and manage leads
- Send SMS and make calls
- Send emails and track outreach
- Collaborate with your team

Accept your invitation by clicking this link:
${invitationLink}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.
        `;
        // Use verified sender email - must be set in Brevo and verified
        // If BREVO_SENDER_EMAIL is set, use it; otherwise use admin's email
        const senderEmail = process.env.BREVO_SENDER_EMAIL || user.email;
        
        if (!senderEmail) {
          throw new Error('No sender email configured. Set BREVO_SENDER_EMAIL in environment variables or ensure user has an email.');
        }
        
        sendSmtpEmail.sender = { 
          name: 'Outreach CRM',
          email: senderEmail
        };
        sendSmtpEmail.to = [{ email }];
        sendSmtpEmail.replyTo = {
          email: user.email || process.env.BREVO_SENDER_EMAIL || 'noreply@outreachcrm.com',
          name: inviterName
        };

        const brevoResponse = await brevoClient.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Invitation email sent successfully to:', email);
        console.log('Brevo response:', {
          messageId: brevoResponse.body?.messageId,
          response: brevoResponse.response
        });
      } catch (emailError: any) {
        console.error('❌ Error sending invitation email:', emailError);
        console.error('Email error details:', {
          message: emailError.message,
          response: emailError.response?.body,
          status: emailError.status
        });
        // Don't fail the request if email fails, just log it
        // The invitation is still created, user can share the link manually
      }
    } else {
      console.warn('⚠️ Brevo not configured (API key missing), invitation email not sent. Link:', invitationLink);
    }

    console.log('✅ Invitation created successfully:', invitation.id);
    
    return NextResponse.json({
      success: true,
      invitation,
      invitationLink, // Include link for manual sharing if email fails
      message: 'Invitation created successfully' + (brevoClient && brevoApiKey ? ' and email sent' : ' (email not configured)')
    });

  } catch (error: any) {
    console.error('❌ Unexpected error in POST /api/team/invite:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      response: error.response?.body,
      status: error.status
    });
    
    // Provide a user-friendly error message
    const errorMessage = error.message || 'An unexpected error occurred while creating the invitation';
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: error.status || 500 }
    );
  }
}

