-- Add error tracking columns to sms_messages table
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for faster lookups by twilio_sid (for status updates)
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_sid);

