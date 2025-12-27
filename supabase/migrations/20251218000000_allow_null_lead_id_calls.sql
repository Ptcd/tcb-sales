-- Allow inbound calls from unknown callers (no lead record yet)
-- This fixes: "null value in column lead_id violates not-null constraint"

-- Drop the NOT NULL constraint on lead_id
ALTER TABLE calls ALTER COLUMN lead_id DROP NOT NULL;

-- Add comment explaining why lead_id can be null
COMMENT ON COLUMN calls.lead_id IS 'Reference to the lead. NULL for inbound calls from unknown callers.';


