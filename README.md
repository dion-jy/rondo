# 🎵 Rondo

**OpenClaw Plugin** — Syncs cron job/run data to Supabase for external dashboard monitoring.

> *Rondo: a musical form with a recurring theme — just like your cron jobs.*

## What it does

Rondo reads your local OpenClaw cron data (`~/.openclaw/cron/jobs.json` + `runs/*.jsonl`) and periodically pushes it to a Supabase database. A separate [Rondo UI](https://github.com/dion-jy/rondo-ui) frontend (deployed on Vercel) reads from Supabase to display the dashboard.

```
┌─────────────────────┐     outbound push     ┌───────────┐
│  OpenClaw Gateway   │ ──────────────────────▶│ Supabase  │
│  (rondo plugin)     │   every 5min (REST)    │  (cloud)  │
│  reads jobs.json    │                        └─────┬─────┘
│  reads runs/*.jsonl │                              │
└─────────────────────┘                              │ fetch
                                               ┌─────▼─────┐
                                               │ Rondo UI  │
                                               │ (Vercel)  │
                                               └───────────┘
```

No bind changes, no tunnels, no inbound connections needed.

## Installation

### 1. Clone to extensions directory

```bash
cd ~/.openclaw/extensions
git clone https://github.com/dion-jy/rondo.git
```

### 2. Enable in OpenClaw config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["rondo"],
    "entries": {
      "rondo": {
        "enabled": true,
        "config": {
          "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
          "supabaseKey": "YOUR_ANON_KEY",
          "syncIntervalMs": 300000
        }
      }
    }
  }
}
```

### 3. Restart gateway

```bash
openclaw gateway restart
```

## Configuration

| Key | Env Var | Default | Description |
|-----|---------|---------|-------------|
| `supabaseUrl` | `RONDO_SUPABASE_URL` | — | Supabase project URL |
| `supabaseKey` | `RONDO_SUPABASE_KEY` | — | Supabase anon/service key |
| `syncIntervalMs` | — | `300000` (5 min) | Sync interval in milliseconds |

The plugin starts in "loaded but inactive" mode if Supabase is not configured. It will log a message but not error.

## Commands

- `/rondo-status` — Shows current sync configuration and health

## Supabase Setup

See [`sql/schema.sql`](sql/schema.sql) for the table definitions. Run this in Supabase SQL Editor before enabling the plugin.

## Architecture

This plugin follows the **outbound push** pattern (same as Telegram/WhatsApp channel plugins):
- Gateway only makes outbound HTTPS requests — no inbound ports opened
- Data flows: local files → Supabase REST API (upsert)
- Frontend is a separate Vercel deployment reading from Supabase
- No SDK dependency — uses native `fetch` for Supabase REST API

## Related

- [Rondo UI](https://github.com/dion-jy/rondo-ui) — Vercel frontend dashboard
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent orchestration platform

## License

MIT
