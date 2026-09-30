/**
 * 2026-09-30 AS A SIMULATION — minute by minute, no look-ahead.
 * =============================================================
 * At every wall-clock minute only the bars that had CLOSED by then are visible.
 *
 * (a) CURRENT index engine (server/index-scalp-engine.ts → zero-dte-policies.ts):
 *     evaluated on its cron cadence (every 5 min before 15:00, every 2 min in
 *     the 15:00 hour; server/idea-producer-schedule.ts) with 5-min bars built
 *     from the 1-min bars closed so far (the live engine reads Yahoo 5-min bars
 *     incl. the forming one). GEX input, two variants (historical snapshots do
 *     not exist; these are the closest available):
 *       rec — the chart recorder's own SPY samples for today
 *             (.cache/chart-overlays/gex-SPY-2026-09-30.json: net sign + top
 *             strikes → put/call wall), zero-γ = the operator's 768.6
 *       op  — the operator's read: negative gamma, zero-γ 768.6, put wall 765
 *     Contract (the live picker needs the live chain): the SPY 0DTE nearest-OTM
 *     strike priced $0.20–$2.00 at the trigger minute; exit per the engine's
 *     plan (underlying target / stop on a 1-min close, sold at the next option
 *     bar's open; else the 15:55 time stop).
 * (b) NEW fast-move detector (server/spx-fast-moves-core.ts), every minute.
 *     Contracts near (0.2–0.4% OTM) and cheap (0.5–0.8% OTM); entry = next
 *     minute's HIGH; every exit rule.
 * SPX equivalent: SPXW strike = SPY strike × (^GSPC / SPY at the trigger), 5-pt grid;
 * SPXW 1-min bars are requested from Alpaca to see whether they exist.
 *
 * Run: npx tsx research/spx-fast-moves-today.ts [--day 2026-09-30]
 *   → the timeline section of docs/SPX_FAST_MOVES_2026-09-30.md + research/spx-fast-moves-today.json
 */
import fs from 'fs';
import path from 'path';
import { detectFastMoves, calendarFlags, evaluateFastExit, pickFastStrike, spxwEquivalent, fmHhmm, closeFlowRiskLine, CAUSE_LABEL, FM_EXITS, FM_VARIANTS, type FmDayContext, type FmExit, type OptBarLite } from '../server/spx-fast-moves-core';
import { structureFromBars, type Bar } from '../server/zero-dte-structure';
import { evaluateZeroDte, type GexInput } from '../server/zero-dte-policies';
import { loadDays, contractsMonth, optionBars, volBaseline, premarket0830Rvol, et, etWall, getJson } from './fast-moves-data';
import type { MinuteBar } from '../server/zero-dte-sniper-core';
import { upsertSection, gspcDaily } from './spx-fast-moves-replay';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const DAY = arg('--day') ?? '2026-09-30';
const OP = { zeroGamma: 768.6, putWall: 765 };
const GEX_FILE = '/Users/abdulmalik/UnTitld/QuantEdgeee/.cache/chart-overlays/gex-SPY-2026-09-30.json';

function to5m(bars1: MinuteBar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars1) {
    const bucket = b.t - (((b.min - 570) % 5) + 5) % 5 * 60_000;
    const last = out[out.length - 1];
    if (last && last.t === bucket) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.v += b.v; }
    else out.push({ t: bucket, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
  }
  return out;
}

async function yahooSpx(day: string): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1m&range=5d&includePrePost=false', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j: any = await r.json();
    const res = j?.chart?.result?.[0]; const ts: number[] = res?.timestamp ?? []; const c = res?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < ts.length; i++) { const e = et(ts[i] * 1000); if (e.day === day && typeof c[i] === 'number') m.set(e.min, c[i]); }
  } catch { /* ratio falls back to 10 */ }
  return m;
}

async function main() {
  const start = new Date(Date.parse(`${DAY}T12:00:00Z`) - 45 * 86400_000).toISOString().slice(0, 10);
  const spy = await loadDays('SPY', start, DAY);
  const vixy = await loadDays('VIXY', start, DAY);
  const days = [...spy.keys()].filter((d) => spy.get(d)!.rth.length >= 300).sort();
  const i = days.indexOf(DAY);
  if (i < 21) throw new Error(`${DAY} not in cached SPY bars`);
  const rth = spy.get(DAY)!.rth;
  const prev = spy.get(days[i - 1])!.rth;
  const prior = days.slice(i - 20, i).map((d) => spy.get(d)!);
  const cal = calendarFlags(DAY);
  const mr = premarket0830Rvol(spy.get(DAY)!, prior);
  const ctx: FmDayContext = {
    day: DAY, pdh: Math.max(...prev.map((b) => b.h)), pdl: Math.min(...prev.map((b) => b.l)), pdc: prev[prev.length - 1].c,
    atr20: prior.reduce((a, d) => a + (Math.max(...d.rth.map((b) => b.h)) - Math.min(...d.rth.map((b) => b.l))), 0) / prior.length,
    volBase: volBaseline(prior), cal, macro0830: mr != null && mr >= 2.5, vix: vixy.get(DAY)?.rth ?? null,
  };
  const settle = rth[rth.length - 1].c;
  const spx = await yahooSpx(DAY);
  const ratioAt = (min: number) => { const s = [...spx.entries()].filter(([k]) => k <= min).pop(); const b = rth.find((x) => x.min === min); return s && b ? s[1] / b.c : 10; };

  // Chain + option bars (both types, full band) for today.
  const chain = await contractsMonth('SPY', DAY.slice(0, 7), 600, 900, DAY);
  const today = chain.filter((c) => c[1] === DAY);
  const lo = Math.min(...rth.map((b) => b.l)), hi = Math.max(...rth.map((b) => b.h));
  const occFor = (type: 'C' | 'P', k: number) => today.find((c) => c[2] === type && c[3] === k)?.[0] ?? null;
  const putsOcc = today.filter((c) => c[2] === 'P' && c[3] >= lo * 0.985 && c[3] <= hi * 1.005).map((c) => c[0]);
  const callsOcc = today.filter((c) => c[2] === 'C' && c[3] >= lo * 0.995 && c[3] <= hi * 1.015).map((c) => c[0]);
  const ob = { P: await optionBars('SPY', DAY, 'P', putsOcc), C: await optionBars('SPY', DAY, 'C', callsOcc) };
  const closeT = etWall(DAY, 960);
  const optRows = (type: 'C' | 'P', occ: string) => (ob[type][occ] ?? []).map((r) => ({ t: r[0] * 1000, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
  const barAt = (rows: OptBarLite[], min: number) => rows.find((r) => et(r.t).min === min) ?? null;

  // ── (a) current engine ──
  const gexRows: Array<{ t: number; spot: number; net: number; levels: Array<[number, number]> }> = fs.existsSync(GEX_FILE) ? (JSON.parse(fs.readFileSync(GEX_FILE, 'utf8')).samples ?? []) : [];
  const five = (nowMs: number) => to5m([...prev, ...rth].filter((b) => b.t + 60_000 <= nowMs));
  const engineRows: any[] = [];
  for (const variant of ['rec', 'op'] as const) {
    let lastPub: Record<string, number> = {};
    for (let m = 585; m <= 959; m++) {
      const onCadence = m < 900 ? m % 5 === 0 : m % 2 === 0;
      if (!onCadence) continue;
      const now = etWall(DAY, m);
      const s = gexRows.filter((g) => g.t <= now).pop();
      if (!s) continue;
      const below = s.levels.filter(([k, g]) => k < s.spot && g < 0).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
      const above = s.levels.filter(([k, g]) => k > s.spot && g > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const netB = s.net / 1e9;
      const gex: GexInput = variant === 'rec'
        ? { spot: s.spot, zeroGamma: OP.zeroGamma, callWall: above, putWall: below, sign: netB > 0.05 ? 'positive' : netB < -0.05 ? 'negative' : 'neutral', fetchedAt: new Date(s.t).toISOString() }
        : { spot: s.spot, zeroGamma: OP.zeroGamma, callWall: above, putWall: OP.putWall, sign: 'negative', fetchedAt: new Date(s.t).toISOString() };
      const st = structureFromBars('SPY', five(now), now);
      const v = evaluateZeroDte('SPY', gex, st, now, m, null, {});
      const row: any = { variant, at: fmHhmm(m), sign: gex.sign, netB: +netB.toFixed(2), wait: v.wait[0] ?? null };
      if (v.setup) {
        const key = v.setup.direction;
        row.setup = { policy: v.setup.policy, dir: v.setup.direction, entry: +v.setup.entry.toFixed(2), stop: +v.setup.stop.toFixed(2), target: +v.setup.target.toFixed(2), trigger: v.setup.trigger.name };
        if (lastPub[key] == null || now - lastPub[key] >= 30 * 60_000) {
          lastPub[key] = now;
          const type = v.setup.direction === 'long' ? 'C' : 'P';
          const spot = rth.filter((b) => b.t + 60_000 <= now).pop()!.c;
          const ks = today.filter((c) => c[2] === type).map((c) => c[3]).filter((k) => (type === 'P' ? k < spot : k > spot)).sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot));
          for (const k of ks) {
            const occ = occFor(type, k); if (!occ) continue;
            const rows = optRows(type, occ);
            const px = rows.filter((r) => r.t + 60_000 <= now).pop();
            if (!px || px.c < 0.2 || px.c > 2) continue;
            const eb = rows.find((r) => r.t >= now && r.t < now + 240_000);
            if (!eb) continue;
            // exit per plan: underlying 1-min close through stop/target, else 15:55
            let exitMin = 955; let why = 'time stop 15:55';
            for (const b of rth) {
              if (b.t < eb.t) continue;
              if (b.min >= 955) break;
              const hitT = type === 'P' ? b.c <= v.setup.target : b.c >= v.setup.target;
              const hitS = type === 'P' ? b.c >= v.setup.stop : b.c <= v.setup.stop;
              if (hitS || hitT) { exitMin = b.min + 1; why = hitS ? 'underlying stop' : 'underlying target'; break; }
            }
            const xb = rows.find((r) => et(r.t).min >= exitMin) ?? rows[rows.length - 1];
            row.publish = { occ, strike: k, entry: eb.h, entryAt: fmHhmm(et(eb.t).min), exit: xb.o, exitAt: fmHhmm(et(xb.t).min), why, pnl$: Math.round((xb.o - eb.h) * 100) };
            break;
          }
          if (!row.publish) row.publish = { none: 'no SPY 0DTE strike priced $0.20–$2.00 with a next-minute print' };
        }
      }
      engineRows.push(row);
    }
  }

  // ── (b) new detector, minute by minute ──
  const firstSeen = new Map<string, number>();
  for (let m = 571; m <= 960; m++) {
    const now = etWall(DAY, m);
    const vis = rth.filter((b) => b.t + 60_000 <= now);
    const vctx = { ...ctx, vix: (ctx.vix ?? []).filter((b) => b.t + 60_000 <= now) };
    for (const t of detectFastMoves(vis, vctx)) { const k = `${t.cause}:${t.side}`; if (!firstSeen.has(k)) firstSeen.set(k, m); }
  }
  const full = detectFastMoves(rth, ctx);
  const lookAheadOk = full.every((t) => firstSeen.get(`${t.cause}:${t.side}`) === t.min + 1) && firstSeen.size === full.length;
  const newRows: any[] = [];
  const spxwProbe: string[] = [];
  // SPX leg: same convention as the replay — strike on the SPXW 5-pt grid at SPY × the PRIOR close's ^GSPC/SPY
  // ratio, real SPXW 1-min bars, expiry value from the ^GSPC official close.
  const gspc = await gspcDaily();
  const ratioPrior = (gspc.get(days[i - 1]) ?? NaN) / prev[prev.length - 1].c;
  const spxSettle = gspc.get(DAY) ?? null;
  const legs = async (t: typeof full[number], variant: typeof FM_VARIANTS[number], leg: 'SPY' | 'SPXW') => {
    const type = t.side === 'long' ? 'C' : 'P';
    const isSpx = leg === 'SPXW';
    const spot = isSpx ? t.price * ratioPrior : t.price;
    let k: number | null; let occ: string | null; let rows: OptBarLite[];
    if (isSpx) {
      const mid = Math.round(spot / 5) * 5; const grid: number[] = []; for (let x = mid - 300; x <= mid + 300; x += 5) grid.push(x);
      k = pickFastStrike(grid, spot, t.side, variant);
      occ = k != null ? `SPXW${DAY.slice(2).replace(/-/g, '')}${type}${String(k * 1000).padStart(8, '0')}` : null;
      rows = occ ? ((await optionBars('SPXW', DAY, type, [occ]))[occ] ?? []).map((r) => ({ t: r[0] * 1000, o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] })) : [];
      if (occ) spxwProbe.push(`${occ}: ${rows.length} one-minute bars`);
    } else {
      k = pickFastStrike(today.filter((c) => c[2] === type).map((c) => c[3]), spot, t.side, variant);
      occ = k != null ? occFor(type, k) : null;
      rows = occ ? optRows(type, occ) : [];
    }
    const eb = rows.find((r) => r.t > t.t && r.t <= t.t + 240_000);
    const out: any = { leg, strike: k, occ, prints: rows.length };
    const st = isSpx ? spxSettle : settle;
    if (eb && occ && k != null && st != null) {
      const after = rows.filter((r) => r.t > eb.t && r.t < closeT);
      const intrinsic = type === 'C' ? Math.max(0, st - k) : Math.max(0, k - st);
      const o = evaluateFastExit(eb.h, after, intrinsic, eb.t);
      out.entry = eb.h; out.entryAt = fmHhmm(et(eb.t).min); out.maxMult = +o.maxMult.toFixed(2); out.maxHigh = Math.max(0, ...after.map((r) => r.h)); out.expiry = +intrinsic.toFixed(2);
      out.exits = Object.fromEntries(FM_EXITS.map((x) => [x, { px: +o.fills[x]!.px.toFixed(2), at: o.fills[x]!.t ? fmHhmm(et(o.fills[x]!.t!).min) : '16:00 (expiry)', pnl$: Math.round(o.pnl[x] * eb.h * 100), pnlPct: Math.round(o.pnl[x] * 100) }])) as Record<FmExit, any>;
    } else out.entry = null;
    return out;
  };
  for (const t of full) {
    for (const variant of FM_VARIANTS) {
      newRows.push({
        cause: t.cause, label: CAUSE_LABEL[t.cause], side: t.side, known: fmHhmm(t.min + 1), trigBar: fmHhmm(t.min), px: t.price, note: t.note, rvol1: t.rvol1, variant,
        ratioPrior: +ratioPrior.toFixed(4), ratioLive: +ratioAt(t.min).toFixed(4), spy: await legs(t, variant, 'SPY'), spxw: await legs(t, variant, 'SPXW'),
      });
    }
  }
  const out = { day: DAY, cal, macroRvol: mr, lookAheadOk, closeFlowLine: closeFlowRiskLine(cal, 930), settle, spxSettle, ratioPrior, engineRows, newRows, spxwProbe };
  fs.writeFileSync(path.resolve(process.cwd(), 'research/spx-fast-moves-today.json'), JSON.stringify(out, null, 1));
  writeTimeline(out);
  console.log(JSON.stringify({ lookAheadOk, cal: cal.labels, fires: full.map((t) => `${fmHhmm(t.min)} ${t.cause} ${t.side}`) }, null, 1));
  for (const r of engineRows.filter((r) => r.setup || /A:|B/.test(r.wait ?? '') )) console.log('ENGINE', JSON.stringify(r));
  for (const r of newRows) for (const L of [r.spy, r.spxw]) console.log('NEW', r.known, r.cause, r.side, r.variant, L.occ, L.entry, L.entryAt, L.maxMult, L.exits ? Object.entries(L.exits).map(([k, v]: any) => `${k}:${v.px}@${v.at}(${v.pnl$})`).join(' ') : '');
}

const MARK_A = '<!-- TODAY:BEGIN -->', MARK_B = '<!-- TODAY:END -->';
function writeTimeline(o: any) {
  const L: string[] = [];
  L.push(`## ${o.day} replayed minute by minute (no look-ahead)`, '');
  L.push(`Calendar: **${o.cal.labels.join(', ') || 'ordinary'}** · 08:30 pre-market volume ${o.macroRvol?.toFixed(1) ?? '—'}× median · SPY 15:59 close ${o.settle.toFixed(2)} · causal check (every trigger first visible exactly one minute after its bar opened, i.e. at its close): **${o.lookAheadOk ? 'pass' : 'FAIL'}**`, '');
  if (o.closeFlowLine) L.push(`Context line the new engine prints from 15:30: _${o.closeFlowLine}_`, '');
  L.push('### (a) Current index engine (policies A/B, 5-min bars, cron cadence)', '');
  for (const v of ['rec', 'op']) {
    const rows = o.engineRows.filter((r: any) => r.variant === v);
    const pubs = rows.filter((r: any) => r.publish);
    L.push(`**GEX variant \`${v}\`** — ${v === 'rec' ? "the chart recorder's own SPY samples today (net sign flipped around zero all afternoon; top strikes → walls), zero-γ 768.6" : "operator's read: negative gamma, zero-γ 768.6, put wall 765"}: ${pubs.length} publish${pubs.length === 1 ? '' : 'es'} in ${rows.length} passes.`, '');
    L.push('| ET | GEX sign (net $B) | verdict | contract | entry | exit | P&L / contract |', '|---|---|---|---|---|---|---|');
    // compress: show publishes + the afternoon passes from 14:30
    for (const r of rows) {
      const m = Number(r.at.slice(0, 2)) * 60 + Number(r.at.slice(3));
      if (!r.publish && m < 870) continue;
      const verdict = r.setup ? `${r.setup.policy} ${r.setup.dir} (trigger ${r.setup.trigger}, stop ${r.setup.stop}, target ${r.setup.target})${r.publish ? '' : ' — deduped (30 min)'}` : r.wait;
      const p = r.publish;
      L.push(`| ${r.at} | ${r.sign} (${r.netB}) | ${verdict} | ${p?.occ ?? (p?.none ?? '')} | ${p?.entry != null ? `$${p.entry.toFixed(2)} @ ${p.entryAt}` : ''} | ${p?.exit != null ? `$${p.exit.toFixed(2)} @ ${p.exitAt} (${p.why})` : ''} | ${p?.pnl$ != null ? `$${p.pnl$}` : ''} |`);
    }
    L.push('');
  }
  L.push('### (b) New fast-move detector (1-min bars, evaluated every minute)', '');
  L.push(`Entry = the next minute's option-bar HIGH (conservative). P&L per contract = (exit − entry) × 100. SPXW strike = SPY price × the prior close's ^GSPC/SPY ratio (${o.ratioPrior.toFixed(4)}) on the 5-pt grid; SPXW priced on its own real 1-min bars and settled on the ^GSPC close (${o.spxSettle?.toFixed(2) ?? '—'}); SPY settled on its 15:59 close (${o.settle.toFixed(2)}).`, '');
  L.push('| known at (ET) | cause | side | contract | entry | max after entry | hold (expiry) | take2x | take3x | half2x_trail | stop50 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const cell = (r: any, k: string) => { const x = r.exits?.[k]; return x ? `$${x.px.toFixed(2)} @ ${x.at} · **${x.pnl$ >= 0 ? '+' : ''}$${x.pnl$}** (${x.pnlPct >= 0 ? '+' : ''}${x.pnlPct}%)` : '—'; };
  for (const r of o.newRows) for (const g of [r.spxw, r.spy]) {
    L.push(`| ${r.known} | ${r.label} | ${r.side === 'short' ? 'puts' : 'calls'} | ${g.occ ?? '—'} (${r.variant}) | ${g.entry != null ? `$${g.entry.toFixed(2)} @ ${g.entryAt}` : `no fill (${g.prints} bars)`} | ${g.maxHigh != null ? `$${g.maxHigh.toFixed(2)} (${g.maxMult}×)` : '—'} | ${cell(g, 'hold')} | ${cell(g, 'take2x')} | ${cell(g, 'take3x')} | ${cell(g, 'half2x_trail')} | ${cell(g, 'stop50')} |`);
  }
  L.push('', 'Trigger notes:', '');
  for (const r of o.newRows.filter((x: any) => x.variant === 'otm1')) L.push(`- ${r.trigBar} bar (known ${r.known}) · ${r.label} · ${r.side === 'short' ? 'puts' : 'calls'} — ${r.note}${r.rvol1 != null ? ` · trigger-bar RVOL ${r.rvol1.toFixed(1)}×` : ''}`);
  L.push('', `SPXW data check: ${o.spxwProbe.length} SPXW contracts requested from Alpaca v1beta1 bars; ${o.spxwProbe.filter((x: string) => !/: 0 one-minute/.test(x)).length} returned 1-min bars (${[...new Set(o.spxwProbe as string[])].slice(0, 6).join('; ')}).`);
  upsertSection(path.resolve(process.cwd(), 'docs/SPX_FAST_MOVES_2026-09-30.md'), MARK_A, MARK_B, L.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
