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

