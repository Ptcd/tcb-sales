-- Add call_scripts table for campaign-level call scripts
-- Reps can use these scripts during calls

-- ============================================
-- 1. Create call_scripts table
-- ============================================
CREATE TABLE IF NOT EXISTS call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_call_scripts_campaign_id ON call_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_scripts_organization_id ON call_scripts(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_scripts_is_active ON call_scripts(is_active);

-- ============================================
-- 2. Enable RLS
-- ============================================
ALTER TABLE call_scripts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies
-- ============================================

-- SELECT: Campaign members can read scripts from their campaigns
CREATE POLICY "Campaign members can view call scripts"
  ON call_scripts FOR SELECT
  USING (
    -- User is a member of this campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
    )
    OR
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
  );

-- INSERT: Only admins and campaign managers can create scripts
CREATE POLICY "Admins and managers can insert call scripts"
  ON call_scripts FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- UPDATE: Only admins and campaign managers can update scripts
CREATE POLICY "Admins and managers can update call scripts"
  ON call_scripts FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- DELETE: Only admins and campaign managers can delete scripts
CREATE POLICY "Admins and managers can delete call scripts"
  ON call_scripts FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 4. Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Call Scripts Migration Complete ===';
  RAISE NOTICE 'Created call_scripts table with:';
  RAISE NOTICE '  - campaign_id, name, content, display_order, is_active';
  RAISE NOTICE '  - RLS policies for campaign members (SELECT) and admins/managers (full CRUD)';
END $$;



