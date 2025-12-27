-- Onboarding Scheduling System Migration
-- Part A: Database Schema Changes
-- Extends trial_pipeline, creates activation_events audit log, and enhances activator settings

-- ============================================
-- A1: Extend trial_pipeline table
-- ============================================

-- Extend activation_status enum with attended/no_show
DO $$ BEGIN
  ALTER TYPE activation_status_type ADD VALUE IF NOT EXISTS 'attended';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE activation_status_type ADD VALUE IF NOT EXISTS 'no_show';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add scheduling/tracking columns to trial_pipeline
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS
  scheduled_start_at TIMESTAMPTZ,
  scheduled_end_at TIMESTAMPTZ,
  scheduled_timezone TEXT,
  scheduled_with_name TEXT,
  scheduled_with_role TEXT, -- owner/web_guy/manager/receptionist/other
  website_platform TEXT,
  lead_phone TEXT,
  lead_email TEXT,
  timezone_inferred_from TEXT, -- area_code/manual/unknown
  timezone_confidence SMALLINT,
  attempts_count INT DEFAULT 0,
  scheduled_by_user_id UUID REFERENCES auth.users(id),
  scheduled_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  killed_at TIMESTAMPTZ,
  reschedule_count INT DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN trial_pipeline.scheduled_with_role IS 'Role of person attending: owner/web_guy/manager/receptionist/other';
COMMENT ON COLUMN trial_pipeline.timezone_inferred_from IS 'How timezone was determined: area_code/manual/unknown';
COMMENT ON COLUMN trial_pipeline.timezone_confidence IS 'Confidence level: 100 (confident) / 50 (guessed) / 0 (unknown)';
COMMENT ON COLUMN trial_pipeline.attempts_count IS 'Counts contact/schedule touches; used for prioritization';
COMMENT ON COLUMN trial_pipeline.reschedule_count IS 'Number of times this meeting has been rescheduled';

-- ============================================
-- A2: Create activation_events audit log table
-- ============================================

CREATE TABLE IF NOT EXISTS activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- scheduled/rescheduled/attended/no_show/killed/note_updated/timezone_set/reminder_sent/sms_sent
  actor_user_id UUID REFERENCES auth.users(id),
  metadata JSONB, -- Store old/new schedule times, reason, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activation_events_trial_pipeline ON activation_events(trial_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_activation_events_event_type ON activation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activation_events_actor ON activation_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activation_events_created_at ON activation_events(created_at);

-- RLS policies
ALTER TABLE activation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events in their org"
  ON activation_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trial_pipeline tp
      JOIN search_results sr ON sr.id = tp.crm_lead_id
      WHERE tp.id = activation_events.trial_pipeline_id
      AND sr.organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert events in their org"
  ON activation_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trial_pipeline tp
      JOIN search_results sr ON sr.id = tp.crm_lead_id
      WHERE tp.id = activation_events.trial_pipeline_id
      AND sr.organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Service role can manage all (for cron jobs and webhooks)
CREATE POLICY "Service role can manage activation events"
  ON activation_events FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================
-- A3: Extend activator availability settings
-- ============================================

ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS
  min_notice_hours INT DEFAULT 2,
  booking_window_days INT DEFAULT 14,
  meeting_link TEXT; -- Static Google Meet link

-- Comments
COMMENT ON COLUMN agent_schedules.min_notice_hours IS 'Minimum hours notice required for booking (default 2)';
COMMENT ON COLUMN agent_schedules.booking_window_days IS 'How many days ahead to show slots (default 14)';
COMMENT ON COLUMN agent_schedules.meeting_link IS 'Static Google Meet link for all meetings';

-- ============================================
-- Migration Summary
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Onboarding Scheduling System Migration Complete ===';
  RAISE NOTICE 'Extended activation_status enum with attended/no_show';
  RAISE NOTICE 'Added scheduling/tracking columns to trial_pipeline';
  RAISE NOTICE 'Created activation_events audit log table';
  RAISE NOTICE 'Extended agent_schedules with min_notice_hours, booking_window_days, meeting_link';
END $$;


