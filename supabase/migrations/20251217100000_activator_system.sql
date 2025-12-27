-- Activator System Migration

-- 1. Add activator flag to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_activator BOOLEAN DEFAULT FALSE;

-- 2. Add lost tracking to trial_pipeline (no manual activation needed)
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS marked_lost_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- 3. Create activation_credits table
-- Credits are auto-created when paid_subscribed within 30 days of trial_started_at
CREATE TABLE IF NOT EXISTS activation_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  trial_pipeline_id UUID REFERENCES trial_pipeline(id),
  activator_user_id UUID REFERENCES auth.users(id),
  sdr_user_id UUID REFERENCES auth.users(id),
  trial_started_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  days_to_convert INTEGER,
  credited_at TIMESTAMPTZ DEFAULT NOW(),
  amount NUMERIC(10,2) DEFAULT 5.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_ac_activator ON activation_credits(activator_user_id);
CREATE INDEX IF NOT EXISTS idx_ac_sdr ON activation_credits(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_ac_lead ON activation_credits(lead_id);
CREATE INDEX IF NOT EXISTS idx_ac_credited_at ON activation_credits(credited_at);

-- 5. RLS for activation_credits
ALTER TABLE activation_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org activation credits"
  ON activation_credits FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Service role can insert activation credits"
  ON activation_credits FOR INSERT
  WITH CHECK (TRUE);


