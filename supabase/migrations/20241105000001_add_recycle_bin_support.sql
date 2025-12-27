-- Add Recycle Bin (Soft Delete) Support
-- This migration adds deleted_at columns for soft delete functionality
-- Items are marked as deleted instead of being permanently removed
-- Auto-cleanup after 30 days

-- 1. Add deleted_at columns to all relevant tables
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_search_history_deleted ON search_history(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_search_results_deleted ON search_results(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_deleted ON sms_messages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_deleted ON email_messages(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_deleted ON calls(deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Update RLS policies to exclude deleted items from normal queries

-- Search History policies
DROP POLICY IF EXISTS "Users can view organization search history" ON search_history;
CREATE POLICY "Users can view organization search history"
ON search_history FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view deleted search history" ON search_history;
CREATE POLICY "Users can view deleted search history"
ON search_history FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NOT NULL);

-- Search Results (Leads) policies
DROP POLICY IF EXISTS "Users can view organization search results" ON search_results;
CREATE POLICY "Users can view organization search results"
ON search_results FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view deleted search results" ON search_results;
CREATE POLICY "Users can view deleted search results"
ON search_results FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete organization search results" ON search_results;
CREATE POLICY "Users can delete organization search results"
ON search_results FOR UPDATE
USING (organization_id = get_user_organization_id());

-- SMS Messages policies
DROP POLICY IF EXISTS "Users can view organization sms messages" ON sms_messages;
CREATE POLICY "Users can view organization sms messages"
ON sms_messages FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view deleted sms messages" ON sms_messages;
CREATE POLICY "Users can view deleted sms messages"
ON sms_messages FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete organization sms messages" ON sms_messages;
CREATE POLICY "Users can soft delete organization sms messages"
ON sms_messages FOR UPDATE
USING (organization_id = get_user_organization_id());

-- Email Messages policies
DROP POLICY IF EXISTS "Users can view organization email messages" ON email_messages;
CREATE POLICY "Users can view organization email messages"
ON email_messages FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view deleted email messages" ON email_messages;
CREATE POLICY "Users can view deleted email messages"
ON email_messages FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete organization email messages" ON email_messages;
CREATE POLICY "Users can soft delete organization email messages"
ON email_messages FOR UPDATE
USING (organization_id = get_user_organization_id());

-- Calls policies
DROP POLICY IF EXISTS "Users can view organization calls" ON calls;
CREATE POLICY "Users can view organization calls"
ON calls FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Users can view deleted calls" ON calls;
CREATE POLICY "Users can view deleted calls"
ON calls FOR SELECT
USING (organization_id = get_user_organization_id() AND deleted_at IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete organization calls" ON calls;
CREATE POLICY "Users can soft delete organization calls"
ON calls FOR UPDATE
USING (organization_id = get_user_organization_id());

-- 4. Create function to permanently delete expired items (30+ days old)
CREATE OR REPLACE FUNCTION cleanup_expired_deleted_items()
RETURNS TABLE(
  deleted_search_history_count BIGINT,
  deleted_search_results_count BIGINT,
  deleted_sms_count BIGINT,
  deleted_email_count BIGINT,
  deleted_calls_count BIGINT
) AS $$
DECLARE
  v_deleted_search_history BIGINT;
  v_deleted_search_results BIGINT;
  v_deleted_sms BIGINT;
  v_deleted_email BIGINT;
  v_deleted_calls BIGINT;
BEGIN
  -- Delete items that were soft-deleted more than 30 days ago
  WITH deleted_sh AS (
    DELETE FROM search_history 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_search_history FROM deleted_sh;

  WITH deleted_sr AS (
    DELETE FROM search_results 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_search_results FROM deleted_sr;

  WITH deleted_sms AS (
    DELETE FROM sms_messages 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_sms FROM deleted_sms;

  WITH deleted_em AS (
    DELETE FROM email_messages 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_email FROM deleted_em;

  WITH deleted_c AS (
    DELETE FROM calls 
    WHERE deleted_at IS NOT NULL 
      AND deleted_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_calls FROM deleted_c;

  RETURN QUERY SELECT 
    v_deleted_search_history,
    v_deleted_search_results,
    v_deleted_sms,
    v_deleted_email,
    v_deleted_calls;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_deleted_items() IS 'Permanently deletes soft-deleted items older than 30 days';

-- 5. Add comments
COMMENT ON COLUMN search_history.deleted_at IS 'Timestamp when item was soft-deleted (NULL = active)';
COMMENT ON COLUMN search_results.deleted_at IS 'Timestamp when item was soft-deleted (NULL = active)';
COMMENT ON COLUMN sms_messages.deleted_at IS 'Timestamp when item was soft-deleted (NULL = active)';
COMMENT ON COLUMN email_messages.deleted_at IS 'Timestamp when item was soft-deleted (NULL = active)';
COMMENT ON COLUMN calls.deleted_at IS 'Timestamp when item was soft-deleted (NULL = active)';

