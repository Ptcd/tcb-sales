-- Update user_call_history view to include inbound calls
-- Note: is_new column added in next migration (20241114000003)
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

COMMENT ON VIEW user_call_history IS 'Call history with lead information including inbound calls (organization-filtered)';

