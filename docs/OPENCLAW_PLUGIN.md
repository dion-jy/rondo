# Rondo as an OpenClaw Plugin (Detailed Guide)

This guide explains how to run Rondo as a **native OpenClaw extension** (`~/.openclaw/extensions/rondo`) instead of a separate Express app.

---

## 1) Folder layout

Expected extension layout:

```text
~/.openclaw/extensions/rondo/
├── openclaw.plugin.json
├── package.json
├── index.ts                  # plugin entry (registerHttpRoute)
└── ui/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── src/
    └── dist/                 # built assets (npm run build)
```

---

## 2) Mandatory manifest fields (`openclaw.plugin.json`)

**Important:** recent OpenClaw versions require `configSchema` in plugin manifest.
If missing, gateway config validation can fail with messages like:

- `plugin manifest requires configSchema`

Use this minimal manifest:

```json
{
  "id": "rondo",
  "name": "Rondo",
  "description": "Cron job monitoring dashboard for OpenClaw",
  "version": "0.1.0",
  "entry": "./index.ts",
  "configSchema": {
    "type": "object",
    "properties": {},
    "additionalProperties": false
  }
}
```

Notes:
- `configSchema` can be empty object schema if no runtime config is needed.
- Keep `entry` aligned with your actual plugin entry file.

---

## 3) Plugin entry registration pattern

In `index.ts`, register **API routes first**, then **UI route**:

```ts
api.registerHttpRoute({
  path: '/rondo/api',
  auth: 'gateway',
  match: 'prefix',
  handler: async (req, res) => {
    // /rondo/api/health, /rondo/api/jobs, ...
    return true;
  },
});

api.registerHttpRoute({
  path: '/rondo',
  auth: 'gateway',
  match: 'prefix',
  handler: async (req, res) => {
    // static file serving + SPA fallback
    return true;
  },
});
```

Why this order:
- `/rondo` is a prefix for `/rondo/api/*` too.
- If API route is not registered correctly, UI fallback may answer API paths with HTML.

---

## 4) Build UI

```bash
cd ~/.openclaw/extensions/rondo/ui
npm install
npm run build
```

Make sure `ui/dist/index.html` exists.

---

## 5) Restart/Reload OpenClaw Gateway

After updating plugin files:

```bash
# in your environment, restart gateway/watchdog flow
# example helper scripts (if used)
bash ~/stop-claw.sh && bash ~/start-claw.sh
```

(Use your actual deployment method.)

---

## 6) Verify (must pass)

Run these checks:

```bash
curl -i http://127.0.0.1:18789/rondo
curl -i http://127.0.0.1:18789/rondo/api/health
curl -i http://127.0.0.1:18789/rondo/api/jobs
```

Expected:
- `/rondo` → HTML
- `/rondo/api/health` → JSON (e.g. `{ "ok": true, ... }`)
- `/rondo/api/jobs` → JSON array/object

If API endpoints return HTML, API route registration/manifest load likely failed.

---

## 7) Troubleshooting checklist

### A. `plugin manifest requires configSchema`
- Add `configSchema` to `openclaw.plugin.json`.
- Restart gateway.

### B. `/rondo/api/*` returns HTML
- Confirm plugin loaded successfully (no manifest/load errors).
- Confirm API route exists: `path: '/rondo/api', match: 'prefix'`.
- Confirm handler returns `true` after responding.
- Confirm UI route does not swallow API due to missing API registration.

### C. `UI not built` or 404 on `/rondo`
- Build UI (`npm run build`) and verify `ui/dist/index.html`.
- Check static path resolution in `index.ts`.

### D. No cron data in API
- Verify source files exist:
  - `~/.openclaw/cron/jobs.json`
  - `~/.openclaw/cron/runs/*.jsonl`
- Verify file permission/read access for gateway process.

---

## 8) Recommended release flow

1. Update extension code in a dev workspace.
2. Validate manifest + `configSchema`.
3. Build UI.
4. Reload gateway.
5. Run endpoint smoke tests (`/rondo`, `/rondo/api/health`, `/rondo/api/jobs`).
6. Only then mark deployment as complete.

---

## 9) Minimal acceptance criteria for “Rondo plugin works”

- [ ] Gateway starts without plugin config errors
- [ ] `/rondo` renders UI
- [ ] `/rondo/api/health` returns JSON
- [ ] `/rondo/api/jobs` returns JSON with real cron data
- [ ] SSE endpoint (`/rondo/api/events`) connects and receives heartbeat/update
