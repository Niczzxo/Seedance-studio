# Seedance Studio — AI Video Generator Website

A studio-style web app for generating AI videos with ByteDance **Seedance** models:
prompt queue (single / multiple prompts), duration & aspect-ratio selection,
live activity log, video gallery with preview + download.

## Honest notes

- **There is no "unlimited free" tier.** This app calls the **official paid APIs**.
  Generation is billed by the provider (e.g. roughly $0.14 / 15s clip on BytePlus).
  You must add **your own API key** in the in-app Settings.
- **Seedance 2.5** (as offered inside the Dola AI web app) has **no public API**,
  so this studio integrates the official model APIs instead:
  - **OpenRouter** — `bytedance/seedance-2.0` (global, easiest)
  - **BytePlus ModelArk** (international) / **Volcengine ARK** (China)
- This project does **not** automate third-party web UIs, rotate accounts, or
  farm free credits. Use your own API key within the provider's terms.

## Quick start (local)

```bash
npm install
npm run dev        # http://localhost:3000
```

Open the site → **Settings** (gear icon) → pick a provider → paste your API key → Save.

Optional env fallbacks (used when no key is set in the UI):

```bash
OPENROUTER_API_KEY=...   # for OpenRouter
ARK_API_KEY=...          # for BytePlus / Volcengine
```

## Deploy to Vercel

The repo is Vercel-ready (static frontend + serverless API under `api/`):

1. Import the repo in Vercel (framework: Vite).
2. Deploy — no build config changes needed.
3. (Optional) set `OPENROUTER_API_KEY` / `ARK_API_KEY` in Vercel env vars.

## How it works

- `POST /api/jobs` — submits a generation to the provider, returns a job id.
- `GET /api/jobs/:id` — polls the provider and refreshes job status
  (`processing` → `completed` with `videoUrl`, or `failed`).
- `GET /api/jobs/:id/download` — proxies the finished MP4
  (`?inline=1` streams for preview).
- Jobs are kept in memory; on serverless cold starts the provider remains the
  source of truth — re-polling a known provider task id is not yet persisted.

## Durations

The UI offers 5 / 10 / 15 / 30 seconds. What the provider actually renders
depends on the model — if a duration is rejected, the API error is shown in
the Activity log. For a true 60-second video, generate multiple clips and
stitch them (ffmpeg) — not yet built in.
