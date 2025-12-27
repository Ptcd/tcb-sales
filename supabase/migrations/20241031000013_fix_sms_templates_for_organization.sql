-- Add organization_id to sms_templates table
ALTER TABLE sms_templates 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing sms_templates to have organization_id from user
UPDATE sms_templates st
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = st.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sms_templates_organization ON sms_templates(organization_id);

-- Drop old RLS policies and create new organization-based policies
DROP POLICY IF EXISTS "Users can view their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can create their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON sms_templates;

CREATE POLICY "Team members can view organization SMS templates"
  ON sms_templates FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can create organization SMS templates"
  ON sms_templates FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization SMS templates"
  ON sms_templates FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization SMS templates"
  ON sms_templates FOR DELETE
  USING (organization_id = get_user_organization_id());

