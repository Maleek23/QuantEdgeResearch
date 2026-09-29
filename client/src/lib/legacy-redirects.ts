/**
 * LEGACY REDIRECTS — the single source of truth for every retired URL.
 *
 * History: the router accumulated ~70 individual <Route><Redirect/></Route>
 * entries as pages were merged into the Terminal shell and the six primary
 * shells (Home / Hunt / GEX / Research / Positions / Journal). They now run
 * through ONE catch-all route (see App.tsx) driven by this table.
 *
 * Rules baked into the table:
 * - Redirect CHAINS were resolved to final destinations. Several legacy paths
 *   pointed at intermediate aliases (/home, /h, /p, /g, /chart-analysis,
 *   /command) that are themselves redirects, and chained redirects drop query
 *   params — so the table records where the user EFFECTIVELY landed, in one hop.
 * - One entry was dead code and is NOT here: a late `/t -> /r/SPY` redirect
 *   shadowed by the real `/t` Terminal route earlier in the Switch. `/t` IS
 *   the Terminal; that redirect could never fire.
 * - Parametric sources (/stock/:symbol etc.) keep their param substitution.
 *
 * - 2026-09-24 retirements (/trade-desk, /automations, /performance) re-broke
 *   the "one hop" rule: a dozen rows still pointed at them (SR 11-7 F7.8). Those
 *   rows now name the final destination, AND the resolver follows chains
 *   (visited set, max 3 hops) and carries query params across every hop, so a
 *   future retirement degrades to an extra hop instead of a dropped query.
 *   research/check-legacy-redirects.ts asserts every row lands on a live route
 *   in one hop — run it after editing this table.
 *
 * To retire another URL: add one line to LEGACY_REDIRECTS, and repoint any rows
 * that targeted it. Nothing else changes.
 */

export type LegacyTarget = string | ((params: Record<string, string>) => string);

/**
 * [source pattern, destination] — exact paths first, then parametric.
 * `:name` segments match a single path segment (no slashes).
 */
export const LEGACY_REDIRECTS: Array<[string, LegacyTarget]> = [
  // ── Shell aliases → Terminal (/t) ──────────────────────────────────────
  ["/nexus", "/t"],
  ["/pos", "/t?tab=positions"],
  ["/j", "/t?tab=journal"],
  ["/p", "/t"],
  ["/h", "/t"],
  ["/g", "/t?tab=gex"],
  ["/btc", "/t?tab=crypto"],
  ["/crypto", "/t?tab=crypto"],
  ["/home", "/t"],
  ["/terminal", "/t"],
  ["/dashboard", "/t"],
  ["/command-center", "/t"],
  ["/command-center-v2", "/t"],
  ["/aion", "/t"],
  ["/paper-trading", "/t"],
  ["/wallet-tracker", "/t"],
  ["/ct-tracker", "/t"],
  ["/research", "/t"],
  ["/market-movers", "/t"],
  ["/movers", "/t"], // was /h?tab=movers → /h → /t (tab dropped by the chain)
  ["/discovery", "/t"], // was /h?tab=ai-picks → /t
  ["/pulse", "/t"], // was /p?tab=pulse → /t
  ["/watchlist", "/t"], // was /h?tab=watchlist → /t
  ["/watchlist/weekly", "/t"],
  ["/weekly-watchlist", "/t"], // was → /watchlist → /t
  ["/smart-signals", "/t"], // was /h?tab=surges → /t
  ["/market-scanner", "/t"], // was /h?tab=surges → /t
  ["/swing-scanner", "/t"], // was /h?tab=surges → /t
  ["/bullish-trends", "/t"], // was /h?tab=surges → /t

  // ── Folded into the Terminal GEX tab ────────────────────────────────────
  ["/whale-flow", "/t?tab=gex"], // was /g?tab=heatmap → /g → /t?tab=gex
  ["/smart-money", "/t?tab=gex"], // was /g?tab=heatmap → /t?tab=gex
  ["/gex-dashboard", "/t?tab=gex"],
  ["/gex-scanner", "/t?tab=gex"],
  ["/gex", "/t?tab=gex"],
  ["/scanner/gex", "/t?tab=gex"],
  ["/gex-legacy", "/t?tab=gex"],

  // ── Research / chart destinations ───────────────────────────────────────
  ["/analyze", "/r/SPY?tab=analyze"],
  ["/chart-analysis", "/r/SPY?tab=chart"],
  ["/pattern-scanner", "/r/SPY?tab=chart"], // was → /chart-analysis → …
  ["/geopolitical", "/r/SPY?tab=chart"], // was → /command → …
  ["/command", "/r/SPY?tab=chart"],
  ["/projector", "/r/SPY?tab=chart"],
  ["/options-analyzer", "/r/SPY?tab=options"],
  ["/terminal/heatmap", "/r/SPY?tab=gex"],
  ["/spx", "/r/SPX?tab=chart"],

  // ── Parametric (kept as functions) ─────────────────────────────────────
  ["/invite/:token", (p) => `/invite?code=${p.token}`],
  ["/stock/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/terminal/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/t/:symbol/:tab", (p) => `/r/${p.symbol}`],
  ["/t/:symbol", (p) => `/r/${p.symbol}`],
  ["/command/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/gex/:symbol", (p) => `/r/${p.symbol}?tab=gex`],

  // ── Trade Desk (retired 2026-09-24 → Slate) ───────────────────────────
  ["/trade-desk-v2", "/slate"],
  ["/discover", "/slate"],
  ["/wsb-trending", "/slate"],
  ["/social-trends", "/slate"],
  ["/ai-stock-picker", "/slate"],
  ["/trade-ideas", "/slate"],
  // Retired 2026-09-24 (nav-architecture test N6): Trade Desk duplicated the
  // NEXUS board and Slate and read "0 ideas" while the board had them;
  // Automations duplicated the BOT tab with a contradictory P&L.
  ["/trade-desk", "/slate"],
  ["/automations", "/t?tab=bot"],
  // PERF duplicated JOURNAL › Track record (same component, two doors).
  ["/performance", "/t?tab=journal&jtab=metrics"],
  // Slate is the ranked-ideas surface Trade Desk's "todays-best" preset was.
  ["/convictions", "/slate"],
  // The Trade Desk futures tab has no successor surface; Slate is the ideas home.
  ["/futures", "/slate"],
  ["/futures-research", "/slate"],

  // ── Performance (retired 2026-09-24 → JOURNAL › Track record) ───────────
  ["/trading-engine", "/t?tab=journal&jtab=metrics"],
  ["/historical-intelligence", "/t?tab=journal&jtab=metrics"],
  ["/smart-advisor", "/t?tab=journal&jtab=metrics"],
  ["/convictions/backtest", "/t?tab=journal&jtab=metrics"],
  ["/data-audit", "/t?tab=journal&jtab=metrics"],
  ["/insights", "/t?tab=journal&jtab=metrics"],
  ["/analytics", "/t?tab=journal&jtab=metrics"],
  ["/signals", "/t?tab=journal&jtab=metrics"],

  // ── Misc ───────────────────────────────────────────────────────────────
  ["/watchlist-bot", "/t?tab=bot"], // Automations retired 2026-09-24 → BOT tab
  ["/account", "/settings"],
  ["/my-account", "/settings"],
  ["/trading-guide", "/blog/how-to-trade-like-a-pro"],
  ["/learn-more", "/"],
];

interface CompiledEntry {
  regex: RegExp;
  keys: string[];
  target: LegacyTarget;
}

function compilePattern(pattern: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const src = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${src}$`), keys };
}

const COMPILED: CompiledEntry[] = LEGACY_REDIRECTS.map(([pattern, target]) => ({
  ...compilePattern(pattern),
  target,
}));

/** One table lookup, no chain following. Exported for the hygiene check. */
export function resolveLegacyRedirectOnce(pathname: string): string | null {
  const path = pathname.split("?")[0].split("#")[0];
  for (const { regex, keys, target } of COMPILED) {
    const m = regex.exec(path);
    if (!m) continue;
    if (typeof target === "string") return target;
    const params: Record<string, string> = {};
    keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1]);
    });
    return target(params);
  }
  return null;
}

/** Max redirects followed for one legacy URL (T11). */
export const MAX_REDIRECT_HOPS = 3;

function splitUrl(url: string): { path: string; params: URLSearchParams } {
  const noHash = url.split("#")[0];
  const q = noHash.indexOf("?");
  return q < 0
    ? { path: noHash, params: new URLSearchParams() }
    : { path: noHash.slice(0, q), params: new URLSearchParams(noHash.slice(q + 1)) };
}

/**
 * Resolve a legacy URL to its FINAL destination, or null if it isn't legacy.
 *
 * - Follows chains (a target that is itself legacy) with a visited set and at
 *   most MAX_REDIRECT_HOPS hops, so a cycle can't spin.
 * - Preserves query params across every hop: the incoming query is kept, and a
 *   hop's own target params win on conflicts (they are what route it — e.g.
 *   `tab=bot`). `/performance?jtab=x` still lands on the Track record tab.
 *
 * `search` is the incoming query string. wouter's useLocation() returns only
 * the pathname, so when it is omitted and `pathname` carries no query, the
 * current window.location.search is used — but only if window's pathname is
 * the one being resolved. Without a window (tests, scripts) this is pure.
 */
export function resolveLegacyRedirect(pathname: string, search?: string): string | null {
  let { path, params } = splitUrl(pathname);
  if (search === undefined && !pathname.includes("?") && typeof window !== "undefined" && window.location?.pathname === path) {
    search = window.location.search;
  }
  if (search) {
    new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).forEach((v, k) => {
      if (!params.has(k)) params.set(k, v);
    });
  }

  const visited = new Set<string>([path]);
  let resolved = false;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const next = resolveLegacyRedirectOnce(path);
    if (next == null) break;
    const { path: nextPath, params: nextParams } = splitUrl(next);
    nextParams.forEach((v, k) => params.set(k, v)); // hop target wins on conflicts
    path = nextPath;
    resolved = true;
    if (visited.has(path)) break; // cycle — stop where we are
    visited.add(path);
  }
  if (!resolved) return null;
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Single wouter Route pattern matching every legacy source path.
 * Built from the same table so the route and the resolver can never drift.
 */
export const LEGACY_REDIRECT_PATTERN: RegExp = new RegExp(
  `^(?:${LEGACY_REDIRECTS.map(([p]) => compilePattern(p).regex.source.slice(1, -1)).join("|")})$`
);
