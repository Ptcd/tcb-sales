-- Add Scheduling Outcome Codes Migration
-- Adds missing outcome codes for the scheduling flow

-- ============================================
-- Add new outcome codes to call_outcome_code enum
-- ============================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- We need to use DO blocks with exception handling

DO $$ 
BEGIN
  -- Add ONBOARDING_SCHEDULED
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'ONBOARDING_SCHEDULED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'ONBOARDING_SCHEDULED';
  END IF;
END $$;

DO $$ 
BEGIN
  -- Add SCHEDULE_REFUSED
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SCHEDULE_REFUSED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'SCHEDULE_REFUSED';
  END IF;
END $$;

DO $$ 
BEGIN
  -- Add DM_UNAVAILABLE
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'DM_UNAVAILABLE' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'DM_UNAVAILABLE';
  END IF;
END $$;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Add Scheduling Outcome Codes Migration Complete ===';
  RAISE NOTICE 'Added to call_outcome_code enum: ONBOARDING_SCHEDULED, SCHEDULE_REFUSED, DM_UNAVAILABLE';
END $$;


