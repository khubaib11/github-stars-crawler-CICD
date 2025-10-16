import pg from "pg";
import fetch from "node-fetch";

const { Client } = pg;

const client = new Client({
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.POSTGRES_DB || "postgres",
});

async function crawlPartition(query, limit = 10) {
  const repos = [];

  console.log(`🔍 Fetching repositories for: ${query}`);
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    query
  )}&sort=stars&order=desc&per_page=${limit}`;

  const headers = {
    "User-Agent": "github-stars-crawler",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });
  const data = await res.json();

  if (!data.items) {
    console.error("⚠️ GitHub API Error:", data);
    return [];
  }

  for (const repo of data.items) {
    repos.push({
      id: repo.id.toString(),
      full_name: repo.full_name,
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
    });
  }

  console.log(`✅ Fetched ${repos.length} repositories`);
  return repos;
}

async function main() {
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  // Example partition (for demo)
  const partitions = ["stars:>50000"];
  for (const p of partitions) {
    const repos = await crawlPartition(p, 10);

    for (const repo of repos) {
      await client.query(
        `INSERT INTO repos (github_id, full_name, html_url, stars, crawled_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (github_id) DO UPDATE SET
         stars = EXCLUDED.stars,
         crawled_at = NOW(),
         html_url = EXCLUDED.html_url`,
        [repo.id, repo.full_name, repo.html_url, repo.stargazers_count]
      );

      await client.query(
        `INSERT INTO repo_stars_history (github_id, recorded_at, stars)
         VALUES ($1, CURRENT_DATE, $2)
         ON CONFLICT (github_id, recorded_at) DO NOTHING`,
        [repo.id, repo.stargazers_count]
      );
    }
  }

  console.log("✅ Crawling complete.");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Error in crawler:", err);
  process.exit(1);
});
