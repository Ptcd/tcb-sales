-- SDR Trial Reviews Migration
-- Creates a table for admin hiring decisions on SDR trial days

-- ============================================
-- 1. Create sdr_trial_reviews table
-- ============================================
CREATE TABLE IF NOT EXISTS sdr_trial_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Performance snapshot (denormalized from daily_sdr_summaries/calls)
  calls INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  cta_attempts INTEGER DEFAULT 0,
  trials_started INTEGER DEFAULT 0,
  
  -- Admin review fields
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep', 'drop', 'retry')),
  admin_notes TEXT,
  reviewed_by_user_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One review per SDR per date
  UNIQUE(sdr_user_id, date)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sdr_trial_reviews_sdr_user_id 
  ON sdr_trial_reviews(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_sdr_trial_reviews_date 
  ON sdr_trial_reviews(date DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_trial_reviews_decision 
  ON sdr_trial_reviews(decision) WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_sdr_trial_reviews_sdr_date 
  ON sdr_trial_reviews(sdr_user_id, date DESC);

-- Comments
COMMENT ON TABLE sdr_trial_reviews IS 'Daily SDR trial day reviews for hiring decisions';
COMMENT ON COLUMN sdr_trial_reviews.calls IS 'Total calls made on this date';
COMMENT ON COLUMN sdr_trial_reviews.conversations IS 'Calls with duration >= 30 seconds';
COMMENT ON COLUMN sdr_trial_reviews.cta_attempts IS 'Number of CTA offers made';
COMMENT ON COLUMN sdr_trial_reviews.trials_started IS 'Confirmed trial_started events';
COMMENT ON COLUMN sdr_trial_reviews.decision IS 'Hiring decision: keep, drop, or retry';
COMMENT ON COLUMN sdr_trial_reviews.admin_notes IS 'Admin notes/comments on the decision';
COMMENT ON COLUMN sdr_trial_reviews.reviewed_by_user_id IS 'Admin who made the decision';
COMMENT ON COLUMN sdr_trial_reviews.reviewed_at IS 'When the decision was made';

-- ============================================
-- 2. Row Level Security
-- ============================================
ALTER TABLE sdr_trial_reviews ENABLE ROW LEVEL SECURITY;

-- Admins can view all reviews in their organization
CREATE POLICY "Admins can view trial reviews in their org"
  ON sdr_trial_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = sdr_trial_reviews.sdr_user_id
    )
  );

-- Admins can update reviews in their organization
CREATE POLICY "Admins can update trial reviews in their org"
  ON sdr_trial_reviews FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = sdr_trial_reviews.sdr_user_id
    )
  );

-- Service role can do everything (for cron jobs)
CREATE POLICY "Service role can manage trial reviews"
  ON sdr_trial_reviews FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================
-- 3. Updated_at trigger
-- ============================================
DROP TRIGGER IF EXISTS update_sdr_trial_reviews_updated_at ON sdr_trial_reviews;
CREATE TRIGGER update_sdr_trial_reviews_updated_at
  BEFORE UPDATE ON sdr_trial_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Create admin_notifications table for general admin alerts
-- ============================================
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- e.g., 'trial_review_pending', 'kpi_alert'
  title TEXT NOT NULL,
  message TEXT,
  link TEXT, -- URL to navigate to
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_user_id 
  ON admin_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread 
  ON admin_notifications(user_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type 
  ON admin_notifications(type, created_at DESC);

-- RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own admin notifications"
  ON admin_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own admin notifications"
  ON admin_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage admin notifications"
  ON admin_notifications FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_admin_notifications_updated_at ON admin_notifications;
CREATE TRIGGER update_admin_notifications_updated_at
  BEFORE UPDATE ON admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== SDR Trial Reviews Migration Complete ===';
  RAISE NOTICE 'Created sdr_trial_reviews table with UNIQUE(sdr_user_id, date)';
  RAISE NOTICE 'Created admin_notifications table for admin alerts';
  RAISE NOTICE 'Applied RLS policies for admin access';
  RAISE NOTICE 'Created indexes for date and decision queries';
END $$;

