-- Optional cleanup: Remove unused auto-accept functions if you want to simplify
-- These are safe to remove since we're using Force Accept button instead
-- 
-- Uncomment the lines below if you want to remove them:

-- DROP FUNCTION IF EXISTS auto_accept_user_invitation(TEXT);
-- DROP FUNCTION IF EXISTS fix_unaccepted_invitations();

-- Note: Keep these functions as they're still used:
-- - accept_team_invitation(TEXT) - used by Force Accept button
-- - get_team_member_emails(UUID[]) - used to display team member emails
-- - delete_team_member(UUID) - used to remove team members
-- - update_team_member_role(UUID, TEXT) - used to update roles

