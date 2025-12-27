-- SDR Confirmation Checklist Migration
-- Adds fields to track SDR confirmations during appointment booking

-- ============================================
-- Add SDR confirmation fields to activation_meetings
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS sdr_confirmed_understands_install BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sdr_confirmed_agreed_install BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sdr_confirmed_will_attend BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS access_method TEXT CHECK (access_method IN ('credentials', 'web_person', 'both')),
ADD COLUMN IF NOT EXISTS web_person_email TEXT;

COMMENT ON COLUMN activation_meetings.sdr_confirmed_understands_install IS 'SDR confirmed customer understands calculator will be installed on their website';
COMMENT ON COLUMN activation_meetings.sdr_confirmed_agreed_install IS 'SDR confirmed customer agreed to install during the setup call';
COMMENT ON COLUMN activation_meetings.sdr_confirmed_will_attend IS 'SDR confirmed customer will attend the install appointment';
COMMENT ON COLUMN activation_meetings.access_method IS 'How customer will provide access: credentials, web_person, or both';
COMMENT ON COLUMN activation_meetings.web_person_email IS 'Email of website person who will join the call (if access_method includes web_person)';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== SDR Confirmation Checklist Migration Complete ===';
  RAISE NOTICE 'Added to activation_meetings: sdr_confirmed_understands_install, sdr_confirmed_agreed_install, sdr_confirmed_will_attend, access_method, web_person_email';
END $$;


