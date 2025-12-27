-- Add email column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Populate email from auth.users for existing profiles
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id 
  AND up.email IS NULL;

-- Update the handle_new_user trigger to include email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  pending_invitation RECORD;
  new_org_id UUID;
  new_profile_id UUID;
BEGIN
  -- Check for a pending invitation with matching email (case-insensitive)
  SELECT * INTO pending_invitation
  FROM team_invitations
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;

  -- If there's a pending invitation, skip creating org/profile
  -- The accept-invite API will handle it
  IF pending_invitation IS NOT NULL THEN
    RAISE LOG 'User % has pending invitation, skipping org/profile creation', NEW.email;
    RETURN NEW;
  END IF;

  -- No pending invitation, create new org and profile
  BEGIN
    -- Create new organization
    INSERT INTO organizations (name)
    VALUES (NEW.email || '''s Organization')
    RETURNING id INTO new_org_id;

    -- Create user profile
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (NEW.id, new_org_id, 'admin', NEW.email)
    RETURNING id INTO new_profile_id;

    RAISE LOG 'Created organization % and profile % for new user %', new_org_id, new_profile_id, NEW.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating org/profile for user %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update existing profiles when users update their email
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user_profiles.email if auth.users.email changes
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE user_profiles
    SET email = NEW.email, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync email changes
DROP TRIGGER IF EXISTS sync_user_email_trigger ON auth.users;
CREATE TRIGGER sync_user_email_trigger
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_email();

