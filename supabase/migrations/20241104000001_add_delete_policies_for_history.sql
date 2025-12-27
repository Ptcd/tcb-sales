-- Add DELETE policies for history tables to allow organization-wide deletion

-- SMS messages DELETE policy
DROP POLICY IF EXISTS "Team members can delete organization SMS messages" ON sms_messages;
CREATE POLICY "Team members can delete organization SMS messages"
  ON sms_messages FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Email messages DELETE policy  
DROP POLICY IF EXISTS "Team members can delete organization email messages" ON email_messages;
CREATE POLICY "Team members can delete organization email messages"
  ON email_messages FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Calls DELETE policy
DROP POLICY IF EXISTS "Users can delete their own calls" ON calls;
DROP POLICY IF EXISTS "Team members can delete organization calls" ON calls;
CREATE POLICY "Team members can delete organization calls"
  ON calls FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Add missing UPDATE and INSERT policies for calls if they don't exist
DROP POLICY IF EXISTS "Users can create calls" ON calls;
DROP POLICY IF EXISTS "Team members can insert organization calls" ON calls;
CREATE POLICY "Team members can insert organization calls"
  ON calls FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

DROP POLICY IF EXISTS "Users can update their own calls" ON calls;
DROP POLICY IF EXISTS "Team members can update organization calls" ON calls;
CREATE POLICY "Team members can update organization calls"
  ON calls FOR UPDATE
  USING (organization_id = get_user_organization_id());

