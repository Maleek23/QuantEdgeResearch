/**
 * LEGACY REDIRECTS — the single source of truth for every retired URL.
 *
 * History: the router accumulated ~70 individual <Route><Redirect/></Route>
 * entries as pages were merged into the Terminal shell and the six primary
 * shells (Home / Hunt / GEX / Research / Positions / Journal). They now run
 * through ONE catch-all route (see App.tsx) driven by this table.
 *
 * Rules baked into the table:
 * - ONE HOP. Every row names the final destination; no row targets another
 *   legacy path. research/check-legacy-redirects.ts asserts this.
 * - KEEP THE TAB. When a retired page had a successor TAB (terminal ?tab=,
 *   journal ?jtab=, radar ?tab=), the row lands on that tab — not on the bare
 *   shell. (2026-09-29 IA pass: ~12 rows used to drop their tab because they
 *   were resolved through old chains like /h?tab=surges → /h → /t.)
 * - The resolver ALSO follows chains (visited set, ≤ MAX_REDIRECT_HOPS) and
 *   carries query params across every hop, so a future retirement that forgets
 *   to repoint a row degrades to an extra hop instead of a dropped query.
 * - Parametric sources (/stock/:symbol etc.) keep their param substitution.
 *
 * docs/IA_SYSTEM_DESIGN.md §5 holds the full old → new map this table encodes.
 *
 * To retire another URL: add one line here, repoint any rows that targeted it,
 * run `npx tsx research/check-legacy-redirects.ts`.
 */

export type LegacyTarget = string | ((params: Record<string, string>) => string);

/**
 * [source pattern, destination] — exact paths first, then parametric.
 * `:name` segments match a single path segment (no slashes).
 */
export const LEGACY_REDIRECTS: Array<[string, LegacyTarget]> = [
  // ── Shell aliases → Terminal (/t) ──────────────────────────────────────
  ["/nexus", "/t"],
  ["/nexus-prototype", "/t"], // the board it prototyped IS the NEXUS tab
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
  ["/paper-trading", "/t?tab=bot"], // paper trading lives in the BOT tab
  ["/wallet-tracker", "/t?tab=crypto"],
  ["/ct-tracker", "/t?tab=crypto"],
  // NEXUS carries the movers + watchlist rails and the market pulse.
  ["/market-movers", "/t"],
  ["/movers", "/t"],
  ["/pulse", "/t"],
  ["/watchlist", "/t"],
  ["/watchlist/weekly", "/t"],
  ["/weekly-watchlist", "/t"],

  // ── Scanners → Radar (the setup-discovery surface) ─────────────────────
  ["/discovery", "/today"], // was /h?tab=ai-picks → /radar picks (Radar retired 2026-09-29; the ranked book is on Today)
  ["/smart-signals", "/t"], // was /h?tab=surges → /radar forming; forming setups = NEXUS › Developing candidates
  ["/market-scanner", "/t"],
  ["/swing-scanner", "/t"],
  ["/bullish-trends", "/t"],
  ["/pattern-scanner", "/t"],

  // ── Flow and GEX ────────────────────────────────────────────────────────
  ["/whale-flow", "/t?tab=flow"], // whale prints are options flow
  ["/smart-money", "/t?tab=flow"],
  ["/gex-dashboard", "/t?tab=gex"],
  ["/gex-scanner", "/t?tab=gex"],
  ["/gex", "/t?tab=gex"],
  ["/scanner/gex", "/t?tab=gex"],
  ["/gex-legacy", "/t?tab=gex"],

  // ── Research / chart destinations ───────────────────────────────────────
  ["/research", "/r"], // the per-ticker home, not the terminal
  ["/analyze", "/r/SPY?tab=analyze"],
  ["/chart-analysis", "/t?tab=chart"],
  ["/command", "/t?tab=chart"],
  ["/geopolitical", "/t?tab=catalyst"], // events live in CATALYST
  ["/projector", "/today"], // the weekly path projection leads Today
  ["/options-analyzer", "/r/SPY?tab=options"],
  ["/terminal/heatmap", "/r/SPY?tab=gex"],
  ["/spx", "/r/SPX?tab=chart"],
  // Futures: the CHART tab carries the ES translation + futures risk sizer.
  ["/futures", "/t?tab=chart"],
  ["/futures-research", "/t?tab=chart"],

  // ── Parametric (kept as functions) ─────────────────────────────────────
  ["/invite/:token", (p) => `/invite?code=${p.token}`],
  ["/stock/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/terminal/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/t/:symbol/:tab", (p) => `/r/${p.symbol}`],
  ["/t/:symbol", (p) => `/r/${p.symbol}`],
  ["/command/:symbol", (p) => `/r/${p.symbol}?tab=chart`],
  ["/gex/:symbol", (p) => `/r/${p.symbol}?tab=gex`],

  // ── Ideas (Trade Desk retired 2026-09-24) ──────────────────────────────
  // Slate and Radar retired 2026-09-29 (operator: "remove Slate page and
  // Radar"): the ranked book, best idea and gap read live on Today; forming
  // pattern setups on NEXUS › Developing candidates.
  ["/slate", "/today"],
  ["/radar", "/today"],
  ["/trade-desk-v2", "/today"],
  ["/trade-desk", "/today"],
  ["/discover", "/today"],
  ["/wsb-trending", "/today"],
  ["/social-trends", "/today"],
  ["/ai-stock-picker", "/today"],
  ["/trade-ideas", "/today"],
  // "Today's best convictions" (the old ?preset=todays-best) is exactly the
  // ranked book Today renders from /api/convictions. Slate has no presets.
  ["/convictions", "/today"],
  ["/automations", "/t?tab=bot"],
  ["/watchlist-bot", "/t?tab=bot"],

  // ── Journal (PERF folded into JOURNAL › Track record) ──────────────────
  ["/performance", "/t?tab=journal&jtab=record"],
  ["/history", "/t?tab=journal&jtab=trades"],
  ["/trading-engine", "/t?tab=journal&jtab=record"],
  ["/historical-intelligence", "/t?tab=journal&jtab=record"],
  ["/smart-advisor", "/t?tab=journal&jtab=record"],
  ["/convictions/backtest", "/t?tab=journal&jtab=backtest"],
  ["/data-audit", "/t?tab=journal&jtab=record"],
  ["/insights", "/t?tab=journal&jtab=insights"],
  ["/analytics", "/t?tab=journal&jtab=analytics"],
  ["/signals", "/t?tab=journal&jtab=record"],

  // ── Misc ───────────────────────────────────────────────────────────────
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

/** Max redirects followed for one legacy URL. */
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
 *   `tab=bot`).
 *
 * `search` is the incoming query string (wouter's useLocation() returns only
 * the pathname). Pure — no window access — so scripts and tests can call it.
 */
export function resolveLegacyRedirect(pathname: string, search = ""): string | null {
  let { path, params } = splitUrl(pathname);
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

/** Preserve incoming query parameters while allowing the destination to win conflicts. */
export function mergeRedirectQuery(target: string, incomingSearch: string): string {
  const [targetPath, targetQuery = ''] = target.split('?');
  const merged = new URLSearchParams(incomingSearch.startsWith('?') ? incomingSearch.slice(1) : incomingSearch);
  const destination = new URLSearchParams(targetQuery);
  destination.forEach((value, key) => merged.set(key, value));
  const query = merged.toString();
  return query ? `${targetPath}?${query}` : targetPath;
}

/**
 * Single wouter Route pattern matching every legacy source path.
 * Built from the same table so the route and the resolver can never drift.
 */
export const LEGACY_REDIRECT_PATTERN: RegExp = new RegExp(
  `^(?:${LEGACY_REDIRECTS.map(([p]) => compilePattern(p).regex.source.slice(1, -1)).join("|")})$`
);
