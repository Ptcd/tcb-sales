-- Add activation_status enum type
DO $$ BEGIN
  CREATE TYPE activation_status_type AS ENUM ('queued', 'in_progress', 'scheduled', 'activated', 'killed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add kill_reason enum type  
DO $$ BEGIN
  CREATE TYPE activation_kill_reason AS ENUM ('no_access', 'no_response', 'no_technical_owner', 'no_urgency', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to trial_pipeline
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS activation_status activation_status_type DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS next_action TEXT,
ADD COLUMN IF NOT EXISTS scheduled_install_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS technical_owner_name TEXT,
ADD COLUMN IF NOT EXISTS activation_kill_reason activation_kill_reason;

-- Set existing records to 'queued' if they have no status
UPDATE trial_pipeline 
SET activation_status = 'queued' 
WHERE activation_status IS NULL AND marked_lost_at IS NULL;

-- Set existing killed records to 'killed' status
UPDATE trial_pipeline 
SET activation_status = 'killed' 
WHERE marked_lost_at IS NOT NULL;


