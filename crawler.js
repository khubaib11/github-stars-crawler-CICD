// crawler.js (minimal: only id, full_name, stars)
const { Client } = require('pg');
const fetch = global.fetch || require('node-fetch');

const GITHUB_API = 'https://api.github.com/graphql';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) { console.error('Missing GITHUB_TOKEN'); process.exit(1); }

const pg = new Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'postgres'
});

const QUERY = `
query ($q: String!, $first: Int!, $after: String) {
  search(query: $q, type: REPOSITORY, first: $first, after: $after) {
    pageInfo { endCursor hasNextPage }
    nodes { 
      ... on Repository {
        id
        name
        owner { login }
        stargazerCount
      }
    }
  }
  rateLimit { remaining resetAt }
}
`;

async function graphql(q, vars) {
  for (let attempt=1; attempt<=6; attempt++) {
    const res = await fetch(GITHUB_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: vars })
    });
    if (res.status === 200) return res.json();
    // simple backoff for transient errors
    const wait = Math.min(2**attempt, 30) + Math.random();
    console.warn(`GraphQL HTTP ${res.status} — retrying in ${wait}s (attempt ${attempt})`);
    await new Promise(r => setTimeout(r, wait*1000));
  }
  throw new Error('GraphQL failed after retries');
}

async function upsertRows(rows) {
  if (!rows.length) return;
  const client = pg;
  const insertText = `
    INSERT INTO repos (github_id, full_name, stars, crawled_at)
    VALUES ($1,$2,$3,now())
    ON CONFLICT (github_id) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          stars = EXCLUDED.stars,
          crawled_at = now();
  `;
  for (const r of rows) {
    await client.query(insertText, [r.id, r.full_name, r.stars]);
    await client.query(
      `INSERT INTO repo_stars_history (github_id, recorded_at, stars)
       VALUES ($1, CURRENT_DATE, $2)
       ON CONFLICT (github_id, recorded_at) DO UPDATE SET stars = EXCLUDED.stars;`,
      [r.id, r.stars]
    );
  }
}

function makeQueryString(partition) {
  // partition is a string like "created:2020-01-01..2020-01-07" or "stars:>1000"
  // For simple demo, pass partition = 'stars:>50000' or similar.
  return `${partition}`;
}

async function crawlPartition(partition, maxToFetch=1000) {
  let after = null;
  let fetched = 0;
  const pageSize = 100; // GraphQL max per page commonly 100
  while (true) {
    const qstring = makeQueryString(partition);
    const vars = { q: qstring, first: pageSize, after };
    const data = await graphql(qstring, vars);
    if (data.errors) { console.error('GraphQL errors', data.errors); break; }
    const nodes = data.data.search.nodes || [];
    const rows = nodes.map(n => ({ id: n.id, full_name: `${n.owner.login}/${n.name}`, stars: n.stargazerCount }));
    await upsertRows(rows);
    fetched += rows.length;
    console.log(`Partition ${partition} fetched so far: ${fetched}`);
    const pageInfo = data.data.search.pageInfo;
    if (!pageInfo.hasNextPage || fetched >= maxToFetch) break;
    after = pageInfo.endCursor;
    // check rateLimit if available
    const rl = data.data.rateLimit;
    if (rl && rl.remaining && rl.remaining < 20) {
      // wait till reset
      const resetAt = new Date(rl.resetAt).getTime();
      const now = Date.now();
      const waitMs = Math.max(0, resetAt - now) + 5000;
      console.log(`Rate limit low (${rl.remaining}), sleeping ${Math.round(waitMs/1000)}s`);
      await new Promise(r => setTimeout(r, waitMs));
    } else {
      await new Promise(r => setTimeout(r, 200)); // small polite pause
    }
  }
}

async function main() {
  await pg.connect();
  const schema = require('fs').readFileSync('schema.sql','utf8');
  await pg.query(schema);

 const partitions = [
  'stars:>50000',
  'stars:10000..50000',
  'stars:5000..9999',
  'stars:1000..4999',
  'stars:500..999',
  'stars:100..499'
];

for (const p of partitions) {
  console.log(`\n🚀 Starting partition: ${p}`);
  await crawlPartition(p, 17000);
}

  await pg.end();
  console.log('Crawl finished.');
}

main().catch(err => { console.error(err); process.exit(1); });
