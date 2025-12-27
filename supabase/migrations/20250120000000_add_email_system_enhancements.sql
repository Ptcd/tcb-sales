-- Email System Enhancements Migration
-- Adds support for: quick templates, inbound emails, threading, scheduling, attachments, campaign emails

-- ============================================
-- PHASE 1: Quick Templates Support
-- ============================================

-- Add is_quick flag to email_templates for quick-access templates
ALTER TABLE email_templates 
  ADD COLUMN IF NOT EXISTS is_quick BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_label TEXT,
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Index for quick templates
CREATE INDEX IF NOT EXISTS idx_email_templates_quick ON email_templates(is_quick, display_order) WHERE is_quick = true;

-- ============================================
-- PHASE 2: Inbound Email Support
-- ============================================

-- Add direction and threading columns to email_messages
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT;

-- Add scheduled_for column for "send later" feature
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_scheduled BOOLEAN DEFAULT false;

-- Add organization_id if not exists (for team support)
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================
-- PHASE 3: Attachments Support
-- ============================================

-- Create email_attachments table
CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message ON email_attachments(email_message_id);

-- ============================================
-- PHASE 4: Campaign Email Support
-- ============================================

-- Add email address to campaigns table
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS email_address TEXT,
  ADD COLUMN IF NOT EXISTS email_from_name TEXT,
  ADD COLUMN IF NOT EXISTS email_signature TEXT;

-- Add campaign_id to email_messages for multi-inbox tracking
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_messages_campaign ON email_messages(campaign_id);

-- ============================================
-- PHASE 5: Organization Email Settings
-- ============================================

-- Create organization email settings table
CREATE TABLE IF NOT EXISTS organization_email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  default_from_name TEXT,
  default_from_email TEXT,
  default_reply_to TEXT,
  email_signature TEXT,
  inbound_subdomain TEXT,
  brevo_webhook_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Index for inbound email lookup by sender
CREATE INDEX IF NOT EXISTS idx_email_messages_to_email ON email_messages(to_email);
CREATE INDEX IF NOT EXISTS idx_email_messages_from_email ON email_messages(from_email);

-- Index for threading
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_id ON email_messages(message_id);

-- Index for unread emails
CREATE INDEX IF NOT EXISTS idx_email_messages_unread ON email_messages(is_read, direction) WHERE is_read = false AND direction = 'inbound';

-- Index for scheduled emails
CREATE INDEX IF NOT EXISTS idx_email_messages_scheduled ON email_messages(scheduled_for) WHERE is_scheduled = true AND sent_at IS NULL;

-- Index for organization
CREATE INDEX IF NOT EXISTS idx_email_messages_org ON email_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON email_templates(organization_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_email_settings ENABLE ROW LEVEL SECURITY;

-- Policies for email_attachments
CREATE POLICY "Users can view attachments for their emails"
  ON email_attachments FOR SELECT
  USING (
    email_message_id IN (
      SELECT id FROM email_messages WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert attachments for their emails"
  ON email_attachments FOR INSERT
  WITH CHECK (
    email_message_id IN (
      SELECT id FROM email_messages WHERE user_id = auth.uid()
    )
  );

-- Policies for organization_email_settings
CREATE POLICY "Users can view their org email settings"
  ON organization_email_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can update org email settings"
  ON organization_email_settings FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert org email settings"
  ON organization_email_settings FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Update RLS for email_templates to support organization-wide templates
DROP POLICY IF EXISTS "Users can view their own email templates" ON email_templates;
CREATE POLICY "Users can view org email templates"
  ON email_templates FOR SELECT
  USING (
    auth.uid() = user_id 
    OR organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Update RLS for email_messages to support organization-wide viewing
DROP POLICY IF EXISTS "Users can view their own email messages" ON email_messages;
CREATE POLICY "Users can view org email messages"
  ON email_messages FOR SELECT
  USING (
    auth.uid() = user_id 
    OR organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- ============================================
-- HELPER FUNCTION: Generate thread ID
-- ============================================

CREATE OR REPLACE FUNCTION generate_email_thread_id()
RETURNS UUID AS $$
BEGIN
  RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Auto-set organization_id on insert
-- ============================================

CREATE OR REPLACE FUNCTION set_email_message_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM user_profiles
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_email_message_org ON email_messages;
CREATE TRIGGER trigger_set_email_message_org
  BEFORE INSERT ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_email_message_org_id();

CREATE OR REPLACE FUNCTION set_email_template_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM user_profiles
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_email_template_org ON email_templates;
CREATE TRIGGER trigger_set_email_template_org
  BEFORE INSERT ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_email_template_org_id();

-- ============================================
-- VIEW: Email conversations (for unified view)
-- ============================================

CREATE OR REPLACE VIEW email_conversations AS
SELECT 
  COALESCE(em.lead_id, em.id) as conversation_id,
  em.lead_id,
  sr.name as lead_name,
  sr.email as lead_email,
  sr.phone as lead_phone,
  sr.address as lead_address,
  em.campaign_id,
  c.name as campaign_name,
  COUNT(*) as message_count,
  COUNT(*) FILTER (WHERE em.is_read = false AND em.direction = 'inbound') as unread_count,
  MAX(COALESCE(em.sent_at, em.created_at)) as last_message_at,
  (
    SELECT message.subject 
    FROM email_messages message 
    WHERE message.lead_id = em.lead_id 
    ORDER BY COALESCE(message.sent_at, message.created_at) DESC 
    LIMIT 1
  ) as last_subject,
  (
    SELECT message.direction 
    FROM email_messages message 
    WHERE message.lead_id = em.lead_id 
    ORDER BY COALESCE(message.sent_at, message.created_at) DESC 
    LIMIT 1
  ) as last_direction,
  em.organization_id
FROM email_messages em
LEFT JOIN search_results sr ON em.lead_id = sr.id
LEFT JOIN campaigns c ON em.campaign_id = c.id
GROUP BY em.lead_id, em.id, sr.name, sr.email, sr.phone, sr.address, em.campaign_id, c.name, em.organization_id;

