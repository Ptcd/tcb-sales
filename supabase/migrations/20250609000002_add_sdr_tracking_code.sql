-- Add SDR tracking code to user_profiles
-- This allows mapping tracking codes (from JCC signup links) to SDR users

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS sdr_code TEXT UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_sdr_code 
  ON user_profiles(sdr_code) 
  WHERE sdr_code IS NOT NULL;

COMMENT ON COLUMN user_profiles.sdr_code IS 'Unique SDR tracking code used in JCC signup links (e.g., ?sdr=thalia)';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== SDR Tracking Code Migration Complete ===';
  RAISE NOTICE 'Added sdr_code column to user_profiles';
  RAISE NOTICE 'SDRs can now be assigned leads based on their tracking code';
END $$;

