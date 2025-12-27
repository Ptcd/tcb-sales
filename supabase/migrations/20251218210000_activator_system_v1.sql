-- Phase 1.1: Data additions to trial_pipeline
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS assigned_activator_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescue_attempts INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_timezone TEXT;


