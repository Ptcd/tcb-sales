-- =============================================
-- CAPITAL GOVERNANCE V1 SCHEMA
-- =============================================
-- This migration creates the capital governance system for distribution experiments
-- with capital discipline, stable mechanics, and human judgment.

-- Note: Legacy field followup_variant exists on trial_pipeline; not migrated in V1.

-- 1.1 PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the one product
INSERT INTO products (name, active) 
VALUES ('Junk Car Calculator', true)
ON CONFLICT (name) DO NOTHING;

-- 1.2 EXTEND CAMPAIGNS (nullable fields only, non-breaking)
ALTER TABLE campaigns 
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS capital_budget_usd NUMERIC(12,2);

-- 1.3 EXPERIMENTS TABLE
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'planned' 
    CHECK (status IN ('planned', 'running', 'paused', 'completed', 'terminated')),
  start_date DATE,
  end_date DATE,
  -- TIMESTAMPS for event attribution (not just dates)
  started_at TIMESTAMPTZ,  -- When status changed to 'running'
  ended_at TIMESTAMPTZ,    -- When status changed to 'completed'/'terminated'
  capital_cap_usd NUMERIC(12,2),
  time_cap_days INTEGER,
  tranche_size_usd NUMERIC(12,2),
  primary_success_event TEXT,
  secondary_events JSONB NOT NULL DEFAULT '[]',
  bonus_rules JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_campaign_id ON experiments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_started_at ON experiments(started_at) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_experiments_ended_at ON experiments(ended_at) WHERE ended_at IS NOT NULL;

-- PARTIAL UNIQUE INDEX: Only one 'running' experiment per campaign (DB-enforced)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_experiment_per_campaign 
  ON experiments(campaign_id) 
  WHERE status = 'running';

-- 1.4 EXTEND USER_PROFILES
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS hourly_rate_usd NUMERIC(8,2);

-- 1.5 TIME_LOGS TABLE
CREATE TABLE IF NOT EXISTS time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours_logged NUMERIC(4,2) NOT NULL CHECK (hours_logged >= 0 AND hours_logged <= 24),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_member_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_time_logs_campaign_date ON time_logs(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_time_logs_team_member ON time_logs(team_member_id);

-- 2.1 PERFORMANCE_EVENTS TABLE
-- Note: lead_id references search_results (the actual leads table)
CREATE TABLE IF NOT EXISTS performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dial_attempt', 'conversation', 'qpc', 'install_scheduled',
    'install_attended', 'calculator_installed', 'paid_conversion'
  )),
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_events_experiment ON performance_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_perf_events_campaign_type ON performance_events(campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_perf_events_timestamp ON performance_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_events_lead ON performance_events(lead_id) WHERE lead_id IS NOT NULL;

-- 2.3 BONUS_EVENTS TABLE
CREATE TABLE IF NOT EXISTS bonus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  performance_event_id UUID REFERENCES performance_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  bonus_amount_usd NUMERIC(8,2) NOT NULL CHECK (bonus_amount_usd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_events_experiment ON bonus_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_bonus_events_team_member ON bonus_events(team_member_id);
-- Ensure one bonus per performance event
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_events_perf_event ON bonus_events(performance_event_id) 
  WHERE performance_event_id IS NOT NULL;

-- 2.6 COST_ROLLUPS TABLE (append-only)
-- V1: Roll labor costs at campaign level only (experiment attribution derived later)
CREATE TABLE IF NOT EXISTS cost_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('labor', 'bonus', 'twilio', 'gcp')),
  cost_usd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent updates (append-only)
CREATE OR REPLACE FUNCTION prevent_cost_rollup_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'cost_rollups table is append-only. Updates not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cost_rollups_no_update ON cost_rollups;
CREATE TRIGGER cost_rollups_no_update
  BEFORE UPDATE ON cost_rollups
  FOR EACH ROW
  EXECUTE FUNCTION prevent_cost_rollup_update();

CREATE INDEX IF NOT EXISTS idx_cost_rollups_campaign_date ON cost_rollups(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_cost_rollups_experiment ON cost_rollups(experiment_id) WHERE experiment_id IS NOT NULL;

-- 3.1 EVALUATIONS TABLE (immutable)
CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'continue', 'stop')),
  reason TEXT CHECK (reason IN (
    'pitch_channel', 'activation_process', 'economics', 'capital_time', 'inconclusive'
  )),
  recommended_next_action TEXT CHECK (recommended_next_action IN (
    'continue_experiment', 'extend_budget', 'start_new_experiment',
    'graduate_campaign', 'kill_campaign'
  )),
  admin_notes TEXT,
  capital_spent_usd NUMERIC(12,2),
  tranches_consumed INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent updates (immutable)
CREATE OR REPLACE FUNCTION prevent_evaluation_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'evaluations table is immutable. Updates not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS evaluations_no_update ON evaluations;
CREATE TRIGGER evaluations_no_update
  BEFORE UPDATE ON evaluations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_evaluation_update();

CREATE INDEX IF NOT EXISTS idx_evaluations_experiment ON evaluations(experiment_id);

-- 3.2 OVERRIDE_LOGS TABLE (stub)
CREATE TABLE IF NOT EXISTS override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id),
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 NOTIFICATION_LOGS TABLE (stub)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id),
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS POLICIES (V1: Admin-only access for governance tables - simplest approach)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE override_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Products: everyone can read, admins can write
DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "products_admin_insert" ON products;
CREATE POLICY "products_admin_insert" ON products FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "products_admin_update" ON products;
CREATE POLICY "products_admin_update" ON products FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Experiments: admins only (all operations)
DROP POLICY IF EXISTS "experiments_admin_all" ON experiments;
CREATE POLICY "experiments_admin_all" ON experiments FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Time logs: admins only
DROP POLICY IF EXISTS "time_logs_admin_all" ON time_logs;
CREATE POLICY "time_logs_admin_all" ON time_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Performance events: admins can write, service role can write (for system events)
DROP POLICY IF EXISTS "perf_events_admin_all" ON performance_events;
CREATE POLICY "perf_events_admin_all" ON performance_events FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Bonus events: admins only
DROP POLICY IF EXISTS "bonus_events_admin_all" ON bonus_events;
CREATE POLICY "bonus_events_admin_all" ON bonus_events FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Cost rollups: admins can read, system can write (via service role)
DROP POLICY IF EXISTS "cost_rollups_admin_select" ON cost_rollups;
CREATE POLICY "cost_rollups_admin_select" ON cost_rollups FOR SELECT 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Evaluations: admins only
DROP POLICY IF EXISTS "evaluations_admin_all" ON evaluations;
CREATE POLICY "evaluations_admin_all" ON evaluations FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Override logs: admins only
DROP POLICY IF EXISTS "override_logs_admin_all" ON override_logs;
CREATE POLICY "override_logs_admin_all" ON override_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Notification logs: admins only
DROP POLICY IF EXISTS "notification_logs_admin_all" ON notification_logs;
CREATE POLICY "notification_logs_admin_all" ON notification_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Helper function: Get running experiment for a campaign at a specific timestamp
-- Used for event attribution
CREATE OR REPLACE FUNCTION get_running_experiment_at_timestamp(
  p_campaign_id UUID,
  p_timestamp TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_experiment_id UUID;
BEGIN
  SELECT id INTO v_experiment_id
  FROM experiments
  WHERE campaign_id = p_campaign_id
    AND status = 'running'
    AND started_at IS NOT NULL
    AND (ended_at IS NULL OR ended_at > p_timestamp)
    AND started_at <= p_timestamp
  ORDER BY started_at DESC
  LIMIT 1;
  
  RETURN v_experiment_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_running_experiment_at_timestamp IS 
  'Returns the experiment_id that was running for a campaign at a specific timestamp. Used for event attribution.';

-- Trigger to update updated_at on experiments
CREATE OR REPLACE FUNCTION update_experiments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments;
CREATE TRIGGER update_experiments_updated_at
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  EXECUTE FUNCTION update_experiments_updated_at();

-- Trigger to update updated_at on time_logs
CREATE OR REPLACE FUNCTION update_time_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_time_logs_updated_at ON time_logs;
CREATE TRIGGER update_time_logs_updated_at
  BEFORE UPDATE ON time_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_time_logs_updated_at();

-- Comments for documentation
COMMENT ON TABLE products IS 'Products that campaigns are associated with. V1: Minimal container.';
COMMENT ON TABLE experiments IS 'Experiments define conversion hypotheses and capital rules. Only one running per campaign.';
COMMENT ON TABLE performance_events IS 'Canonical performance events (facts only). Attributed to running experiment at event_timestamp.';
COMMENT ON TABLE time_logs IS 'Time logged by team members for campaigns. One entry per (team_member, campaign, date).';
COMMENT ON TABLE bonus_events IS 'Bonuses awarded for qualifying events. Only while experiment is running.';
COMMENT ON TABLE cost_rollups IS 'Daily cost rollups by source. Append-only. V1: Labor costs rolled at campaign level.';
COMMENT ON TABLE evaluations IS 'Human judgment on experiments. Immutable after creation.';
COMMENT ON TABLE override_logs IS 'Log of admin overrides tied to evaluations. Stub in V1.';
COMMENT ON TABLE notification_logs IS 'Log of notifications sent. Stub in V1.';

COMMENT ON COLUMN experiments.started_at IS 'Timestamp when experiment status changed to running. Used for event attribution.';
COMMENT ON COLUMN experiments.ended_at IS 'Timestamp when experiment status changed to completed/terminated. Used for event attribution.';
COMMENT ON COLUMN performance_events.experiment_id IS 'Attributed to running experiment at event_timestamp. Null if no experiment was running.';
COMMENT ON COLUMN performance_events.lead_id IS 'References search_results table (the actual leads table).';


