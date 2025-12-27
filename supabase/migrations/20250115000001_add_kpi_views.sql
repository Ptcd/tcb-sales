-- KPI Aggregation Views for Admin Dashboard
-- This migration creates views for aggregating call and SMS metrics

-- 1. Daily call KPIs per organization
CREATE OR REPLACE VIEW organization_call_kpis AS
SELECT 
  c.organization_id,
  DATE(c.initiated_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE c.status = 'answered' OR c.status = 'completed') as answered_calls,
  COUNT(*) FILTER (WHERE c.status = 'no_answer') as no_answer_calls,
  COUNT(*) FILTER (WHERE c.status = 'busy') as busy_calls,
  COUNT(*) FILTER (WHERE c.status = 'failed') as failed_calls,
  COUNT(*) FILTER (WHERE c.voicemail_left = true) as voicemails_left,
  COUNT(*) FILTER (WHERE c.outcome = 'interested') as interested_count,
  COUNT(*) FILTER (WHERE c.outcome = 'callback_requested') as callback_requested_count,
  COUNT(*) FILTER (WHERE c.callback_date IS NOT NULL) as callbacks_scheduled,
  AVG(c.duration) FILTER (WHERE c.duration > 0) as avg_duration_seconds,
  SUM(c.duration) as total_duration_seconds,
  COUNT(DISTINCT c.user_id) as unique_callers,
  COUNT(DISTINCT c.lead_id) as unique_leads_called
FROM calls c
WHERE c.organization_id IS NOT NULL
GROUP BY c.organization_id, DATE(c.initiated_at);

COMMENT ON VIEW organization_call_kpis IS 'Daily call metrics aggregated by organization';

-- 2. Daily SMS KPIs per organization
CREATE OR REPLACE VIEW organization_sms_kpis AS
SELECT 
  sm.organization_id,
  DATE(sm.sent_at) as sms_date,
  COUNT(*) as total_sms,
  COUNT(*) FILTER (WHERE sm.status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE sm.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE sm.status = 'failed') as failed_count,
  COUNT(DISTINCT sm.user_id) as unique_senders,
  COUNT(DISTINCT sm.lead_id) as unique_leads_texted
FROM sms_messages sm
WHERE sm.organization_id IS NOT NULL
GROUP BY sm.organization_id, DATE(sm.sent_at);

COMMENT ON VIEW organization_sms_kpis IS 'Daily SMS metrics aggregated by organization';

-- 3. User performance KPIs (for rep leaderboards)
CREATE OR REPLACE VIEW user_call_performance AS
SELECT 
  c.user_id,
  c.organization_id,
  DATE(c.initiated_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE c.status = 'answered' OR c.status = 'completed') as answered_calls,
  COUNT(*) FILTER (WHERE c.outcome = 'interested') as interested_count,
  COUNT(*) FILTER (WHERE c.outcome = 'callback_requested') as callback_requested_count,
  AVG(c.duration) FILTER (WHERE c.duration > 0) as avg_duration_seconds,
  SUM(c.duration) as total_duration_seconds
FROM calls c
WHERE c.user_id IS NOT NULL AND c.organization_id IS NOT NULL
GROUP BY c.user_id, c.organization_id, DATE(c.initiated_at);

COMMENT ON VIEW user_call_performance IS 'Daily call performance metrics per user';

-- 4. Grant access to authenticated users (via RLS on underlying tables)
-- Views inherit RLS from base tables, so users can only see their org's data

