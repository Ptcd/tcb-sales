-- Verification Query: Check that all trials were reassigned correctly
-- Run this in Supabase SQL Editor after running the migration

SELECT 
  'Trials assigned to jennyfertan' as check_name, 
  COUNT(*) as count 
FROM trial_pipeline tp 
JOIN user_profiles up ON up.id = tp.assigned_activator_id 
WHERE up.email = 'jennyfertan322@gmail.com'

UNION ALL

SELECT 
  'Leads assigned to jennyfertan', 
  COUNT(*) 
FROM search_results sr 
JOIN user_profiles up ON up.id = sr.assigned_to 
WHERE up.email = 'jennyfertan322@gmail.com' 
  AND sr.badge_key LIKE 'trial_%'

UNION ALL

SELECT 
  'Meetings assigned to jennyfertan', 
  COUNT(*) 
FROM activation_meetings am 
JOIN user_profiles up ON up.id = am.activator_user_id 
WHERE up.email = 'jennyfertan322@gmail.com' 
  AND am.status IN ('scheduled', 'rescheduled')

UNION ALL

SELECT 
  'Anything left on merrillholdings (should be 0)', 
  COUNT(*) 
FROM trial_pipeline tp 
JOIN user_profiles up ON up.id = tp.assigned_activator_id 
WHERE up.email = 'merrillholdings@gmail.com';


