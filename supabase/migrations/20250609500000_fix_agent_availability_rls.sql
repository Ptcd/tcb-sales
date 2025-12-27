-- Fix RLS policy on agent_availability to allow users to manage their own records
-- The key issue: users must be able to access their OWN row by user_id, not just by org

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can view availability in their org" ON agent_availability;
DROP POLICY IF EXISTS "Users can insert their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can update their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can delete their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Admins can view org availability" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_select_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_insert_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_update_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_delete_policy" ON agent_availability;

-- Enable RLS if not already enabled
ALTER TABLE agent_availability ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own availability (by user_id, NOT org)
CREATE POLICY "Users can view their own availability"
ON agent_availability FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own availability
CREATE POLICY "Users can insert their own availability"
ON agent_availability FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own availability
CREATE POLICY "Users can update their own availability"
ON agent_availability FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own availability
CREATE POLICY "Users can delete their own availability"
ON agent_availability FOR DELETE
USING (auth.uid() = user_id);

-- Also allow admins to view all availability in their org (for team status views)
CREATE POLICY "Admins can view org availability"
ON agent_availability FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.role = 'admin'
    AND up.organization_id = agent_availability.organization_id
  )
);

-- Clean up orphaned agent_availability rows (where org doesn't match user's current org)
-- This fixes users who were moved between organizations
UPDATE agent_availability aa
SET organization_id = up.organization_id
FROM user_profiles up
WHERE aa.user_id = up.id
AND aa.organization_id != up.organization_id;

