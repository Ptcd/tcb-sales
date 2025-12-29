-- Campaign-Level Templates Migration
-- Moves email and SMS templates from organization-level to campaign-level
-- This enables A/B testing different messaging approaches per campaign
-- Only run if tables exist

DO $$
BEGIN
  -- ============================================
  -- 1. Add campaign_id to email_templates
  -- ============================================
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_templates') THEN
    ALTER TABLE email_templates 
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_email_templates_campaign_id ON email_templates(campaign_id) WHERE campaign_id IS NOT NULL;

    COMMENT ON COLUMN email_templates.campaign_id IS 'Campaign this template belongs to. Users see templates from all campaigns they are members of.';
  END IF;

  -- ============================================
  -- 2. Add campaign_id to sms_templates
  -- ============================================
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_templates') THEN
    ALTER TABLE sms_templates 
    ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_sms_templates_campaign_id ON sms_templates(campaign_id) WHERE campaign_id IS NOT NULL;

    COMMENT ON COLUMN sms_templates.campaign_id IS 'Campaign this template belongs to. Users see templates from all campaigns they are members of.';
  END IF;
END $$;

-- ============================================
-- 3. Migrate existing templates to Default Campaign
-- ============================================
DO $$
DECLARE
  org_record RECORD;
  default_campaign_id UUID;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_templates')
     AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_templates')
     AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    FOR org_record IN SELECT id FROM organizations LOOP
      -- Get or create the default campaign for this organization
      SELECT id INTO default_campaign_id
      FROM campaigns
      WHERE organization_id = org_record.id AND name = 'Default Campaign'
      LIMIT 1;
      
      -- If default campaign exists, assign existing templates to it
      IF default_campaign_id IS NOT NULL THEN
        -- Update email templates without a campaign
        UPDATE email_templates
        SET campaign_id = default_campaign_id
        WHERE organization_id = org_record.id AND campaign_id IS NULL;
        
        -- Update SMS templates without a campaign
        UPDATE sms_templates
        SET campaign_id = default_campaign_id
        WHERE organization_id = org_record.id AND campaign_id IS NULL;
      END IF;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- 4. Update RLS policies for email_templates
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_templates') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can view org email templates" ON email_templates;
    DROP POLICY IF EXISTS "Team members can view organization email templates" ON email_templates;
    DROP POLICY IF EXISTS "Team members can insert organization email templates" ON email_templates;
    DROP POLICY IF EXISTS "Team members can update organization email templates" ON email_templates;
    DROP POLICY IF EXISTS "Team members can delete organization email templates" ON email_templates;

    -- Create new campaign-based policies for email_templates
    EXECUTE 'CREATE POLICY "Users can view email templates from their campaigns"
      ON email_templates FOR SELECT
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = email_templates.organization_id)
        OR (campaign_id IS NULL AND organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()))
      )';

    EXECUTE 'CREATE POLICY "Users can insert email templates to their campaigns"
      ON email_templates FOR INSERT
      WITH CHECK (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = email_templates.organization_id)
      )';

    EXECUTE 'CREATE POLICY "Users can update email templates in their campaigns"
      ON email_templates FOR UPDATE
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = email_templates.organization_id)
      )';

    EXECUTE 'CREATE POLICY "Users can delete email templates in their campaigns"
      ON email_templates FOR DELETE
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = email_templates.organization_id)
      )';
  END IF;
END $$;

-- ============================================
-- 5. Update RLS policies for sms_templates
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_templates') THEN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Users can view their own templates" ON sms_templates;
    DROP POLICY IF EXISTS "Users can create their own templates" ON sms_templates;
    DROP POLICY IF EXISTS "Users can update their own templates" ON sms_templates;
    DROP POLICY IF EXISTS "Users can delete their own templates" ON sms_templates;

    -- Create new campaign-based policies for sms_templates
    EXECUTE 'CREATE POLICY "Users can view sms templates from their campaigns"
      ON sms_templates FOR SELECT
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = sms_templates.organization_id)
        OR (campaign_id IS NULL AND organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()))
      )';

    EXECUTE 'CREATE POLICY "Users can insert sms templates to their campaigns"
      ON sms_templates FOR INSERT
      WITH CHECK (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = sms_templates.organization_id)
      )';

    EXECUTE 'CREATE POLICY "Users can update sms templates in their campaigns"
      ON sms_templates FOR UPDATE
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = sms_templates.organization_id)
      )';

    EXECUTE 'CREATE POLICY "Users can delete sms templates in their campaigns"
      ON sms_templates FOR DELETE
      USING (
        campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = ''admin'' AND organization_id = sms_templates.organization_id)
      )';
  END IF;
END $$;

-- ============================================
-- 6. Migration Summary
-- ============================================
DO $$
DECLARE
  email_templates_updated INTEGER := 0;
  sms_templates_updated INTEGER := 0;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_templates') THEN
    SELECT COUNT(*) INTO email_templates_updated FROM email_templates WHERE campaign_id IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sms_templates') THEN
    SELECT COUNT(*) INTO sms_templates_updated FROM sms_templates WHERE campaign_id IS NOT NULL;
  END IF;
  
  RAISE NOTICE '=== Campaign-Level Templates Migration Complete ===';
  RAISE NOTICE 'Email templates with campaign_id: %', email_templates_updated;
  RAISE NOTICE 'SMS templates with campaign_id: %', sms_templates_updated;
  RAISE NOTICE 'Migration completed successfully!';
END $$;



