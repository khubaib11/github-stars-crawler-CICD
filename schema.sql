
-- schema.sql (minimal)
CREATE TABLE IF NOT EXISTS repos (
  github_id TEXT PRIMARY KEY,      -- GraphQL node id (string)
  full_name TEXT NOT NULL,         -- owner/name
  stars INTEGER NOT NULL,
  crawled_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repo_stars_history (
  github_id TEXT NOT NULL REFERENCES repos(github_id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL,
  stars INTEGER NOT NULL,
  PRIMARY KEY (github_id, recorded_at)
);
