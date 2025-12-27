-- Add 'jcc_signup' as a valid lead_source value
-- This allows auto-created leads from the Junk Car Calculator signup webhook

-- Drop the existing constraint and recreate with the new value
ALTER TABLE search_results DROP CONSTRAINT IF EXISTS search_results_lead_source_check;

ALTER TABLE search_results 
ADD CONSTRAINT search_results_lead_source_check 
CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call', 'import', 'jcc_signup'));

COMMENT ON CONSTRAINT search_results_lead_source_check ON search_results IS 'Lead source: google_maps, manual, inbound_call, import, or jcc_signup';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== JCC Signup Lead Source Migration Complete ===';
  RAISE NOTICE 'Added jcc_signup as a valid lead_source value';
END $$;

