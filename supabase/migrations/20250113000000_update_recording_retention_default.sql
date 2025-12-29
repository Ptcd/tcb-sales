-- Update default recording retention from 90 days to 3 days (72 hours)
-- This ensures recordings are automatically deleted after 72 hours by default
-- Only run if table exists (created in later migration)

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_call_settings') THEN
    ALTER TABLE organization_call_settings 
    ALTER COLUMN recording_retention_days SET DEFAULT 3;
    
    COMMENT ON COLUMN organization_call_settings.recording_retention_days IS 'Number of days to retain call recordings before auto-deletion. Default is 3 days (72 hours).';
  END IF;
END $$;

