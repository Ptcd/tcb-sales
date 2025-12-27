-- Function to fix existing users who signed up but their invitations weren't accepted
-- This can be run manually or scheduled to catch any missed invitations

CREATE OR REPLACE FUNCTION fix_unaccepted_invitations()
RETURNS TABLE(
  user_email TEXT,
  invitation_id UUID,
  action_taken TEXT,
  success BOOLEAN
) AS $$
DECLARE
  inv RECORD;
  user_record RECORD;
  profile_record RECORD;
BEGIN
  -- Find all pending invitations where the user already exists in auth.users
  FOR inv IN
    SELECT ti.*
    FROM team_invitations ti
    INNER JOIN auth.users au ON LOWER(au.email) = LOWER(ti.email)
    WHERE ti.status = 'pending'
      AND ti.expires_at > NOW()
    ORDER BY ti.created_at DESC
  LOOP
    BEGIN
      -- Get the user
      SELECT * INTO user_record
      FROM auth.users
      WHERE LOWER(email) = LOWER(inv.email)
      LIMIT 1;
      
      IF user_record IS NULL THEN
        -- User doesn't exist yet, skip
        CONTINUE;
      END IF;
      
      -- Check if profile exists
      SELECT * INTO profile_record
      FROM user_profiles
      WHERE id = user_record.id;
      
      IF profile_record IS NULL THEN
        -- No profile exists - create one with invitation's org
        INSERT INTO user_profiles (id, organization_id, role, email)
        VALUES (user_record.id, inv.organization_id, inv.role, user_record.email);
        
        -- Mark invitation as accepted
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = inv.id;
        
        RETURN QUERY SELECT 
          inv.email,
          inv.id,
          'Created profile and accepted invitation'::TEXT,
          TRUE;
          
      ELSIF profile_record.organization_id != inv.organization_id THEN
        -- Profile exists but in different org - check if solo org
        DECLARE
          member_count INTEGER;
        BEGIN
          SELECT COUNT(*) INTO member_count
          FROM user_profiles
          WHERE organization_id = profile_record.organization_id;
          
          IF member_count = 1 THEN
            -- Solo org - move to invitation's org
            UPDATE user_profiles
            SET 
              organization_id = inv.organization_id,
              role = inv.role,
              email = user_record.email
            WHERE id = user_record.id;
            
            -- Delete the solo org
            DELETE FROM organizations WHERE id = profile_record.organization_id;
            
            -- Mark invitation as accepted
            UPDATE team_invitations
            SET status = 'accepted', accepted_at = NOW()
            WHERE id = inv.id;
            
            RETURN QUERY SELECT 
              inv.email,
              inv.id,
              'Moved user to invitation organization and accepted invitation'::TEXT,
              TRUE;
          ELSE
            -- User is in an org with others - leave as is, but mark invitation as expired
            UPDATE team_invitations
            SET status = 'expired'
            WHERE id = inv.id;
            
            RETURN QUERY SELECT 
              inv.email,
              inv.id,
              'User already in organization with others, expired invitation'::TEXT,
              FALSE;
          END IF;
        END;
      ELSE
        -- Profile exists and is already in the correct org - just mark invitation as accepted
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = inv.id;
        
        RETURN QUERY SELECT 
          inv.email,
          inv.id,
          'User already in correct organization, marked invitation as accepted'::TEXT,
          TRUE;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      RETURN QUERY SELECT 
        inv.email,
        inv.id,
        ('Error: ' || SQLERRM)::TEXT,
        FALSE;
    END;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the fix function automatically (one-time)
-- This will fix all existing pending invitations for users who already signed up
DO $$
DECLARE
  result RECORD;
BEGIN
  -- Run the fix function and log results
  FOR result IN SELECT * FROM fix_unaccepted_invitations() LOOP
    RAISE LOG 'Fixed invitation for %: % (Success: %)', 
      result.user_email, result.action_taken, result.success;
  END LOOP;
END $$;

