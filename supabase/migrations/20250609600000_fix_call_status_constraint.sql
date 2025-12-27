-- Fix calls status constraint to include 'in-progress' from Twilio
-- Twilio sends statuses like: queued, ringing, in-progress, completed, busy, no-answer, canceled, failed

-- First drop the existing constraint
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check;

-- Add updated constraint with all Twilio statuses
ALTER TABLE calls ADD CONSTRAINT calls_status_check 
  CHECK (status IN (
    'initiated',     -- Our custom initial status
    'queued',        -- Twilio: call is queued
    'ringing',       -- Twilio: call is ringing
    'in-progress',   -- Twilio: call is in progress (answered)
    'answered',      -- Our custom status (same as in-progress)
    'completed',     -- Twilio: call completed normally
    'busy',          -- Twilio: busy signal
    'no-answer',     -- Twilio: no answer (with hyphen)
    'no_answer',     -- Our custom status (with underscore)
    'failed',        -- Twilio: call failed
    'canceled',      -- Twilio: call was canceled (one L)
    'cancelled'      -- Our custom status (two L's)
  ));

COMMENT ON COLUMN calls.status IS 'Call status - includes Twilio statuses (queued, ringing, in-progress, completed, busy, no-answer, canceled, failed) and custom statuses (initiated, answered, no_answer, cancelled)';



