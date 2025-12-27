-- Dialer System: Call Management and Logging
-- This migration adds calling functionality for outbound marketing

-- 1. Create calls table for call log/history
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'outbound' CHECK (call_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'busy', 'no_answer', 'failed', 'cancelled')),
  duration INTEGER DEFAULT 0, -- Duration in seconds
  twilio_call_sid TEXT, -- Twilio call SID for tracking
  twilio_recording_sid TEXT, -- Twilio recording SID if recorded
  recording_url TEXT, -- URL to call recording
  notes TEXT, -- Call notes/outcome
  outcome TEXT CHECK (outcome IN ('interested', 'not_interested', 'callback_requested', 'no_answer', 'busy', 'wrong_number', 'do_not_call')),
  callback_date TIMESTAMPTZ, -- When to call back
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_initiated_at ON calls(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);
CREATE INDEX IF NOT EXISTS idx_calls_callback_date ON calls(callback_date) WHERE callback_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;

-- Add comments
COMMENT ON TABLE calls IS 'Call log for tracking all phone calls made to leads';
COMMENT ON COLUMN calls.status IS 'Call status: initiated, ringing, answered, completed, busy, no_answer, failed, cancelled';
COMMENT ON COLUMN calls.outcome IS 'Call outcome: interested, not_interested, callback_requested, no_answer, busy, wrong_number, do_not_call';
COMMENT ON COLUMN calls.duration IS 'Call duration in seconds';
COMMENT ON COLUMN calls.twilio_call_sid IS 'Twilio call SID for tracking and webhooks';

-- 2. Add call fields to search_results for tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS last_call_made_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_call_duration INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_search_results_last_call ON search_results(last_call_made_at);
CREATE INDEX IF NOT EXISTS idx_search_results_call_count ON search_results(call_count);

COMMENT ON COLUMN search_results.last_call_made_at IS 'Timestamp of the last call made to this lead';
COMMENT ON COLUMN search_results.call_count IS 'Total number of calls made to this lead';
COMMENT ON COLUMN search_results.total_call_duration IS 'Total call duration in seconds for this lead';

-- 3. Create trigger to update call statistics
CREATE OR REPLACE FUNCTION update_lead_call_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_results
  SET 
    call_count = call_count + 1,
    last_call_made_at = NEW.initiated_at,
    total_call_duration = total_call_duration + COALESCE(NEW.duration, 0)
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_call_stats ON calls;
CREATE TRIGGER trigger_update_call_stats
  AFTER INSERT ON calls
  FOR EACH ROW
  WHEN (NEW.status = 'completed' OR NEW.status = 'answered')
  EXECUTE FUNCTION update_lead_call_stats();

-- 4. Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- calls policies
CREATE POLICY "Users can view their own calls"
ON calls FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create calls for their leads"
ON calls FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own calls"
ON calls FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own calls"
ON calls FOR DELETE
TO public
USING (user_id = auth.uid());

-- 5. Create view for call history with lead info
CREATE OR REPLACE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id;

COMMENT ON VIEW user_call_history IS 'Call history with lead information for comprehensive call tracking';

-- 6. Create function to get call statistics
CREATE OR REPLACE FUNCTION get_user_call_stats(user_uuid UUID)
RETURNS TABLE (
  total_calls BIGINT,
  answered_calls BIGINT,
  total_duration BIGINT,
  avg_duration NUMERIC,
  calls_today BIGINT,
  callback_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'answered' OR status = 'completed') as answered_calls,
    COALESCE(SUM(duration), 0) as total_duration,
    COALESCE(AVG(duration), 0) as avg_duration,
    COUNT(*) FILTER (WHERE DATE(initiated_at) = CURRENT_DATE) as calls_today,
    COUNT(*) FILTER (WHERE outcome = 'callback_requested') as callback_requests
  FROM calls 
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_call_stats IS 'Get comprehensive call statistics for a user';
