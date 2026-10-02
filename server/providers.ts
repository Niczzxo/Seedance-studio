/**
 * Provider integrations for Seedance video generation.
 *
 * Two official routes are supported — both need the user's own API key:
 *  - openrouter : https://openrouter.ai/api/v1/videos  (model bytedance/seedance-2.0)
 *  - byteplus   : BytePlus ModelArk (international) / Volcengine ARK (China)
 *                 {baseUrl}/contents/generations/tasks
 *
 * There is no public API for Dola AI's Seedance 2.5 web app, so this studio
 * talks to the official model APIs instead. Generation is billed by the
 * provider — it is not free or unlimited.
 */

export type ProviderId = 'openrouter' | 'byteplus' | 'apiframe';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface GenerationInput {
  prompt: string;
  duration: number; // seconds requested
  aspectRatio: string; // e.g. "16:9"
}

export interface SubmitResult {
  providerTaskId: string;
  pollUrl?: string;
}

export type RemoteStatus = 'processing' | 'completed' | 'failed';

export interface StatusResult {
  status: RemoteStatus;
  videoUrl?: string;
  error?: string;
}

const OPENROUTER_DEFAULT_MODEL = 'bytedance/seedance-2.0';
const BYTEPLUS_DEFAULT_MODEL = 'dreamina-seedance-2-0-260128';
const BYTEPLUS_DEFAULT_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const APIFRAME_DEFAULT_MODEL = 'seedance-2.5';
const APIFRAME_DEFAULT_BASE = 'https://api.apiframe.ai/v2';

async function readJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return { _raw: await res.text().catch(() => '') };
  }
}

export async function submitGeneration(
  cfg: ProviderConfig,
  input: GenerationInput
): Promise<SubmitResult> {
  if (!cfg.apiKey) throw new Error('API key is missing. Add it in Settings.');

  // Apiframe — third-party gateway with a documented Seedance 2.5 endpoint
  // (4–30s single-pass clips, native synced audio).
  if (cfg.provider === 'apiframe') {
    const base = (cfg.baseUrl || APIFRAME_DEFAULT_BASE).replace(/\/$/, '');
    const res = await fetch(`${base}/videos/generate`, {
      method: 'POST',
      headers: { 'X-API-Key': cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model || APIFRAME_DEFAULT_MODEL,
        prompt: input.prompt,
        seedanceParams: {
          duration: Math.min(30, Math.max(4, input.duration)),
          resolution: '720p',
          aspect_ratio: input.aspectRatio,
          generate_audio: true,
        },
      }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || `Apiframe error ${res.status}`);
    }
    const jobId: string | undefined = data.jobId || data.job_id || data.id;
    if (!jobId) throw new Error('Apiframe did not return a job id.');
    return { providerTaskId: jobId };
  }

  if (cfg.provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/videos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://seedance-studio.app',
        'X-Title': 'Seedance Studio',
      },
      body: JSON.stringify({
        model: cfg.model || OPENROUTER_DEFAULT_MODEL,
        prompt: input.prompt,
        duration: input.duration,
        aspect_ratio: input.aspectRatio,
      }),
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || `OpenRouter error ${res.status}`);
    }
    // OpenRouter returns a polling_url for async video jobs
    const pollUrl: string | undefined = data.polling_url || data.poll_url;
    const taskId: string | undefined = data.id || data.task_id;
    if (!pollUrl && !taskId) throw new Error('OpenRouter did not return a polling URL or task id.');
    return { providerTaskId: taskId || pollUrl!, pollUrl };
  }

  // byteplus / volcengine ARK
  const base = (cfg.baseUrl || BYTEPLUS_DEFAULT_BASE).replace(/\/$/, '');
  const res = await fetch(`${base}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model || BYTEPLUS_DEFAULT_MODEL,
      content: [
        {
          type: 'text',
          text: `Generate a ${input.duration}-second video with aspect ratio ${input.aspectRatio}: ${input.prompt}`,
        },
      ],
    }),
  });
  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `BytePlus error ${res.status}`);
  }
  const taskId: string | undefined = data.id || data.task_id || data.data?.id;
  if (!taskId) throw new Error('BytePlus did not return a task id.');
  return { providerTaskId: taskId };
}

export async function checkGenerationStatus(
  cfg: ProviderConfig,
  task: SubmitResult
): Promise<StatusResult> {
  if (cfg.provider === 'apiframe') {
    const base = (cfg.baseUrl || APIFRAME_DEFAULT_BASE).replace(/\/$/, '');
    const res = await fetch(`${base}/jobs/${task.providerTaskId}`, {
      headers: { 'X-API-Key': cfg.apiKey },
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(data?.error?.message || `Apiframe poll error ${res.status}`);
    }
    const status = String(data.status || '').toUpperCase();
    if (status === 'COMPLETED') {
      const r = data.result;
      const videoUrl: string | undefined =
        r?.videoUrl || r?.url || (typeof r === 'string' ? r : undefined) || data.videoUrl;
      if (!videoUrl) return { status: 'failed', error: 'Completed but no video URL returned.' };
      return { status: 'completed', videoUrl };
    }
    if (status === 'FAILED' || status === 'CANCELLED') {
      return { status: 'failed', error: data.error?.message || data.message || 'Generation failed.' };
    }
    return { status: 'processing' };
  }

  if (cfg.provider === 'openrouter') {
    const url = task.pollUrl || `https://openrouter.ai/api/v1/videos/${task.providerTaskId}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'HTTP-Referer': 'https://seedance-studio.app',
        'X-Title': 'Seedance Studio',
      },
    });
    const data = await readJsonSafe(res);
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenRouter poll error ${res.status}`);
    }
    const status: string = data.status || data.state || '';
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const videoUrl: string | undefined =
        data.unsigned_urls?.[0] || data.video_url || data.output?.[0] || data.data?.video_url;
      if (!videoUrl) return { status: 'failed', error: 'Completed but no video URL returned.' };
      return { status: 'completed', videoUrl };
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      return { status: 'failed', error: data.error?.message || data.message || 'Generation failed.' };
    }
    return { status: 'processing' };
  }

  const base = (cfg.baseUrl || BYTEPLUS_DEFAULT_BASE).replace(/\/$/, '');
  const res = await fetch(`${base}/contents/generations/tasks/${task.providerTaskId}`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  const data = await readJsonSafe(res);
  if (!res.ok) {
    throw new Error(data?.error?.message || `BytePlus poll error ${res.status}`);
  }
  const status: string = data.status || data.data?.status || '';
  if (status === 'succeeded' || status === 'completed' || status === 'success') {
    const videoUrl: string | undefined =
      data.content?.video_url || data.data?.content?.video_url || data.video_url;
    if (!videoUrl) return { status: 'failed', error: 'Completed but no video URL returned.' };
    return { status: 'completed', videoUrl };
  }
  if (status === 'failed' || status === 'error' || status === 'cancelled') {
    return { status: 'failed', error: data.error?.message || data.message || 'Generation failed.' };
  }
  return { status: 'processing' };
}

/** Resolve provider config: request headers win, env vars are the fallback. */
export function resolveConfig(req: {
  headers: Record<string, string | string[] | undefined>;
}): ProviderConfig {
  const h = (name: string): string | undefined => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const provider = (h('x-seedance-provider') as ProviderId) || 'apiframe';
  const envKey =
    provider === 'openrouter'
      ? process.env.OPENROUTER_API_KEY
      : provider === 'byteplus'
        ? process.env.ARK_API_KEY
        : process.env.APIFRAME_API_KEY;
  const apiKey = h('x-seedance-key') || envKey || '';
  return {
    provider,
    apiKey,
    baseUrl: h('x-seedance-base-url') || undefined,
    model: h('x-seedance-model') || undefined,
  };
}
