-- Allow Multiple Shifts Per Day Migration
-- Removes the UNIQUE constraint on (user_id, day_of_week) to allow multiple shifts per day

-- ============================================
-- Remove UNIQUE constraint
-- ============================================

-- Drop the existing unique constraint
ALTER TABLE agent_schedules 
DROP CONSTRAINT IF EXISTS agent_schedules_user_id_day_of_week_key;

-- Add a new unique constraint that includes an identifier for multiple shifts
-- We'll use a composite key with (user_id, day_of_week, start_time, end_time)
-- This allows multiple shifts per day but prevents exact duplicates
ALTER TABLE agent_schedules
ADD CONSTRAINT agent_schedules_user_day_shift_unique 
UNIQUE(user_id, day_of_week, start_time, end_time);

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Allow Multiple Shifts Per Day Migration Complete ===';
  RAISE NOTICE 'Removed UNIQUE(user_id, day_of_week) constraint';
  RAISE NOTICE 'Added UNIQUE(user_id, day_of_week, start_time, end_time) to prevent exact duplicates';
  RAISE NOTICE 'Activators can now have multiple shifts per day (e.g., 9 PM-11:59 PM and 12 AM-5 AM)';
END $$;


