-- Add conversion quality tag for trial call reviews
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS conversion_quality_tag TEXT 
CHECK (conversion_quality_tag IN ('strong', 'average', 'email_grab', 'forced', 'unknown'))
DEFAULT 'unknown';

-- Index for filtering by quality tag
CREATE INDEX IF NOT EXISTS idx_calls_quality_tag ON calls(conversion_quality_tag) 
WHERE conversion_quality_tag IS NOT NULL;

COMMENT ON COLUMN calls.conversion_quality_tag IS 'Quality tag for trial-resulted calls: strong, average, email_grab, forced, unknown';


