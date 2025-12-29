-- Update user_search_results view to include CRM fields
-- This ensures the view returns lead_status, assigned_to, etc.
-- Only create if tables exist

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results')
     AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    -- Drop existing view first (can't change column structure with CREATE OR REPLACE)
    DROP VIEW IF EXISTS user_search_results;
    -- Note: email column added in later migration
    CREATE VIEW user_search_results AS
    SELECT 
      sr.id,
      sr.search_history_id,
      sr.place_id,
      sr.name,
      sr.address,
      sr.phone,
      sr.website,
      sr.rating,
      sr.review_count,
      sr.latitude,
      sr.longitude,
      sr.created_at,
      sr.lead_status,
      sr.assigned_to,
      sr.last_contacted_at,
      sr.updated_at,
      sh.user_id,
      sh.keyword,
      sh.location,
      sh.result_count,
      sh.created_at as search_date
    FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id;

    COMMENT ON VIEW user_search_results IS 'User search results with CRM fields for lead management';
  END IF;
END $$;

