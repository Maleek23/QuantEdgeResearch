/**
 * Route guards — one auditable table of routes that registered WITHOUT an auth
 * middleware but must not be public (security review 2026-09-30,
 * docs/SECURITY_REVIEW_2026-09-30.md).
 *
 * Before this table, anyone on the internet could, with no session:
 *   - start/stop the Alpaca trade executor, rewrite its rules and fire a signal
 *     as an order (/api/executor/*), read the operator's Alpaca account and
 *     personal portfolio (/api/alpaca/*, /api/portfolio/*);
 *   - point the operator's SMS alerts at their own phone;
 *   - delete any trade idea, rewrite its outcome (/performance), inject ideas
 *     into the official book, post to the Discord channels;
 *   - dump every trade idea including live, member-only ones
 *     (/api/trade-ideas/debug/raw, /api/audit/trade-ideas).
 * None of these are called by the client (checked with grep over client/src),
 * so gating them costs the product nothing.
 *
 * Levels:
 *   operator  — admin JWT (admin_token cookie / Bearer) or a signed-in admin user
 *   member    — the same check as requireBetaAccess (beta / pro / admin)
 *   signed-in — any session user
 *
 * Matching is case-insensitive and ignores a trailing slash, because Express
 * routing is (a "/API/Executor/start/" request still reaches the handler).
 */

export type GuardLevel = 'operator' | 'member' | 'signed-in';

interface GuardRule {
  level: GuardLevel;
  /** HTTP methods the rule applies to; '*' = all, 'write' = anything but GET/HEAD/OPTIONS. */
  methods: '*' | 'write' | string[];
  pattern: RegExp;
}

const WRITE = 'write' as const;
const ANY = '*' as const;

/** Static (non-id) children of /api/trade-ideas/ that are not by-id reads. */
const TRADE_IDEA_STATIC = new Set(['add', 'best-setups', 'cleanup', 'debug', 'from-chart', 'ingest-all', 'news']);

export const ROUTE_GUARDS: GuardRule[] = [
  // ── Operator's broker, executor, personal portfolio, SMS ──
  { level: 'operator', methods: ANY, pattern: /^\/api\/executor(\/.*)?$/ },
  { level: 'operator', methods: ANY, pattern: /^\/api\/alpaca(\/.*)?$/ },
  { level: 'operator', methods: ANY, pattern: /^\/api\/portfolio(\/.*)?$/ },
  { level: 'operator', methods: ANY, pattern: /^\/api\/picks\/config$/ },
  { level: 'operator', methods: ANY, pattern: /^\/api\/notifications\/sms(\/.*)?$/ },

  // ── The official idea book and its record ──
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/trade-ideas$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/trade-ideas\/(add|from-chart)$/ },
  { level: 'operator', methods: ['DELETE'], pattern: /^\/api\/trade-ideas\/[^/]+$/ },
  { level: 'operator', methods: ['PATCH'], pattern: /^\/api\/trade-ideas\/[^/]+\/(performance|promote)$/ },
  { level: 'operator', methods: ['GET'], pattern: /^\/api\/trade-ideas\/debug\/raw$/ },
  { level: 'operator', methods: ['GET'], pattern: /^\/api\/audit\/trade-ideas$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/trade-desk\/ideas\/(from-earnings|from-earnings\/bulk|from-gex)$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/(quant\/generate-ideas|quant\/generate-futures|flow\/generate-ideas|ai\/generate-ideas|hybrid\/generate-ideas|ai\/parse-chat-idea)$/ },
  { level: 'operator', methods: WRITE, pattern: /^\/api\/futures-research\/generate(-all|\/[^/]+)$/ },
  { level: 'operator', methods: WRITE, pattern: /^\/api\/ml\/retraining\/.+$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/learning\/analyze$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/market-data$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/catalysts(\/sync-earnings)?$/ },

  // ── Scanner / ingest triggers (write ideas or burn provider quota) ──
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/(earnings\/scan|popular-tickers\/scan|movers\/scan-options|refresh-prices|bear-flag-scanner\/ingest|index-scalps\/run|gex-history\/archive-now|automations\/bot-watchlist\/refresh)$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/gex-scanner\/(run|scan-batch)$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/radar\/(scan|scan\/forming|resolve)$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/btc\/(scan|push-all)$/ },
  { level: 'operator', methods: WRITE, pattern: /^\/api\/detection\/.+$/ },

  // ── Discord posting + shared lists ──
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/chart-analysis\/(send-to-trade-desk|send-to-discord|discord)$/ },
  { level: 'operator', methods: WRITE, pattern: /^\/api\/annual-watchlist(\/.*)?$/ },
  { level: 'operator', methods: ['POST'], pattern: /^\/api\/watchlist\/batch-add$/ },

  // ── Global (not per-user) AI chat: one shared history for every caller ──
  { level: 'operator', methods: ANY, pattern: /^\/api\/ai\/chat(\/history)?$/ },

  // ── Member-only reads ──
  { level: 'member', methods: ['GET'], pattern: /^\/api\/performance\/export$/ },

  // ── Signed-in actions the client does make ──
  { level: 'signed-in', methods: ['POST'], pattern: /^\/api\/alerts\/(relay|level)$/ },
  { level: 'signed-in', methods: ['DELETE'], pattern: /^\/api\/alerts\/level\/[^/]+$/ },
  { level: 'signed-in', methods: ['POST'], pattern: /^\/api\/trade-desk\/ideas\/from-contract-analysis$/ },
  { level: 'signed-in', methods: ['POST'], pattern: /^\/api\/gex-scanner\/scan-ticker$/ },
];

function methodMatches(rule: GuardRule, method: string): boolean {
  if (rule.methods === ANY) return true;
  if (rule.methods === WRITE) return !/^(GET|HEAD|OPTIONS)$/.test(method);
  return rule.methods.includes(method) || (method === 'HEAD' && rule.methods.includes('GET'));
}

/** Normalise the way Express matches: case-insensitive, trailing slashes ignored. */
export function normalisePath(path: string): string {
  const p = path.toLowerCase().replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** The strongest guard that applies to this request, or null when the route is not in the table. */
export function guardFor(method: string, rawPath: string): GuardLevel | null {
  const m = method.toUpperCase();
  const path = normalisePath(rawPath);
  const rank: Record<GuardLevel, number> = { 'signed-in': 1, member: 2, operator: 3 };
  let best: GuardLevel | null = null;
  for (const rule of ROUTE_GUARDS) {
    if (!methodMatches(rule, m) || !rule.pattern.test(path)) continue;
    if (!best || rank[rule.level] > rank[best]) best = rule.level;
  }
  // A single trade idea (and its audit trail) by id is member data: the list
  // endpoint is requireBetaAccess, so the by-id read must not be public either.
  if (!best && (m === 'GET' || m === 'HEAD')) {
    const byId = /^\/api\/trade-ideas\/([^/]+)(\/audit)?$/.exec(path);
    if (byId && !TRADE_IDEA_STATIC.has(byId[1])) best = 'member';
  }
  return best;
}
