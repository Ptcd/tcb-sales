-- Complete Sales Autodialer & CRM Schema Migration
-- This migration implements the full data model from the master plan
-- Phase 1: Complete multi-user CRM core with roles, ownership, and activity logs

-- ============================================
-- 1. Extend user_profiles with phone_number
-- ============================================
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

COMMENT ON COLUMN user_profiles.phone_number IS 'Phone number for agent callback / Twilio routing';

-- ============================================
-- 2. Update search_results with missing CRM fields
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'google_maps' CHECK (lead_source IN ('google_maps', 'manual', 'import')),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS do_not_text BOOLEAN DEFAULT FALSE;

-- Set default lead_status if not set
UPDATE search_results 
SET lead_status = 'new' 
WHERE lead_status IS NULL OR lead_status = '';

-- Ensure lead_status has a default constraint
ALTER TABLE search_results
ALTER COLUMN lead_status SET DEFAULT 'new';

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_search_results_lead_source ON search_results(lead_source);
CREATE INDEX IF NOT EXISTS idx_search_results_created_by ON search_results(created_by);
CREATE INDEX IF NOT EXISTS idx_search_results_assigned_to ON search_results(assigned_to);
CREATE INDEX IF NOT EXISTS idx_search_results_lead_status ON search_results(lead_status);
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_call ON search_results(do_not_call) WHERE do_not_call = TRUE;
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_email ON search_results(do_not_email) WHERE do_not_email = TRUE;
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_text ON search_results(do_not_text) WHERE do_not_text = TRUE;

COMMENT ON COLUMN search_results.lead_source IS 'Source of the lead: google_maps, manual, or import';
COMMENT ON COLUMN search_results.created_by IS 'User who first created/imported this lead';
COMMENT ON COLUMN search_results.do_not_call IS 'Flag to prevent calling this lead';
COMMENT ON COLUMN search_results.do_not_email IS 'Flag to prevent emailing this lead';
COMMENT ON COLUMN search_results.do_not_text IS 'Flag to prevent texting this lead';

-- ============================================
-- 3. Update search_history with organization_id
-- ============================================
ALTER TABLE search_history
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_search_history_organization_id ON search_history(organization_id);

-- Backfill organization_id from user_profiles
UPDATE search_history sh
SET organization_id = up.organization_id
FROM user_profiles up
WHERE sh.user_id = up.id
  AND sh.organization_id IS NULL
  AND up.organization_id IS NOT NULL;

COMMENT ON COLUMN search_history.organization_id IS 'Organization that owns this search';

-- ============================================
-- 4. Update calls table with organization_id and improve structure
-- ============================================
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
ADD COLUMN IF NOT EXISTS disposition TEXT;

-- Backfill organization_id from search_results
UPDATE calls c
SET organization_id = sr.organization_id
FROM search_results sr
WHERE c.lead_id = sr.id
  AND c.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_organization_id ON calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);

COMMENT ON COLUMN calls.organization_id IS 'Organization that owns this call';
COMMENT ON COLUMN calls.direction IS 'Call direction: outbound or inbound';
COMMENT ON COLUMN calls.disposition IS 'Call disposition/outcome notes';

-- ============================================
-- 5. Create organization_settings table
-- ============================================
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  enable_email_scraping BOOLEAN DEFAULT TRUE,
  enable_email_outreach BOOLEAN DEFAULT TRUE,
  default_lead_assignment_mode TEXT DEFAULT 'manual' CHECK (default_lead_assignment_mode IN ('manual', 'round_robin')),
  max_leads_per_search INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(organization_id);

-- Create default settings for existing organizations
INSERT INTO organization_settings (organization_id, enable_email_scraping, enable_email_outreach, default_lead_assignment_mode, max_leads_per_search)
SELECT id, TRUE, TRUE, 'manual', 200
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM organization_settings);

COMMENT ON TABLE organization_settings IS 'Organization-wide feature toggles and configuration';
COMMENT ON COLUMN organization_settings.enable_email_scraping IS 'Whether email scraping is enabled for this organization';
COMMENT ON COLUMN organization_settings.enable_email_outreach IS 'Whether email outreach features are enabled';
COMMENT ON COLUMN organization_settings.default_lead_assignment_mode IS 'How new leads are assigned: manual or round_robin';
COMMENT ON COLUMN organization_settings.max_leads_per_search IS 'Maximum leads per Google Maps search (safety cap)';

-- ============================================
-- 6. Create user_settings table
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_dial_enabled BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

COMMENT ON TABLE user_settings IS 'User-specific preferences and settings';
COMMENT ON COLUMN user_settings.auto_dial_enabled IS 'Whether automated dialing workflows are enabled for this user';
COMMENT ON COLUMN user_settings.timezone IS 'User timezone for scheduling and display';

-- ============================================
-- 7. Update lead_notes with organization_id
-- ============================================
ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from search_results
UPDATE lead_notes ln
SET organization_id = sr.organization_id
FROM search_results sr
WHERE ln.lead_id = sr.id
  AND ln.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_notes_organization_id ON lead_notes(organization_id);

-- Rename user_id to author_id for clarity (if needed, but keeping user_id for now to avoid breaking changes)
-- ALTER TABLE lead_notes RENAME COLUMN user_id TO author_id;

-- ============================================
-- 8. Ensure lead_activities has organization_id
-- ============================================
-- Already added in team_system migration, but ensure it exists
ALTER TABLE lead_activities
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill if missing
UPDATE lead_activities la
SET organization_id = sr.organization_id
FROM search_results sr
WHERE la.lead_id = sr.id
  AND la.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

-- ============================================
-- 9. Update SMS messages table (if exists) with proper structure
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_messages') THEN
    -- Add missing fields if they don't exist
    ALTER TABLE sms_messages
    ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_id ON sms_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
  END IF;
END $$;

-- ============================================
-- 10. Update email_messages with proper structure
-- ============================================
-- organization_id already added in team_system migration
-- Ensure proper indexes
CREATE INDEX IF NOT EXISTS idx_email_messages_organization_id ON email_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider_id ON email_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ============================================
-- 11. Create status_change_logs table (optional but recommended)
-- ============================================
CREATE TABLE IF NOT EXISTS status_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_change_logs_lead_id ON status_change_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_organization_id ON status_change_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_changed_by ON status_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_created_at ON status_change_logs(created_at DESC);

COMMENT ON TABLE status_change_logs IS 'Audit log of lead status changes for reporting and history';

-- ============================================
-- 12. Create function to log status changes
-- ============================================
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
    INSERT INTO status_change_logs (lead_id, organization_id, changed_by, old_status, new_status)
    VALUES (
      NEW.id,
      NEW.organization_id,
      COALESCE(NEW.assigned_to, auth.uid()),
      OLD.lead_status,
      NEW.lead_status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_status_change ON search_results;
CREATE TRIGGER trigger_log_status_change
  AFTER UPDATE OF lead_status ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION log_lead_status_change();

-- ============================================
-- 13. Update RLS Policies for new structure
-- ============================================

-- Organization settings policies
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization settings"
  ON organization_settings FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can update their organization settings"
  ON organization_settings FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert organization settings"
  ON organization_settings FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- User settings policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Status change logs policies
ALTER TABLE status_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view organization status change logs"
  ON status_change_logs FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Update calls RLS to be organization-based
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
DROP POLICY IF EXISTS "Users can create calls for their leads" ON calls;
DROP POLICY IF EXISTS "Users can update their own calls" ON calls;
DROP POLICY IF EXISTS "Users can delete their own calls" ON calls;

-- Reps can only see calls for their assigned leads
CREATE POLICY "Reps can view calls for their assigned leads"
  ON calls FOR SELECT
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps see calls for their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       lead_id IN (SELECT id FROM search_results WHERE assigned_to = auth.uid()))
      OR
      -- Admins see all org calls
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can create calls for their assigned leads"
  ON calls FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid() AND
    (
      -- Reps can only call their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       lead_id IN (SELECT id FROM search_results WHERE assigned_to = auth.uid() AND do_not_call = FALSE))
      OR
      -- Admins can call any org lead
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can update their own calls"
  ON calls FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  );

CREATE POLICY "Reps can delete their own calls"
  ON calls FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  );

-- Update search_results RLS to enforce assignment rules
-- Reps can only see/edit their assigned leads (plus unassigned if you want shared pool)
DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;

-- Reps see only their assigned leads (or unassigned if you want a shared pool)
CREATE POLICY "Reps can view their assigned leads"
  ON search_results FOR SELECT
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps see their assigned leads or unassigned leads (shared pool)
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       (assigned_to = auth.uid() OR assigned_to IS NULL))
      OR
      -- Admins see all org leads
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Team members can insert organization leads"
  ON search_results FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Reps can update their assigned leads"
  ON search_results FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps can update their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      -- Admins can update any org lead
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    (
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can delete their assigned leads"
  ON search_results FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    (
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- 14. Add updated_at triggers
-- ============================================
DROP TRIGGER IF EXISTS update_organization_settings_updated_at ON organization_settings;
CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 15. Helper function to check if user is admin
-- ============================================
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

COMMENT ON FUNCTION is_user_admin IS 'Check if the current user is an admin';

-- ============================================
-- 16. Helper function to get user role
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

COMMENT ON FUNCTION get_user_role IS 'Get the role of the current user (admin or member)';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
DECLARE
  total_orgs INTEGER;
  total_users INTEGER;
  total_leads INTEGER;
  orgs_with_settings INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orgs FROM organizations;
  SELECT COUNT(*) INTO total_users FROM user_profiles;
  SELECT COUNT(*) INTO total_leads FROM search_results;
  SELECT COUNT(*) INTO orgs_with_settings FROM organization_settings;
  
  RAISE NOTICE '=== Sales Autodialer Schema Migration Complete ===';
  RAISE NOTICE 'Organizations: %', total_orgs;
  RAISE NOTICE 'Users: %', total_users;
  RAISE NOTICE 'Leads: %', total_leads;
  RAISE NOTICE 'Organizations with settings: %', orgs_with_settings;
  RAISE NOTICE 'Migration completed successfully!';
END $$;

