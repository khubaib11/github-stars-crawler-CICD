
# GitHub Stars Crawler (GraphQL Version)

This project crawls GitHub repositories using the **GraphQL API** to collect star counts and stores the data in PostgreSQL. It also generates a CSV file of crawled repositories.

---

## Features Implemented ✅

- **Repository crawling:**  
  `crawler.js` fetches repositories from GitHub GraphQL API based on **10 star count partitions**.

- **PostgreSQL storage:**  
  - Stores repository information in the `repos` table:
    - `github_id` (primary key)  
    - `full_name`  
    - `html_url`  
    - `stars`  
    - `crawled_at` timestamp  
  - Removes previous data before inserting new results.  
  - Handles duplicates using `ON CONFLICT DO UPDATE`.

- **CSV export:**  
  - After crawling, `repos.csv` is generated with all repository data.  
  - CSV can be uploaded as an artifact in GitHub Actions.

- **GitHub Actions integration:**  
  - Workflow (`crawl.yml`) runs the crawler on **push to main** only.  
  - Safely commits updated CSV to the repository without causing infinite loops.  
  - Uploads a backup artifact for each run.

---

## Limitations / Not Accomplished ❌

- **Does not fetch 100k+ repositories yet:**  
  - Due to GitHub API and rate limits, each partition fetches up to 1,000 repositories.  
  - With 10 partitions × 1,000 per partition, the database currently contains ~10k to 15k repositories.  

---

## How It Works

1. **Partitioned crawling:**  
   - The crawler fetches repositories in **10 star count partitions**.  
   - Each partition fetches repositories with `first=100` per GraphQL page, up to a max of 1,000 per partition.

2. **GraphQL API:**  
   - Uses GitHub GraphQL API with pagination cursors.  
   - Can be extended to fetch nested metadata in future updates.

3. **Data storage:**  
   - Previous data is cleared before inserting new results.  
   - Duplicate GitHub IDs update existing records with the latest star count.

4. **CSV generation:**  
   - After crawling, `repos.csv` is generated with all repositories.  
   - CSV is committed back to the repo and uploaded as an artifact.

5. **Workflow safety:**  
   - Commits only happen if the crawler changes the CSV.  
   - Workflow ignores `repos.csv` pushes to prevent infinite loops.

---

## Schema Evolution (Planned)

- Add new tables for metadata: `issues`, `pull_requests`, `comments`, `reviews`, `commits`.  
- Use foreign keys referencing `repos.github_id`.  
- Store `last_seen_at` timestamps to update only changed rows.  
- Use `ON CONFLICT DO UPDATE` for efficient refreshes.

---

## Scalability (Future Work)

- **For 500M repositories:**  
  - Partition queries by star count and creation date to fetch subsets.  
  - Use message queues (RabbitMQ/Kafka) to distribute crawling tasks.  
  - Implement caching or incremental updates for only changed repositories.  
  - Use distributed databases like **CockroachDB** or **TimescaleDB**.  
  - Implement parallel jobs in GitHub Actions for faster partition crawling.  

- **Metadata crawling:**  
  - Fetch and store additional repository metadata (issues, PRs, commits, CI checks).  
  - Only update changed entities to reduce database writes.

---

