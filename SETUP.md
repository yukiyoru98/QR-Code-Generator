# 5-Minute Setup Guide

## 1) Prerequisites

- Node.js 24+
- npm 11+
- Cloudflare account + Wrangler auth
- Supabase project
- Upstash Redis database
- Tinybird workspace

## 1.1) Accounts you need and how to get them

You need these accounts before filling env files:

- Cloudflare account:
  - Sign up at https://dash.cloudflare.com/sign-up
  - Free plan is enough for local development and initial Worker deploys.
- Supabase account:
  - Sign up at https://supabase.com/dashboard/sign-up
  - Create a new project (you will need the project URL and a secret API key).
- Upstash account:
  - Sign up at https://console.upstash.com/login
  - Create a Redis database using REST API access.
- Tinybird account:
  - Sign up at https://www.tinybird.co/
  - Create a workspace and copy its workspace token and API URL from the Quickstart.

## 1.2) Wrangler login

After creating your Cloudflare account, authenticate Wrangler once:

```bash
cd worker
npx wrangler login
```

This opens a browser window to authorize CLI access.

## 1.3) Tinybird SDK setup

The repository already contains the Tinybird TypeScript definitions in `dashboard/lib/tinybird.ts` and the configuration in `dashboard/tinybird.config.mjs`. They create:

- `scan_events`, the QR scan datasource
- `scan_analytics`, the analytics endpoint used by the dashboard

Create or select a Tinybird workspace, then copy its workspace token and API URL from the Tinybird Quickstart. The URL must match the workspace region. For example:

```dotenv
TINYBIRD_TOKEN=p.your_workspace_token
TINYBIRD_URL=https://api.ap-east-1.aws.tinybird.co
```

Install the SDK globally and install the project dependencies:

```bash
npm install --global @tinybirdco/sdk@latest
cd dashboard
npm install
```

Create a feature branch from `main` before building:

```bash
git switch main
git switch -c setup-tinybird-sdk
```

Add the Quickstart values to `dashboard/.env.local`:

```dotenv
TINYBIRD_TOKEN=p.your_workspace_token
TINYBIRD_URL=https://your-region.tinybird.co
```

Run the CLI from `dashboard`:

```bash
tinybird info
tinybird build
```

`tinybird build` reads the TypeScript definitions and creates or updates `scan_events` and `scan_analytics` in the Tinybird branch. Do not create `scan_events` manually in the Tinybird UI.

## 2) Install dependencies

```bash
cd dashboard
npm install
cd ../worker
npm install
```

## 3) Configure environment variables

Create local env files from `.env.example`:

- `dashboard/.env.local`
- `worker/.dev.vars` (for local worker dev)

## 3.1) Where each env variable comes from

Copy values into `dashboard/.env.local` and `worker/.dev.vars` as needed.

- `BASE_SHORT_URL`
  - Local: `http://localhost:8000`
  - Production: your deployed domain, for example `https://links.yourdomain.com`

- `UPSTASH_REDIS_REST_URL`
  - Upstash Console -> your Redis database -> Details/REST section

- `UPSTASH_REDIS_REST_TOKEN`
  - Upstash Console -> your Redis database -> REST API token

- `SUPABASE_URL`
  - Supabase Dashboard -> Project Settings -> API -> Project URL

- `SUPABASE_SECRET_KEY`
  - Supabase Dashboard -> Project Settings -> API Keys -> create a secret key (`sb_secret_...`)
  - Use only in backend code. Never expose it in browser/client code.

- `TINYBIRD_TOKEN`
  - Tinybird workspace token from the Quickstart.
  - Used by the TypeScript SDK CLI and dashboard.

- `TINYBIRD_URL`
  - Tinybird workspace API URL from the Quickstart.
  - Use the URL for the same region as `TINYBIRD_TOKEN`.

- `TINYBIRD_INGEST_URL` (Worker only)
  - Still required by the Cloudflare Worker, which sends scan events over HTTP.
  - Use the regional HTTP ingest URL for the `scan_events` datasource created by `tinybird build`.
  - Format: `https://api.<region>.aws.tinybird.co/v0/events?name=scan_events`

- `TINYBIRD_API_KEY` (Worker only)
  - Still required by the Cloudflare Worker, but not by the dashboard SDK.
  - Use a Tinybird token with permission to append data to `scan_events`.
  - Store it as a Worker secret in production.

- `MALICIOUS_CHECK_URL` and `MALICIOUS_CHECK_API_KEY` (optional)
  - From your selected URL reputation provider.
  - Leave empty to use graceful fallback behavior in this prototype.

Required values:

- `BASE_SHORT_URL` (example `http://localhost:8000`)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TINYBIRD_TOKEN`
- `TINYBIRD_URL`
- `TINYBIRD_INGEST_URL` in `worker/.dev.vars` or Worker configuration
- `TINYBIRD_API_KEY` in `worker/.dev.vars` locally or as a Wrangler secret
- Optional malicious check hook:
  - `MALICIOUS_CHECK_URL`
  - `MALICIOUS_CHECK_API_KEY`

## 4) Initialize database

Run [schema.sql](schema.sql) in Supabase SQL editor.

Supabase SQL Editor path:

- Open https://supabase.com/dashboard
- Select your project
- Left navigation -> SQL Editor
- Click New query
- Paste contents of [schema.sql](schema.sql)
- Click Run

## 5) Local run

For dashboard APIs (recommended for verification cURLs):

```bash
cd dashboard
npm run dev -- --port 8000
```

For worker redirect engine:

```bash
cd worker
npm run dev
```

The worker serves `/r/{token}` with 302/404/410 behavior and Tinybird async logging.

## 6) Deploy

Dashboard:

- Deploy `dashboard/` to Cloudflare Pages or Vercel.
- Set all env vars in project settings.

Worker:

```bash
cd worker
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put TINYBIRD_API_KEY
npm run deploy
```

Set `TINYBIRD_INGEST_URL` in `worker/wrangler.toml` to the regional URL for `scan_events`. Keep `TINYBIRD_API_KEY` out of `wrangler.toml`; provide it with `wrangler secret put`.
