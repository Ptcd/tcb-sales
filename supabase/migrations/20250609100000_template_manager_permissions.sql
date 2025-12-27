-- Template Manager Permissions Migration
-- Restricts template create/update/delete to admins and campaign managers
-- Regular campaign members can still read (SELECT) templates

-- ============================================
-- 1. Update email_templates INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Users can insert email templates to their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can insert email templates"
  ON email_templates FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 2. Update email_templates UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Users can update email templates in their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can update email templates"
  ON email_templates FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 3. Update email_templates DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Users can delete email templates in their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can delete email templates"
  ON email_templates FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 4. Update sms_templates INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Users can insert sms templates to their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can insert sms templates"
  ON sms_templates FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 5. Update sms_templates UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Users can update sms templates in their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can update sms templates"
  ON sms_templates FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 6. Update sms_templates DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Users can delete sms templates in their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can delete sms templates"
  ON sms_templates FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 7. Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Template Manager Permissions Migration Complete ===';
  RAISE NOTICE 'Template INSERT/UPDATE/DELETE now restricted to:';
  RAISE NOTICE '  - Organization admins';
  RAISE NOTICE '  - Campaign managers (role=manager in campaign_members)';
  RAISE NOTICE 'Regular campaign members can still SELECT (read/use) templates.';
END $$;



