-- ============================================
-- Fix 1: Allow reps to update ANY lead in their organization (not just assigned)
-- ============================================

-- Drop conflicting policies
DROP POLICY IF EXISTS "Reps can update their assigned leads" ON search_results;
DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
DROP POLICY IF EXISTS "Users can delete organization search results" ON search_results;

-- Create simple policy: any team member can update any lead in their org
CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ============================================
-- Fix 2: Update handle_new_user trigger to capture first_name
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
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      pending_invitation := NULL;
    END;

    IF pending_invitation IS NOT NULL THEN
      -- User was invited: Create profile with invited role in the inviting organization
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email, user_first_name);
      
      profile_created := TRUE;
      
      -- Mark invitation as accepted
      UPDATE team_invitations 
      SET status = 'accepted', accepted_at = NOW() 
      WHERE id = pending_invitation.id;
      
      RAISE LOG 'Auto-accepted invitation for user % to org % with name %', NEW.email, pending_invitation.organization_id, user_first_name;
    ELSE
      -- No invitation: Create new organization for this user
      INSERT INTO organizations (name)
      VALUES (COALESCE(user_first_name, split_part(NEW.email, '@', 1)) || '''s Organization')
      RETURNING id INTO new_org_id;
      
      -- Create user profile with email and first_name (stored in full_name)
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name %', new_org_id, NEW.email, user_first_name;
      
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If organization/profile creation fails, log the error but don't block user creation
    RAISE LOG 'Error creating org/profile for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    
    -- Try one more time with minimal profile if we haven't created one yet
    IF NOT profile_created THEN
      BEGIN
        INSERT INTO organizations (name)
        VALUES (split_part(NEW.email, '@', 1) || '''s Organization')
        RETURNING id INTO new_org_id;
        
        INSERT INTO user_profiles (id, organization_id, role, email, full_name)
        VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
        
        RAISE LOG 'Created fallback profile for user %', NEW.email;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Fallback profile creation also failed for %: %', NEW.email, SQLERRM;
      END;
    END IF;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Fix 3: Update existing user's name if they provided it at signup
-- This updates users who signed up but didn't have their name captured
-- ============================================

-- Update any user_profiles where full_name is NULL but the auth.users has first_name in metadata
UPDATE user_profiles up
SET full_name = (
  SELECT raw_user_meta_data->>'first_name'
  FROM auth.users au
  WHERE au.id = up.id
    AND au.raw_user_meta_data->>'first_name' IS NOT NULL
    AND au.raw_user_meta_data->>'first_name' != ''
)
WHERE up.full_name IS NULL OR up.full_name = '';

-- Done!

