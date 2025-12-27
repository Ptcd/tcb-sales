-- Allow activators to manage their own schedules
-- This fixes the RLS policy issue where non-admin activators couldn't save their availability settings

CREATE POLICY "Users can manage their own schedules"
ON agent_schedules FOR ALL
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());


