-- Tag Default Prospecting Scripts
-- Finds scripts that are being used as defaults (no script_key, no badge_key)
-- and tags them as PROSPECT_PITCH_CORE

-- ============================================
-- 1. Find and tag ONE default script per campaign
-- ============================================

-- Use a CTE to select only the FIRST (oldest) default script per campaign
-- This avoids duplicate key violations when multiple default scripts exist
WITH first_default_per_campaign AS (
  SELECT DISTINCT ON (campaign_id) id
  FROM call_scripts
  WHERE 
    script_key IS NULL 
    AND (badge_key IS NULL OR badge_key = '')
    AND is_active = true
    -- Skip campaigns that already have a PROSPECT_PITCH_CORE script
    AND campaign_id NOT IN (
      SELECT campaign_id 
      FROM call_scripts 
      WHERE script_key = 'PROSPECT_PITCH_CORE'
    )
  ORDER BY campaign_id, created_at ASC
)
UPDATE call_scripts
SET 
  script_key = 'PROSPECT_PITCH_CORE',
  category = 'PROSPECT',
  priority = 0,
  updated_at = NOW()
WHERE id IN (SELECT id FROM first_default_per_campaign);

-- ============================================
-- 2. Report what was updated
-- ============================================
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM call_scripts 
  WHERE script_key = 'PROSPECT_PITCH_CORE';
  
  RAISE NOTICE '=== Total PROSPECT_PITCH_CORE scripts: % ===', updated_count;
END $$;

