-- Test query to verify get_user_organization_id() works correctly
-- Run this manually in Supabase SQL Editor while logged in as a user
-- It will show you what organization_id the function returns

-- This is a diagnostic query, not a migration
-- Copy and run this in Supabase SQL Editor to debug:

/*
SELECT 
  auth.uid() as current_user_id,
  get_user_organization_id() as function_org_id,
  up.organization_id as profile_org_id,
  up.role,
  (SELECT COUNT(*) FROM search_results WHERE organization_id = get_user_organization_id()) as visible_results_count,
  (SELECT COUNT(*) FROM search_results) as total_results_count
FROM user_profiles up
WHERE up.id = auth.uid();
*/

-- Also check for any search_results that might have NULL organization_id:
-- SELECT COUNT(*) FROM search_results WHERE organization_id IS NULL;

-- And check if any search_results have organization_id that doesn't match search_history:
/*
SELECT 
  COUNT(*) as mismatch_count
FROM search_results sr
JOIN search_history sh ON sh.id = sr.search_history_id
WHERE sr.organization_id IS DISTINCT FROM sh.organization_id;
*/

