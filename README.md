# SignalizeAI

**Know when your target accounts change.**

[![CI](https://github.com/SignalizeAI/SignalizeAI/actions/workflows/ci.yml/badge.svg)](https://github.com/SignalizeAI/SignalizeAI/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-featured-4285F4.svg)](https://signalizeai.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-brightgreen.svg)](./manifest.chrome.release.json)

SignalizeAI turns any company website into a sales brief, then keeps watching it
and tells you what changed since last time.

Prospecting tools tell you who a company is once. The useful signal is the
_delta_: they published a pricing page, they opened an enterprise tier, they
started hiring platform engineers. That is the moment worth an email, and it is
invisible unless something re-reads the site for you.

**[Install from the Chrome Web Store](https://signalizeai.org)** ·
[Website](https://signalizeai.org) ·
[Pricing](https://signalizeai.org/pricing) ·
[Privacy](https://signalizeai.org/privacy)

---

## Why

A sales brief goes stale the moment you generate it. Re-running the same
research by hand every week does not scale past a handful of accounts, so in
practice nobody does it, and the trigger to reach out gets missed.

SignalizeAI takes the snapshot once, then re-reads on a schedule and diffs
against what it saw last time. You get told only the difference.

## What it does

**Prospect any site.** Reads the page you are on, or any URL you paste, and
produces what they do, company overview, value proposition, target customer,
sales readiness, and the persona most worth contacting.

**Write the outreach.** Three outreach approaches, one recommended email, and
follow-ups, all grounded in the brief rather than a template.

**Watch for change.** Saving a prospect puts it under watch. A background sweep
re-reads watched domains and surfaces only what moved:

| Signal    | Why it matters                                           |
| --------- | -------------------------------------------------------- |
| Pricing   | New tier, price move, or a pricing page appearing at all |
| Hiring    | Roles added to the careers page                          |
| Messaging | The homepage headline or positioning was rewritten       |
| New pages | A section that did not exist on the last read            |

Each alert carries the before and after, plus a suggested opener you can copy.

**Work in bulk.** CSV upload or pasted URLs, multi-select save, bulk outreach
generation, CSV and Excel export.

## How change detection works

The sweep runs in the background service worker, driven by `chrome.alarms`.
Each pass fetches the homepage, plus the pricing and careers pages when it can
find them, extracts a structured snapshot, and compares it to the last stored
one.

Two design decisions worth calling out, because they are the ones people ask
about:

**Choose browser-only or opt-in server monitoring.** Existing browser watchers
keep fetching from your device while the browser runs. The website's
[opportunity inbox](https://signalizeai.org/opportunities) adds offering context,
evidence and editable introductions. Its Monitored accounts screen lets you
explicitly switch a saved company to server checks while your browser is closed.
No account is automatically enrolled in server monitoring. See [privacy](PRIVACY.md).

**The differ is tuned to stay quiet.** Whitespace, reordered navigation,
tracking parameters, and a page that suddenly reports no prices at all (almost
always a failed render, not a real change) are all suppressed. A monitoring tool
that cries wolf gets muted in a week.

Check frequency is the paid lever: Free weekly, Pro every 48 hours, Team daily.

## Session recovery

The side panel and background watches share one session in `chrome.storage.local`
and serialize token rotation with the browser's Web Locks API. The panel loads
one Supabase client. Website sync preserves expiry and never replaces a newer
extension session with an older website token.

After updating an unpacked extension, reload it at `chrome://extensions` and
reopen the panel. If Supabase already revoked the old refresh token, sign in
again once. Reloading cannot restore a revoked session.

## Tech stack

Manifest V3 · TypeScript · esbuild · Supabase (auth and storage) · Cloudflare
Workers backend

## Local development

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_ENV=dev
```

`API_ENV=dev` points the extension at `https://dev-api.signalizeai.org` and
`http://localhost:3000`.

Pick a manifest, then build:

```bash
# Chrome
cp manifest.chrome.dev.json manifest.json && npm run build

# Firefox
cp manifest.firefox.dev.json manifest.json && npm run build
```

Load it:

- Chrome: load this directory as an unpacked extension at `chrome://extensions`
- Firefox: load this directory as a temporary add-on

> The manifest lives at the repository root, not in `extension/`. `extension/`
> holds build output only.

### Build commands

| Command                     | What it does                             |
| --------------------------- | ---------------------------------------- |
| `npm run build`             | Builds using the current `manifest.json` |
| `npm run build:chrome`      | Production Chrome build                  |
| `npm run build:firefox`     | Production Firefox build                 |
| `npm run build:chrome:dev`  | Dev Chrome manifest, then build          |
| `npm run build:firefox:dev` | Dev Firefox manifest, then build         |
| `npm run dev`               | Chromium watch flow                      |
| `npm run dev:firefox`       | Firefox watch flow                       |

### Checks

| Command                | What it does                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`         | ESLint                                                                                                                                                                   |
| `npm run test`         | Unit tests for the differ, plus a load test that replays real captured HTML from three production sites to confirm it fires on genuine changes and stays silent on noise |
| `npm run format`       | Prettier write                                                                                                                                                           |
| `npm run format:check` | Prettier check                                                                                                                                                           |

## Gotchas

- Production manifests only inject the website bridge on `signalizeai.org`. Dev
  manifests also allow localhost syncing.
- `build:chrome` and `build:firefox` **overwrite `manifest.json`**. Re-copy the
  right manifest before rebuilding if you switch between prod and local.
- `src/config.ts` is generated by `build.ts` and is not committed. Release builds
  set `BUILD_TARGET=release`, which pins the API to production regardless of
  `API_ENV`, and the build aborts if the generated config points anywhere else.
- Every build clears `extension/*.js` first, so content-hashed chunks from an
  earlier (possibly dev-targeted) build cannot end up in a release package.

## Contributing

Contributions are welcome. Start with
[CONTRIBUTING.md](./CONTRIBUTING.md), and look for issues labelled
[good first issue](https://github.com/SignalizeAI/SignalizeAI/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md) before opening a pull
request, and [SECURITY.md](./SECURITY.md) before reporting anything
security-related.

## Support

- Website: <https://signalizeai.org>
- Contact: <https://signalizeai.org/contact>
- Email: <support@signalizeai.org>

## License

[MIT](./LICENSE)
