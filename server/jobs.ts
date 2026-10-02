import { randomUUID } from 'crypto';
import {
  checkGenerationStatus,
  resolveConfig,
  submitGeneration,
  type GenerationInput,
  type SubmitResult,
} from './providers';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  model: string;
  provider: string;
  status: JobStatus;
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  task: SubmitResult;
  cfg: { provider: string; baseUrl?: string; model?: string };
}

// In-memory store. Note: on serverless platforms (Vercel) this resets on
// cold starts — jobs are best-effort and the provider remains the source of truth.
const jobs = new Map<string, Job>();

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function deleteJob(id: string): boolean {
  return jobs.delete(id);
}

export async function createJob(
  req: { headers: Record<string, string | string[] | undefined> },
  input: GenerationInput
): Promise<Job> {
  const cfg = resolveConfig(req);
  const task = await submitGeneration(cfg, input);
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    prompt: input.prompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    model: cfg.model || (cfg.provider === 'openrouter' ? 'bytedance/seedance-2.0' : 'dreamina-seedance-2-0-260128'),
    provider: cfg.provider,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    task,
    cfg: { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model },
  };
  jobs.set(job.id, job);
  return job;
}

/** Lazy status refresh: whenever a job is read while still processing,
 *  check the provider once and update the stored job. */
export async function refreshJob(
  req: { headers: Record<string, string | string[] | undefined> },
  id: string
): Promise<Job | undefined> {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (job.status === 'processing' || job.status === 'queued') {
    try {
      const cfg = resolveConfig(req);
      const remote = await checkGenerationStatus(
        { ...cfg, provider: job.cfg.provider as any, baseUrl: job.cfg.baseUrl, model: job.cfg.model },
        job.task
      );
      job.updatedAt = new Date().toISOString();
      if (remote.status === 'completed') {
        job.status = 'completed';
        job.videoUrl = remote.videoUrl;
      } else if (remote.status === 'failed') {
        job.status = 'failed';
        job.error = remote.error || 'Generation failed.';
      }
    } catch (err: any) {
      // Keep the job alive on transient poll errors; surface only the message.
      job.error = err.message;
      job.updatedAt = new Date().toISOString();
    }
  }
  return job;
}

export function publicJob(job: Job) {
  const { task, cfg, ...rest } = job;
  void task;
  void cfg;
  return rest;
}
