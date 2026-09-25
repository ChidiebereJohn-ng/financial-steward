# Hosting — Cloudflare

## Services used
- **Cloudflare Pages** (or Workers Static Assets) — serves the React PWA build
- **Cloudflare Workers** — API backend (Hono router)
- **Cloudflare D1** — SQLite database (see DATABASE_SCHEMA.md)
- **Cloudflare R2** — CSV imports, exports, (reserved) attachments
- **Cloudflare KV** — FX rate cache, live market price cache, small config values
- **Cloudflare Cron Triggers** — scheduled jobs (monthly summary refresh, digest generation, recurring transaction check, nightly net worth snapshot)
- **Cloudflare Queues** (optional, add later if CSV imports get large) — background processing for import batches

## Project layout (suggested)
```
/app          -> React PWA (Vite build output served via Pages)
/worker       -> Hono API (Workers)
  /routes
  /lib        -> allocation engine, ledger writer, fx, etc. (APP_LOGIC.md → code)
  /migrations -> D1 schema migrations (DATABASE_SCHEMA.md → .sql files)
wrangler.toml
```

## wrangler.toml (skeleton)
```toml
name = "personal-finance-app"
main = "worker/index.ts"
compatibility_date = "2026-09-01"

[[d1_databases]]
binding = "DB"
database_name = "finance-app-db"
database_id = "<generated-on-create>"

[[r2_buckets]]
binding = "FILES"
bucket_name = "finance-app-files"

[[kv_namespaces]]
binding = "CACHE"
id = "<generated-on-create>"

[triggers]
crons = [
  "0 1 * * *",      # nightly: net worth snapshot, monthly_summaries refresh
  "0 6 * * 1",       # weekly Monday: research digest generation
  "0 7 * * *"        # daily: recurring transaction due-check
]
```

## Setup steps
1. `wrangler d1 create finance-app-db` → paste the returned `database_id` into `wrangler.toml`
2. `wrangler d1 execute finance-app-db --file=worker/migrations/0001_init.sql` (paste the CREATE TABLE statements from DATABASE_SCHEMA.md)
3. `wrangler r2 bucket create finance-app-files`
4. `wrangler kv namespace create CACHE` → paste the returned id
5. Set secrets: `wrangler secret put CLAUDE_API_KEY` (for the digest feature), any market-data API keys
6. `wrangler deploy` for the Worker; `wrangler pages deploy` (or Pages Git integration) for the frontend build

## Environments
- Single environment is enough for a personal app (no staging/prod split needed at this scale) — but if desired, `wrangler.toml` supports `[env.staging]` / `[env.production]` blocks with separate D1/KV bindings.

## PWA specifics
- `manifest.json` + service worker served from `/app` — Cloudflare Pages serves static assets with correct caching headers by default
- Offline queue: failed writes (no network) get queued in IndexedDB client-side and retried against the Worker API on reconnect

## Cost expectation
At single-user scale, this sits comfortably inside Cloudflare's free tier for Workers, D1, KV, and R2 (all have generous free allowances) — Cron Triggers are also free up to a limit that a personal app won't approach. The only potential paid cost is an external market-data API subscription if/when the manual NGX pricing workflow is upgraded to a paid feed.
