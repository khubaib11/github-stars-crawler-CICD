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

// 🔹 Generate 10 partitions for 10–100000+ stars
function generatePartitions() {
  const partitions = [];
  let lower = 10;
  let step = Math.floor((100000 - lower) / 10); // 10 partitions

  for (let i = 0; i < 10; i++) {
    const upper = lower + step;
    partitions.push(`stars:${lower}..${upper}`);
    lower = upper + 1;
  }
  partitions.push("stars:>100000"); // final partition
  return partitions;
}

// 🔹 GraphQL query builder
function buildQuery(starQuery, cursor = null) {
  return {
    query: `
      query ($queryString: String!, $after: String) {
        search(query: $queryString, type: REPOSITORY, first: 100, after: $after) {
          repositoryCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            ... on Repository {
              id
              nameWithOwner
              url
              stargazerCount
            }
          }
        }
      }
    `,
    variables: {
      queryString: starQuery,
      after: cursor,
    },
  };
}

// 🔹 Crawl a single partition
async function crawlPartition(query, maxRepos = 1000) {
  let cursor = null;
  let totalFetched = 0;

  do {
    const body = buildQuery(query, cursor);
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "github-graphql-crawler",
        Authorization: `bearer ${process.env.GITHUB_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data.data || !data.data.search) {
      console.error("⚠️ GitHub API Error:", data);
      break;
    }

    const nodes = data.data.search.nodes;

    for (const repo of nodes) {
      await client.query(
        `INSERT INTO repos (github_id, full_name, html_url, stars, crawled_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (github_id) DO UPDATE SET
           stars = EXCLUDED.stars,
           crawled_at = NOW(),
           html_url = EXCLUDED.html_url`,
        [repo.id, repo.nameWithOwner, repo.url, repo.stargazerCount]
      );
      totalFetched++;
      if (totalFetched >= maxRepos) break;
    }

    cursor = data.data.search.pageInfo.endCursor;
    const hasNextPage = data.data.search.pageInfo.hasNextPage;

    console.log(`✅ Fetched ${totalFetched} repos for partition: ${query}`);

    if (!hasNextPage || totalFetched >= maxRepos) break;

    await new Promise((r) => setTimeout(r, 2000)); // rate limit delay
  } while (true);

  console.log(`✅ Finished partition: ${query}, total fetched: ${totalFetched}`);
}

// 🔹 Export to CSV
async function exportToCSV() {
  const { rows } = await client.query(
    "SELECT github_id, full_name, html_url, stars, crawled_at FROM repos ORDER BY stars DESC"
  );
  const header = "github_id,full_name,html_url,stars,crawled_at\n";
  const data = rows
    .map((r) =>
      [r.github_id, r.full_name, r.html_url, r.stars, r.crawled_at.toISOString()].join(",")
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
