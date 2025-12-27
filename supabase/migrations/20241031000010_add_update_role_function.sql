-- Create function to update team member role (bypasses RLS)
-- Allows admins to update roles of members in their organization

CREATE OR REPLACE FUNCTION update_team_member_role(
  member_id_to_update UUID,
  new_role TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  admin_profile RECORD;
  member_profile RECORD;
  admin_count INTEGER;
BEGIN
  -- Get admin's profile to verify permissions
  SELECT * INTO admin_profile
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check admin exists and is admin
  IF admin_profile IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Admin profile not found'::TEXT;
    RETURN;
  END IF;
  
  IF admin_profile.role != 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only admins can update team member roles'::TEXT;
    RETURN;
  END IF;
  
  -- Validate role
  IF new_role NOT IN ('admin', 'member') THEN
    RETURN QUERY SELECT FALSE, 'Invalid role. Must be admin or member'::TEXT;
    RETURN;
  END IF;
  
  -- Get member to update
  SELECT * INTO member_profile
  FROM user_profiles
  WHERE id = member_id_to_update;
  
  IF member_profile IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Member not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check same organization
  IF member_profile.organization_id != admin_profile.organization_id THEN
    RETURN QUERY SELECT FALSE, 'Member not in your organization'::TEXT;
    RETURN;
  END IF;
  
  -- Prevent self-update (optional, but good practice)
  IF member_profile.id = admin_profile.id THEN
    RETURN QUERY SELECT FALSE, 'Cannot update your own role'::TEXT;
    RETURN;
  END IF;
  
  -- If demoting from admin, check if they're the last admin
  IF member_profile.role = 'admin' AND new_role = 'member' THEN
    SELECT COUNT(*) INTO admin_count
    FROM user_profiles
    WHERE organization_id = admin_profile.organization_id
      AND role = 'admin';
    
    IF admin_count <= 1 THEN
      RETURN QUERY SELECT FALSE, 'Cannot demote the last admin'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Update the role (bypasses RLS due to SECURITY DEFINER)
  UPDATE user_profiles
  SET 
    role = new_role,
    updated_at = NOW()
  WHERE id = member_id_to_update;
  
  RETURN QUERY SELECT TRUE, 'Role updated successfully'::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, ('Error: ' || SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

