-- Fix Missing Schema Elements
-- Run this in Supabase SQL Editor

-- 1. Add phone_number to user_profiles if missing
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 1a. Add sdr_code to user_profiles if missing (required for profile API)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS sdr_code TEXT UNIQUE;

-- Create index for sdr_code lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_sdr_code 
  ON user_profiles(sdr_code) 
  WHERE sdr_code IS NOT NULL;

-- 2. Create sms_messages table if not exists
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  status TEXT DEFAULT 'sent',
  twilio_sid TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_organization_id ON sms_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at DESC);

-- 3. Create lead_notifications table if not exists
CREATE TABLE IF NOT EXISTS lead_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lead_notifications_lead_id ON lead_notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_sdr_user_id ON lead_notifications(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_read ON lead_notifications(read) WHERE read = FALSE;

-- 4. Create conversation_threads view
DROP VIEW IF EXISTS conversation_threads;
CREATE OR REPLACE VIEW conversation_threads AS
SELECT 
  sr.id as lead_id,
  sr.name as lead_name,
  sr.phone as lead_phone,
  sr.address as lead_address,
  sr.organization_id,
  COALESCE(sr.lead_source, 'google_maps') as lead_source,
  COUNT(sm.id) as message_count,
  COUNT(sm.id) FILTER (WHERE sm.is_read = FALSE AND sm.direction = 'inbound') as unread_count,
  MAX(sm.sent_at) as last_message_at,
  (SELECT sm2.message 
   FROM sms_messages sm2 
   WHERE sm2.lead_id = sr.id 
   ORDER BY sm2.sent_at DESC 
   LIMIT 1) as last_message,
  (SELECT sm2.direction 
   FROM sms_messages sm2 
   WHERE sm2.lead_id = sr.id 
   ORDER BY sm2.sent_at DESC 
   LIMIT 1) as last_message_direction
FROM search_results sr
LEFT JOIN sms_messages sm ON sr.id = sm.lead_id
WHERE EXISTS (SELECT 1 FROM sms_messages WHERE lead_id = sr.id)
GROUP BY sr.id, sr.name, sr.phone, sr.address, sr.organization_id, sr.lead_source;

-- 5. Enable RLS on new tables
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_notifications ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies
DROP POLICY IF EXISTS "Users can view their organization's SMS messages" ON sms_messages;
CREATE POLICY "Users can view their organization's SMS messages" ON sms_messages
  FOR ALL USING (organization_id = (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view their own notifications" ON lead_notifications;
CREATE POLICY "Users can view their own notifications" ON lead_notifications
  FOR ALL USING (sdr_user_id = auth.uid());

-- Done!
SELECT 'Schema fix complete!' as status;

