-- Agent Availability and Call Routing System
-- This migration adds tables for managing agent availability, schedules, and call routing logic

-- 1. Agent availability table (tracks real-time login status and availability)
CREATE TABLE IF NOT EXISTS agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_logged_in BOOLEAN DEFAULT false,
  is_available BOOLEAN DEFAULT true,
  webrtc_identity TEXT, -- Twilio WebRTC identity (e.g., "user_123")
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_availability_user_id ON agent_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_org_id ON agent_availability(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_available ON agent_availability(organization_id, is_available, is_logged_in) WHERE is_available = true AND is_logged_in = true;

COMMENT ON TABLE agent_availability IS 'Tracks real-time agent availability and login status for call routing';
COMMENT ON COLUMN agent_availability.webrtc_identity IS 'Twilio WebRTC identity for browser-based calling';

-- 2. Agent schedules table (defines working hours per agent)
CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_agent_schedules_user_id ON agent_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_schedules_org_id ON agent_schedules(organization_id);

COMMENT ON TABLE agent_schedules IS 'Defines working hours for each agent by day of week';

-- 3. Call routing rules table (admin-configurable routing logic)
CREATE TABLE IF NOT EXISTS call_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  priority INTEGER DEFAULT 0, -- Higher priority rules are checked first
  is_active BOOLEAN DEFAULT true,
  
  -- Conditions
  business_hours_start TIME,
  business_hours_end TIME,
  business_days INTEGER[], -- Array of day_of_week (0-6)
  
  -- Actions
  route_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  route_to_phone TEXT, -- Fallback phone number
  route_to_voicemail BOOLEAN DEFAULT false,
  voicemail_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_routing_rules_org_id ON call_routing_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_routing_rules_priority ON call_routing_rules(organization_id, priority DESC, is_active) WHERE is_active = true;

COMMENT ON TABLE call_routing_rules IS 'Admin-configurable call routing rules with priority-based matching';

-- 4. Organization call settings (global settings per org)
CREATE TABLE IF NOT EXISTS organization_call_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  recording_enabled BOOLEAN DEFAULT true,
  recording_retention_days INTEGER DEFAULT 90,
  default_ring_timeout INTEGER DEFAULT 30, -- Seconds to ring before voicemail
  default_voicemail_message TEXT DEFAULT 'Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_call_settings_org_id ON organization_call_settings(organization_id);

COMMENT ON TABLE organization_call_settings IS 'Organization-wide call settings (recording, timeouts, etc.)';

-- 5. Row Level Security Policies

-- Agent availability
ALTER TABLE agent_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view availability in their org"
ON agent_availability FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update their own availability"
ON agent_availability FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own availability"
ON agent_availability FOR INSERT
TO public
WITH CHECK (user_id = auth.uid());

-- Agent schedules
ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in their org"
ON agent_schedules FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage schedules in their org"
ON agent_schedules FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = agent_schedules.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = agent_schedules.organization_id
  )
);

-- Call routing rules
ALTER TABLE call_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view routing rules in their org"
ON call_routing_rules FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage routing rules in their org"
ON call_routing_rules FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = call_routing_rules.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = call_routing_rules.organization_id
  )
);

-- Organization call settings
ALTER TABLE organization_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call settings in their org"
ON organization_call_settings FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage call settings in their org"
ON organization_call_settings FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_call_settings.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_call_settings.organization_id
  )
);

-- 6. Function to check if agent is currently available (considering schedule + login status)
CREATE OR REPLACE FUNCTION is_agent_available(p_user_id UUID, p_check_time TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN AS $$
DECLARE
  v_is_logged_in BOOLEAN;
  v_is_available BOOLEAN;
  v_day_of_week INTEGER;
  v_current_time TIME;
  v_has_schedule BOOLEAN;
BEGIN
  -- Get current day and time
  v_day_of_week := EXTRACT(DOW FROM p_check_time)::INTEGER;
  v_current_time := p_check_time::TIME;
  
  -- Check login and availability status
  SELECT is_logged_in, is_available INTO v_is_logged_in, v_is_available
  FROM agent_availability
  WHERE user_id = p_user_id;
  
  -- If not logged in or marked unavailable, return false
  IF NOT v_is_logged_in OR NOT v_is_available THEN
    RETURN false;
  END IF;
  
  -- Check if agent has a schedule for today
  SELECT EXISTS (
    SELECT 1 FROM agent_schedules
    WHERE user_id = p_user_id
    AND day_of_week = v_day_of_week
    AND is_active = true
  ) INTO v_has_schedule;
  
  -- If no schedule exists, assume always available (when logged in)
  IF NOT v_has_schedule THEN
    RETURN true;
  END IF;
  
  -- Check if current time is within scheduled hours
  RETURN EXISTS (
    SELECT 1 FROM agent_schedules
    WHERE user_id = p_user_id
    AND day_of_week = v_day_of_week
    AND is_active = true
    AND start_time <= v_current_time
    AND end_time >= v_current_time
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_agent_available IS 'Checks if an agent is available based on login status, availability flag, and schedule';

-- 7. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_availability_updated_at
  BEFORE UPDATE ON agent_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_schedules_updated_at
  BEFORE UPDATE ON agent_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_routing_rules_updated_at
  BEFORE UPDATE ON call_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_call_settings_updated_at
  BEFORE UPDATE ON organization_call_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

