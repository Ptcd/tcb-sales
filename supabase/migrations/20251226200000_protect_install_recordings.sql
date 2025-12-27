-- Add recording protection column to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_protected_until TIMESTAMPTZ;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_calls_recording_protected 
ON calls(recording_protected_until) 
WHERE recording_protected_until IS NOT NULL;

COMMENT ON COLUMN calls.recording_protected_until IS 
  'Recordings protected from cleanup until this date (90 days for install calls)';

