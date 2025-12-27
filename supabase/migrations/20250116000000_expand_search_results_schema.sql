-- Expand search_results schema to store all search results (new and existing leads)
-- This allows us to persist the complete result set for history views

-- Add columns for existing lead tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS is_existing_lead BOOLEAN DEFAULT false;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_owner_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_owner_name TEXT;

-- Ensure lead_source has a default
ALTER TABLE search_results 
ALTER COLUMN lead_source SET DEFAULT 'google_maps';

-- Create index on is_existing_lead for filtering
CREATE INDEX IF NOT EXISTS idx_search_results_is_existing_lead ON search_results(is_existing_lead);

-- Create unique constraint on search_history_id + place_id to prevent duplicates within the same search
-- This allows upsert operations. We use a partial index to allow re-insertion after soft delete.
-- Note: This constraint only applies to non-deleted records
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_history_place_unique 
ON search_results(search_history_id, place_id) 
WHERE deleted_at IS NULL;

-- Also create a regular unique constraint for upsert compatibility
-- Supabase upsert works better with actual constraints
ALTER TABLE search_results 
DROP CONSTRAINT IF EXISTS search_results_history_place_unique;

-- We'll handle uniqueness via the index above and application logic
-- The partial unique index prevents duplicates for active records

-- Add comment explaining the schema
COMMENT ON COLUMN search_results.is_existing_lead IS 'True if this result matches an existing lead in the CRM';
COMMENT ON COLUMN search_results.existing_lead_id IS 'ID of the existing lead if this result matches one';
COMMENT ON COLUMN search_results.existing_owner_id IS 'User ID of the owner of the existing lead';
COMMENT ON COLUMN search_results.existing_owner_name IS 'Name of the owner of the existing lead';

