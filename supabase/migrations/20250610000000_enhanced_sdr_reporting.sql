-- Enhanced SDR Reporting Schema Migration
-- Adds campaign goals and CTA tracking for comprehensive SDR performance reporting

-- ============================================
-- 1. Create outcome_code enum type
-- ============================================
DO $$ BEGIN
  CREATE TYPE call_outcome_code AS ENUM (
    'NO_ANSWER',
    'BUSY',
    'WRONG_NUMBER',
    'NOT_INTERESTED',
    'INTERESTED_INFO_SENT',
    'TRIAL_STARTED',
    'CALLBACK_SCHEDULED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. Create cta_result enum type
-- ============================================
DO $$ BEGIN
  CREATE TYPE cta_result_type AS ENUM (
    'NOT_OFFERED',
    'ACCEPTED',
    'DECLINED',
    'OTHER_TOOL',
    'NEEDS_MANAGER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 3. Add CTA tracking columns to calls table
-- ============================================
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS outcome_code call_outcome_code,
ADD COLUMN IF NOT EXISTS cta_attempted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cta_result cta_result_type DEFAULT 'NOT_OFFERED',
ADD COLUMN IF NOT EXISTS cta_sent_via_sms BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cta_sent_via_email BOOLEAN DEFAULT FALSE;

-- Add index for outcome reporting
CREATE INDEX IF NOT EXISTS idx_calls_outcome_code ON calls(outcome_code);
CREATE INDEX IF NOT EXISTS idx_calls_cta_attempted ON calls(cta_attempted) WHERE cta_attempted = TRUE;

-- ============================================
-- 4. Create campaign_goals table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Per-hour targets
  target_dials_per_hour NUMERIC(5,2) DEFAULT 50,
  target_conversations_per_hour NUMERIC(5,2) DEFAULT 5,
  target_cta_attempts_per_hour NUMERIC(5,2) DEFAULT 3,
  target_cta_acceptances_per_hour NUMERIC(5,2) DEFAULT 1.5,
  target_trials_per_hour NUMERIC(5,2) DEFAULT 0.5,
  
  -- Weekly targets
  weekly_dials_goal INTEGER DEFAULT 500,
  weekly_trials_goal INTEGER DEFAULT 10,
  
  -- Conversion targets
  min_conversation_rate_pct NUMERIC(5,2) DEFAULT 10, -- % of dials that become conversations
  min_trials_per_conversation_pct NUMERIC(5,2) DEFAULT 10, -- % of conversations that become trials
  
  -- Call quality targets
  target_avg_call_duration_seconds INTEGER DEFAULT 120,
  
  -- Metadata
  effective_start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one active goal set per campaign
  UNIQUE(campaign_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign_id ON campaign_goals(campaign_id);

-- Comments
COMMENT ON TABLE campaign_goals IS 'Per-campaign performance targets for SDR benchmarking';
COMMENT ON COLUMN campaign_goals.target_dials_per_hour IS 'Expected dials per paid hour (typically 40-60)';
COMMENT ON COLUMN campaign_goals.target_conversations_per_hour IS 'Expected conversations (30s+) per hour (typically 4-6)';
COMMENT ON COLUMN campaign_goals.target_cta_attempts_per_hour IS 'Expected CTA offers per hour (typically 3-4)';
COMMENT ON COLUMN campaign_goals.target_trials_per_hour IS 'Expected trials started per hour (typically 0.25-0.75)';
COMMENT ON COLUMN campaign_goals.min_conversation_rate_pct IS 'Minimum acceptable % of dials that become conversations';
COMMENT ON COLUMN campaign_goals.min_trials_per_conversation_pct IS 'Minimum acceptable % of conversations that convert to trials';

-- ============================================
-- 5. RLS Policies for campaign_goals
-- ============================================
ALTER TABLE campaign_goals ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with campaign goals
CREATE POLICY "Admins can manage campaign goals"
  ON campaign_goals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN campaigns c ON c.organization_id = up.organization_id
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
      AND c.id = campaign_goals.campaign_id
    )
  );

-- Campaign managers can view goals
CREATE POLICY "Campaign managers can view goals"
  ON campaign_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = campaign_goals.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'manager'
    )
  );

-- All campaign members can view goals (for their dashboard)
CREATE POLICY "Campaign members can view goals"
  ON campaign_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = campaign_goals.campaign_id
      AND cm.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. Updated_at trigger for campaign_goals
-- ============================================
DROP TRIGGER IF EXISTS update_campaign_goals_updated_at ON campaign_goals;
CREATE TRIGGER update_campaign_goals_updated_at
  BEFORE UPDATE ON campaign_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Extend daily_sdr_summaries with CTA metrics
-- ============================================
ALTER TABLE daily_sdr_summaries
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
ADD COLUMN IF NOT EXISTS cta_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cta_acceptances INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS outcome_distribution JSONB DEFAULT '{}';

-- Index for campaign-specific queries
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_campaign 
  ON daily_sdr_summaries(campaign_id, date DESC);

-- ============================================
-- 8. Extend weekly_sdr_summaries with CTA metrics
-- ============================================
ALTER TABLE weekly_sdr_summaries
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
ADD COLUMN IF NOT EXISTS cta_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cta_acceptances INTEGER DEFAULT 0;

-- Index for campaign-specific queries
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_campaign 
  ON weekly_sdr_summaries(campaign_id, week_start DESC);

-- ============================================
-- 9. Helper function to map old outcomes to new codes
-- ============================================
CREATE OR REPLACE FUNCTION map_outcome_to_code(old_outcome TEXT)
RETURNS call_outcome_code AS $$
BEGIN
  RETURN CASE old_outcome
    WHEN 'no_answer' THEN 'NO_ANSWER'::call_outcome_code
    WHEN 'busy' THEN 'BUSY'::call_outcome_code
    WHEN 'wrong_number' THEN 'WRONG_NUMBER'::call_outcome_code
    WHEN 'not_interested' THEN 'NOT_INTERESTED'::call_outcome_code
    WHEN 'interested' THEN 'INTERESTED_INFO_SENT'::call_outcome_code
    WHEN 'callback_requested' THEN 'CALLBACK_SCHEDULED'::call_outcome_code
    WHEN 'do_not_call' THEN 'NOT_INTERESTED'::call_outcome_code
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 10. Backfill outcome_code from existing outcome field
-- ============================================
UPDATE calls
SET outcome_code = map_outcome_to_code(outcome)
WHERE outcome IS NOT NULL AND outcome_code IS NULL;

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Enhanced SDR Reporting Migration Complete ===';
  RAISE NOTICE 'Created: call_outcome_code enum, cta_result_type enum';
  RAISE NOTICE 'Added CTA tracking columns to calls table';
  RAISE NOTICE 'Created campaign_goals table with RLS policies';
  RAISE NOTICE 'Extended daily/weekly summaries with campaign_id and CTA metrics';
END $$;



