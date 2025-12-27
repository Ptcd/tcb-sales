-- Improve handle_new_user() trigger to be more robust
-- Include email field when creating profile
-- Better error handling

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1;
      
      -- If invitation exists, skip auto-creating org/profile
      -- accept-invite will handle creating the profile and joining the team
      IF pending_invitation IS NOT NULL THEN
        RAISE LOG 'User % has pending invitation, skipping org/profile creation', NEW.email;
        RETURN NEW; -- User created, profile will be created by accept-invite
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invitation check fails, log and continue with normal signup
      RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
    END;
    
    -- No invitation found - create new organization and profile for regular signup
    BEGIN
      -- Create organization
      INSERT INTO organizations (name)
      VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
      RETURNING id INTO new_org_id;
      
      IF new_org_id IS NULL THEN
        RAISE WARNING 'Failed to create organization for user %', NEW.email;
        RETURN NEW; -- Still allow user creation
      END IF;
      
      -- Create user profile with email
      INSERT INTO user_profiles (id, organization_id, role, email)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user %', new_org_id, NEW.email;
      
    EXCEPTION WHEN OTHERS THEN
      -- If organization/profile creation fails, log the error but don't block user creation
      -- The user will still be created in auth.users, but without org/profile
      -- They can be manually added later or accept-invite can handle it
      RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
      
      -- If org was created but profile creation failed, try to clean up
      IF new_org_id IS NOT NULL AND NOT profile_created THEN
        BEGIN
          DELETE FROM organizations WHERE id = new_org_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore cleanup errors
          RAISE WARNING 'Error cleaning up organization %: %', new_org_id, SQLERRM;
        END;
      END IF;
    END;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log everything but never block user creation
    RAISE WARNING 'Unexpected error in handle_new_user() for %: %', NEW.email, SQLERRM;
  END;
  
  -- Always return NEW to allow user creation, no matter what happens above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

