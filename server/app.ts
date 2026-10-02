import express from 'express';
import { Readable } from 'stream';
import { createJob, deleteJob, getJob, listJobs, publicJob, refreshJob } from './jobs';

/**
 * Shared Express app: API only.
 * Local dev (server.ts) adds Vite/static serving; Vercel (api/[...route].ts)
 * mounts this inside a serverless function.
 */
export function createApp() {
  const app = express();
  app.use(express.json({ strict: false }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'seedance-studio' });
  });

  // List jobs (newest first)
  app.get('/api/jobs', (_req, res) => {
    res.json(listJobs().map(publicJob));
  });

  // Submit a new generation job
  app.post('/api/jobs', async (req, res) => {
    try {
      const { prompt, duration, aspectRatio } = req.body || {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'prompt is required' });
      }
      const job = await createJob(req, {
        prompt: prompt.trim(),
        duration: Number(duration) || 15,
        aspectRatio: aspectRatio || '16:9',
      });
      res.status(201).json(publicJob(job));
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to submit job' });
    }
  });

  // Get one job (refreshes status from the provider when still processing)
  app.get('/api/jobs/:id', async (req, res) => {
    const job = await refreshJob(req, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(publicJob(job));
  });

  // Delete a job
  app.delete('/api/jobs/:id', (req, res) => {
    if (!deleteJob(req.params.id)) return res.status(404).json({ error: 'Job not found' });
    res.json({ ok: true });
  });

  // Proxy-download the finished video (avoids CORS / expiring-URL issues)
  // ?inline=1 streams for in-browser preview instead of forcing a download
  app.get('/api/jobs/:id/download', async (req, res) => {
    const job = await refreshJob(req, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'completed' || !job.videoUrl) {
      return res.status(409).json({ error: 'Video is not ready yet' });
    }
    try {
      const upstream = await fetch(job.videoUrl);
      if (!upstream.ok || !upstream.body) throw new Error(`Upstream ${upstream.status}`);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
      if (req.query.inline === '1') {
        res.setHeader('Content-Disposition', `inline; filename="seedance-${job.id}.mp4"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="seedance-${job.id}.mp4"`);
      }
      Readable.fromWeb(upstream.body as any).pipe(res);
    } catch (err: any) {
      res.status(502).json({ error: `Download failed: ${err.message}` });
    }
  });

  return app;
}
