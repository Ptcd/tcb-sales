-- Prevent duplicate leads by phone number within an organization
-- First, identify and remove duplicates (keeping the oldest record)

-- Step 1: Create a temp table with the IDs to keep (oldest record for each phone+org combo)
CREATE TEMP TABLE leads_to_keep AS
SELECT DISTINCT ON (organization_id, phone) id
FROM search_results
WHERE phone IS NOT NULL AND phone != ''
ORDER BY organization_id, phone, created_at ASC;

-- Step 2: Delete duplicate leads (those not in the keep list)
DELETE FROM search_results
WHERE phone IS NOT NULL 
  AND phone != ''
  AND id NOT IN (SELECT id FROM leads_to_keep);

-- Step 3: Add unique index on (organization_id, phone) for non-null phones
-- Using a partial unique index so NULL phones don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_org_phone_unique 
ON search_results (organization_id, phone) 
WHERE phone IS NOT NULL AND phone != '';

-- Also add a unique index on place_id within an org to prevent Google Maps duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_org_place_id_unique 
ON search_results (organization_id, place_id) 
WHERE place_id IS NOT NULL AND place_id != '';

-- Drop the temp table
DROP TABLE IF EXISTS leads_to_keep;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_search_results_org_phone_unique IS 'Prevents duplicate leads with the same phone number within an organization';
COMMENT ON INDEX idx_search_results_org_place_id_unique IS 'Prevents duplicate leads with the same Google Place ID within an organization';

