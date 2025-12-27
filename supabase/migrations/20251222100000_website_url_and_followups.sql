-- Website URL Tracking and Follow-up System Migration
-- Adds website URL capture, meeting completion tracking, and follow-up enforcement

-- ============================================
-- 1. Add calculator_installed_at to trial_pipeline (manual "installed" signal)
-- ============================================
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS calculator_installed_at TIMESTAMPTZ;

COMMENT ON COLUMN trial_pipeline.calculator_installed_at IS 'Manual "installed" signal from activator when they mark calculator as installed and verified';

-- ============================================
-- 2. Add follow-up tracking to trial_pipeline
-- ============================================
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS followup_reason TEXT,
ADD COLUMN IF NOT EXISTS last_meeting_outcome TEXT 
  CHECK (last_meeting_outcome IN ('installed', 'partial', 'couldnt_install', 'no_show'));

COMMENT ON COLUMN trial_pipeline.next_followup_at IS 'When the next follow-up meeting/callback should happen (required if meeting outcome is partial or couldnt_install)';
COMMENT ON COLUMN trial_pipeline.followup_reason IS 'Reason why follow-up is needed (e.g., waiting_web_guy, needs_wp_login)';
COMMENT ON COLUMN trial_pipeline.last_meeting_outcome IS 'Outcome of the last activation meeting';

-- ============================================
-- 3. Add website_url to activation_meetings (snapshot at meeting time)
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN activation_meetings.website_url IS 'Website URL snapshot at meeting time (auto-filled from search_results.website)';

-- ============================================
-- 4. Add install verification fields to activation_meetings
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS install_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS install_notes TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN activation_meetings.install_verified IS 'Activator confirmed calculator is visible and working on site';
COMMENT ON COLUMN activation_meetings.install_notes IS 'Notes from activator about the install';
COMMENT ON COLUMN activation_meetings.completed_at IS 'When the meeting was marked as completed';

-- ============================================
-- 5. Index for follow-up queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tp_followup_overdue 
ON trial_pipeline(next_followup_at) 
WHERE next_followup_at IS NOT NULL 
  AND calculator_installed_at IS NULL 
  AND marked_lost_at IS NULL;

-- ============================================
-- 6. Backfill website_url for existing meetings from search_results
-- ============================================
UPDATE activation_meetings am
SET website_url = sr.website
FROM trial_pipeline tp
JOIN search_results sr ON sr.id = tp.crm_lead_id
WHERE am.trial_pipeline_id = tp.id
  AND am.website_url IS NULL
  AND sr.website IS NOT NULL;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Website URL and Follow-up System Migration Complete ===';
  RAISE NOTICE 'Added to trial_pipeline: calculator_installed_at, next_followup_at, followup_reason, last_meeting_outcome';
  RAISE NOTICE 'Added to activation_meetings: website_url, install_verified, install_notes, completed_at';
  RAISE NOTICE 'Created index for follow-up queries';
  RAISE NOTICE 'Backfilled website_url for existing meetings';
END $$;


