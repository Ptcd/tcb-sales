-- Update user_search_results view to include CRM fields
-- This ensures the view returns lead_status, assigned_to, etc.

CREATE OR REPLACE VIEW user_search_results AS
SELECT 
  sr.id,
  sr.search_history_id,
  sr.place_id,
  sr.name,
  sr.address,
  sr.phone,
  sr.email,
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

