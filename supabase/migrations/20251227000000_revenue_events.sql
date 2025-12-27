-- =============================================
-- REVENUE EVENTS TABLE
-- =============================================
-- Track revenue from paid conversions for budget burn tracking
-- Mirrors cost_rollups structure but for revenue

-- Revenue events table (mirrors cost_rollups structure)
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'paid_subscription',
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_campaign ON revenue_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_revenue_events_created ON revenue_events(created_at);

-- RLS
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_events_admin_select" ON revenue_events;
CREATE POLICY "revenue_events_admin_select" ON revenue_events FOR SELECT 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE revenue_events IS 'Revenue from paid conversions. amount_usd = MRR from subscription.';

