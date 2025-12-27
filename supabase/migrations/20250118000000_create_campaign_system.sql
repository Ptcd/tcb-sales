-- Multi-Campaign CRM System Migration
-- This migration creates the campaign system for lead segmentation and team organization

-- ============================================
-- 1. Create campaigns table
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE status = 'active';

COMMENT ON TABLE campaigns IS 'Campaigns for organizing leads and team members';
COMMENT ON COLUMN campaigns.status IS 'Campaign status: active, paused, or archived';

-- ============================================
-- 2. Create campaign_members table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign_id ON campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_organization_id ON campaign_members(organization_id);

COMMENT ON TABLE campaign_members IS 'Users assigned to campaigns';
COMMENT ON COLUMN campaign_members.role IS 'Campaign-level role: member or manager';

-- ============================================
-- 3. Create campaign_leads table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'released')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_id ON campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_claimed_by ON campaign_leads(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_organization_id ON campaign_leads(organization_id);

COMMENT ON TABLE campaign_leads IS 'Leads linked to campaigns with claim tracking';
COMMENT ON COLUMN campaign_leads.claimed_by IS 'User who claimed this lead for the campaign';
COMMENT ON COLUMN campaign_leads.status IS 'Lead status within campaign: available, claimed, or released';

-- ============================================
-- 4. Add campaign_id to existing tables
-- ============================================
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE email_messages 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Create indexes for campaign_id columns
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_id ON sms_messages(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id ON calls(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_campaign_id ON email_messages(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================
-- 5. Create default campaign for existing organizations
-- ============================================
DO $$
DECLARE
  org_record RECORD;
  default_campaign_id UUID;
BEGIN
  FOR org_record IN SELECT id FROM organizations LOOP
    -- Create default campaign
    INSERT INTO campaigns (organization_id, name, description, status)
    VALUES (org_record.id, 'Default Campaign', 'Default campaign for existing leads and team members', 'active')
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO default_campaign_id;
    
    -- If campaign was created, add all existing users to it
    IF default_campaign_id IS NOT NULL THEN
      INSERT INTO campaign_members (campaign_id, user_id, organization_id, role)
      SELECT default_campaign_id, id, organization_id, 'member'
      FROM user_profiles
      WHERE organization_id = org_record.id
      ON CONFLICT (campaign_id, user_id) DO NOTHING;
      
      -- Link all existing leads to default campaign
      INSERT INTO campaign_leads (campaign_id, lead_id, organization_id, claimed_by, status)
      SELECT 
        default_campaign_id,
        id,
        organization_id,
        assigned_to,
        CASE WHEN assigned_to IS NOT NULL THEN 'claimed' ELSE 'available' END
      FROM search_results
      WHERE organization_id = org_record.id
      ON CONFLICT (campaign_id, lead_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 6. Row Level Security Policies
-- ============================================

-- Campaigns policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaigns in their organization" ON campaigns;
CREATE POLICY "Users can view campaigns in their organization"
  ON campaigns FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can create campaigns" ON campaigns;
CREATE POLICY "Admins can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update campaigns" ON campaigns;
CREATE POLICY "Admins can update campaigns"
  ON campaigns FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete campaigns" ON campaigns;
CREATE POLICY "Admins can delete campaigns"
  ON campaigns FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Campaign members policies
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign members in their organization" ON campaign_members;
CREATE POLICY "Users can view campaign members in their organization"
  ON campaign_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage campaign members" ON campaign_members;
CREATE POLICY "Admins can manage campaign members"
  ON campaign_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_members.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_members.organization_id
    )
  );

-- Campaign leads policies
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign leads in their campaigns" ON campaign_leads;
CREATE POLICY "Users can view campaign leads in their campaigns"
  ON campaign_leads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    AND (
      -- User is a member of this campaign
      campaign_id IN (
        SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
      )
      OR
      -- User is an admin
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
        AND organization_id = campaign_leads.organization_id
      )
    )
  );

DROP POLICY IF EXISTS "Campaign members can claim leads" ON campaign_leads;
CREATE POLICY "Campaign members can claim leads"
  ON campaign_leads FOR UPDATE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage campaign leads" ON campaign_leads;
CREATE POLICY "Admins can manage campaign leads"
  ON campaign_leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_leads.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_leads.organization_id
    )
  );

-- ============================================
-- 7. Helper Functions
-- ============================================

-- Function to get user's campaigns
CREATE OR REPLACE FUNCTION get_user_campaigns()
RETURNS TABLE(campaign_id UUID) AS $$
  SELECT campaign_id
  FROM campaign_members
  WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_campaigns IS 'Returns all campaign IDs the current user is a member of';

-- Function to check if user is in campaign
CREATE OR REPLACE FUNCTION is_user_in_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = p_campaign_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_user_in_campaign IS 'Checks if the current user is a member of the specified campaign';

-- Function to get campaign for a lead
CREATE OR REPLACE FUNCTION get_lead_campaigns(p_lead_id UUID)
RETURNS TABLE(campaign_id UUID, campaign_name TEXT, claimed_by UUID) AS $$
  SELECT 
    cl.campaign_id,
    c.name as campaign_name,
    cl.claimed_by
  FROM campaign_leads cl
  JOIN campaigns c ON cl.campaign_id = c.id
  WHERE cl.lead_id = p_lead_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_lead_campaigns IS 'Returns all campaigns a lead belongs to';

-- ============================================
-- 8. Triggers
-- ============================================

-- Update updated_at for campaigns
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at for campaign_leads
DROP TRIGGER IF EXISTS update_campaign_leads_updated_at ON campaign_leads;
CREATE TRIGGER update_campaign_leads_updated_at
  BEFORE UPDATE ON campaign_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Migration Summary
-- ============================================
DO $$
DECLARE
  total_campaigns INTEGER;
  total_members INTEGER;
  total_campaign_leads INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_campaigns FROM campaigns;
  SELECT COUNT(*) INTO total_members FROM campaign_members;
  SELECT COUNT(*) INTO total_campaign_leads FROM campaign_leads;
  
  RAISE NOTICE '=== Campaign System Migration Complete ===';
  RAISE NOTICE 'Campaigns created: %', total_campaigns;
  RAISE NOTICE 'Campaign members: %', total_members;
  RAISE NOTICE 'Campaign leads: %', total_campaign_leads;
  RAISE NOTICE 'Migration completed successfully!';
END $$;

