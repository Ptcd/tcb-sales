-- Client Status and Lead Notifications Migration
-- Part of the CRM Event Sync system for Junk Car Calculator campaign

-- ============================================
-- 1. Add client status fields to search_results
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS client_status TEXT NULL 
  CHECK (client_status IN ('none', 'trialing', 'trial_qualified', 'credits_low', 'trial_expiring', 'paid')),
ADD COLUMN IF NOT EXISTS client_credits_left INTEGER NULL,
ADD COLUMN IF NOT EXISTS client_plan TEXT NULL,
ADD COLUMN IF NOT EXISTS client_trial_ends_at TIMESTAMPTZ NULL;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_search_results_client_status 
  ON search_results(client_status) WHERE client_status IS NOT NULL;

COMMENT ON COLUMN search_results.client_status IS 'Client lifecycle status from Control Tower: none, trialing, trial_qualified, credits_low, trial_expiring, paid';
COMMENT ON COLUMN search_results.client_credits_left IS 'Remaining credits for the client (from Control Tower)';
COMMENT ON COLUMN search_results.client_plan IS 'Client subscription plan name';
COMMENT ON COLUMN search_results.client_trial_ends_at IS 'When the client trial period ends';

-- ============================================
-- 2. Create lead_notifications table
-- ============================================
CREATE TABLE IF NOT EXISTS lead_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_notifications_lead_id 
  ON lead_notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_sdr_user_id 
  ON lead_notifications(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_read 
  ON lead_notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_lead_notifications_created_at 
  ON lead_notifications(created_at DESC);

COMMENT ON TABLE lead_notifications IS 'Notifications for SDRs about client lifecycle events from Control Tower';
COMMENT ON COLUMN lead_notifications.event_type IS 'Type of event: trial_started, trial_qualified, credits_low, trial_expiring, paid_subscribed';
COMMENT ON COLUMN lead_notifications.payload IS 'Additional event data as JSON';
COMMENT ON COLUMN lead_notifications.read IS 'Whether the SDR has viewed this notification';

-- ============================================
-- 3. Row Level Security for lead_notifications
-- ============================================
ALTER TABLE lead_notifications ENABLE ROW LEVEL SECURITY;

-- SDRs can view their own notifications
CREATE POLICY "SDRs can view their own notifications"
  ON lead_notifications FOR SELECT
  USING (sdr_user_id = auth.uid());

-- SDRs can update (mark as read) their own notifications
CREATE POLICY "SDRs can update their own notifications"
  ON lead_notifications FOR UPDATE
  USING (sdr_user_id = auth.uid())
  WITH CHECK (sdr_user_id = auth.uid());

-- Service role can insert notifications (for sync job)
CREATE POLICY "Service role can insert notifications"
  ON lead_notifications FOR INSERT
  WITH CHECK (TRUE);

-- Admins can view all notifications in their org
CREATE POLICY "Admins can view all org notifications"
  ON lead_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role = 'admin'
      AND organization_id = (
        SELECT organization_id FROM user_profiles WHERE id = lead_notifications.sdr_user_id
      )
    )
  );

-- ============================================
-- 4. Create sdr_client_links table (Control Tower shared table)
-- ============================================
-- This table links Control Tower user_id to CRM lead_id and SDR
CREATE TABLE IF NOT EXISTS sdr_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Control Tower profiles.user_id
  crm_lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, crm_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_sdr_client_links_user_id 
  ON sdr_client_links(user_id);
CREATE INDEX IF NOT EXISTS idx_sdr_client_links_crm_lead_id 
  ON sdr_client_links(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_client_links_sdr_user_id 
  ON sdr_client_links(sdr_user_id);

COMMENT ON TABLE sdr_client_links IS 'Links Control Tower user_id to CRM leads and SDRs for event routing';

-- RLS for sdr_client_links
ALTER TABLE sdr_client_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own client links"
  ON sdr_client_links FOR SELECT
  USING (sdr_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can manage client links"
  ON sdr_client_links FOR ALL
  WITH CHECK (TRUE);

-- ============================================
-- 5. Create client_events table (Control Tower shared table)
-- ============================================
-- This table stores lifecycle events from Control Tower
CREATE TABLE IF NOT EXISTS client_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Control Tower profiles.user_id
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_events_user_id 
  ON client_events(user_id);
CREATE INDEX IF NOT EXISTS idx_client_events_processed 
  ON client_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_client_events_event_type 
  ON client_events(event_type);
CREATE INDEX IF NOT EXISTS idx_client_events_created_at 
  ON client_events(created_at DESC);

COMMENT ON TABLE client_events IS 'Lifecycle events from Control Tower (trial_started, credits_low, paid_subscribed, etc.)';
COMMENT ON COLUMN client_events.processed IS 'Whether the CRM has processed this event';

-- RLS for client_events
ALTER TABLE client_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage client events"
  ON client_events FOR ALL
  WITH CHECK (TRUE);

CREATE POLICY "Admins can view client events"
  ON client_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- 6. Ensure Junk Car Calculator campaign exists
-- ============================================
DO $$
DECLARE
  org_id UUID;
  jcc_campaign_id UUID;
BEGIN
  -- Get first organization (or create default logic)
  SELECT id INTO org_id FROM organizations LIMIT 1;
  
  IF org_id IS NOT NULL THEN
    -- Check if Junk Car Calculator campaign exists
    SELECT id INTO jcc_campaign_id 
    FROM campaigns 
    WHERE name = 'Junk Car Calculator' AND organization_id = org_id;
    
    -- Create if doesn't exist
    IF jcc_campaign_id IS NULL THEN
      INSERT INTO campaigns (organization_id, name, description, status)
      VALUES (
        org_id, 
        'Junk Car Calculator', 
        'Leads and SDR tracking for the Junk Car Calculator product',
        'active'
      );
      RAISE NOTICE 'Created Junk Car Calculator campaign for organization %', org_id;
    ELSE
      RAISE NOTICE 'Junk Car Calculator campaign already exists: %', jcc_campaign_id;
    END IF;
  END IF;
END $$;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Client Status & Notifications Migration Complete ===';
  RAISE NOTICE 'Added client_status, client_credits_left, client_plan, client_trial_ends_at to search_results';
  RAISE NOTICE 'Created lead_notifications table';
  RAISE NOTICE 'Created sdr_client_links table';
  RAISE NOTICE 'Created client_events table';
  RAISE NOTICE 'Ensured Junk Car Calculator campaign exists';
END $$;

