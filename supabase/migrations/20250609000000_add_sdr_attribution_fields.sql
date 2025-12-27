-- SDR Attribution Fields Migration
-- Adds first-touch and last-touch SDR tracking for Junk Car Calculator signups

-- Add SDR attribution columns to search_results
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS jcc_sdr_first_touch_code TEXT,
  ADD COLUMN IF NOT EXISTS jcc_sdr_last_touch_code TEXT;

-- Create indexes for efficient filtering by SDR code
CREATE INDEX IF NOT EXISTS idx_search_results_jcc_sdr_first_touch 
  ON search_results(jcc_sdr_first_touch_code) 
  WHERE jcc_sdr_first_touch_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_results_jcc_sdr_last_touch 
  ON search_results(jcc_sdr_last_touch_code) 
  WHERE jcc_sdr_last_touch_code IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN search_results.jcc_sdr_first_touch_code IS 'First-touch SDR attribution code from Junk Car Calculator signup link';
COMMENT ON COLUMN search_results.jcc_sdr_last_touch_code IS 'Last-touch SDR attribution code from Junk Car Calculator signup link';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== SDR Attribution Fields Migration Complete ===';
  RAISE NOTICE 'Added jcc_sdr_first_touch_code and jcc_sdr_last_touch_code to search_results';
  RAISE NOTICE 'These fields track which SDR link brought a user to the Calculator';
END $$;

