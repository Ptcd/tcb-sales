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

// POST /api/team/invitations/[id] - Resend invitation
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
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
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can resend invitations' },
        { status: 403 }
      );
    }

    // Get the invitation
    const { data: invitation, error: invitationError } = await supabase
      .from('team_invitations')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', profile.organization_id)
      .single();

    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only resend pending invitations' },
        { status: 400 }
      );
    }

    // Generate new token and extend expiration
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Extend by 7 days

    // Update invitation with new token and expiration
    const { data: updatedInvitation, error: updateError } = await supabase
      .from('team_invitations')
      .update({
        token: newToken,
        expires_at: expiresAt.toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (updateError || !updatedInvitation) {
      console.error('Error updating invitation:', updateError);
      return NextResponse.json(
        { error: 'Failed to update invitation' },
        { status: 500 }
      );
    }

    // Generate invitation link
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?invite=${newToken}`;
    
    // Get organization name
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', profile.organization_id)
      .single();

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
        const senderEmail = process.env.BREVO_SENDER_EMAIL || user.email;
        
        if (!senderEmail) {
          throw new Error('No sender email configured');
        }
        
        sendSmtpEmail.sender = { 
          name: 'Outreach CRM',
          email: senderEmail
        };
        sendSmtpEmail.to = [{ email: invitation.email }];
        sendSmtpEmail.replyTo = {
          email: user.email || process.env.BREVO_SENDER_EMAIL || 'noreply@outreachcrm.com',
          name: inviterName
        };

        const brevoResponse = await brevoClient.sendTransacEmail(sendSmtpEmail);
        console.log('✅ Invitation email resent successfully to:', invitation.email);
      } catch (emailError: any) {
        console.error('❌ Error resending invitation email:', emailError);
        // Don't fail the request if email fails, just log it
      }
    } else {
      console.warn('⚠️ Brevo not configured, invitation email not sent. Link:', invitationLink);
    }

    return NextResponse.json({
      success: true,
      invitation: updatedInvitation,
      message: 'Invitation resent successfully' + (brevoClient && brevoApiKey ? ' and email sent' : ' (email not configured)')
    });

  } catch (error) {
    console.error('Error in POST /api/team/invitations/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/team/invitations/[id] - Cancel invitation
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
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
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can cancel invitations' },
        { status: 403 }
      );
    }

    // Delete invitation
    const { error: deleteError } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', profile.organization_id);

    if (deleteError) {
      console.error('Error deleting invitation:', deleteError);
      return NextResponse.json(
        { error: 'Failed to cancel invitation' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/team/invitations/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

