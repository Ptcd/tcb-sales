-- =============================================
-- CAMPAIGN BONUS RULES MIGRATION
-- =============================================

-- 1. Add bonus_rules column to campaigns table
ALTER TABLE campaigns 
  ADD COLUMN IF NOT EXISTS bonus_rules JSONB DEFAULT '[]';

COMMENT ON COLUMN campaigns.bonus_rules IS 'Array of bonus rules: [{trigger, sdr_amount, activator_amount}]';

-- 2. Allow bonus_events without experiment (for campaign-level bonuses)
ALTER TABLE bonus_events 
  ALTER COLUMN experiment_id DROP NOT NULL;

-- 3. Add campaign_id to bonus_events for direct campaign bonuses
ALTER TABLE bonus_events
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- 4. Add jcc_user_id to bonus_events to prevent duplicate bonuses
ALTER TABLE bonus_events
  ADD COLUMN IF NOT EXISTS jcc_user_id TEXT;

-- 5. Create unique index to prevent duplicate proven_install bonuses per JCC user
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_events_jcc_user_type 
  ON bonus_events(jcc_user_id, team_member_id, event_type) 
  WHERE jcc_user_id IS NOT NULL;

