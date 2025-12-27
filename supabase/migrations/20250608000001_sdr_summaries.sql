-- SDR Daily and Weekly Summaries Migration
-- Part of the SDR Reporting System

-- ============================================
-- 1. Create daily_sdr_summaries table
-- ============================================
CREATE TABLE IF NOT EXISTS daily_sdr_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  paid_hours NUMERIC(10, 2) DEFAULT 0,
  active_hours NUMERIC(10, 2) DEFAULT 0,
  efficiency NUMERIC(5, 2) DEFAULT 0, -- percentage
  total_dials INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0, -- calls >= 30 seconds
  trials_started INTEGER DEFAULT 0, -- JCC specific
  paid_signups_week_to_date INTEGER DEFAULT 0, -- JCC specific
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sdr_user_id, date)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_sdr_user_id 
  ON daily_sdr_summaries(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_date 
  ON daily_sdr_summaries(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_sdr_date 
  ON daily_sdr_summaries(sdr_user_id, date DESC);

COMMENT ON TABLE daily_sdr_summaries IS 'Daily performance summaries for SDRs';
COMMENT ON COLUMN daily_sdr_summaries.paid_hours IS 'Total paid hours calculated from call sessions';
COMMENT ON COLUMN daily_sdr_summaries.active_hours IS 'Total time actually on calls';
COMMENT ON COLUMN daily_sdr_summaries.efficiency IS 'Percentage of paid hours spent on calls (active_hours / paid_hours * 100)';
COMMENT ON COLUMN daily_sdr_summaries.conversations IS 'Calls with duration >= 30 seconds';
COMMENT ON COLUMN daily_sdr_summaries.trials_started IS 'JCC leads that started trials that day';
COMMENT ON COLUMN daily_sdr_summaries.paid_signups_week_to_date IS 'JCC paid signups from Monday to this date';

-- ============================================
-- 2. Create weekly_sdr_summaries table
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_sdr_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the week
  week_end DATE NOT NULL, -- Friday of the week
  paid_hours NUMERIC(10, 2) DEFAULT 0,
  active_hours NUMERIC(10, 2) DEFAULT 0,
  average_efficiency NUMERIC(5, 2) DEFAULT 0, -- time-weighted average percentage
  total_dials INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  trials_started INTEGER DEFAULT 0, -- JCC specific
  paid_signups INTEGER DEFAULT 0, -- JCC specific
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sdr_user_id, week_start, week_end)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_sdr_user_id 
  ON weekly_sdr_summaries(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_week_start 
  ON weekly_sdr_summaries(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_sdr_week 
  ON weekly_sdr_summaries(sdr_user_id, week_start DESC);

COMMENT ON TABLE weekly_sdr_summaries IS 'Weekly performance summaries for SDRs (Monday-Friday)';
COMMENT ON COLUMN weekly_sdr_summaries.week_start IS 'Monday of the week';
COMMENT ON COLUMN weekly_sdr_summaries.week_end IS 'Friday of the week';
COMMENT ON COLUMN weekly_sdr_summaries.average_efficiency IS 'Time-weighted average efficiency for the week';
COMMENT ON COLUMN weekly_sdr_summaries.trials_started IS 'JCC leads that started trials during the week';
COMMENT ON COLUMN weekly_sdr_summaries.paid_signups IS 'JCC paid signups during the week';

-- ============================================
-- 3. Row Level Security
-- ============================================

-- Daily summaries RLS
ALTER TABLE daily_sdr_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own daily summaries"
  ON daily_sdr_summaries FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all daily summaries in their org"
  ON daily_sdr_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = daily_sdr_summaries.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage daily summaries"
  ON daily_sdr_summaries FOR ALL
  WITH CHECK (TRUE);

-- Weekly summaries RLS
ALTER TABLE weekly_sdr_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own weekly summaries"
  ON weekly_sdr_summaries FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all weekly summaries in their org"
  ON weekly_sdr_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = weekly_sdr_summaries.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage weekly summaries"
  ON weekly_sdr_summaries FOR ALL
  WITH CHECK (TRUE);

-- ============================================
-- 4. Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_daily_sdr_summaries_updated_at ON daily_sdr_summaries;
CREATE TRIGGER update_daily_sdr_summaries_updated_at
  BEFORE UPDATE ON daily_sdr_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekly_sdr_summaries_updated_at ON weekly_sdr_summaries;
CREATE TRIGGER update_weekly_sdr_summaries_updated_at
  BEFORE UPDATE ON weekly_sdr_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== SDR Summaries Migration Complete ===';
  RAISE NOTICE 'Created daily_sdr_summaries table with UNIQUE(sdr_user_id, date)';
  RAISE NOTICE 'Created weekly_sdr_summaries table with UNIQUE(sdr_user_id, week_start, week_end)';
  RAISE NOTICE 'Applied RLS policies and updated_at triggers';
END $$;

