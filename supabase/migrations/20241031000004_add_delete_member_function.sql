-- Create a function to delete team members that bypasses RLS
-- This ensures admins can delete members even if RLS policies have issues
CREATE OR REPLACE FUNCTION delete_team_member(member_id_to_delete UUID)
RETURNS TABLE(deleted_id UUID, deleted_email TEXT) AS $$
DECLARE
  admin_profile RECORD;
  member_profile RECORD;
  deleted_email TEXT;
BEGIN
  -- Get admin's profile to verify permissions
  SELECT * INTO admin_profile
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check admin exists and is admin
  IF admin_profile IS NULL THEN
    RAISE EXCEPTION 'Admin profile not found';
  END IF;
  
  IF admin_profile.role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete team members';
  END IF;
  
  -- Get member to delete
  SELECT * INTO member_profile
  FROM user_profiles
  WHERE id = member_id_to_delete;
  
  IF member_profile IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  
  -- Check same organization
  IF member_profile.organization_id != admin_profile.organization_id THEN
    RAISE EXCEPTION 'Member not in your organization';
  END IF;
  
  -- Prevent self-deletion
  IF member_profile.id = admin_profile.id THEN
    RAISE EXCEPTION 'You cannot delete yourself';
  END IF;
  
  -- Get email before deletion
  deleted_email := member_profile.email;
  
  -- Delete the member (bypasses RLS due to SECURITY DEFINER)
  DELETE FROM user_profiles
  WHERE id = member_id_to_delete;
  
  -- Return deleted info
  RETURN QUERY SELECT member_id_to_delete, deleted_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

