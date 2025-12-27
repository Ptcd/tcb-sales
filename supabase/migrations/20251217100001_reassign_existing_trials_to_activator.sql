-- Reassign Existing Trials to Activator
-- This migration moves all existing active trials to the activator user
-- while preserving owner_sdr_id for SDR credit attribution

-- Step 1: Find all active trials that need reassignment
-- Criteria:
-- - Has trial_pipeline with trial_started_at
-- - In JCC campaign
-- - Trial-related badge_key
-- - Not marked as lost
-- - Not already converted/paid

DO $$
DECLARE
  activator_user_id UUID;
  jcc_campaign_id UUID;
  reassigned_count INTEGER := 0;
BEGIN
  -- Get JCC campaign ID
  SELECT id INTO jcc_campaign_id
  FROM campaigns
  WHERE name = 'Junk Car Calculator'
  LIMIT 1;

  IF jcc_campaign_id IS NULL THEN
    RAISE NOTICE 'Junk Car Calculator campaign not found. Skipping reassignment.';
    RETURN;
  END IF;

  -- For each organization, find the activator and reassign trials
  FOR activator_user_id IN
    SELECT DISTINCT up.id
    FROM user_profiles up
    WHERE up.is_activator = true
  LOOP
    -- Get the organization_id for this activator
    DECLARE
      org_id UUID;
    BEGIN
      SELECT organization_id INTO org_id
      FROM user_profiles
      WHERE id = activator_user_id;

      -- Reassign trials in this organization to the activator
      -- Only reassign if:
      -- 1. Lead has trial_pipeline with trial_started_at
      -- 2. Lead is in JCC campaign
      -- 3. Lead has trial-related badge_key
      -- 4. Trial is not marked as lost
      -- 5. Lead is not already converted/paid
      WITH trial_leads AS (
        SELECT DISTINCT sr.id
        FROM search_results sr
        INNER JOIN campaign_leads cl ON cl.lead_id = sr.id
        INNER JOIN trial_pipeline tp ON tp.crm_lead_id = sr.id
        WHERE sr.organization_id = org_id
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
          AND (sr.assigned_to IS NULL OR sr.assigned_to != activator_user_id)
      )
      UPDATE search_results sr
      SET 
        assigned_to = activator_user_id,
        updated_at = NOW()
      FROM trial_leads tl
      WHERE sr.id = tl.id;

      GET DIAGNOSTICS reassigned_count = ROW_COUNT;
      
      RAISE NOTICE 'Reassigned % trials to activator % in organization %', 
        reassigned_count, activator_user_id, org_id;
    END;
  END LOOP;

  RAISE NOTICE 'Completed reassignment of existing trials to activators.';
END $$;


