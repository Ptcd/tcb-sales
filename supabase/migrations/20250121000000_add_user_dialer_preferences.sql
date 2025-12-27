-- Add per-user dialer preferences for remembering outbound number choice
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS preferred_outbound_number TEXT,
ADD COLUMN IF NOT EXISTS remember_outbound_number BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_call_single_number BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS preferred_call_mode TEXT CHECK (preferred_call_mode IN ('webrtc', 'live', 'voicemail')) DEFAULT 'webrtc';

COMMENT ON COLUMN user_settings.preferred_outbound_number IS 'Saved outbound caller ID to skip number selection';
COMMENT ON COLUMN user_settings.remember_outbound_number IS 'Whether to re-use the saved caller ID without prompting';
COMMENT ON COLUMN user_settings.auto_call_single_number IS 'Allow skipping selection when only one caller ID is available';
COMMENT ON COLUMN user_settings.preferred_call_mode IS 'Default call mode (webrtc, live, voicemail) used to auto-start calls';

