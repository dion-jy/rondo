import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import jobRoutes from './routes/jobs.js';
import { emitter } from './openclawData.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
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
