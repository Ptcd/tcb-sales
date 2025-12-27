-- Add inbound call support to calls table
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS voicemail_left BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN calls.direction IS 'Call direction: inbound (lead called us) or outbound (we called lead)';
COMMENT ON COLUMN calls.voicemail_left IS 'Whether caller left a voicemail';

-- Add index for faster filtering by direction
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);
CREATE INDEX IF NOT EXISTS idx_calls_voicemail ON calls(voicemail_left) WHERE voicemail_left = true;

-- Update lead_source enum to include inbound_call
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'search_results_lead_source_check'
  ) THEN
    ALTER TABLE search_results 
      ADD CONSTRAINT search_results_lead_source_check 
      CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call'));
  ELSE
    -- Drop and recreate constraint to add new value
    ALTER TABLE search_results DROP CONSTRAINT IF EXISTS search_results_lead_source_check;
    ALTER TABLE search_results 
      ADD CONSTRAINT search_results_lead_source_check 
      CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call'));
  END IF;
END $$;

COMMENT ON CONSTRAINT search_results_lead_source_check ON search_results IS 'Lead source: google_maps, manual, or inbound_call';

