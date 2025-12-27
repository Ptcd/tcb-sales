-- Fix search_results that might be missing organization_id
-- This can happen if searches were done before the organization migration or if there was an issue

-- Update search_results that don't have organization_id
-- Link them via search_history to get the correct organization_id
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

-- For any remaining search_results without organization_id,
-- try to get it from the user who created them (via search_history)
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

-- Log how many were fixed
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM search_results
  WHERE organization_id IS NOT NULL;
  
  RAISE LOG 'Fixed search_results: % records now have organization_id', fixed_count;
END $$;

