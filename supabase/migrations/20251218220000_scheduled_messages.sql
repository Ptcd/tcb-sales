-- Phase 3.1: Scheduled Messages table for reminders
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'install_reminder_24h'
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled/sent/canceled/failed
  payload JSONB NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for cron job performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_send_at ON scheduled_messages(status, send_at);


