-- Reassign All Trials to New Activator
-- Moves all trials, leads, and meetings from merrillholdings@gmail.com to jennyfertan322@gmail.com

DO $$
DECLARE
  old_activator_id UUID;
  new_activator_id UUID;
  count1 INT;
  count2 INT;
  count3 INT;
BEGIN
  -- Get user IDs
  SELECT id INTO old_activator_id FROM user_profiles WHERE email = 'merrillholdings@gmail.com';
  SELECT id INTO new_activator_id FROM user_profiles WHERE email = 'jennyfertan322@gmail.com';
  
  -- Validate users exist
  IF old_activator_id IS NULL THEN 
    RAISE EXCEPTION 'ERROR: merrillholdings@gmail.com not found'; 
  END IF;
  
  IF new_activator_id IS NULL THEN 
    RAISE EXCEPTION 'ERROR: jennyfertan322@gmail.com not found'; 
  END IF;
  
  -- Update trial_pipeline: reassign assigned_activator_id
  UPDATE trial_pipeline 
  SET assigned_activator_id = new_activator_id, 
      updated_at = NOW() 
  WHERE assigned_activator_id = old_activator_id;
  GET DIAGNOSTICS count1 = ROW_COUNT;
  
  -- Update search_results: reassign leads that are part of active trials
  UPDATE search_results sr 
  SET assigned_to = new_activator_id, 
      updated_at = NOW() 
  FROM trial_pipeline tp 
  WHERE sr.id = tp.crm_lead_id 
    AND sr.assigned_to = old_activator_id 
    AND tp.trial_started_at IS NOT NULL 
    AND tp.converted_at IS NULL 
    AND sr.lead_status NOT IN ('converted', 'closed_won', 'closed_lost');
  GET DIAGNOSTICS count2 = ROW_COUNT;
  
  -- Update activation_meetings: reassign scheduled/rescheduled meetings
  UPDATE activation_meetings 
  SET activator_user_id = new_activator_id, 
      updated_at = NOW() 
  WHERE activator_user_id = old_activator_id 
    AND status IN ('scheduled', 'rescheduled');
  GET DIAGNOSTICS count3 = ROW_COUNT;
  
  -- Report results
  RAISE NOTICE 'SUCCESS! Updated: % trials, % leads, % meetings', count1, count2, count3;
END $$;


