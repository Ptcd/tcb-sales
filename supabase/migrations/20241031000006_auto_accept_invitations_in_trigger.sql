-- Auto-accept invitations during signup
-- This ensures invitations are automatically accepted when users sign up
-- No need to rely on API calls or external services

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- FIRST: Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- If invitation exists, automatically accept it and create profile
      IF pending_invitation IS NOT NULL THEN
        BEGIN
          RAISE LOG 'User % has pending invitation, auto-accepting and creating profile', NEW.email;
          
          -- Create user profile with invitation's organization and role
          INSERT INTO user_profiles (id, organization_id, role, email)
          VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email);
          
          profile_created := TRUE;
          
          -- Mark invitation as accepted (using the function that bypasses RLS)
          BEGIN
            PERFORM accept_team_invitation(pending_invitation.token);
          EXCEPTION WHEN OTHERS THEN
            -- Fallback: direct update if function fails
            UPDATE team_invitations
            SET 
              status = 'accepted',
              accepted_at = NOW()
            WHERE id = pending_invitation.id
              AND status = 'pending';
          END;
          
          RAISE LOG '✅ Auto-accepted invitation and created profile for user % in organization %', 
            NEW.email, pending_invitation.organization_id;
          
          RETURN NEW; -- User created, profile created, invitation accepted - all done!
          
        EXCEPTION WHEN OTHERS THEN
          -- If profile creation or invitation acceptance fails, log but continue
          RAISE WARNING 'Error auto-accepting invitation for %: %', NEW.email, SQLERRM;
          -- Fall through to create normal org/profile below
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invitation check fails, log and continue with normal signup
      RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
    END;
    
    -- No invitation found or invitation handling failed - create new organization and profile for regular signup
    IF NOT profile_created THEN
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
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log everything but never block user creation
    RAISE WARNING 'Unexpected error in handle_new_user() for %: %', NEW.email, SQLERRM;
  END;
  
  -- Always return NEW to allow user creation, no matter what happens above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

