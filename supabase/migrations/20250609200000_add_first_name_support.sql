-- Add first_name support for user profiles
-- This captures the first name during signup for use in templates like {{sender_name}}

-- ============================================
-- 1. Update the handle_new_user trigger to capture first_name from user metadata
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
  user_first_name TEXT;
BEGIN
  -- Extract first_name from user metadata (set during signUp)
  user_first_name := NEW.raw_user_meta_data->>'first_name';
  
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
      
      -- Create user profile with email and first_name
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name %', new_org_id, NEW.email, user_first_name;
      
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

-- ============================================
-- 2. Create function to update team member name (bypasses RLS)
-- ============================================
CREATE OR REPLACE FUNCTION update_team_member_name(
  member_id_to_update UUID,
  new_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  caller_org_id UUID;
  caller_role TEXT;
  member_org_id UUID;
BEGIN
  -- Get caller's organization and role
  SELECT organization_id, role INTO caller_org_id, caller_role
  FROM user_profiles
  WHERE id = auth.uid();

  IF caller_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Caller profile not found'::TEXT;
    RETURN;
  END IF;

  -- Check if caller is admin
  IF caller_role != 'admin' THEN
    RETURN QUERY SELECT false, 'Only admins can update team member names'::TEXT;
    RETURN;
  END IF;

  -- Get member's organization
  SELECT organization_id INTO member_org_id
  FROM user_profiles
  WHERE id = member_id_to_update;

  IF member_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Member not found'::TEXT;
    RETURN;
  END IF;

  -- Verify same organization
  IF member_org_id != caller_org_id THEN
    RETURN QUERY SELECT false, 'Member not in your organization'::TEXT;
    RETURN;
  END IF;

  -- Update the name
  UPDATE user_profiles
  SET full_name = NULLIF(TRIM(new_name), '')
  WHERE id = member_id_to_update;

  RETURN QUERY SELECT true, 'Name updated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== First Name Support Migration Complete ===';
  RAISE NOTICE 'The handle_new_user trigger now captures first_name from user metadata';
  RAISE NOTICE 'First name is stored in the full_name column of user_profiles';
  RAISE NOTICE 'Admins can update any team member name using update_team_member_name function';
  RAISE NOTICE 'Use {{sender_name}} in templates to include the sender first name';
END $$;

