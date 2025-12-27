-- Campaign Scripts Framework Migration
-- Adds script_key, category, and priority to call_scripts table
-- This enables automatic script routing based on lead situation

-- ============================================
-- 1. Add new columns to call_scripts
-- ============================================

-- script_key: Machine-readable unique identifier per campaign (e.g., "RESCUE_PASSWORD_NOT_SET")
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS script_key TEXT;

-- category: Groups scripts by purpose (PROSPECT, FOLLOWUP, RESCUE, CONVERT)
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS category TEXT;

-- priority: Controls display order within category (lower = higher priority)
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Add constraint for valid categories
ALTER TABLE call_scripts DROP CONSTRAINT IF EXISTS call_scripts_category_check;
ALTER TABLE call_scripts ADD CONSTRAINT call_scripts_category_check 
  CHECK (category IS NULL OR category IN ('PROSPECT', 'FOLLOWUP', 'RESCUE', 'CONVERT'));

-- Unique constraint: one script_key per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_scripts_campaign_script_key 
  ON call_scripts(campaign_id, script_key) 
  WHERE script_key IS NOT NULL;

-- Index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_call_scripts_category 
  ON call_scripts(campaign_id, category);

-- ============================================
-- 2. Add comments for documentation
-- ============================================
COMMENT ON COLUMN call_scripts.script_key IS 'Machine-readable key for auto-loading (e.g., RESCUE_PASSWORD_NOT_SET, PROSPECT_PITCH_CORE)';
COMMENT ON COLUMN call_scripts.category IS 'Script category: PROSPECT, FOLLOWUP, RESCUE, or CONVERT';
COMMENT ON COLUMN call_scripts.priority IS 'Display priority within category (lower = higher priority)';

-- ============================================
-- 3. Standard Script Keys Reference (for documentation)
-- ============================================
-- Prospecting:
--   PROSPECT_OPENER_GATEKEEPER
--   PROSPECT_OPENER_DECISIONMAKER
--   PROSPECT_PITCH_CORE (default prospecting script)
--   PROSPECT_OBJECTION_BUSY
--   PROSPECT_OBJECTION_ALREADY_HAVE_SOLUTION
--   PROSPECT_CLOSE_TRIAL
--
-- Follow-ups:
--   TRIAL_FOLLOWUP_1
--   TRIAL_FOLLOWUP_2
--   TRIAL_FOLLOWUP_3
--
-- Rescues:
--   RESCUE_PASSWORD_NOT_SET (Rescue A - 2-24h after trial, no password)
--   RESCUE_NOT_ACTIVATED (Rescue B - 2-48h after password, no activation)
--
-- Conversion:
--   CONVERT_TO_PAID_NUDGE
--   CANCEL_SAVE_OFFER

-- ============================================
-- 4. Migration complete notice
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Campaign Scripts Framework Migration Complete ===';
  RAISE NOTICE 'Added columns: script_key, category, priority';
  RAISE NOTICE 'Created indexes for script_key and category lookups';
END $$;


