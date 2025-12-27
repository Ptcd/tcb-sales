-- Diagnostic query to check for organization_id mismatches
-- This will help identify if search_results belong to different organizations than their search_history

-- Check for mismatches between search_history and search_results
SELECT 
  sh.id as search_history_id,
  sh.keyword,
  sh.location,
  sh.user_id,
  sh.organization_id as history_org_id,
  COUNT(sr.id) as result_count,
  COUNT(CASE WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 1 END) as mismatched_count
FROM search_history sh
LEFT JOIN search_results sr ON sr.search_history_id = sh.id
GROUP BY sh.id, sh.keyword, sh.location, sh.user_id, sh.organization_id
HAVING COUNT(sr.id) > 0
  AND COUNT(CASE WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 1 END) > 0
ORDER BY mismatched_count DESC;

-- Check search_results that might be in wrong organization
SELECT 
  sr.id,
  sr.search_history_id,
  sr.organization_id as result_org_id,
  sh.organization_id as history_org_id,
  sh.user_id,
  up.organization_id as user_org_id,
  CASE 
    WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 'MISMATCH: result org != history org'
    WHEN sr.organization_id IS DISTINCT FROM up.organization_id THEN 'MISMATCH: result org != user org'
    ELSE 'OK'
  END as status
FROM search_results sr
JOIN search_history sh ON sh.id = sr.search_history_id
LEFT JOIN user_profiles up ON up.id = sh.user_id
WHERE sr.organization_id IS DISTINCT FROM sh.organization_id
   OR sr.organization_id IS DISTINCT FROM up.organization_id
LIMIT 50;

