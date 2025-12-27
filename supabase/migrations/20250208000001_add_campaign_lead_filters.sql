-- Add lead_filters JSONB column to campaigns table
-- This stores filter criteria for leads that can be added to the campaign

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS lead_filters JSONB DEFAULT '{}'::jsonb;

-- Add index for filtering queries
CREATE INDEX IF NOT EXISTS idx_campaigns_lead_filters ON campaigns USING GIN (lead_filters);

-- Add comment explaining the structure
COMMENT ON COLUMN campaigns.lead_filters IS 'JSONB object with lead quality filters: {require_website: boolean, require_phone: boolean, require_email: boolean, min_rating: number (0-5), min_reviews: number}';

