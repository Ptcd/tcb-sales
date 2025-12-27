-- Add new goal columns to campaign_goals
ALTER TABLE campaign_goals 
ADD COLUMN IF NOT EXISTS weekly_proven_installs_goal INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS weekly_sdr_hours_goal NUMERIC(6,2) DEFAULT 40;

COMMENT ON COLUMN campaign_goals.weekly_proven_installs_goal IS 
  'Target proven installs (credits < 20) per week';
COMMENT ON COLUMN campaign_goals.weekly_sdr_hours_goal IS 
  'Target SDR hours per week for this campaign';

