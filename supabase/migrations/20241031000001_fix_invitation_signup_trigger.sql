-- Fix handle_new_user() trigger to check for pending invitations
-- If user signs up with a pending invitation, skip creating new org
-- accept-invite will handle creating the profile and joining the team

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
BEGIN
  -- Check if there's a pending invitation for this email (case-insensitive)
  -- If yes, skip creating org/profile - accept-invite will handle it
  BEGIN
    SELECT * INTO pending_invitation
    FROM team_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;
    
    -- If invitation exists, skip auto-creating org (accept-invite will create profile)
    IF pending_invitation IS NOT NULL THEN
      -- Don't create org/profile yet - accept-invite will handle it
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If check fails for any reason, log and continue with normal signup
    -- This prevents the trigger from blocking user creation
    RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
  END;
  
  -- No invitation found - create new organization for regular signup
  BEGIN
    INSERT INTO organizations (name)
    VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
    RETURNING id INTO new_org_id;
    
    INSERT INTO user_profiles (id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'admin');
    
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- If organization/profile creation fails, log the error but don't block user creation
    -- The user will still be created in auth.users, but without org/profile
    -- They can be manually added later or accept-invite can handle it
    RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept invitation (bypasses RLS for status updates)
CREATE OR REPLACE FUNCTION accept_team_invitation(invitation_token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user emails for team members (bypasses RLS)
CREATE OR REPLACE FUNCTION get_team_member_emails(member_ids UUID[])
RETURNS TABLE(user_id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email
  FROM auth.users au
  WHERE au.id = ANY(member_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

