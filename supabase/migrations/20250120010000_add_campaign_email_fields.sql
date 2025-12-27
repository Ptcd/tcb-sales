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


