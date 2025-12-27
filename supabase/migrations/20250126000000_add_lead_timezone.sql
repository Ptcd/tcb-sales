-- Add lead_timezone and timezone_source to search_results
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lead_timezone TEXT,
ADD COLUMN IF NOT EXISTS timezone_source TEXT CHECK (timezone_source IN ('coords', 'phone', 'manual'));

COMMENT ON COLUMN search_results.lead_timezone IS 'IANA timezone string (e.g., America/New_York)';
COMMENT ON COLUMN search_results.timezone_source IS 'How timezone was determined: coords (high confidence), phone (medium), manual';

-- Create index for timezone queries
CREATE INDEX IF NOT EXISTS idx_search_results_lead_timezone ON search_results(lead_timezone);


