-- SMS System: Message Templates and Message Log
-- This migration adds SMS functionality for bulk messaging to leads

-- 1. Create sms_templates table for reusable message templates
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sms_templates_message_length CHECK (char_length(message) <= 1600)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_user_id ON sms_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_templates(is_active) WHERE is_active = true;

-- Add comments
COMMENT ON TABLE sms_templates IS 'Reusable SMS message templates for quick sending';
COMMENT ON COLUMN sms_templates.message IS 'SMS message text (max 1600 chars for multiple SMS segments)';

-- 2. Create sms_messages table for SMS log/history
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'queued')),
  twilio_sid TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Add comments
COMMENT ON TABLE sms_messages IS 'SMS message log for tracking all sent messages';
COMMENT ON COLUMN sms_messages.status IS 'Message status: pending, sent, delivered, failed, queued';
COMMENT ON COLUMN sms_messages.twilio_sid IS 'Twilio message SID for tracking';

-- 3. Add SMS fields to search_results for tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sms_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_search_results_last_sms ON search_results(last_sms_sent_at);

COMMENT ON COLUMN search_results.last_sms_sent_at IS 'Timestamp of the last SMS sent to this lead';
COMMENT ON COLUMN search_results.sms_count IS 'Total number of SMS messages sent to this lead';

-- 4. Create trigger to update sms_count
CREATE OR REPLACE FUNCTION update_lead_sms_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_results
  SET 
    sms_count = sms_count + 1,
    last_sms_sent_at = NEW.sent_at
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_sms_count ON sms_messages;
CREATE TRIGGER trigger_update_sms_count
  AFTER INSERT ON sms_messages
  FOR EACH ROW
  WHEN (NEW.status = 'sent' OR NEW.status = 'delivered')
  EXECUTE FUNCTION update_lead_sms_count();

-- 5. Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- sms_templates policies
CREATE POLICY "Users can view their own templates"
ON sms_templates FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own templates"
ON sms_templates FOR INSERT
TO public
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own templates"
ON sms_templates FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own templates"
ON sms_templates FOR DELETE
TO public
USING (user_id = auth.uid());

-- sms_messages policies
CREATE POLICY "Users can view their own SMS messages"
ON sms_messages FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create SMS messages for their leads"
ON sms_messages FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own SMS messages"
ON sms_messages FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 6. Create view for SMS history with lead info
CREATE OR REPLACE VIEW user_sms_history AS
SELECT 
  sm.id,
  sm.lead_id,
  sm.user_id,
  sm.template_id,
  sm.phone_number,
  sm.message,
  sm.status,
  sm.twilio_sid,
  sm.error_message,
  sm.sent_at,
  sm.delivered_at,
  sm.created_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  st.name as template_name
FROM sms_messages sm
LEFT JOIN search_results sr ON sm.lead_id = sr.id
LEFT JOIN sms_templates st ON sm.template_id = st.id;

COMMENT ON VIEW user_sms_history IS 'SMS message history with lead and template information';

-- 7. Insert some default SMS templates for junk car businesses
INSERT INTO sms_templates (user_id, name, message, is_active) 
SELECT 
  auth.uid(),
  'Initial Contact',
  'Hi! We buy junk cars for cash. Interested in getting a quote for your vehicle? Reply YES for more info.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO sms_templates (user_id, name, message, is_active)
SELECT 
  auth.uid(),
  'Follow Up',
  'Following up on our previous message. We offer top dollar for junk cars. Free towing included! Call us back or reply for a quote.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO sms_templates (user_id, name, message, is_active)
SELECT 
  auth.uid(),
  'Quote Ready',
  'Your quote is ready! We can offer $[AMOUNT] for your vehicle. Same-day pickup available. Reply or call to schedule.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;

