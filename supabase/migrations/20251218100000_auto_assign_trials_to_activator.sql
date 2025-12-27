-- Auto-assign trials to activator
-- This migration ensures that any new trial is automatically assigned to the organization's activator
-- and reassigns all existing active JCC trials to the activator.

-- 1. Function to find activator for an organization
CREATE OR REPLACE FUNCTION get_org_activator(org_id UUID)
RETURNS UUID AS $$
  SELECT id FROM user_profiles
  WHERE organization_id = org_id
    AND is_activator = true
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- 2. Trigger function to auto-assign on trial start
CREATE OR REPLACE FUNCTION handle_trial_auto_assignment()
RETURNS TRIGGER AS $$
DECLARE
  target_activator_id UUID;
  org_id UUID;
BEGIN
  -- Only trigger if trial_started_at is being set (new trial)
  IF (TG_OP = 'INSERT' AND NEW.trial_started_at IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND NEW.trial_started_at IS NOT NULL AND OLD.trial_started_at IS NULL) THEN
    
    -- Get organization_id from the lead
    SELECT organization_id INTO org_id
    FROM search_results
    WHERE id = NEW.crm_lead_id;

    -- Find the activator
    target_activator_id := get_org_activator(org_id);

    -- Assign the lead if an activator exists
    IF target_activator_id IS NOT NULL THEN
      UPDATE search_results
      SET assigned_to = target_activator_id,
          updated_at = NOW()
      WHERE id = NEW.crm_lead_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS on_trial_started_assign_activator ON trial_pipeline;
CREATE TRIGGER on_trial_started_assign_activator
  AFTER INSERT OR UPDATE ON trial_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION handle_trial_auto_assignment();

-- 4. One-time reassignment of all existing active trials
DO $$
DECLARE
  jcc_campaign_id UUID;
BEGIN
  -- Get JCC campaign ID
  SELECT id INTO jcc_campaign_id
  FROM campaigns
  WHERE name = 'Junk Car Calculator'
  LIMIT 1;

  IF jcc_campaign_id IS NOT NULL THEN
    -- Update all leads in JCC campaign that have an active trial
    -- and are not already assigned to an activator
    UPDATE search_results sr
    SET assigned_to = up.id,
        updated_at = NOW()
    FROM user_profiles up
    JOIN campaign_leads cl ON cl.lead_id = sr.id
    JOIN trial_pipeline tp ON tp.crm_lead_id = sr.id
    WHERE sr.organization_id = up.organization_id
      AND up.is_activator = true
      AND cl.campaign_id = jcc_campaign_id
      AND tp.trial_started_at IS NOT NULL
      AND tp.marked_lost_at IS NULL
      AND sr.badge_key IN (
        'trial_awaiting_activation',
        'trial_activated',
        'trial_configured',
        'trial_embed_copied',
        'trial_live_first_lead'
      )
      AND sr.lead_status NOT IN ('converted', 'closed_won', 'closed_lost')
      AND (sr.assigned_to IS NULL OR sr.assigned_to != up.id);
  END IF;
END $$;
