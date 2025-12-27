-- Update sms_messages RLS policies so entire organization can view conversations

DO $$
BEGIN
  -- Backfill organization_id on existing sms_messages
  UPDATE sms_messages sm
  SET organization_id = sr.organization_id
  FROM search_results sr
  WHERE sm.organization_id IS NULL
    AND sm.lead_id = sr.id;

  -- Drop old select policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view their own SMS messages'
      AND tablename = 'sms_messages'
  ) THEN
    DROP POLICY "Users can view their own SMS messages" ON sms_messages;
  END IF;

  -- Create org-wide select policy
  CREATE POLICY "Users can view organization SMS messages"
  ON sms_messages FOR SELECT
  TO public
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );
END $$;

