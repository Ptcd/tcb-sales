-- Manual fix for the current pending invitation
-- Run this to fix the invitation for ernzkiegemini@gmail.com

DO $$
DECLARE
  user_id_var UUID;
  invitation_record RECORD;
  profile_record RECORD;
  org_member_count INTEGER;
BEGIN
  -- Get the user ID
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE LOWER(email) = LOWER('ernzkiegemini@gmail.com')
  LIMIT 1;
  
  IF user_id_var IS NULL THEN
    RAISE NOTICE 'User ernzkiegemini@gmail.com not found in auth.users';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found user: %', user_id_var;
  
  -- Get the pending invitation
  SELECT * INTO invitation_record
  FROM team_invitations
  WHERE LOWER(email) = LOWER('ernzkiegemini@gmail.com')
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record IS NULL THEN
    RAISE NOTICE 'No pending invitation found for ernzkiegemini@gmail.com';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found invitation: % (org: %, role: %)', 
    invitation_record.id, 
    invitation_record.organization_id, 
    invitation_record.role;
  
  -- Check if profile exists
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE id = user_id_var;
  
  IF profile_record IS NULL THEN
    -- No profile exists - create one
    RAISE NOTICE 'Creating profile for user...';
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (user_id_var, invitation_record.organization_id, invitation_record.role, 'ernzkiegemini@gmail.com');
    
    RAISE NOTICE 'Profile created successfully';
  ELSE
    RAISE NOTICE 'Profile exists: org=%, role=%', profile_record.organization_id, profile_record.role;
    
    -- Check if user is in a solo org
    SELECT COUNT(*) INTO org_member_count
    FROM user_profiles
    WHERE organization_id = profile_record.organization_id;
    
    IF org_member_count = 1 THEN
      -- Solo org - move to invitation's org
      RAISE NOTICE 'User in solo org, moving to invitation org...';
      UPDATE user_profiles
      SET 
        organization_id = invitation_record.organization_id,
        role = invitation_record.role,
        email = 'ernzkiegemini@gmail.com'
      WHERE id = user_id_var;
      
      -- Delete the solo org
      DELETE FROM organizations WHERE id = profile_record.organization_id;
      
      RAISE NOTICE 'User moved to invitation organization';
    ELSIF profile_record.organization_id != invitation_record.organization_id THEN
      RAISE NOTICE 'User is already in an organization with other members. Cannot move automatically.';
    ELSE
      RAISE NOTICE 'User already in correct organization';
    END IF;
  END IF;
  
  -- Mark invitation as accepted
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = invitation_record.id;
  
  RAISE NOTICE '✅ Invitation marked as accepted';
  RAISE NOTICE 'Done! Refresh the Settings page to see the changes.';
  
END $$;

-- Verify the fix
SELECT 
  'User Profile:' as check_type,
  up.id::text as user_id,
  up.organization_id::text as org_id,
  up.role,
  up.email
FROM user_profiles up
WHERE up.email = 'ernzkiegemini@gmail.com'

UNION ALL

SELECT 
  'Invitation Status:' as check_type,
  ti.id::text,
  ti.status,
  ti.organization_id::text,
  ti.email
FROM team_invitations ti
WHERE LOWER(ti.email) = LOWER('ernzkiegemini@gmail.com');

