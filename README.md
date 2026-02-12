# SignalizeAI

SignalizeAI helps you quickly understand how any business website is positioned for sales.

With one click, it analyzes publicly available website content to identify:

- What the company does
- Who their ideal customer is
- Their value proposition
- Sales readiness score
- Recommended sales persona

The extension runs directly inside a Chrome side panel, allowing you to analyze websites without leaving the page or interrupting your workflow.

It is designed for sales professionals, founders, marketers, and business development teams who want faster insights before outreach, demos, or research.

## ✨ Key features

- AI-powered website analysis
- Sales readiness scoring
- Ideal customer and persona detection
- Save and export analyses (CSV / Excel)
- Secure Google sign-in

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

- Chrome Extension (Manifest V3)
- JavaScript
- Supabase (Auth & Storage)
- Cloudflare Workers (Backend)
- AI API (Text analysis)

## 🧩 Sidepanel Structure

The side panel is split into HTML partials and CSS modules for easier editing.

- HTML partials live in [sidepanel-partials/](sidepanel-partials)
  - [sidepanel.html](sidepanel.html) is a tiny loader that fetches these partials at runtime.
  - If you edit the UI, update the partials, not the generated content.
- CSS is split into feature files in [sidepanel-styles/](sidepanel-styles)
  - [sidepanel.css](sidepanel.css) only imports those files.
- Runtime loader is [sidepanel-loader.js](sidepanel-loader.js)

## ✅ Linting & Formatting

- `npm run lint`
- `npm run format`
- `npm run format:check`

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

See [`privacy.md`](./PRIVACY.md) for full details.

## 📬 Contact

For questions or feedback:

📧 **[support@signalizeai.org](mailto:support@signalizeai.org)**

---
