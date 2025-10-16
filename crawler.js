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

async function crawlPartition(query, total = 1000) {
  const repos = [];
  const perPage = 100;
  const pages = Math.ceil(total / perPage);

  for (let page = 1; page <= pages; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      query
    )}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;

    const headers = { "User-Agent": "github-stars-crawler" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;

    const res = await fetch(url, { headers });
    const data = await res.json();

    if (!data.items) {
      console.error("⚠️ GitHub API Error:", data);
      break;
    }

    for (const repo of data.items) {
      await client.query(
        `INSERT INTO repos (github_id, full_name, html_url, stars, crawled_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (github_id) DO UPDATE SET
         stars = EXCLUDED.stars,
         crawled_at = NOW(),
         html_url = EXCLUDED.html_url`,
        [repo.id.toString(), repo.full_name, repo.html_url, repo.stargazers_count]
      );
    }

    console.log(`✅ Page ${page}/${pages} done for query: ${query}`);
    await new Promise((r) => setTimeout(r, 2000)); // delay to avoid rate limit
  }

  console.log(`✅ Finished partition: ${query}`);
}

async function main() {
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  const partitions = [
    "stars:>50000",
    "stars:10000..50000",
    "stars:5000..9999",
    "stars:1000..4999",
    "stars:500..999",
    "stars:100..499",
    "stars:50..99",
    "stars:10..49",
  ];

  for (const p of partitions) {
    await crawlPartition(p, 1000);
  }

  console.log("✅ All partitions crawled.");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Error in crawler:", err);
  process.exit(1);
});
