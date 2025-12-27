-- Auto-generate SDR codes for new users
-- Creates a random 6-character alphanumeric code on signup

-- ============================================
-- 1. Create function to generate random SDR code
-- ============================================
CREATE OR REPLACE FUNCTION generate_sdr_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789'; -- Removed ambiguous chars (i,l,o,0,1)
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Create function to get unique SDR code (retries on collision)
-- ============================================
CREATE OR REPLACE FUNCTION get_unique_sdr_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    new_code := generate_sdr_code();
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE sdr_code = new_code) THEN
      RETURN new_code;
    END IF;
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      -- Fallback: append random suffix
      RETURN new_code || substr(md5(random()::text), 1, 2);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Update handle_new_user trigger to auto-set sdr_code
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
  user_first_name TEXT;
  new_sdr_code TEXT;
BEGIN
  -- Extract first_name from user metadata (set during signUp)
  user_first_name := NEW.raw_user_meta_data->>'first_name';
  
  -- Generate unique SDR code for this user
  new_sdr_code := get_unique_sdr_code();
  
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
      INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
      VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email, user_first_name, new_sdr_code);
      
      profile_created := TRUE;
      
      -- Mark invitation as accepted
      UPDATE team_invitations 
      SET status = 'accepted', accepted_at = NOW() 
      WHERE id = pending_invitation.id;
      
      RAISE LOG 'Auto-accepted invitation for user % to org % with name % and sdr_code %', NEW.email, pending_invitation.organization_id, user_first_name, new_sdr_code;
    ELSE
      -- No invitation: Create new organization for this user
      INSERT INTO organizations (name)
      VALUES (COALESCE(user_first_name, split_part(NEW.email, '@', 1)) || '''s Organization')
      RETURNING id INTO new_org_id;
      
      -- Create user profile with email, first_name, and auto-generated sdr_code
      INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name, new_sdr_code);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name % and sdr_code %', new_org_id, NEW.email, user_first_name, new_sdr_code;
      
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
        
        INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
        VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name, new_sdr_code);
        
        RAISE LOG 'Created fallback profile for user % with sdr_code %', NEW.email, new_sdr_code;
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
-- 4. Backfill existing users without sdr_code
-- ============================================
UPDATE user_profiles
SET sdr_code = get_unique_sdr_code()
WHERE sdr_code IS NULL;

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Auto-Generate SDR Codes Migration Complete ===';
  RAISE NOTICE 'New users will automatically get a 6-character SDR code on signup';
  RAISE NOTICE 'Existing users without codes have been backfilled';
END $$;



