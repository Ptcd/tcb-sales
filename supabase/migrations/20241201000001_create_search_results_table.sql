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
