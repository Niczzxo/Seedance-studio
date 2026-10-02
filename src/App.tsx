import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard, Download, Film, Loader2, Play, Plus, Minus,
  Settings as SettingsIcon, Trash2, X, KeyRound, AlertTriangle, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import {
  api, loadSettings, saveSettings, DEFAULT_SETTINGS,
  PROVIDER_MODELS, type Job, type StudioSettings, type ProviderId,
} from './lib/api';

const DURATIONS = [5, 10, 15, 30];
const RATIOS = ['16:9', '9:16', '1:1'];

interface LogLine { t: string; msg: string; kind: 'info' | 'ok' | 'err' }

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const inputCls =
  'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-400/70 placeholder:text-zinc-600';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1';

export default function App() {
  const [settings, setSettings] = useState<StudioSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [prompt, setPrompt] = useState('');
  const [multiPrompts, setMultiPrompts] = useState('');
  const [duration, setDuration] = useState(15);
  const [ratio, setRatio] = useState('16:9');
  const [count, setCount] = useState(1);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [log, setLog] = useState<LogLine[]>([
    { t: timeNow(), msg: 'Studio ready. Add your API key in Settings, then start generating.', kind: 'info' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState(false);
  const pollRef = useRef<number | null>(null);

  const pushLog = useCallback((msg: string, kind: LogLine['kind'] = 'info') => {
    setLog((prev) => [{ t: timeNow(), msg, kind }, ...prev].slice(0, 200));
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await api.listJobs();
      setJobs((prev) => {
        const prevMap = new Map(prev.map((j) => [j.id, j.status]));
        list.forEach((j) => {
          const was = prevMap.get(j.id);
          if (was && was !== j.status) {
            if (j.status === 'completed') pushLog(`Done: "${j.prompt.slice(0, 60)}…"`, 'ok');
            if (j.status === 'failed') pushLog(`Failed: ${j.error || j.prompt.slice(0, 60)}`, 'err');
          }
        });
        return list;
      });
      // Poll active jobs individually (backend refreshes provider status on read)
      const active = list.filter((j) => j.status === 'processing' || j.status === 'queued');
      if (active.length) {
        const updated = await Promise.all(active.map((j) => api.getJob(j.id).catch(() => j)));
        setJobs((prev) => {
          const m = new Map(updated.map((j) => [j.id, j]));
          return prev.map((j) => m.get(j.id) || j);
        });
      }
    } catch {
      /* backend unreachable — ignore transient errors */
    }
  }, [pushLog]);

  useEffect(() => {
    refreshJobs();
    pollRef.current = window.setInterval(refreshJobs, 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [refreshJobs]);

  const promptsToQueue = (): string[] => {
    if (mode === 'single') return prompt.trim() ? [prompt.trim()] : [];
    return multiPrompts.split('\n').map((s) => s.trim()).filter(Boolean);
  };

  const startGeneration = async () => {
    const prompts = promptsToQueue();
    if (!prompts.length) {
      pushLog('Write at least one prompt first.', 'err');
      return;
    }
    if (!settings.apiKey.trim()) {
      pushLog('No API key set. Open Settings and add your provider API key.', 'err');
      setShowSettings(true);
      return;
    }
    setSubmitting(true);
    let ok = 0;
    for (let i = 0; i < count; i++) {
      for (const p of prompts) {
        try {
          const job = await api.createJob({ prompt: p, duration, aspectRatio: ratio });
          setJobs((prev) => [job, ...prev]);
          ok++;
          pushLog(`Queued (${duration}s, ${ratio}): "${p.slice(0, 60)}…"`);
        } catch (err: any) {
          pushLog(`Submit failed: ${err.message}`, 'err');
        }
      }
    }
    setSubmitting(false);
    if (ok) {
      setPrompt('');
      if (mode === 'multi') setMultiPrompts('');
      pushLog(`${ok} job(s) submitted.`, 'ok');
    }
  };

  const removeJob = async (id: string) => {
    await api.deleteJob(id).catch(() => undefined);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const activeJobs = jobs.filter((j) => j.status === 'processing' || j.status === 'queued');
  const doneJobs = jobs.filter((j) => j.status === 'completed');
  const shownGallery = galleryFilter ? doneJobs : jobs.filter((j) => j.status !== 'failed');

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      {/* Header */}
      <header className="border-b border-white/10 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 bg-[#0c0c0e]/90 backdrop-blur z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center">
            <Clapperboard className="text-white" size={20} />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight text-white">Seedance Studio</h1>
            <p className="text-[11px] text-zinc-500">AI video generation queue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${settings.apiKey ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'}`}>
            {settings.apiKey ? `${PROVIDER_MODELS[settings.provider].label} connected` : 'No API key'}
          </span>
          <button onClick={() => setShowSettings(true)} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors" title="Settings">
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      {/* Billing honesty banner */}
      <div className="mx-4 md:mx-8 mt-4 flex gap-3 items-start bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
        <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80 leading-relaxed">
          This studio calls the <b>official Seedance APIs</b> (OpenRouter / BytePlus). Generation is
          billed by the provider — it is not free or unlimited. Add your own API key in Settings.
          There is no public API for Dola AI's Seedance 2.5 web app.
        </p>
      </div>

      <main className="px-4 md:px-8 py-6 grid grid-cols-1 xl:grid-cols-3 gap-6 max-w-[1600px] mx-auto">
        {/* Composer */}
        <section className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-5 h-fit">
          <h2 className="font-black text-sm uppercase tracking-widest text-white">What would you like to create?</h2>
          <p className="text-xs text-zinc-500 -mt-3">Describe your idea. The studio handles the queue and downloads.</p>

          <div className="flex bg-black/40 rounded-xl p-1 w-fit">
            {(['single', 'multi'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${mode === m ? 'bg-orange-400/20 text-orange-300' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {m === 'single' ? 'Single prompt' : 'Multiple prompts'}
              </button>
            ))}
          </div>

          {mode === 'single' ? (
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5}
              placeholder="A cinematic drone shot over a misty mountain village at dawn, birds flying, 35mm film look…"
              className={`${inputCls} resize-none`} />
          ) : (
            <textarea value={multiPrompts} onChange={(e) => setMultiPrompts(e.target.value)} rows={5}
              placeholder={'One prompt per line:\nA neon cyberpunk street in rain\nA cozy cabin in snowy forest'}
              className={`${inputCls} resize-none font-mono`} />
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Duration</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={`${inputCls} appearance-none`}>
                {DURATIONS.map((d) => <option key={d} value={d} className="bg-zinc-900">{d}s</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Ratio</label>
              <select value={ratio} onChange={(e) => setRatio(e.target.value)} className={`${inputCls} appearance-none`}>
                {RATIOS.map((r) => <option key={r} value={r} className="bg-zinc-900">{r}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Videos</label>
              <div className="flex items-center gap-1">
                <button onClick={() => setCount(Math.max(1, count - 1))} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><Minus size={14} /></button>
                <span className="flex-1 text-center font-black text-white">{count}</span>
                <button onClick={() => setCount(Math.min(8, count + 1))} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><Plus size={14} /></button>
              </div>
            </div>
          </div>

          <button onClick={startGeneration} disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-400 to-rose-500 text-black font-black uppercase tracking-widest text-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {submitting ? 'Queueing…' : 'Start generation →'}
          </button>
          <p className="text-[11px] text-zinc-600 text-center">Any count. Jobs run through your provider account.</p>
        </section>

        {/* Queue */}
        <section className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-sm uppercase tracking-widest text-white flex items-center gap-2">
              <Film size={16} /> Queue
            </h2>
            <span className="text-[11px] text-zinc-500">{activeJobs.length} active · {jobs.length} total</span>
          </div>
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {jobs.length === 0 && (
              <div className="text-center py-12 text-zinc-600 text-sm">
                <Clapperboard size={32} className="mx-auto mb-3 opacity-30" />
                No videos queued yet.
              </div>
            )}
            {jobs.map((j) => (
              <div key={j.id} className="bg-black/40 border border-white/10 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2 flex-1">{j.prompt}</p>
                  <button onClick={() => removeJob(j.id)} className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors shrink-0" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400">{j.duration}s · {j.aspectRatio}</span>
                  <StatusBadge status={j.status} />
                </div>
                {j.status === 'processing' && (
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-orange-400 to-rose-500 animate-pulse" />
                  </div>
                )}
                {j.status === 'failed' && j.error && (
                  <p className="text-[11px] text-red-400">{j.error}</p>
                )}
                {j.status === 'completed' && (
                  <a href={api.downloadUrl(j.id)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-300 hover:text-orange-200">
                    <Download size={12} /> Download MP4
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 h-fit">
          <h2 className="font-black text-sm uppercase tracking-widest text-white mb-4">Activity</h2>
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 font-mono text-[11px]">
            {log.map((l, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-zinc-600 shrink-0">{l.t}</span>
                <span className={l.kind === 'ok' ? 'text-emerald-400' : l.kind === 'err' ? 'text-red-400' : 'text-zinc-400'}>{l.msg}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Gallery */}
      <section className="px-4 md:px-8 pb-12 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-sm uppercase tracking-widest text-white">Gallery</h2>
          <label className="flex items-center gap-2 text-[11px] text-zinc-500 cursor-pointer select-none">
            <input type="checkbox" checked={galleryFilter} onChange={(e) => setGalleryFilter(e.target.checked)} className="accent-orange-400" />
            Completed only
          </label>
        </div>
        {shownGallery.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-8">Finished videos will appear here.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {shownGallery.map((j) => (
              <div key={j.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                {j.status === 'completed' ? (
                  <video src={api.previewUrl(j.id)} controls preload="metadata" className="w-full aspect-video bg-black" />
                ) : (
                  <div className="w-full aspect-video bg-black/60 flex items-center justify-center">
                    <StatusBadge status={j.status} big />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{j.prompt}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-zinc-600">{j.duration}s · {j.aspectRatio} · {j.model}</span>
                    {j.status === 'completed' && (
                      <a href={api.downloadUrl(j.id)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10" title="Download">
                        <Download size={14} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
            pushLog(`Settings saved — provider: ${PROVIDER_MODELS[s.provider].label}.`, 'ok');
            refreshJobs();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, big }: { status: Job['status']; big?: boolean }) {
  const map = {
    queued: { icon: Clock, cls: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10', label: 'Queued' },
    processing: { icon: Loader2, cls: 'text-sky-400 border-sky-500/30 bg-sky-500/10', label: 'Generating…' },
    completed: { icon: CheckCircle2, cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', label: 'Done' },
    failed: { icon: XCircle, cls: 'text-red-400 border-red-500/30 bg-red-500/10', label: 'Failed' },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 font-bold border rounded-full ${m.cls} ${big ? 'text-xs px-3 py-1.5' : 'text-[10px] px-2 py-0.5'}`}>
      <Icon size={big ? 14 : 11} className={status === 'processing' ? 'animate-spin' : ''} />
      {m.label}
    </span>
  );
}

function SettingsModal({ initial, onClose, onSave }: {
  initial: StudioSettings;
  onClose: () => void;
  onSave: (s: StudioSettings) => void;
}) {
  const [form, setForm] = useState<StudioSettings>(initial);
  const set = (k: keyof StudioSettings, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const meta = PROVIDER_MODELS[form.provider as keyof typeof PROVIDER_MODELS];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-6 md:p-8 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg text-white uppercase tracking-tight">Provider settings</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-xl"><X size={18} /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PROVIDER_MODELS) as ProviderId[]).map((p) => (
              <button key={p} type="button" onClick={() => set('provider', p)}
                className={`px-4 py-3 rounded-xl text-sm font-bold border transition-colors ${form.provider === p ? 'border-orange-400/60 bg-orange-400/10 text-orange-200' : 'border-white/10 bg-black/40 text-zinc-400 hover:text-white'}`}>
                {PROVIDER_MODELS[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1 flex items-center gap-1.5">
            <KeyRound size={11} /> API key
          </label>
          <input type="password" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)}
            placeholder="Paste your API key…" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-400/70 font-mono" />
          <p className="text-[11px] text-zinc-600 ml-1">Stored only in your browser (localStorage). Never sent anywhere except the provider API.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Model (optional)</label>
          <select value={form.model} onChange={(e) => set('model', e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-400/70 appearance-none">
            {meta.models.map((m) => <option key={m.id} value={m.id} className="bg-zinc-900">{m.label}</option>)}
          </select>
        </div>

        {form.provider === 'byteplus' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Base URL (optional)</label>
            <input value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)}
              placeholder="https://ark.ap-southeast.bytepluses.com/api/v3"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-400/70 font-mono" />
            <p className="text-[11px] text-zinc-600 ml-1">{meta.baseUrlHint}</p>
          </div>
        )}

        <button onClick={() => onSave({ ...form, apiKey: form.apiKey.trim(), baseUrl: form.baseUrl.trim(), model: form.model })}
          className="w-full py-3.5 rounded-xl bg-white text-black font-bold hover:bg-zinc-200 transition-colors">
          Save settings
        </button>
        <button onClick={() => { onSave({ ...DEFAULT_SETTINGS }); }} className="w-full text-[11px] text-zinc-600 hover:text-zinc-400">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
