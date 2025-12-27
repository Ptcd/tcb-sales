-- Update default recording retention from 90 days to 3 days (72 hours)
-- This ensures recordings are automatically deleted after 72 hours by default

ALTER TABLE organization_call_settings 
ALTER COLUMN recording_retention_days SET DEFAULT 3;

-- Update existing organizations that still have the old default (90 days)
-- Only update if they haven't explicitly set a custom value
-- We'll leave existing custom values unchanged

COMMENT ON COLUMN organization_call_settings.recording_retention_days IS 'Number of days to retain call recordings before auto-deletion. Default is 3 days (72 hours).';


