import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import jobRoutes from './routes/jobs.js';
import { emitter, getJobs, getAllRuns } from './openclawData.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  const jobs = getJobs();
  const allRunsMap = getAllRuns();
  let runCount = 0;
  let lastUpdate = 0;
  for (const [, runs] of allRunsMap) {
    runCount += runs.length;
    for (const r of runs) {
      if (r.ts && r.ts > lastUpdate) lastUpdate = r.ts;
    }
  }
  res.json({
    ok: true,
    jobCount: jobs.length,
    runCount,
    lastUpdate: lastUpdate || null,
  });
});
app.use('/api/jobs', jobRoutes);

// WebSocket: push updates on file changes
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected' }));
});

emitter.on('update', (payload) => {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
});

server.listen(PORT, () => {
  console.log(`Rondo API running on http://localhost:${PORT}`);
});
