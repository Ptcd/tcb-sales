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
