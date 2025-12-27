-- Fix manual lead creation by making optional fields nullable
-- Manual leads don't have all Google Maps data

-- 1. Make place_id nullable (it was required before)
ALTER TABLE search_results ALTER COLUMN place_id DROP NOT NULL;

-- 2. Make address nullable (optional for manual leads)
ALTER TABLE search_results ALTER COLUMN address DROP NOT NULL;

-- 3. Add comments
COMMENT ON COLUMN search_results.place_id IS 'Google Maps place ID (nullable for manual leads)';
COMMENT ON COLUMN search_results.address IS 'Business address (optional for manual leads)';

-- 4. For existing manual leads (if any), generate a unique place_id
UPDATE search_results 
SET place_id = 'manual_' || id::text 
WHERE place_id IS NULL AND lead_source = 'manual';

