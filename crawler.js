import pg from "pg";
import fetch from "node-fetch";
import fs from "fs";

const { Client } = pg;

const client = new Client({
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  database: process.env.POSTGRES_DB || "postgres",
});

// 🔹 Generate ~100 partitions for 0–100000+ stars
function generatePartitions() {
  const partitions = [];
  let lower = 10;
  let step = Math.floor((100000 - lower) / 100); // ~999 per partition

  for (let i = 0; i < 99; i++) {
    const upper = lower + step;
    partitions.push(`stars:${lower}..${upper}`);
    lower = upper + 1;
  }
  partitions.push("stars:>100000"); // final partition
  return partitions;
}

async function crawlPartition(query, total = 1000) {
  const perPage = 100;
  const pages = Math.ceil(total / perPage);

  for (let page = 1; page <= pages; page++) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
      query
    )}&sort=stars&order=desc&per_page=${perPage}&page=${page}`;

    const headers = { "User-Agent": "github-stars-crawler" };
    if (process.env.GITHUB_TOKEN)
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;

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
    await new Promise((r) => setTimeout(r, 2000)); // avoid rate limit
  }

  console.log(`✅ Finished partition: ${query}`);
}

// 🔹 Export data to CSV file
async function exportToCSV() {
  const { rows } = await client.query(
    "SELECT github_id, full_name, html_url, stars, crawled_at FROM repos ORDER BY stars DESC"
  );
  const header = "github_id,full_name,html_url,stars,crawled_at\n";
  const data = rows
    .map((r) =>
      [
        r.github_id,
        r.full_name,
        r.html_url,
        r.stars,
        r.crawled_at.toISOString(),
      ].join(",")
    )
    .join("\n");

  fs.writeFileSync("repos.csv", header + data);
  console.log(`💾 Exported ${rows.length} rows to repos.csv`);
}

// 🔹 Main workflow
async function main() {
  await client.connect();
  console.log("✅ Connected to PostgreSQL");

  const partitions = generatePartitions();
  console.log(`🧩 Total partitions: ${partitions.length}`);

  for (const [i, p] of partitions.entries()) {
    console.log(`🚀 Crawling partition ${i + 1}/${partitions.length}: ${p}`);
    await crawlPartition(p, 1000);
  }

  await exportToCSV();
  console.log("✅ All partitions crawled and saved.");
  await client.end();
}

main().catch((err) => {
  console.error("❌ Error in crawler:", err);
  process.exit(1);
});
