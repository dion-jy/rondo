import { Router } from 'express';
import * as jobService from '../services/jobService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(jobService.getAllJobs());
});

router.get('/timeline', (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  res.json(jobService.getTimeline(hours));
});

router.get('/stats', (req, res) => {
  res.json(jobService.getStats());
});

router.get('/:id', (req, res) => {
  const job = jobService.getJobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

export default router;
