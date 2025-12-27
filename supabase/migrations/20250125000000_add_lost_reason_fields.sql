-- Add lost_reason and lost_reason_notes columns to search_results
-- These fields are required when marking a lead as closed_lost

ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lost_reason TEXT,
ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT;

-- Comments
COMMENT ON COLUMN search_results.lost_reason IS 'Reason why lead was lost: price, timing, ghosted, not_a_fit, went_with_competitor, other';
COMMENT ON COLUMN search_results.lost_reason_notes IS 'Optional free-text notes explaining the lost reason';


