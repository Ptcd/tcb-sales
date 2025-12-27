-- CRM Phase 1: Lead Management System
-- This migration adds CRM functionality to track leads, notes, and activities

-- 1. Add CRM columns to search_results table
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'interested', 'not_interested', 'converted')),
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for faster filtering by lead status
CREATE INDEX IF NOT EXISTS idx_search_results_lead_status ON search_results(lead_status);
CREATE INDEX IF NOT EXISTS idx_search_results_assigned_to ON search_results(assigned_to);

-- Add comments for documentation
COMMENT ON COLUMN search_results.lead_status IS 'Current status of the lead: new, contacted, interested, not_interested, or converted';
COMMENT ON COLUMN search_results.assigned_to IS 'User ID of the team member assigned to this lead';
COMMENT ON COLUMN search_results.last_contacted_at IS 'Timestamp of the last contact with this lead';
COMMENT ON COLUMN search_results.updated_at IS 'Timestamp of the last update to this lead';

-- 2. Create lead_notes table
CREATE TABLE IF NOT EXISTS lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_user_id ON lead_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at DESC);

-- Add comments
COMMENT ON TABLE lead_notes IS 'Notes and comments added to leads by users';
COMMENT ON COLUMN lead_notes.lead_id IS 'Reference to the lead (search_results.id)';
COMMENT ON COLUMN lead_notes.user_id IS 'User who created the note';
COMMENT ON COLUMN lead_notes.note IS 'The note content';

-- 3. Create lead_activities table for tracking all activities
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('status_change', 'note_added', 'assigned', 'contacted', 'email_sent', 'sms_sent', 'call_made')),
  activity_data JSONB DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_user_id ON lead_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);

-- Add comments
COMMENT ON TABLE lead_activities IS 'Activity timeline and history for each lead';
COMMENT ON COLUMN lead_activities.activity_type IS 'Type of activity: status_change, note_added, assigned, contacted, email_sent, sms_sent, call_made';
COMMENT ON COLUMN lead_activities.activity_data IS 'Additional data about the activity stored as JSON';
COMMENT ON COLUMN lead_activities.description IS 'Human-readable description of the activity';

-- 4. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search_results
DROP TRIGGER IF EXISTS update_search_results_updated_at ON search_results;
CREATE TRIGGER update_search_results_updated_at
  BEFORE UPDATE ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for lead_notes
DROP TRIGGER IF EXISTS update_lead_notes_updated_at ON lead_notes;
CREATE TRIGGER update_lead_notes_updated_at
  BEFORE UPDATE ON lead_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Row Level Security (RLS) Policies

-- Enable RLS on new tables
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- lead_notes policies
CREATE POLICY "Users can view notes for their leads"
ON lead_notes FOR SELECT
TO public
USING (
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create notes for their leads"
ON lead_notes FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own notes"
ON lead_notes FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own notes"
ON lead_notes FOR DELETE
TO public
USING (user_id = auth.uid());

-- lead_activities policies
CREATE POLICY "Users can view activities for their leads"
ON lead_activities FOR SELECT
TO public
USING (
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create activities for their leads"
ON lead_activities FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

-- 6. Create view for lead management with user information
CREATE OR REPLACE VIEW user_leads AS
SELECT 
  sr.id,
  sr.search_history_id,
  sr.place_id,
  sr.name,
  sr.address,
  sr.phone,
  sr.email,
  sr.website,
  sr.rating,
  sr.review_count,
  sr.latitude,
  sr.longitude,
  sr.lead_status,
  sr.assigned_to,
  sr.last_contacted_at,
  sr.created_at,
  sr.updated_at,
  sh.user_id,
  sh.keyword,
  sh.location,
  sh.result_count,
  sh.created_at as search_date,
  -- Count of notes for this lead
  (SELECT COUNT(*) FROM lead_notes WHERE lead_notes.lead_id = sr.id) as notes_count,
  -- Count of activities for this lead
  (SELECT COUNT(*) FROM lead_activities WHERE lead_activities.lead_id = sr.id) as activities_count
FROM search_results sr
JOIN search_history sh ON sr.search_history_id = sh.id;

COMMENT ON VIEW user_leads IS 'Complete view of leads with user information, notes count, and activities count';

