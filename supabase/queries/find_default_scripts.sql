-- Find Default Prospecting Scripts
-- Run this query to see which scripts will be tagged as PROSPECT_PITCH_CORE

SELECT 
  cs.id,
  cs.name,
  cs.campaign_id,
  c.name as campaign_name,
  cs.is_active,
  cs.script_key,
  cs.badge_key,
  cs.category,
  LEFT(cs.content, 100) as content_preview,
  cs.created_at
FROM call_scripts cs
LEFT JOIN campaigns c ON c.id = cs.campaign_id
WHERE 
  cs.script_key IS NULL 
  AND (cs.badge_key IS NULL OR cs.badge_key = '')
  AND cs.is_active = true
ORDER BY cs.campaign_id, cs.created_at;

-- To see scripts for a specific campaign, add:
-- AND cs.campaign_id = 'your-campaign-id-here'


