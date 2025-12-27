-- Add support for two-way SMS conversations and manual lead creation
-- This migration adds inbound SMS handling and manual lead entries

-- 1. Add direction column to sms_messages for inbound/outbound tracking
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);

-- Add column to track if message was read
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sms_messages_unread ON sms_messages(is_read) WHERE is_read = FALSE;

-- 2. Add source column to search_results to track manual vs Google Maps leads
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'google_maps' CHECK (lead_source IN ('google_maps', 'manual'));

CREATE INDEX IF NOT EXISTS idx_search_results_source ON search_results(lead_source);

-- 3. Modify search_history_id to be nullable for manual leads (they don't have search history)
ALTER TABLE search_results 
ALTER COLUMN search_history_id DROP NOT NULL;

-- 4. Create a view for conversation threads (grouped by lead with latest message)
CREATE OR REPLACE VIEW conversation_threads AS
SELECT 
  sr.id as lead_id,
  sr.name as lead_name,
  sr.phone as lead_phone,
  sr.address as lead_address,
  sr.organization_id,
  sr.lead_source,
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

COMMENT ON VIEW conversation_threads IS 'SMS conversation threads grouped by lead with message counts and latest message info';

-- 5. Update RLS policies for inbound SMS (service role will insert these via webhook)
-- The existing policies already allow team members to view organization SMS messages

-- 6. Add comments
COMMENT ON COLUMN sms_messages.direction IS 'Message direction: inbound (received) or outbound (sent)';
COMMENT ON COLUMN sms_messages.is_read IS 'Whether inbound message has been read by user';
COMMENT ON COLUMN search_results.lead_source IS 'How the lead was added: google_maps or manual';

