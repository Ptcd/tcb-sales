-- Add timezone column to agent_schedules
ALTER TABLE agent_schedules
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Add timezone column to user_profiles for convenience
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';


