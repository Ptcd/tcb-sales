-- Activator Modal and State Machine Migration
-- Implements: state machine, counters, enums, reconciliation fields

-- ============================================
-- 1. Create ENUMs for activation modal
-- ============================================

-- Proof method for installed outcomes
DO $$ BEGIN
  CREATE TYPE proof_method_type AS ENUM ('credits_decremented', 'test_lead_confirmed', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Block reason enum
DO $$ BEGIN
  CREATE TYPE block_reason_type AS ENUM (
    'no_website_login',
    'web_person_absent', 
    'permission_needed',
    'technical_issue',
    'dns_hosting_missing',
    'client_confusion',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Block owner enum
DO $$ BEGIN
  CREATE TYPE block_owner_type AS ENUM ('client_owner', 'client_web_person', 'our_team', 'mixed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Next step enum
DO $$ BEGIN
  CREATE TYPE next_step_type AS ENUM (
    'get_credentials',
    'invite_web_person',
    'troubleshooting',
    'send_instructions',
    'schedule_second_attempt',
    'waiting_approval',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Reschedule reason enum
DO $$ BEGIN
  CREATE TYPE reschedule_reason_type AS ENUM (
    'client_requested',
    'web_person_unavailable',
    'credentials_not_ready',
    'activator_conflict',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Cancel reason enum
DO $$ BEGIN
  CREATE TYPE cancel_reason_type AS ENUM ('client_unavailable', 'website_not_ready', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Canceled by enum
DO $$ BEGIN
  CREATE TYPE canceled_by_type AS ENUM ('client', 'us');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Kill reason enum (extended)
DO $$ BEGIN
  CREATE TYPE activation_kill_reason_extended AS ENUM (
    'no_website',
    'not_buying_junk_cars',
    'pricing_objection',
    'not_decision_maker',
    'competitor',
    'ghosted',
    'repeated_no_show',
    'stalled_install',
    'excessive_reschedules',
    'no_access',
    'no_response',
    'no_technical_owner',
    'no_urgency',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Follow-up owner role enum
DO $$ BEGIN
  CREATE TYPE followup_owner_role AS ENUM ('sdr', 'activator');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. Extend activation_meetings table
-- ============================================

-- Add new fields to activation_meetings
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS proof_method proof_method_type,
ADD COLUMN IF NOT EXISTS lead_delivery_methods text[],
ADD COLUMN IF NOT EXISTS primary_recipient text,
ADD COLUMN IF NOT EXISTS client_confirmed_receipt boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS block_reason block_reason_type,
ADD COLUMN IF NOT EXISTS block_owner block_owner_type,
ADD COLUMN IF NOT EXISTS next_step next_step_type,
ADD COLUMN IF NOT EXISTS reschedule_reason reschedule_reason_type,
ADD COLUMN IF NOT EXISTS cancel_reason cancel_reason_type,
ADD COLUMN IF NOT EXISTS canceled_by canceled_by_type,
ADD COLUMN IF NOT EXISTS kill_reason text,
ADD COLUMN IF NOT EXISTS contact_attempted text[],
ADD COLUMN IF NOT EXISTS web_person_invited boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attempt_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_meeting_id uuid REFERENCES activation_meetings(id),
ADD COLUMN IF NOT EXISTS outcome_notes text;

-- Add completed_by_user_id if not exists
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS completed_by_user_id uuid REFERENCES user_profiles(id);

-- ============================================
-- 3. Extend trial_pipeline table
-- ============================================

-- Convert activation_status to text if it's still an enum
ALTER TABLE trial_pipeline 
ALTER COLUMN activation_status TYPE text 
USING activation_status::text;

-- Add state machine counters and fields
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS no_show_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS reschedule_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS block_reason text,
ADD COLUMN IF NOT EXISTS block_owner text,
ADD COLUMN IF NOT EXISTS next_step text,
ADD COLUMN IF NOT EXISTS followup_owner_role text,
ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
ADD COLUMN IF NOT EXISTS followup_reason text,
ADD COLUMN IF NOT EXISTS last_meeting_outcome text,
ADD COLUMN IF NOT EXISTS credits_remaining integer DEFAULT 20;

-- ============================================
-- 4. Create indexes for queue queries
-- ============================================

-- SDR Queue index: followup_owner_role = 'sdr', overdue follow-ups
CREATE INDEX IF NOT EXISTS idx_trial_pipeline_sdr_queue 
ON trial_pipeline(followup_owner_role, activation_status, next_followup_at)
WHERE followup_owner_role = 'sdr' AND credits_remaining = 20;

-- Activator Queue index: followup_owner_role = 'activator', blocked installs
CREATE INDEX IF NOT EXISTS idx_trial_pipeline_activator_queue 
ON trial_pipeline(followup_owner_role, activation_status, next_followup_at)
WHERE followup_owner_role = 'activator' AND credits_remaining = 20;

-- Install marked but not proven (credits still 20 after completion)
CREATE INDEX IF NOT EXISTS idx_activation_meetings_unproven 
ON activation_meetings(completed_at, status)
WHERE status = 'completed';

-- ============================================
-- 5. Comments for documentation
-- ============================================

COMMENT ON COLUMN trial_pipeline.activation_status IS 
'State machine: queued, blocked, no_show, active (terminal), killed (terminal)';

COMMENT ON COLUMN trial_pipeline.no_show_count IS 
'Count of no-shows. Auto-kill at >= 2';

COMMENT ON COLUMN trial_pipeline.reschedule_count IS 
'Count of reschedules. Auto-kill at >= 3';

COMMENT ON COLUMN trial_pipeline.followup_owner_role IS 
'Who owns follow-up: sdr (no-shows/cancels) or activator (blocked)';

COMMENT ON COLUMN activation_meetings.attempt_number IS 
'Which install attempt this is. Increments on new meetings for same pipeline';

COMMENT ON COLUMN activation_meetings.parent_meeting_id IS 
'Link to previous meeting if this is a reschedule/second attempt';

-- ============================================
-- 6. Migration summary
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Activator Modal + State Machine Migration Complete ===';
  RAISE NOTICE 'Created enums: proof_method, block_reason, block_owner, next_step, etc.';
  RAISE NOTICE 'Extended activation_meetings with modal fields';
  RAISE NOTICE 'Extended trial_pipeline with state machine counters';
  RAISE NOTICE 'Created indexes for queue queries';
END $$;


