# 🎵 Rondo

**AI Productivity Control Tower** — Monitor, optimize, and orchestrate your AI agent workloads.

> *Rondo: a musical form with a recurring theme — just like your cron jobs.*

## What is Rondo?

Rondo is a real-time monitoring and scheduling dashboard for [OpenClaw](https://github.com/openclaw/openclaw) cron jobs. It helps you:

- **See** all scheduled tasks on a calendar/timeline view
- **Monitor** execution status (success/failed/running) in real-time
- **Optimize** scheduling gaps — find idle time slots and fill them
- **Track** token burn rate across ACP sessions
- **Maximize** AI agent uptime — squeeze every drop of productivity

### The Problem

You set up cron jobs to run AI agents overnight. But:
- Are there idle gaps where nothing runs?
- Will two heavy tasks collide and hit rate limits?
- How many tokens are you burning per hour?
- Is that ACP session still running or did it die silently?

Rondo answers all of these at a glance.

## Features

### Current (MVP)
- ✅ Job list with status, next run, enable/disable toggle
- ✅ 7-day timeline view grouped by date
- ✅ Execution log with status history
- ✅ CRUD: create, edit, delete jobs via modal form
- ✅ Modular backend (routes/services separation)

### Roadmap
- 🔜 **Phase A**: OpenClaw cron integration (read `jobs.json` directly)
- 🔜 **Phase B**: Token burn rate dashboard + idle slot detection
- 🔜 **Phase C**: Direct cron editing from UI + mobile app

## Architecture

```
rondo/
├── backend/          # Express API (port 4000)
│   └── src/
│       ├── index.js          # Express app entry
│       ├── db.js             # Storage abstraction
│       ├── routes/jobs.js    # REST endpoints
│       └── services/jobService.js  # Business logic
├── frontend/         # React + Vite (port 3000)
│   └── src/
│       ├── App.jsx           # Main app (Jobs/Timeline/Executions tabs)
│       ├── main.jsx          # Entry point
│       └── styles.css        # Dark theme
└── README.md
```

Backend services are cleanly separated for future mobile app extension.

## Quick Start

```bash
# Backend (terminal 1)
cd backend && npm install && npm run dev    # http://localhost:4000

# Frontend (terminal 2)
cd frontend && npm install && npm run dev   # http://localhost:3000
```

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List all jobs with recent executions |
| GET | `/api/jobs/:id` | Get job detail |
| POST | `/api/jobs` | Create job |
| PUT | `/api/jobs/:id` | Update job |
| DELETE | `/api/jobs/:id` | Delete job |
| GET | `/api/jobs/schedule?days=7` | Upcoming schedule |
| GET | `/health` | Health check |

## Tech Stack

- **Backend**: Node.js, Express, cron-parser
- **Frontend**: React 19, Vite 6
- **Storage**: JSON file (upgradeable to SQLite/Postgres)

## License

MIT
