-- Make user_id nullable in calls table for voicemails
-- Voicemails belong to the organization, not a specific user

ALTER TABLE calls 
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN calls.user_id IS 'User who received/made the call. Can be NULL for voicemails when all users are unavailable.';

