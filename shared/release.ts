/**
 * QuantEdge releases — one source of truth for the version the platform is on.
 * Series names mark eras; minors ship within a series. Bump CURRENT on every
 * deploy that users would notice and add matching CHANGELOG entries.
 *
 *   1.x  Legacy          → 2026-08-25  original scanners, pre-baseline record (outcomes invalid)
 *   2.0  Baseline        2026-08-26    outcome tracker fixed; honest record starts here
 *   3.0  Nexus           2026-09-24    one nav model, NEXUS, SR 11-7 v2 validation, CVD-safe palette
 *   3.1  Workspace       2026-09-29    GEX/FLOW tool workspaces, journals, loss rules, Discord forum, squeeze radar
 *   3.2  Mobile          next          phone/tablet pass, screenshot parsing, data consistency
 *   4.0  Validated       after SR 11-7 report v6
 */
export interface Release { version: string; series: string; date: string; summary: string }

export const RELEASES: Release[] = [
  { version: '3.1.0', series: 'Workspace', date: '2026-09-29', summary: 'GEX & FLOW workspaces, trade journals, loss rules, Discord trader journals, squeeze radar (measuring)' },
  { version: '3.0.0', series: 'Nexus', date: '2026-09-24', summary: 'One nav model, NEXUS, SR 11-7 v2 model validation, colour-blind-safe palette' },
  { version: '2.0.0', series: 'Baseline', date: '2026-08-26', summary: 'Outcome tracker fixed — the honest track record starts here' },
];

export const CURRENT_RELEASE = RELEASES[0];
export const RELEASE_LABEL = `v${CURRENT_RELEASE.version} · ${CURRENT_RELEASE.series}`;
