# GitHub Stars Crawler

This project uses the GitHub GraphQL API to crawl repository star counts and store them in PostgreSQL.

## How It Works
1. `crawler.js` fetches repositories using GitHub's GraphQL API.
2. Data (id, full_name, stars) is saved into a Postgres database.
3. `repo_stars_history` stores daily star snapshots.
4. The workflow (`crawl.yml`) runs the process automatically via GitHub Actions.

## Scalability
- For 500 million repos, partition data collection by creation date or star range (e.g., crawl smaller segments in parallel).
- Use message queues (e.g., RabbitMQ) to distribute crawling tasks.
- Add caching or incremental updates to only refresh changed repos.

## Schema Evolution
To store metadata like issues, pull requests, and comments:
- Add new related tables (e.g., `issues`, `pull_requests`).
- Use foreign keys referencing `repos.github_id`.
- Use `ON CONFLICT DO UPDATE` to efficiently refresh changed records.
