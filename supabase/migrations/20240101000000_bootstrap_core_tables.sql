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
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    DROP POLICY IF EXISTS "Users can view profiles in their organization" ON user_profiles;
    DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
  END IF;
END $$;

CREATE POLICY "Users can view profiles in their organization"
ON user_profiles FOR SELECT
TO public
USING (
  organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
  OR id = auth.uid()
);

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


