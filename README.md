<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./icons/128.png" />
    <source media="(prefers-color-scheme: light)" srcset="./icons/128(light).png" />
    <img src="./icons/128(light).png" alt="SignalizeAI" width="128" />
  </picture>
</p>

<h1 align="center">SignalizeAI Extension</h1>

<p align="center">
  <strong>Sell to any company in seconds</strong><br />
  Get sales-ready insights and outreach in seconds
</p>

SignalizeAI is a Chrome and Firefox extension that turns any public company website into a usable prospect record. It helps users move from a website to sales context, outreach emails, follow-ups, and saved prospects without leaving the browser.

## What The Extension Does

- Prospects the current website or any URL through Quick Website Check
- Generates sales-ready fields like:
  - what they do
  - target customer
  - value proposition
  - sales readiness
  - best persona
  - outreach angle
- Generates outreach emails:
  - 3 approaches
  - 1 recommended email
  - follow-up emails
- Supports Saved Prospects with:
  - status tracking
  - search and filtering
  - CSV / Excel export on supported plans
- Supports Batch Prospecting with:
  - CSV upload or pasted URLs
  - bulk prospecting
  - per-row / bulk outreach generation
  - follow-up generation
  - save selected / save all
- Syncs with the website dashboard for:
  - auth state
  - prospect status
  - prospect content updates
  - theme changes

## Plans

- Free: 5 prospects/day, save up to 3 prospects
- Pro: 50 prospects/day, batch prospecting, saved search/filter, export, priority support
- Team: 500 prospects/day, larger batch limits, larger saved limits, team-scale workflows

## Tech Stack

- Manifest V3 browser extension
- TypeScript + esbuild
- Supabase for auth and saved prospect storage
- Cloudflare Workers backend for AI and billing endpoints

## Project Structure

```text
SignalizeAI/
├── background.ts
├── build.ts
├── content-auth-bridge.ts
├── content-extractor.ts
├── sidepanel.ts
├── sidepanel-loader.ts
├── sidepanel-partials/
├── sidepanel-styles/
├── src/
│   ├── analysis/
│   ├── handlers/
│   ├── outreach-messages/
│   ├── saved/
│   └── sidepanel/
├── manifest.chrome*.json
└── manifest.firefox*.json
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` with at least:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_ENV=dev
```

`API_ENV=dev` points the extension to:

- `https://dev-api.signalizeai.org`
- `http://localhost:3000`

3. Choose the browser manifest and build.

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

4. Load the extension manually:

- Chrome: load the `SignalizeAI/` folder as an unpacked extension
- Firefox: load the `SignalizeAI/` folder as a temporary add-on

## Build Commands

- `npm run build`  
  Builds using the current `manifest.json`

- `npm run build:chrome`  
  Production Chrome build

- `npm run build:firefox`  
  Production Firefox build

- `npm run build:chrome:dev`  
  Chrome dev manifest + build

- `npm run build:firefox:dev`  
  Firefox dev manifest + build

- `npm run dev`  
  Chromium watch flow with auto-reload

- `npm run dev:firefox`  
  Firefox watch flow

## Quality Checks

- `npm run lint`
- `npm run format`
- `npm run format:check`

## Auth And Security Notes

- Google sign-in uses Supabase auth
- Saved prospects live in Supabase
- Production manifests only inject the website bridge on `signalizeai.org`
- Dev manifests also allow localhost website syncing for local testing

## Support

- Website: https://signalizeai.org
- Email: support@signalizeai.org
- Privacy: https://signalizeai.org/privacy
