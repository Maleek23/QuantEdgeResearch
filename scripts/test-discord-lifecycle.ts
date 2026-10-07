/**
 * QuantEdge Labs Discord lifecycle (server/discord-lifecycle.ts): routing, the
 * Labs-lane guard, publish caps + digest, trigger / exit edits + replies, strict
 * dedupe, gated → queued (never dropped), batching, recap, bot dedupe, restart
 * persistence. No network: every POST goes to an in-process mock; global fetch
 * is replaced for the postDiscordWebhook guard checks.
 *
 * Run: npx tsx scripts/test-discord-lifecycle.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-lifecycle-'));
process.env.SHARED_STATE_DIR = tmp;
const HOOK = (n: string) => `https://discord.com/api/webhooks/${n}/tok-${n}`;
const ENV = {
  DISCORD_WEBHOOK_NEXUS_IDEAS: HOOK('1001'),
  DISCORD_WEBHOOK_0DTE_IDEAS: HOOK('1002'),
  DISCORD_WEBHOOK_SWING_IDEAS: HOOK('1003'),
  DISCORD_WEBHOOK_ROTATION_IDEAS: HOOK('1004'),
  QUANT_BOT_DISCORD_WEBHOOK: HOOK('1005'),
};
Object.assign(process.env, ENV);
delete process.env.DISCORD_LIFECYCLE;
delete process.env.DISCORD_LABS_CAP_PER_HOUR;
delete process.env.DISCORD_LABS_CAP_PER_DAY;

// No real network anywhere in this file.
const realFetch = globalThis.fetch;
const fetched: Array<{ url: string; method: string }> = [];
globalThis.fetch = (async (url: any, init?: any) => {
  fetched.push({ url: String(url), method: String(init?.method ?? 'GET') });
  return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
}) as any;

const L = await import('../server/discord-lifecycle');
const DS = await import('../server/discord-service');

type Call = { url: string; method: string; body: any; lane?: string };
let calls: Call[] = [];
let mode: 'ok' | 'gate' = 'ok';
let msgSeq = 0;
let clock = Date.parse('2026-10-07T13:58:00Z'); // 09:58 ET, Wednesday
const poster = async (url: string, init: RequestInit, opts?: { lane?: 'labs' }) => {
  calls.push({ url, method: String(init.method), body: JSON.parse(String(init.body)), lane: opts?.lane });
  if (mode === 'gate' && init.method === 'POST') return new Response(null, { status: 204 });
  if (init.method === 'PATCH') return new Response(JSON.stringify({ id: url.split('/').pop() }), { status: 200 });
  return new Response(JSON.stringify({ id: `m${++msgSeq}`, channel_id: 'c77', guild_id: 'g99' }), { status: 200 });
};
const reset = () => {
  calls = []; mode = 'ok'; msgSeq = 0;
  L.__setLifecycleTestMode({ post: poster, http: async () => new Response('{}', { status: 404 }), now: () => clock });
};

const tests: Array<[string, () => Promise<void> | void]> = [];
const t = (n: string, f: () => Promise<void> | void) => tests.push([n, f]);

const zdte = (over: Record<string, unknown> = {}) => ({
  id: 'idea-tsla-380p', symbol: 'TSLA', direction: 'short', assetType: 'option', source: 'zero_dte_flow',
  optionType: 'put', strikePrice: 380, expiryDate: '2026-10-07', entryPrice: 381.2, targetPrice: 375, stopLoss: 384.1,
  entryPremium: 2.1, analysis: 'Put sweep into the open.', timestamp: new Date(clock).toISOString(), status: 'published', outcomeStatus: 'open', ...over,
});
const nexus = (id: string, sym: string, letter = 'A', over: Record<string, unknown> = {}) => ({
  id, symbol: sym, direction: 'long', assetType: 'stock', source: 'market_scanner', holdingPeriod: 'day',
  entryPrice: 100, targetPrice: 106, stopLoss: 97, timestamp: new Date(clock).toISOString(), status: 'published', outcomeStatus: 'open',
  nexusGrade: { letter, score: letter === 'A' ? 92 : letter === 'B' ? 84 : 70 }, ...over,
});
const posts = () => calls.filter((c) => c.method === 'POST');
const contents = () => posts().map((c) => c.body.content ?? c.body.embeds?.[0]?.title ?? '');

// ─── Routing & guard ────────────────────────────────────────────────────

t('routing: 0DTE / rotation / swing / nexus; Labs set; enabled by default', () => {
  assert.equal(L.ideaChannel(zdte(), clock), '0dte');
  assert.equal(L.ideaChannel({ symbol: 'SPY', assetType: 'option', optionType: 'put', expiryDate: '2026-10-08' }, clock), '0dte', '1DTE counts');
  assert.equal(L.ideaChannel({ symbol: 'XLI', source: 'sector_ignition' }, clock), 'rotation');
  assert.equal(L.ideaChannel({ symbol: 'MU', holdingPeriod: 'swing' }, clock), 'swing');
  assert.equal(L.ideaChannel({ symbol: 'MU', holdingPeriod: 'day', source: 'quant' }, clock), 'nexus');
  assert.equal(L.ideaChannel({ symbol: 'X', source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_open_drive' }, clock), '0dte');
  assert.equal(L.labsWebhookSet().size, 5);
  assert.ok(L.isLabsWebhook(`${HOOK('1002')}?wait=true`));
  assert.ok(L.isLabsWebhook(HOOK('1001').replace('discord.com', 'discordapp.com') + '/messages/123'));
  assert.equal(L.lifecycleEnabled({}), true);
  assert.equal(L.lifecycleEnabled({ DISCORD_LIFECYCLE: 'off' }), false);
});

t('guard: a non-lifecycle post to a Labs webhook never leaves (generic spam blocked); lane labs does', async () => {
  fetched.length = 0;
  const r = await DS.postDiscordWebhook(HOOK('1001'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'whale flow!!' }) });
  assert.equal(r.status, 204); assert.equal(fetched.length, 0);
  const r2 = await DS.postDiscordWebhook(`${HOOK('1004')}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'card' }) }, { lane: 'labs' });
  assert.equal(r2.status, 200); assert.equal(fetched.length, 1);
  // PATCH (card edit) skips the rate gate; legacy non-Labs hooks still post.
  await DS.postDiscordWebhook(`${HOOK('1004')}/messages/5`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'edit' }) }, { lane: 'labs' });
  assert.equal(fetched.at(-1)!.method, 'PATCH');
  const r3 = await DS.postDiscordWebhook(HOOK('2001'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'legacy' }) });
  assert.equal(r3.status, 200);
});

t('sendTradeIdeaToDiscord: a Labs-routed idea becomes a lifecycle card (id required) — never a free post', async () => {
  reset(); fetched.length = 0;
  const noId = await DS.sendTradeIdeaToDiscord({ ...nexus('', 'NVDA'), id: undefined } as any, { forceBypassFilters: true });
  assert.equal(noId.sent, false); assert.match(noId.reason!, /no id/);
  const withId = await DS.sendTradeIdeaToDiscord(nexus('idea-nvda', 'NVDA') as any, { forceBypassFilters: true });
  assert.equal(withId.sent, true);
  assert.equal(fetched.length, 0, 'nothing posted directly');
  assert.equal(L.__lifecycleStateForTest().outbox.filter((o) => o.kind === 'card').length, 1);
});

// ─── Publish ────────────────────────────────────────────────────────────

t('publish: 0DTE card POSTs ?wait=true, message id persisted; strict dedupe per idea and per thesis/day', async () => {
  reset();
  assert.equal(await L.onIdeaPublished(zdte()), 'queued');
  assert.equal(await L.onIdeaPublished(zdte()), 'duplicate', 'same idea id');
  assert.equal(await L.onIdeaPublished(zdte({ id: 'idea-tsla-380p-again' })), 'duplicate', 'same contract re-published today');
  await L.flushOutbox();
  assert.equal(posts().length, 1);
  assert.match(posts()[0].url, /1002\/tok-1002\?wait=true$/);
  assert.equal(posts()[0].lane, 'labs');
  const e = posts()[0].body.embeds[0];
  assert.match(e.title, /^0DTE · TSLA 380P 0DTE · BUY PUT$/);
  const f = Object.fromEntries(e.fields.map((x: any) => [x.name, x.value]));
  assert.match(f.Status, /waiting for the entry trigger/);
  assert.match(f.Contract, /\$2\.10 premium at publish 09:58 ET \(publish-time quote, not live\)/);
  assert.match(f.Data, /never live/);
  assert.match(f.Timeline, /09:58 ET published/);
  const card = L.__lifecycleStateForTest().cards['idea-tsla-380p'];
  assert.equal(card.messageId, 'm1'); assert.equal(card.guildId, 'g99'); assert.equal(card.channelId, 'c77');
  await L.flushOutbox();
  assert.equal(posts().length, 1, 'never reposted');
});

t('publish gates: grade A/B for graded channels, draft / closed / off / channel toggle', async () => {
  reset();
  assert.equal(await L.onIdeaPublished(nexus('n-c', 'AAA', 'C')), 'below_grade');
  assert.equal(await L.onIdeaPublished(nexus('n-b', 'BBB', 'B')), 'queued');
  assert.equal(await L.onIdeaPublished(nexus('n-d', 'DDD', 'A', { status: 'draft' })), 'not_published');
  assert.equal(await L.onIdeaPublished(nexus('n-e', 'EEE', 'A', { outcomeStatus: 'hit_stop' })), 'not_published');
  L.setChannelEnabled('nexus', false);
  assert.equal(await L.onIdeaPublished(nexus('n-f', 'FFF', 'A')), 'channel_off');
  assert.equal(L.__lifecycleStateForTest().outbox.filter((o) => o.channel === 'nexus').length, 0, 'toggle off drops queued posts');
  L.setChannelEnabled('nexus', true);
  process.env.DISCORD_LIFECYCLE = 'off';
  try { assert.equal(await L.onIdeaPublished(nexus('n-g', 'GGG', 'A')), 'off'); } finally { delete process.env.DISCORD_LIFECYCLE; }
  const prev = process.env.DISCORD_WEBHOOK_SWING_IDEAS; delete process.env.DISCORD_WEBHOOK_SWING_IDEAS;
  try { assert.equal(await L.onIdeaPublished(nexus('n-h', 'HHH', 'A', { holdingPeriod: 'swing' })), 'no_webhook'); } finally { process.env.DISCORD_WEBHOOK_SWING_IDEAS = prev; }
});

t('cap: a 20-idea scanner burst → 8 cards + ONE digest post; 0DTE uncapped', async () => {
  reset();
  for (let k = 0; k < 20; k++) assert.ok(['queued', 'capped'].includes(await L.onIdeaPublished(nexus(`burst-${k}`, `S${k}`, 'A'))));
  const st = L.__lifecycleStateForTest();
  assert.equal(Object.values(st.cards).filter((c) => c.channel === 'nexus').length, 8);
  assert.equal(st.overflow.nexus!.length, 12);
  assert.equal(st.outbox.filter((o) => o.kind === 'digest').length, 1, 'one digest, coalesced');
  for (let k = 0; k < 12; k++) assert.equal(await L.onIdeaPublished(zdte({ id: `z${k}`, strikePrice: 300 + k })), 'queued');
  await L.flushOutbox();
  assert.equal(posts().filter((c) => c.url.includes('1001')).length, 8, 'digest waits for the burst to settle');
  clock += 11 * 60_000;
  await L.flushOutbox();
  const digest = posts().filter((c) => c.url.includes('1001') && /Also published \(12\)/.test(c.body.content ?? ''));
  assert.equal(digest.length, 1);
  assert.match(digest[0].body.content, /over this channel's card cap \(8\/hour, 25\/day\)/);
  assert.equal(posts().filter((c) => c.url.includes('1002')).length, 12, 'every 0DTE idea carded');
  assert.equal(L.__lifecycleStateForTest().overflow.nexus!.length, 0);
  clock -= 11 * 60_000;
});

// ─── Trigger / resolution ───────────────────────────────────────────────

t('trigger: PATCH the card + one entry reply with the bar time in ET and a link; duplicate = no-op', async () => {
  reset();
  await L.onIdeaPublished(zdte()); await L.flushOutbox();
  calls = [];
  assert.equal(await L.onIdeaTriggered({ ideaId: 'nope', observedAt: clock }), 'no_card');
  assert.equal(await L.onIdeaTriggered({ ideaId: 'idea-tsla-380p', observedAt: '2026-10-07T14:05:00Z', observedPrice: 381.2, triggerPrice: 381.2, basis: '5m' }), 'queued');
  assert.equal(await L.onIdeaTriggered({ ideaId: 'idea-tsla-380p', observedAt: '2026-10-07T14:10:00Z', basis: '5m' }), 'duplicate');
  await L.flushOutbox();
  const patch = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patch.length, 1);
  assert.match(patch[0].url, /1002\/tok-1002\/messages\/m1$/);
  const f = Object.fromEntries(patch[0].body.embeds[0].fields.map((x: any) => [x.name, x.value]));
  assert.match(f.Status, /Triggered 10:05 ET/);
  assert.match(f.Timeline, /10:05 ET triggered · \$381\.20 traded \(5m bar start, delayed data\)/);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].body.content, /^▶️ \*\*ENTRY\*\* · TSLA 380P 0DTE · trigger \$381\.20 traded 10:05 ET \(5m bar start, delayed data\) · \[card\]\(https:\/\/discord\.com\/channels\/g99\/c77\/m1\)$/);
  assert.deepEqual(posts()[0].body.allowed_mentions, { parse: [] });
});

t('resolution: target hit → card edit + "✅ … target hit 10:45 ET · +X%" reply; verified only on a bar hit; duplicate = no-op', async () => {
  reset();
  await L.onIdeaPublished(zdte()); await L.onIdeaTriggered({ ideaId: 'idea-tsla-380p', observedAt: '2026-10-07T14:05:00Z', observedPrice: 381.2, basis: '5m' });
  await L.flushOutbox(); calls = [];
  const ev = { ideaId: 'idea-tsla-380p', outcomeStatus: 'hit_target', resolutionReason: 'auto_target_hit', exitDate: '2026-10-07T09:45:00-05:00', exitTimeSource: 'bar_hit', exitPrice: 375, percentGain: 1.6, optionPercentGain: 42, optionPremiumBasis: 'touch_bar' };
  assert.equal(await L.onIdeaResolved(ev), 'queued');
  assert.equal(await L.onIdeaResolved(ev), 'duplicate');
  await L.flushOutbox();
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(posts().length, 1);
  assert.match(posts()[0].body.content, /^✅ \*\*TARGET HIT\*\* · TSLA 380P 0DTE · 10:45 ET · \+\$\d+ at \$500 risk \/ \+42% option \(modeled from the contract bar, delayed quote\) \/ \+1\.6% underlying \(bar hit\)/);
  const c = L.__lifecycleStateForTest().cards['idea-tsla-380p'];
  assert.equal(c.status, 'win'); assert.equal(c.verified, true);
  // Risk-sized $ (NEXUS_RISK_DOLLARS default $500): positive, never above the 0DTE sizing of $500 risk.
  assert.ok(typeof c.riskPnl === 'number' && c.riskPnl > 0 && c.riskDollars === 500);
  // Unverified time label when the hit time came from a poll.
  await L.onIdeaPublished(zdte({ id: 'q2', symbol: 'QQQ', strikePrice: 753 }));
  await L.onIdeaResolved({ ideaId: 'q2', outcomeStatus: 'hit_stop', exitDate: '2026-10-07T10:30:00-05:00', exitTimeSource: 'live', percentGain: -0.8 });
  assert.equal(L.__lifecycleStateForTest().cards.q2.verified, false);
  // A blown-out option loss (−95% of premium) posts at most its risk to the stop (≤ $500), labelled capped.
  await L.onIdeaPublished(zdte({ id: 'q3', symbol: 'IWM', strikePrice: 240 }));
  await L.onIdeaResolved({ ideaId: 'q3', outcomeStatus: 'hit_stop', exitDate: '2026-10-07T10:40:00-05:00', exitTimeSource: 'bar_hit', percentGain: -1.2, optionPercentGain: -95 });
  const q3 = L.__lifecycleStateForTest().cards.q3;
  assert.ok(typeof q3.riskPnl === 'number' && q3.riskPnl >= -500 && q3.riskPnl < 0, `q3 ${q3.riskPnl}`);
  assert.match(L.__lifecycleStateForTest().outbox.find((o) => o.ideaId === 'q3' && o.kind === 'reply')!.line!, /−\$\d+ at \$500 risk \(capped at stop\)/);
  assert.match(L.__lifecycleStateForTest().outbox.find((o) => o.ideaId === 'q2' && o.kind === 'reply')!.line!, /STOP HIT.*hit time unverified/);
});

t('lapsed untriggered idea: card edit only, no reply', async () => {
  reset();
  await L.onIdeaPublished(nexus('lapse', 'LLL', 'A')); await L.flushOutbox(); calls = [];
  await L.onIdeaResolved({ ideaId: 'lapse', outcomeStatus: 'expired', resolutionReason: 'horizon_expiry', exitDate: new Date(clock).toISOString(), exitTimeSource: 'deadline' });
  await L.flushOutbox();
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 1);
  assert.equal(posts().length, 0);
});

// ─── Delivery: gated → queued, batching ─────────────────────────────────

t('gated by the shared rate gate (204) → stays queued and is retried; reply waits for its card', async () => {
  reset();
  mode = 'gate';
  await L.onIdeaPublished(zdte());
  await L.onIdeaTriggered({ ideaId: 'idea-tsla-380p', observedAt: '2026-10-07T14:05:00Z', basis: '5m' });
  const r1 = await L.flushOutbox();
  assert.equal(r1.sent, 0); assert.equal(r1.dropped, 0);
  assert.equal(L.__lifecycleStateForTest().outbox.length, 2, 'card + reply kept (the edit coalesced into the unposted card)');
  mode = 'ok'; clock += 30_000;
  await L.flushOutbox();
  clock -= 30_000;
  const okPosts = calls.filter((c) => c.method === 'POST' && c.body);
  const last2 = okPosts.slice(-2);
  assert.ok(last2[0].body.embeds, 'card first'); assert.match(last2[1].body.content, /ENTRY.*\[card\]/, 'then the linked reply');
  assert.match(last2[0].body.embeds[0].fields[0].value, /Triggered 10:05 ET/, 'card goes out with the current state');
  assert.equal(L.__lifecycleStateForTest().outbox.length, 0);
});

t('batching: more than 5 replies inside a minute → one message', async () => {
  reset();
  for (let k = 0; k < 7; k++) await L.onIdeaPublished(zdte({ id: `b${k}`, strikePrice: 400 + k }));
  await L.flushOutbox(); calls = [];
  for (let k = 0; k < 7; k++) await L.onIdeaTriggered({ ideaId: `b${k}`, observedAt: '2026-10-07T14:05:00Z', basis: '5m' });
  await L.flushOutbox();
  assert.equal(posts().length, 1);
  assert.match(posts()[0].body.content, /^\*\*Updates \(09:58 ET\)\*\*\n▶️ \*\*ENTRY\*\* · TSLA 400P/);
  assert.equal(posts()[0].body.content.split('\n').length, 8);
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 7, 'every card still edited');
});

// ─── Recap & bot ────────────────────────────────────────────────────────

t('recap 16:20 ET: one per channel with activity, verified/unverified labels, never twice', async () => {
  reset();
  await L.onIdeaPublished(zdte()); await L.onIdeaPublished(zdte({ id: 'q2', symbol: 'QQQ', strikePrice: 753 }));
  await L.onIdeaTriggered({ ideaId: 'idea-tsla-380p', observedAt: '2026-10-07T14:05:00Z', basis: '5m' });
  await L.onIdeaResolved({ ideaId: 'idea-tsla-380p', outcomeStatus: 'hit_target', exitDate: '2026-10-07T09:45:00-05:00', exitTimeSource: 'bar_hit', optionPercentGain: 42 });
  await L.onIdeaResolved({ ideaId: 'q2', outcomeStatus: 'hit_stop', exitDate: '2026-10-07T10:30:00-05:00', exitTimeSource: 'live', percentGain: -1 });
  await L.flushOutbox(); calls = [];
  const at = Date.parse('2026-10-07T20:20:00Z');
  const r = await L.runDailyRecap(at);
  assert.equal(r['0dte'], 'queued'); assert.equal(r.nexus, 'nothing'); assert.equal(r.bot, 'nothing');
  assert.equal(posts().length, 1);
  const body = posts()[0].body.content as string;
  assert.match(body, /0DTE · daily recap 2026-10-07/);
  assert.match(body, /Published 2 · Triggered 1 · Wins 1 \(1 verified \/ 0 unverified\) · Losses 1 \(0 verified \/ 1 unverified\)/);
  const again = await L.runDailyRecap(at);
  assert.equal(again['0dte'], 'duplicate');
});

t('bot: one entry + one exit per position (persisted dedupe), gated → queued not lost, recap', async () => {
  reset();
  const url = ENV.QUANT_BOT_DISCORD_WEBHOOK;
  assert.equal(await L.sendBotEvent(url, 'pos-1', 'entry', { content: 'BOT ENTRY' }, { label: 'SPY 660P 0DTE' }), 'sent');
  assert.equal(await L.sendBotEvent(url, 'pos-1', 'entry', { content: 'BOT ENTRY' }, { label: 'SPY 660P 0DTE' }), 'duplicate');
  mode = 'gate';
  assert.equal(await L.sendBotEvent(url, 'pos-1', 'exit', { content: 'BOT EXIT' }, { label: 'SPY 660P 0DTE', pnl: 714, pct: 85, reason: 'target_hit' }), 'gated');
  assert.equal(await L.sendBotEvent(url, 'pos-1', 'exit', { content: 'BOT EXIT' }, { label: 'SPY 660P 0DTE' }), 'duplicate', 'never re-announced');
  mode = 'ok'; clock += 120_000;
  await L.flushOutbox();
  clock -= 120_000;
  assert.equal(posts().filter((c) => c.body.content === 'BOT EXIT').length, 2, 'gated attempt + the retry that landed');
  assert.equal(L.__lifecycleStateForTest().outbox.length, 0);
  const rec = L.buildRecap(L.__lifecycleStateForTest(), 'bot', '2026-10-07') as any;
  assert.match(rec.content, /Entries 1 · Exits 1 · Wins 1 · Losses 0 · Net \+\$714\.00/);
});

t('bot notifier: exit quote label from the close tag (never "live" when delayed)', async () => {
  const { exitQuoteLine } = await import('../server/bot-discord-notifier');
  assert.match(exitQuoteLine('time_stop [fill-mid mid=1.2 bid=1.1 ask=1.3 source=cboe delayed=true observedAt=2026-10-07T19:30:00Z]'), /cboe · DELAYED/);
  assert.match(exitQuoteLine('stop_hit'), /treat as delayed/);
});

// ─── Persistence (restart) ──────────────────────────────────────────────

t('restart: cards, dedupe keys and the outbox survive in the state file', async () => {
  L.__setLifecycleTestMode({ post: poster, http: async () => new Response('{}', { status: 404 }), now: () => clock, persist: true });
  calls = []; mode = 'gate'; msgSeq = 0;
  assert.equal(await L.onIdeaPublished(zdte({ id: 'persist-1', symbol: 'SPY', strikePrice: 772 })), 'queued');
  await L.flushOutbox();
  const file = path.join(tmp, 'discord-lifecycle.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')).data;
  assert.ok(saved.cards['persist-1']); assert.equal(saved.outbox.length, 1, 'gated card kept on disk');
  // "Restart": a fresh read of the file sees the same card — the publish is a duplicate.
  assert.equal(await L.onIdeaPublished(zdte({ id: 'persist-1', symbol: 'SPY', strikePrice: 772 })), 'duplicate');
  mode = 'ok'; clock += 30_000;
  await L.flushOutbox(); clock -= 30_000;
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).data.cards['persist-1'].messageId, 'm1');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).stack}`); }
}
L.__setLifecycleTestMode(null);
globalThis.fetch = realFetch;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} passed`);
process.exit(failed ? 1 : 0);
