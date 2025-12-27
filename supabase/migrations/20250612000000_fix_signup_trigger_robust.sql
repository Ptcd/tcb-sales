-- More robust handle_new_user() trigger that NEVER fails
-- This fixes "Database error saving new user" issues

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- CRITICAL: Wrap everything in exception handler to NEVER block user creation
  BEGIN
    -- Step 1: Check for pending invitation
    BEGIN
      SELECT id, organization_id, role, token 
      INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Invitation lookup failed - continue with normal signup
      pending_invitation := NULL;
      RAISE LOG '[handle_new_user] Invitation lookup error for %: %', NEW.email, SQLERRM;
    END;
    
    -- Step 2: If invitation found, create profile and accept invitation
    IF pending_invitation IS NOT NULL AND pending_invitation.organization_id IS NOT NULL THEN
      BEGIN
        -- Create user profile with invitation's organization
        INSERT INTO user_profiles (id, organization_id, role, email)
        VALUES (NEW.id, pending_invitation.organization_id, COALESCE(pending_invitation.role, 'member'), NEW.email)
        ON CONFLICT (id) DO NOTHING;  -- Don't fail if profile somehow exists
        
        profile_created := TRUE;
        
        -- Mark invitation as accepted
        BEGIN
          UPDATE team_invitations
          SET status = 'accepted', accepted_at = NOW()
          WHERE id = pending_invitation.id AND status = 'pending';
        EXCEPTION WHEN OTHERS THEN
          -- Invitation update failed - user still created, invitation can be accepted later
          RAISE LOG '[handle_new_user] Could not mark invitation accepted for %: %', NEW.email, SQLERRM;
        END;
        
        RAISE LOG '[handle_new_user] Created profile for invited user % in org %', NEW.email, pending_invitation.organization_id;
        RETURN NEW;  -- Done!
        
      EXCEPTION WHEN OTHERS THEN
        -- Profile creation with invitation failed
        RAISE LOG '[handle_new_user] Invitation profile creation error for %: %', NEW.email, SQLERRM;
        profile_created := FALSE;
        -- Fall through to create new org
      END;
    END IF;
    
    -- Step 3: No valid invitation - create new organization and profile
    IF NOT profile_created THEN
      BEGIN
        -- Create organization
        INSERT INTO organizations (name)
        VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
        RETURNING id INTO new_org_id;
        
        -- Create profile
        IF new_org_id IS NOT NULL THEN
          INSERT INTO user_profiles (id, organization_id, role, email)
          VALUES (NEW.id, new_org_id, 'admin', NEW.email)
          ON CONFLICT (id) DO NOTHING;
          
          RAISE LOG '[handle_new_user] Created new org % and profile for %', new_org_id, NEW.email;
        END IF;
        
      EXCEPTION WHEN OTHERS THEN
        -- Org/profile creation failed - user still created in auth.users
        RAISE LOG '[handle_new_user] Org/profile creation error for %: %', NEW.email, SQLERRM;
        
        -- Try to clean up orphan org if created
        IF new_org_id IS NOT NULL THEN
          BEGIN
            DELETE FROM organizations WHERE id = new_org_id;
          EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignore cleanup errors
          END;
        END IF;
      END;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log but NEVER block user creation
    RAISE LOG '[handle_new_user] CRITICAL: Unexpected error for %: %', NEW.email, SQLERRM;
  END;
  
  -- ALWAYS return NEW - never fail user creation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Ensure the accept_team_invitation function exists
CREATE OR REPLACE FUNCTION accept_team_invitation(invitation_token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE token = invitation_token
    AND status = 'pending';
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[accept_team_invitation] Error accepting invitation: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



