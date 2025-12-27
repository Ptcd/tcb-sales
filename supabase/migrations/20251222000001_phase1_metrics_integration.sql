-- Phase 1 Metrics Integration Migration
-- Adds install appointment tracking to daily and weekly summaries

-- ============================================
-- 1. Add install appointment columns to daily_sdr_summaries
-- ============================================
ALTER TABLE daily_sdr_summaries
ADD COLUMN IF NOT EXISTS install_appointments_booked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS install_appointments_attended INTEGER DEFAULT 0;

COMMENT ON COLUMN daily_sdr_summaries.install_appointments_booked IS 'Number of install appointments scheduled by this SDR on this date';
COMMENT ON COLUMN daily_sdr_summaries.install_appointments_attended IS 'Number of install appointments that were attended (status = completed) on this date';

-- ============================================
-- 2. Add install appointment columns to weekly_sdr_summaries
-- ============================================
ALTER TABLE weekly_sdr_summaries
ADD COLUMN IF NOT EXISTS install_appointments_booked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS install_appointments_attended INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score_band TEXT DEFAULT 'none';

COMMENT ON COLUMN weekly_sdr_summaries.install_appointments_booked IS 'Total install appointments scheduled during the week';
COMMENT ON COLUMN weekly_sdr_summaries.install_appointments_attended IS 'Total install appointments attended (status = completed) during the week';
COMMENT ON COLUMN weekly_sdr_summaries.score_band IS 'Performance score band: green, yellow, orange, red, or none';

-- ============================================
-- 3. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_install_appts 
  ON daily_sdr_summaries(sdr_user_id, date DESC) 
  WHERE install_appointments_attended > 0;

CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_score_band 
  ON weekly_sdr_summaries(score_band, week_start DESC) 
  WHERE score_band != 'none';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Phase 1 Metrics Integration Migration Complete ===';
  RAISE NOTICE 'Added to daily_sdr_summaries: install_appointments_booked, install_appointments_attended';
  RAISE NOTICE 'Added to weekly_sdr_summaries: install_appointments_booked, install_appointments_attended, score_band';
END $$;


