-- Add organization_id to lead_notes table
ALTER TABLE lead_notes 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing lead_notes to have organization_id from their lead
UPDATE lead_notes ln
SET organization_id = (
  SELECT sr.organization_id
  FROM search_results sr
  WHERE sr.id = ln.lead_id
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lead_notes_organization ON lead_notes(organization_id);

-- Drop old RLS policies and create new organization-based policies for lead_notes
DROP POLICY IF EXISTS "Users can view notes for their leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can create notes for their leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON lead_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON lead_notes;

CREATE POLICY "Team members can view organization lead notes"
  ON lead_notes FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can create organization lead notes"
  ON lead_notes FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization lead notes"
  ON lead_notes FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization lead notes"
  ON lead_notes FOR DELETE
  USING (organization_id = get_user_organization_id());

-- lead_activities already has organization_id from the team system migration
-- But let's make sure the RLS policies are correct
DROP POLICY IF EXISTS "Users can view activities for their leads" ON lead_activities;
DROP POLICY IF EXISTS "Users can create activities for their leads" ON lead_activities;
DROP POLICY IF EXISTS "Team members can view organization activities" ON lead_activities;
DROP POLICY IF EXISTS "Team members can insert organization activities" ON lead_activities;

CREATE POLICY "Team members can view organization activities"
  ON lead_activities FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization activities"
  ON lead_activities FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

