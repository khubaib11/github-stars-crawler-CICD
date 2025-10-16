CREATE TABLE IF NOT EXISTS repos (
  github_id TEXT PRIMARY KEY,       -- GitHub unique ID
  full_name TEXT NOT NULL,          -- owner/repo
  html_url TEXT NOT NULL,           -- repository link
  stars INTEGER NOT NULL,           -- star count
  crawled_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
