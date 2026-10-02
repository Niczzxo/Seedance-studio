export type ProviderId = 'openrouter' | 'byteplus' | 'apiframe';

export interface StudioSettings {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const LS_KEY = 'seedance-studio-settings';

export const DEFAULT_SETTINGS: StudioSettings = {
  provider: 'apiframe',
  apiKey: '',
  baseUrl: '',
  model: '',
};

export function loadSettings(): StudioSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: StudioSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export interface Job {
  id: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  model: string;
  provider: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function authHeaders(): Record<string, string> {
  const s = loadSettings();
  return {
    'x-seedance-provider': s.provider,
    'x-seedance-key': s.apiKey,
    'x-seedance-base-url': s.baseUrl,
    'x-seedance-model': s.model,
  };
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => fetch('/api/health').then(handle),
  listJobs: (): Promise<Job[]> => fetch('/api/jobs').then(handle),
  getJob: (id: string): Promise<Job> =>
    fetch(`/api/jobs/${id}`, { headers: authHeaders() }).then(handle),
  createJob: (input: { prompt: string; duration: number; aspectRatio: string }): Promise<Job> =>
    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(input),
    }).then(handle),
  deleteJob: (id: string): Promise<void> =>
    fetch(`/api/jobs/${id}`, { method: 'DELETE' }).then(() => undefined),
  previewUrl: (id: string) => `/api/jobs/${id}/download?inline=1`,
  downloadUrl: (id: string) => `/api/jobs/${id}/download`,
};

export const PROVIDER_MODELS: Record<ProviderId, { label: string; models: { id: string; label: string }[]; baseUrlHint: string }> = {
  apiframe: {
    label: 'Apiframe — Seedance 2.5',
    baseUrlHint: 'Default: https://api.apiframe.ai/v2',
    models: [
      { id: '', label: 'Default (seedance-2.5 — up to 30s, native audio)' },
      { id: 'seedance-2.5', label: 'seedance-2.5' },
      { id: 'seedance-2', label: 'seedance-2' },
      { id: 'seedance-2-fast', label: 'seedance-2-fast' },
      { id: 'seedance-2-mini', label: 'seedance-2-mini' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrlHint: 'https://openrouter.ai/api/v1 (fixed)',
    models: [
      { id: '', label: 'Default (bytedance/seedance-2.0)' },
      { id: 'bytedance/seedance-2.0', label: 'bytedance/seedance-2.0' },
    ],
  },
  byteplus: {
    label: 'BytePlus ModelArk / Volcengine ARK',
    baseUrlHint: 'Default: https://ark.ap-southeast.bytepluses.com/api/v3 (intl). China: https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { id: '', label: 'Default (dreamina-seedance-2-0-260128)' },
      { id: 'dreamina-seedance-2-5', label: 'dreamina-seedance-2-5 (2.5 — needs console activation)' },
      { id: 'dreamina-seedance-2-0-260128', label: 'dreamina-seedance-2-0-260128 (intl)' },
      { id: 'dreamina-seedance-2-0-fast-260128', label: 'dreamina-seedance-2-0-fast-260128 (intl, fast)' },
      { id: 'doubao-seedance-1-5-pro-251215', label: 'doubao-seedance-1-5-pro-251215' },
    ],
  },
};
