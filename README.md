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

## Upgrading

If you are upgrading from an older version, run the following migration in your Supabase SQL Editor to add newer columns. These are idempotent and safe to re-run:

```sql
-- sql/004_plugin_version.sql
ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS plugin_version text;
```

> **Note:** Even without running this migration, the plugin will work — it automatically detects missing columns and excludes them from sync payloads. Running the migration simply enables the extra metadata.

### Upgrade steps

1. `openclaw plugins update @dion-jy/rondo`
2. `openclaw gateway restart`
3. (Optional) Run the SQL above in Supabase to enable `plugin_version` tracking

No manual file edits under `~/.openclaw/plugins/` are needed or supported.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `syncIntervalMs` | `300000` (5 min) | Sync interval in milliseconds |
| `linkToken` | — | One-time device link token from Rondo UI |

## Zero-config install guarantee (important)

Users should be able to install/update the plugin and use it immediately.

- ✅ `SUPABASE_URL` and **anon** key are bundled in plugin source (`src/config.ts`)
- ✅ No manual patching in runtime paths (e.g. `~/.openclaw/plugins/...`) should be required
- ❌ Never ship `service_role` key in plugin code
- ✅ Any key rotation must be released via npm version update, then users run plugin update

### Security requirement: RLS

Because anon key is public by design, Supabase **Row Level Security (RLS)** policies must enforce user-scoped access.
Without proper RLS, anon clients may read/write unintended rows.

### Maintainer release checklist

1. Update `src/config.ts` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) if rotated
2. Confirm `service_role` is not referenced anywhere in source
3. Validate RLS SQL is up to date (`sql/002_user_id_rls.sql`, `sql/003_enforce_user_scope.sql`)
4. Bump `package.json` version
5. Publish via release or tag (`v*`)
6. Verify fresh install works without manual file edits

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
