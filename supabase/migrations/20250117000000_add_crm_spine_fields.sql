-- CRM Spine: Add next action fields and update status pipeline
-- This migration adds follow-up tracking and updates the status enum to match the pipeline stages

-- 1. Add next_action_at and next_action_note columns
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_action_note TEXT;

-- Create index for fast "Today's Follow-Ups" queries
CREATE INDEX IF NOT EXISTS idx_search_results_next_action_at ON search_results(next_action_at) 
WHERE next_action_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN search_results.next_action_at IS 'When the next action should be taken on this lead';
COMMENT ON COLUMN search_results.next_action_note IS 'Note about what the next action should be';

-- 2. Update lead_status enum to match new pipeline stages
-- First, we need to drop the old CHECK constraint and add a new one
-- Note: We'll keep old values for backward compatibility but add new ones
ALTER TABLE search_results 
DROP CONSTRAINT IF EXISTS search_results_lead_status_check;

-- Add new constraint with expanded status list
ALTER TABLE search_results 
ADD CONSTRAINT search_results_lead_status_check 
CHECK (lead_status IN (
  'new', 
  'contacted', 
  'interested', 
  'trial_started',
  'follow_up',
  'closed_won', 
  'closed_lost',
  -- Legacy values for backward compatibility
  'not_interested',
  'converted'
));

-- Update comment
COMMENT ON COLUMN search_results.lead_status IS 'Current status: new, contacted, interested, trial_started, follow_up, closed_won, closed_lost';

-- 3. Create function to auto-set next_action_at based on status changes
CREATE OR REPLACE FUNCTION auto_set_next_action_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-set if next_action_at is NULL (user hasn't manually set it)
  IF NEW.next_action_at IS NULL THEN
    IF NEW.lead_status = 'interested' THEN
      NEW.next_action_at = NOW() + INTERVAL '1 day';
    ELSIF NEW.lead_status = 'trial_started' THEN
      NEW.next_action_at = NOW() + INTERVAL '2 days';
    ELSIF NEW.lead_status = 'new' AND OLD.lead_status IS NULL THEN
      -- New lead created: set next_action_at to now so it shows up immediately
      NEW.next_action_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set next_action_at
DROP TRIGGER IF EXISTS trigger_auto_set_next_action ON search_results;
CREATE TRIGGER trigger_auto_set_next_action
  BEFORE INSERT OR UPDATE OF lead_status ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_next_action_on_status_change();

-- 4. Update existing leads: set next_action_at for new leads
UPDATE search_results 
SET next_action_at = NOW() 
WHERE lead_status = 'new' AND next_action_at IS NULL;

