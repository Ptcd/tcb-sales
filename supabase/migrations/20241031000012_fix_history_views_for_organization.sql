-- Add organization_id to search_history table (if not already added)
ALTER TABLE search_history 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing search_history records to have organization_id
UPDATE search_history sh
SET organization_id = (
  SELECT DISTINCT sr.organization_id
  FROM search_results sr
  WHERE sr.search_history_id = sh.id
  LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM search_results sr WHERE sr.search_history_id = sh.id);

-- For search_history records without results, use user's organization
UPDATE search_history sh
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = sh.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_search_history_organization ON search_history(organization_id);

-- Drop old RLS policies if exist and create new organization-based ones
DROP POLICY IF EXISTS "Users can view their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can delete their own search history" ON search_history;
DROP POLICY IF EXISTS "Team members can view organization search history" ON search_history;
DROP POLICY IF EXISTS "Team members can delete organization search history" ON search_history;

CREATE POLICY "Team members can view organization search history"
  ON search_history FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization search history"
  ON search_history FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Update views to be organization-aware
CREATE OR REPLACE VIEW user_sms_history AS
SELECT 
  sm.id,
  sm.lead_id,
  sm.user_id,
  sm.template_id,
  sm.phone_number,
  sm.message,
  sm.status,
  sm.twilio_sid,
  sm.error_message,
  sm.sent_at,
  sm.delivered_at,
  sm.created_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  st.name as template_name
FROM sms_messages sm
LEFT JOIN search_results sr ON sm.lead_id = sr.id
LEFT JOIN sms_templates st ON sm.template_id = st.id
WHERE sm.organization_id = get_user_organization_id();

COMMENT ON VIEW user_sms_history IS 'SMS message history with lead and template information (organization-filtered)';

-- Add organization_id to calls table if it doesn't exist
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing calls to have organization_id from their lead
UPDATE calls c
SET organization_id = (
  SELECT sr.organization_id
  FROM search_results sr
  WHERE sr.id = c.lead_id
  LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM search_results sr WHERE sr.id = c.lead_id);

-- For calls without leads, use user's organization
UPDATE calls c
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = c.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_calls_organization ON calls(organization_id);

-- Update RLS policies for calls table
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
DROP POLICY IF EXISTS "Team members can view organization calls" ON calls;
CREATE POLICY "Team members can view organization calls"
  ON calls FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Update call history view
CREATE OR REPLACE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
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
  sr.last_call_made_at
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id
WHERE c.organization_id = get_user_organization_id();

COMMENT ON VIEW user_call_history IS 'Call history with lead information (organization-filtered)';

