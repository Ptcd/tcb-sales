-- Migration: 20240101000000_bootstrap_core_tables.sql
-- Bootstrap Core Tables
-- This migration creates all core tables that other migrations depend on
-- Must run FIRST before any other migrations

-- ============================================
-- 1. Create organizations table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Create user_profiles table (if not exists)
-- ============================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'rep' CHECK (role IN ('admin', 'manager', 'rep', 'sdr', 'activator')),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_organization_id ON user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- ============================================
-- 3. Create twilio_phone_numbers table (MISSING from other migrations)
-- ============================================
CREATE TABLE IF NOT EXISTS twilio_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  twilio_sid TEXT UNIQUE,
  capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": false}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_user_id ON twilio_phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_organization ON twilio_phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_is_active ON twilio_phone_numbers(is_active);

COMMENT ON TABLE twilio_phone_numbers IS 'Twilio phone numbers assigned to users/organizations';
COMMENT ON COLUMN twilio_phone_numbers.capabilities IS 'Voice, SMS, MMS capabilities';

-- ============================================
-- 4. Enable RLS on core tables
-- ============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE twilio_phone_numbers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. Basic RLS policies for organizations
-- ============================================
DROP POLICY IF EXISTS "Users can view their own organization" ON organizations;
CREATE POLICY "Users can view their own organization"
ON organizations FOR SELECT
TO public
USING (
  id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
);

-- ============================================
-- 6. Basic RLS policies for user_profiles
-- ============================================
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON user_profiles;
CREATE POLICY "Users can view profiles in their organization"
ON user_profiles FOR SELECT
TO public
USING (
  organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
  OR id = auth.uid()
);

DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
CREATE POLICY "Users can update their own profile"
ON user_profiles FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ============================================
-- 7. Helper function for getting user's organization
-- ============================================
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================
-- 8. Updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_twilio_phone_numbers_updated_at ON twilio_phone_numbers;
CREATE TRIGGER update_twilio_phone_numbers_updated_at
  BEFORE UPDATE ON twilio_phone_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




-- ==========================================


-- Migration: 20241001000000_create_search_history_table.sql
-- Create search_history table for Google Maps Dashboard
-- Migration: 20241201000000_create_search_history_table.sql

-- Create search_history table
CREATE TABLE IF NOT EXISTS search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  keyword TEXT NOT NULL,
  location TEXT NOT NULL,
  result_count INTEGER NOT NULL CHECK (result_count > 0 AND result_count <= 200),
  results_found INTEGER NOT NULL CHECK (results_found >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add table comment
COMMENT ON TABLE search_history IS 'Stores user search history for Google Maps business searches';

-- Add column comments
COMMENT ON COLUMN search_history.id IS 'Primary key, auto-generated UUID';
COMMENT ON COLUMN search_history.user_id IS 'Foreign key to auth.users, cascades on delete';
COMMENT ON COLUMN search_history.keyword IS 'Search keyword (e.g., auto repair, plumber)';
COMMENT ON COLUMN search_history.location IS 'Search location (e.g., Chicago, IL or 60601)';
COMMENT ON COLUMN search_history.result_count IS 'Number of results requested (10-200)';
COMMENT ON COLUMN search_history.results_found IS 'Number of results actually found';
COMMENT ON COLUMN search_history.created_at IS 'Timestamp when search was performed';

-- Enable Row Level Security (RLS)
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Policy: Users can only view their own search history
CREATE POLICY "Users can view their own search history"
  ON search_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own search history
CREATE POLICY "Users can insert their own search history"
  ON search_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own search history (if needed)
CREATE POLICY "Users can update their own search history"
  ON search_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own search history (if needed)
CREATE POLICY "Users can delete their own search history"
  ON search_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS search_history_user_id_idx 
  ON search_history(user_id);

CREATE INDEX IF NOT EXISTS search_history_created_at_idx 
  ON search_history(created_at DESC);

CREATE INDEX IF NOT EXISTS search_history_user_created_idx 
  ON search_history(user_id, created_at DESC);

-- Create a function to automatically clean up old search history (optional)
-- This function can be called periodically to remove searches older than 1 year
CREATE OR REPLACE FUNCTION cleanup_old_search_history()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM search_history 
  WHERE created_at < NOW() - INTERVAL '1 year';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_old_search_history() TO authenticated;

-- Add a helpful view for recent searches
CREATE OR REPLACE VIEW recent_searches AS
SELECT 
  sh.id,
  sh.keyword,
  sh.location,
  sh.result_count,
  sh.results_found,
  sh.created_at,
  au.email as user_email
FROM search_history sh
JOIN auth.users au ON sh.user_id = au.id
WHERE sh.created_at >= NOW() - INTERVAL '30 days'
ORDER BY sh.created_at DESC;

-- Grant access to the view for authenticated users
GRANT SELECT ON recent_searches TO authenticated;

-- Add RLS policy for the view
ALTER VIEW recent_searches SET (security_invoker = true);


-- ==========================================


-- Migration: 20241001000001_create_search_results_table.sql
-- Create search_results table to store individual search results
CREATE TABLE IF NOT EXISTS search_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  search_history_id UUID NOT NULL REFERENCES search_history(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - users can only see their own search results
CREATE POLICY "Users can view their own search results" ON search_results
  FOR SELECT USING (
    search_history_id IN (
      SELECT id FROM search_history WHERE user_id = auth.uid()
    )
  );

-- Create RLS policy - users can only insert their own search results
CREATE POLICY "Users can insert their own search results" ON search_results
  FOR INSERT WITH CHECK (
    search_history_id IN (
      SELECT id FROM search_history WHERE user_id = auth.uid()
    )
  );

-- Create RLS policy - users can only delete their own search results
CREATE POLICY "Users can delete their own search results" ON search_results
  FOR DELETE USING (
    search_history_id IN (
      SELECT id FROM search_history WHERE user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_search_results_search_history_id ON search_results(search_history_id);
CREATE INDEX IF NOT EXISTS idx_search_results_place_id ON search_results(place_id);
CREATE INDEX IF NOT EXISTS idx_search_results_created_at ON search_results(created_at);

-- Create a view for easy access to search results with history
CREATE OR REPLACE VIEW user_search_results AS
SELECT 
  sr.*,
  sh.keyword,
  sh.location,
  sh.result_count,
  sh.created_at as search_date,
  sh.user_id
FROM search_results sr
JOIN search_history sh ON sr.search_history_id = sh.id;

-- Enable RLS on the view
ALTER VIEW user_search_results SET (security_invoker = true);

-- Create function to clean up old search results (optional)
CREATE OR REPLACE FUNCTION cleanup_old_search_results()
RETURNS void AS $$
BEGIN
  -- Delete search results older than 90 days
  DELETE FROM search_results 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Delete search history without results older than 90 days
  DELETE FROM search_history 
  WHERE created_at < NOW() - INTERVAL '90 days'
  AND id NOT IN (SELECT DISTINCT search_history_id FROM search_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================


-- Migration: 20241024000000_create_crm_tables.sql
-- CRM Phase 1: Lead Management System
-- This migration adds CRM functionality to track leads, notes, and activities

-- 1. Add CRM columns to search_results table (only if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results') THEN
    ALTER TABLE search_results ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'interested', 'not_interested', 'converted'));
    ALTER TABLE search_results ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    ALTER TABLE search_results ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
    ALTER TABLE search_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Create index for faster filtering by lead status
    CREATE INDEX IF NOT EXISTS idx_search_results_lead_status ON search_results(lead_status);
    CREATE INDEX IF NOT EXISTS idx_search_results_assigned_to ON search_results(assigned_to);
    
    -- Add comments for documentation
    COMMENT ON COLUMN search_results.lead_status IS 'Current status of the lead: new, contacted, interested, not_interested, or converted';
    COMMENT ON COLUMN search_results.assigned_to IS 'User ID of the team member assigned to this lead';
    COMMENT ON COLUMN search_results.last_contacted_at IS 'Timestamp of the last contact with this lead';
    COMMENT ON COLUMN search_results.updated_at IS 'Timestamp of the last update to this lead';
  END IF;
END $$;

-- 2. Create lead_notes table (only if search_results exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results') THEN
    CREATE TABLE IF NOT EXISTS lead_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_notes_user_id ON lead_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at DESC);

    -- Add comments
    COMMENT ON TABLE lead_notes IS 'Notes and comments added to leads by users';
    COMMENT ON COLUMN lead_notes.lead_id IS 'Reference to the lead (search_results.id)';
    COMMENT ON COLUMN lead_notes.user_id IS 'User who created the note';
    COMMENT ON COLUMN lead_notes.note IS 'The note content';
  END IF;
END $$;

-- 3. Create lead_activities table for tracking all activities (only if search_results exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results') THEN
    CREATE TABLE IF NOT EXISTS lead_activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK (activity_type IN ('status_change', 'note_added', 'assigned', 'contacted', 'email_sent', 'sms_sent', 'call_made')),
      activity_data JSONB DEFAULT '{}'::jsonb,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create indexes for faster queries
    CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_user_id ON lead_activities(user_id);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON lead_activities(activity_type);

    -- Add comments
    COMMENT ON TABLE lead_activities IS 'Activity timeline and history for each lead';
    COMMENT ON COLUMN lead_activities.activity_type IS 'Type of activity: status_change, note_added, assigned, contacted, email_sent, sms_sent, call_made';
    COMMENT ON COLUMN lead_activities.activity_data IS 'Additional data about the activity stored as JSON';
    COMMENT ON COLUMN lead_activities.description IS 'Human-readable description of the activity';
  END IF;
END $$;

-- 4. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for search_results (only if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results') THEN
    DROP TRIGGER IF EXISTS update_search_results_updated_at ON search_results;
    CREATE TRIGGER update_search_results_updated_at
      BEFORE UPDATE ON search_results
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create trigger for lead_notes (only if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    DROP TRIGGER IF EXISTS update_lead_notes_updated_at ON lead_notes;
    CREATE TRIGGER update_lead_notes_updated_at
      BEFORE UPDATE ON lead_notes
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 5. Row Level Security (RLS) Policies (only if tables exist)
DO $$ 
BEGIN
  -- Enable RLS on new tables
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
    ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
    
    -- lead_notes policies
    DROP POLICY IF EXISTS "Users can view notes for their leads" ON lead_notes;
    CREATE POLICY "Users can view notes for their leads"
    ON lead_notes FOR SELECT
    TO public
    USING (
      lead_id IN (
        SELECT sr.id FROM search_results sr
        JOIN search_history sh ON sr.search_history_id = sh.id
        WHERE sh.user_id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Users can create notes for their leads" ON lead_notes;
    CREATE POLICY "Users can create notes for their leads"
    ON lead_notes FOR INSERT
    TO public
    WITH CHECK (
      user_id = auth.uid() AND
      lead_id IN (
        SELECT sr.id FROM search_results sr
        JOIN search_history sh ON sr.search_history_id = sh.id
        WHERE sh.user_id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Users can update their own notes" ON lead_notes;
    CREATE POLICY "Users can update their own notes"
    ON lead_notes FOR UPDATE
    TO public
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS "Users can delete their own notes" ON lead_notes;
    CREATE POLICY "Users can delete their own notes"
    ON lead_notes FOR DELETE
    TO public
    USING (user_id = auth.uid());
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_activities') THEN
    ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
    
    -- lead_activities policies
    DROP POLICY IF EXISTS "Users can view activities for their leads" ON lead_activities;
    CREATE POLICY "Users can view activities for their leads"
    ON lead_activities FOR SELECT
    TO public
    USING (
      lead_id IN (
        SELECT sr.id FROM search_results sr
        JOIN search_history sh ON sr.search_history_id = sh.id
        WHERE sh.user_id = auth.uid()
      )
    );

    DROP POLICY IF EXISTS "Users can create activities for their leads" ON lead_activities;
    CREATE POLICY "Users can create activities for their leads"
    ON lead_activities FOR INSERT
    TO public
    WITH CHECK (
      user_id = auth.uid() AND
      lead_id IN (
        SELECT sr.id FROM search_results sr
        JOIN search_history sh ON sr.search_history_id = sh.id
        WHERE sh.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 6. Create view for lead management with user information (only if tables exist)
-- Note: email column added in later migration, so not included here
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results')
     AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    -- Drop existing view first (can't change column structure with CREATE OR REPLACE)
    DROP VIEW IF EXISTS user_leads;
    CREATE VIEW user_leads AS
    SELECT 
      sr.id,
      sr.search_history_id,
      sr.place_id,
      sr.name,
      sr.address,
      sr.phone,
      sr.website,
      sr.rating,
      sr.review_count,
      sr.latitude,
      sr.longitude,
      sr.lead_status,
      sr.assigned_to,
      sr.last_contacted_at,
      sr.created_at,
      sr.updated_at,
      sh.user_id,
      sh.keyword,
      sh.location,
      sh.result_count,
      sh.created_at as search_date,
      -- Count of notes for this lead
      (SELECT COUNT(*) FROM lead_notes WHERE lead_notes.lead_id = sr.id) as notes_count,
      -- Count of activities for this lead
      (SELECT COUNT(*) FROM lead_activities WHERE lead_activities.lead_id = sr.id) as activities_count
    FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id;

    COMMENT ON VIEW user_leads IS 'Complete view of leads with user information, notes count, and activities count';
  END IF;
END $$;



-- ==========================================


-- Migration: 20241024000001_update_user_search_results_view.sql
-- Update user_search_results view to include CRM fields
-- This ensures the view returns lead_status, assigned_to, etc.
-- Only create if tables exist

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_results')
     AND EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'search_history') THEN
    -- Drop existing view first (can't change column structure with CREATE OR REPLACE)
    DROP VIEW IF EXISTS user_search_results;
    -- Note: email column added in later migration
    CREATE VIEW user_search_results AS
    SELECT 
      sr.id,
      sr.search_history_id,
      sr.place_id,
      sr.name,
      sr.address,
      sr.phone,
      sr.website,
      sr.rating,
      sr.review_count,
      sr.latitude,
      sr.longitude,
      sr.created_at,
      sr.lead_status,
      sr.assigned_to,
      sr.last_contacted_at,
      sr.updated_at,
      sh.user_id,
      sh.keyword,
      sh.location,
      sh.result_count,
      sh.created_at as search_date
    FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id;

    COMMENT ON VIEW user_search_results IS 'User search results with CRM fields for lead management';
  END IF;
END $$;



-- ==========================================


-- Migration: 20241024100000_create_sms_tables.sql
-- SMS System: Message Templates and Message Log
-- This migration adds SMS functionality for bulk messaging to leads

-- 1. Create sms_templates table for reusable message templates
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sms_templates_message_length CHECK (char_length(message) <= 1600)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sms_templates_user_id ON sms_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_active ON sms_templates(is_active) WHERE is_active = true;

-- Add comments
COMMENT ON TABLE sms_templates IS 'Reusable SMS message templates for quick sending';
COMMENT ON COLUMN sms_templates.message IS 'SMS message text (max 1600 chars for multiple SMS segments)';

-- 2. Create sms_messages table for SMS log/history
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'queued')),
  twilio_sid TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_sent_at ON sms_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Add comments
COMMENT ON TABLE sms_messages IS 'SMS message log for tracking all sent messages';
COMMENT ON COLUMN sms_messages.status IS 'Message status: pending, sent, delivered, failed, queued';
COMMENT ON COLUMN sms_messages.twilio_sid IS 'Twilio message SID for tracking';

-- 3. Add SMS fields to search_results for tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sms_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_search_results_last_sms ON search_results(last_sms_sent_at);

COMMENT ON COLUMN search_results.last_sms_sent_at IS 'Timestamp of the last SMS sent to this lead';
COMMENT ON COLUMN search_results.sms_count IS 'Total number of SMS messages sent to this lead';

-- 4. Create trigger to update sms_count
CREATE OR REPLACE FUNCTION update_lead_sms_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_results
  SET 
    sms_count = sms_count + 1,
    last_sms_sent_at = NEW.sent_at
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_sms_count ON sms_messages;
CREATE TRIGGER trigger_update_sms_count
  AFTER INSERT ON sms_messages
  FOR EACH ROW
  WHEN (NEW.status = 'sent' OR NEW.status = 'delivered')
  EXECUTE FUNCTION update_lead_sms_count();

-- 5. Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- sms_templates policies
CREATE POLICY "Users can view their own templates"
ON sms_templates FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own templates"
ON sms_templates FOR INSERT
TO public
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own templates"
ON sms_templates FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own templates"
ON sms_templates FOR DELETE
TO public
USING (user_id = auth.uid());

-- sms_messages policies
CREATE POLICY "Users can view their own SMS messages"
ON sms_messages FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create SMS messages for their leads"
ON sms_messages FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own SMS messages"
ON sms_messages FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 6. Create view for SMS history with lead info
CREATE OR REPLACE VIEW user_sms_history AS
SELECT 
  sm.id,
  sm.lead_id,
  sm.user_id,
  sm.template_id,
  sm.phone_number,
  sm.message,
  sm.status,
  sm.twilio_sid,
  sm.error_message,
  sm.sent_at,
  sm.delivered_at,
  sm.created_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  st.name as template_name
FROM sms_messages sm
LEFT JOIN search_results sr ON sm.lead_id = sr.id
LEFT JOIN sms_templates st ON sm.template_id = st.id;

COMMENT ON VIEW user_sms_history IS 'SMS message history with lead and template information';

-- 7. Insert some default SMS templates for junk car businesses
INSERT INTO sms_templates (user_id, name, message, is_active) 
SELECT 
  auth.uid(),
  'Initial Contact',
  'Hi! We buy junk cars for cash. Interested in getting a quote for your vehicle? Reply YES for more info.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO sms_templates (user_id, name, message, is_active)
SELECT 
  auth.uid(),
  'Follow Up',
  'Following up on our previous message. We offer top dollar for junk cars. Free towing included! Call us back or reply for a quote.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO sms_templates (user_id, name, message, is_active)
SELECT 
  auth.uid(),
  'Quote Ready',
  'Your quote is ready! We can offer $[AMOUNT] for your vehicle. Same-day pickup available. Reply or call to schedule.',
  true
WHERE auth.uid() IS NOT NULL
ON CONFLICT DO NOTHING;



-- ==========================================


-- Migration: 20241025000000_create_dialer_tables.sql
-- Dialer System: Call Management and Logging
-- This migration adds calling functionality for outbound marketing

-- 1. Create calls table for call log/history
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  call_type TEXT NOT NULL DEFAULT 'outbound' CHECK (call_type IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'busy', 'no_answer', 'failed', 'cancelled')),
  duration INTEGER DEFAULT 0, -- Duration in seconds
  twilio_call_sid TEXT, -- Twilio call SID for tracking
  twilio_recording_sid TEXT, -- Twilio recording SID if recorded
  recording_url TEXT, -- URL to call recording
  notes TEXT, -- Call notes/outcome
  outcome TEXT CHECK (outcome IN ('interested', 'not_interested', 'callback_requested', 'no_answer', 'busy', 'wrong_number', 'do_not_call')),
  callback_date TIMESTAMPTZ, -- When to call back
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_initiated_at ON calls(initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);
CREATE INDEX IF NOT EXISTS idx_calls_callback_date ON calls(callback_date) WHERE callback_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_twilio_sid ON calls(twilio_call_sid) WHERE twilio_call_sid IS NOT NULL;

-- Add comments
COMMENT ON TABLE calls IS 'Call log for tracking all phone calls made to leads';
COMMENT ON COLUMN calls.status IS 'Call status: initiated, ringing, answered, completed, busy, no_answer, failed, cancelled';
COMMENT ON COLUMN calls.outcome IS 'Call outcome: interested, not_interested, callback_requested, no_answer, busy, wrong_number, do_not_call';
COMMENT ON COLUMN calls.duration IS 'Call duration in seconds';
COMMENT ON COLUMN calls.twilio_call_sid IS 'Twilio call SID for tracking and webhooks';

-- 2. Add call fields to search_results for tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS last_call_made_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_call_duration INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_search_results_last_call ON search_results(last_call_made_at);
CREATE INDEX IF NOT EXISTS idx_search_results_call_count ON search_results(call_count);

COMMENT ON COLUMN search_results.last_call_made_at IS 'Timestamp of the last call made to this lead';
COMMENT ON COLUMN search_results.call_count IS 'Total number of calls made to this lead';
COMMENT ON COLUMN search_results.total_call_duration IS 'Total call duration in seconds for this lead';

-- 3. Create trigger to update call statistics
CREATE OR REPLACE FUNCTION update_lead_call_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_results
  SET 
    call_count = call_count + 1,
    last_call_made_at = NEW.initiated_at,
    total_call_duration = total_call_duration + COALESCE(NEW.duration, 0)
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_call_stats ON calls;
CREATE TRIGGER trigger_update_call_stats
  AFTER INSERT ON calls
  FOR EACH ROW
  WHEN (NEW.status = 'completed' OR NEW.status = 'answered')
  EXECUTE FUNCTION update_lead_call_stats();

-- 4. Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- calls policies
CREATE POLICY "Users can view their own calls"
ON calls FOR SELECT
TO public
USING (user_id = auth.uid());

CREATE POLICY "Users can create calls for their leads"
ON calls FOR INSERT
TO public
WITH CHECK (
  user_id = auth.uid() AND
  lead_id IN (
    SELECT sr.id FROM search_results sr
    JOIN search_history sh ON sr.search_history_id = sh.id
    WHERE sh.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own calls"
ON calls FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own calls"
ON calls FOR DELETE
TO public
USING (user_id = auth.uid());

-- 5. Create view for call history with lead info
CREATE OR REPLACE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id;

COMMENT ON VIEW user_call_history IS 'Call history with lead information for comprehensive call tracking';

-- 6. Create function to get call statistics
CREATE OR REPLACE FUNCTION get_user_call_stats(user_uuid UUID)
RETURNS TABLE (
  total_calls BIGINT,
  answered_calls BIGINT,
  total_duration BIGINT,
  avg_duration NUMERIC,
  calls_today BIGINT,
  callback_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_calls,
    COUNT(*) FILTER (WHERE status = 'answered' OR status = 'completed') as answered_calls,
    COALESCE(SUM(duration), 0) as total_duration,
    COALESCE(AVG(duration), 0) as avg_duration,
    COUNT(*) FILTER (WHERE DATE(initiated_at) = CURRENT_DATE) as calls_today,
    COUNT(*) FILTER (WHERE outcome = 'callback_requested') as callback_requests
  FROM calls 
  WHERE user_id = user_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_call_stats IS 'Get comprehensive call statistics for a user';


-- ==========================================


-- Migration: 20241030000000_create_email_tables.sql
-- Create email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email messages table
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  status TEXT DEFAULT 'pending',
  provider_message_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  lead_name TEXT,
  lead_address TEXT,
  template_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add email tracking columns to search_results
ALTER TABLE search_results 
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_count INT DEFAULT 0;

-- Create indexes for performance
CREATE INDEX idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX idx_email_messages_user_id ON email_messages(user_id);
CREATE INDEX idx_email_messages_lead_id ON email_messages(lead_id);
CREATE INDEX idx_email_messages_status ON email_messages(status);
CREATE INDEX idx_email_messages_sent_at ON email_messages(sent_at DESC);

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_templates
CREATE POLICY "Users can view their own email templates"
  ON email_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email templates"
  ON email_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email templates"
  ON email_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own email templates"
  ON email_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for email_messages
CREATE POLICY "Users can view their own email messages"
  ON email_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own email messages"
  ON email_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own email messages"
  ON email_messages FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to update email count on search_results
CREATE OR REPLACE FUNCTION update_lead_email_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.status = 'sent' THEN
    UPDATE search_results
    SET 
      email_count = COALESCE(email_count, 0) + 1,
      last_email_sent_at = NEW.sent_at,
      updated_at = NOW()
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update email count
CREATE TRIGGER trigger_update_email_count
  AFTER INSERT OR UPDATE ON email_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_email_count();

-- Note: Default email templates are created through the UI
-- Users can create custom templates when they first use the email feature
-- This avoids SQL errors when no users exist in the database yet



-- ==========================================


-- Migration: 20241031000000_create_team_system.sql
-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add organization_id and role to auth.users metadata
-- We'll store this in a separate table since we can't directly modify auth.users

-- Create user_profiles table to extend auth.users
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create team invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(organization_id, email)
);

-- Add organization_id to existing tables (only if tables exist)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'search_results') THEN
    ALTER TABLE search_results ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_messages') THEN
    ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'twilio_phone_numbers') THEN
    ALTER TABLE twilio_phone_numbers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_templates') THEN
    ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_messages') THEN
    ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_organization ON user_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);

-- Create indexes for existing tables only
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'search_results') THEN
    CREATE INDEX IF NOT EXISTS idx_search_results_organization ON search_results(organization_id);
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
    CREATE INDEX IF NOT EXISTS idx_lead_activities_organization ON lead_activities(organization_id);
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_messages') THEN
    CREATE INDEX IF NOT EXISTS idx_sms_messages_organization ON sms_messages(organization_id);
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'twilio_phone_numbers') THEN
    CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_organization ON twilio_phone_numbers(organization_id);
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_templates') THEN
    CREATE INDEX IF NOT EXISTS idx_email_templates_organization ON email_templates(organization_id);
  END IF;
  
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_messages') THEN
    CREATE INDEX IF NOT EXISTS idx_email_messages_organization ON email_messages(organization_id);
  END IF;
END $$;

-- Migrate existing data: Create organizations for existing users and migrate their data
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
BEGIN
  FOR user_record IN SELECT DISTINCT id, email FROM auth.users LOOP
    -- Create organization for this user
    INSERT INTO organizations (name)
    VALUES (COALESCE(SPLIT_PART(user_record.email, '@', 1), 'Organization') || '''s Organization')
    RETURNING id INTO new_org_id;
    
    -- Create user profile with admin role (first user is always admin)
    INSERT INTO user_profiles (id, organization_id, role)
    VALUES (user_record.id, new_org_id, 'admin');
    
    -- Migrate user's data to organization (only for tables that exist)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'search_results') THEN
      UPDATE search_results 
      SET organization_id = new_org_id 
      WHERE search_history_id IN (
        SELECT id FROM search_history WHERE user_id = user_record.id
      ) AND organization_id IS NULL;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'lead_activities') THEN
      UPDATE lead_activities 
      SET organization_id = new_org_id 
      WHERE user_id = user_record.id AND organization_id IS NULL;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_messages') THEN
      UPDATE sms_messages 
      SET organization_id = new_org_id 
      WHERE user_id = user_record.id AND organization_id IS NULL;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'twilio_phone_numbers') THEN
      UPDATE twilio_phone_numbers 
      SET organization_id = new_org_id 
      WHERE user_id = user_record.id AND organization_id IS NULL;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_templates') THEN
      UPDATE email_templates 
      SET organization_id = new_org_id 
      WHERE user_id = user_record.id AND organization_id IS NULL;
    END IF;
    
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_messages') THEN
      UPDATE email_messages 
      SET organization_id = new_org_id 
      WHERE user_id = user_record.id AND organization_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Make organization_id NOT NULL after migration (with a small delay to ensure migration completes)
-- Note: We'll do this in a separate migration if needed

-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Drop old RLS policies that filtered by user_id
DROP POLICY IF EXISTS "Users can view their own search results" ON search_results;
DROP POLICY IF EXISTS "Users can insert their own search results" ON search_results;
DROP POLICY IF EXISTS "Users can update their own search results" ON search_results;
DROP POLICY IF EXISTS "Users can delete their own search results" ON search_results;

DROP POLICY IF EXISTS "Users can view their own activities" ON lead_activities;
DROP POLICY IF EXISTS "Users can insert their own activities" ON lead_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON lead_activities;

DROP POLICY IF EXISTS "Users can view their own SMS messages" ON sms_messages;
DROP POLICY IF EXISTS "Users can insert their own SMS messages" ON sms_messages;
DROP POLICY IF EXISTS "Users can update their own SMS messages" ON sms_messages;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'twilio_phone_numbers') THEN
    DROP POLICY IF EXISTS "Users can view their own phone numbers" ON twilio_phone_numbers;
    DROP POLICY IF EXISTS "Users can insert their own phone numbers" ON twilio_phone_numbers;
    DROP POLICY IF EXISTS "Users can update their own phone numbers" ON twilio_phone_numbers;
    DROP POLICY IF EXISTS "Users can delete their own phone numbers" ON twilio_phone_numbers;
  END IF;
END $$;

DROP POLICY IF EXISTS "Users can view their own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can insert their own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can update their own email templates" ON email_templates;
DROP POLICY IF EXISTS "Users can delete their own email templates" ON email_templates;

DROP POLICY IF EXISTS "Users can view their own email messages" ON email_messages;
DROP POLICY IF EXISTS "Users can insert their own email messages" ON email_messages;
DROP POLICY IF EXISTS "Users can update their own email messages" ON email_messages;

-- Create new RLS policies for organizations

-- Helper function to get user's organization_id
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organization"
  ON organizations FOR SELECT
  USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization"
  ON organizations FOR UPDATE
  USING (
    id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- User profiles policies
CREATE POLICY "Users can view profiles in their organization"
  ON user_profiles FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "New users can insert their profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Team invitations policies
CREATE POLICY "Users can view invitations in their organization"
  ON team_invitations FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can create invitations"
  ON team_invitations FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update invitations"
  ON team_invitations FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete invitations"
  ON team_invitations FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Search results policies (organization-based)
CREATE POLICY "Team members can view organization search results"
  ON search_results FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization search results"
  ON search_results FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization search results"
  ON search_results FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Lead activities policies
CREATE POLICY "Team members can view organization activities"
  ON lead_activities FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization activities"
  ON lead_activities FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization activities"
  ON lead_activities FOR UPDATE
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization activities"
  ON lead_activities FOR DELETE
  USING (organization_id = get_user_organization_id());

-- SMS messages policies
CREATE POLICY "Team members can view organization SMS messages"
  ON sms_messages FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization SMS messages"
  ON sms_messages FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization SMS messages"
  ON sms_messages FOR UPDATE
  USING (organization_id = get_user_organization_id());

-- Twilio phone numbers policies (only if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'twilio_phone_numbers') THEN
    EXECUTE 'CREATE POLICY "Team members can view organization phone numbers"
      ON twilio_phone_numbers FOR SELECT
      USING (organization_id = get_user_organization_id())';
    
    EXECUTE 'CREATE POLICY "Team members can insert organization phone numbers"
      ON twilio_phone_numbers FOR INSERT
      WITH CHECK (organization_id = get_user_organization_id())';
    
    EXECUTE 'CREATE POLICY "Team members can update organization phone numbers"
      ON twilio_phone_numbers FOR UPDATE
      USING (organization_id = get_user_organization_id())';
    
    EXECUTE 'CREATE POLICY "Team members can delete organization phone numbers"
      ON twilio_phone_numbers FOR DELETE
      USING (organization_id = get_user_organization_id())';
  END IF;
END $$;

-- Email templates policies
CREATE POLICY "Team members can view organization email templates"
  ON email_templates FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization email templates"
  ON email_templates FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization email templates"
  ON email_templates FOR UPDATE
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization email templates"
  ON email_templates FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Email messages policies
CREATE POLICY "Team members can view organization email messages"
  ON email_messages FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization email messages"
  ON email_messages FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization email messages"
  ON email_messages FOR UPDATE
  USING (organization_id = get_user_organization_id());

-- Function to automatically create organization and profile for new signups
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
BEGIN
  -- Check if there's a pending invitation for this email
  -- If yes, skip creating org/profile - accept-invite will handle it
  SELECT * INTO pending_invitation
  FROM team_invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;
  
  -- If invitation exists, skip auto-creating org (accept-invite will create profile)
  IF pending_invitation IS NOT NULL THEN
    -- Don't create org/profile yet - accept-invite will handle it
    RETURN NEW;
  END IF;
  
  -- No invitation found - create new organization for regular signup
  INSERT INTO organizations (name)
  VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
  RETURNING id INTO new_org_id;
  
  INSERT INTO user_profiles (id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'admin');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to clean up expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();



-- ==========================================


-- Migration: 20241031000001_fix_invitation_signup_trigger.sql
-- Fix handle_new_user() trigger to check for pending invitations
-- If user signs up with a pending invitation, skip creating new org
-- accept-invite will handle creating the profile and joining the team

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
BEGIN
  -- Check if there's a pending invitation for this email (case-insensitive)
  -- If yes, skip creating org/profile - accept-invite will handle it
  BEGIN
    SELECT * INTO pending_invitation
    FROM team_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at > NOW()
    LIMIT 1;
    
    -- If invitation exists, skip auto-creating org (accept-invite will create profile)
    IF pending_invitation IS NOT NULL THEN
      -- Don't create org/profile yet - accept-invite will handle it
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If check fails for any reason, log and continue with normal signup
    -- This prevents the trigger from blocking user creation
    RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
  END;
  
  -- No invitation found - create new organization for regular signup
  BEGIN
    INSERT INTO organizations (name)
    VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
    RETURNING id INTO new_org_id;
    
    INSERT INTO user_profiles (id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'admin');
    
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- If organization/profile creation fails, log the error but don't block user creation
    -- The user will still be created in auth.users, but without org/profile
    -- They can be manually added later or accept-invite can handle it
    RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to accept invitation (bypasses RLS for status updates)
CREATE OR REPLACE FUNCTION accept_team_invitation(invitation_token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE token = invitation_token
    AND status = 'pending'
    AND expires_at > NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user emails for team members (bypasses RLS)
CREATE OR REPLACE FUNCTION get_team_member_emails(member_ids UUID[])
RETURNS TABLE(user_id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email
  FROM auth.users au
  WHERE au.id = ANY(member_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000002_add_email_to_user_profiles.sql
-- Add email column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Populate email from auth.users for existing profiles
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id 
  AND up.email IS NULL;

-- Update the handle_new_user trigger to include email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  pending_invitation RECORD;
  new_org_id UUID;
  new_profile_id UUID;
BEGIN
  -- Check for a pending invitation with matching email (case-insensitive)
  SELECT * INTO pending_invitation
  FROM team_invitations
  WHERE LOWER(email) = LOWER(NEW.email)
    AND status = 'pending'
    AND expires_at > NOW()
  LIMIT 1;

  -- If there's a pending invitation, skip creating org/profile
  -- The accept-invite API will handle it
  IF pending_invitation IS NOT NULL THEN
    RAISE LOG 'User % has pending invitation, skipping org/profile creation', NEW.email;
    RETURN NEW;
  END IF;

  -- No pending invitation, create new org and profile
  BEGIN
    -- Create new organization
    INSERT INTO organizations (name)
    VALUES (NEW.email || '''s Organization')
    RETURNING id INTO new_org_id;

    -- Create user profile
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (NEW.id, new_org_id, 'admin', NEW.email)
    RETURNING id INTO new_profile_id;

    RAISE LOG 'Created organization % and profile % for new user %', new_org_id, new_profile_id, NEW.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating org/profile for user %: %', NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also update existing profiles when users update their email
CREATE OR REPLACE FUNCTION sync_user_email()
RETURNS TRIGGER AS $$
BEGIN
  -- Update user_profiles.email if auth.users.email changes
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE user_profiles
    SET email = NEW.email, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to sync email changes
DROP TRIGGER IF EXISTS sync_user_email_trigger ON auth.users;
CREATE TRIGGER sync_user_email_trigger
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_email();



-- ==========================================


-- Migration: 20241031000003_add_delete_policy_for_user_profiles.sql
-- Add DELETE policy for user_profiles
-- Admins can delete other members in their organization (but not themselves)
CREATE POLICY "Admins can delete members in their organization"
  ON user_profiles FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    id != auth.uid() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );



-- ==========================================


-- Migration: 20241031000004_add_delete_member_function.sql
-- Create a function to delete team members that bypasses RLS
-- This ensures admins can delete members even if RLS policies have issues
CREATE OR REPLACE FUNCTION delete_team_member(member_id_to_delete UUID)
RETURNS TABLE(deleted_id UUID, deleted_email TEXT) AS $$
DECLARE
  admin_profile RECORD;
  member_profile RECORD;
  deleted_email TEXT;
BEGIN
  -- Get admin's profile to verify permissions
  SELECT * INTO admin_profile
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check admin exists and is admin
  IF admin_profile IS NULL THEN
    RAISE EXCEPTION 'Admin profile not found';
  END IF;
  
  IF admin_profile.role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can delete team members';
  END IF;
  
  -- Get member to delete
  SELECT * INTO member_profile
  FROM user_profiles
  WHERE id = member_id_to_delete;
  
  IF member_profile IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  
  -- Check same organization
  IF member_profile.organization_id != admin_profile.organization_id THEN
    RAISE EXCEPTION 'Member not in your organization';
  END IF;
  
  -- Prevent self-deletion
  IF member_profile.id = admin_profile.id THEN
    RAISE EXCEPTION 'You cannot delete yourself';
  END IF;
  
  -- Get email before deletion
  deleted_email := member_profile.email;
  
  -- Delete the member (bypasses RLS due to SECURITY DEFINER)
  DELETE FROM user_profiles
  WHERE id = member_id_to_delete;
  
  -- Return deleted info
  RETURN QUERY SELECT member_id_to_delete, deleted_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000005_improve_signup_trigger.sql
-- Improve handle_new_user() trigger to be more robust
-- Include email field when creating profile
-- Better error handling

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1;
      
      -- If invitation exists, skip auto-creating org/profile
      -- accept-invite will handle creating the profile and joining the team
      IF pending_invitation IS NOT NULL THEN
        RAISE LOG 'User % has pending invitation, skipping org/profile creation', NEW.email;
        RETURN NEW; -- User created, profile will be created by accept-invite
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invitation check fails, log and continue with normal signup
      RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
    END;
    
    -- No invitation found - create new organization and profile for regular signup
    BEGIN
      -- Create organization
      INSERT INTO organizations (name)
      VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
      RETURNING id INTO new_org_id;
      
      IF new_org_id IS NULL THEN
        RAISE WARNING 'Failed to create organization for user %', NEW.email;
        RETURN NEW; -- Still allow user creation
      END IF;
      
      -- Create user profile with email
      INSERT INTO user_profiles (id, organization_id, role, email)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user %', new_org_id, NEW.email;
      
    EXCEPTION WHEN OTHERS THEN
      -- If organization/profile creation fails, log the error but don't block user creation
      -- The user will still be created in auth.users, but without org/profile
      -- They can be manually added later or accept-invite can handle it
      RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
      
      -- If org was created but profile creation failed, try to clean up
      IF new_org_id IS NOT NULL AND NOT profile_created THEN
        BEGIN
          DELETE FROM organizations WHERE id = new_org_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore cleanup errors
          RAISE WARNING 'Error cleaning up organization %: %', new_org_id, SQLERRM;
        END;
      END IF;
    END;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log everything but never block user creation
    RAISE WARNING 'Unexpected error in handle_new_user() for %: %', NEW.email, SQLERRM;
  END;
  
  -- Always return NEW to allow user creation, no matter what happens above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000006_auto_accept_invitations_in_trigger.sql
-- Auto-accept invitations during signup
-- This ensures invitations are automatically accepted when users sign up
-- No need to rely on API calls or external services

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- FIRST: Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- If invitation exists, automatically accept it and create profile
      IF pending_invitation IS NOT NULL THEN
        BEGIN
          RAISE LOG 'User % has pending invitation, auto-accepting and creating profile', NEW.email;
          
          -- Create user profile with invitation's organization and role
          INSERT INTO user_profiles (id, organization_id, role, email)
          VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email);
          
          profile_created := TRUE;
          
          -- Mark invitation as accepted (using the function that bypasses RLS)
          BEGIN
            PERFORM accept_team_invitation(pending_invitation.token);
          EXCEPTION WHEN OTHERS THEN
            -- Fallback: direct update if function fails
            UPDATE team_invitations
            SET 
              status = 'accepted',
              accepted_at = NOW()
            WHERE id = pending_invitation.id
              AND status = 'pending';
          END;
          
          RAISE LOG 'âœ… Auto-accepted invitation and created profile for user % in organization %', 
            NEW.email, pending_invitation.organization_id;
          
          RETURN NEW; -- User created, profile created, invitation accepted - all done!
          
        EXCEPTION WHEN OTHERS THEN
          -- If profile creation or invitation acceptance fails, log but continue
          RAISE WARNING 'Error auto-accepting invitation for %: %', NEW.email, SQLERRM;
          -- Fall through to create normal org/profile below
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invitation check fails, log and continue with normal signup
      RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
    END;
    
    -- No invitation found or invitation handling failed - create new organization and profile for regular signup
    IF NOT profile_created THEN
      BEGIN
        -- Create organization
        INSERT INTO organizations (name)
        VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
        RETURNING id INTO new_org_id;
        
        IF new_org_id IS NULL THEN
          RAISE WARNING 'Failed to create organization for user %', NEW.email;
          RETURN NEW; -- Still allow user creation
        END IF;
        
        -- Create user profile with email
        INSERT INTO user_profiles (id, organization_id, role, email)
        VALUES (NEW.id, new_org_id, 'admin', NEW.email);
        
        profile_created := TRUE;
        RAISE LOG 'Created organization % and profile for user %', new_org_id, NEW.email;
        
      EXCEPTION WHEN OTHERS THEN
        -- If organization/profile creation fails, log the error but don't block user creation
        RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
        
        -- If org was created but profile creation failed, try to clean up
        IF new_org_id IS NOT NULL AND NOT profile_created THEN
          BEGIN
            DELETE FROM organizations WHERE id = new_org_id;
          EXCEPTION WHEN OTHERS THEN
            -- Ignore cleanup errors
            RAISE WARNING 'Error cleaning up organization %: %', new_org_id, SQLERRM;
          END;
        END IF;
      END;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log everything but never block user creation
    RAISE WARNING 'Unexpected error in handle_new_user() for %: %', NEW.email, SQLERRM;
  END;
  
  -- Always return NEW to allow user creation, no matter what happens above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000007_fix_existing_unaccepted_invitations.sql
-- Function to fix existing users who signed up but their invitations weren't accepted
-- This can be run manually or scheduled to catch any missed invitations

CREATE OR REPLACE FUNCTION fix_unaccepted_invitations()
RETURNS TABLE(
  user_email TEXT,
  invitation_id UUID,
  action_taken TEXT,
  success BOOLEAN
) AS $$
DECLARE
  inv RECORD;
  user_record RECORD;
  profile_record RECORD;
BEGIN
  -- Find all pending invitations where the user already exists in auth.users
  FOR inv IN
    SELECT ti.*
    FROM team_invitations ti
    INNER JOIN auth.users au ON LOWER(au.email) = LOWER(ti.email)
    WHERE ti.status = 'pending'
      AND ti.expires_at > NOW()
    ORDER BY ti.created_at DESC
  LOOP
    BEGIN
      -- Get the user
      SELECT * INTO user_record
      FROM auth.users
      WHERE LOWER(email) = LOWER(inv.email)
      LIMIT 1;
      
      IF user_record IS NULL THEN
        -- User doesn't exist yet, skip
        CONTINUE;
      END IF;
      
      -- Check if profile exists
      SELECT * INTO profile_record
      FROM user_profiles
      WHERE id = user_record.id;
      
      IF profile_record IS NULL THEN
        -- No profile exists - create one with invitation's org
        INSERT INTO user_profiles (id, organization_id, role, email)
        VALUES (user_record.id, inv.organization_id, inv.role, user_record.email);
        
        -- Mark invitation as accepted
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = inv.id;
        
        RETURN QUERY SELECT 
          inv.email,
          inv.id,
          'Created profile and accepted invitation'::TEXT,
          TRUE;
          
      ELSIF profile_record.organization_id != inv.organization_id THEN
        -- Profile exists but in different org - check if solo org
        DECLARE
          member_count INTEGER;
        BEGIN
          SELECT COUNT(*) INTO member_count
          FROM user_profiles
          WHERE organization_id = profile_record.organization_id;
          
          IF member_count = 1 THEN
            -- Solo org - move to invitation's org
            UPDATE user_profiles
            SET 
              organization_id = inv.organization_id,
              role = inv.role,
              email = user_record.email
            WHERE id = user_record.id;
            
            -- Delete the solo org
            DELETE FROM organizations WHERE id = profile_record.organization_id;
            
            -- Mark invitation as accepted
            UPDATE team_invitations
            SET status = 'accepted', accepted_at = NOW()
            WHERE id = inv.id;
            
            RETURN QUERY SELECT 
              inv.email,
              inv.id,
              'Moved user to invitation organization and accepted invitation'::TEXT,
              TRUE;
          ELSE
            -- User is in an org with others - leave as is, but mark invitation as expired
            UPDATE team_invitations
            SET status = 'expired'
            WHERE id = inv.id;
            
            RETURN QUERY SELECT 
              inv.email,
              inv.id,
              'User already in organization with others, expired invitation'::TEXT,
              FALSE;
          END IF;
        END;
      ELSE
        -- Profile exists and is already in the correct org - just mark invitation as accepted
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = inv.id;
        
        RETURN QUERY SELECT 
          inv.email,
          inv.id,
          'User already in correct organization, marked invitation as accepted'::TEXT,
          TRUE;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue
      RETURN QUERY SELECT 
        inv.email,
        inv.id,
        ('Error: ' || SQLERRM)::TEXT,
        FALSE;
    END;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the fix function automatically (one-time)
-- This will fix all existing pending invitations for users who already signed up
DO $$
DECLARE
  result RECORD;
BEGIN
  -- Run the fix function and log results
  FOR result IN SELECT * FROM fix_unaccepted_invitations() LOOP
    RAISE LOG 'Fixed invitation for %: % (Success: %)', 
      result.user_email, result.action_taken, result.success;
  END LOOP;
END $$;



-- ==========================================


-- Migration: 20241031000008_manual_fix_current_invitation.sql
-- Manual fix for the current pending invitation
-- Run this to fix the invitation for ernzkiegemini@gmail.com

DO $$
DECLARE
  user_id_var UUID;
  invitation_record RECORD;
  profile_record RECORD;
  org_member_count INTEGER;
BEGIN
  -- Get the user ID
  SELECT id INTO user_id_var
  FROM auth.users
  WHERE LOWER(email) = LOWER('ernzkiegemini@gmail.com')
  LIMIT 1;
  
  IF user_id_var IS NULL THEN
    RAISE NOTICE 'User ernzkiegemini@gmail.com not found in auth.users';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found user: %', user_id_var;
  
  -- Get the pending invitation
  SELECT * INTO invitation_record
  FROM team_invitations
  WHERE LOWER(email) = LOWER('ernzkiegemini@gmail.com')
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record IS NULL THEN
    RAISE NOTICE 'No pending invitation found for ernzkiegemini@gmail.com';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Found invitation: % (org: %, role: %)', 
    invitation_record.id, 
    invitation_record.organization_id, 
    invitation_record.role;
  
  -- Check if profile exists
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE id = user_id_var;
  
  IF profile_record IS NULL THEN
    -- No profile exists - create one
    RAISE NOTICE 'Creating profile for user...';
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (user_id_var, invitation_record.organization_id, invitation_record.role, 'ernzkiegemini@gmail.com');
    
    RAISE NOTICE 'Profile created successfully';
  ELSE
    RAISE NOTICE 'Profile exists: org=%, role=%', profile_record.organization_id, profile_record.role;
    
    -- Check if user is in a solo org
    SELECT COUNT(*) INTO org_member_count
    FROM user_profiles
    WHERE organization_id = profile_record.organization_id;
    
    IF org_member_count = 1 THEN
      -- Solo org - move to invitation's org
      RAISE NOTICE 'User in solo org, moving to invitation org...';
      UPDATE user_profiles
      SET 
        organization_id = invitation_record.organization_id,
        role = invitation_record.role,
        email = 'ernzkiegemini@gmail.com'
      WHERE id = user_id_var;
      
      -- Delete the solo org
      DELETE FROM organizations WHERE id = profile_record.organization_id;
      
      RAISE NOTICE 'User moved to invitation organization';
    ELSIF profile_record.organization_id != invitation_record.organization_id THEN
      RAISE NOTICE 'User is already in an organization with other members. Cannot move automatically.';
    ELSE
      RAISE NOTICE 'User already in correct organization';
    END IF;
  END IF;
  
  -- Mark invitation as accepted
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = invitation_record.id;
  
  RAISE NOTICE 'âœ… Invitation marked as accepted';
  RAISE NOTICE 'Done! Refresh the Settings page to see the changes.';
  
END $$;

-- Verify the fix
SELECT 
  'User Profile:' as check_type,
  up.id::text as user_id,
  up.organization_id::text as org_id,
  up.role,
  up.email
FROM user_profiles up
WHERE up.email = 'ernzkiegemini@gmail.com'

UNION ALL

SELECT 
  'Invitation Status:' as check_type,
  ti.id::text,
  ti.status,
  ti.organization_id::text,
  ti.email
FROM team_invitations ti
WHERE LOWER(ti.email) = LOWER('ernzkiegemini@gmail.com');



-- ==========================================


-- Migration: 20241031000009_fix_invitation_acceptance_with_bypass.sql
-- Create a comprehensive function to auto-accept invitations for users
-- This bypasses RLS completely and handles all edge cases

CREATE OR REPLACE FUNCTION auto_accept_user_invitation(user_email_param TEXT)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  invitation_id UUID,
  profile_created BOOLEAN
) AS $$
DECLARE
  user_record RECORD;
  invitation_record RECORD;
  profile_record RECORD;
  org_member_count INTEGER;
  old_org_id UUID;
BEGIN
  -- Get the user
  SELECT * INTO user_record
  FROM auth.users
  WHERE LOWER(email) = LOWER(user_email_param)
  LIMIT 1;
  
  IF user_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Get the most recent pending invitation for this email
  SELECT * INTO invitation_record
  FROM team_invitations
  WHERE LOWER(email) = LOWER(user_email_param)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No pending invitation found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Check if profile exists
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE id = user_record.id;
  
  -- Handle profile creation/update
  IF profile_record IS NULL THEN
    -- No profile - create one
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (user_record.id, invitation_record.organization_id, invitation_record.role, user_record.email);
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE, 
      'Profile created and invitation accepted'::TEXT,
      invitation_record.id,
      TRUE;
    RETURN;
  END IF;
  
  -- Profile exists - check if in solo org
  IF profile_record.organization_id IS NOT NULL THEN
    SELECT COUNT(*) INTO org_member_count
    FROM user_profiles
    WHERE organization_id = profile_record.organization_id;
    
    IF org_member_count = 1 THEN
      -- Solo org - move to invitation org
      old_org_id := profile_record.organization_id;
      
      UPDATE user_profiles
      SET 
        organization_id = invitation_record.organization_id,
        role = invitation_record.role,
        email = user_record.email
      WHERE id = user_record.id;
      
      -- Delete old solo org
      DELETE FROM organizations WHERE id = old_org_id;
      
      -- Mark invitation as accepted
      UPDATE team_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = invitation_record.id;
      
      RETURN QUERY SELECT 
        TRUE,
        'User moved to invitation organization'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    ELSIF profile_record.organization_id = invitation_record.organization_id THEN
      -- Already in correct org - just mark invitation as accepted
      UPDATE team_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = invitation_record.id;
      
      RETURN QUERY SELECT 
        TRUE,
        'User already in organization, invitation marked as accepted'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    ELSE
      -- User in different org with others - can't auto-move
      RETURN QUERY SELECT 
        FALSE,
        'User already in different organization'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    END IF;
  ELSE
    -- Profile exists but no org - update it
    UPDATE user_profiles
    SET 
      organization_id = invitation_record.organization_id,
      role = invitation_record.role,
      email = user_record.email
    WHERE id = user_record.id;
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE,
      'Profile updated and invitation accepted'::TEXT,
      invitation_record.id,
      FALSE;
    RETURN;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    FALSE,
    ('Error: ' || SQLERRM)::TEXT,
    COALESCE(invitation_record.id, NULL::UUID),
    FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000010_add_update_role_function.sql
-- Create function to update team member role (bypasses RLS)
-- Allows admins to update roles of members in their organization

CREATE OR REPLACE FUNCTION update_team_member_role(
  member_id_to_update UUID,
  new_role TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  admin_profile RECORD;
  member_profile RECORD;
  admin_count INTEGER;
BEGIN
  -- Get admin's profile to verify permissions
  SELECT * INTO admin_profile
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Check admin exists and is admin
  IF admin_profile IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Admin profile not found'::TEXT;
    RETURN;
  END IF;
  
  IF admin_profile.role != 'admin' THEN
    RETURN QUERY SELECT FALSE, 'Only admins can update team member roles'::TEXT;
    RETURN;
  END IF;
  
  -- Validate role
  IF new_role NOT IN ('admin', 'member') THEN
    RETURN QUERY SELECT FALSE, 'Invalid role. Must be admin or member'::TEXT;
    RETURN;
  END IF;
  
  -- Get member to update
  SELECT * INTO member_profile
  FROM user_profiles
  WHERE id = member_id_to_update;
  
  IF member_profile IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Member not found'::TEXT;
    RETURN;
  END IF;
  
  -- Check same organization
  IF member_profile.organization_id != admin_profile.organization_id THEN
    RETURN QUERY SELECT FALSE, 'Member not in your organization'::TEXT;
    RETURN;
  END IF;
  
  -- Prevent self-update (optional, but good practice)
  IF member_profile.id = admin_profile.id THEN
    RETURN QUERY SELECT FALSE, 'Cannot update your own role'::TEXT;
    RETURN;
  END IF;
  
  -- If demoting from admin, check if they're the last admin
  IF member_profile.role = 'admin' AND new_role = 'member' THEN
    SELECT COUNT(*) INTO admin_count
    FROM user_profiles
    WHERE organization_id = admin_profile.organization_id
      AND role = 'admin';
    
    IF admin_count <= 1 THEN
      RETURN QUERY SELECT FALSE, 'Cannot demote the last admin'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Update the role (bypasses RLS due to SECURITY DEFINER)
  UPDATE user_profiles
  SET 
    role = new_role,
    updated_at = NOW()
  WHERE id = member_id_to_update;
  
  RETURN QUERY SELECT TRUE, 'Role updated successfully'::TEXT;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, ('Error: ' || SQLERRM)::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- ==========================================


-- Migration: 20241031000011_optional_cleanup_unused_functions.sql
-- Optional cleanup: Remove unused auto-accept functions if you want to simplify
-- These are safe to remove since we're using Force Accept button instead
-- 
-- Uncomment the lines below if you want to remove them:

-- DROP FUNCTION IF EXISTS auto_accept_user_invitation(TEXT);
-- DROP FUNCTION IF EXISTS fix_unaccepted_invitations();

-- Note: Keep these functions as they're still used:
-- - accept_team_invitation(TEXT) - used by Force Accept button
-- - get_team_member_emails(UUID[]) - used to display team member emails
-- - delete_team_member(UUID) - used to remove team members
-- - update_team_member_role(UUID, TEXT) - used to update roles



-- ==========================================


-- Migration: 20241031000012_fix_history_views_for_organization.sql
-- Add organization_id to search_history table (if not already added)
ALTER TABLE search_history 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing search_history records to have organization_id
UPDATE search_history sh
SET organization_id = (
  SELECT DISTINCT sr.organization_id
  FROM search_results sr
  WHERE sr.search_history_id = sh.id
  LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM search_results sr WHERE sr.search_history_id = sh.id);

-- For search_history records without results, use user's organization
UPDATE search_history sh
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = sh.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_search_history_organization ON search_history(organization_id);

-- Drop old RLS policies if exist and create new organization-based ones
DROP POLICY IF EXISTS "Users can view their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can delete their own search history" ON search_history;
DROP POLICY IF EXISTS "Team members can view organization search history" ON search_history;
DROP POLICY IF EXISTS "Team members can delete organization search history" ON search_history;

CREATE POLICY "Team members can view organization search history"
  ON search_history FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization search history"
  ON search_history FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Update views to be organization-aware
CREATE OR REPLACE VIEW user_sms_history AS
SELECT 
  sm.id,
  sm.lead_id,
  sm.user_id,
  sm.template_id,
  sm.phone_number,
  sm.message,
  sm.status,
  sm.twilio_sid,
  sm.error_message,
  sm.sent_at,
  sm.delivered_at,
  sm.created_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  st.name as template_name
FROM sms_messages sm
LEFT JOIN search_results sr ON sm.lead_id = sr.id
LEFT JOIN sms_templates st ON sm.template_id = st.id
WHERE sm.organization_id = get_user_organization_id();

COMMENT ON VIEW user_sms_history IS 'SMS message history with lead and template information (organization-filtered)';

-- Add organization_id to calls table if it doesn't exist
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing calls to have organization_id from their lead
UPDATE calls c
SET organization_id = (
  SELECT sr.organization_id
  FROM search_results sr
  WHERE sr.id = c.lead_id
  LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM search_results sr WHERE sr.id = c.lead_id);

-- For calls without leads, use user's organization
UPDATE calls c
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = c.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_calls_organization ON calls(organization_id);

-- Update RLS policies for calls table
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
DROP POLICY IF EXISTS "Team members can view organization calls" ON calls;
CREATE POLICY "Team members can view organization calls"
  ON calls FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Update call history view
CREATE OR REPLACE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id
WHERE c.organization_id = get_user_organization_id();

COMMENT ON VIEW user_call_history IS 'Call history with lead information (organization-filtered)';



-- ==========================================


-- Migration: 20241031000013_fix_sms_templates_for_organization.sql
-- Add organization_id to sms_templates table
ALTER TABLE sms_templates 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing sms_templates to have organization_id from user
UPDATE sms_templates st
SET organization_id = (
  SELECT organization_id FROM user_profiles WHERE id = st.user_id
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_sms_templates_organization ON sms_templates(organization_id);

-- Drop old RLS policies and create new organization-based policies
DROP POLICY IF EXISTS "Users can view their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can create their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON sms_templates;

CREATE POLICY "Team members can view organization SMS templates"
  ON sms_templates FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can create organization SMS templates"
  ON sms_templates FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization SMS templates"
  ON sms_templates FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization SMS templates"
  ON sms_templates FOR DELETE
  USING (organization_id = get_user_organization_id());



-- ==========================================


-- Migration: 20241031000014_fix_lead_notes_activities_for_organization.sql
-- Add organization_id to lead_notes table
ALTER TABLE lead_notes 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Update existing lead_notes to have organization_id from their lead
UPDATE lead_notes ln
SET organization_id = (
  SELECT sr.organization_id
  FROM search_results sr
  WHERE sr.id = ln.lead_id
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_lead_notes_organization ON lead_notes(organization_id);

-- Drop old RLS policies and create new organization-based policies for lead_notes
DROP POLICY IF EXISTS "Users can view notes for their leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can create notes for their leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON lead_notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON lead_notes;

CREATE POLICY "Team members can view organization lead notes"
  ON lead_notes FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can create organization lead notes"
  ON lead_notes FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization lead notes"
  ON lead_notes FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization lead notes"
  ON lead_notes FOR DELETE
  USING (organization_id = get_user_organization_id());

-- lead_activities already has organization_id from the team system migration
-- But let's make sure the RLS policies are correct
DROP POLICY IF EXISTS "Users can view activities for their leads" ON lead_activities;
DROP POLICY IF EXISTS "Users can create activities for their leads" ON lead_activities;
DROP POLICY IF EXISTS "Team members can view organization activities" ON lead_activities;
DROP POLICY IF EXISTS "Team members can insert organization activities" ON lead_activities;

CREATE POLICY "Team members can view organization activities"
  ON lead_activities FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization activities"
  ON lead_activities FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());



-- ==========================================


-- Migration: 20241031000015_fix_missing_organization_ids.sql
-- Fix search_results that might be missing organization_id
-- This can happen if searches were done before the organization migration or if there was an issue

-- Update search_results that don't have organization_id
-- Link them via search_history to get the correct organization_id
UPDATE search_results sr
SET organization_id = (
  SELECT sh.organization_id
  FROM search_history sh
  WHERE sh.id = sr.search_history_id
  AND sh.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh 
    WHERE sh.id = sr.search_history_id 
    AND sh.organization_id IS NOT NULL
  );

-- For any remaining search_results without organization_id,
-- try to get it from the user who created them (via search_history)
UPDATE search_results sr
SET organization_id = (
  SELECT up.organization_id
  FROM search_history sh
  JOIN user_profiles up ON up.id = sh.user_id
  WHERE sh.id = sr.search_history_id
  AND up.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh
    JOIN user_profiles up ON up.id = sh.user_id
    WHERE sh.id = sr.search_history_id
    AND up.organization_id IS NOT NULL
  );

-- Log how many were fixed
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM search_results
  WHERE organization_id IS NOT NULL;
  
  RAISE LOG 'Fixed search_results: % records now have organization_id', fixed_count;
END $$;



-- ==========================================


-- Migration: 20241031000016_ensure_all_search_results_have_org_id.sql
-- Comprehensive fix for search_results missing organization_id
-- This migration ensures ALL search_results have organization_id, even edge cases

-- Step 1: Update from search_history (most common case)
UPDATE search_results sr
SET organization_id = (
  SELECT sh.organization_id
  FROM search_history sh
  WHERE sh.id = sr.search_history_id
  AND sh.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh 
    WHERE sh.id = sr.search_history_id 
    AND sh.organization_id IS NOT NULL
  );

-- Step 2: For any remaining, get organization_id from user via search_history
UPDATE search_results sr
SET organization_id = (
  SELECT up.organization_id
  FROM search_history sh
  JOIN user_profiles up ON up.id = sh.user_id
  WHERE sh.id = sr.search_history_id
  AND up.organization_id IS NOT NULL
  LIMIT 1
)
WHERE sr.organization_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM search_history sh
    JOIN user_profiles up ON up.id = sh.user_id
    WHERE sh.id = sr.search_history_id
    AND up.organization_id IS NOT NULL
  );

-- Step 3: For orphaned search_results (search_history deleted but results remain)
-- Get organization_id from any user_profiles that match the user who might have created it
-- This is a fallback - try to match by any available user in the same org pattern
-- Note: This is less precise but better than NULL

-- Count how many were fixed
DO $$
DECLARE
  total_count INTEGER;
  fixed_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM search_results;
  SELECT COUNT(*) INTO fixed_count FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM search_results WHERE organization_id IS NULL;
  
  RAISE NOTICE 'Total search_results: %', total_count;
  RAISE NOTICE 'With organization_id: %', fixed_count;
  RAISE NOTICE 'Without organization_id: %', null_count;
END $$;

-- Verify: Show any remaining NULLs (should be 0 or very few)
-- This is just for logging, not an error
SELECT 
  COUNT(*) as remaining_nulls,
  'Run this query to see which search_results still need fixing' as note
FROM search_results
WHERE organization_id IS NULL;



-- ==========================================


-- Migration: 20241031000017_diagnose_org_mismatch.sql
-- Diagnostic query to check for organization_id mismatches
-- This will help identify if search_results belong to different organizations than their search_history

-- Check for mismatches between search_history and search_results
SELECT 
  sh.id as search_history_id,
  sh.keyword,
  sh.location,
  sh.user_id,
  sh.organization_id as history_org_id,
  COUNT(sr.id) as result_count,
  COUNT(CASE WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 1 END) as mismatched_count
FROM search_history sh
LEFT JOIN search_results sr ON sr.search_history_id = sh.id
GROUP BY sh.id, sh.keyword, sh.location, sh.user_id, sh.organization_id
HAVING COUNT(sr.id) > 0
  AND COUNT(CASE WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 1 END) > 0
ORDER BY mismatched_count DESC;

-- Check search_results that might be in wrong organization
SELECT 
  sr.id,
  sr.search_history_id,
  sr.organization_id as result_org_id,
  sh.organization_id as history_org_id,
  sh.user_id,
  up.organization_id as user_org_id,
  CASE 
    WHEN sr.organization_id IS DISTINCT FROM sh.organization_id THEN 'MISMATCH: result org != history org'
    WHEN sr.organization_id IS DISTINCT FROM up.organization_id THEN 'MISMATCH: result org != user org'
    ELSE 'OK'
  END as status
FROM search_results sr
JOIN search_history sh ON sh.id = sr.search_history_id
LEFT JOIN user_profiles up ON up.id = sh.user_id
WHERE sr.organization_id IS DISTINCT FROM sh.organization_id
   OR sr.organization_id IS DISTINCT FROM up.organization_id
LIMIT 50;



-- ==========================================


-- Migration: 20241031000018_fix_org_id_mismatch.sql
-- Fix organization_id mismatches between search_history and search_results
-- This ensures all search_results match their search_history's organization_id

-- Fix: Update search_results to match search_history's organization_id
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sh.organization_id IS NOT NULL
  AND sr.organization_id IS DISTINCT FROM sh.organization_id;

-- Verify the fix worked
DO $$
DECLARE
  mismatch_count INTEGER;
  total_results INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM search_results sr
  JOIN search_history sh ON sh.id = sr.search_history_id
  WHERE sr.organization_id IS DISTINCT FROM sh.organization_id;
  
  SELECT COUNT(*) INTO total_results FROM search_results;
  
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Remaining mismatches: %', mismatch_count;
  
  IF mismatch_count > 0 THEN
    RAISE WARNING 'Still have % mismatches. Check if search_history has correct organization_id.', mismatch_count;
  END IF;
END $$;



-- ==========================================


-- Migration: 20241031000019_fix_search_results_rls.sql
-- Fix search_results RLS issues
-- This ensures all old policies are dropped and the function works correctly

-- Drop ALL old policies on search_results (in case any were missed)
DO $$
BEGIN
  -- Drop all existing policies on search_results
  DROP POLICY IF EXISTS "Users can view their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can insert their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can update their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can delete their own search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;
END $$;

-- Recreate the organization-based policies
CREATE POLICY "Team members can view organization search results"
  ON search_results FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Team members can insert organization search results"
  ON search_results FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Team members can delete organization search results"
  ON search_results FOR DELETE
  USING (organization_id = get_user_organization_id());

-- Verify the function exists and works
DO $$
DECLARE
  func_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM pg_proc 
    WHERE proname = 'get_user_organization_id'
  ) INTO func_exists;
  
  IF NOT func_exists THEN
    RAISE EXCEPTION 'Function get_user_organization_id() does not exist!';
  END IF;
  
  RAISE NOTICE 'Function get_user_organization_id() exists';
END $$;



-- ==========================================


-- Migration: 20241031000020_test_rls_function.sql
-- Test query to verify get_user_organization_id() works correctly
-- Run this manually in Supabase SQL Editor while logged in as a user
-- It will show you what organization_id the function returns

-- This is a diagnostic query, not a migration
-- Copy and run this in Supabase SQL Editor to debug:

/*
SELECT 
  auth.uid() as current_user_id,
  get_user_organization_id() as function_org_id,
  up.organization_id as profile_org_id,
  up.role,
  (SELECT COUNT(*) FROM search_results WHERE organization_id = get_user_organization_id()) as visible_results_count,
  (SELECT COUNT(*) FROM search_results) as total_results_count
FROM user_profiles up
WHERE up.id = auth.uid();
*/

-- Also check for any search_results that might have NULL organization_id:
-- SELECT COUNT(*) FROM search_results WHERE organization_id IS NULL;

-- And check if any search_results have organization_id that doesn't match search_history:
/*
SELECT 
  COUNT(*) as mismatch_count
FROM search_results sr
JOIN search_history sh ON sh.id = sr.search_history_id
WHERE sr.organization_id IS DISTINCT FROM sh.organization_id;
*/



-- ==========================================


-- Migration: 20241031000021_comprehensive_rls_fix.sql
-- Comprehensive RLS fix for search_results
-- This addresses the issue where results disappear immediately after insertion
-- The problem: RLS SELECT policies may not be evaluating correctly

-- Step 1: Improve get_user_organization_id() function
-- Mark it as STABLE so PostgreSQL can optimize and cache it properly
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- Get organization_id from user_profiles
  -- SECURITY DEFINER allows this to bypass RLS on user_profiles if needed
  SELECT organization_id INTO org_id
  FROM user_profiles
  WHERE id = auth.uid();
  
  -- Return the org_id (may be NULL if user doesn't have a profile)
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission so it can be called via RPC
GRANT EXECUTE ON FUNCTION get_user_organization_id() TO authenticated;

-- Step 2: Drop ALL existing policies on search_results to start fresh
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can insert their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can update their own search results" ON search_results;
  DROP POLICY IF EXISTS "Users can delete their own search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
  DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;
END $$;

-- Step 3: Create robust SELECT policy
-- This explicitly handles NULL cases and ensures the check works
CREATE POLICY "Team members can view organization search results"
  ON search_results FOR SELECT
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 4: Create INSERT policy
CREATE POLICY "Team members can insert organization search results"
  ON search_results FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 5: Create UPDATE policy
CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 6: Create DELETE policy
CREATE POLICY "Team members can delete organization search results"
  ON search_results FOR DELETE
  USING (
    organization_id IS NOT NULL 
    AND get_user_organization_id() IS NOT NULL
    AND organization_id = get_user_organization_id()
  );

-- Step 7: Verify all search_results have organization_id
-- Update any that are missing by matching them to their search_history
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sh.organization_id IS NOT NULL
  AND sr.organization_id IS NULL;

-- Step 8: Log verification
DO $$
DECLARE
  total_results INTEGER;
  results_with_org INTEGER;
  results_null_org INTEGER;
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_results FROM search_results;
  SELECT COUNT(*) INTO results_with_org FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO results_null_org FROM search_results WHERE organization_id IS NULL;
  
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'search_results';
  
  RAISE NOTICE '=== Search Results RLS Fix Summary ===';
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Results with organization_id: %', results_with_org;
  RAISE NOTICE 'Results with NULL organization_id: %', results_null_org;
  RAISE NOTICE 'RLS policies on search_results: %', policy_count;
  
  IF results_null_org > 0 THEN
    RAISE WARNING 'There are still % search_results with NULL organization_id', results_null_org;
  END IF;
END $$;


-- ==========================================


-- Migration: 20241104000000_add_missing_columns_to_search_results.sql
-- Add missing columns to search_results table
-- These columns are needed for multi-user organization support

-- Add organization_id column
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Add email column for scraped emails
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on organization_id for better query performance
CREATE INDEX IF NOT EXISTS idx_search_results_organization_id ON search_results(organization_id);

-- Backfill organization_id from search_history for existing records
UPDATE search_results sr
SET organization_id = sh.organization_id
FROM search_history sh
WHERE sr.search_history_id = sh.id
  AND sr.organization_id IS NULL
  AND sh.organization_id IS NOT NULL;

-- Log the migration
DO $$
DECLARE
  total_results INTEGER;
  results_with_org INTEGER;
  results_null_org INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_results FROM search_results;
  SELECT COUNT(*) INTO results_with_org FROM search_results WHERE organization_id IS NOT NULL;
  SELECT COUNT(*) INTO results_null_org FROM search_results WHERE organization_id IS NULL;
  
  RAISE NOTICE '=== Add Missing Columns Migration Summary ===';
  RAISE NOTICE 'Total search_results: %', total_results;
  RAISE NOTICE 'Results with organization_id: %', results_with_org;
  RAISE NOTICE 'Results with NULL organization_id: %', results_null_org;
  
  IF results_null_org > 0 THEN
    RAISE WARNING 'There are still % search_results with NULL organization_id - these may be orphaned records', results_null_org;
  END IF;
END $$;



-- ==========================================


-- Migration: 20241104000001_add_delete_policies_for_history.sql
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



-- ==========================================


-- Migration: 20241105000000_add_conversations_support.sql
-- Add support for two-way SMS conversations and manual lead creation
-- This migration adds inbound SMS handling and manual lead entries

-- 1. Add direction column to sms_messages for inbound/outbound tracking
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);

-- Add column to track if message was read
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sms_messages_unread ON sms_messages(is_read) WHERE is_read = FALSE;

-- 2. Add source column to search_results to track manual vs Google Maps leads
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'google_maps' CHECK (lead_source IN ('google_maps', 'manual'));

CREATE INDEX IF NOT EXISTS idx_search_results_source ON search_results(lead_source);

-- 3. Modify search_history_id to be nullable for manual leads (they don't have search history)
ALTER TABLE search_results 
ALTER COLUMN search_history_id DROP NOT NULL;

-- 4. Create a view for conversation threads (grouped by lead with latest message)
CREATE OR REPLACE VIEW conversation_threads AS
SELECT 
  sr.id as lead_id,
  sr.name as lead_name,
  sr.phone as lead_phone,
  sr.address as lead_address,
  sr.organization_id,
  sr.lead_source,
  COUNT(sm.id) as message_count,
  COUNT(sm.id) FILTER (WHERE sm.is_read = FALSE AND sm.direction = 'inbound') as unread_count,
  MAX(sm.sent_at) as last_message_at,
  (SELECT sm2.message 
   FROM sms_messages sm2 
   WHERE sm2.lead_id = sr.id 
   ORDER BY sm2.sent_at DESC 
   LIMIT 1) as last_message,
  (SELECT sm2.direction 
   FROM sms_messages sm2 
   WHERE sm2.lead_id = sr.id 
   ORDER BY sm2.sent_at DESC 
   LIMIT 1) as last_message_direction
FROM search_results sr
LEFT JOIN sms_messages sm ON sr.id = sm.lead_id
WHERE EXISTS (SELECT 1 FROM sms_messages WHERE lead_id = sr.id)
GROUP BY sr.id, sr.name, sr.phone, sr.address, sr.organization_id, sr.lead_source;

COMMENT ON VIEW conversation_threads IS 'SMS conversation threads grouped by lead with message counts and latest message info';

-- 5. Update RLS policies for inbound SMS (service role will insert these via webhook)
-- The existing policies already allow team members to view organization SMS messages

-- 6. Add comments
COMMENT ON COLUMN sms_messages.direction IS 'Message direction: inbound (received) or outbound (sent)';
COMMENT ON COLUMN sms_messages.is_read IS 'Whether inbound message has been read by user';
COMMENT ON COLUMN search_results.lead_source IS 'How the lead was added: google_maps or manual';



-- ==========================================


-- Migration: 20241105000001_add_recycle_bin_support.sql
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



-- ==========================================


-- Migration: 20241105000002_fix_manual_leads_place_id.sql
-- Fix manual lead creation by making optional fields nullable
-- Manual leads don't have all Google Maps data

-- 1. Make place_id nullable (it was required before)
ALTER TABLE search_results ALTER COLUMN place_id DROP NOT NULL;

-- 2. Make address nullable (optional for manual leads)
ALTER TABLE search_results ALTER COLUMN address DROP NOT NULL;

-- 3. Add comments
COMMENT ON COLUMN search_results.place_id IS 'Google Maps place ID (nullable for manual leads)';
COMMENT ON COLUMN search_results.address IS 'Business address (optional for manual leads)';

-- 4. For existing manual leads (if any), generate a unique place_id
UPDATE search_results 
SET place_id = 'manual_' || id::text 
WHERE place_id IS NULL AND lead_source = 'manual';



-- ==========================================


-- Migration: 20241113000000_add_sms_error_tracking.sql
-- Add error tracking columns to sms_messages table
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add index for faster lookups by twilio_sid (for status updates)
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON sms_messages(twilio_sid);



-- ==========================================


-- Migration: 20241114000000_add_call_forwarding_settings.sql
-- Add call forwarding settings to user_profiles table
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS forwarding_phone TEXT,
  ADD COLUMN IF NOT EXISTS call_status TEXT DEFAULT 'available' CHECK (call_status IN ('available', 'unavailable')),
  ADD COLUMN IF NOT EXISTS voicemail_message TEXT DEFAULT 'Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.';

-- Add comment
COMMENT ON COLUMN user_profiles.forwarding_phone IS 'Phone number where inbound calls should be forwarded';
COMMENT ON COLUMN user_profiles.call_status IS 'Availability status: available or unavailable';
COMMENT ON COLUMN user_profiles.voicemail_message IS 'Custom voicemail greeting message';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_call_status ON user_profiles(call_status);



-- ==========================================


-- Migration: 20241114000001_add_inbound_call_support.sql
-- Add inbound call support to calls table
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  ADD COLUMN IF NOT EXISTS voicemail_left BOOLEAN DEFAULT false;

-- Add comment
COMMENT ON COLUMN calls.direction IS 'Call direction: inbound (lead called us) or outbound (we called lead)';
COMMENT ON COLUMN calls.voicemail_left IS 'Whether caller left a voicemail';

-- Add index for faster filtering by direction
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);
CREATE INDEX IF NOT EXISTS idx_calls_voicemail ON calls(voicemail_left) WHERE voicemail_left = true;

-- Update lead_source enum to include inbound_call
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'search_results_lead_source_check'
  ) THEN
    ALTER TABLE search_results 
      ADD CONSTRAINT search_results_lead_source_check 
      CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call'));
  ELSE
    -- Drop and recreate constraint to add new value
    ALTER TABLE search_results DROP CONSTRAINT IF EXISTS search_results_lead_source_check;
    ALTER TABLE search_results 
      ADD CONSTRAINT search_results_lead_source_check 
      CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call'));
  END IF;
END $$;

COMMENT ON CONSTRAINT search_results_lead_source_check ON search_results IS 'Lead source: google_maps, manual, or inbound_call';



-- ==========================================


-- Migration: 20241114000002_update_call_history_view_for_inbound.sql
-- Update user_call_history view to include inbound calls
-- Note: is_new column added in next migration (20241114000003)
DROP VIEW IF EXISTS user_call_history;
CREATE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.direction,
  c.voicemail_left,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at,
  c.organization_id
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id
WHERE c.organization_id = get_user_organization_id()
  AND c.deleted_at IS NULL;

COMMENT ON VIEW user_call_history IS 'Call history with lead information including inbound calls (organization-filtered)';



-- ==========================================


-- Migration: 20241114000003_add_voicemail_read_status.sql
-- Add is_new flag to track unread voicemails
ALTER TABLE calls 
  ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN calls.is_new IS 'Whether the call/voicemail is new (unread)';

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_calls_is_new ON calls(is_new) WHERE is_new = true;

-- For inbound calls with voicemail, they should start as "new"
-- For outbound calls, they are not "new" (user initiated them)
UPDATE calls SET is_new = false WHERE direction = 'outbound' OR direction IS NULL;

-- Update the view to include the new is_new column
DROP VIEW IF EXISTS user_call_history;
CREATE VIEW user_call_history AS
SELECT 
  c.id,
  c.lead_id,
  c.user_id,
  c.phone_number,
  c.call_type,
  c.status,
  c.duration,
  c.direction,
  c.voicemail_left,
  c.is_new,
  c.twilio_call_sid,
  c.twilio_recording_sid,
  c.recording_url,
  c.notes,
  c.outcome,
  c.callback_date,
  c.initiated_at,
  c.answered_at,
  c.ended_at,
  c.created_at,
  c.updated_at,
  sr.name as lead_name,
  sr.address as lead_address,
  sr.lead_status,
  sr.call_count,
  sr.last_call_made_at,
  c.organization_id
FROM calls c
LEFT JOIN search_results sr ON c.lead_id = sr.id
WHERE c.organization_id = get_user_organization_id()
  AND c.deleted_at IS NULL;



-- ==========================================


-- Migration: 20241114000004_make_calls_user_id_nullable.sql
-- Make user_id nullable in calls table for voicemails
-- Voicemails belong to the organization, not a specific user

ALTER TABLE calls 
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN calls.user_id IS 'User who received/made the call. Can be NULL for voicemails when all users are unavailable.';



-- ==========================================


-- Migration: 20241220000000_add_email_to_search_results.sql
-- Add email column to search_results table
-- Migration: 20241220000000_add_email_to_search_results.sql

-- Add email column
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for email searches
CREATE INDEX IF NOT EXISTS idx_search_results_email 
  ON search_results(email) 
  WHERE email IS NOT NULL;

-- Add comment
COMMENT ON COLUMN search_results.email IS 'Email address scraped from business website';



-- ==========================================


-- Migration: 20250101000000_complete_sales_autodialer_schema.sql
-- Complete Sales Autodialer & CRM Schema Migration
-- This migration implements the full data model from the master plan
-- Phase 1: Complete multi-user CRM core with roles, ownership, and activity logs

-- ============================================
-- 1. Extend user_profiles with phone_number
-- ============================================
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

COMMENT ON COLUMN user_profiles.phone_number IS 'Phone number for agent callback / Twilio routing';

-- ============================================
-- 2. Update search_results with missing CRM fields
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'google_maps' CHECK (lead_source IN ('google_maps', 'manual', 'import')),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS do_not_text BOOLEAN DEFAULT FALSE;

-- Set default lead_status if not set
UPDATE search_results 
SET lead_status = 'new' 
WHERE lead_status IS NULL OR lead_status = '';

-- Ensure lead_status has a default constraint
ALTER TABLE search_results
ALTER COLUMN lead_status SET DEFAULT 'new';

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_search_results_lead_source ON search_results(lead_source);
CREATE INDEX IF NOT EXISTS idx_search_results_created_by ON search_results(created_by);
CREATE INDEX IF NOT EXISTS idx_search_results_assigned_to ON search_results(assigned_to);
CREATE INDEX IF NOT EXISTS idx_search_results_lead_status ON search_results(lead_status);
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_call ON search_results(do_not_call) WHERE do_not_call = TRUE;
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_email ON search_results(do_not_email) WHERE do_not_email = TRUE;
CREATE INDEX IF NOT EXISTS idx_search_results_do_not_text ON search_results(do_not_text) WHERE do_not_text = TRUE;

COMMENT ON COLUMN search_results.lead_source IS 'Source of the lead: google_maps, manual, or import';
COMMENT ON COLUMN search_results.created_by IS 'User who first created/imported this lead';
COMMENT ON COLUMN search_results.do_not_call IS 'Flag to prevent calling this lead';
COMMENT ON COLUMN search_results.do_not_email IS 'Flag to prevent emailing this lead';
COMMENT ON COLUMN search_results.do_not_text IS 'Flag to prevent texting this lead';

-- ============================================
-- 3. Update search_history with organization_id
-- ============================================
ALTER TABLE search_history
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_search_history_organization_id ON search_history(organization_id);

-- Backfill organization_id from user_profiles
UPDATE search_history sh
SET organization_id = up.organization_id
FROM user_profiles up
WHERE sh.user_id = up.id
  AND sh.organization_id IS NULL
  AND up.organization_id IS NOT NULL;

COMMENT ON COLUMN search_history.organization_id IS 'Organization that owns this search';

-- ============================================
-- 4. Update calls table with organization_id and improve structure
-- ============================================
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
ADD COLUMN IF NOT EXISTS disposition TEXT;

-- Backfill organization_id from search_results
UPDATE calls c
SET organization_id = sr.organization_id
FROM search_results sr
WHERE c.lead_id = sr.id
  AND c.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_organization_id ON calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_direction ON calls(direction);

COMMENT ON COLUMN calls.organization_id IS 'Organization that owns this call';
COMMENT ON COLUMN calls.direction IS 'Call direction: outbound or inbound';
COMMENT ON COLUMN calls.disposition IS 'Call disposition/outcome notes';

-- ============================================
-- 5. Create organization_settings table
-- ============================================
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  enable_email_scraping BOOLEAN DEFAULT TRUE,
  enable_email_outreach BOOLEAN DEFAULT TRUE,
  default_lead_assignment_mode TEXT DEFAULT 'manual' CHECK (default_lead_assignment_mode IN ('manual', 'round_robin')),
  max_leads_per_search INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(organization_id);

-- Create default settings for existing organizations
INSERT INTO organization_settings (organization_id, enable_email_scraping, enable_email_outreach, default_lead_assignment_mode, max_leads_per_search)
SELECT id, TRUE, TRUE, 'manual', 200
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM organization_settings);

COMMENT ON TABLE organization_settings IS 'Organization-wide feature toggles and configuration';
COMMENT ON COLUMN organization_settings.enable_email_scraping IS 'Whether email scraping is enabled for this organization';
COMMENT ON COLUMN organization_settings.enable_email_outreach IS 'Whether email outreach features are enabled';
COMMENT ON COLUMN organization_settings.default_lead_assignment_mode IS 'How new leads are assigned: manual or round_robin';
COMMENT ON COLUMN organization_settings.max_leads_per_search IS 'Maximum leads per Google Maps search (safety cap)';

-- ============================================
-- 6. Create user_settings table
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_dial_enabled BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

COMMENT ON TABLE user_settings IS 'User-specific preferences and settings';
COMMENT ON COLUMN user_settings.auto_dial_enabled IS 'Whether automated dialing workflows are enabled for this user';
COMMENT ON COLUMN user_settings.timezone IS 'User timezone for scheduling and display';

-- ============================================
-- 7. Update lead_notes with organization_id
-- ============================================
ALTER TABLE lead_notes
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill organization_id from search_results
UPDATE lead_notes ln
SET organization_id = sr.organization_id
FROM search_results sr
WHERE ln.lead_id = sr.id
  AND ln.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_notes_organization_id ON lead_notes(organization_id);

-- Rename user_id to author_id for clarity (if needed, but keeping user_id for now to avoid breaking changes)
-- ALTER TABLE lead_notes RENAME COLUMN user_id TO author_id;

-- ============================================
-- 8. Ensure lead_activities has organization_id
-- ============================================
-- Already added in team_system migration, but ensure it exists
ALTER TABLE lead_activities
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Backfill if missing
UPDATE lead_activities la
SET organization_id = sr.organization_id
FROM search_results sr
WHERE la.lead_id = sr.id
  AND la.organization_id IS NULL
  AND sr.organization_id IS NOT NULL;

-- ============================================
-- 9. Update SMS messages table (if exists) with proper structure
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'sms_messages') THEN
    -- Add missing fields if they don't exist
    ALTER TABLE sms_messages
    ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
    
    CREATE INDEX IF NOT EXISTS idx_sms_messages_direction ON sms_messages(direction);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_provider_id ON sms_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
  END IF;
END $$;

-- ============================================
-- 10. Update email_messages with proper structure
-- ============================================
-- organization_id already added in team_system migration
-- Ensure proper indexes
CREATE INDEX IF NOT EXISTS idx_email_messages_organization_id ON email_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider_id ON email_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ============================================
-- 11. Create status_change_logs table (optional but recommended)
-- ============================================
CREATE TABLE IF NOT EXISTS status_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_change_logs_lead_id ON status_change_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_organization_id ON status_change_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_changed_by ON status_change_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_status_change_logs_created_at ON status_change_logs(created_at DESC);

COMMENT ON TABLE status_change_logs IS 'Audit log of lead status changes for reporting and history';

-- ============================================
-- 12. Create function to log status changes
-- ============================================
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
    INSERT INTO status_change_logs (lead_id, organization_id, changed_by, old_status, new_status)
    VALUES (
      NEW.id,
      NEW.organization_id,
      COALESCE(NEW.assigned_to, auth.uid()),
      OLD.lead_status,
      NEW.lead_status
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_status_change ON search_results;
CREATE TRIGGER trigger_log_status_change
  AFTER UPDATE OF lead_status ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION log_lead_status_change();

-- ============================================
-- 13. Update RLS Policies for new structure
-- ============================================

-- Organization settings policies
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization settings"
  ON organization_settings FOR SELECT
  USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can update their organization settings"
  ON organization_settings FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert organization settings"
  ON organization_settings FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- User settings policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Status change logs policies
ALTER TABLE status_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view organization status change logs"
  ON status_change_logs FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Update calls RLS to be organization-based
DROP POLICY IF EXISTS "Users can view their own calls" ON calls;
DROP POLICY IF EXISTS "Users can create calls for their leads" ON calls;
DROP POLICY IF EXISTS "Users can update their own calls" ON calls;
DROP POLICY IF EXISTS "Users can delete their own calls" ON calls;

-- Reps can only see calls for their assigned leads
CREATE POLICY "Reps can view calls for their assigned leads"
  ON calls FOR SELECT
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps see calls for their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       lead_id IN (SELECT id FROM search_results WHERE assigned_to = auth.uid()))
      OR
      -- Admins see all org calls
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can create calls for their assigned leads"
  ON calls FOR INSERT
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid() AND
    (
      -- Reps can only call their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       lead_id IN (SELECT id FROM search_results WHERE assigned_to = auth.uid() AND do_not_call = FALSE))
      OR
      -- Admins can call any org lead
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can update their own calls"
  ON calls FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  );

CREATE POLICY "Reps can delete their own calls"
  ON calls FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    user_id = auth.uid()
  );

-- Update search_results RLS to enforce assignment rules
-- Reps can only see/edit their assigned leads (plus unassigned if you want shared pool)
DROP POLICY IF EXISTS "Team members can view organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can insert organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
DROP POLICY IF EXISTS "Team members can delete organization search results" ON search_results;

-- Reps see only their assigned leads (or unassigned if you want a shared pool)
CREATE POLICY "Reps can view their assigned leads"
  ON search_results FOR SELECT
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps see their assigned leads or unassigned leads (shared pool)
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       (assigned_to = auth.uid() OR assigned_to IS NULL))
      OR
      -- Admins see all org leads
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Team members can insert organization leads"
  ON search_results FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Reps can update their assigned leads"
  ON search_results FOR UPDATE
  USING (
    organization_id = get_user_organization_id() AND
    (
      -- Reps can update their assigned leads
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      -- Admins can update any org lead
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  )
  WITH CHECK (
    organization_id = get_user_organization_id() AND
    (
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "Reps can delete their assigned leads"
  ON search_results FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    (
      (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'member') AND
       assigned_to = auth.uid())
      OR
      EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- 14. Add updated_at triggers
-- ============================================
DROP TRIGGER IF EXISTS update_organization_settings_updated_at ON organization_settings;
CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON organization_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 15. Helper function to check if user is admin
-- ============================================
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER;

COMMENT ON FUNCTION is_user_admin IS 'Check if the current user is an admin';

-- ============================================
-- 16. Helper function to get user role
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

COMMENT ON FUNCTION get_user_role IS 'Get the role of the current user (admin or member)';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
DECLARE
  total_orgs INTEGER;
  total_users INTEGER;
  total_leads INTEGER;
  orgs_with_settings INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_orgs FROM organizations;
  SELECT COUNT(*) INTO total_users FROM user_profiles;
  SELECT COUNT(*) INTO total_leads FROM search_results;
  SELECT COUNT(*) INTO orgs_with_settings FROM organization_settings;
  
  RAISE NOTICE '=== Sales Autodialer Schema Migration Complete ===';
  RAISE NOTICE 'Organizations: %', total_orgs;
  RAISE NOTICE 'Users: %', total_users;
  RAISE NOTICE 'Leads: %', total_leads;
  RAISE NOTICE 'Organizations with settings: %', orgs_with_settings;
  RAISE NOTICE 'Migration completed successfully!';
END $$;



-- ==========================================


-- Migration: 20250113000000_update_recording_retention_default.sql
-- Update default recording retention from 90 days to 3 days (72 hours)
-- This ensures recordings are automatically deleted after 72 hours by default
-- Only run if table exists (created in later migration)

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organization_call_settings') THEN
    ALTER TABLE organization_call_settings 
    ALTER COLUMN recording_retention_days SET DEFAULT 3;
    
    COMMENT ON COLUMN organization_call_settings.recording_retention_days IS 'Number of days to retain call recordings before auto-deletion. Default is 3 days (72 hours).';
  END IF;
END $$;



-- ==========================================


-- Migration: 20250115000000_add_agent_availability_routing.sql
-- Agent Availability and Call Routing System
-- This migration adds tables for managing agent availability, schedules, and call routing logic

-- 1. Agent availability table (tracks real-time login status and availability)
CREATE TABLE IF NOT EXISTS agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_logged_in BOOLEAN DEFAULT false,
  is_available BOOLEAN DEFAULT true,
  webrtc_identity TEXT, -- Twilio WebRTC identity (e.g., "user_123")
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_availability_user_id ON agent_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_org_id ON agent_availability(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_availability_available ON agent_availability(organization_id, is_available, is_logged_in) WHERE is_available = true AND is_logged_in = true;

COMMENT ON TABLE agent_availability IS 'Tracks real-time agent availability and login status for call routing';
COMMENT ON COLUMN agent_availability.webrtc_identity IS 'Twilio WebRTC identity for browser-based calling';

-- 2. Agent schedules table (defines working hours per agent)
CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_agent_schedules_user_id ON agent_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_schedules_org_id ON agent_schedules(organization_id);

COMMENT ON TABLE agent_schedules IS 'Defines working hours for each agent by day of week';

-- 3. Call routing rules table (admin-configurable routing logic)
CREATE TABLE IF NOT EXISTS call_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  priority INTEGER DEFAULT 0, -- Higher priority rules are checked first
  is_active BOOLEAN DEFAULT true,
  
  -- Conditions
  business_hours_start TIME,
  business_hours_end TIME,
  business_days INTEGER[], -- Array of day_of_week (0-6)
  
  -- Actions
  route_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  route_to_phone TEXT, -- Fallback phone number
  route_to_voicemail BOOLEAN DEFAULT false,
  voicemail_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_routing_rules_org_id ON call_routing_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_routing_rules_priority ON call_routing_rules(organization_id, priority DESC, is_active) WHERE is_active = true;

COMMENT ON TABLE call_routing_rules IS 'Admin-configurable call routing rules with priority-based matching';

-- 4. Organization call settings (global settings per org)
CREATE TABLE IF NOT EXISTS organization_call_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  recording_enabled BOOLEAN DEFAULT true,
  recording_retention_days INTEGER DEFAULT 90,
  default_ring_timeout INTEGER DEFAULT 30, -- Seconds to ring before voicemail
  default_voicemail_message TEXT DEFAULT 'Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_call_settings_org_id ON organization_call_settings(organization_id);

COMMENT ON TABLE organization_call_settings IS 'Organization-wide call settings (recording, timeouts, etc.)';

-- 5. Row Level Security Policies

-- Agent availability
ALTER TABLE agent_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view availability in their org"
ON agent_availability FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update their own availability"
ON agent_availability FOR UPDATE
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own availability"
ON agent_availability FOR INSERT
TO public
WITH CHECK (user_id = auth.uid());

-- Agent schedules
ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view schedules in their org"
ON agent_schedules FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage schedules in their org"
ON agent_schedules FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = agent_schedules.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = agent_schedules.organization_id
  )
);

-- Call routing rules
ALTER TABLE call_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view routing rules in their org"
ON call_routing_rules FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage routing rules in their org"
ON call_routing_rules FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = call_routing_rules.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = call_routing_rules.organization_id
  )
);

-- Organization call settings
ALTER TABLE organization_call_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call settings in their org"
ON organization_call_settings FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage call settings in their org"
ON organization_call_settings FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_call_settings.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_call_settings.organization_id
  )
);

-- 6. Function to check if agent is currently available (considering schedule + login status)
CREATE OR REPLACE FUNCTION is_agent_available(p_user_id UUID, p_check_time TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN AS $$
DECLARE
  v_is_logged_in BOOLEAN;
  v_is_available BOOLEAN;
  v_day_of_week INTEGER;
  v_current_time TIME;
  v_has_schedule BOOLEAN;
BEGIN
  -- Get current day and time
  v_day_of_week := EXTRACT(DOW FROM p_check_time)::INTEGER;
  v_current_time := p_check_time::TIME;
  
  -- Check login and availability status
  SELECT is_logged_in, is_available INTO v_is_logged_in, v_is_available
  FROM agent_availability
  WHERE user_id = p_user_id;
  
  -- If not logged in or marked unavailable, return false
  IF NOT v_is_logged_in OR NOT v_is_available THEN
    RETURN false;
  END IF;
  
  -- Check if agent has a schedule for today
  SELECT EXISTS (
    SELECT 1 FROM agent_schedules
    WHERE user_id = p_user_id
    AND day_of_week = v_day_of_week
    AND is_active = true
  ) INTO v_has_schedule;
  
  -- If no schedule exists, assume always available (when logged in)
  IF NOT v_has_schedule THEN
    RETURN true;
  END IF;
  
  -- Check if current time is within scheduled hours
  RETURN EXISTS (
    SELECT 1 FROM agent_schedules
    WHERE user_id = p_user_id
    AND day_of_week = v_day_of_week
    AND is_active = true
    AND start_time <= v_current_time
    AND end_time >= v_current_time
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_agent_available IS 'Checks if an agent is available based on login status, availability flag, and schedule';

-- 7. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_availability_updated_at
  BEFORE UPDATE ON agent_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_schedules_updated_at
  BEFORE UPDATE ON agent_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_routing_rules_updated_at
  BEFORE UPDATE ON call_routing_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_call_settings_updated_at
  BEFORE UPDATE ON organization_call_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



-- ==========================================


-- Migration: 20250115000001_add_kpi_views.sql
-- KPI Aggregation Views for Admin Dashboard
-- This migration creates views for aggregating call and SMS metrics

-- 1. Daily call KPIs per organization
CREATE OR REPLACE VIEW organization_call_kpis AS
SELECT 
  c.organization_id,
  DATE(c.initiated_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE c.status = 'answered' OR c.status = 'completed') as answered_calls,
  COUNT(*) FILTER (WHERE c.status = 'no_answer') as no_answer_calls,
  COUNT(*) FILTER (WHERE c.status = 'busy') as busy_calls,
  COUNT(*) FILTER (WHERE c.status = 'failed') as failed_calls,
  COUNT(*) FILTER (WHERE c.voicemail_left = true) as voicemails_left,
  COUNT(*) FILTER (WHERE c.outcome = 'interested') as interested_count,
  COUNT(*) FILTER (WHERE c.outcome = 'callback_requested') as callback_requested_count,
  COUNT(*) FILTER (WHERE c.callback_date IS NOT NULL) as callbacks_scheduled,
  AVG(c.duration) FILTER (WHERE c.duration > 0) as avg_duration_seconds,
  SUM(c.duration) as total_duration_seconds,
  COUNT(DISTINCT c.user_id) as unique_callers,
  COUNT(DISTINCT c.lead_id) as unique_leads_called
FROM calls c
WHERE c.organization_id IS NOT NULL
GROUP BY c.organization_id, DATE(c.initiated_at);

COMMENT ON VIEW organization_call_kpis IS 'Daily call metrics aggregated by organization';

-- 2. Daily SMS KPIs per organization
CREATE OR REPLACE VIEW organization_sms_kpis AS
SELECT 
  sm.organization_id,
  DATE(sm.sent_at) as sms_date,
  COUNT(*) as total_sms,
  COUNT(*) FILTER (WHERE sm.status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE sm.status = 'delivered') as delivered_count,
  COUNT(*) FILTER (WHERE sm.status = 'failed') as failed_count,
  COUNT(DISTINCT sm.user_id) as unique_senders,
  COUNT(DISTINCT sm.lead_id) as unique_leads_texted
FROM sms_messages sm
WHERE sm.organization_id IS NOT NULL
GROUP BY sm.organization_id, DATE(sm.sent_at);

COMMENT ON VIEW organization_sms_kpis IS 'Daily SMS metrics aggregated by organization';

-- 3. User performance KPIs (for rep leaderboards)
CREATE OR REPLACE VIEW user_call_performance AS
SELECT 
  c.user_id,
  c.organization_id,
  DATE(c.initiated_at) as call_date,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE c.status = 'answered' OR c.status = 'completed') as answered_calls,
  COUNT(*) FILTER (WHERE c.outcome = 'interested') as interested_count,
  COUNT(*) FILTER (WHERE c.outcome = 'callback_requested') as callback_requested_count,
  AVG(c.duration) FILTER (WHERE c.duration > 0) as avg_duration_seconds,
  SUM(c.duration) as total_duration_seconds
FROM calls c
WHERE c.user_id IS NOT NULL AND c.organization_id IS NOT NULL
GROUP BY c.user_id, c.organization_id, DATE(c.initiated_at);

COMMENT ON VIEW user_call_performance IS 'Daily call performance metrics per user';

-- 4. Grant access to authenticated users (via RLS on underlying tables)
-- Views inherit RLS from base tables, so users can only see their org's data



-- ==========================================


-- Migration: 20250115000002_add_kpi_notification_settings.sql
-- KPI Notification Settings
-- Allows admins to configure when and how often they receive KPI reports

CREATE TABLE IF NOT EXISTS organization_kpi_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  notification_frequency TEXT DEFAULT 'daily' CHECK (notification_frequency IN ('daily', 'weekly', 'disabled')),
  notification_time TIME DEFAULT '09:00:00', -- Time of day to send (for daily/weekly)
  notification_day INTEGER DEFAULT 1, -- Day of week for weekly (1 = Monday, 7 = Sunday)
  recipient_emails TEXT[], -- Array of email addresses to receive reports
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_kpi_settings_org_id ON organization_kpi_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_kpi_settings_active ON organization_kpi_settings(is_active, notification_frequency) WHERE is_active = true;

COMMENT ON TABLE organization_kpi_settings IS 'KPI notification preferences per organization';
COMMENT ON COLUMN organization_kpi_settings.notification_frequency IS 'How often to send KPI reports: daily, weekly, or disabled';
COMMENT ON COLUMN organization_kpi_settings.notification_time IS 'Time of day to send notifications (HH:MM:SS)';
COMMENT ON COLUMN organization_kpi_settings.notification_day IS 'Day of week for weekly notifications (1=Monday, 7=Sunday)';

-- Row Level Security
ALTER TABLE organization_kpi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view KPI settings in their org"
ON organization_kpi_settings FOR SELECT
TO public
USING (
  organization_id IN (
    SELECT organization_id FROM user_profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can manage KPI settings in their org"
ON organization_kpi_settings FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_kpi_settings.organization_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role = 'admin'
    AND organization_id = organization_kpi_settings.organization_id
  )
);

-- Trigger to update updated_at
CREATE TRIGGER update_org_kpi_settings_updated_at
  BEFORE UPDATE ON organization_kpi_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



-- ==========================================


-- Migration: 20250116000000_expand_search_results_schema.sql
-- Expand search_results schema to store all search results (new and existing leads)
-- This allows us to persist the complete result set for history views

-- Add columns for existing lead tracking
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS is_existing_lead BOOLEAN DEFAULT false;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_owner_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS existing_owner_name TEXT;

-- Ensure lead_source has a default
ALTER TABLE search_results 
ALTER COLUMN lead_source SET DEFAULT 'google_maps';

-- Create index on is_existing_lead for filtering
CREATE INDEX IF NOT EXISTS idx_search_results_is_existing_lead ON search_results(is_existing_lead);

-- Create unique constraint on search_history_id + place_id to prevent duplicates within the same search
-- This allows upsert operations. We use a partial index to allow re-insertion after soft delete.
-- Note: This constraint only applies to non-deleted records
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_history_place_unique 
ON search_results(search_history_id, place_id) 
WHERE deleted_at IS NULL;

-- Also create a regular unique constraint for upsert compatibility
-- Supabase upsert works better with actual constraints
ALTER TABLE search_results 
DROP CONSTRAINT IF EXISTS search_results_history_place_unique;

-- We'll handle uniqueness via the index above and application logic
-- The partial unique index prevents duplicates for active records

-- Add comment explaining the schema
COMMENT ON COLUMN search_results.is_existing_lead IS 'True if this result matches an existing lead in the CRM';
COMMENT ON COLUMN search_results.existing_lead_id IS 'ID of the existing lead if this result matches one';
COMMENT ON COLUMN search_results.existing_owner_id IS 'User ID of the owner of the existing lead';
COMMENT ON COLUMN search_results.existing_owner_name IS 'Name of the owner of the existing lead';



-- ==========================================


-- Migration: 20250117000000_add_crm_spine_fields.sql
-- CRM Spine: Add next action fields and update status pipeline
-- This migration adds follow-up tracking and updates the status enum to match the pipeline stages

-- 1. Add next_action_at and next_action_note columns
ALTER TABLE search_results 
ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_action_note TEXT;

-- Create index for fast "Today's Follow-Ups" queries
CREATE INDEX IF NOT EXISTS idx_search_results_next_action_at ON search_results(next_action_at) 
WHERE next_action_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN search_results.next_action_at IS 'When the next action should be taken on this lead';
COMMENT ON COLUMN search_results.next_action_note IS 'Note about what the next action should be';

-- 2. Update lead_status enum to match new pipeline stages
-- First, we need to drop the old CHECK constraint and add a new one
-- Note: We'll keep old values for backward compatibility but add new ones
ALTER TABLE search_results 
DROP CONSTRAINT IF EXISTS search_results_lead_status_check;

-- Add new constraint with expanded status list
ALTER TABLE search_results 
ADD CONSTRAINT search_results_lead_status_check 
CHECK (lead_status IN (
  'new', 
  'contacted', 
  'interested', 
  'trial_started',
  'follow_up',
  'closed_won', 
  'closed_lost',
  -- Legacy values for backward compatibility
  'not_interested',
  'converted'
));

-- Update comment
COMMENT ON COLUMN search_results.lead_status IS 'Current status: new, contacted, interested, trial_started, follow_up, closed_won, closed_lost';

-- 3. Create function to auto-set next_action_at based on status changes
CREATE OR REPLACE FUNCTION auto_set_next_action_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-set if next_action_at is NULL (user hasn't manually set it)
  IF NEW.next_action_at IS NULL THEN
    IF NEW.lead_status = 'interested' THEN
      NEW.next_action_at = NOW() + INTERVAL '1 day';
    ELSIF NEW.lead_status = 'trial_started' THEN
      NEW.next_action_at = NOW() + INTERVAL '2 days';
    ELSIF NEW.lead_status = 'new' AND OLD.lead_status IS NULL THEN
      -- New lead created: set next_action_at to now so it shows up immediately
      NEW.next_action_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set next_action_at
DROP TRIGGER IF EXISTS trigger_auto_set_next_action ON search_results;
CREATE TRIGGER trigger_auto_set_next_action
  BEFORE INSERT OR UPDATE OF lead_status ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_next_action_on_status_change();

-- 4. Update existing leads: set next_action_at for new leads
UPDATE search_results 
SET next_action_at = NOW() 
WHERE lead_status = 'new' AND next_action_at IS NULL;



-- ==========================================


-- Migration: 20250117000001_update_sms_policies.sql
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



-- ==========================================


-- Migration: 20250118000000_create_campaign_system.sql
-- Multi-Campaign CRM System Migration
-- This migration creates the campaign system for lead segmentation and team organization

-- ============================================
-- 1. Create campaigns table
-- ============================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status) WHERE status = 'active';

COMMENT ON TABLE campaigns IS 'Campaigns for organizing leads and team members';
COMMENT ON COLUMN campaigns.status IS 'Campaign status: active, paused, or archived';

-- ============================================
-- 2. Create campaign_members table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign_id ON campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_organization_id ON campaign_members(organization_id);

COMMENT ON TABLE campaign_members IS 'Users assigned to campaigns';
COMMENT ON COLUMN campaign_members.role IS 'Campaign-level role: member or manager';

-- ============================================
-- 3. Create campaign_leads table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'released')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_id ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_id ON campaign_leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_claimed_by ON campaign_leads(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_organization_id ON campaign_leads(organization_id);

COMMENT ON TABLE campaign_leads IS 'Leads linked to campaigns with claim tracking';
COMMENT ON COLUMN campaign_leads.claimed_by IS 'User who claimed this lead for the campaign';
COMMENT ON COLUMN campaign_leads.status IS 'Lead status within campaign: available, claimed, or released';

-- ============================================
-- 4. Add campaign_id to existing tables
-- ============================================
ALTER TABLE sms_messages 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE email_messages 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Create indexes for campaign_id columns
CREATE INDEX IF NOT EXISTS idx_sms_messages_campaign_id ON sms_messages(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id ON calls(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_campaign_id ON email_messages(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================
-- 5. Create default campaign for existing organizations
-- ============================================
DO $$
DECLARE
  org_record RECORD;
  default_campaign_id UUID;
BEGIN
  FOR org_record IN SELECT id FROM organizations LOOP
    -- Create default campaign
    INSERT INTO campaigns (organization_id, name, description, status)
    VALUES (org_record.id, 'Default Campaign', 'Default campaign for existing leads and team members', 'active')
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO default_campaign_id;
    
    -- If campaign was created, add all existing users to it
    IF default_campaign_id IS NOT NULL THEN
      INSERT INTO campaign_members (campaign_id, user_id, organization_id, role)
      SELECT default_campaign_id, id, organization_id, 'member'
      FROM user_profiles
      WHERE organization_id = org_record.id
      ON CONFLICT (campaign_id, user_id) DO NOTHING;
      
      -- Link all existing leads to default campaign
      INSERT INTO campaign_leads (campaign_id, lead_id, organization_id, claimed_by, status)
      SELECT 
        default_campaign_id,
        id,
        organization_id,
        assigned_to,
        CASE WHEN assigned_to IS NOT NULL THEN 'claimed' ELSE 'available' END
      FROM search_results
      WHERE organization_id = org_record.id
      ON CONFLICT (campaign_id, lead_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 6. Row Level Security Policies
-- ============================================

-- Campaigns policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaigns in their organization" ON campaigns;
CREATE POLICY "Users can view campaigns in their organization"
  ON campaigns FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can create campaigns" ON campaigns;
CREATE POLICY "Admins can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update campaigns" ON campaigns;
CREATE POLICY "Admins can update campaigns"
  ON campaigns FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete campaigns" ON campaigns;
CREATE POLICY "Admins can delete campaigns"
  ON campaigns FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Campaign members policies
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign members in their organization" ON campaign_members;
CREATE POLICY "Users can view campaign members in their organization"
  ON campaign_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage campaign members" ON campaign_members;
CREATE POLICY "Admins can manage campaign members"
  ON campaign_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_members.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_members.organization_id
    )
  );

-- Campaign leads policies
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign leads in their campaigns" ON campaign_leads;
CREATE POLICY "Users can view campaign leads in their campaigns"
  ON campaign_leads FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
    AND (
      -- User is a member of this campaign
      campaign_id IN (
        SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
      )
      OR
      -- User is an admin
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid() AND role = 'admin'
        AND organization_id = campaign_leads.organization_id
      )
    )
  );

DROP POLICY IF EXISTS "Campaign members can claim leads" ON campaign_leads;
CREATE POLICY "Campaign members can claim leads"
  ON campaign_leads FOR UPDATE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage campaign leads" ON campaign_leads;
CREATE POLICY "Admins can manage campaign leads"
  ON campaign_leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_leads.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = campaign_leads.organization_id
    )
  );

-- ============================================
-- 7. Helper Functions
-- ============================================

-- Function to get user's campaigns
CREATE OR REPLACE FUNCTION get_user_campaigns()
RETURNS TABLE(campaign_id UUID) AS $$
  SELECT campaign_id
  FROM campaign_members
  WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_user_campaigns IS 'Returns all campaign IDs the current user is a member of';

-- Function to check if user is in campaign
CREATE OR REPLACE FUNCTION is_user_in_campaign(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = p_campaign_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_user_in_campaign IS 'Checks if the current user is a member of the specified campaign';

-- Function to get campaign for a lead
CREATE OR REPLACE FUNCTION get_lead_campaigns(p_lead_id UUID)
RETURNS TABLE(campaign_id UUID, campaign_name TEXT, claimed_by UUID) AS $$
  SELECT 
    cl.campaign_id,
    c.name as campaign_name,
    cl.claimed_by
  FROM campaign_leads cl
  JOIN campaigns c ON cl.campaign_id = c.id
  WHERE cl.lead_id = p_lead_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_lead_campaigns IS 'Returns all campaigns a lead belongs to';

-- ============================================
-- 8. Triggers
-- ============================================

-- Update updated_at for campaigns
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at for campaign_leads
DROP TRIGGER IF EXISTS update_campaign_leads_updated_at ON campaign_leads;
CREATE TRIGGER update_campaign_leads_updated_at
  BEFORE UPDATE ON campaign_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 9. Migration Summary
-- ============================================
DO $$
DECLARE
  total_campaigns INTEGER;
  total_members INTEGER;
  total_campaign_leads INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_campaigns FROM campaigns;
  SELECT COUNT(*) INTO total_members FROM campaign_members;
  SELECT COUNT(*) INTO total_campaign_leads FROM campaign_leads;
  
  RAISE NOTICE '=== Campaign System Migration Complete ===';
  RAISE NOTICE 'Campaigns created: %', total_campaigns;
  RAISE NOTICE 'Campaign members: %', total_members;
  RAISE NOTICE 'Campaign leads: %', total_campaign_leads;
  RAISE NOTICE 'Migration completed successfully!';
END $$;



-- ==========================================


-- Migration: 20250119000000_phone_number_assignments.sql
-- Phone Number Assignment System Migration
-- Adds support for assigning Twilio phone numbers to users and campaigns

-- ============================================
-- 1. Add columns to twilio_phone_numbers table
-- ============================================

-- Add assigned_user_id to track which user owns this number
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add campaign_id for campaign-specific numbers
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Add voicemail_greeting for custom greetings per number
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS voicemail_greeting TEXT;

-- Add ring_timeout_seconds for custom ring timeout per number (default 20 seconds)
ALTER TABLE twilio_phone_numbers 
ADD COLUMN IF NOT EXISTS ring_timeout_seconds INTEGER DEFAULT 20;

-- ============================================
-- 2. Create indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_assigned_user_id 
ON twilio_phone_numbers(assigned_user_id) 
WHERE assigned_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_twilio_phone_numbers_campaign_id 
ON twilio_phone_numbers(campaign_id) 
WHERE campaign_id IS NOT NULL;

-- ============================================
-- 3. Add comments for documentation
-- ============================================

COMMENT ON COLUMN twilio_phone_numbers.assigned_user_id IS 'User ID of the team member assigned to this phone number. Calls to this number will route to this user first.';
COMMENT ON COLUMN twilio_phone_numbers.campaign_id IS 'Campaign ID this phone number is associated with. Used for round-robin routing to campaign teammates.';
COMMENT ON COLUMN twilio_phone_numbers.voicemail_greeting IS 'Custom voicemail greeting message for this phone number. If null, uses organization default.';
COMMENT ON COLUMN twilio_phone_numbers.ring_timeout_seconds IS 'Number of seconds to ring before moving to next step (round-robin or voicemail). Default is 20 seconds.';

-- ============================================
-- 4. Update RLS policies if needed
-- ============================================

-- Ensure users can view phone numbers in their organization
-- (Assuming RLS policies already exist from previous migrations)



-- ==========================================


-- Migration: 20250120000000_add_email_system_enhancements.sql
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



-- ==========================================


-- Migration: 20250120010000_add_campaign_email_fields.sql
-- Add campaign-level email settings
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS email_address TEXT,
ADD COLUMN IF NOT EXISTS email_from_name TEXT,
ADD COLUMN IF NOT EXISTS email_signature TEXT;

-- Optional: ensure trimmed values (lightweight, safe)
UPDATE campaigns
SET email_address = NULLIF(TRIM(email_address), ''),
    email_from_name = NULLIF(TRIM(email_from_name), '');

-- Document intent
COMMENT ON COLUMN campaigns.email_address IS 'Verified sender email from Brevo';
COMMENT ON COLUMN campaigns.email_from_name IS 'Display name for outbound emails';
COMMENT ON COLUMN campaigns.email_signature IS 'Optional signature appended to emails';

-- Helpful partial index for campaigns with configured email
CREATE INDEX IF NOT EXISTS idx_campaigns_email_address
ON campaigns(email_address) WHERE email_address IS NOT NULL;




-- ==========================================


-- Migration: 20250121000000_add_user_dialer_preferences.sql
-- Add per-user dialer preferences for remembering outbound number choice
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS preferred_outbound_number TEXT,
ADD COLUMN IF NOT EXISTS remember_outbound_number BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_call_single_number BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS preferred_call_mode TEXT CHECK (preferred_call_mode IN ('webrtc', 'live', 'voicemail')) DEFAULT 'webrtc';

COMMENT ON COLUMN user_settings.preferred_outbound_number IS 'Saved outbound caller ID to skip number selection';
COMMENT ON COLUMN user_settings.remember_outbound_number IS 'Whether to re-use the saved caller ID without prompting';
COMMENT ON COLUMN user_settings.auto_call_single_number IS 'Allow skipping selection when only one caller ID is available';
COMMENT ON COLUMN user_settings.preferred_call_mode IS 'Default call mode (webrtc, live, voicemail) used to auto-start calls';



-- ==========================================


-- Migration: 20250122000000_reassign_trials_to_new_activator.sql
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




-- ==========================================


-- Migration: 20250125000000_add_lost_reason_fields.sql
-- Add lost_reason and lost_reason_notes columns to search_results
-- These fields are required when marking a lead as closed_lost

ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lost_reason TEXT,
ADD COLUMN IF NOT EXISTS lost_reason_notes TEXT;

-- Comments
COMMENT ON COLUMN search_results.lost_reason IS 'Reason why lead was lost: price, timing, ghosted, not_a_fit, went_with_competitor, other';
COMMENT ON COLUMN search_results.lost_reason_notes IS 'Optional free-text notes explaining the lost reason';




-- ==========================================


-- Migration: 20250126000000_add_lead_timezone.sql
-- Add lead_timezone and timezone_source to search_results
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS lead_timezone TEXT,
ADD COLUMN IF NOT EXISTS timezone_source TEXT CHECK (timezone_source IN ('coords', 'phone', 'manual'));

COMMENT ON COLUMN search_results.lead_timezone IS 'IANA timezone string (e.g., America/New_York)';
COMMENT ON COLUMN search_results.timezone_source IS 'How timezone was determined: coords (high confidence), phone (medium), manual';

-- Create index for timezone queries
CREATE INDEX IF NOT EXISTS idx_search_results_lead_timezone ON search_results(lead_timezone);




-- ==========================================


-- Migration: 20250208000000_prevent_duplicate_leads.sql
-- Prevent duplicate leads by phone number within an organization
-- First, identify and remove duplicates (keeping the oldest record)

-- Step 1: Create a temp table with the IDs to keep (oldest record for each phone+org combo)
CREATE TEMP TABLE leads_to_keep AS
SELECT DISTINCT ON (organization_id, phone) id
FROM search_results
WHERE phone IS NOT NULL AND phone != ''
ORDER BY organization_id, phone, created_at ASC;

-- Step 2: Delete duplicate leads (those not in the keep list)
DELETE FROM search_results
WHERE phone IS NOT NULL 
  AND phone != ''
  AND id NOT IN (SELECT id FROM leads_to_keep);

-- Step 3: Add unique index on (organization_id, phone) for non-null phones
-- Using a partial unique index so NULL phones don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_org_phone_unique 
ON search_results (organization_id, phone) 
WHERE phone IS NOT NULL AND phone != '';

-- Also add a unique index on place_id within an org to prevent Google Maps duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_results_org_place_id_unique 
ON search_results (organization_id, place_id) 
WHERE place_id IS NOT NULL AND place_id != '';

-- Drop the temp table
DROP TABLE IF EXISTS leads_to_keep;

-- Add a comment explaining the constraint
COMMENT ON INDEX idx_search_results_org_phone_unique IS 'Prevents duplicate leads with the same phone number within an organization';
COMMENT ON INDEX idx_search_results_org_place_id_unique IS 'Prevents duplicate leads with the same Google Place ID within an organization';



-- ==========================================


-- Migration: 20250208000001_add_campaign_lead_filters.sql
-- Add lead_filters JSONB column to campaigns table
-- This stores filter criteria for leads that can be added to the campaign

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS lead_filters JSONB DEFAULT '{}'::jsonb;

-- Add index for filtering queries
CREATE INDEX IF NOT EXISTS idx_campaigns_lead_filters ON campaigns USING GIN (lead_filters);

-- Add comment explaining the structure
COMMENT ON COLUMN campaigns.lead_filters IS 'JSONB object with lead quality filters: {require_website: boolean, require_phone: boolean, require_email: boolean, min_rating: number (0-5), min_reviews: number}';



-- ==========================================


-- Migration: 20250608000000_client_status_and_notifications.sql
-- Client Status and Lead Notifications Migration
-- Part of the CRM Event Sync system for Junk Car Calculator campaign

-- ============================================
-- 1. Add client status fields to search_results
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS client_status TEXT NULL 
  CHECK (client_status IN ('none', 'trialing', 'trial_qualified', 'credits_low', 'trial_expiring', 'paid')),
ADD COLUMN IF NOT EXISTS client_credits_left INTEGER NULL,
ADD COLUMN IF NOT EXISTS client_plan TEXT NULL,
ADD COLUMN IF NOT EXISTS client_trial_ends_at TIMESTAMPTZ NULL;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_search_results_client_status 
  ON search_results(client_status) WHERE client_status IS NOT NULL;

COMMENT ON COLUMN search_results.client_status IS 'Client lifecycle status from Control Tower: none, trialing, trial_qualified, credits_low, trial_expiring, paid';
COMMENT ON COLUMN search_results.client_credits_left IS 'Remaining credits for the client (from Control Tower)';
COMMENT ON COLUMN search_results.client_plan IS 'Client subscription plan name';
COMMENT ON COLUMN search_results.client_trial_ends_at IS 'When the client trial period ends';

-- ============================================
-- 2. Create lead_notifications table
-- ============================================
CREATE TABLE IF NOT EXISTS lead_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_notifications_lead_id 
  ON lead_notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_sdr_user_id 
  ON lead_notifications(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notifications_read 
  ON lead_notifications(read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_lead_notifications_created_at 
  ON lead_notifications(created_at DESC);

COMMENT ON TABLE lead_notifications IS 'Notifications for SDRs about client lifecycle events from Control Tower';
COMMENT ON COLUMN lead_notifications.event_type IS 'Type of event: trial_started, trial_qualified, credits_low, trial_expiring, paid_subscribed';
COMMENT ON COLUMN lead_notifications.payload IS 'Additional event data as JSON';
COMMENT ON COLUMN lead_notifications.read IS 'Whether the SDR has viewed this notification';

-- ============================================
-- 3. Row Level Security for lead_notifications
-- ============================================
ALTER TABLE lead_notifications ENABLE ROW LEVEL SECURITY;

-- SDRs can view their own notifications
CREATE POLICY "SDRs can view their own notifications"
  ON lead_notifications FOR SELECT
  USING (sdr_user_id = auth.uid());

-- SDRs can update (mark as read) their own notifications
CREATE POLICY "SDRs can update their own notifications"
  ON lead_notifications FOR UPDATE
  USING (sdr_user_id = auth.uid())
  WITH CHECK (sdr_user_id = auth.uid());

-- Service role can insert notifications (for sync job)
CREATE POLICY "Service role can insert notifications"
  ON lead_notifications FOR INSERT
  WITH CHECK (TRUE);

-- Admins can view all notifications in their org
CREATE POLICY "Admins can view all org notifications"
  ON lead_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role = 'admin'
      AND organization_id = (
        SELECT organization_id FROM user_profiles WHERE id = lead_notifications.sdr_user_id
      )
    )
  );

-- ============================================
-- 4. Create sdr_client_links table (Control Tower shared table)
-- ============================================
-- This table links Control Tower user_id to CRM lead_id and SDR
CREATE TABLE IF NOT EXISTS sdr_client_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Control Tower profiles.user_id
  crm_lead_id UUID NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, crm_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_sdr_client_links_user_id 
  ON sdr_client_links(user_id);
CREATE INDEX IF NOT EXISTS idx_sdr_client_links_crm_lead_id 
  ON sdr_client_links(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_sdr_client_links_sdr_user_id 
  ON sdr_client_links(sdr_user_id);

COMMENT ON TABLE sdr_client_links IS 'Links Control Tower user_id to CRM leads and SDRs for event routing';

-- RLS for sdr_client_links
ALTER TABLE sdr_client_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own client links"
  ON sdr_client_links FOR SELECT
  USING (sdr_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Service role can manage client links"
  ON sdr_client_links FOR ALL
  WITH CHECK (TRUE);

-- ============================================
-- 5. Create client_events table (Control Tower shared table)
-- ============================================
-- This table stores lifecycle events from Control Tower
CREATE TABLE IF NOT EXISTS client_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Control Tower profiles.user_id
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_events_user_id 
  ON client_events(user_id);
CREATE INDEX IF NOT EXISTS idx_client_events_processed 
  ON client_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_client_events_event_type 
  ON client_events(event_type);
CREATE INDEX IF NOT EXISTS idx_client_events_created_at 
  ON client_events(created_at DESC);

COMMENT ON TABLE client_events IS 'Lifecycle events from Control Tower (trial_started, credits_low, paid_subscribed, etc.)';
COMMENT ON COLUMN client_events.processed IS 'Whether the CRM has processed this event';

-- RLS for client_events
ALTER TABLE client_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage client events"
  ON client_events FOR ALL
  WITH CHECK (TRUE);

CREATE POLICY "Admins can view client events"
  ON client_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- 6. Ensure Junk Car Calculator campaign exists
-- ============================================
DO $$
DECLARE
  org_id UUID;
  jcc_campaign_id UUID;
BEGIN
  -- Get first organization (or create default logic)
  SELECT id INTO org_id FROM organizations LIMIT 1;
  
  IF org_id IS NOT NULL THEN
    -- Check if Junk Car Calculator campaign exists
    SELECT id INTO jcc_campaign_id 
    FROM campaigns 
    WHERE name = 'Junk Car Calculator' AND organization_id = org_id;
    
    -- Create if doesn't exist
    IF jcc_campaign_id IS NULL THEN
      INSERT INTO campaigns (organization_id, name, description, status)
      VALUES (
        org_id, 
        'Junk Car Calculator', 
        'Leads and SDR tracking for the Junk Car Calculator product',
        'active'
      );
      RAISE NOTICE 'Created Junk Car Calculator campaign for organization %', org_id;
    ELSE
      RAISE NOTICE 'Junk Car Calculator campaign already exists: %', jcc_campaign_id;
    END IF;
  END IF;
END $$;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Client Status & Notifications Migration Complete ===';
  RAISE NOTICE 'Added client_status, client_credits_left, client_plan, client_trial_ends_at to search_results';
  RAISE NOTICE 'Created lead_notifications table';
  RAISE NOTICE 'Created sdr_client_links table';
  RAISE NOTICE 'Created client_events table';
  RAISE NOTICE 'Ensured Junk Car Calculator campaign exists';
END $$;



-- ==========================================


-- Migration: 20250608000001_sdr_summaries.sql
-- SDR Daily and Weekly Summaries Migration
-- Part of the SDR Reporting System

-- ============================================
-- 1. Create daily_sdr_summaries table
-- ============================================
CREATE TABLE IF NOT EXISTS daily_sdr_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  paid_hours NUMERIC(10, 2) DEFAULT 0,
  active_hours NUMERIC(10, 2) DEFAULT 0,
  efficiency NUMERIC(5, 2) DEFAULT 0, -- percentage
  total_dials INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0, -- calls >= 30 seconds
  trials_started INTEGER DEFAULT 0, -- JCC specific
  paid_signups_week_to_date INTEGER DEFAULT 0, -- JCC specific
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sdr_user_id, date)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_sdr_user_id 
  ON daily_sdr_summaries(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_date 
  ON daily_sdr_summaries(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_sdr_date 
  ON daily_sdr_summaries(sdr_user_id, date DESC);

COMMENT ON TABLE daily_sdr_summaries IS 'Daily performance summaries for SDRs';
COMMENT ON COLUMN daily_sdr_summaries.paid_hours IS 'Total paid hours calculated from call sessions';
COMMENT ON COLUMN daily_sdr_summaries.active_hours IS 'Total time actually on calls';
COMMENT ON COLUMN daily_sdr_summaries.efficiency IS 'Percentage of paid hours spent on calls (active_hours / paid_hours * 100)';
COMMENT ON COLUMN daily_sdr_summaries.conversations IS 'Calls with duration >= 30 seconds';
COMMENT ON COLUMN daily_sdr_summaries.trials_started IS 'JCC leads that started trials that day';
COMMENT ON COLUMN daily_sdr_summaries.paid_signups_week_to_date IS 'JCC paid signups from Monday to this date';

-- ============================================
-- 2. Create weekly_sdr_summaries table
-- ============================================
CREATE TABLE IF NOT EXISTS weekly_sdr_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the week
  week_end DATE NOT NULL, -- Friday of the week
  paid_hours NUMERIC(10, 2) DEFAULT 0,
  active_hours NUMERIC(10, 2) DEFAULT 0,
  average_efficiency NUMERIC(5, 2) DEFAULT 0, -- time-weighted average percentage
  total_dials INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  trials_started INTEGER DEFAULT 0, -- JCC specific
  paid_signups INTEGER DEFAULT 0, -- JCC specific
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sdr_user_id, week_start, week_end)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_sdr_user_id 
  ON weekly_sdr_summaries(sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_week_start 
  ON weekly_sdr_summaries(week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_sdr_week 
  ON weekly_sdr_summaries(sdr_user_id, week_start DESC);

COMMENT ON TABLE weekly_sdr_summaries IS 'Weekly performance summaries for SDRs (Monday-Friday)';
COMMENT ON COLUMN weekly_sdr_summaries.week_start IS 'Monday of the week';
COMMENT ON COLUMN weekly_sdr_summaries.week_end IS 'Friday of the week';
COMMENT ON COLUMN weekly_sdr_summaries.average_efficiency IS 'Time-weighted average efficiency for the week';
COMMENT ON COLUMN weekly_sdr_summaries.trials_started IS 'JCC leads that started trials during the week';
COMMENT ON COLUMN weekly_sdr_summaries.paid_signups IS 'JCC paid signups during the week';

-- ============================================
-- 3. Row Level Security
-- ============================================

-- Daily summaries RLS
ALTER TABLE daily_sdr_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own daily summaries"
  ON daily_sdr_summaries FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all daily summaries in their org"
  ON daily_sdr_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = daily_sdr_summaries.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage daily summaries"
  ON daily_sdr_summaries FOR ALL
  WITH CHECK (TRUE);

-- Weekly summaries RLS
ALTER TABLE weekly_sdr_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own weekly summaries"
  ON weekly_sdr_summaries FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all weekly summaries in their org"
  ON weekly_sdr_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = weekly_sdr_summaries.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage weekly summaries"
  ON weekly_sdr_summaries FOR ALL
  WITH CHECK (TRUE);

-- ============================================
-- 4. Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_daily_sdr_summaries_updated_at ON daily_sdr_summaries;
CREATE TRIGGER update_daily_sdr_summaries_updated_at
  BEFORE UPDATE ON daily_sdr_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_weekly_sdr_summaries_updated_at ON weekly_sdr_summaries;
CREATE TRIGGER update_weekly_sdr_summaries_updated_at
  BEFORE UPDATE ON weekly_sdr_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== SDR Summaries Migration Complete ===';
  RAISE NOTICE 'Created daily_sdr_summaries table with UNIQUE(sdr_user_id, date)';
  RAISE NOTICE 'Created weekly_sdr_summaries table with UNIQUE(sdr_user_id, week_start, week_end)';
  RAISE NOTICE 'Applied RLS policies and updated_at triggers';
END $$;



-- ==========================================


-- Migration: 20250609000000_add_sdr_attribution_fields.sql
-- SDR Attribution Fields Migration
-- Adds first-touch and last-touch SDR tracking for Junk Car Calculator signups

-- Add SDR attribution columns to search_results
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS jcc_sdr_first_touch_code TEXT,
  ADD COLUMN IF NOT EXISTS jcc_sdr_last_touch_code TEXT;

-- Create indexes for efficient filtering by SDR code
CREATE INDEX IF NOT EXISTS idx_search_results_jcc_sdr_first_touch 
  ON search_results(jcc_sdr_first_touch_code) 
  WHERE jcc_sdr_first_touch_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_search_results_jcc_sdr_last_touch 
  ON search_results(jcc_sdr_last_touch_code) 
  WHERE jcc_sdr_last_touch_code IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN search_results.jcc_sdr_first_touch_code IS 'First-touch SDR attribution code from Junk Car Calculator signup link';
COMMENT ON COLUMN search_results.jcc_sdr_last_touch_code IS 'Last-touch SDR attribution code from Junk Car Calculator signup link';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== SDR Attribution Fields Migration Complete ===';
  RAISE NOTICE 'Added jcc_sdr_first_touch_code and jcc_sdr_last_touch_code to search_results';
  RAISE NOTICE 'These fields track which SDR link brought a user to the Calculator';
END $$;



-- ==========================================


-- Migration: 20250609000000_campaign_level_templates.sql
-- Campaign-Level Templates Migration
-- Moves email and SMS templates from organization-level to campaign-level
-- This enables A/B testing different messaging approaches per campaign

-- ============================================
-- 1. Add campaign_id to email_templates
-- ============================================
ALTER TABLE email_templates 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_templates_campaign_id ON email_templates(campaign_id) WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN email_templates.campaign_id IS 'Campaign this template belongs to. Users see templates from all campaigns they are members of.';

-- ============================================
-- 2. Add campaign_id to sms_templates
-- ============================================
ALTER TABLE sms_templates 
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_templates_campaign_id ON sms_templates(campaign_id) WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN sms_templates.campaign_id IS 'Campaign this template belongs to. Users see templates from all campaigns they are members of.';

-- ============================================
-- 3. Migrate existing templates to Default Campaign
-- ============================================
DO $$
DECLARE
  org_record RECORD;
  default_campaign_id UUID;
BEGIN
  FOR org_record IN SELECT id FROM organizations LOOP
    -- Get or create the default campaign for this organization
    SELECT id INTO default_campaign_id
    FROM campaigns
    WHERE organization_id = org_record.id AND name = 'Default Campaign'
    LIMIT 1;
    
    -- If default campaign exists, assign existing templates to it
    IF default_campaign_id IS NOT NULL THEN
      -- Update email templates without a campaign
      UPDATE email_templates
      SET campaign_id = default_campaign_id
      WHERE organization_id = org_record.id AND campaign_id IS NULL;
      
      -- Update SMS templates without a campaign
      UPDATE sms_templates
      SET campaign_id = default_campaign_id
      WHERE organization_id = org_record.id AND campaign_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- 4. Update RLS policies for email_templates
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view org email templates" ON email_templates;
DROP POLICY IF EXISTS "Team members can view organization email templates" ON email_templates;
DROP POLICY IF EXISTS "Team members can insert organization email templates" ON email_templates;
DROP POLICY IF EXISTS "Team members can update organization email templates" ON email_templates;
DROP POLICY IF EXISTS "Team members can delete organization email templates" ON email_templates;

-- Create new campaign-based policies for email_templates
CREATE POLICY "Users can view email templates from their campaigns"
  ON email_templates FOR SELECT
  USING (
    -- User is a member of the campaign this template belongs to
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- Fallback for templates without campaign_id (legacy)
    (campaign_id IS NULL AND organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert email templates to their campaigns"
  ON email_templates FOR INSERT
  WITH CHECK (
    -- User is a member of the campaign
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    -- User is an admin
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
  );

CREATE POLICY "Users can update email templates in their campaigns"
  ON email_templates FOR UPDATE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
  );

CREATE POLICY "Users can delete email templates in their campaigns"
  ON email_templates FOR DELETE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
  );

-- ============================================
-- 5. Update RLS policies for sms_templates
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can create their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON sms_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON sms_templates;

-- Create new campaign-based policies for sms_templates
CREATE POLICY "Users can view sms templates from their campaigns"
  ON sms_templates FOR SELECT
  USING (
    -- User is a member of the campaign this template belongs to
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- Fallback for templates without campaign_id (legacy)
    (campaign_id IS NULL AND organization_id IN (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    ))
  );

CREATE POLICY "Users can insert sms templates to their campaigns"
  ON sms_templates FOR INSERT
  WITH CHECK (
    -- User is a member of the campaign
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    -- User is an admin
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
  );

CREATE POLICY "Users can update sms templates in their campaigns"
  ON sms_templates FOR UPDATE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
  );

CREATE POLICY "Users can delete sms templates in their campaigns"
  ON sms_templates FOR DELETE
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
  );

-- ============================================
-- 6. Migration Summary
-- ============================================
DO $$
DECLARE
  email_templates_updated INTEGER;
  sms_templates_updated INTEGER;
BEGIN
  SELECT COUNT(*) INTO email_templates_updated FROM email_templates WHERE campaign_id IS NOT NULL;
  SELECT COUNT(*) INTO sms_templates_updated FROM sms_templates WHERE campaign_id IS NOT NULL;
  
  RAISE NOTICE '=== Campaign-Level Templates Migration Complete ===';
  RAISE NOTICE 'Email templates with campaign_id: %', email_templates_updated;
  RAISE NOTICE 'SMS templates with campaign_id: %', sms_templates_updated;
  RAISE NOTICE 'Migration completed successfully!';
END $$;





-- ==========================================


-- Migration: 20250609000001_add_jcc_signup_lead_source.sql
-- Add 'jcc_signup' as a valid lead_source value
-- This allows auto-created leads from the Junk Car Calculator signup webhook

-- Drop the existing constraint and recreate with the new value
ALTER TABLE search_results DROP CONSTRAINT IF EXISTS search_results_lead_source_check;

ALTER TABLE search_results 
ADD CONSTRAINT search_results_lead_source_check 
CHECK (lead_source IN ('google_maps', 'manual', 'inbound_call', 'import', 'jcc_signup'));

COMMENT ON CONSTRAINT search_results_lead_source_check ON search_results IS 'Lead source: google_maps, manual, inbound_call, import, or jcc_signup';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== JCC Signup Lead Source Migration Complete ===';
  RAISE NOTICE 'Added jcc_signup as a valid lead_source value';
END $$;



-- ==========================================


-- Migration: 20250609000002_add_sdr_tracking_code.sql
-- Add SDR tracking code to user_profiles
-- This allows mapping tracking codes (from JCC signup links) to SDR users

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS sdr_code TEXT UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_sdr_code 
  ON user_profiles(sdr_code) 
  WHERE sdr_code IS NOT NULL;

COMMENT ON COLUMN user_profiles.sdr_code IS 'Unique SDR tracking code used in JCC signup links (e.g., ?sdr=thalia)';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE '=== SDR Tracking Code Migration Complete ===';
  RAISE NOTICE 'Added sdr_code column to user_profiles';
  RAISE NOTICE 'SDRs can now be assigned leads based on their tracking code';
END $$;



-- ==========================================


-- Migration: 20250609100000_template_manager_permissions.sql
-- Template Manager Permissions Migration
-- Restricts template create/update/delete to admins and campaign managers
-- Regular campaign members can still read (SELECT) templates

-- ============================================
-- 1. Update email_templates INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Users can insert email templates to their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can insert email templates"
  ON email_templates FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 2. Update email_templates UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Users can update email templates in their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can update email templates"
  ON email_templates FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 3. Update email_templates DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Users can delete email templates in their campaigns" ON email_templates;

CREATE POLICY "Admins and managers can delete email templates"
  ON email_templates FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = email_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 4. Update sms_templates INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Users can insert sms templates to their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can insert sms templates"
  ON sms_templates FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 5. Update sms_templates UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Users can update sms templates in their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can update sms templates"
  ON sms_templates FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 6. Update sms_templates DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Users can delete sms templates in their campaigns" ON sms_templates;

CREATE POLICY "Admins and managers can delete sms templates"
  ON sms_templates FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = sms_templates.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = sms_templates.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 7. Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Template Manager Permissions Migration Complete ===';
  RAISE NOTICE 'Template INSERT/UPDATE/DELETE now restricted to:';
  RAISE NOTICE '  - Organization admins';
  RAISE NOTICE '  - Campaign managers (role=manager in campaign_members)';
  RAISE NOTICE 'Regular campaign members can still SELECT (read/use) templates.';
END $$;





-- ==========================================


-- Migration: 20250609200000_add_first_name_support.sql
-- Add first_name support for user profiles
-- This captures the first name during signup for use in templates like {{sender_name}}

-- ============================================
-- 1. Update the handle_new_user trigger to capture first_name from user metadata
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
  user_first_name TEXT;
BEGIN
  -- Extract first_name from user metadata (set during signUp)
  user_first_name := NEW.raw_user_meta_data->>'first_name';
  
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      LIMIT 1;
      
      -- If invitation exists, skip auto-creating org/profile
      -- accept-invite will handle creating the profile and joining the team
      IF pending_invitation IS NOT NULL THEN
        RAISE LOG 'User % has pending invitation, skipping org/profile creation', NEW.email;
        RETURN NEW; -- User created, profile will be created by accept-invite
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If invitation check fails, log and continue with normal signup
      RAISE WARNING 'Error checking invitations for %: %', NEW.email, SQLERRM;
    END;
    
    -- No invitation found - create new organization and profile for regular signup
    BEGIN
      -- Create organization
      INSERT INTO organizations (name)
      VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
      RETURNING id INTO new_org_id;
      
      IF new_org_id IS NULL THEN
        RAISE WARNING 'Failed to create organization for user %', NEW.email;
        RETURN NEW; -- Still allow user creation
      END IF;
      
      -- Create user profile with email and first_name
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name %', new_org_id, NEW.email, user_first_name;
      
    EXCEPTION WHEN OTHERS THEN
      -- If organization/profile creation fails, log the error but don't block user creation
      -- The user will still be created in auth.users, but without org/profile
      -- They can be manually added later or accept-invite can handle it
      RAISE WARNING 'Error creating org/profile for %: %', NEW.email, SQLERRM;
      
      -- If org was created but profile creation failed, try to clean up
      IF new_org_id IS NOT NULL AND NOT profile_created THEN
        BEGIN
          DELETE FROM organizations WHERE id = new_org_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore cleanup errors
          RAISE WARNING 'Error cleaning up organization %: %', new_org_id, SQLERRM;
        END;
      END IF;
    END;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log everything but never block user creation
    RAISE WARNING 'Unexpected error in handle_new_user() for %: %', NEW.email, SQLERRM;
  END;
  
  -- Always return NEW to allow user creation, no matter what happens above
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Create function to update team member name (bypasses RLS)
-- ============================================
CREATE OR REPLACE FUNCTION update_team_member_name(
  member_id_to_update UUID,
  new_name TEXT
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  caller_org_id UUID;
  caller_role TEXT;
  member_org_id UUID;
BEGIN
  -- Get caller's organization and role
  SELECT organization_id, role INTO caller_org_id, caller_role
  FROM user_profiles
  WHERE id = auth.uid();

  IF caller_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Caller profile not found'::TEXT;
    RETURN;
  END IF;

  -- Check if caller is admin
  IF caller_role != 'admin' THEN
    RETURN QUERY SELECT false, 'Only admins can update team member names'::TEXT;
    RETURN;
  END IF;

  -- Get member's organization
  SELECT organization_id INTO member_org_id
  FROM user_profiles
  WHERE id = member_id_to_update;

  IF member_org_id IS NULL THEN
    RETURN QUERY SELECT false, 'Member not found'::TEXT;
    RETURN;
  END IF;

  -- Verify same organization
  IF member_org_id != caller_org_id THEN
    RETURN QUERY SELECT false, 'Member not in your organization'::TEXT;
    RETURN;
  END IF;

  -- Update the name
  UPDATE user_profiles
  SET full_name = NULLIF(TRIM(new_name), '')
  WHERE id = member_id_to_update;

  RETURN QUERY SELECT true, 'Name updated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== First Name Support Migration Complete ===';
  RAISE NOTICE 'The handle_new_user trigger now captures first_name from user metadata';
  RAISE NOTICE 'First name is stored in the full_name column of user_profiles';
  RAISE NOTICE 'Admins can update any team member name using update_team_member_name function';
  RAISE NOTICE 'Use {{sender_name}} in templates to include the sender first name';
END $$;



-- ==========================================


-- Migration: 20250609300000_add_call_scripts.sql
-- Add call_scripts table for campaign-level call scripts
-- Reps can use these scripts during calls

-- ============================================
-- 1. Create call_scripts table
-- ============================================
CREATE TABLE IF NOT EXISTS call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_call_scripts_campaign_id ON call_scripts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_scripts_organization_id ON call_scripts(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_scripts_is_active ON call_scripts(is_active);

-- ============================================
-- 2. Enable RLS
-- ============================================
ALTER TABLE call_scripts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. RLS Policies
-- ============================================

-- SELECT: Campaign members can read scripts from their campaigns
CREATE POLICY "Campaign members can view call scripts"
  ON call_scripts FOR SELECT
  USING (
    -- User is a member of this campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
    )
    OR
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
  );

-- INSERT: Only admins and campaign managers can create scripts
CREATE POLICY "Admins and managers can insert call scripts"
  ON call_scripts FOR INSERT
  WITH CHECK (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- UPDATE: Only admins and campaign managers can update scripts
CREATE POLICY "Admins and managers can update call scripts"
  ON call_scripts FOR UPDATE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- DELETE: Only admins and campaign managers can delete scripts
CREATE POLICY "Admins and managers can delete call scripts"
  ON call_scripts FOR DELETE
  USING (
    -- User is an admin in the organization
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = call_scripts.organization_id
    )
    OR
    -- User is a manager of the campaign
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_id = call_scripts.campaign_id
      AND user_id = auth.uid()
      AND role = 'manager'
    )
  );

-- ============================================
-- 4. Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Call Scripts Migration Complete ===';
  RAISE NOTICE 'Created call_scripts table with:';
  RAISE NOTICE '  - campaign_id, name, content, display_order, is_active';
  RAISE NOTICE '  - RLS policies for campaign members (SELECT) and admins/managers (full CRUD)';
END $$;





-- ==========================================


-- Migration: 20250609400000_fix_invitation_org_move.sql
-- Fix: Always move invited users to the inviting organization
-- An invitation IS the authorization to move them

CREATE OR REPLACE FUNCTION auto_accept_user_invitation(user_email_param TEXT)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  invitation_id UUID,
  profile_created BOOLEAN
) AS $$
DECLARE
  user_record RECORD;
  invitation_record RECORD;
  profile_record RECORD;
  org_member_count INTEGER;
  old_org_id UUID;
BEGIN
  -- Get the user
  SELECT * INTO user_record
  FROM auth.users
  WHERE LOWER(email) = LOWER(user_email_param)
  LIMIT 1;
  
  IF user_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'User not found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Get the most recent pending invitation for this email
  SELECT * INTO invitation_record
  FROM team_invitations
  WHERE LOWER(email) = LOWER(user_email_param)
    AND status = 'pending'
    AND expires_at > NOW()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No pending invitation found'::TEXT, NULL::UUID, FALSE;
    RETURN;
  END IF;
  
  -- Check if profile exists
  SELECT * INTO profile_record
  FROM user_profiles
  WHERE id = user_record.id;
  
  -- Handle profile creation/update
  IF profile_record IS NULL THEN
    -- No profile - create one
    INSERT INTO user_profiles (id, organization_id, role, email)
    VALUES (user_record.id, invitation_record.organization_id, invitation_record.role, user_record.email);
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE, 
      'Profile created and invitation accepted'::TEXT,
      invitation_record.id,
      TRUE;
    RETURN;
  END IF;
  
  -- Profile exists - check current org
  IF profile_record.organization_id IS NOT NULL THEN
    -- Already in correct org - just mark invitation as accepted
    IF profile_record.organization_id = invitation_record.organization_id THEN
      UPDATE team_invitations
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = invitation_record.id;
      
      RETURN QUERY SELECT 
        TRUE,
        'User already in organization, invitation marked as accepted'::TEXT,
        invitation_record.id,
        FALSE;
      RETURN;
    END IF;
    
    -- User in different org - ALWAYS move them since they were invited
    -- The invitation IS the authorization to move them
    old_org_id := profile_record.organization_id;
    
    -- Update user to new org
    UPDATE user_profiles
    SET 
      organization_id = invitation_record.organization_id,
      role = invitation_record.role,
      email = user_record.email
    WHERE id = user_record.id;
    
    -- Clean up old org if now empty
    SELECT COUNT(*) INTO org_member_count
    FROM user_profiles
    WHERE organization_id = old_org_id;
    
    IF org_member_count = 0 THEN
      DELETE FROM organizations WHERE id = old_org_id;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE,
      'User moved to invitation organization'::TEXT,
      invitation_record.id,
      FALSE;
    RETURN;
  ELSE
    -- Profile exists but no org - update it
    UPDATE user_profiles
    SET 
      organization_id = invitation_record.organization_id,
      role = invitation_record.role,
      email = user_record.email
    WHERE id = user_record.id;
    
    -- Mark invitation as accepted
    UPDATE team_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invitation_record.id;
    
    RETURN QUERY SELECT 
      TRUE,
      'Profile updated and invitation accepted'::TEXT,
      invitation_record.id,
      FALSE;
    RETURN;
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 
    FALSE,
    ('Error: ' || SQLERRM)::TEXT,
    COALESCE(invitation_record.id, NULL::UUID),
    FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;





-- ==========================================


-- Migration: 20250609500000_fix_agent_availability_rls.sql
-- Fix RLS policy on agent_availability to allow users to manage their own records
-- The key issue: users must be able to access their OWN row by user_id, not just by org

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can view availability in their org" ON agent_availability;
DROP POLICY IF EXISTS "Users can insert their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can update their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Users can delete their own availability" ON agent_availability;
DROP POLICY IF EXISTS "Admins can view org availability" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_select_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_insert_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_update_policy" ON agent_availability;
DROP POLICY IF EXISTS "agent_availability_delete_policy" ON agent_availability;

-- Enable RLS if not already enabled
ALTER TABLE agent_availability ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own availability (by user_id, NOT org)
CREATE POLICY "Users can view their own availability"
ON agent_availability FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own availability
CREATE POLICY "Users can insert their own availability"
ON agent_availability FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own availability
CREATE POLICY "Users can update their own availability"
ON agent_availability FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own availability
CREATE POLICY "Users can delete their own availability"
ON agent_availability FOR DELETE
USING (auth.uid() = user_id);

-- Also allow admins to view all availability in their org (for team status views)
CREATE POLICY "Admins can view org availability"
ON agent_availability FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.role = 'admin'
    AND up.organization_id = agent_availability.organization_id
  )
);

-- Clean up orphaned agent_availability rows (where org doesn't match user's current org)
-- This fixes users who were moved between organizations
UPDATE agent_availability aa
SET organization_id = up.organization_id
FROM user_profiles up
WHERE aa.user_id = up.id
AND aa.organization_id != up.organization_id;



-- ==========================================


-- Migration: 20250609600000_fix_call_status_constraint.sql
-- Fix calls status constraint to include 'in-progress' from Twilio
-- Twilio sends statuses like: queued, ringing, in-progress, completed, busy, no-answer, canceled, failed

-- First drop the existing constraint
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check;

-- Add updated constraint with all Twilio statuses
ALTER TABLE calls ADD CONSTRAINT calls_status_check 
  CHECK (status IN (
    'initiated',     -- Our custom initial status
    'queued',        -- Twilio: call is queued
    'ringing',       -- Twilio: call is ringing
    'in-progress',   -- Twilio: call is in progress (answered)
    'answered',      -- Our custom status (same as in-progress)
    'completed',     -- Twilio: call completed normally
    'busy',          -- Twilio: busy signal
    'no-answer',     -- Twilio: no answer (with hyphen)
    'no_answer',     -- Our custom status (with underscore)
    'failed',        -- Twilio: call failed
    'canceled',      -- Twilio: call was canceled (one L)
    'cancelled'      -- Our custom status (two L's)
  ));

COMMENT ON COLUMN calls.status IS 'Call status - includes Twilio statuses (queued, ringing, in-progress, completed, busy, no-answer, canceled, failed) and custom statuses (initiated, answered, no_answer, cancelled)';





-- ==========================================


-- Migration: 20250609700000_fix_rep_update_and_first_name.sql
-- ============================================
-- Fix 1: Allow reps to update ANY lead in their organization (not just assigned)
-- ============================================

-- Drop conflicting policies
DROP POLICY IF EXISTS "Reps can update their assigned leads" ON search_results;
DROP POLICY IF EXISTS "Team members can update organization search results" ON search_results;
DROP POLICY IF EXISTS "Users can delete organization search results" ON search_results;

-- Create simple policy: any team member can update any lead in their org
CREATE POLICY "Team members can update organization search results"
  ON search_results FOR UPDATE
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

-- ============================================
-- Fix 2: Update handle_new_user trigger to capture first_name
-- ============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
  user_first_name TEXT;
BEGIN
  -- Extract first_name from user metadata (set during signUp)
  user_first_name := NEW.raw_user_meta_data->>'first_name';
  
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      pending_invitation := NULL;
    END;

    IF pending_invitation IS NOT NULL THEN
      -- User was invited: Create profile with invited role in the inviting organization
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email, user_first_name);
      
      profile_created := TRUE;
      
      -- Mark invitation as accepted
      UPDATE team_invitations 
      SET status = 'accepted', accepted_at = NOW() 
      WHERE id = pending_invitation.id;
      
      RAISE LOG 'Auto-accepted invitation for user % to org % with name %', NEW.email, pending_invitation.organization_id, user_first_name;
    ELSE
      -- No invitation: Create new organization for this user
      INSERT INTO organizations (name)
      VALUES (COALESCE(user_first_name, split_part(NEW.email, '@', 1)) || '''s Organization')
      RETURNING id INTO new_org_id;
      
      -- Create user profile with email and first_name (stored in full_name)
      INSERT INTO user_profiles (id, organization_id, role, email, full_name)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name %', new_org_id, NEW.email, user_first_name;
      
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If organization/profile creation fails, log the error but don't block user creation
    RAISE LOG 'Error creating org/profile for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    
    -- Try one more time with minimal profile if we haven't created one yet
    IF NOT profile_created THEN
      BEGIN
        INSERT INTO organizations (name)
        VALUES (split_part(NEW.email, '@', 1) || '''s Organization')
        RETURNING id INTO new_org_id;
        
        INSERT INTO user_profiles (id, organization_id, role, email, full_name)
        VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name);
        
        RAISE LOG 'Created fallback profile for user %', NEW.email;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Fallback profile creation also failed for %: %', NEW.email, SQLERRM;
      END;
    END IF;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Fix 3: Update existing user's name if they provided it at signup
-- This updates users who signed up but didn't have their name captured
-- ============================================

-- Update any user_profiles where full_name is NULL but the auth.users has first_name in metadata
UPDATE user_profiles up
SET full_name = (
  SELECT raw_user_meta_data->>'first_name'
  FROM auth.users au
  WHERE au.id = up.id
    AND au.raw_user_meta_data->>'first_name' IS NOT NULL
    AND au.raw_user_meta_data->>'first_name' != ''
)
WHERE up.full_name IS NULL OR up.full_name = '';

-- Done!



-- ==========================================


-- Migration: 20250610000000_enhanced_sdr_reporting.sql
-- Enhanced SDR Reporting Schema Migration
-- Adds campaign goals and CTA tracking for comprehensive SDR performance reporting

-- ============================================
-- 1. Create outcome_code enum type
-- ============================================
DO $$ BEGIN
  CREATE TYPE call_outcome_code AS ENUM (
    'NO_ANSWER',
    'BUSY',
    'WRONG_NUMBER',
    'NOT_INTERESTED',
    'INTERESTED_INFO_SENT',
    'TRIAL_STARTED',
    'CALLBACK_SCHEDULED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 2. Create cta_result enum type
-- ============================================
DO $$ BEGIN
  CREATE TYPE cta_result_type AS ENUM (
    'NOT_OFFERED',
    'ACCEPTED',
    'DECLINED',
    'OTHER_TOOL',
    'NEEDS_MANAGER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 3. Add CTA tracking columns to calls table
-- ============================================
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS outcome_code call_outcome_code,
ADD COLUMN IF NOT EXISTS cta_attempted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cta_result cta_result_type DEFAULT 'NOT_OFFERED',
ADD COLUMN IF NOT EXISTS cta_sent_via_sms BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS cta_sent_via_email BOOLEAN DEFAULT FALSE;

-- Add index for outcome reporting
CREATE INDEX IF NOT EXISTS idx_calls_outcome_code ON calls(outcome_code);
CREATE INDEX IF NOT EXISTS idx_calls_cta_attempted ON calls(cta_attempted) WHERE cta_attempted = TRUE;

-- ============================================
-- 4. Create campaign_goals table
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Per-hour targets
  target_dials_per_hour NUMERIC(5,2) DEFAULT 50,
  target_conversations_per_hour NUMERIC(5,2) DEFAULT 5,
  target_cta_attempts_per_hour NUMERIC(5,2) DEFAULT 3,
  target_cta_acceptances_per_hour NUMERIC(5,2) DEFAULT 1.5,
  target_trials_per_hour NUMERIC(5,2) DEFAULT 0.5,
  
  -- Weekly targets
  weekly_dials_goal INTEGER DEFAULT 500,
  weekly_trials_goal INTEGER DEFAULT 10,
  
  -- Conversion targets
  min_conversation_rate_pct NUMERIC(5,2) DEFAULT 10, -- % of dials that become conversations
  min_trials_per_conversation_pct NUMERIC(5,2) DEFAULT 10, -- % of conversations that become trials
  
  -- Call quality targets
  target_avg_call_duration_seconds INTEGER DEFAULT 120,
  
  -- Metadata
  effective_start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Only one active goal set per campaign
  UNIQUE(campaign_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_goals_campaign_id ON campaign_goals(campaign_id);

-- Comments
COMMENT ON TABLE campaign_goals IS 'Per-campaign performance targets for SDR benchmarking';
COMMENT ON COLUMN campaign_goals.target_dials_per_hour IS 'Expected dials per paid hour (typically 40-60)';
COMMENT ON COLUMN campaign_goals.target_conversations_per_hour IS 'Expected conversations (30s+) per hour (typically 4-6)';
COMMENT ON COLUMN campaign_goals.target_cta_attempts_per_hour IS 'Expected CTA offers per hour (typically 3-4)';
COMMENT ON COLUMN campaign_goals.target_trials_per_hour IS 'Expected trials started per hour (typically 0.25-0.75)';
COMMENT ON COLUMN campaign_goals.min_conversation_rate_pct IS 'Minimum acceptable % of dials that become conversations';
COMMENT ON COLUMN campaign_goals.min_trials_per_conversation_pct IS 'Minimum acceptable % of conversations that convert to trials';

-- ============================================
-- 5. RLS Policies for campaign_goals
-- ============================================
ALTER TABLE campaign_goals ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with campaign goals
CREATE POLICY "Admins can manage campaign goals"
  ON campaign_goals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN campaigns c ON c.organization_id = up.organization_id
      WHERE up.id = auth.uid()
      AND up.role = 'admin'
      AND c.id = campaign_goals.campaign_id
    )
  );

-- Campaign managers can view goals
CREATE POLICY "Campaign managers can view goals"
  ON campaign_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = campaign_goals.campaign_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'manager'
    )
  );

-- All campaign members can view goals (for their dashboard)
CREATE POLICY "Campaign members can view goals"
  ON campaign_goals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = campaign_goals.campaign_id
      AND cm.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. Updated_at trigger for campaign_goals
-- ============================================
DROP TRIGGER IF EXISTS update_campaign_goals_updated_at ON campaign_goals;
CREATE TRIGGER update_campaign_goals_updated_at
  BEFORE UPDATE ON campaign_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Extend daily_sdr_summaries with CTA metrics
-- ============================================
ALTER TABLE daily_sdr_summaries
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
ADD COLUMN IF NOT EXISTS cta_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cta_acceptances INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS outcome_distribution JSONB DEFAULT '{}';

-- Index for campaign-specific queries
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_campaign 
  ON daily_sdr_summaries(campaign_id, date DESC);

-- ============================================
-- 8. Extend weekly_sdr_summaries with CTA metrics
-- ============================================
ALTER TABLE weekly_sdr_summaries
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id),
ADD COLUMN IF NOT EXISTS cta_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cta_acceptances INTEGER DEFAULT 0;

-- Index for campaign-specific queries
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_campaign 
  ON weekly_sdr_summaries(campaign_id, week_start DESC);

-- ============================================
-- 9. Helper function to map old outcomes to new codes
-- ============================================
CREATE OR REPLACE FUNCTION map_outcome_to_code(old_outcome TEXT)
RETURNS call_outcome_code AS $$
BEGIN
  RETURN CASE old_outcome
    WHEN 'no_answer' THEN 'NO_ANSWER'::call_outcome_code
    WHEN 'busy' THEN 'BUSY'::call_outcome_code
    WHEN 'wrong_number' THEN 'WRONG_NUMBER'::call_outcome_code
    WHEN 'not_interested' THEN 'NOT_INTERESTED'::call_outcome_code
    WHEN 'interested' THEN 'INTERESTED_INFO_SENT'::call_outcome_code
    WHEN 'callback_requested' THEN 'CALLBACK_SCHEDULED'::call_outcome_code
    WHEN 'do_not_call' THEN 'NOT_INTERESTED'::call_outcome_code
    ELSE NULL
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 10. Backfill outcome_code from existing outcome field
-- ============================================
UPDATE calls
SET outcome_code = map_outcome_to_code(outcome)
WHERE outcome IS NOT NULL AND outcome_code IS NULL;

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Enhanced SDR Reporting Migration Complete ===';
  RAISE NOTICE 'Created: call_outcome_code enum, cta_result_type enum';
  RAISE NOTICE 'Added CTA tracking columns to calls table';
  RAISE NOTICE 'Created campaign_goals table with RLS policies';
  RAISE NOTICE 'Extended daily/weekly summaries with campaign_id and CTA metrics';
END $$;





-- ==========================================


-- Migration: 20250610100000_auto_generate_sdr_codes.sql
-- Auto-generate SDR codes for new users
-- Creates a random 6-character alphanumeric code on signup

-- ============================================
-- 1. Create function to generate random SDR code
-- ============================================
CREATE OR REPLACE FUNCTION generate_sdr_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghjkmnpqrstuvwxyz23456789'; -- Removed ambiguous chars (i,l,o,0,1)
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Create function to get unique SDR code (retries on collision)
-- ============================================
CREATE OR REPLACE FUNCTION get_unique_sdr_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  max_attempts INTEGER := 10;
  attempt INTEGER := 0;
BEGIN
  LOOP
    new_code := generate_sdr_code();
    -- Check if code already exists
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE sdr_code = new_code) THEN
      RETURN new_code;
    END IF;
    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      -- Fallback: append random suffix
      RETURN new_code || substr(md5(random()::text), 1, 2);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Update handle_new_user trigger to auto-set sdr_code
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
  user_first_name TEXT;
  new_sdr_code TEXT;
BEGIN
  -- Extract first_name from user metadata (set during signUp)
  user_first_name := NEW.raw_user_meta_data->>'first_name';
  
  -- Generate unique SDR code for this user
  new_sdr_code := get_unique_sdr_code();
  
  -- Wrap entire function in exception handler to ensure user creation never fails
  BEGIN
    -- Check if there's a pending invitation for this email (case-insensitive)
    BEGIN
      SELECT * INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION WHEN undefined_table THEN
      pending_invitation := NULL;
    END;

    IF pending_invitation IS NOT NULL THEN
      -- User was invited: Create profile with invited role in the inviting organization
      INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
      VALUES (NEW.id, pending_invitation.organization_id, pending_invitation.role, NEW.email, user_first_name, new_sdr_code);
      
      profile_created := TRUE;
      
      -- Mark invitation as accepted
      UPDATE team_invitations 
      SET status = 'accepted', accepted_at = NOW() 
      WHERE id = pending_invitation.id;
      
      RAISE LOG 'Auto-accepted invitation for user % to org % with name % and sdr_code %', NEW.email, pending_invitation.organization_id, user_first_name, new_sdr_code;
    ELSE
      -- No invitation: Create new organization for this user
      INSERT INTO organizations (name)
      VALUES (COALESCE(user_first_name, split_part(NEW.email, '@', 1)) || '''s Organization')
      RETURNING id INTO new_org_id;
      
      -- Create user profile with email, first_name, and auto-generated sdr_code
      INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
      VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name, new_sdr_code);
      
      profile_created := TRUE;
      RAISE LOG 'Created organization % and profile for user % with name % and sdr_code %', new_org_id, NEW.email, user_first_name, new_sdr_code;
      
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If organization/profile creation fails, log the error but don't block user creation
    RAISE LOG 'Error creating org/profile for user %: % (SQLSTATE: %)', NEW.email, SQLERRM, SQLSTATE;
    
    -- Try one more time with minimal profile if we haven't created one yet
    IF NOT profile_created THEN
      BEGIN
        INSERT INTO organizations (name)
        VALUES (split_part(NEW.email, '@', 1) || '''s Organization')
        RETURNING id INTO new_org_id;
        
        INSERT INTO user_profiles (id, organization_id, role, email, full_name, sdr_code)
        VALUES (NEW.id, new_org_id, 'admin', NEW.email, user_first_name, new_sdr_code);
        
        RAISE LOG 'Created fallback profile for user % with sdr_code %', NEW.email, new_sdr_code;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Fallback profile creation also failed for %: %', NEW.email, SQLERRM;
      END;
    END IF;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 4. Backfill existing users without sdr_code
-- ============================================
UPDATE user_profiles
SET sdr_code = get_unique_sdr_code()
WHERE sdr_code IS NULL;

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Auto-Generate SDR Codes Migration Complete ===';
  RAISE NOTICE 'New users will automatically get a 6-character SDR code on signup';
  RAISE NOTICE 'Existing users without codes have been backfilled';
END $$;





-- ==========================================


-- Migration: 20250611000000_enhanced_sdr_funnel.sql
-- Enhanced SDR Funnel Tracking Migration
-- Adds columns to track the full SDR funnel:
-- trial_started â†’ trial_activated â†’ snippet_installed â†’ paid_subscribed

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





-- ==========================================


-- Migration: 20250611100000_add_contact_name.sql
-- Add contact_name column to search_results for storing the contact person's name
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN search_results.contact_name IS 'Name of the contact person at the business (e.g., "Joe Smith")';

-- Create index for searching by contact name
CREATE INDEX IF NOT EXISTS idx_search_results_contact_name 
  ON search_results(contact_name) WHERE contact_name IS NOT NULL;





-- ==========================================


-- Migration: 20250612000000_fix_signup_trigger_robust.sql
-- More robust handle_new_user() trigger that NEVER fails
-- This fixes "Database error saving new user" issues

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  pending_invitation RECORD;
  profile_created BOOLEAN := FALSE;
BEGIN
  -- CRITICAL: Wrap everything in exception handler to NEVER block user creation
  BEGIN
    -- Step 1: Check for pending invitation
    BEGIN
      SELECT id, organization_id, role, token 
      INTO pending_invitation
      FROM team_invitations
      WHERE LOWER(email) = LOWER(NEW.email)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Invitation lookup failed - continue with normal signup
      pending_invitation := NULL;
      RAISE LOG '[handle_new_user] Invitation lookup error for %: %', NEW.email, SQLERRM;
    END;
    
    -- Step 2: If invitation found, create profile and accept invitation
    IF pending_invitation IS NOT NULL AND pending_invitation.organization_id IS NOT NULL THEN
      BEGIN
        -- Create user profile with invitation's organization
        INSERT INTO user_profiles (id, organization_id, role, email)
        VALUES (NEW.id, pending_invitation.organization_id, COALESCE(pending_invitation.role, 'member'), NEW.email)
        ON CONFLICT (id) DO NOTHING;  -- Don't fail if profile somehow exists
        
        profile_created := TRUE;
        
        -- Mark invitation as accepted
        BEGIN
          UPDATE team_invitations
          SET status = 'accepted', accepted_at = NOW()
          WHERE id = pending_invitation.id AND status = 'pending';
        EXCEPTION WHEN OTHERS THEN
          -- Invitation update failed - user still created, invitation can be accepted later
          RAISE LOG '[handle_new_user] Could not mark invitation accepted for %: %', NEW.email, SQLERRM;
        END;
        
        RAISE LOG '[handle_new_user] Created profile for invited user % in org %', NEW.email, pending_invitation.organization_id;
        RETURN NEW;  -- Done!
        
      EXCEPTION WHEN OTHERS THEN
        -- Profile creation with invitation failed
        RAISE LOG '[handle_new_user] Invitation profile creation error for %: %', NEW.email, SQLERRM;
        profile_created := FALSE;
        -- Fall through to create new org
      END;
    END IF;
    
    -- Step 3: No valid invitation - create new organization and profile
    IF NOT profile_created THEN
      BEGIN
        -- Create organization
        INSERT INTO organizations (name)
        VALUES (COALESCE(SPLIT_PART(NEW.email, '@', 1), 'User') || '''s Organization')
        RETURNING id INTO new_org_id;
        
        -- Create profile
        IF new_org_id IS NOT NULL THEN
          INSERT INTO user_profiles (id, organization_id, role, email)
          VALUES (NEW.id, new_org_id, 'admin', NEW.email)
          ON CONFLICT (id) DO NOTHING;
          
          RAISE LOG '[handle_new_user] Created new org % and profile for %', new_org_id, NEW.email;
        END IF;
        
      EXCEPTION WHEN OTHERS THEN
        -- Org/profile creation failed - user still created in auth.users
        RAISE LOG '[handle_new_user] Org/profile creation error for %: %', NEW.email, SQLERRM;
        
        -- Try to clean up orphan org if created
        IF new_org_id IS NOT NULL THEN
          BEGIN
            DELETE FROM organizations WHERE id = new_org_id;
          EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignore cleanup errors
          END;
        END IF;
      END;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Ultimate fallback - log but NEVER block user creation
    RAISE LOG '[handle_new_user] CRITICAL: Unexpected error for %: %', NEW.email, SQLERRM;
  END;
  
  -- ALWAYS return NEW - never fail user creation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Ensure the accept_team_invitation function exists
CREATE OR REPLACE FUNCTION accept_team_invitation(invitation_token TEXT)
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW()
  WHERE token = invitation_token
    AND status = 'pending';
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[accept_team_invitation] Error accepting invitation: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;





-- ==========================================


-- Migration: 20250612100000_sdr_trial_reviews.sql
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



-- ==========================================


-- Migration: 20250614000000_badge_system_and_trial_pipeline.sql
-- Badge System and Trial Pipeline Migration
-- Implements deterministic CRM + Dialer + Trial Pipeline system
-- Adds badge_key, trial_pipeline table, ownership locks, and campaign scripts by badge

-- ============================================
-- 1. Add columns to search_results table
-- ============================================
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS badge_key TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS owner_sdr_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

-- Add constraint for badge_key values (after backfill)
-- Note: We'll add the CHECK constraint after ensuring all existing rows have valid badge_key values
-- For now, we'll rely on application-level validation

-- Comments
COMMENT ON COLUMN search_results.badge_key IS 'Badge key: new, recycle_cold, follow_up_scheduled, recycle_not_interested, trial_awaiting_activation, trial_activated, trial_configured, trial_embed_copied, trial_live_first_lead, trial_stalled, converted_recent, dnc, invalid_contact';
COMMENT ON COLUMN search_results.do_not_contact IS 'Hard no - removes lead from all queues permanently';
COMMENT ON COLUMN search_results.owner_sdr_id IS 'Locked owner - only admins can reassign after first assignment';
COMMENT ON COLUMN search_results.next_follow_up_at IS 'When the next action should be taken (replaces next_action_at for clarity)';

-- ============================================
-- 2. Create trial_pipeline table
-- ============================================
CREATE TABLE IF NOT EXISTS trial_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id UUID UNIQUE NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  owner_sdr_id UUID REFERENCES auth.users(id),
  jcc_user_id TEXT, -- JCC user_id from webhook (may be UUID or string)
  
  -- Timestamps (set by JCC events)
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  password_set_at TIMESTAMPTZ,
  first_login_at TIMESTAMPTZ,
  calculator_modified_at TIMESTAMPTZ,
  embed_snippet_copied_at TIMESTAMPTZ,
  first_lead_received_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  
  -- Conversion data
  install_url TEXT,
  plan TEXT,
  mrr NUMERIC(10,2),
  
  -- Tracking
  last_event_at TIMESTAMPTZ DEFAULT NOW(),
  bonus_state TEXT DEFAULT 'none' CHECK (bonus_state IN ('none', 'pending', 'paid')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments
COMMENT ON TABLE trial_pipeline IS 'Snapshot table tracking trial lifecycle from JCC events';
COMMENT ON COLUMN trial_pipeline.crm_lead_id IS 'Links to search_results (lead)';
COMMENT ON COLUMN trial_pipeline.owner_sdr_id IS 'SDR who owns this trial (for attribution)';
COMMENT ON COLUMN trial_pipeline.jcc_user_id IS 'JCC user_id from webhook';
COMMENT ON COLUMN trial_pipeline.bonus_state IS 'Bonus attribution state: none, pending, paid';

-- ============================================
-- 3. Add badge_key to call_scripts table
-- ============================================
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS badge_key TEXT;

-- Unique constraint: one script per campaign+badge combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_scripts_campaign_badge 
  ON call_scripts(campaign_id, badge_key) 
  WHERE badge_key IS NOT NULL;

COMMENT ON COLUMN call_scripts.badge_key IS 'Badge key for badge-specific scripts (NULL = campaign default)';

-- ============================================
-- 4. Ownership lock trigger
-- ============================================
-- Prevent non-admins from changing owner_sdr_id once set
CREATE OR REPLACE FUNCTION lock_owner_sdr_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If owner was already set and is being changed
  IF OLD.owner_sdr_id IS NOT NULL 
     AND NEW.owner_sdr_id IS DISTINCT FROM OLD.owner_sdr_id THEN
    -- Check if current user is admin
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Only admins can reassign lead ownership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_lock_owner ON search_results;

-- Create trigger
CREATE TRIGGER trigger_lock_owner
  BEFORE UPDATE ON search_results
  FOR EACH ROW
  EXECUTE FUNCTION lock_owner_sdr_id();

-- ============================================
-- 5. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sr_badge ON search_results(badge_key);
CREATE INDEX IF NOT EXISTS idx_sr_followup ON search_results(next_follow_up_at) 
  WHERE next_follow_up_at IS NOT NULL AND do_not_contact = FALSE;
CREATE INDEX IF NOT EXISTS idx_sr_owner ON search_results(owner_sdr_id);
CREATE INDEX IF NOT EXISTS idx_sr_dnc ON search_results(do_not_contact) 
  WHERE do_not_contact = TRUE;

CREATE INDEX IF NOT EXISTS idx_tp_owner ON trial_pipeline(owner_sdr_id);
CREATE INDEX IF NOT EXISTS idx_tp_jcc_user ON trial_pipeline(jcc_user_id);
CREATE INDEX IF NOT EXISTS idx_tp_crm_lead ON trial_pipeline(crm_lead_id);
CREATE INDEX IF NOT EXISTS idx_tp_converted ON trial_pipeline(converted_at) 
  WHERE converted_at IS NOT NULL;

-- ============================================
-- 6. Row Level Security for trial_pipeline
-- ============================================
ALTER TABLE trial_pipeline ENABLE ROW LEVEL SECURITY;

-- SDRs can view their own trials
CREATE POLICY "SDRs can view their own trials"
  ON trial_pipeline FOR SELECT
  USING (
    owner_sdr_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can manage all (for webhooks)
CREATE POLICY "Service role can manage trial pipeline"
  ON trial_pipeline FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================
-- 7. Backfill existing data
-- ============================================
-- Set badge_key based on existing lead_status
UPDATE search_results
SET badge_key = CASE
  WHEN lead_status = 'new' THEN 'new'
  WHEN lead_status = 'contacted' THEN 'recycle_cold'
  WHEN lead_status = 'interested' THEN 'follow_up_scheduled'
  WHEN lead_status = 'trial_started' THEN 'trial_awaiting_activation'
  WHEN lead_status = 'follow_up' THEN 'follow_up_scheduled'
  WHEN lead_status = 'closed_won' THEN 'converted_recent'
  WHEN lead_status = 'closed_lost' THEN 'recycle_not_interested'
  WHEN lead_status = 'not_interested' THEN 'recycle_not_interested'
  WHEN lead_status = 'converted' THEN 'converted_recent'
  ELSE 'new'
END
WHERE badge_key IS NULL OR badge_key = 'new';

-- Set owner_sdr_id from assigned_to if not set
UPDATE search_results
SET owner_sdr_id = assigned_to
WHERE owner_sdr_id IS NULL AND assigned_to IS NOT NULL;

-- Set next_follow_up_at from next_action_at if exists
UPDATE search_results
SET next_follow_up_at = next_action_at
WHERE next_follow_up_at IS NULL AND next_action_at IS NOT NULL;

-- ============================================
-- 9. BACKFILL: Set follow-ups for existing leads without one
-- ============================================
-- Cadence rules:
-- new â†’ NOW (show immediately)
-- recycle_cold â†’ +30 days from last contact
-- follow_up_scheduled â†’ +7 days from last contact
-- trial badges â†’ +3 days from last contact
-- recycle_not_interested â†’ +90 days from last contact
-- converted/dnc/invalid â†’ no follow-up

UPDATE search_results
SET next_follow_up_at = CASE
  WHEN badge_key = 'new' THEN NOW()
  WHEN badge_key = 'recycle_cold' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '30 days'
  WHEN badge_key = 'follow_up_scheduled' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '7 days'
  WHEN badge_key IN ('trial_awaiting_activation', 'trial_activated', 
    'trial_configured', 'trial_embed_copied', 'trial_live_first_lead') THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '3 days'
  WHEN badge_key = 'trial_stalled' THEN NOW() + INTERVAL '1 day'
  WHEN badge_key = 'recycle_not_interested' THEN 
    COALESCE(last_contacted_at, created_at, NOW()) + INTERVAL '90 days'
  ELSE NULL
END
WHERE next_follow_up_at IS NULL
  AND do_not_contact = FALSE
  AND badge_key NOT IN ('converted_recent', 'dnc', 'invalid_contact');

-- Normalize follow-up times to 9 AM
UPDATE search_results
SET next_follow_up_at = DATE_TRUNC('day', next_follow_up_at) + INTERVAL '9 hours'
WHERE next_follow_up_at IS NOT NULL;

-- ============================================
-- 8. Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Badge System and Trial Pipeline Migration Complete ===';
  RAISE NOTICE 'Added to search_results: badge_key, do_not_contact, owner_sdr_id, next_follow_up_at';
  RAISE NOTICE 'Created trial_pipeline table with full lifecycle tracking';
  RAISE NOTICE 'Added badge_key to call_scripts for badge-specific scripts';
  RAISE NOTICE 'Created ownership lock trigger (only admins can reassign)';
  RAISE NOTICE 'Created indexes for performance';
  RAISE NOTICE 'Backfilled existing data with badge_key mappings';
END $$;



-- ==========================================


-- Migration: 20251215000000_add_call_quality_tag.sql
-- Add conversion quality tag for trial call reviews
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS conversion_quality_tag TEXT 
CHECK (conversion_quality_tag IN ('strong', 'average', 'email_grab', 'forced', 'unknown'))
DEFAULT 'unknown';

-- Index for filtering by quality tag
CREATE INDEX IF NOT EXISTS idx_calls_quality_tag ON calls(conversion_quality_tag) 
WHERE conversion_quality_tag IS NOT NULL;

COMMENT ON COLUMN calls.conversion_quality_tag IS 'Quality tag for trial-resulted calls: strong, average, email_grab, forced, unknown';




-- ==========================================


-- Migration: 20251216000000_add_trial_experiment.sql
-- Add experiment fields to trial_pipeline
ALTER TABLE trial_pipeline 
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS followup_variant TEXT CHECK (followup_variant IN ('A', 'B'));

-- Index for experiment queries
CREATE INDEX IF NOT EXISTS idx_tp_experiment 
ON trial_pipeline(followup_variant, activated_at, trial_started_at);

-- Backfill activated_at for existing records
UPDATE trial_pipeline
SET activated_at = LEAST(
  COALESCE(calculator_modified_at, embed_snippet_copied_at),
  COALESCE(embed_snippet_copied_at, calculator_modified_at)
)
WHERE first_login_at IS NOT NULL
  AND (calculator_modified_at IS NOT NULL OR embed_snippet_copied_at IS NOT NULL)
  AND activated_at IS NULL;

COMMENT ON COLUMN trial_pipeline.followup_variant IS 'A = product-only nudge, B = product + SDR follow-up task';
COMMENT ON COLUMN trial_pipeline.activated_at IS 'When activation condition met (login + action)';




-- ==========================================


-- Migration: 20251217000000_campaign_scripts_framework.sql
-- Campaign Scripts Framework Migration
-- Adds script_key, category, and priority to call_scripts table
-- This enables automatic script routing based on lead situation

-- ============================================
-- 1. Add new columns to call_scripts
-- ============================================

-- script_key: Machine-readable unique identifier per campaign (e.g., "RESCUE_PASSWORD_NOT_SET")
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS script_key TEXT;

-- category: Groups scripts by purpose (PROSPECT, FOLLOWUP, RESCUE, CONVERT)
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS category TEXT;

-- priority: Controls display order within category (lower = higher priority)
ALTER TABLE call_scripts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Add constraint for valid categories
ALTER TABLE call_scripts DROP CONSTRAINT IF EXISTS call_scripts_category_check;
ALTER TABLE call_scripts ADD CONSTRAINT call_scripts_category_check 
  CHECK (category IS NULL OR category IN ('PROSPECT', 'FOLLOWUP', 'RESCUE', 'CONVERT'));

-- Unique constraint: one script_key per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_scripts_campaign_script_key 
  ON call_scripts(campaign_id, script_key) 
  WHERE script_key IS NOT NULL;

-- Index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_call_scripts_category 
  ON call_scripts(campaign_id, category);

-- ============================================
-- 2. Add comments for documentation
-- ============================================
COMMENT ON COLUMN call_scripts.script_key IS 'Machine-readable key for auto-loading (e.g., RESCUE_PASSWORD_NOT_SET, PROSPECT_PITCH_CORE)';
COMMENT ON COLUMN call_scripts.category IS 'Script category: PROSPECT, FOLLOWUP, RESCUE, or CONVERT';
COMMENT ON COLUMN call_scripts.priority IS 'Display priority within category (lower = higher priority)';

-- ============================================
-- 3. Standard Script Keys Reference (for documentation)
-- ============================================
-- Prospecting:
--   PROSPECT_OPENER_GATEKEEPER
--   PROSPECT_OPENER_DECISIONMAKER
--   PROSPECT_PITCH_CORE (default prospecting script)
--   PROSPECT_OBJECTION_BUSY
--   PROSPECT_OBJECTION_ALREADY_HAVE_SOLUTION
--   PROSPECT_CLOSE_TRIAL
--
-- Follow-ups:
--   TRIAL_FOLLOWUP_1
--   TRIAL_FOLLOWUP_2
--   TRIAL_FOLLOWUP_3
--
-- Rescues:
--   RESCUE_PASSWORD_NOT_SET (Rescue A - 2-24h after trial, no password)
--   RESCUE_NOT_ACTIVATED (Rescue B - 2-48h after password, no activation)
--
-- Conversion:
--   CONVERT_TO_PAID_NUDGE
--   CANCEL_SAVE_OFFER

-- ============================================
-- 4. Migration complete notice
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Campaign Scripts Framework Migration Complete ===';
  RAISE NOTICE 'Added columns: script_key, category, priority';
  RAISE NOTICE 'Created indexes for script_key and category lookups';
END $$;




-- ==========================================


-- Migration: 20251217000001_tag_default_prospecting_scripts.sql
-- Tag Default Prospecting Scripts
-- Finds scripts that are being used as defaults (no script_key, no badge_key)
-- and tags them as PROSPECT_PITCH_CORE

-- ============================================
-- 1. Find and tag ONE default script per campaign
-- ============================================

-- Use a CTE to select only the FIRST (oldest) default script per campaign
-- This avoids duplicate key violations when multiple default scripts exist
WITH first_default_per_campaign AS (
  SELECT DISTINCT ON (campaign_id) id
  FROM call_scripts
  WHERE 
    script_key IS NULL 
    AND (badge_key IS NULL OR badge_key = '')
    AND is_active = true
    -- Skip campaigns that already have a PROSPECT_PITCH_CORE script
    AND campaign_id NOT IN (
      SELECT campaign_id 
      FROM call_scripts 
      WHERE script_key = 'PROSPECT_PITCH_CORE'
    )
  ORDER BY campaign_id, created_at ASC
)
UPDATE call_scripts
SET 
  script_key = 'PROSPECT_PITCH_CORE',
  category = 'PROSPECT',
  priority = 0,
  updated_at = NOW()
WHERE id IN (SELECT id FROM first_default_per_campaign);

-- ============================================
-- 2. Report what was updated
-- ============================================
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count 
  FROM call_scripts 
  WHERE script_key = 'PROSPECT_PITCH_CORE';
  
  RAISE NOTICE '=== Total PROSPECT_PITCH_CORE scripts: % ===', updated_count;
END $$;



-- ==========================================


-- Migration: 20251217100000_activator_system.sql
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




-- ==========================================


-- Migration: 20251217100001_reassign_existing_trials_to_activator.sql
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




-- ==========================================


-- Migration: 20251218000000_allow_null_lead_id_calls.sql
-- Allow inbound calls from unknown callers (no lead record yet)
-- This fixes: "null value in column lead_id violates not-null constraint"

-- Drop the NOT NULL constraint on lead_id
ALTER TABLE calls ALTER COLUMN lead_id DROP NOT NULL;

-- Add comment explaining why lead_id can be null
COMMENT ON COLUMN calls.lead_id IS 'Reference to the lead. NULL for inbound calls from unknown callers.';




-- ==========================================


-- Migration: 20251218100000_auto_assign_trials_to_activator.sql
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


-- ==========================================


-- Migration: 20251218200000_activation_status_system.sql
-- Add activation_status enum type
DO $$ BEGIN
  CREATE TYPE activation_status_type AS ENUM ('queued', 'in_progress', 'scheduled', 'activated', 'killed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add kill_reason enum type  
DO $$ BEGIN
  CREATE TYPE activation_kill_reason AS ENUM ('no_access', 'no_response', 'no_technical_owner', 'no_urgency', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to trial_pipeline
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS activation_status activation_status_type DEFAULT 'queued',
ADD COLUMN IF NOT EXISTS next_action TEXT,
ADD COLUMN IF NOT EXISTS scheduled_install_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS technical_owner_name TEXT,
ADD COLUMN IF NOT EXISTS activation_kill_reason activation_kill_reason;

-- Set existing records to 'queued' if they have no status
UPDATE trial_pipeline 
SET activation_status = 'queued' 
WHERE activation_status IS NULL AND marked_lost_at IS NULL;

-- Set existing killed records to 'killed' status
UPDATE trial_pipeline 
SET activation_status = 'killed' 
WHERE marked_lost_at IS NOT NULL;




-- ==========================================


-- Migration: 20251218210000_activator_system_v1.sql
-- Phase 1.1: Data additions to trial_pipeline
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS assigned_activator_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescue_attempts INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS customer_timezone TEXT;




-- ==========================================


-- Migration: 20251218220000_scheduled_messages.sql
-- Phase 3.1: Scheduled Messages table for reminders
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'install_reminder_24h'
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled/sent/canceled/failed
  payload JSONB NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for cron job performance
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_send_at ON scheduled_messages(status, send_at);




-- ==========================================


-- Migration: 20251220000000_activation_calendar_system.sql
-- Activation Calendar System Migration
-- Adds availability settings to agent_schedules and creates activation_meetings table

-- 1. Add availability settings to agent_schedules
ALTER TABLE agent_schedules
ADD COLUMN IF NOT EXISTS meeting_duration_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS buffer_before_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS buffer_after_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS max_meetings_per_day INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS is_accepting_meetings BOOLEAN DEFAULT true;

-- 2. Create activation_meetings table
-- Create types if they don't exist (PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE)
DO $$ BEGIN
    CREATE TYPE activation_meeting_status AS ENUM ('scheduled', 'completed', 'no_show', 'rescheduled', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendee_role AS ENUM ('owner', 'web_guy', 'office_manager', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE website_platform AS ENUM ('wordpress', 'wix', 'squarespace', 'shopify', 'none', 'unknown', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS activation_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Scheduling
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  scheduled_timezone TEXT NOT NULL,
  
  -- Assignment
  activator_user_id UUID NOT NULL REFERENCES auth.users(id),
  scheduled_by_sdr_user_id UUID NOT NULL REFERENCES auth.users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Status
  status activation_meeting_status DEFAULT 'scheduled',
  
  -- Attendee info (REQUIRED by SDR)
  attendee_name TEXT NOT NULL,
  attendee_role attendee_role NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  
  -- Context (REQUIRED by SDR)
  website_platform website_platform NOT NULL,
  goal TEXT NOT NULL,
  objections TEXT,
  notes TEXT,
  
  -- Email tracking
  confirmation_sent_at TIMESTAMPTZ,
  reminder_24h_sent_at TIMESTAMPTZ,
  
  -- Rescheduling
  rescheduled_from_id UUID REFERENCES activation_meetings(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_activation_meetings_activator ON activation_meetings(activator_user_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_sdr ON activation_meetings(scheduled_by_sdr_user_id);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_status ON activation_meetings(status, scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_org ON activation_meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_activation_meetings_reminder ON activation_meetings(scheduled_start_at) 
  WHERE reminder_24h_sent_at IS NULL AND status = 'scheduled';

-- 4. RLS policies
ALTER TABLE activation_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view meetings in their org" ON activation_meetings;
CREATE POLICY "Users can view meetings in their org"
ON activation_meetings FOR SELECT
USING (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert meetings in their org" ON activation_meetings;
CREATE POLICY "Users can insert meetings in their org"
ON activation_meetings FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update meetings in their org" ON activation_meetings;
CREATE POLICY "Users can update meetings in their org"
ON activation_meetings FOR UPDATE
USING (organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid()));

-- 5. Updated_at trigger (function should already exist from previous migrations)
CREATE TRIGGER update_activation_meetings_updated_at
  BEFORE UPDATE ON activation_meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




-- ==========================================


-- Migration: 20251220100000_activator_timezone.sql
-- Add timezone column to agent_schedules
ALTER TABLE agent_schedules
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Add timezone column to user_profiles for convenience
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';




-- ==========================================


-- Migration: 20251221000000_onboarding_scheduling_system.sql
-- Onboarding Scheduling System Migration
-- Part A: Database Schema Changes
-- Extends trial_pipeline, creates activation_events audit log, and enhances activator settings

-- ============================================
-- A1: Extend trial_pipeline table
-- ============================================

-- Extend activation_status enum with attended/no_show
-- First check if the type exists, then add values
DO $$ 
BEGIN
  -- Check if type exists before trying to add values
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activation_status_type') THEN
    -- Add 'attended' if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'attended' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activation_status_type')
    ) THEN
      ALTER TYPE activation_status_type ADD VALUE 'attended';
    END IF;
    
    -- Add 'no_show' if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'no_show' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'activation_status_type')
    ) THEN
      ALTER TYPE activation_status_type ADD VALUE 'no_show';
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN null;
END $$;

-- Add scheduling/tracking columns to trial_pipeline
-- Note: Each column must be added separately when using IF NOT EXISTS
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_timezone TEXT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_with_name TEXT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_with_role TEXT; -- owner/web_guy/manager/receptionist/other
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS website_platform TEXT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS lead_email TEXT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS timezone_inferred_from TEXT; -- area_code/manual/unknown
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS timezone_confidence SMALLINT;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS attempts_count INT DEFAULT 0;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS attended_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS killed_at TIMESTAMPTZ;
ALTER TABLE trial_pipeline ADD COLUMN IF NOT EXISTS reschedule_count INT DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN trial_pipeline.scheduled_with_role IS 'Role of person attending: owner/web_guy/manager/receptionist/other';
COMMENT ON COLUMN trial_pipeline.timezone_inferred_from IS 'How timezone was determined: area_code/manual/unknown';
COMMENT ON COLUMN trial_pipeline.timezone_confidence IS 'Confidence level: 100 (confident) / 50 (guessed) / 0 (unknown)';
COMMENT ON COLUMN trial_pipeline.attempts_count IS 'Counts contact/schedule touches; used for prioritization';
COMMENT ON COLUMN trial_pipeline.reschedule_count IS 'Number of times this meeting has been rescheduled';

-- ============================================
-- A2: Create activation_events audit log table
-- ============================================

CREATE TABLE IF NOT EXISTS activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_pipeline_id UUID REFERENCES trial_pipeline(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- scheduled/rescheduled/attended/no_show/killed/note_updated/timezone_set/reminder_sent/sms_sent
  actor_user_id UUID REFERENCES auth.users(id),
  metadata JSONB, -- Store old/new schedule times, reason, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activation_events_trial_pipeline ON activation_events(trial_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_activation_events_event_type ON activation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activation_events_actor ON activation_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activation_events_created_at ON activation_events(created_at);

-- RLS policies
ALTER TABLE activation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events in their org"
  ON activation_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trial_pipeline tp
      JOIN search_results sr ON sr.id = tp.crm_lead_id
      WHERE tp.id = activation_events.trial_pipeline_id
      AND sr.organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert events in their org"
  ON activation_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trial_pipeline tp
      JOIN search_results sr ON sr.id = tp.crm_lead_id
      WHERE tp.id = activation_events.trial_pipeline_id
      AND sr.organization_id IN (
        SELECT organization_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- Service role can manage all (for cron jobs and webhooks)
CREATE POLICY "Service role can manage activation events"
  ON activation_events FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================
-- A3: Extend activator availability settings
-- ============================================

ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS min_notice_hours INT DEFAULT 2;
ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS booking_window_days INT DEFAULT 14;
ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS meeting_link TEXT; -- Static Google Meet link

-- Comments
COMMENT ON COLUMN agent_schedules.min_notice_hours IS 'Minimum hours notice required for booking (default 2)';
COMMENT ON COLUMN agent_schedules.booking_window_days IS 'How many days ahead to show slots (default 14)';
COMMENT ON COLUMN agent_schedules.meeting_link IS 'Static Google Meet link for all meetings';

-- ============================================
-- Migration Summary
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Onboarding Scheduling System Migration Complete ===';
  RAISE NOTICE 'Extended activation_status enum with attended/no_show';
  RAISE NOTICE 'Added scheduling/tracking columns to trial_pipeline';
  RAISE NOTICE 'Created activation_events audit log table';
  RAISE NOTICE 'Extended agent_schedules with min_notice_hours, booking_window_days, meeting_link';
END $$;




-- ==========================================


-- Migration: 20251221100000_allow_activators_own_schedules.sql
-- Allow activators to manage their own schedules
-- This fixes the RLS policy issue where non-admin activators couldn't save their availability settings

CREATE POLICY "Users can manage their own schedules"
ON agent_schedules FOR ALL
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());




-- ==========================================


-- Migration: 20251221200000_twilio_cost_controls.sql
-- Twilio Cost Controls Migration
-- Adds columns for conditional recording, max duration limits, transcription control

-- Add new cost control columns
ALTER TABLE organization_call_settings
ADD COLUMN IF NOT EXISTS record_after_seconds INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS recording_retention_hours INTEGER DEFAULT 24,
ADD COLUMN IF NOT EXISTS voicemail_transcription_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS max_call_duration_sdr_seconds INTEGER DEFAULT 1200,
ADD COLUMN IF NOT EXISTS max_call_duration_activator_seconds INTEGER DEFAULT 2700;

-- Update default for recording_enabled to FALSE for cost savings
-- New orgs will have recording OFF by default
ALTER TABLE organization_call_settings
ALTER COLUMN recording_enabled SET DEFAULT FALSE;

-- Add comment explaining the columns
COMMENT ON COLUMN organization_call_settings.record_after_seconds IS 'Only start recording after call exceeds this duration (seconds). Default 30.';
COMMENT ON COLUMN organization_call_settings.recording_retention_hours IS 'Delete recordings after this many hours. Default 24.';
COMMENT ON COLUMN organization_call_settings.voicemail_transcription_enabled IS 'Whether to transcribe voicemails. Default FALSE to save costs.';
COMMENT ON COLUMN organization_call_settings.max_call_duration_sdr_seconds IS 'Max call duration for SDRs before auto-termination. Default 1200 (20 min).';
COMMENT ON COLUMN organization_call_settings.max_call_duration_activator_seconds IS 'Max call duration for activators before auto-termination. Default 2700 (45 min).';



-- ==========================================


-- Migration: 20251222_sdr_confirmation_fields.sql
-- SDR Confirmation Checklist Migration
-- Adds fields to track SDR confirmations during appointment booking

-- ============================================
-- Add SDR confirmation fields to activation_meetings
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS sdr_confirmed_understands_install BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sdr_confirmed_agreed_install BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sdr_confirmed_will_attend BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS access_method TEXT CHECK (access_method IN ('credentials', 'web_person', 'both')),
ADD COLUMN IF NOT EXISTS web_person_email TEXT;

COMMENT ON COLUMN activation_meetings.sdr_confirmed_understands_install IS 'SDR confirmed customer understands calculator will be installed on their website';
COMMENT ON COLUMN activation_meetings.sdr_confirmed_agreed_install IS 'SDR confirmed customer agreed to install during the setup call';
COMMENT ON COLUMN activation_meetings.sdr_confirmed_will_attend IS 'SDR confirmed customer will attend the install appointment';
COMMENT ON COLUMN activation_meetings.access_method IS 'How customer will provide access: credentials, web_person, or both';
COMMENT ON COLUMN activation_meetings.web_person_email IS 'Email of website person who will join the call (if access_method includes web_person)';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== SDR Confirmation Checklist Migration Complete ===';
  RAISE NOTICE 'Added to activation_meetings: sdr_confirmed_understands_install, sdr_confirmed_agreed_install, sdr_confirmed_will_attend, access_method, web_person_email';
END $$;




-- ==========================================


-- Migration: 20251222000000_performance_dashboards_schema.sql
-- Performance Dashboards, Scoring and Weekly Reporting Schema
-- Creates weekly performance snapshots for SDRs and Activators
-- Adds performance notes system and completed_at tracking

-- ============================================
-- 1. Add completed_at to activation_meetings
-- ============================================
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill: Set completed_at = updated_at for existing completed meetings
UPDATE activation_meetings
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

-- Index for performance queries
CREATE INDEX IF NOT EXISTS idx_activation_meetings_completed_at 
  ON activation_meetings(completed_at) 
  WHERE completed_at IS NOT NULL;

-- ============================================
-- 2. Create activator_weekly_performance table
-- ============================================
CREATE TABLE IF NOT EXISTS activator_weekly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Hours
  hours_worked NUMERIC(10,2) DEFAULT 0,
  
  -- Core Metrics
  attended_appointments INTEGER DEFAULT 0,
  completed_installs INTEGER DEFAULT 0,  -- first_lead_received
  
  -- Rates
  completion_rate NUMERIC(5,2),  -- completed / attended
  avg_time_to_live_hours NUMERIC(10,2),  -- attended â†’ first_lead
  pct_lead_within_72h NUMERIC(5,2),
  stalled_installs INTEGER DEFAULT 0,  -- 7+ days no first_lead
  
  -- Scoring
  expected_installs_min NUMERIC(5,2),
  expected_installs_max NUMERIC(5,2),
  score_band TEXT CHECK (score_band IN ('green', 'yellow', 'orange', 'red')),
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(activator_user_id, week_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activator_perf_user_week 
  ON activator_weekly_performance(activator_user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_activator_perf_week 
  ON activator_weekly_performance(week_start DESC);

-- Comments
COMMENT ON TABLE activator_weekly_performance IS 'Weekly performance snapshots for Activators';
COMMENT ON COLUMN activator_weekly_performance.completed_installs IS 'Count of installs where first_lead_received_at is set';
COMMENT ON COLUMN activator_weekly_performance.avg_time_to_live_hours IS 'Average hours from attended appointment to first lead received';
COMMENT ON COLUMN activator_weekly_performance.stalled_installs IS 'Installs where attended > 7 days ago but no first_lead_received_at';

-- ============================================
-- 3. Create sdr_weekly_performance table
-- ============================================
CREATE TABLE IF NOT EXISTS sdr_weekly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sdr_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  
  -- Hours
  hours_worked NUMERIC(10,2) DEFAULT 0,
  
  -- Core Metrics (Phase 1 focused)
  install_appointments_attended INTEGER DEFAULT 0,
  install_appointments_booked INTEGER DEFAULT 0,
  show_rate NUMERIC(5,2),  -- attended / booked
  conversations INTEGER DEFAULT 0,
  dials INTEGER DEFAULT 0,
  
  -- Scoring
  expected_attended_min NUMERIC(5,2),
  expected_attended_max NUMERIC(5,2),
  score_band TEXT CHECK (score_band IN ('green', 'yellow', 'orange', 'red')),
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(sdr_user_id, week_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sdr_perf_user_week 
  ON sdr_weekly_performance(sdr_user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_sdr_perf_week 
  ON sdr_weekly_performance(week_start DESC);

-- Comments
COMMENT ON TABLE sdr_weekly_performance IS 'Weekly performance snapshots for SDRs';
COMMENT ON COLUMN sdr_weekly_performance.install_appointments_attended IS 'Count of activation_meetings with status = completed';
COMMENT ON COLUMN sdr_weekly_performance.show_rate IS 'Percentage: attended / booked * 100';

-- ============================================
-- 4. Create performance_notes table
-- ============================================
CREATE TABLE IF NOT EXISTS performance_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT NOT NULL,  -- max 200 chars enforced in app
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_performance_notes_user_week 
  ON performance_notes(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_performance_notes_week 
  ON performance_notes(week_start DESC);

-- Comments
COMMENT ON TABLE performance_notes IS 'Short-term context notes for performance anomalies (not scored)';
COMMENT ON COLUMN performance_notes.note IS 'Max 200 characters - brief context only';

-- ============================================
-- 5. RLS Policies
-- ============================================

-- Activator weekly performance
ALTER TABLE activator_weekly_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activators can view their own performance"
  ON activator_weekly_performance FOR SELECT
  USING (activator_user_id = auth.uid());

CREATE POLICY "Admins can view all activator performance in their org"
  ON activator_weekly_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = activator_weekly_performance.activator_user_id
    )
  );

CREATE POLICY "Service role can manage activator performance"
  ON activator_weekly_performance FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- SDR weekly performance
ALTER TABLE sdr_weekly_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SDRs can view their own performance"
  ON sdr_weekly_performance FOR SELECT
  USING (sdr_user_id = auth.uid());

CREATE POLICY "Admins can view all SDR performance in their org"
  ON sdr_weekly_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid() 
      AND up1.role = 'admin'
      AND up2.id = sdr_weekly_performance.sdr_user_id
    )
  );

CREATE POLICY "Service role can manage SDR performance"
  ON sdr_weekly_performance FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Performance notes
ALTER TABLE performance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes for users in their org"
  ON performance_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up2.id = performance_notes.user_id
    )
  );

CREATE POLICY "Admins can create notes for users in their org"
  ON performance_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up1.role = 'admin'
      AND up2.id = performance_notes.user_id
    )
    AND author_id = auth.uid()
  );

CREATE POLICY "Admins can update notes in their org"
  ON performance_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up1
      JOIN user_profiles up2 ON up1.organization_id = up2.organization_id
      WHERE up1.id = auth.uid()
      AND up1.role = 'admin'
      AND up2.id = performance_notes.user_id
    )
  );

-- ============================================
-- 6. Triggers for updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_activator_perf_updated_at ON activator_weekly_performance;
CREATE TRIGGER update_activator_perf_updated_at
  BEFORE UPDATE ON activator_weekly_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sdr_perf_updated_at ON sdr_weekly_performance;
CREATE TRIGGER update_sdr_perf_updated_at
  BEFORE UPDATE ON sdr_weekly_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Performance Dashboards Schema Migration Complete ===';
  RAISE NOTICE 'Added completed_at to activation_meetings';
  RAISE NOTICE 'Created activator_weekly_performance table';
  RAISE NOTICE 'Created sdr_weekly_performance table';
  RAISE NOTICE 'Created performance_notes table';
  RAISE NOTICE 'Applied RLS policies and updated_at triggers';
END $$;




-- ==========================================


-- Migration: 20251222000001_phase1_metrics_integration.sql
-- Phase 1 Metrics Integration Migration
-- Adds install appointment tracking to daily and weekly summaries

-- ============================================
-- 1. Add install appointment columns to daily_sdr_summaries
-- ============================================
ALTER TABLE daily_sdr_summaries
ADD COLUMN IF NOT EXISTS install_appointments_booked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS install_appointments_attended INTEGER DEFAULT 0;

COMMENT ON COLUMN daily_sdr_summaries.install_appointments_booked IS 'Number of install appointments scheduled by this SDR on this date';
COMMENT ON COLUMN daily_sdr_summaries.install_appointments_attended IS 'Number of install appointments that were attended (status = completed) on this date';

-- ============================================
-- 2. Add install appointment columns to weekly_sdr_summaries
-- ============================================
ALTER TABLE weekly_sdr_summaries
ADD COLUMN IF NOT EXISTS install_appointments_booked INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS install_appointments_attended INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score_band TEXT DEFAULT 'none';

COMMENT ON COLUMN weekly_sdr_summaries.install_appointments_booked IS 'Total install appointments scheduled during the week';
COMMENT ON COLUMN weekly_sdr_summaries.install_appointments_attended IS 'Total install appointments attended (status = completed) during the week';
COMMENT ON COLUMN weekly_sdr_summaries.score_band IS 'Performance score band: green, yellow, orange, red, or none';

-- ============================================
-- 3. Create indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_daily_sdr_summaries_install_appts 
  ON daily_sdr_summaries(sdr_user_id, date DESC) 
  WHERE install_appointments_attended > 0;

CREATE INDEX IF NOT EXISTS idx_weekly_sdr_summaries_score_band 
  ON weekly_sdr_summaries(score_band, week_start DESC) 
  WHERE score_band != 'none';

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Phase 1 Metrics Integration Migration Complete ===';
  RAISE NOTICE 'Added to daily_sdr_summaries: install_appointments_booked, install_appointments_attended';
  RAISE NOTICE 'Added to weekly_sdr_summaries: install_appointments_booked, install_appointments_attended, score_band';
END $$;




-- ==========================================


-- Migration: 20251222100000_website_url_and_followups.sql
-- Website URL Tracking and Follow-up System Migration
-- Adds website URL capture, meeting completion tracking, and follow-up enforcement

-- ============================================
-- 1. Add calculator_installed_at to trial_pipeline (manual "installed" signal)
-- ============================================
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS calculator_installed_at TIMESTAMPTZ;

COMMENT ON COLUMN trial_pipeline.calculator_installed_at IS 'Manual "installed" signal from activator when they mark calculator as installed and verified';

-- ============================================
-- 2. Add follow-up tracking to trial_pipeline
-- ============================================
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS followup_reason TEXT,
ADD COLUMN IF NOT EXISTS last_meeting_outcome TEXT 
  CHECK (last_meeting_outcome IN ('installed', 'partial', 'couldnt_install', 'no_show'));

COMMENT ON COLUMN trial_pipeline.next_followup_at IS 'When the next follow-up meeting/callback should happen (required if meeting outcome is partial or couldnt_install)';
COMMENT ON COLUMN trial_pipeline.followup_reason IS 'Reason why follow-up is needed (e.g., waiting_web_guy, needs_wp_login)';
COMMENT ON COLUMN trial_pipeline.last_meeting_outcome IS 'Outcome of the last activation meeting';

-- ============================================
-- 3. Add website_url to activation_meetings (snapshot at meeting time)
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN activation_meetings.website_url IS 'Website URL snapshot at meeting time (auto-filled from search_results.website)';

-- ============================================
-- 4. Add install verification fields to activation_meetings
-- ============================================
ALTER TABLE activation_meetings
ADD COLUMN IF NOT EXISTS install_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS install_notes TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN activation_meetings.install_verified IS 'Activator confirmed calculator is visible and working on site';
COMMENT ON COLUMN activation_meetings.install_notes IS 'Notes from activator about the install';
COMMENT ON COLUMN activation_meetings.completed_at IS 'When the meeting was marked as completed';

-- ============================================
-- 5. Index for follow-up queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tp_followup_overdue 
ON trial_pipeline(next_followup_at) 
WHERE next_followup_at IS NOT NULL 
  AND calculator_installed_at IS NULL 
  AND marked_lost_at IS NULL;

-- ============================================
-- 6. Backfill website_url for existing meetings from search_results
-- ============================================
UPDATE activation_meetings am
SET website_url = sr.website
FROM trial_pipeline tp
JOIN search_results sr ON sr.id = tp.crm_lead_id
WHERE am.trial_pipeline_id = tp.id
  AND am.website_url IS NULL
  AND sr.website IS NOT NULL;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Website URL and Follow-up System Migration Complete ===';
  RAISE NOTICE 'Added to trial_pipeline: calculator_installed_at, next_followup_at, followup_reason, last_meeting_outcome';
  RAISE NOTICE 'Added to activation_meetings: website_url, install_verified, install_notes, completed_at';
  RAISE NOTICE 'Created index for follow-up queries';
  RAISE NOTICE 'Backfilled website_url for existing meetings';
END $$;




-- ==========================================


-- Migration: 20251222200000_add_scheduling_outcome_codes.sql
-- Add Scheduling Outcome Codes Migration
-- Adds missing outcome codes for the scheduling flow

-- ============================================
-- Add new outcome codes to call_outcome_code enum
-- ============================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
-- We need to use DO blocks with exception handling

DO $$ 
BEGIN
  -- Add ONBOARDING_SCHEDULED
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'ONBOARDING_SCHEDULED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'ONBOARDING_SCHEDULED';
  END IF;
END $$;

DO $$ 
BEGIN
  -- Add SCHEDULE_REFUSED
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'SCHEDULE_REFUSED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'SCHEDULE_REFUSED';
  END IF;
END $$;

DO $$ 
BEGIN
  -- Add DM_UNAVAILABLE
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'DM_UNAVAILABLE' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'call_outcome_code')
  ) THEN
    ALTER TYPE call_outcome_code ADD VALUE 'DM_UNAVAILABLE';
  END IF;
END $$;

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Add Scheduling Outcome Codes Migration Complete ===';
  RAISE NOTICE 'Added to call_outcome_code enum: ONBOARDING_SCHEDULED, SCHEDULE_REFUSED, DM_UNAVAILABLE';
END $$;




-- ==========================================


-- Migration: 20251222210000_allow_multiple_shifts_per_day.sql
-- Allow Multiple Shifts Per Day Migration
-- Removes the UNIQUE constraint on (user_id, day_of_week) to allow multiple shifts per day

-- ============================================
-- Remove UNIQUE constraint
-- ============================================

-- Drop the existing unique constraint
ALTER TABLE agent_schedules 
DROP CONSTRAINT IF EXISTS agent_schedules_user_id_day_of_week_key;

-- Add a new unique constraint that includes an identifier for multiple shifts
-- We'll use a composite key with (user_id, day_of_week, start_time, end_time)
-- This allows multiple shifts per day but prevents exact duplicates
ALTER TABLE agent_schedules
ADD CONSTRAINT agent_schedules_user_day_shift_unique 
UNIQUE(user_id, day_of_week, start_time, end_time);

-- ============================================
-- Migration Summary
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=== Allow Multiple Shifts Per Day Migration Complete ===';
  RAISE NOTICE 'Removed UNIQUE(user_id, day_of_week) constraint';
  RAISE NOTICE 'Added UNIQUE(user_id, day_of_week, start_time, end_time) to prevent exact duplicates';
  RAISE NOTICE 'Activators can now have multiple shifts per day (e.g., 9 PM-11:59 PM and 12 AM-5 AM)';
END $$;




-- ==========================================


-- Migration: 20251223000000_capital_governance_v1.sql
-- =============================================
-- CAPITAL GOVERNANCE V1 SCHEMA
-- =============================================
-- This migration creates the capital governance system for distribution experiments
-- with capital discipline, stable mechanics, and human judgment.

-- Note: Legacy field followup_variant exists on trial_pipeline; not migrated in V1.

-- 1.1 PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the one product
INSERT INTO products (name, active) 
VALUES ('Junk Car Calculator', true)
ON CONFLICT (name) DO NOTHING;

-- 1.2 EXTEND CAMPAIGNS (nullable fields only, non-breaking)
ALTER TABLE campaigns 
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS capital_budget_usd NUMERIC(12,2);

-- 1.3 EXPERIMENTS TABLE
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'planned' 
    CHECK (status IN ('planned', 'running', 'paused', 'completed', 'terminated')),
  start_date DATE,
  end_date DATE,
  -- TIMESTAMPS for event attribution (not just dates)
  started_at TIMESTAMPTZ,  -- When status changed to 'running'
  ended_at TIMESTAMPTZ,    -- When status changed to 'completed'/'terminated'
  capital_cap_usd NUMERIC(12,2),
  time_cap_days INTEGER,
  tranche_size_usd NUMERIC(12,2),
  primary_success_event TEXT,
  secondary_events JSONB NOT NULL DEFAULT '[]',
  bonus_rules JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_campaign_id ON experiments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_experiments_started_at ON experiments(started_at) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_experiments_ended_at ON experiments(ended_at) WHERE ended_at IS NOT NULL;

-- PARTIAL UNIQUE INDEX: Only one 'running' experiment per campaign (DB-enforced)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_experiment_per_campaign 
  ON experiments(campaign_id) 
  WHERE status = 'running';

-- 1.4 EXTEND USER_PROFILES
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS hourly_rate_usd NUMERIC(8,2);

-- 1.5 TIME_LOGS TABLE
CREATE TABLE IF NOT EXISTS time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours_logged NUMERIC(4,2) NOT NULL CHECK (hours_logged >= 0 AND hours_logged <= 24),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_member_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_time_logs_campaign_date ON time_logs(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_time_logs_team_member ON time_logs(team_member_id);

-- 2.1 PERFORMANCE_EVENTS TABLE
-- Note: lead_id references search_results (the actual leads table)
CREATE TABLE IF NOT EXISTS performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dial_attempt', 'conversation', 'qpc', 'install_scheduled',
    'install_attended', 'calculator_installed', 'paid_conversion'
  )),
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_perf_events_experiment ON performance_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_perf_events_campaign_type ON performance_events(campaign_id, event_type);
CREATE INDEX IF NOT EXISTS idx_perf_events_timestamp ON performance_events(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_perf_events_lead ON performance_events(lead_id) WHERE lead_id IS NOT NULL;

-- 2.3 BONUS_EVENTS TABLE
CREATE TABLE IF NOT EXISTS bonus_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  performance_event_id UUID REFERENCES performance_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  bonus_amount_usd NUMERIC(8,2) NOT NULL CHECK (bonus_amount_usd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bonus_events_experiment ON bonus_events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_bonus_events_team_member ON bonus_events(team_member_id);
-- Ensure one bonus per performance event
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_events_perf_event ON bonus_events(performance_event_id) 
  WHERE performance_event_id IS NOT NULL;

-- 2.6 COST_ROLLUPS TABLE (append-only)
-- V1: Roll labor costs at campaign level only (experiment attribution derived later)
CREATE TABLE IF NOT EXISTS cost_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('labor', 'bonus', 'twilio', 'gcp')),
  cost_usd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent updates (append-only)
CREATE OR REPLACE FUNCTION prevent_cost_rollup_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'cost_rollups table is append-only. Updates not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cost_rollups_no_update ON cost_rollups;
CREATE TRIGGER cost_rollups_no_update
  BEFORE UPDATE ON cost_rollups
  FOR EACH ROW
  EXECUTE FUNCTION prevent_cost_rollup_update();

CREATE INDEX IF NOT EXISTS idx_cost_rollups_campaign_date ON cost_rollups(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_cost_rollups_experiment ON cost_rollups(experiment_id) WHERE experiment_id IS NOT NULL;

-- 3.1 EVALUATIONS TABLE (immutable)
CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'fail', 'continue', 'stop')),
  reason TEXT CHECK (reason IN (
    'pitch_channel', 'activation_process', 'economics', 'capital_time', 'inconclusive'
  )),
  recommended_next_action TEXT CHECK (recommended_next_action IN (
    'continue_experiment', 'extend_budget', 'start_new_experiment',
    'graduate_campaign', 'kill_campaign'
  )),
  admin_notes TEXT,
  capital_spent_usd NUMERIC(12,2),
  tranches_consumed INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent updates (immutable)
CREATE OR REPLACE FUNCTION prevent_evaluation_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'evaluations table is immutable. Updates not allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS evaluations_no_update ON evaluations;
CREATE TRIGGER evaluations_no_update
  BEFORE UPDATE ON evaluations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_evaluation_update();

CREATE INDEX IF NOT EXISTS idx_evaluations_experiment ON evaluations(experiment_id);

-- 3.2 OVERRIDE_LOGS TABLE (stub)
CREATE TABLE IF NOT EXISTS override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES evaluations(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id),
  rationale TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.3 NOTIFICATION_LOGS TABLE (stub)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  recipient_user_id UUID REFERENCES auth.users(id),
  payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS POLICIES (V1: Admin-only access for governance tables - simplest approach)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE override_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Products: everyone can read, admins can write
DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select" ON products FOR SELECT USING (true);

DROP POLICY IF EXISTS "products_admin_insert" ON products;
CREATE POLICY "products_admin_insert" ON products FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "products_admin_update" ON products;
CREATE POLICY "products_admin_update" ON products FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Experiments: admins only (all operations)
DROP POLICY IF EXISTS "experiments_admin_all" ON experiments;
CREATE POLICY "experiments_admin_all" ON experiments FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Time logs: admins only
DROP POLICY IF EXISTS "time_logs_admin_all" ON time_logs;
CREATE POLICY "time_logs_admin_all" ON time_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Performance events: admins can write, service role can write (for system events)
DROP POLICY IF EXISTS "perf_events_admin_all" ON performance_events;
CREATE POLICY "perf_events_admin_all" ON performance_events FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Bonus events: admins only
DROP POLICY IF EXISTS "bonus_events_admin_all" ON bonus_events;
CREATE POLICY "bonus_events_admin_all" ON bonus_events FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Cost rollups: admins can read, system can write (via service role)
DROP POLICY IF EXISTS "cost_rollups_admin_select" ON cost_rollups;
CREATE POLICY "cost_rollups_admin_select" ON cost_rollups FOR SELECT 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Evaluations: admins only
DROP POLICY IF EXISTS "evaluations_admin_all" ON evaluations;
CREATE POLICY "evaluations_admin_all" ON evaluations FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Override logs: admins only
DROP POLICY IF EXISTS "override_logs_admin_all" ON override_logs;
CREATE POLICY "override_logs_admin_all" ON override_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Notification logs: admins only
DROP POLICY IF EXISTS "notification_logs_admin_all" ON notification_logs;
CREATE POLICY "notification_logs_admin_all" ON notification_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Helper function: Get running experiment for a campaign at a specific timestamp
-- Used for event attribution
CREATE OR REPLACE FUNCTION get_running_experiment_at_timestamp(
  p_campaign_id UUID,
  p_timestamp TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
  v_experiment_id UUID;
BEGIN
  SELECT id INTO v_experiment_id
  FROM experiments
  WHERE campaign_id = p_campaign_id
    AND status = 'running'
    AND started_at IS NOT NULL
    AND (ended_at IS NULL OR ended_at > p_timestamp)
    AND started_at <= p_timestamp
  ORDER BY started_at DESC
  LIMIT 1;
  
  RETURN v_experiment_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_running_experiment_at_timestamp IS 
  'Returns the experiment_id that was running for a campaign at a specific timestamp. Used for event attribution.';

-- Trigger to update updated_at on experiments
CREATE OR REPLACE FUNCTION update_experiments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments;
CREATE TRIGGER update_experiments_updated_at
  BEFORE UPDATE ON experiments
  FOR EACH ROW
  EXECUTE FUNCTION update_experiments_updated_at();

-- Trigger to update updated_at on time_logs
CREATE OR REPLACE FUNCTION update_time_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_time_logs_updated_at ON time_logs;
CREATE TRIGGER update_time_logs_updated_at
  BEFORE UPDATE ON time_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_time_logs_updated_at();

-- Comments for documentation
COMMENT ON TABLE products IS 'Products that campaigns are associated with. V1: Minimal container.';
COMMENT ON TABLE experiments IS 'Experiments define conversion hypotheses and capital rules. Only one running per campaign.';
COMMENT ON TABLE performance_events IS 'Canonical performance events (facts only). Attributed to running experiment at event_timestamp.';
COMMENT ON TABLE time_logs IS 'Time logged by team members for campaigns. One entry per (team_member, campaign, date).';
COMMENT ON TABLE bonus_events IS 'Bonuses awarded for qualifying events. Only while experiment is running.';
COMMENT ON TABLE cost_rollups IS 'Daily cost rollups by source. Append-only. V1: Labor costs rolled at campaign level.';
COMMENT ON TABLE evaluations IS 'Human judgment on experiments. Immutable after creation.';
COMMENT ON TABLE override_logs IS 'Log of admin overrides tied to evaluations. Stub in V1.';
COMMENT ON TABLE notification_logs IS 'Log of notifications sent. Stub in V1.';

COMMENT ON COLUMN experiments.started_at IS 'Timestamp when experiment status changed to running. Used for event attribution.';
COMMENT ON COLUMN experiments.ended_at IS 'Timestamp when experiment status changed to completed/terminated. Used for event attribution.';
COMMENT ON COLUMN performance_events.experiment_id IS 'Attributed to running experiment at event_timestamp. Null if no experiment was running.';
COMMENT ON COLUMN performance_events.lead_id IS 'References search_results table (the actual leads table).';




-- ==========================================


-- Migration: 20251226000000_activator_modal_and_state_machine.sql
-- Activator Modal and State Machine Migration
-- Implements: state machine, counters, enums, reconciliation fields

-- ============================================
-- 1. Create ENUMs for activation modal
-- ============================================

-- Proof method for installed outcomes
DO $$ BEGIN
  CREATE TYPE proof_method_type AS ENUM ('credits_decremented', 'test_lead_confirmed', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Block reason enum
DO $$ BEGIN
  CREATE TYPE block_reason_type AS ENUM (
    'no_website_login',
    'web_person_absent', 
    'permission_needed',
    'technical_issue',
    'dns_hosting_missing',
    'client_confusion',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Block owner enum
DO $$ BEGIN
  CREATE TYPE block_owner_type AS ENUM ('client_owner', 'client_web_person', 'our_team', 'mixed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Next step enum
DO $$ BEGIN
  CREATE TYPE next_step_type AS ENUM (
    'get_credentials',
    'invite_web_person',
    'troubleshooting',
    'send_instructions',
    'schedule_second_attempt',
    'waiting_approval',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Reschedule reason enum
DO $$ BEGIN
  CREATE TYPE reschedule_reason_type AS ENUM (
    'client_requested',
    'web_person_unavailable',
    'credentials_not_ready',
    'activator_conflict',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Cancel reason enum
DO $$ BEGIN
  CREATE TYPE cancel_reason_type AS ENUM ('client_unavailable', 'website_not_ready', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Canceled by enum
DO $$ BEGIN
  CREATE TYPE canceled_by_type AS ENUM ('client', 'us');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Kill reason enum (extended)
DO $$ BEGIN
  CREATE TYPE activation_kill_reason_extended AS ENUM (
    'no_website',
    'not_buying_junk_cars',
    'pricing_objection',
    'not_decision_maker',
    'competitor',
    'ghosted',
    'repeated_no_show',
    'stalled_install',
    'excessive_reschedules',
    'no_access',
    'no_response',
    'no_technical_owner',
    'no_urgency',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Follow-up owner role enum
DO $$ BEGIN
  CREATE TYPE followup_owner_role AS ENUM ('sdr', 'activator');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. Extend activation_meetings table
-- ============================================

-- Add new fields to activation_meetings
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS proof_method proof_method_type,
ADD COLUMN IF NOT EXISTS lead_delivery_methods text[],
ADD COLUMN IF NOT EXISTS primary_recipient text,
ADD COLUMN IF NOT EXISTS client_confirmed_receipt boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS block_reason block_reason_type,
ADD COLUMN IF NOT EXISTS block_owner block_owner_type,
ADD COLUMN IF NOT EXISTS next_step next_step_type,
ADD COLUMN IF NOT EXISTS reschedule_reason reschedule_reason_type,
ADD COLUMN IF NOT EXISTS cancel_reason cancel_reason_type,
ADD COLUMN IF NOT EXISTS canceled_by canceled_by_type,
ADD COLUMN IF NOT EXISTS kill_reason text,
ADD COLUMN IF NOT EXISTS contact_attempted text[],
ADD COLUMN IF NOT EXISTS web_person_invited boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS attempt_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_meeting_id uuid REFERENCES activation_meetings(id),
ADD COLUMN IF NOT EXISTS outcome_notes text;

-- Add completed_by_user_id if not exists
ALTER TABLE activation_meetings 
ADD COLUMN IF NOT EXISTS completed_by_user_id uuid REFERENCES user_profiles(id);

-- ============================================
-- 3. Extend trial_pipeline table
-- ============================================

-- Convert activation_status to text if it's still an enum
ALTER TABLE trial_pipeline 
ALTER COLUMN activation_status TYPE text 
USING activation_status::text;

-- Add state machine counters and fields
ALTER TABLE trial_pipeline
ADD COLUMN IF NOT EXISTS no_show_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS reschedule_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS block_reason text,
ADD COLUMN IF NOT EXISTS block_owner text,
ADD COLUMN IF NOT EXISTS next_step text,
ADD COLUMN IF NOT EXISTS followup_owner_role text,
ADD COLUMN IF NOT EXISTS next_followup_at timestamptz,
ADD COLUMN IF NOT EXISTS followup_reason text,
ADD COLUMN IF NOT EXISTS last_meeting_outcome text,
ADD COLUMN IF NOT EXISTS credits_remaining integer DEFAULT 20;

-- ============================================
-- 4. Create indexes for queue queries
-- ============================================

-- SDR Queue index: followup_owner_role = 'sdr', overdue follow-ups
CREATE INDEX IF NOT EXISTS idx_trial_pipeline_sdr_queue 
ON trial_pipeline(followup_owner_role, activation_status, next_followup_at)
WHERE followup_owner_role = 'sdr' AND credits_remaining = 20;

-- Activator Queue index: followup_owner_role = 'activator', blocked installs
CREATE INDEX IF NOT EXISTS idx_trial_pipeline_activator_queue 
ON trial_pipeline(followup_owner_role, activation_status, next_followup_at)
WHERE followup_owner_role = 'activator' AND credits_remaining = 20;

-- Install marked but not proven (credits still 20 after completion)
CREATE INDEX IF NOT EXISTS idx_activation_meetings_unproven 
ON activation_meetings(completed_at, status)
WHERE status = 'completed';

-- ============================================
-- 5. Comments for documentation
-- ============================================

COMMENT ON COLUMN trial_pipeline.activation_status IS 
'State machine: queued, blocked, no_show, active (terminal), killed (terminal)';

COMMENT ON COLUMN trial_pipeline.no_show_count IS 
'Count of no-shows. Auto-kill at >= 2';

COMMENT ON COLUMN trial_pipeline.reschedule_count IS 
'Count of reschedules. Auto-kill at >= 3';

COMMENT ON COLUMN trial_pipeline.followup_owner_role IS 
'Who owns follow-up: sdr (no-shows/cancels) or activator (blocked)';

COMMENT ON COLUMN activation_meetings.attempt_number IS 
'Which install attempt this is. Increments on new meetings for same pipeline';

COMMENT ON COLUMN activation_meetings.parent_meeting_id IS 
'Link to previous meeting if this is a reschedule/second attempt';

-- ============================================
-- 6. Migration summary
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '=== Activator Modal + State Machine Migration Complete ===';
  RAISE NOTICE 'Created enums: proof_method, block_reason, block_owner, next_step, etc.';
  RAISE NOTICE 'Extended activation_meetings with modal fields';
  RAISE NOTICE 'Extended trial_pipeline with state machine counters';
  RAISE NOTICE 'Created indexes for queue queries';
END $$;




-- ==========================================


-- Migration: 20251226100000_campaign_bonus_rules.sql
-- =============================================
-- CAMPAIGN BONUS RULES MIGRATION
-- =============================================

-- 1. Add bonus_rules column to campaigns table
ALTER TABLE campaigns 
  ADD COLUMN IF NOT EXISTS bonus_rules JSONB DEFAULT '[]';

COMMENT ON COLUMN campaigns.bonus_rules IS 'Array of bonus rules: [{trigger, sdr_amount, activator_amount}]';

-- 2. Allow bonus_events without experiment (for campaign-level bonuses)
ALTER TABLE bonus_events 
  ALTER COLUMN experiment_id DROP NOT NULL;

-- 3. Add campaign_id to bonus_events for direct campaign bonuses
ALTER TABLE bonus_events
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- 4. Add jcc_user_id to bonus_events to prevent duplicate bonuses
ALTER TABLE bonus_events
  ADD COLUMN IF NOT EXISTS jcc_user_id TEXT;

-- 5. Create unique index to prevent duplicate proven_install bonuses per JCC user
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_events_jcc_user_type 
  ON bonus_events(jcc_user_id, team_member_id, event_type) 
  WHERE jcc_user_id IS NOT NULL;



-- ==========================================


-- Migration: 20251226200000_protect_install_recordings.sql
-- Add recording protection column to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS recording_protected_until TIMESTAMPTZ;

-- Index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_calls_recording_protected 
ON calls(recording_protected_until) 
WHERE recording_protected_until IS NOT NULL;

COMMENT ON COLUMN calls.recording_protected_until IS 
  'Recordings protected from cleanup until this date (90 days for install calls)';



-- ==========================================


-- Migration: 20251226210000_weekly_install_goals.sql
-- Add new goal columns to campaign_goals
ALTER TABLE campaign_goals 
ADD COLUMN IF NOT EXISTS weekly_proven_installs_goal INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS weekly_sdr_hours_goal NUMERIC(6,2) DEFAULT 40;

COMMENT ON COLUMN campaign_goals.weekly_proven_installs_goal IS 
  'Target proven installs (credits < 20) per week';
COMMENT ON COLUMN campaign_goals.weekly_sdr_hours_goal IS 
  'Target SDR hours per week for this campaign';



-- ==========================================


-- Migration: 20251226220000_simplified_goals.sql
-- Simplified SDR Goals Migration
-- Remove old goal columns and add rate-based goals (per 40 hours worked)

-- Drop old columns that are no longer needed
ALTER TABLE campaign_goals 
  DROP COLUMN IF EXISTS weekly_dials_goal,
  DROP COLUMN IF EXISTS weekly_trials_goal,
  DROP COLUMN IF EXISTS target_dials_per_hour,
  DROP COLUMN IF EXISTS target_trials_per_hour,
  DROP COLUMN IF EXISTS target_cta_attempts_per_hour,
  DROP COLUMN IF EXISTS target_cta_acceptances_per_hour,
  DROP COLUMN IF EXISTS min_conversation_rate_pct,
  DROP COLUMN IF EXISTS min_trials_per_conversation_pct;

-- Add rate-based goal columns (per 40 hours worked)
ALTER TABLE campaign_goals 
  ADD COLUMN IF NOT EXISTS proven_installs_per_40h INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS scheduled_appts_per_40h INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS conversations_per_40h INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS target_weekly_hours INTEGER DEFAULT 40;

-- Update comments
COMMENT ON COLUMN campaign_goals.proven_installs_per_40h IS 'Target proven installs (credits < 20) per 40 hours worked';
COMMENT ON COLUMN campaign_goals.scheduled_appts_per_40h IS 'Target scheduled install appointments per 40 hours worked';
COMMENT ON COLUMN campaign_goals.conversations_per_40h IS 'Target conversations per 40 hours worked';
COMMENT ON COLUMN campaign_goals.target_weekly_hours IS 'Baseline hours for rate calculations (default 40)';



-- ==========================================


-- Migration: 20251227000000_revenue_events.sql
-- =============================================
-- REVENUE EVENTS TABLE
-- =============================================
-- Track revenue from paid conversions for budget burn tracking
-- Mirrors cost_rollups structure but for revenue

-- Revenue events table (mirrors cost_rollups structure)
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES search_results(id) ON DELETE SET NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'paid_subscription',
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_events_campaign ON revenue_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_revenue_events_created ON revenue_events(created_at);

-- RLS
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revenue_events_admin_select" ON revenue_events;
CREATE POLICY "revenue_events_admin_select" ON revenue_events FOR SELECT 
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE revenue_events IS 'Revenue from paid conversions. amount_usd = MRR from subscription.';



-- ==========================================

