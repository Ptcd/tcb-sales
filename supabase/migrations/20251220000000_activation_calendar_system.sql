-- Activation Calendar System Migration
-- Adds availability settings to agent_schedules and creates activation_meetings table

-- 1. Add availability settings to agent_schedules
ALTER TABLE agent_schedules
ADD COLUMN IF NOT EXISTS meeting_duration_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS buffer_before_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS buffer_after_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS max_meetings_per_day INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS is_accepting_meetings BOOLEAN DEFAULT true;

-- 2. Create activation_meetings table
CREATE TYPE IF NOT EXISTS activation_meeting_status AS ENUM ('scheduled', 'completed', 'no_show', 'rescheduled', 'canceled');
CREATE TYPE IF NOT EXISTS attendee_role AS ENUM ('owner', 'web_guy', 'office_manager', 'other');
CREATE TYPE IF NOT EXISTS website_platform AS ENUM ('wordpress', 'wix', 'squarespace', 'shopify', 'none', 'unknown', 'other');

CREATE TABLE IF NOT EXISTS activation_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  scheduled_timezone TEXT NOT NULL,
  
  -- Assignment
  activator_user_id UUID NOT NULL REFERENCES auth.users(id),
  scheduled_by_sdr_user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Status
  status activation_meeting_status DEFAULT 'scheduled',
  
  -- Attendee info (REQUIRED by SDR)
  attendee_name TEXT NOT NULL,
  attendee_role attendee_role NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  
  -- Context (REQUIRED by SDR)
  website_platform website_platform NOT NULL,
  goal TEXT NOT NULL,
  objections TEXT,
  notes TEXT,
  
  -- Email tracking
  confirmation_sent_at TIMESTAMPTZ,
  reminder_24h_sent_at TIMESTAMPTZ,
  
  -- Rescheduling
  rescheduled_from_id UUID REFERENCES activation_meetings(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_activation_meetings_activator ON activation_meetings(activator_user_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_sdr ON activation_meetings(scheduled_by_sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_status ON activation_meetings(status, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_org ON activation_meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_reminder ON activation_meetings(scheduled_start_at) 
  WHERE reminder_24h_sent_at IS NULL AND status = 'scheduled';

-- 4. RLS policies
ALTER TABLE activation_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view meetings in their org" ON activation_meetings;
CREATE POLICY "Users can view meetings in their org"
ON activation_meetings FOR SELECT
USING (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert meetings in their org" ON activation_meetings;
CREATE POLICY "Users can insert meetings in their org"
ON activation_meetings FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update meetings in their org" ON activation_meetings;
CREATE POLICY "Users can update meetings in their org"
ON activation_meetings FOR UPDATE
USING (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

-- 5. Updated_at trigger (function should already exist from previous migrations)
CREATE TRIGGER update_activation_meetings_updated_at
  BEFORE UPDATE ON activation_meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


