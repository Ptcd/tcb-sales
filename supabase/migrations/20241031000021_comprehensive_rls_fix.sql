-- Comprehensive RLS fix for search_results
-- This addresses the issue where results disappear immediately after insertion
-- The problem: RLS SELECT policies may not be evaluating correctly

-- Step 1: Improve get_user_organization_id() function
-- Mark it as STABLE so PostgreSQL can optimize and cache it properly
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Get organization_id from user_profiles
  -- SECURITY DEFINER allows this to bypass RLS on user_profiles if needed
  SELECT organization_id INTO org_id
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Return the org_id (may be NULL if user doesn't have a profile)
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission so it can be called via RPC
GRANT EXECUTE ON FUNCTION get_user_organization_id() TO authenticated;

-- Step 2: Drop ALL existing policies on search_results to start fresh
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can insert their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can update their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can delete their own search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;
END $$;

-- Step 3: Create robust SELECT policy
-- This explicitly handles NULL cases and ensures the check works
CREATE POLICY "Team members can view organization search results"
  ON search_results FOR SELECT
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 4: Create INSERT policy
CREATE POLICY "Team members can insert organization search results"
  ON search_results FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 5: Create UPDATE policy
CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 6: Create DELETE policy
CREATE POLICY "Team members can delete organization search results"
  ON search_results FOR DELETE
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 7: Verify all search_results have organization_id
-- Update any that are missing by matching them to their search_history
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sh.organization_id IS NOT NULL
  AND sr.organization_id IS NULL;

-- Step 8: Log verification
DO $$
DECLARE
  total_results INTEGER;
  results_with_org INTEGER;
  results_null_org INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_results FROM search_results;
  SELECT COUNT(*) INTO results_with_org FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO results_null_org FROM search_results WHERE organization_id IS NULL;
  
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'search_results';
  
  RAISE NOTICE '=== Search Results RLS Fix Summary ===';
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Results with organization_id: %', results_with_org;
  RAISE NOTICE 'Results with NULL organization_id: %', results_null_org;
  RAISE NOTICE 'RLS policies on search_results: %', policy_count;
  
  IF results_null_org > 0 THEN
    RAISE WARNING 'There are still % search_results with NULL organization_id', results_null_org;
  END IF;
END $$;
