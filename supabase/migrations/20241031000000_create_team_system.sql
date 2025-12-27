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

