import express from 'express';
import cors from 'cors';
import jobRoutes from './routes/jobs.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/jobs', jobRoutes);

app.listen(PORT, () => {
  console.log(`CronManager API running on http://localhost:${PORT}`);
});
