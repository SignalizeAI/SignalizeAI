# SignalizeAI Extension

SignalizeAI is the browser extension for turning public company websites into usable prospect records.

Current version: `5.4.1`

## What it does

- Prospects the active website or any URL through Quick Website Check
- Shows a tabbed insights flow:
  - Strategy
  - Emails
  - Snapshot
- Generates:
  - what they do
  - company overview
  - value proposition
  - target customer
  - sales readiness
  - best persona recommendation
  - goal
  - outreach angle
- Generates email content:
  - 3 outreach approaches
  - 1 recommended email
  - follow-up emails
- Saves prospects to Supabase
- Shows saved prospects instead of re-prospecting the same saved website by default
- Opens saved or unsaved analyses on the website through `Open in website`
- Syncs with the website saved prospects workspace at `/prospects`
- Supports Batch Prospecting:
  - CSV upload
  - pasted URLs
  - multi-select save
  - bulk outreach + follow-up generation
  - CSV / Excel export
  - compact batch analysis mode for faster large runs
  - resilient fallback email generation when AI responses fail

## Saved Prospect Features

- search and filter
- prospect status tracking
- copy / open in website / delete actions
- inline status editing
- shared data with the website prospect page
- live reflection on the website saved prospects workspace

## Website Sync

The extension syncs with `signalizeai.org` for:

- auth state
- sign-out state
- theme changes
- prospect status updates
- prospect content refreshes
- install detection

## Tech stack

- Manifest V3
- TypeScript
- esbuild
- Supabase auth + storage
- Cloudflare Workers backend

## Local development

1. Install dependencies

```bash
npm install
```

2. Create `.env.local`

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_ENV=dev
```

`API_ENV=dev` points the extension to:

- `https://dev-api.signalizeai.org`
- `http://localhost:3000`

3. Choose a manifest before building

Chrome local:

```bash
cp manifest.chrome.dev.json manifest.json
npm run build
```

Firefox local:

```bash
cp manifest.firefox.dev.json manifest.json
npm run build
```

4. Load the extension

- Chrome: load `SignalizeAI/` as an unpacked extension
- Firefox: load `SignalizeAI/` as a temporary add-on

## Build commands

- `npm run build`
  - builds using the current `manifest.json`
- `npm run build:chrome`
  - production Chrome build
- `npm run build:firefox`
  - production Firefox build
- `npm run build:chrome:dev`
  - dev Chrome manifest + build
- `npm run build:firefox:dev`
  - dev Firefox manifest + build
- `npm run dev`
  - Chromium watch flow
- `npm run dev:firefox`
  - Firefox watch flow

## Checks

- `npm run lint`
- `npm run format`
- `npm run format:check`

## Important notes

- Production manifests only inject the website bridge on `signalizeai.org`
- Dev manifests also allow localhost syncing with the website
- `npm run build:chrome` and `npm run build:firefox` overwrite `manifest.json`
- If you switch between prod and local testing, re-copy the correct manifest before rebuilding

## Support

- Website: https://signalizeai.org
- Privacy: https://signalizeai.org/privacy
- Email: support@signalizeai.org
