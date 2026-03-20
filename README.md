# @dion-jy/rondo

[![npm](https://img.shields.io/npm/v/@dion-jy/rondo)](https://www.npmjs.com/package/@dion-jy/rondo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

OpenClaw plugin that syncs cron job data to [Rondo Dashboard](https://rondo-ui.vercel.app).

## Setup

1. Install the plugin:
   ```bash
   openclaw plugins install @dion-jy/rondo
   openclaw gateway restart
   ```

2. Open [rondo-ui.vercel.app](https://rondo-ui.vercel.app) and sign in with Google

3. Click **Link Device** and copy the link

4. Link your device (choose one):
   - **Chat:** Send `/rondo link <URL>` in Telegram/WhatsApp
   - **Terminal:** Run `openclaw rondo link <URL>`

5. Done! Your cron jobs will appear on the dashboard.

## Commands

| Command | Description |
|---------|-------------|
| `/rondo link <URL>` | Link this device to your web account |
| `/rondo status` | Check linking status |

## Features

- Automatic cron job & run history sync
- ACP agent session tracking
- Orphan job cleanup
- Multi-tenant via device linking

## Architecture

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

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `syncIntervalMs` | `300000` (5 min) | Sync interval in milliseconds |
| `linkToken` | — | One-time device link token from Rondo UI |

## Automated Publishing

The package is automatically published to npm when:

- **Option A:** A GitHub Release is published
- **Option B:** A tag matching `v*` is pushed (e.g. `git tag v2.2.0 && git push --tags`)

### Setup

Add an `NPM_TOKEN` repository secret (Settings → Secrets → Actions):

1. Create a granular access token on [npmjs.com](https://www.npmjs.com/settings/~/tokens) with **publish** permission for `@dion-jy/rondo`
2. Add it as `NPM_TOKEN` in the repo's Actions secrets

The workflow validates the package name and checks that the tag version matches `package.json` before publishing. If the version is already published, the job exits gracefully.

## Related

- [Rondo UI](https://github.com/dion-jy/rondo-ui) — Vercel dashboard for monitoring
- [OpenClaw](https://github.com/openclaw/openclaw) — AI agent orchestration platform

## License

MIT
