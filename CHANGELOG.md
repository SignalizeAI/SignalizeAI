# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.6.0] - 2026-11-18

- Link to the new website opportunity inbox from the account changes panel.
- Document separate browser/server monitoring consent, storage and profile processing; browser watching remains unchanged.

## [Unreleased]

## [5.5.0]

### Added

- **Account change detection.** Saving a prospect puts it under watch. A
  `chrome.alarms` sweep re-reads watched domains, diffs each read against the
  previous snapshot, and surfaces only what changed: pricing, hiring, homepage
  messaging, and new pages. Free checks weekly, Pro every 48 hours, Team daily.
- A "What changed" feed with a per-alert suggested opener, an action badge for
  unseen changes, and a snapshot timeline per prospect.
- Bundled Geist and Geist Mono. MV3's CSP blocks font CDNs, so the faces ship
  inside the extension package rather than being fetched at runtime.

### Changed

- Redesigned the side panel on a neutral charcoal ground with a single cyan
  accent taken from the app icon. Semantic colours (success, warning, danger)
  are now independent of the accent, so "needs attention" no longer looks like
  "this is a button".
- Saved prospect cards rebuilt: the company name gets its own full-width line
  and is never truncated, status pairs with the domain, and row actions are
  revealed on hover instead of crowding the card.
- Status is a labelled dot rather than a filled pill, matching the change feed.
- Watch is a switch, not a bare checkbox.
- Labels throughout are small tracked mono, and the content they label is now
  full strength. Previously the label was louder than the answer.
- The usage bar wraps its counters as whole units and never clips the upgrade
  action.

### Fixed

- **"Check now" silently did nothing.** The manual sweep was gated behind the
  plan's check interval, so on Free it was a no-op for up to a week and read as
  a broken feature.
- A first check reported "nothing changed" when it had only captured a
  baseline, which is indistinguishable from a real no-change.
- An unwatched prospect claimed "Checked 2h ago" until the toggle was flipped;
  the initial render did not apply the rule the toggle handler already used.
- Editing a prospect's status opened the card and hid every action button.
- Toasts could not be dismissed and stayed parked on the bottom edge.
- Four inline event handlers in the analysis view never ran, because MV3's CSP
  blocks inline JavaScript. The focus ring and press states were dead markup.
- The Help center menu item did nothing. It now opens the contact page.
- Removed an unreachable batch-error panel whose two buttons were never wired.
- Accessibility: 19 contrast and labelling violations across the panel, down to
  zero. A disabled-looking button that was never actually `disabled`, and two
  unlabelled range inputs.

## [5.4.1]

See the [releases page](https://github.com/SignalizeAI/SignalizeAI/releases)
for versions before this changelog was introduced.

[Unreleased]: https://github.com/SignalizeAI/SignalizeAI/compare/v5.5.0...HEAD
[5.5.0]: https://github.com/SignalizeAI/SignalizeAI/compare/v5.4.1...v5.5.0
[5.4.1]: https://github.com/SignalizeAI/SignalizeAI/releases/tag/v5.4.1
