-- Add missing columns to search_results table
-- These columns are needed for multi-user organization support

-- Add organization_id column
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add email column for scraped emails
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on organization_id for better query performance
CREATE INDEX IF NOT EXISTS idx_search_results_organization_id ON search_results(organization_id);

-- Backfill organization_id from search_history for existing records
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sr.organization_id IS NULL
  AND sh.organization_id IS NOT NULL;

-- Log the migration
DO $$
DECLARE
  total_results INTEGER;
  results_with_org INTEGER;
  results_null_org INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_results FROM search_results;
  SELECT COUNT(*) INTO results_with_org FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO results_null_org FROM search_results WHERE organization_id IS NULL;
  
  RAISE NOTICE '=== Add Missing Columns Migration Summary ===';
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Results with organization_id: %', results_with_org;
  RAISE NOTICE 'Results with NULL organization_id: %', results_null_org;
  
  IF results_null_org > 0 THEN
    RAISE WARNING 'There are still % search_results with NULL organization_id - these may be orphaned records', results_null_org;
  END IF;
END $$;

