<p align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="./icons/128.png"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="./icons/128(light).png"
    />
    <img
      src="./icons/128(light).png"
      alt="SignalizeAI"
      width="128"
    />
  </picture>
</p>

<h1 align="center">SignalizeAI</h1>

<p align="center">
  <strong>Understand any page<br/>AI insights and outreach strategies</strong>
</p>

SignalizeAI helps you quickly understand how any business website is positioned for sales.

With one click, it analyzes publicly available website content to identify:

- What the company does
- Who their ideal customer is
- Their value proposition
- Sales readiness score
- Recommended sales persona

The extension runs directly inside a Chrome or Firefox side panel, allowing you to analyze websites without leaving the page or interrupting your workflow.

It is designed for sales professionals, founders, marketers, and business development teams who want faster insights before outreach, demos, or research.

## ✨ Key features

- AI-powered website analysis
- Sales readiness scoring
- Ideal customer and persona detection
- Save analyses and export on supported plans
- Secure Google sign-in
- Batch analysis for CSV/pasted URLs with retry + fallback handling

## 💳 Subscription plans

- Free: 5 AI analyses/day, save up to 3 analyses
- Pro: 50 AI analyses/day, save up to 200 analyses, detailed save/search/filter, CSV/Excel export, priority email support
- Team: All Pro features, 500 AI analyses/day, save up to 5,000 analyses, priority email support

## 🔐 Authentication

Users can optionally sign in using Google to:

- Save analyses
- Access them later
- Export results as CSV or Excel

Authentication and storage are handled securely using **Supabase**.

## 🧠 AI Processing

- Only publicly visible website text is analyzed
- No personal user data is sent to the AI
- API keys are securely handled server-side
- Requests are rate-limited and protected

## 🔧 Tech Stack

- Chrome & Firefox Extension (Manifest V3)
- JavaScript
- Supabase (Auth & Storage)
- Cloudflare Workers (Backend)
- AI API (Text analysis)

## 🧩 Sidepanel Structure

The side panel uses a loader + partials + modular runtime architecture:

- Entry and loading:
  - [sidepanel.html](sidepanel.html): side panel shell
  - [sidepanel-loader.ts](sidepanel-loader.ts): loads UI partials
  - [sidepanel.ts](sidepanel.ts): runtime entrypoint
- UI templates and styles:
  - [sidepanel-partials/](sidepanel-partials): HTML partials used by the loader
  - [sidepanel-styles/](sidepanel-styles): feature-level CSS files
  - [sidepanel.css](sidepanel.css): style entry/imports
- Runtime source:
  - `src/sidepanel/init.ts`: side panel initialization and handler wiring
  - `src/sidepanel/ui.ts`: core UI orchestration
  - `src/sidepanel/handlers/`: feature handlers (auth, saved, filter, settings, batch)
  - `src/sidepanel/analysis/`: extraction and analysis helpers
  - `src/sidepanel/saved/`: saved/export utilities
- Batch internals:
  - [src/sidepanel/handlers/batch-handlers.ts](src/sidepanel/handlers/batch-handlers.ts): batch entry handler
  - `src/sidepanel/handlers/batch/`: process, render, save, telemetry, state, constants, helpers, types

## ✅ Linting & Formatting

- `npm run lint`
- `npm run format`
- `npm run format:check`

## 🛠 Building

1. Install dependencies:

   ```bash
   npm i
   ```

2. Build for Chrome:

   ```bash
   npm run build:chrome
   ```

3. Build for Firefox:
   ```bash
   npm run build:firefox
   ```

## 🧪 CI & Dev

- Pull requests run `lint` + `format:check`
- `npm run dev` starts esbuild watch and auto-reloads the extension (Chromium)

## 🔒 Backend

The backend is deployed using **Cloudflare Workers** and is **not publicly accessible**.
It exists solely to:

- Secure API keys
- Enforce rate limits
- Process AI requests safely

## 📄 Privacy

SignalizeAI respects user privacy.

- Only publicly available website content is analyzed
- No browsing activity is tracked
- No ads or data selling

See [`PRIVACY.md`](./PRIVACY.md) for full details.

## 📬 Contact

For questions or feedback:

📧 **[support@signalizeai.org](mailto:support@signalizeai.org)**

---
