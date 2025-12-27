-- Badge System and Trial Pipeline Migration
-- Implements deterministic CRM + Dialer + Trial Pipeline system
-- Adds badge_key, trial_pipeline table, ownership locks, and campaign scripts by badge

-- ============================================
-- 1. Add columns to search_results table
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS badge_key TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS owner_sdr_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

-- Add constraint for badge_key values (after backfill)
-- Note: We'll add the CHECK constraint after ensuring all existing rows have valid badge_key values
-- For now, we'll rely on application-level validation

-- Comments
COMMENT ON COLUMN search_results.badge_key IS 'Badge key: new, recycle_cold, follow_up_scheduled, recycle_not_interested, trial_awaiting_activation, trial_activated, trial_configured, trial_embed_copied, trial_live_first_lead, trial_stalled, converted_recent, dnc, invalid_contact';
COMMENT ON COLUMN search_results.do_not_contact IS 'Hard no - removes lead from all queues permanently';
COMMENT ON COLUMN search_results.owner_sdr_id IS 'Locked owner - only admins can reassign after first assignment';
COMMENT ON COLUMN search_results.next_follow_up_at IS 'When the next action should be taken (replaces next_action_at for clarity)';

-- ============================================
-- 2. Create trial_pipeline table
-- ============================================
CREATE TABLE IF NOT EXISTS trial_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID UNIQUE NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  owner_sdr_id UUID REFERENCES auth.users(id),
  jcc_user_id TEXT, -- JCC user_id from webhook (may be UUID or string)
  
  -- Timestamps (set by JCC events)
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  password_set_at TIMESTAMPTZ,
  first_login_at TIMESTAMPTZ,
  calculator_modified_at TIMESTAMPTZ,
  embed_snippet_copied_at TIMESTAMPTZ,
  first_lead_received_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  
  -- Conversion data
  install_url TEXT,
  plan TEXT,
  mrr NUMERIC(10,2),
  
  -- Tracking
  last_event_at TIMESTAMPTZ DEFAULT NOW(),
  bonus_state TEXT DEFAULT 'none' CHECK (bonus_state IN ('none', 'pending', 'paid')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE trial_pipeline IS 'Snapshot table tracking trial lifecycle from JCC events';
COMMENT ON COLUMN trial_pipeline.crm_lead_id IS 'Links to search_results (lead)';
COMMENT ON COLUMN trial_pipeline.owner_sdr_id IS 'SDR who owns this trial (for attribution)';
COMMENT ON COLUMN trial_pipeline.jcc_user_id IS 'JCC user_id from webhook';
COMMENT ON COLUMN trial_pipeline.bonus_state IS 'Bonus attribution state: none, pending, paid';

-- ============================================
-- 3. Add badge_key to call_scripts table
-- ============================================
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS badge_key TEXT;

-- Unique constraint: one script per campaign+badge combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_scripts_campaign_badge 
  ON call_scripts(campaign_id, badge_key) 
  WHERE badge_key IS NOT NULL;

COMMENT ON COLUMN call_scripts.badge_key IS 'Badge key for badge-specific scripts (NULL = campaign default)';

-- ============================================
-- 4. Ownership lock trigger
-- ============================================
-- Prevent non-admins from changing owner_sdr_id once set
CREATE OR REPLACE FUNCTION lock_owner_sdr_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If owner was already set and is being changed
  IF OLD.owner_sdr_id IS NOT NULL 
     AND NEW.owner_sdr_id IS DISTINCT FROM OLD.owner_sdr_id THEN
    -- Check if current user is admin
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only admins can reassign lead ownership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_lock_owner ON search_results;

-- Create trigger
CREATE TRIGGER trigger_lock_owner
  BEFORE UPDATE ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION lock_owner_sdr_id();

-- ============================================
-- 5. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sr_badge ON search_results(badge_key);
CREATE INDEX IF NOT EXISTS idx_sr_followup ON search_results(next_follow_up_at) 
  WHERE next_follow_up_at IS NOT NULL AND do_not_contact = FALSE;
CREATE INDEX IF NOT EXISTS idx_sr_owner ON search_results(owner_sdr_id);
CREATE INDEX IF NOT EXISTS idx_sr_dnc ON search_results(do_not_contact) 
  WHERE do_not_contact = TRUE;

CREATE INDEX IF NOT EXISTS idx_tp_owner ON trial_pipeline(owner_sdr_id);
CREATE INDEX IF NOT EXISTS idx_tp_jcc_user ON trial_pipeline(jcc_user_id);
CREATE INDEX IF NOT EXISTS idx_tp_crm_lead ON trial_pipeline(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_tp_converted ON trial_pipeline(converted_at) 
  WHERE converted_at IS NOT NULL;

-- ============================================
-- 6. Row Level Security for trial_pipeline
-- ============================================
ALTER TABLE trial_pipeline ENABLE ROW LEVEL SECURITY;

-- SDRs can view their own trials
CREATE POLICY "SDRs can view their own trials"
  ON trial_pipeline FOR SELECT
  USING (
    owner_sdr_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can manage all (for webhooks)
CREATE POLICY "Service role can manage trial pipeline"
  ON trial_pipeline FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================
-- 7. Backfill existing data
-- ============================================
-- Set badge_key based on existing lead_status
UPDATE search_results
SET badge_key = CASE
  WHEN lead_status = 'new' THEN 'new'
  WHEN lead_status = 'contacted' THEN 'recycle_cold'
  WHEN lead_status = 'interested' THEN 'follow_up_scheduled'
  WHEN lead_status = 'trial_started' THEN 'trial_awaiting_activation'
  WHEN lead_status = 'follow_up' THEN 'follow_up_scheduled'
  WHEN lead_status = 'closed_won' THEN 'converted_recent'
  WHEN lead_status = 'closed_lost' THEN 'recycle_not_interested'
  WHEN lead_status = 'not_interested' THEN 'recycle_not_interested'
  WHEN lead_status = 'converted' THEN 'converted_recent'
  ELSE 'new'
END
WHERE badge_key IS NULL OR badge_key = 'new';

-- Set owner_sdr_id from assigned_to if not set
UPDATE search_results
SET owner_sdr_id = assigned_to
WHERE owner_sdr_id IS NULL AND assigned_to IS NOT NULL;

-- Set next_follow_up_at from next_action_at if exists
UPDATE search_results
SET next_follow_up_at = next_action_at
WHERE next_follow_up_at IS NULL AND next_action_at IS NOT NULL;

-- ============================================
-- 9. BACKFILL: Set follow-ups for existing leads without one
-- ============================================
-- Cadence rules:
-- new → NOW (show immediately)
-- recycle_cold → +30 days from last contact
-- follow_up_scheduled → +7 days from last contact
-- trial badges → +3 days from last contact
-- recycle_not_interested → +90 days from last contact
-- converted/dnc/invalid → no follow-up

UPDATE search_results
SET next_follow_up_at = CASE
  WHEN badge_key = 'new' THEN NOW()
  WHEN badge_key = 'recycle_cold' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '30 days'
  WHEN badge_key = 'follow_up_scheduled' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '7 days'
  WHEN badge_key IN ('trial_awaiting_activation', 'trial_activated', 
    'trial_configured', 'trial_embed_copied', 'trial_live_first_lead') THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '3 days'
  WHEN badge_key = 'trial_stalled' THEN NOW() + INTERVAL '1 day'
  WHEN badge_key = 'recycle_not_interested' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '90 days'
  ELSE NULL
END
WHERE next_follow_up_at IS NULL
  AND do_not_contact = FALSE
  AND badge_key NOT IN ('converted_recent', 'dnc', 'invalid_contact');

-- Normalize follow-up times to 9 AM
UPDATE search_results
SET next_follow_up_at = DATE_TRUNC('day', next_follow_up_at) + INTERVAL '9 hours'
WHERE next_follow_up_at IS NOT NULL;

-- ============================================
-- 8. Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Badge System and Trial Pipeline Migration Complete ===';
  RAISE NOTICE 'Added to search_results: badge_key, do_not_contact, owner_sdr_id, next_follow_up_at';
  RAISE NOTICE 'Created trial_pipeline table with full lifecycle tracking';
  RAISE NOTICE 'Added badge_key to call_scripts for badge-specific scripts';
  RAISE NOTICE 'Created ownership lock trigger (only admins can reassign)';
  RAISE NOTICE 'Created indexes for performance';
  RAISE NOTICE 'Backfilled existing data with badge_key mappings';
END $$;

