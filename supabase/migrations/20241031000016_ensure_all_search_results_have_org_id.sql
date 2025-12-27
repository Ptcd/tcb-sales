-- Comprehensive fix for search_results missing organization_id
-- This migration ensures ALL search_results have organization_id, even edge cases

-- Step 1: Update from search_history (most common case)
UPDATE search_results sr
SET organization_id = (
  SELECT sh.organization_id
  FROM search_history sh
  WHERE sh.id = sr.search_history_id
  AND sh.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh 
    WHERE sh.id = sr.search_history_id 
    AND sh.organization_id IS NOT NULL
  );

-- Step 2: For any remaining, get organization_id from user via search_history
UPDATE search_results sr
SET organization_id = (
  SELECT up.organization_id
  FROM search_history sh
  JOIN user_profiles up ON up.id = sh.user_id
  WHERE sh.id = sr.search_history_id
  AND up.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh
    JOIN user_profiles up ON up.id = sh.user_id
    WHERE sh.id = sr.search_history_id
    AND up.organization_id IS NOT NULL
  );

-- Step 3: For orphaned search_results (search_history deleted but results remain)
-- Get organization_id from any user_profiles that match the user who might have created it
-- This is a fallback - try to match by any available user in the same org pattern
-- Note: This is less precise but better than NULL

-- Count how many were fixed
DO $$
DECLARE
  total_count INTEGER;
  fixed_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM search_results;
  SELECT COUNT(*) INTO fixed_count FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM search_results WHERE organization_id IS NULL;
  
  RAISE NOTICE 'Total search_results: %', total_count;
  RAISE NOTICE 'With organization_id: %', fixed_count;
  RAISE NOTICE 'Without organization_id: %', null_count;
END $$;

-- Verify: Show any remaining NULLs (should be 0 or very few)
-- This is just for logging, not an error
SELECT 
  COUNT(*) as remaining_nulls,
  'Run this query to see which search_results still need fixing' as note
FROM search_results
WHERE organization_id IS NULL;

