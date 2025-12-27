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

