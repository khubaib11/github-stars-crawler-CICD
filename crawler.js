// crawler.js
import pg from "pg";
import fetch from "node-fetch";

const client = new pg.Client({
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.POSTGRES_DB || "postgres",
});

async function main() {
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("❌ Missing GITHUB_TOKEN");
  }

  const headers = { Authorization: `token ${token}` };
  const query = "stars:>50000";
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=10`;

  const res = await fetch(url, { headers });
  const data = await res.json();

  console.log(`✅ Fetched ${data.items.length} repositories`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS repos (
      github_id BIGINT PRIMARY KEY,
      full_name TEXT,
      html_url TEXT,
      stars INTEGER,
      crawled_at TIMESTAMP DEFAULT NOW()
    )
  `);

  for (const repo of data.items) {
    await client.query(
      `INSERT INTO repos (github_id, full_name, html_url, stars)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (github_id) DO UPDATE SET
       stars = EXCLUDED.stars, crawled_at = NOW()`,
      [repo.id, repo.full_name, repo.html_url, repo.stargazers_count]
    );
  }

  console.log("✅ Saved repositories to database");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Error in crawler:", err);
  process.exit(1);
});
