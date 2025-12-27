-- Add is_new flag to track unread voicemails
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN calls.is_new IS 'Whether the call/voicemail is new (unread)';

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_calls_is_new ON calls(is_new) WHERE is_new = true;

-- For inbound calls with voicemail, they should start as "new"
-- For outbound calls, they are not "new" (user initiated them)
UPDATE calls SET is_new = false WHERE direction = 'outbound' OR direction IS NULL;


