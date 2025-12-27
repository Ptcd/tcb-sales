-- Enhanced SDR Funnel Tracking Migration
-- Adds columns to track the full SDR funnel:
-- trial_started → trial_activated → snippet_installed → paid_subscribed

-- ============================================
-- 1. Add new columns to search_results (leads)
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS client_activated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_snippet_installed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS client_snippet_domain TEXT,
ADD COLUMN IF NOT EXISTS client_mrr NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS client_paid_at TIMESTAMPTZ;

-- Add indexes for funnel tracking queries
CREATE INDEX IF NOT EXISTS idx_search_results_client_activated_at 
  ON search_results(client_activated_at) WHERE client_activated_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_results_client_snippet_installed_at 
  ON search_results(client_snippet_installed_at) WHERE client_snippet_installed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_results_client_paid_at 
  ON search_results(client_paid_at) WHERE client_paid_at IS NOT NULL;

-- Comments
COMMENT ON COLUMN search_results.client_activated_at IS 'When the client first logged in or changed settings (trial_activated event)';
COMMENT ON COLUMN search_results.client_snippet_installed_at IS 'When the client installed the calculator snippet on their website';
COMMENT ON COLUMN search_results.client_snippet_domain IS 'The domain where the snippet was installed';
COMMENT ON COLUMN search_results.client_mrr IS 'Monthly recurring revenue from this client';
COMMENT ON COLUMN search_results.client_paid_at IS 'When the client converted to paid';

-- ============================================
-- 2. Update client_status enum if needed
-- We're using text type, so just document valid values
-- ============================================
COMMENT ON COLUMN search_results.client_status IS 'Client status: none, trialing, trial_activated, snippet_installed, trial_qualified, credits_low, trial_expiring, paid';

-- ============================================
-- 3. Add new columns to daily_sdr_summaries
-- ============================================
ALTER TABLE daily_sdr_summaries
ADD COLUMN IF NOT EXISTS trials_activated INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS snippets_installed INTEGER DEFAULT 0;

-- Comments
COMMENT ON COLUMN daily_sdr_summaries.trials_activated IS 'Number of trials that activated (logged in) that day';
COMMENT ON COLUMN daily_sdr_summaries.snippets_installed IS 'Number of clients that installed the snippet that day';

-- ============================================
-- 4. Add new columns to weekly_sdr_summaries
-- ============================================
ALTER TABLE weekly_sdr_summaries
ADD COLUMN IF NOT EXISTS trials_activated INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS snippets_installed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_mrr NUMERIC(10, 2) DEFAULT 0;

-- Comments
COMMENT ON COLUMN weekly_sdr_summaries.trials_activated IS 'Number of trials that activated (logged in) during the week';
COMMENT ON COLUMN weekly_sdr_summaries.snippets_installed IS 'Number of clients that installed the snippet during the week';
COMMENT ON COLUMN weekly_sdr_summaries.total_mrr IS 'Total MRR from paid conversions during the week';

-- ============================================
-- 5. Create a view for SDR funnel metrics
-- ============================================
CREATE OR REPLACE VIEW sdr_funnel_metrics AS
SELECT 
  up.id AS sdr_user_id,
  up.full_name AS sdr_name,
  up.email AS sdr_email,
  up.organization_id,
  -- Trial counts
  COUNT(DISTINCT CASE WHEN sr.client_status IS NOT NULL AND sr.client_status != 'none' THEN sr.id END) AS trials_started,
  COUNT(DISTINCT CASE WHEN sr.client_activated_at IS NOT NULL THEN sr.id END) AS trials_activated,
  COUNT(DISTINCT CASE WHEN sr.client_snippet_installed_at IS NOT NULL THEN sr.id END) AS snippets_installed,
  COUNT(DISTINCT CASE WHEN sr.client_status = 'paid' THEN sr.id END) AS paid_conversions,
  -- MRR
  COALESCE(SUM(CASE WHEN sr.client_status = 'paid' THEN sr.client_mrr ELSE 0 END), 0) AS total_mrr,
  -- Conversion rates (as percentages)
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sr.client_status IS NOT NULL AND sr.client_status != 'none' THEN sr.id END) > 0 
    THEN ROUND(
      100.0 * COUNT(DISTINCT CASE WHEN sr.client_activated_at IS NOT NULL THEN sr.id END) / 
      COUNT(DISTINCT CASE WHEN sr.client_status IS NOT NULL AND sr.client_status != 'none' THEN sr.id END)
    , 1)
    ELSE 0 
  END AS activation_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sr.client_activated_at IS NOT NULL THEN sr.id END) > 0 
    THEN ROUND(
      100.0 * COUNT(DISTINCT CASE WHEN sr.client_snippet_installed_at IS NOT NULL THEN sr.id END) / 
      COUNT(DISTINCT CASE WHEN sr.client_activated_at IS NOT NULL THEN sr.id END)
    , 1)
    ELSE 0 
  END AS snippet_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sr.client_status IS NOT NULL AND sr.client_status != 'none' THEN sr.id END) > 0 
    THEN ROUND(
      100.0 * COUNT(DISTINCT CASE WHEN sr.client_status = 'paid' THEN sr.id END) / 
      COUNT(DISTINCT CASE WHEN sr.client_status IS NOT NULL AND sr.client_status != 'none' THEN sr.id END)
    , 1)
    ELSE 0 
  END AS conversion_rate
FROM user_profiles up
LEFT JOIN search_results sr ON sr.assigned_to = up.id
WHERE up.role = 'member' OR up.role = 'admin'
GROUP BY up.id, up.full_name, up.email, up.organization_id;

-- Grant access to the view
GRANT SELECT ON sdr_funnel_metrics TO authenticated;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Enhanced SDR Funnel Migration Complete ===';
  RAISE NOTICE 'Added to search_results: client_activated_at, client_snippet_installed_at, client_snippet_domain, client_mrr, client_paid_at';
  RAISE NOTICE 'Added to daily_sdr_summaries: trials_activated, snippets_installed';
  RAISE NOTICE 'Added to weekly_sdr_summaries: trials_activated, snippets_installed, total_mrr';
  RAISE NOTICE 'Created view: sdr_funnel_metrics';
END $$;



