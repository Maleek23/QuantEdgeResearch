# Changelog

All notable user-facing changes. Format: [Keep a Changelog](https://keepachangelog.com).
Update this in the same PR as the change.

## [Unreleased]
### Added
- **Terminal (`/t`)** — one shell, five tabs (Oracle · Flow · Heatmap · GEX · PRISM) with a
  shared motion system, sliding tab underline, live uptime, wired to the real engines.
- Oracle Orb (market-regime centerpiece) and Rotation Map (RRG) components.
- Oracle **signal-detail widgets** — Price Ladder (stop/entry/live/target with %/$/away),
  Confidence Index bars (Conviction/Progress/R:R/Structure), and a Context panel with a
  "what to do now" line — all derived from real ConvictionPick data. Wired into the cockpit.
- `/t` is now **full-bleed, no sidebar** (top-nav only, ADR-0001).
- Canonical docs set in `docs/` (Architecture, Onboarding, Runbook, Team) + ADR process + this changelog.
- Cash-secured-put income screener, catalyst research endpoints, cash-gate grade dampening.

### Changed
- Options win-rate now reports **honest realized contract P&L** (was a fabricated ~99.7%).
- Grades display convictionScore-first (single source of truth for score↔grade).

### Fixed
- Duplicate `start:worker` script in package.json.
- News rate-limit honesty (`data.Information` now counted); idea dedup defaults.

### Known issues
- `/t` renders inside the legacy sidebar (double chrome) — full-bleed top-nav is next (ADR-0001).
- Grades are not yet calibrated (needs weeks of instrumented outcomes → reweight).
- Root has ~40 superseded `.md` files pending a sweep into `docs/archive/`.
