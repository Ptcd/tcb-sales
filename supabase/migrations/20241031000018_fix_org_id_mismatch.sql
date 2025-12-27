-- Fix organization_id mismatches between search_history and search_results
-- This ensures all search_results match their search_history's organization_id

-- Fix: Update search_results to match search_history's organization_id
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sh.organization_id IS NOT NULL
  AND sr.organization_id IS DISTINCT FROM sh.organization_id;

-- Verify the fix worked
DO $$
DECLARE
  mismatch_count INTEGER;
  total_results INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM search_results sr
  JOIN search_history sh ON sh.id = sr.search_history_id
  WHERE sr.organization_id IS DISTINCT FROM sh.organization_id;
  
  SELECT COUNT(*) INTO total_results FROM search_results;
  
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Remaining mismatches: %', mismatch_count;
  
  IF mismatch_count > 0 THEN
    RAISE WARNING 'Still have % mismatches. Check if search_history has correct organization_id.', mismatch_count;
  END IF;
END $$;

