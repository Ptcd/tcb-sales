-- Phone Number Assignment System Migration
-- Adds support for assigning Twilio phone numbers to users and campaigns

-- ============================================
-- 1. Add columns to twilio_phone_numbers table
-- ============================================

-- Add assigned_user_id to track which user owns this number
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add campaign_id for campaign-specific numbers
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Add voicemail_greeting for custom greetings per number
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS voicemail_greeting TEXT;

-- Add ring_timeout_seconds for custom ring timeout per number (default 20 seconds)
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS ring_timeout_seconds INTEGER DEFAULT 20;

-- ============================================
-- 2. Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_assigned_user_id 
ON twilio_phone_numbers(assigned_user_id) 
WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_campaign_id 
ON twilio_phone_numbers(campaign_id) 
WHERE campaign_id IS NOT NULL;

-- ============================================
-- 3. Add comments for documentation
-- ============================================

COMMENT ON COLUMN twilio_phone_numbers.assigned_user_id IS 'User ID of the team member assigned to this phone number. Calls to this number will route to this user first.';
COMMENT ON COLUMN twilio_phone_numbers.campaign_id IS 'Campaign ID this phone number is associated with. Used for round-robin routing to campaign teammates.';
COMMENT ON COLUMN twilio_phone_numbers.voicemail_greeting IS 'Custom voicemail greeting message for this phone number. If null, uses organization default.';
COMMENT ON COLUMN twilio_phone_numbers.ring_timeout_seconds IS 'Number of seconds to ring before moving to next step (round-robin or voicemail). Default is 20 seconds.';

-- ============================================
-- 4. Update RLS policies if needed
-- ============================================

-- Ensure users can view phone numbers in their organization
-- (Assuming RLS policies already exist from previous migrations)

