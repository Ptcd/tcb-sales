-- Add is_new flag to track unread voicemails
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN calls.is_new IS 'Whether the call/voicemail is new (unread)';

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_calls_is_new ON calls(is_new) WHERE is_new = true;

-- For inbound calls with voicemail, they should start as "new"
-- For outbound calls, they are not "new" (user initiated them)
UPDATE calls SET is_new = false WHERE direction = 'outbound' OR direction IS NULL;

-- Update the view to include the new is_new column
DROP VIEW IF EXISTS user_call_history;
CREATE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.direction,
  c.voicemail_left,
  c.is_new,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at,
  c.organization_id
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id
WHERE c.organization_id = get_user_organization_id()
  AND c.deleted_at IS NULL;

