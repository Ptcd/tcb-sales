-- Simplified SDR Goals Migration
-- Remove old goal columns and add rate-based goals (per 40 hours worked)

-- Drop old columns that are no longer needed
ALTER TABLE campaign_goals 
  DROP COLUMN IF EXISTS weekly_dials_goal,
  DROP COLUMN IF EXISTS weekly_trials_goal,
  DROP COLUMN IF EXISTS target_dials_per_hour,
  DROP COLUMN IF EXISTS target_trials_per_hour,
  DROP COLUMN IF EXISTS target_cta_attempts_per_hour,
  DROP COLUMN IF EXISTS target_cta_acceptances_per_hour,
  DROP COLUMN IF EXISTS min_conversation_rate_pct,
  DROP COLUMN IF EXISTS min_trials_per_conversation_pct;

-- Add rate-based goal columns (per 40 hours worked)
ALTER TABLE campaign_goals 
  ADD COLUMN IF NOT EXISTS proven_installs_per_40h INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS scheduled_appts_per_40h INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS conversations_per_40h INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS target_weekly_hours INTEGER DEFAULT 40;

-- Update comments
COMMENT ON COLUMN campaign_goals.proven_installs_per_40h IS 'Target proven installs (credits < 20) per 40 hours worked';
COMMENT ON COLUMN campaign_goals.scheduled_appts_per_40h IS 'Target scheduled install appointments per 40 hours worked';
COMMENT ON COLUMN campaign_goals.conversations_per_40h IS 'Target conversations per 40 hours worked';
COMMENT ON COLUMN campaign_goals.target_weekly_hours IS 'Baseline hours for rate calculations (default 40)';

