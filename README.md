# CronManager

Minimal web MVP for managing cron jobs with a visual timeline.

## Features

- **Job list**: View all cron jobs with status, next run time, enable/disable toggle
- **Timeline**: 7-day schedule view grouped by date
- **Execution log**: Recent execution history with status (success/failed/running)
- **CRUD**: Create, edit, delete cron jobs via modal form
- **Modular backend**: Routes and services cleanly separated for future mobile app extension

## Architecture

```
cronmanager/
├── backend/          # Express API (port 4000)
│   └── src/
│       ├── index.js          # Express app entry
│       ├── db.js             # JSON file storage
│       ├── routes/jobs.js    # REST endpoints
│       └── services/jobService.js  # Business logic
├── frontend/         # React + Vite (port 3000)
│   └── src/
│       ├── App.jsx           # Main app with tabs
│       ├── main.jsx          # Entry point
│       └── styles.css        # Dark theme styles
└── .gitignore
```

## Quick Start

```bash
# Terminal 1: Backend
cd backend
npm install
npm run dev        # http://localhost:4000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The frontend proxies `/api` requests to the backend.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs` | List all jobs with recent executions |
| GET | `/api/jobs/:id` | Get job detail |
| POST | `/api/jobs` | Create job |
| PUT | `/api/jobs/:id` | Update job |
| DELETE | `/api/jobs/:id` | Delete job |
| GET | `/api/jobs/schedule?days=7` | Get upcoming schedule |
| GET | `/health` | Health check |

## Data Storage

Uses a JSON file (`backend/data/db.json`) for persistence. Automatically seeds sample data on first run. Swap to SQLite/Postgres when ready for production.

## Tech Stack

- **Backend**: Node.js, Express, cron-parser
- **Frontend**: React 19, Vite 6
- **Storage**: JSON file (upgradeable)
