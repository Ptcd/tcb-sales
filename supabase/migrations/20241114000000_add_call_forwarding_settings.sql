-- Add call forwarding settings to user_profiles table
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS forwarding_phone TEXT,
  ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'available' CHECK (call_status IN ('available', 'unavailable')),
  ADD COLUMN IF NOT EXISTS voicemail_message TEXT DEFAULT 'Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.';

-- Add comment
COMMENT ON COLUMN user_profiles.forwarding_phone IS 'Phone number where inbound calls should be forwarded';
COMMENT ON COLUMN user_profiles.call_status IS 'Availability status: available or unavailable';
COMMENT ON COLUMN user_profiles.voicemail_message IS 'Custom voicemail greeting message';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_call_status ON user_profiles(call_status);

