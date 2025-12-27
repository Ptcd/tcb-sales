-- Create a comprehensive function to auto-accept invitations for users
-- This bypasses RLS completely and handles all edge cases

CREATE OR REPLACE FUNCTION auto_accept_user_invitation(user_email_param TEXT)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  invitation_id UUID,
  profile_created BOOLEAN
) AS $$
DECLARE
  user_record RECORD;
  invitation_record RECORD;
  profile_record RECORD;
  org_member_count INTEGER;
  old_org_id UUID;
BEGIN
  -- Get the user
  SELECT * INTO user_record
  FROM auth.users
  WHERE LOWER(email) = LOWER(user_email_param)
  LIMIT 1;
  
  IF user_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Get the most recent pending invitation for this email
  SELECT * INTO invitation_record
  FROM team_invitations
  WHERE LOWER(email) = LOWER(user_email_param)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No pending invitation found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Check if profile exists
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE id = user_record.id;
  
  -- Handle profile creation/update
  IF profile_record IS NULL THEN
    -- No profile - create one
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (user_record.id, invitation_record.organization_id, invitation_record.role, user_record.email);
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE, 
      'Profile created and invitation accepted'::TEXT,
      invitation_record.id,
      TRUE;
    RETURN;
  END IF;
  
  -- Profile exists - check if in solo org
  IF profile_record.organization_id IS NOT NULL THEN
    SELECT COUNT(*) INTO org_member_count
    FROM user_profiles
    WHERE organization_id = profile_record.organization_id;
    
    IF org_member_count = 1 THEN
      -- Solo org - move to invitation org
      old_org_id := profile_record.organization_id;
      
      UPDATE user_profiles
      SET 
        organization_id = invitation_record.organization_id,
        role = invitation_record.role,
        email = user_record.email
      WHERE id = user_record.id;
      
      -- Delete old solo org
      DELETE FROM organizations WHERE id = old_org_id;
      
      -- Mark invitation as accepted
      UPDATE team_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = invitation_record.id;
      
      RETURN QUERY SELECT 
        TRUE,
        'User moved to invitation organization'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    ELSIF profile_record.organization_id = invitation_record.organization_id THEN
      -- Already in correct org - just mark invitation as accepted
      UPDATE team_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = invitation_record.id;
      
      RETURN QUERY SELECT 
        TRUE,
        'User already in organization, invitation marked as accepted'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    ELSE
      -- User in different org with others - can't auto-move
      RETURN QUERY SELECT 
        FALSE,
        'User already in different organization'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    END IF;
  ELSE
    -- Profile exists but no org - update it
    UPDATE user_profiles
    SET 
      organization_id = invitation_record.organization_id,
      role = invitation_record.role,
      email = user_record.email
    WHERE id = user_record.id;
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE,
      'Profile updated and invitation accepted'::TEXT,
      invitation_record.id,
      FALSE;
    RETURN;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    FALSE,
    ('Error: ' || SQLERRM)::TEXT,
    COALESCE(invitation_record.id, NULL::UUID),
    FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

