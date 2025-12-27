-- Performance Dashboards, Scoring and Weekly Reporting Schema
-- Creates weekly performance snapshots for SDRs and Activators
-- Adds performance notes system and completed_at tracking

-- ============================================
-- 1. Add completed_at to activation_meetings
-- ============================================
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill: Set completed_at = updated_at for existing completed meetings
UPDATE activation_meetings
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

-- Index for performance queries
CREATE INDEX IF NOT EXISTS idx_activation_meetings_completed_at 
  ON activation_meetings(completed_at) 
  WHERE completed_at IS NOT NULL;

-- ============================================
-- 2. Create activator_weekly_performance table
-- ============================================
CREATE TABLE IF NOT EXISTS activator_weekly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Hours
  hours_worked NUMERIC(10,2) DEFAULT 0,
  
  -- Core Metrics
  attended_appointments INTEGER DEFAULT 0,
  completed_installs INTEGER DEFAULT 0,  -- first_lead_received
  
  -- Rates
  completion_rate NUMERIC(5,2),  -- completed / attended
  avg_time_to_live_hours NUMERIC(10,2),  -- attended → first_lead
  pct_lead_within_72h NUMERIC(5,2),
  stalled_installs INTEGER DEFAULT 0,  -- 7+ days no first_lead
  
  -- Scoring
  expected_installs_min NUMERIC(5,2),
  expected_installs_max NUMERIC(5,2),
  score_band TEXT CHECK (score_band IN ('green', 'yellow', 'orange', 'red')),
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(activator_user_id, week_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activator_perf_user_week 
  ON activator_weekly_performance(activator_user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_activator_perf_week 
  ON activator_weekly_performance(week_start DESC);

-- Comments
COMMENT ON TABLE activator_weekly_performance IS 'Weekly performance snapshots for Activators';
COMMENT ON COLUMN activator_weekly_performance.completed_installs IS 'Count of installs where first_lead_received_at is set';
COMMENT ON COLUMN activator_weekly_performance.avg_time_to_live_hours IS 'Average hours from attended appointment to first lead received';
COMMENT ON COLUMN activator_weekly_performance.stalled_installs IS 'Installs where attended > 7 days ago but no first_lead_received_at';

-- ============================================
-- 3. Create sdr_weekly_performance table
-- ============================================
CREATE TABLE IF NOT EXISTS sdr_weekly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Hours
  hours_worked NUMERIC(10,2) DEFAULT 0,
  
  -- Core Metrics (Phase 1 focused)
  install_appointments_attended INTEGER DEFAULT 0,
  install_appointments_booked INTEGER DEFAULT 0,
  show_rate NUMERIC(5,2),  -- attended / booked
  conversations INTEGER DEFAULT 0,
  dials INTEGER DEFAULT 0,
  
  -- Scoring
  expected_attended_min NUMERIC(5,2),
  expected_attended_max NUMERIC(5,2),
  score_band TEXT CHECK (score_band IN ('green', 'yellow', 'orange', 'red')),
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(sdr_user_id, week_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sdr_perf_user_week 
  ON sdr_weekly_performance(sdr_user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_perf_week 
  ON sdr_weekly_performance(week_start DESC);

-- Comments
COMMENT ON TABLE sdr_weekly_performance IS 'Weekly performance snapshots for SDRs';
COMMENT ON COLUMN sdr_weekly_performance.install_appointments_attended IS 'Count of activation_meetings with status = completed';
COMMENT ON COLUMN sdr_weekly_performance.show_rate IS 'Percentage: attended / booked * 100';

-- ============================================
-- 4. Create performance_notes table
-- ============================================
CREATE TABLE IF NOT EXISTS performance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,  -- max 200 chars enforced in app
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_performance_notes_user_week 
  ON performance_notes(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_performance_notes_week 
  ON performance_notes(week_start DESC);

-- Comments
COMMENT ON TABLE performance_notes IS 'Short-term context notes for performance anomalies (not scored)';
COMMENT ON COLUMN performance_notes.note IS 'Max 200 characters - brief context only';

-- ============================================
-- 5. RLS Policies
-- ============================================

-- Activator weekly performance
ALTER TABLE activator_weekly_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activators can view their own performance"
  ON activator_weekly_performance FOR SELECT
  USING (activator_user_id = auth.uid());

CREATE POLICY "Admins can view all activator performance in their org"
  ON activator_weekly_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = activator_weekly_performance.activator_user_id
    )
  );

CREATE POLICY "Service role can manage activator performance"
  ON activator_weekly_performance FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- SDR weekly performance
ALTER TABLE sdr_weekly_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own performance"
  ON sdr_weekly_performance FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all SDR performance in their org"
  ON sdr_weekly_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = sdr_weekly_performance.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage SDR performance"
  ON sdr_weekly_performance FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Performance notes
ALTER TABLE performance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for users in their org"
  ON performance_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up2.id = performance_notes.user_id
    )
  );

CREATE POLICY "Admins can create notes for users in their org"
  ON performance_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up1.role = 'admin'
      AND up2.id = performance_notes.user_id
    )
    AND author_id = auth.uid()
  );

CREATE POLICY "Admins can update notes in their org"
  ON performance_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up1.role = 'admin'
      AND up2.id = performance_notes.user_id
    )
  );

-- ============================================
-- 6. Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_activator_perf_updated_at ON activator_weekly_performance;
CREATE TRIGGER update_activator_perf_updated_at
  BEFORE UPDATE ON activator_weekly_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sdr_perf_updated_at ON sdr_weekly_performance;
CREATE TRIGGER update_sdr_perf_updated_at
  BEFORE UPDATE ON sdr_weekly_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Performance Dashboards Schema Migration Complete ===';
  RAISE NOTICE 'Added completed_at to activation_meetings';
  RAISE NOTICE 'Created activator_weekly_performance table';
  RAISE NOTICE 'Created sdr_weekly_performance table';
  RAISE NOTICE 'Created performance_notes table';
  RAISE NOTICE 'Applied RLS policies and updated_at triggers';
END $$;


