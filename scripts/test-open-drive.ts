/**
 * Open-drive policy (09:31–09:44 ET) + bot Discord notifier — pure, no network, no DB.
 *   npm run -s test:open-drive
 */
import assert from 'node:assert/strict';
import { evaluateOpenDrive, inOpenDriveWindow, openDriveOrBars, openDriveEnabled, OPEN_DRIVE_WINDOW, type OpenDriveInput } from '../server/open-drive-core';
import { splitOneMinuteSession, openDriveFiredToday, noteOpenDriveFired, __resetOpenDriveCapsForTest } from '../server/open-drive';
import type { Bar } from '../server/zero-dte-structure';
import {
  resolveBotWebhook, buildEntryPayload, buildExitPayload, classifyExitReason, quoteFromCatalyst,
  notifyBotEntry, notifyBotExit, __setBotNotifierPosterForTest, BOT_NOTIFIER_FOOTER, entryFromFill,
} from '../server/bot-discord-notifier';

const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// 2026-10-05 (Mon) is EDT: 09:30 ET = 13:30Z.
const OPEN = Date.parse('2026-10-05T13:30:00Z');
const at = (min: number) => OPEN + (min - 570) * 60_000;
const bar = (min: number, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ t: at(min), o, h, l, c, v });

/** OR 100.00–100.30 over 09:30–09:32, then two closes above (09:33, 09:34); now = 09:35. */
function longBars(): Bar[] {
  return [
    bar(570, 100.1, 100.3, 100.0, 100.2), bar(571, 100.2, 100.25, 100.05, 100.1), bar(572, 100.1, 100.2, 100.02, 100.15),
    bar(573, 100.15, 100.4, 100.15, 100.35), bar(574, 100.35, 100.45, 100.32, 100.42),
  ];
}
function shortBars(): Bar[] {
  return [
    bar(570, 100.2, 100.3, 100.0, 100.1), bar(571, 100.1, 100.25, 100.05, 100.1), bar(572, 100.1, 100.2, 100.02, 100.05),
    bar(573, 100.05, 100.05, 99.9, 99.95), bar(574, 99.95, 99.96, 99.85, 99.88),
  ];
}
const freshGex = (over: Partial<NonNullable<OpenDriveInput['gex']>> = {}) => ({ sign: 'negative' as const, zeroGamma: 101.5, callWall: 103, putWall: 97, zeroDte: null, fetchedAt: new Date(at(573)).toISOString(), ...over });
const base = (over: Partial<OpenDriveInput> = {}): OpenDriveInput => ({
  symbol: 'SPY', rth: longBars(), pre: [bar(500, 99.8, 100.1, 99.7, 99.9)], pdc: 99.9,
  gex: freshGex(), nowMs: at(575), etMin: 575, firedToday: { bySymbol: {}, total: 0 }, ...over,
});

t('window: 09:31–09:44 only; A/B unchanged from 09:45', () => {
  assert.equal(OPEN_DRIVE_WINDOW.start, 571); assert.equal(OPEN_DRIVE_WINDOW.end, 584);
  assert.equal(inOpenDriveWindow(570), false); assert.equal(inOpenDriveWindow(571), true);
  assert.equal(inOpenDriveWindow(584), true); assert.equal(inOpenDriveWindow(585), false);
  assert.match(evaluateOpenDrive(base({ etMin: 585 })).wait[0], /outside 09:31/);
});

t('OR forming: needs OR bars + 2 hold bars closed', () => {
  const v = evaluateOpenDrive(base({ nowMs: at(574), etMin: 574 }));
  assert.equal(v.setup, null); assert.match(v.wait[0], /opening range forming \(4\/5/);
});

t('long: held break above OR high, above prior close, above VWAP, −γ → stop OR low, nearest wall target', () => {
  const v = evaluateOpenDrive(base({ gex: freshGex({ callWall: 100.9 }) }));
  assert.ok(v.setup, v.wait.join());
  assert.equal(v.setup!.direction, 'long');
  assert.equal(v.setup!.entry, 100.42);
  assert.equal(v.setup!.stop, 100.0);
  assert.equal(v.setup!.target, 100.9);
  assert.equal(v.setup!.targetName, 'call wall');
  assert.equal(v.setup!.policy, 'open_drive');
  assert.ok(v.setup!.evidence.some((e) => /above prior close/.test(e)));
});

t('long: no wall ahead → 1.5R measured move', () => {
  const v = evaluateOpenDrive(base({ gex: freshGex({ callWall: 99, zeroGamma: 99.5 }) }));
  assert.ok(v.setup);
  assert.ok(Math.abs(v.setup!.target - (100.42 + 1.5 * 0.42)) < 1e-9);
  assert.match(v.setup!.targetName, /measured/);
});

t('long: wall closer than 1R blocks → WAIT', () => {
  const v = evaluateOpenDrive(base({ gex: freshGex({ callWall: 100.6 }) }));
  assert.equal(v.setup, null); assert.match(v.wait[0], /call wall 100\.60 only 0\.43R ahead/);
});

t('pin: +γ with a magnet within 0.15% → WAIT; +γ with magnets far away passes', () => {
  const pinned = evaluateOpenDrive(base({ gex: freshGex({ sign: 'positive', zeroDte: { callWall: null, putWall: null, maxGamma: 100.5 } }) }));
  assert.equal(pinned.setup, null); assert.match(pinned.wait[0], /\+γ pin — 0DTE max-gamma 100\.50/);
  const free = evaluateOpenDrive(base({ gex: freshGex({ sign: 'positive', callWall: 101.5, zeroGamma: 99, putWall: 98 }) }));
  assert.ok(free.setup, free.wait.join());
});

t('gamma unknown: no snapshot / stale snapshot → WAIT (cannot rule out a pin)', () => {
  assert.match(evaluateOpenDrive(base({ gex: null })).wait[0], /no opening GEX snapshot/);
  assert.match(evaluateOpenDrive(base({ gex: freshGex({ fetchedAt: new Date(at(560)).toISOString() }) })).wait[0], /15m old/);
  const replay = evaluateOpenDrive(base({ gex: null, skipGammaGate: true }));
  assert.ok(replay.setup); assert.ok(replay.setup!.evidence.some((e) => /NOT evaluated/.test(e)));
});

t('long needs above prior close OR above pre-market high', () => {
  const v = evaluateOpenDrive(base({ pdc: 101, pre: [bar(500, 100.5, 100.8, 100.4, 100.6)] }));
  assert.equal(v.setup, null); assert.match(v.wait[0], /below prior close 101\.00 and pre-market high 100\.80/);
  const pmh = evaluateOpenDrive(base({ pdc: 101, pre: [bar(500, 100.0, 100.2, 99.9, 100.1)] }));
  assert.ok(pmh.setup); assert.ok(pmh.setup!.evidence.some((e) => /above pre-market high 100\.20/.test(e)));
});

t('short mirror: held break below OR low, below prior close, below VWAP → stop OR high', () => {
  const v = evaluateOpenDrive(base({ rth: shortBars(), pdc: 100.4, gex: freshGex({ putWall: 99.3 }) }));
  assert.ok(v.setup, v.wait.join());
  assert.equal(v.setup!.direction, 'short');
  assert.equal(v.setup!.stop, 100.3);
  assert.equal(v.setup!.target, 99.3);
});

t('one bar back inside the OR = no hold', () => {
  const b = longBars(); b[4] = bar(574, 100.35, 100.4, 100.2, 100.25);
  assert.match(evaluateOpenDrive(base({ rth: b })).wait[0], /no held break/);
});

t('chase guard: more than one OR width beyond the edge → WAIT', () => {
  const b = longBars(); b[4] = bar(574, 100.35, 100.7, 100.32, 100.65);
  assert.match(evaluateOpenDrive(base({ rth: b, gex: freshGex({ callWall: 103 }) })).wait[0], /no chase/);
});

t('caps: 1 per symbol, 2 total per day (state rolls over by ET day)', () => {
  assert.match(evaluateOpenDrive(base({ firedToday: { bySymbol: { SPY: 1 }, total: 1 } })).wait[0], /SPY already fired/);
  assert.match(evaluateOpenDrive(base({ symbol: 'IWM', firedToday: { bySymbol: { SPY: 1, QQQ: 1 }, total: 2 } })).wait[0], /daily cap reached/);
  __resetOpenDriveCapsForTest();
  noteOpenDriveFired('SPY', at(575)); noteOpenDriveFired('QQQ', at(576));
  assert.deepEqual(openDriveFiredToday(at(577)), { bySymbol: { SPY: 1, QQQ: 1 }, total: 2 });
  assert.equal(openDriveFiredToday(at(577) + 864e5).total, 0);
});

t('1-minute session split: pre-market vs regular hours, today only', () => {
  const yday = { t: at(575) - 864e5, o: 1, h: 1, l: 1, c: 1, v: 1 };
  const s = splitOneMinuteSession([bar(569, 1, 1, 1, 1), bar(570, 2, 2, 2, 2), bar(240, 3, 3, 3, 3), bar(239, 4, 4, 4, 4), yday], '2026-10-05');
  assert.deepEqual(s.rth.map((b) => b.c), [2]);
  assert.deepEqual(s.pre.map((b) => b.c), [3, 1]);
});

t('env: OPEN_DRIVE=off disables; OPEN_DRIVE_OR_BARS=2 opt-in', () => {
  assert.equal(openDriveEnabled({}), true);
  assert.equal(openDriveEnabled({ OPEN_DRIVE: 'off' }), false);
  assert.equal(openDriveOrBars({}), 3); assert.equal(openDriveOrBars({ OPEN_DRIVE_OR_BARS: '2' }), 2);
});

// ─── Bot Discord notifier ───────────────────────────────────────────────

const HOOK = 'https://discord.com/api/webhooks/123/abc-DEF';
t('webhook: unset = off; never another channel; non-discord refused', () => {
  assert.equal(resolveBotWebhook({}).url, null);
  assert.equal(resolveBotWebhook({ DISCORD_WEBHOOK_QUANTBOT: HOOK }).url, null, 'no fallback to the existing quantbot webhook');
  assert.equal(resolveBotWebhook({ QUANT_BOT_DISCORD_WEBHOOK: HOOK }).url, HOOK);
  assert.match(resolveBotWebhook({ QUANT_BOT_DISCORD_WEBHOOK: HOOK, DISCORD_WEBHOOK_SPX: HOOK + '/' }).reason!, /equals DISCORD_WEBHOOK_SPX — refused/);
  assert.match(resolveBotWebhook({ QUANT_BOT_DISCORD_WEBHOOK: HOOK, DISCORD_WEBHOOK_URL: HOOK.replace('discord.com', 'discordapp.com') }).reason!, /refused/);
  assert.match(resolveBotWebhook({ QUANT_BOT_DISCORD_WEBHOOK: 'https://evil.example/hook' }).reason!, /not a Discord webhook/);
});

const ENTRY_AT = Date.parse('2026-10-05T13:41:00Z');
t('entry embed: contract, side, premium + delayed quote label, size, stop/targets, grade, source, ET time, footer', () => {
  const p: any = buildEntryPayload({
    positionId: 'p1', symbol: 'SPY', optionType: 'put', strike: 660, expiry: '2026-10-05', entryPremium: 4.2, quantity: 2,
    quoteSource: 'cboe', quoteDelayed: true, premiumStop: 2.52, premiumTarget: 8.4, underlyingStop: 662.1, underlyingTarget: 655,
    grade: 'B', sourceEngine: 'gex_scanner / GEX_index_scalp_open_drive', policy: 'open_drive',
    spxMirror: { strike: 6635, ratioLabel: 'SPX/SPY 10.052 (live)' }, at: ENTRY_AT,
  });
  const e = p.embeds[0];
  assert.equal(e.title, 'BOT ENTRY · SPY 660P 0DTE @ $4.20 · 09:41 ET');
  const f = Object.fromEntries(e.fields.map((x: any) => [x.name, x.value]));
  assert.match(f.Side, /BUY PUT/); assert.match(f.Entry, /\$4\.20 × 2 \(\$840\.00 debit\)/);
  assert.match(f.Quote, /cboe · DELAYED \(~15 min\)/); assert.match(f['SPXW mirror'], /SPXW 6635P/);
  assert.match(f.Stop, /premium \$2\.52 · underlying \$662\.10/); assert.match(f.Target, /premium \$8\.40/);
  assert.equal(f.Grade, 'B'); assert.match(f.Source, /policy:open_drive/);
  assert.equal(e.footer.text, BOT_NOTIFIER_FOOTER);
});

t('exit embed: % and $ P&L, reason class, hold time', () => {
  const p: any = buildExitPayload({ positionId: 'p1', symbol: 'SPY', optionType: 'put', strike: 660, expiry: '2026-10-05', entryPremium: 4.2, exitPremium: 7.77, quantity: 2, reason: 'target_hit', entryTime: new Date(ENTRY_AT).toISOString(), at: ENTRY_AT + 31 * 60_000 });
  const e = p.embeds[0];
  assert.equal(e.title, 'BOT EXIT · +85% · 10:12 ET');
  const f = Object.fromEntries(e.fields.map((x: any) => [x.name, x.value]));
  assert.match(f['P&L'], /\+85% · \+\$714\.00/); assert.match(f.Reason, /^target/); assert.equal(f.Hold, '31m');
  assert.equal(classifyExitReason('stop_hit'), 'stop');
  assert.equal(classifyExitReason('0DTE time exit before close'), 'time');
  assert.equal(classifyExitReason('0dte flatten 15:45'), 'flatten');
  assert.equal(classifyExitReason('gap magnet at $5 — banked +40%'), 'target');
});

t('quote tag parsing from the bot catalyst', () => {
  assert.deepEqual(quoteFromCatalyst('[INDEX 0DTE · cboe · delayed] SPY …'), { source: 'cboe', delayed: true });
  assert.deepEqual(quoteFromCatalyst('[A · B · mark: tradier] x'), { source: 'tradier', delayed: false });
  assert.deepEqual(quoteFromCatalyst('nothing'), { source: null, delayed: null });
});

t('delivery: off without env; dedupe per position id; 204 from the shared gate = gated', async () => {
  const sent: string[] = [];
  __setBotNotifierPosterForTest(async (url, init) => { sent.push(String(init.body)); return new Response('{}', { status: 200 }); });
  const prev = process.env.QUANT_BOT_DISCORD_WEBHOOK;
  delete process.env.QUANT_BOT_DISCORD_WEBHOOK;
  const ev = { positionId: 'pos-9', symbol: 'QQQ', optionType: 'call', strike: 600, expiry: '2026-10-05', entryPremium: 1.1, quantity: 1, at: ENTRY_AT };
  assert.equal(await notifyBotEntry(ev), 'off'); assert.equal(sent.length, 0);
  process.env.QUANT_BOT_DISCORD_WEBHOOK = HOOK;
  try {
    assert.equal(await notifyBotEntry(ev), 'sent');
    assert.equal(await notifyBotEntry(ev), 'duplicate');
    assert.equal(await notifyBotExit({ ...ev, exitPremium: 0.66, reason: 'stop_hit' }), 'sent');
    assert.equal(sent.length, 2);
    __setBotNotifierPosterForTest(async () => new Response(null, { status: 204 }));
    assert.equal(await notifyBotEntry({ ...ev, positionId: 'pos-10' }), 'gated');
    const fill = await entryFromFill({ id: 'x', symbol: 'QQQ', optionType: 'call', strikePrice: 600, expiryDate: '2026-10-05', entryPrice: 1.1, quantity: 1, stopLoss: 0.66, targetPrice: 2.2 },
      { catalyst: '[INDEX 0DTE · alpaca · delayed] …', source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_open_drive', qualitySignals: ['policy:open_drive'] },
      { convictionBand: 'B', stopLoss: 599, targetPrice: 603 });
    assert.equal(fill!.policy, 'open_drive'); assert.equal(fill!.quoteSource, 'alpaca'); assert.equal(fill!.underlyingStop, 599);
  } finally {
    if (prev == null) delete process.env.QUANT_BOT_DISCORD_WEBHOOK; else process.env.QUANT_BOT_DISCORD_WEBHOOK = prev;
    __setBotNotifierPosterForTest(null);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}
console.log(`${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
