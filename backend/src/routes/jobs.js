import { Router } from 'express';
import * as jobService from '../services/jobService.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(jobService.getAllJobs());
});

router.get('/schedule', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  res.json(jobService.getSchedule(days));
});

router.get('/:id', (req, res) => {
  const job = jobService.getJobById(Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.post('/', (req, res) => {
  try {
    const job = jobService.createJob(req.body);
    res.status(201).json(job);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const job = jobService.updateJob(Number(req.params.id), req.body);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const deleted = jobService.deleteJob(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Job not found' });
  res.status(204).end();
});

export default router;
