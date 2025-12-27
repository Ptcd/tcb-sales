-- Twilio Cost Controls Migration
-- Adds columns for conditional recording, max duration limits, transcription control

-- Add new cost control columns
ALTER TABLE organization_call_settings
ADD COLUMN IF NOT EXISTS record_after_seconds INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS recording_retention_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS voicemail_transcription_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS max_call_duration_sdr_seconds INTEGER DEFAULT 1200,
ADD COLUMN IF NOT EXISTS max_call_duration_activator_seconds INTEGER DEFAULT 2700;

-- Update default for recording_enabled to FALSE for cost savings
-- New orgs will have recording OFF by default
ALTER TABLE organization_call_settings
ALTER COLUMN recording_enabled SET DEFAULT FALSE;

-- Add comment explaining the columns
COMMENT ON COLUMN organization_call_settings.record_after_seconds IS 'Only start recording after call exceeds this duration (seconds). Default 30.';
COMMENT ON COLUMN organization_call_settings.recording_retention_hours IS 'Delete recordings after this many hours. Default 24.';
COMMENT ON COLUMN organization_call_settings.voicemail_transcription_enabled IS 'Whether to transcribe voicemails. Default FALSE to save costs.';
COMMENT ON COLUMN organization_call_settings.max_call_duration_sdr_seconds IS 'Max call duration for SDRs before auto-termination. Default 1200 (20 min).';
COMMENT ON COLUMN organization_call_settings.max_call_duration_activator_seconds IS 'Max call duration for activators before auto-termination. Default 2700 (45 min).';

