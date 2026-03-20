# Rondo

[![npm](https://img.shields.io/npm/v/@dion-jy/rondo)](https://www.npmjs.com/package/@dion-jy/rondo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**OpenClaw plugin** that syncs cron job and run data to Supabase for external dashboard monitoring.

## What it does

Rondo reads your local OpenClaw cron data and periodically pushes it to a shared Supabase backend. The [Rondo UI](https://github.com/dion-jy/rondo-ui) dashboard (deployed on Vercel) reads from Supabase to display your jobs, runs, and agent sessions.

```
┌─────────────────────┐     outbound push     ┌───────────┐
│  OpenClaw Gateway   │ ──────────────────────▶│ Supabase  │
│  (rondo plugin)     │   every 5min (REST)    │  (cloud)  │
│  reads jobs.json    │                        └─────┬─────┘
│  reads runs/*.jsonl │                              │
└─────────────────────┘                              │ fetch
                                              ┌──────▼──────┐
                                              │  Rondo UI   │
                                              │  (Vercel)   │
                                              └─────────────┘
```

No inbound ports, no tunnels — outbound HTTPS only.

## Installation

```bash
openclaw plugins install @dion-jy/rondo
openclaw gateway restart
```

That's it. **Zero config required** — the Supabase URL and anon key are bundled in the plugin (shared multi-tenant backend). The plugin begins syncing on the next gateway start.

## Device Linking

To associate your data with your account in the Rondo UI:

1. Log in to [rondo-ui.vercel.app](https://rondo-ui.vercel.app) and generate a link token
2. Add the token to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "rondo": {
        "config": {
          "linkToken": "your-one-time-token"
        }
      }
    }
  }
}
```

3. Restart the gateway — the token is consumed on first sync and your device is linked

## Features

- **Cron job sync** — pushes job definitions (schedule, state, metadata) to Supabase
- **Run history sync** — pushes execution records (status, duration, tokens, errors)
- **ACP session sync** — tracks active agent sessions (model, tokens, status)
- **Orphan cleanup** — removes jobs from Supabase that no longer exist locally
- **Batch upserts** — handles large datasets efficiently (100 records per request)
- **Multi-tenant** — user scoping via device link tokens and Supabase RLS

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `syncIntervalMs` | `300000` (5 min) | Sync interval in milliseconds |
| `linkToken` | — | One-time device link token from Rondo UI |

## Commands

- `/rondo-status` — shows current sync configuration and health

## Architecture

- **Outbound push** pattern — gateway makes outbound HTTPS requests only
- **No SDK dependency** — uses native `fetch` for Supabase REST API
- **Non-blocking** — sync failures are logged but never crash the gateway
- Data flows: local files → Supabase REST API (upsert) → Rondo UI (read)

## Related

- [Rondo UI](https://github.com/dion-jy/rondo-ui) — Vercel dashboard for monitoring
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent orchestration platform

## License

MIT
