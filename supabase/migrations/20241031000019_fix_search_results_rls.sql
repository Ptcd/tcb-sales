-- Fix search_results RLS issues
-- This ensures all old policies are dropped and the function works correctly

-- Drop ALL old policies on search_results (in case any were missed)
DO $$
BEGIN
  -- Drop all existing policies on search_results
  DROP POLICY IF EXISTS "Users can view their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can insert their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can update their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can delete their own search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;
END $$;

-- Recreate the organization-based policies
CREATE POLICY "Team members can view organization search results"
  ON search_results FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization search results"
  ON search_results FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization search results"
  ON search_results FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Verify the function exists and works
DO $$
DECLARE
  func_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_user_organization_id'
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function get_user_organization_id() does not exist!';
  END IF;
  
  RAISE NOTICE 'Function get_user_organization_id() exists';
END $$;

