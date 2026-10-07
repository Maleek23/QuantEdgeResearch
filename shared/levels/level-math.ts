/**
 * STRUCTURAL LEVEL MATH — pure, deterministic, no I/O.
 *
 * Every function here takes bars the platform already fetches (Yahoo 5-minute
 * bars with extended hours, Yahoo daily bars) and returns price levels. Nothing
 * is invented: a level exists only when the bars that define it exist, and each
 * one carries the source it was computed from and when.
 *
 * Volume profile is BAR-APPROXIMATED: each 5-minute bar's volume is spread
 * evenly across its high-low range. A true profile needs tick/trade data the
 * platform does not have; the approximation is standard for bar-only charts and
 * is labelled as such everywhere it is shown.
 *
 * The server wrapper (server/levels/level-map.ts) does the fetching and caching.
 */

export interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number }

export type LevelKind =
  | 'vwap' | 'vwap_u1' | 'vwap_l1' | 'vwap_u2' | 'vwap_l2'
  | 'avwap_prior_close' | 'avwap_week' | 'avwap_month'
  | 'pdh' | 'pdl' | 'pdc' | 'pwh' | 'pwl' | 'pwc' | 'pmoh' | 'pmol' | 'pmoc'
  | 'premkt_high' | 'premkt_low' | 'session_high' | 'session_low'
  | 'or5_high' | 'or5_low' | 'or15_high' | 'or15_low' | 'or30_high' | 'or30_low'
  | 'pivot_p' | 'pivot_r1' | 'pivot_s1' | 'pivot_r2' | 'pivot_s2' | 'pivot_r3' | 'pivot_s3'
  | 'cam_h3' | 'cam_h4' | 'cam_l3' | 'cam_l4'
  | 'poc_session' | 'vah_session' | 'val_session' | 'poc_5d' | 'vah_5d' | 'val_5d'
  | 'call_wall' | 'put_wall' | 'zero_gamma' | 'max_gamma'
  | 'dark_pool' | 'round';

/**
 * Independence families. Two kinds in the same family are derived from the same
 * input (VWAP and its σ bands; floor pivots and Camarilla from one H/L/C), so a
 * cluster only counts as CONFLUENT when two different families agree.
 */
export type LevelFamily =
  | 'vwap' | 'avwap' | 'prior_period' | 'premarket' | 'session' | 'opening_range'
  | 'pivot' | 'volume_profile' | 'gex' | 'dark_pool' | 'round';

export const KIND_META: Record<LevelKind, { family: LevelFamily; label: string }> = {
  vwap: { family: 'vwap', label: 'session VWAP' },
  vwap_u1: { family: 'vwap', label: 'VWAP +1σ' },
  vwap_l1: { family: 'vwap', label: 'VWAP −1σ' },
  vwap_u2: { family: 'vwap', label: 'VWAP +2σ' },
  vwap_l2: { family: 'vwap', label: 'VWAP −2σ' },
  avwap_prior_close: { family: 'avwap', label: 'AVWAP from prior close' },
  avwap_week: { family: 'avwap', label: 'AVWAP from week open' },
  avwap_month: { family: 'avwap', label: 'AVWAP from month open (daily-bar approx.)' },
  pdh: { family: 'prior_period', label: 'prior-day high' },
  pdl: { family: 'prior_period', label: 'prior-day low' },
  pdc: { family: 'prior_period', label: 'prior-day close' },
  pwh: { family: 'prior_period', label: 'prior-week high' },
  pwl: { family: 'prior_period', label: 'prior-week low' },
  pwc: { family: 'prior_period', label: 'prior-week close' },
  pmoh: { family: 'prior_period', label: 'prior-month high' },
  pmol: { family: 'prior_period', label: 'prior-month low' },
  pmoc: { family: 'prior_period', label: 'prior-month close' },
  premkt_high: { family: 'premarket', label: 'pre-market high' },
  premkt_low: { family: 'premarket', label: 'pre-market low' },
  session_high: { family: 'session', label: 'session high' },
  session_low: { family: 'session', label: 'session low' },
  or5_high: { family: 'opening_range', label: '5m opening-range high' },
  or5_low: { family: 'opening_range', label: '5m opening-range low' },
  or15_high: { family: 'opening_range', label: '15m opening-range high' },
  or15_low: { family: 'opening_range', label: '15m opening-range low' },
  or30_high: { family: 'opening_range', label: '30m opening-range high' },
  or30_low: { family: 'opening_range', label: '30m opening-range low' },
  pivot_p: { family: 'pivot', label: 'floor pivot P' },
  pivot_r1: { family: 'pivot', label: 'pivot R1' },
  pivot_s1: { family: 'pivot', label: 'pivot S1' },
  pivot_r2: { family: 'pivot', label: 'pivot R2' },
  pivot_s2: { family: 'pivot', label: 'pivot S2' },
  pivot_r3: { family: 'pivot', label: 'pivot R3' },
  pivot_s3: { family: 'pivot', label: 'pivot S3' },
  cam_h3: { family: 'pivot', label: 'Camarilla H3' },
  cam_h4: { family: 'pivot', label: 'Camarilla H4' },
  cam_l3: { family: 'pivot', label: 'Camarilla L3' },
  cam_l4: { family: 'pivot', label: 'Camarilla L4' },
  poc_session: { family: 'volume_profile', label: 'session POC' },
  vah_session: { family: 'volume_profile', label: 'session VAH' },
  val_session: { family: 'volume_profile', label: 'session VAL' },
  poc_5d: { family: 'volume_profile', label: '5-day POC' },
  vah_5d: { family: 'volume_profile', label: '5-day VAH' },
  val_5d: { family: 'volume_profile', label: '5-day VAL' },
  call_wall: { family: 'gex', label: 'GEX call wall' },
  put_wall: { family: 'gex', label: 'GEX put wall' },
  zero_gamma: { family: 'gex', label: 'zero gamma' },
  max_gamma: { family: 'gex', label: 'max gamma' },
  dark_pool: { family: 'dark_pool', label: 'dark-pool level' },
  round: { family: 'round', label: 'round number' },
};

export interface Level {
  price: number;
  kind: LevelKind;
  family: LevelFamily;
  label: string;
  /** Where the inputs came from, e.g. "yahoo 5m bars (RTH 2026-09-29)". */
  source: string;
  /** Kind-specific weight: 1 by default; OI / notional ($M) for GEX & dark pool; volume share for POC. */
  strength: number;
  /** ISO time the level was computed. */
  asOf: string;
}

export interface LevelCluster {
  price: number;
  low: number;
  high: number;
  members: Level[];
  kinds: LevelKind[];
  families: LevelFamily[];
  /** Independent families agreeing — the confluence score. */
  score: number;
  /** Human text: "prior-day high + 5-day VAH". */
  label: string;
}

// ─── time helpers (ET) ─────────────────────────────────────────────────────

const etFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
});

export interface EtStamp { dateKey: string; minutes: number; weekday: number; monthKey: string }

export function etStamp(ms: number): EtStamp {
  const p = etFmt.formatToParts(new Date(ms));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  const hh = Number(v('hour')) % 24; const mm = Number(v('minute'));
  return {
    dateKey: `${v('year')}-${v('month')}-${v('day')}`,
    monthKey: `${v('year')}-${v('month')}`,
    minutes: hh * 60 + mm,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday')),
  };
}

/** Monday dateKey of the week containing dateKey (calendar arithmetic on the date only). */
export function weekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const wd = new Date(t).getUTCDay(); // 0 Sun
  const back = (wd + 6) % 7;
  const mon = new Date(t - back * 86_400_000);
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
}

export const RTH_OPEN = 570;   // 09:30 ET
export const RTH_CLOSE = 960;  // 16:00 ET
export const PRE_OPEN = 240;   // 04:00 ET

const valid = (b: Bar) =>
  Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close) && b.high >= b.low && b.low > 0;

export interface SessionSplit {
  /** ET date of the session being planned (latest date with any bar). */
  current: string | null;
  currentRth: Bar[];
  currentPre: Bar[];
  /** Latest date before `current` with RTH bars. */
  prior: string | null;
  priorRth: Bar[];
  /** RTH bars grouped by date, oldest first. */
  rthByDate: Array<{ date: string; bars: Bar[] }>;
}

/** Split intraday bars (5m, extended hours) into sessions by ET date. */
export function splitSessions(bars: Bar[]): SessionSplit {
  const byDate = new Map<string, { rth: Bar[]; pre: Bar[] }>();
  for (const b of bars) {
    if (!valid(b)) continue;
    const s = etStamp(b.time * 1000);
    if (s.weekday === 0 || s.weekday === 6) continue;
    let g = byDate.get(s.dateKey);
    if (!g) { g = { rth: [], pre: [] }; byDate.set(s.dateKey, g); }
    if (s.minutes >= RTH_OPEN && s.minutes < RTH_CLOSE) g.rth.push(b);
    else if (s.minutes >= PRE_OPEN && s.minutes < RTH_OPEN) g.pre.push(b);
  }
  const dates = [...byDate.keys()].sort();
  const current = dates.length ? dates[dates.length - 1] : null;
  const rthByDate = dates.filter((d) => byDate.get(d)!.rth.length).map((d) => ({ date: d, bars: byDate.get(d)!.rth }));
  const priorEntry = [...rthByDate].reverse().find((x) => x.date !== current) ?? null;
  return {
    current,
    currentRth: current ? byDate.get(current)!.rth : [],
    currentPre: current ? byDate.get(current)!.pre : [],
    prior: priorEntry?.date ?? null,
    priorRth: priorEntry?.bars ?? [],
    rthByDate,
  };
}

// ─── primitives ────────────────────────────────────────────────────────────

const r2 = (x: number) => Math.round(x * 100) / 100;
const typical = (b: Bar) => (b.high + b.low + b.close) / 3;

/** Volume-weighted average price and volume-weighted σ of typical price. */
export function vwapWithBands(bars: Bar[]): { vwap: number; sigma: number; volume: number } | null {
  let pv = 0; let v = 0;
  for (const b of bars) { if (!valid(b) || !(b.volume > 0)) continue; pv += typical(b) * b.volume; v += b.volume; }
  if (!(v > 0)) return null;
  const vwap = pv / v;
  let ss = 0;
  for (const b of bars) { if (!valid(b) || !(b.volume > 0)) continue; ss += b.volume * (typical(b) - vwap) ** 2; }
  return { vwap, sigma: Math.sqrt(ss / v), volume: v };
}

export function highLowClose(bars: Bar[]): { high: number; low: number; close: number } | null {
  const v = bars.filter(valid);
  if (!v.length) return null;
  return { high: Math.max(...v.map((b) => b.high)), low: Math.min(...v.map((b) => b.low)), close: v[v.length - 1].close };
}

export function floorPivots(h: number, l: number, c: number) {
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l), r3: h + 2 * (p - l), s3: l - 2 * (h - p) };
}

export function camarilla(h: number, l: number, c: number) {
  const rng = h - l;
  return { h3: c + (rng * 1.1) / 4, h4: c + (rng * 1.1) / 2, l3: c - (rng * 1.1) / 4, l4: c - (rng * 1.1) / 2 };
}

/**
 * Bar-approximated volume profile. Each bar's volume is spread evenly over the
 * price bins its high-low range touches. Value area = the smallest contiguous
 * range around the POC holding ≥ `vaPct` of volume (standard 70%).
 */
export function volumeProfile(bars: Bar[], opts: { bins?: number; vaPct?: number } = {}):
  { poc: number; vah: number; val: number; binSize: number; pocShare: number } | null {
  const v = bars.filter((b) => valid(b) && b.volume > 0);
  if (v.length < 6) return null;
  const lo = Math.min(...v.map((b) => b.low)); const hi = Math.max(...v.map((b) => b.high));
  if (!(hi > lo)) return null;
  const nb = Math.max(20, Math.min(200, opts.bins ?? 80));
  const size = (hi - lo) / nb;
  const vol = new Array<number>(nb).fill(0);
  for (const b of v) {
    const i0 = Math.max(0, Math.min(nb - 1, Math.floor((b.low - lo) / size)));
    const i1 = Math.max(0, Math.min(nb - 1, Math.floor((b.high - lo) / size)));
    const share = b.volume / (i1 - i0 + 1);
    for (let i = i0; i <= i1; i++) vol[i] += share;
  }
  const total = vol.reduce((a, b) => a + b, 0);
  let poc = 0;
  for (let i = 1; i < nb; i++) if (vol[i] > vol[poc]) poc = i;
  let a = poc; let z = poc; let acc = vol[poc];
  const target = total * (opts.vaPct ?? 0.7);
  while (acc < target && (a > 0 || z < nb - 1)) {
    const up = z < nb - 1 ? vol[z + 1] : -1;
    const dn = a > 0 ? vol[a - 1] : -1;
    if (up >= dn) { z++; acc += vol[z]; } else { a--; acc += vol[a]; }
  }
  return { poc: lo + (poc + 0.5) * size, vah: lo + (z + 1) * size, val: lo + a * size, binSize: size, pocShare: vol[poc] / total };
}

/** Round-number steps by price tier: [minor, major]. */
export function roundSteps(price: number): [number, number] {
  if (price < 5) return [0.5, 1];
  if (price < 20) return [1, 5];
  if (price < 100) return [5, 10];
  if (price < 250) return [5, 25];
  if (price < 1000) return [10, 50];
  if (price < 5000) return [50, 100];
  return [100, 500];
}

export function roundNumbers(price: number, halfWindow: number): Array<{ price: number; major: boolean }> {
  const [minor, major] = roundSteps(price);
  const out: Array<{ price: number; major: boolean }> = [];
  const start = Math.ceil((price - halfWindow) / minor) * minor;
  for (let x = start; x <= price + halfWindow + 1e-9; x += minor) {
    if (x <= 0) continue;
    const px = r2(x);
    out.push({ price: px, major: Math.abs(px / major - Math.round(px / major)) < 1e-9 });
  }
  return out;
}

/** Mean true range of the last `n` bars (bars in time order). */
export function meanTrueRange(bars: Bar[], n: number): number | null {
  const v = bars.filter(valid);
  if (v.length < 2) return null;
  const tail = v.slice(-(n + 1));
  const tr = tail.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - tail[i].close), Math.abs(b.low - tail[i].close)));
  return tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : null;
}

/**
 * Daily ATR exactly as server/trade-idea-ingestion.ts's volatility stop floor
 * computes it (last 16 daily bars → 15 true ranges). Shared so the level snap
 * and the floor can never disagree about the floor distance.
 */
export function dailyAtrForFloor(daily: Bar[]): number | null {
  const d = daily.slice(-16);
  if (d.length < 15) return null;
  const tr = d.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - d[i].close), Math.abs(b.low - d[i].close)));
  const atr = tr.reduce((a, b) => a + b, 0) / tr.length;
  return atr > 0 ? atr : null;
}

// ─── the level map ─────────────────────────────────────────────────────────

export interface ExternalLevel {
  price: number;
  kind: Extract<LevelKind, 'call_wall' | 'put_wall' | 'zero_gamma' | 'max_gamma' | 'dark_pool' | 'premkt_high' | 'premkt_low'>;
  source: string;
  strength?: number;
  asOf: string;
  label?: string;
}

export interface LevelMapInput {
  symbol: string;
  /** 5-minute bars incl. extended hours (Yahoo, ~5 sessions). */
  intraday: Bar[];
  /** Daily bars (≥ ~2 months). */
  daily: Bar[];
  /** GEX / dark-pool levels read from existing caches (never fetched here). */
  external?: ExternalLevel[];
  nowMs: number;
  /** Provider label for the bars. */
  barSource?: string;
}

export interface LevelMap {
  symbol: string;
  asOf: string;
  last: number | null;
  levels: Level[];
  clusters: LevelCluster[];
  /** Clustering tolerance used: max(0.1% of price, 0.15 × ATR(5m)). */
  tolerance: number;
  atr5m: number | null;
  atrDaily: number | null;
  session: string | null;
  priorSession: string | null;
  notes: string[];
}

export function buildLevels(inp: LevelMapInput): { levels: Level[]; notes: string[]; split: SessionSplit; last: number | null } {
  const asOf = new Date(inp.nowMs).toISOString();
  const src = inp.barSource ?? 'yahoo';
  const out: Level[] = [];
  const notes: string[] = [];
  const add = (kind: LevelKind, price: number, source: string, strength = 1, label?: string) => {
    if (!Number.isFinite(price) || price <= 0) return;
    const m = KIND_META[kind];
    out.push({ price: r2(price), kind, family: m.family, label: label ?? m.label, source, strength, asOf });
  };
  const intraday = [...inp.intraday].filter(valid).sort((a, b) => a.time - b.time);
  const daily = [...inp.daily].filter(valid).sort((a, b) => a.time - b.time);
  const split = splitSessions(intraday);
  const last = intraday.length ? intraday[intraday.length - 1].close : daily.length ? daily[daily.length - 1].close : null;

  // Session VWAP + σ bands, session H/L, opening range — current RTH only.
  if (split.current && split.currentRth.length) {
    const s = `${src} 5m bars (RTH ${split.current})`;
    const vw = vwapWithBands(split.currentRth);
    if (vw) {
      add('vwap', vw.vwap, s);
      if (vw.sigma > 0 && split.currentRth.length >= 3) {
        add('vwap_u1', vw.vwap + vw.sigma, s); add('vwap_l1', vw.vwap - vw.sigma, s);
        add('vwap_u2', vw.vwap + 2 * vw.sigma, s); add('vwap_l2', vw.vwap - 2 * vw.sigma, s);
      }
    }
    const hlc = highLowClose(split.currentRth);
    if (hlc) { add('session_high', hlc.high, s); add('session_low', hlc.low, s); }
    for (const [mins, hk, lk] of [[5, 'or5_high', 'or5_low'], [15, 'or15_high', 'or15_low'], [30, 'or30_high', 'or30_low']] as const) {
      const within = split.currentRth.filter((b) => etStamp(b.time * 1000).minutes < RTH_OPEN + mins);
      // Only once the window has fully printed: the last bar in it must start at open+mins−5.
      const complete = split.currentRth.some((b) => etStamp(b.time * 1000).minutes >= RTH_OPEN + mins);
      if (within.length && complete) {
        const x = highLowClose(within)!;
        add(hk, x.high, s); add(lk, x.low, s);
      }
    }
  } else {
    notes.push('no regular-session bars yet for the current session — VWAP, opening range and session H/L not computed');
  }

  // Pre-market high/low of the current session.
  if (split.current && split.currentPre.length) {
    const x = highLowClose(split.currentPre)!;
    const s = `${src} 5m bars (04:00–09:30 ET ${split.current})`;
    add('premkt_high', x.high, s); add('premkt_low', x.low, s);
  }

  // Anchored VWAP from the prior close: every bar after the prior session's last RTH bar.
  if (split.prior && split.priorRth.length) {
    const anchorT = split.priorRth[split.priorRth.length - 1].time;
    const after = intraday.filter((b) => b.time > anchorT);
    const vw = vwapWithBands(after);
    if (vw && after.length >= 3) add('avwap_prior_close', vw.vwap, `${src} 5m bars since ${split.prior} close`);
  }
  // Anchored VWAP from the week open (first RTH bar of the current session's week).
  if (split.current) {
    const wk = weekKey(split.current);
    const weekBars = split.rthByDate.filter((x) => weekKey(x.date) === wk);
    if (weekBars.length) {
      const t0 = weekBars[0].bars[0].time;
      const vw = vwapWithBands(intraday.filter((b) => b.time >= t0));
      // Only when the week is at least two sessions old; day one's AVWAP is the session VWAP.
      if (vw && weekBars.length >= 2) add('avwap_week', vw.vwap, `${src} 5m bars since ${weekBars[0].date} open`);
    }
  }

  // Daily-bar levels: prior day / week / month H-L-C, pivots, month AVWAP.
  const todayKey = split.current ?? etStamp(inp.nowMs).dateKey;
  const dailyDated = daily.map((b) => ({ b, key: etStamp(b.time * 1000 + 12 * 3_600_000).dateKey }));
  // Yahoo daily bar timestamps sit at the session open (09:30 ET) or midnight UTC —
  // +12h puts every one inside its own ET calendar day.
  const doneDays = dailyDated.filter((x) => x.key < todayKey);
  if (doneDays.length) {
    const pd = doneDays[doneDays.length - 1];
    const s = `${src} daily bar ${pd.key}`;
    add('pdh', pd.b.high, s); add('pdl', pd.b.low, s); add('pdc', pd.b.close, s);
    const fp = floorPivots(pd.b.high, pd.b.low, pd.b.close);
    const sp = `floor pivots from ${pd.key} H/L/C`;
    add('pivot_p', fp.p, sp); add('pivot_r1', fp.r1, sp); add('pivot_s1', fp.s1, sp);
    add('pivot_r2', fp.r2, sp); add('pivot_s2', fp.s2, sp); add('pivot_r3', fp.r3, sp); add('pivot_s3', fp.s3, sp);
    const cm = camarilla(pd.b.high, pd.b.low, pd.b.close);
    const sc = `Camarilla from ${pd.key} H/L/C`;
    add('cam_h3', cm.h3, sc); add('cam_h4', cm.h4, sc); add('cam_l3', cm.l3, sc); add('cam_l4', cm.l4, sc);
  } else notes.push('no completed daily bar — prior-day levels and pivots not computed');

  const curWeek = weekKey(todayKey);
  const priorWeek = doneDays.filter((x) => weekKey(x.key) < curWeek);
  if (priorWeek.length) {
    const wk = weekKey(priorWeek[priorWeek.length - 1].key);
    const bars = priorWeek.filter((x) => weekKey(x.key) === wk).map((x) => x.b);
    const x = highLowClose(bars)!;
    const s = `${src} daily bars, week of ${wk}`;
    add('pwh', x.high, s); add('pwl', x.low, s); add('pwc', x.close, s);
  }
  const curMonth = todayKey.slice(0, 7);
  const priorMonth = doneDays.filter((x) => x.key.slice(0, 7) < curMonth);
  if (priorMonth.length) {
    const mk = priorMonth[priorMonth.length - 1].key.slice(0, 7);
    const bars = priorMonth.filter((x) => x.key.slice(0, 7) === mk).map((x) => x.b);
    // A month needs most of its sessions present to be a month's range.
    if (bars.length >= 15) {
      const x = highLowClose(bars)!;
      const s = `${src} daily bars, ${mk}`;
      add('pmoh', x.high, s); add('pmol', x.low, s); add('pmoc', x.close, s);
    }
  }
  const monthBars = dailyDated.filter((x) => x.key.slice(0, 7) === curMonth).map((x) => x.b);
  if (monthBars.length >= 3) {
    const vw = vwapWithBands(monthBars);
    if (vw) add('avwap_month', vw.vwap, `${src} daily bars since ${curMonth}-01 (typical price × volume; daily-bar approximation)`);
  }

  // Volume profile: current session (once ≥ 12 bars = 1h) and 5-session composite.
  if (split.currentRth.length >= 12) {
    const vp = volumeProfile(split.currentRth);
    if (vp) {
      const s = `${src} 5m bars RTH ${split.current} (bar-approximated profile)`;
      add('poc_session', vp.poc, s, vp.pocShare); add('vah_session', vp.vah, s); add('val_session', vp.val, s);
    }
  }
  const last5 = split.rthByDate.slice(-5);
  if (last5.length >= 3) {
    const vp = volumeProfile(last5.flatMap((x) => x.bars), { bins: 120 });
    if (vp) {
      const s = `${src} 5m bars RTH ${last5[0].date}…${last5[last5.length - 1].date} (bar-approximated profile)`;
      add('poc_5d', vp.poc, s, vp.pocShare); add('vah_5d', vp.vah, s); add('val_5d', vp.val, s);
    }
  }

  // Round numbers near price.
  if (last && last > 0) {
    const atrD = meanTrueRange(daily, 14);
    const half = Math.max(last * 0.06, (atrD ?? 0) * 3);
    for (const rn of roundNumbers(last, half)) add('round', rn.price, `round-number grid (${roundSteps(last).join('/')} step)`, rn.major ? 2 : 1, rn.major ? 'round number (major)' : 'round number');
  }

  // External (cached) GEX / dark-pool levels.
  for (const e of inp.external ?? []) {
    if (!Number.isFinite(e.price) || e.price <= 0) continue;
    const m = KIND_META[e.kind];
    out.push({ price: r2(e.price), kind: e.kind, family: m.family, label: e.label ?? m.label, source: e.source, strength: e.strength ?? 1, asOf: e.asOf });
  }

  out.sort((a, b) => a.price - b.price);
  return { levels: out, notes, split, last };
}

/**
 * Cluster levels within `tol` of the running cluster mean. Score = number of
 * independent families. Deterministic for a given input order (sorted by price).
 */
export function clusterLevels(levels: Level[], tol: number): LevelCluster[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price || a.kind.localeCompare(b.kind));
  const clusters: LevelCluster[] = [];
  let cur: Level[] = [];
  const flush = () => {
    if (!cur.length) return;
    const kinds = [...new Set(cur.map((l) => l.kind))];
    const families = [...new Set(cur.map((l) => l.family))];
    const price = cur.reduce((a, l) => a + l.price, 0) / cur.length;
    const seen = new Set<string>();
    const labelParts: string[] = [];
    for (const l of cur) { if (!seen.has(l.label)) { seen.add(l.label); labelParts.push(l.label); } }
    clusters.push({
      price: r2(price), low: cur[0].price, high: cur[cur.length - 1].price, members: cur,
      kinds, families, score: families.length, label: labelParts.join(' + '),
    });
    cur = [];
  };
  for (const l of sorted) {
    if (!cur.length) { cur.push(l); continue; }
    const mean = cur.reduce((a, x) => a + x.price, 0) / cur.length;
    if (Math.abs(l.price - mean) <= tol) cur.push(l); else { flush(); cur.push(l); }
  }
  flush();
  return clusters;
}

/** max(0.1% of price, 0.15 × ATR of the last session's 5-minute RTH bars). */
export function clusterTolerance(price: number, atr5m: number | null): number {
  return Math.max(price * 0.001, 0.15 * (atr5m ?? 0));
}

export function buildLevelMap(inp: LevelMapInput): LevelMap {
  const { levels, notes, split, last } = buildLevels(inp);
  const rthRecent = split.rthByDate.slice(-1).flatMap((x) => x.bars);
  const atr5m = meanTrueRange(rthRecent, 78);
  const atrDaily = dailyAtrForFloor([...inp.daily].sort((a, b) => a.time - b.time));
  const tolerance = last ? clusterTolerance(last, atr5m) : 0;
  return {
    symbol: inp.symbol.toUpperCase(),
    asOf: new Date(inp.nowMs).toISOString(),
    last,
    levels,
    clusters: tolerance > 0 ? clusterLevels(levels, tolerance) : [],
    tolerance: Math.round(tolerance * 10000) / 10000,
    atr5m,
    atrDaily,
    session: split.current,
    priorSession: split.prior,
    notes,
  };
}
