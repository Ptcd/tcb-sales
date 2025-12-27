-- Add contact_name column to search_results for storing the contact person's name
ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS contact_name TEXT;

COMMENT ON COLUMN search_results.contact_name IS 'Name of the contact person at the business (e.g., "Joe Smith")';

-- Create index for searching by contact name
CREATE INDEX IF NOT EXISTS idx_search_results_contact_name 
  ON search_results(contact_name) WHERE contact_name IS NOT NULL;



