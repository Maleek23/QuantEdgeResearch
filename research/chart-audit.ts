/**
 * CHART AUDIT — drives the full TradingView-style chart (/t?tab=chart) in
 * headless Chromium at phone / tablet / desktop sizes, with touch or mouse,
 * and checks every toolbar control and drawing tool end to end: place, select,
 * restyle, drag a handle, delete, undo / redo, persistence across reload and
 * interval change, menus, replay, snapshot, fullscreen, tap tooltips, pinch.
 *
 *   npm run build
 *   AUDIT_SERVE_ONLY=1 AUDIT_PORT=5399 npx tsx research/device-audit.ts &   # the harness (synthetic fixtures)
 *   npx tsx research/chart-audit.ts                                          # → table on stdout + research/chart-audit.json
 *
 * Env: CHART_AUDIT_BASE (default http://127.0.0.1:5399), CHART_AUDIT_SHOTS (a
 * directory for screenshots; none when unset), CHART_AUDIT_SIZES ("375x812,…"),
 * PLAYWRIGHT_CORE (path to playwright-core; default: the newest in ~/.npm/_npx).
 * Everything the chart shows here is the harness's synthetic data.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = process.env.CHART_AUDIT_BASE || 'http://127.0.0.1:5399';
const SHOTS = process.env.CHART_AUDIT_SHOTS || '';
const KEY = 'qe-drawings-v1:audit-user:SPY';
const ALL_SIZES = [
  { w: 375, h: 812, touch: true },
  { w: 768, h: 1024, touch: true },
  { w: 1440, h: 900, touch: false },
];
const sizes = process.env.CHART_AUDIT_SIZES
  ? ALL_SIZES.filter((s) => process.env.CHART_AUDIT_SIZES!.split(',').includes(`${s.w}x${s.h}`))
  : ALL_SIZES;

function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries: string[] = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules', 'playwright-core');
    if (fs.existsSync(path.join(p, 'package.json'))) tries.push(p);
  }
  const found = tries.map((t) => { try { return { t, v: req(path.join(t, 'package.json')).version as string }; } catch { return null; } })
    .filter(Boolean) as { t: string; v: string }[];
  found.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
  for (const f of found) { try { return req(f.t); } catch { /* next */ } }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE');
}

type Status = 'works' | 'broken' | 'missing' | 'n/a';
interface Row { check: string; size: string; status: Status; note: string }

async function auditSize(browser: any, size: { w: number; h: number; touch: boolean }, rows: Row[]) {
  const label = `${size.w}x${size.h}${size.touch ? ' touch' : ' mouse'}`;
  const rec = (check: string, status: Status, note = '') => { rows.push({ check, size: label, status, note }); process.stderr.write(`${label.padEnd(16)} ${status.padEnd(7)} ${check}${note ? ' — ' + note : ''}\n`); };
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, hasTouch: size.touch, isMobile: size.w < 768, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f);' });
  await ctx.addInitScript(() => {
    try { if (!sessionStorage.getItem('audit-init')) { localStorage.clear(); sessionStorage.setItem('audit-init', '1'); localStorage.setItem('qe-mode', 'dark'); } localStorage.setItem('qe-onboarded-v1', '2026-09-29'); } catch { /* */ }
    (window as any).__raf = 0; const o = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { (window as any).__raf++; return o(cb); };
    (window as any).__shared = [];
    try { (navigator as any).share = (d: unknown) => { (window as any).__shared.push(d); return Promise.resolve(); }; (navigator as any).canShare = () => true; } catch { /* */ }
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: Error) => errors.push(String(e)));
  const cdp = size.touch ? await ctx.newCDPSession(page) : null;
  const shot = async (name: string) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${size.w}x${size.h}.png`) }); };

  await page.goto(`${BASE}/t?tab=chart`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-canvas canvas', { timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot('chart');

  /* idle render loop */
  const r0 = await page.evaluate(() => (window as any).__raf);
  await page.waitForTimeout(2000);
  const r1 = await page.evaluate(() => (window as any).__raf);
  rec('idle: no render loop', r1 - r0 < 30 ? 'works' : 'broken', `${r1 - r0} animation frames in 2 s idle`);

  /* toolbar overflow */
  const ov = await page.evaluate(() => {
    const top = document.querySelector('.tv-top') as HTMLElement;
    const btns = Array.from(top.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0);
    const r = top.getBoundingClientRect();
    return { clipped: btns.filter((b) => b.getBoundingClientRect().right > r.right + 1 || b.getBoundingClientRect().right > innerWidth).map((b) => b.getAttribute('aria-label') || b.textContent), n: btns.length, pageOverflow: document.documentElement.scrollWidth - innerWidth };
  });
  rec('toolbar: no clipped controls', ov.clipped.length || ov.pageOverflow > 1 ? 'broken' : 'works', `${ov.n} visible; clipped: ${ov.clipped.join(', ') || 'none'}; page overflow ${ov.pageOverflow}px`);

  const box = await page.evaluate(() => { const r = document.querySelector('.tv-canvas')!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const P = (fx: number, fy: number) => ({ x: Math.round(box.x + (box.w - 70) * fx), y: Math.round(box.y + (box.h - 30) * fy) });
  const tap = async (p: { x: number; y: number }) => { if (size.touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); };
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }, steps = 8, holdMs = 0) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
      if (holdMs) await page.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      if (holdMs) await page.waitForTimeout(holdMs);
      for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
      await page.mouse.up();
    }
    await page.waitForTimeout(150);
  };
  const drawings = async (): Promise<any[]> => page.evaluate((k: string) => JSON.parse(localStorage.getItem(k) || '[]'), KEY);
  const clickLabel = async (re: RegExp, within = '.tv-root') => {
    const loc = page.locator(`${within} button:visible`);
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const b = loc.nth(i);
      const l = (await b.getAttribute('aria-label')) || (await b.textContent()) || '';
      if (re.test(l)) { await b.click(); await page.waitForTimeout(150); return true; }
    }
    return false;
  };
  const pickTool = async (name: RegExp) => {
    if (await page.locator('.tv-left').isVisible()) return clickLabel(name, '.tv-left');
    if (!(await clickLabel(/^Drawing tools/, '.tv-top'))) return false;
    return clickLabel(name, '.tv-sheet');
  };

  /* drawing tools: place each one */
  const tools: [RegExp, string, { x: number; y: number }[] | 'drag'][] = [
    [/^Trend line/, 'trend', [P(0.2, 0.3), P(0.4, 0.5)]],
    [/^Ray/, 'ray', [P(0.2, 0.6), P(0.3, 0.55)]],
    [/^Horizontal line/, 'hline', [P(0.5, 0.35)]],
    [/^Horizontal ray/, 'hray', [P(0.55, 0.65)]],
    [/^Vertical line/, 'vline', [P(0.62, 0.5)]],
    [/^Parallel channel/, 'channel', [P(0.1, 0.7), P(0.3, 0.6), P(0.2, 0.8)]],
    [/^Fib/, 'fib', [P(0.65, 0.2), P(0.8, 0.45)]],
    [/^Rectangle/, 'rect', [P(0.7, 0.6), P(0.8, 0.75)]],
    [/^Brush/, 'brush', 'drag'],
    [/^Text/, 'text', [P(0.45, 0.15)]],
    [/^Arrow/, 'arrow', [P(0.35, 0.85)]],
    [/^Price range|^Measure/, 'measure', [P(0.82, 0.3), P(0.9, 0.2)]],
  ];
  for (const [re, id, pts] of tools) {
    const before = (await drawings()).length;
    if (!(await pickTool(re))) { rec(`draw: ${id}`, 'missing', 'no tool button'); continue; }
    if (pts === 'drag') await drag(P(0.3, 0.9), P(0.45, 0.8), 10);
    else for (const p of pts) await tap(p);
    await page.keyboard.press('Escape').catch(() => {});
    const after = await drawings();
    const placed = after.length === before + 1 && after[after.length - 1].tool === id;
    rec(`draw: ${id}`, placed ? 'works' : 'broken', placed ? '' : `stored ${after.length - before} new`);
  }
  await shot('drawings');

  /* select the trend line by tapping its middle, restyle, drag a handle, delete */
  const trendMid = P(0.3, 0.4);
  await page.keyboard.press('Escape').catch(() => {});
  await tap(trendMid);
  const floatOn = await page.locator('.tv-float').isVisible();
  const selName = floatOn ? await page.locator('.tv-float-name').textContent() : '';
  rec('select: tap/click a line opens its toolbar', floatOn && /Trend/.test(selName || '') ? 'works' : 'broken', `selected: ${selName || 'nothing'}`);
  if (floatOn) {
    await shot('selected');
    await clickLabel(/^Colou?r loss/, '.tv-float');
    const d = (await drawings()).find((x) => x.tool === 'trend');
    rec('style: colour', d?.color === 'loss' ? 'works' : 'broken', `colour now ${d?.color}`);
    await clickLabel(/^Width 4/, '.tv-float');
    const d2 = (await drawings()).find((x) => x.tool === 'trend');
    rec('style: width', d2?.width === 4 ? 'works' : 'broken', `width now ${d2?.width}`);
    const p0 = d2.pts[1];
    await drag(P(0.4, 0.5), P(0.45, 0.35), 8);
    const d3 = (await drawings()).find((x) => x.tool === 'trend');
    rec('edit: drag an end handle', d3 && (d3.pts[1].p !== p0.p || d3.pts[1].t !== p0.t) ? 'works' : 'broken');
    const n = (await drawings()).length;
    // the drag keeps the line selected (its toolbar stays open)
    rec('edit: selection kept after a drag', (await page.locator('.tv-float').isVisible()) ? 'works' : 'broken');
    await clickLabel(/^Delete drawing/, '.tv-float');
    rec('delete selected', (await drawings()).length === n - 1 ? 'works' : 'broken');
    await clickLabel(/^Undo/, '.tv-top');
    rec('undo', (await drawings()).length === n ? 'works' : 'broken');
    if (!(await clickLabel(/^Redo/, '.tv-top'))) { await clickLabel(/^Chart settings/, '.tv-top'); await page.locator('.tv-menu-right button:visible', { hasText: /^Redo$/ }).click(); await page.keyboard.press('Escape'); if (await page.locator('.tv-menu').first().isVisible().catch(() => false)) await page.locator('.tv-scrim').first().click({ force: true }); }
    rec('redo', (await drawings()).length === n - 1 ? 'works' : 'broken');
    await clickLabel(/^Undo/, '.tv-top');
  }

  /* tap tooltip on a layer (touch has no hover) */
  if (size.touch) {
    const pts = [0.3, 0.4, 0.5, 0.6, 0.7];
    let shown = false;
    for (const fx of pts) {
      for (let fy = 0.05; fy < 0.95 && !shown; fy += 0.012) {
        await page.touchscreen.tap(P(fx, fy).x, P(fx, fy).y);
        await page.waitForTimeout(40);
        shown = await page.evaluate(() => getComputedStyle(document.querySelector('.tv-tip')!).display !== 'none');
        if (shown) break;
      }
      if (shown) break;
    }
    rec('touch: tap a layer shows its tooltip', shown ? 'works' : 'broken');
    await page.touchscreen.tap(P(0.95, 0.99).x, P(0.95, 0.99).y);
  }

  /* interval switch keeps drawings; reload keeps them */
  const nBefore = (await drawings()).length;
  const chips = page.locator('.tv-tfchips button:visible');
  if (await chips.count()) {
    await chips.filter({ hasText: /^15m$/i }).first().click();
    rec('interval: 1-tap chips', 'works');
  } else {
    rec('interval: 1-tap chips', 'missing', 'dropdown only');
    await clickLabel(/^Timeframe/, '.tv-top');
    await page.locator('.tv-menu [role=menuitemradio]').filter({ hasText: '15 minutes' }).click();
  }
  await page.waitForTimeout(1500);
  const tfLabel = await page.locator('.tv-leg-tf').textContent();
  rec('interval switch', /15/.test(tfLabel || '') ? 'works' : 'broken', `legend reads ${tfLabel}`);
  rec('drawings survive interval change', (await drawings()).length === nBefore ? 'works' : 'broken');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-canvas canvas');
  await page.waitForTimeout(2000);
  const label2 = await page.locator('.tv-canvas').getAttribute('aria-label');
  rec('drawings persist per symbol across reload', (await drawings()).length === nBefore && /drawing/.test(label2 || '') ? 'works' : 'broken', label2 || '');
  await shot('reloaded');
  /* a drawing anchored between bars (the harness's bar times move with the
     clock, so after a reload every anchor is) must still paint at its time —
     lightweight-charts maps whole indices only; the rectangle's area differs
     with drawings shown vs hidden */
  const rectClip = async () => {
    const a = P(0.7, 0.6); const b = P(0.8, 0.75);
    return (await page.screenshot({ clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } })).toString('base64');
  };
  const toggleHideAll = async () => {
    if (await page.locator('.tv-left').isVisible()) await page.locator('.tv-left button[aria-label="Hide all drawings"]').click();
    else { await clickLabel(/^Drawing tools/, '.tv-top'); await page.locator('.tv-sheet button[aria-label="Hide all drawings"]').click(); await page.locator('.tv-sheet button[aria-label="Close"]').click().catch(() => {}); }
    await page.waitForTimeout(250);
  };
  const shown = await rectClip(); await toggleHideAll(); const hidden = await rectClip(); await toggleHideAll();
  rec('drawings paint at their time between bars (after reload / other interval)', shown !== hidden ? 'works' : 'broken');

  /* menus + toggles */
  const menuOpens = async (re: RegExp, sel: string) => { await clickLabel(re, '.tv-top'); const ok = await page.locator(sel).first().isVisible().catch(() => false); await page.keyboard.press('Escape'); await page.waitForTimeout(100); if (await page.locator(sel).first().isVisible().catch(() => false)) await page.locator('.tv-scrim').first().click({ force: true }).catch(() => {}); return ok; };
  rec('indicators menu', (await menuOpens(/^Indicators/, '.tv-menu-ind')) ? 'works' : 'broken');
  const hasSettings = await page.locator('.tv-top button[aria-label^="Chart settings"]:visible').count();
  rec('settings menu reachable', hasSettings && (await menuOpens(/^Chart settings/, '.tv-menu-right')) ? 'works' : 'missing', hasSettings ? '' : 'no settings button at this size');
  await clickLabel(/^Indicators/, '.tv-top');
  const indNames = await page.evaluate(() => Array.from(document.querySelectorAll('.tv-menu-ind .tv-mlabel > span')).map((s) => (s.textContent || '').trim()));
  rec('indicator: VWAP', indNames.some((n) => /VWAP/.test(n)) ? 'works' : 'missing');
  rec('indicator: EMA', indNames.some((n) => /EMA/.test(n)) ? 'works' : 'missing');
  rec('indicator: volume toggle', indNames.some((n) => /^Volume/.test(n)) ? 'works' : 'missing');
  rec('compare / add symbol', (await page.locator('.tv-menu-ind input[aria-label^="Compare"]').count()) ? 'works' : 'missing');
  rec('save / load layout', (await page.locator('.tv-root [aria-label*="layout" i]').count()) ? 'works' : 'missing');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  if (await page.locator('.tv-menu').first().isVisible().catch(() => false)) await page.locator('.tv-scrim').first().click({ force: true }).catch(() => {});

  /* replay */
  const replayBtn = page.locator('.tv-top button[aria-label="Bar replay"]:visible');
  if (await replayBtn.count()) await replayBtn.click();
  else { await clickLabel(/^Chart settings/, '.tv-top'); await page.locator('.tv-menu-right button', { hasText: /^Replay$/ }).click(); }
  await page.waitForTimeout(300);
  const replayOn = await page.locator('.tv-replay').isVisible();
  rec('replay', replayOn ? 'works' : 'broken');
  if (replayOn) await page.locator('.tv-replay button[aria-label="Exit replay"]').click();

  /* snapshot: download (desktop) or share sheet */
  let downloaded = false;
  page.once('download', () => { downloaded = true; });
  const snapVisible = await page.locator('.tv-top button[aria-label^="Take a snapshot"]:visible, .tv-top button[aria-label^="Snapshot"]:visible').count();
  if (snapVisible) await page.locator('.tv-top button[aria-label^="Take a snapshot"]:visible, .tv-top button[aria-label^="Snapshot"]:visible').first().click();
  else { await clickLabel(/^Chart settings/, '.tv-top'); await page.locator('.tv-menu-right button', { hasText: /^Snapshot/ }).click().catch(() => {}); }
  await page.waitForTimeout(1200);
  const shared = await page.evaluate(() => (window as any).__shared.length);
  rec('snapshot', downloaded || shared ? 'works' : 'broken', downloaded ? 'download' : shared ? 'share sheet (files)' : 'nothing saved');
  await page.keyboard.press('Escape').catch(() => {});

  /* fullscreen (headless may refuse the API: the fallback class counts) */
  const fsBtn = page.locator('.tv-root button[aria-label="Fullscreen"]:visible');
  if (!(await fsBtn.count())) await clickLabel(/^Chart settings/, '.tv-top');
  const fsAny = (await fsBtn.count()) ? fsBtn : page.locator('.tv-menu-right button:visible', { hasText: /^Full screen$/ });
  if (await fsAny.count()) {
    await fsAny.first().click();
    await page.waitForTimeout(400);
    const full = await page.evaluate(() => !!document.fullscreenElement || !!document.querySelector('.tv-root.tv-full'));
    rec('fullscreen', full ? 'works' : 'broken');
    await page.keyboard.press('Escape');
    const exit = page.locator('.tv-root button[aria-label="Exit fullscreen"]:visible');
    if (await exit.count()) await exit.first().click();
  } else rec('fullscreen', 'missing', 'no button at this size');

  /* magnet / lock / hide toggles */
  for (const [re, name] of [[/^Magnet/, 'magnet'], [/^Lock all/, 'lock all'], [/^Hide all/, 'hide all']] as [RegExp, string][]) {
    const inLeft = await page.locator('.tv-left').isVisible();
    if (!inLeft) await clickLabel(/^Drawing tools/, '.tv-top');
    const scope = inLeft ? '.tv-left' : '.tv-sheet';
    const b = page.locator(`${scope} button`);
    let pressed: string | null = null; let after: string | null = null;
    for (let i = 0; i < await b.count(); i++) {
      const l = (await b.nth(i).getAttribute('aria-label')) || '';
      if (re.test(l)) { pressed = await b.nth(i).getAttribute('aria-pressed'); await b.nth(i).click(); await page.waitForTimeout(100); after = await page.locator(`${scope} button[aria-label="${l}"]`).first().getAttribute('aria-pressed').catch(() => null); if (!inLeft && after == null) { await clickLabel(/^Drawing tools/, '.tv-top'); after = await page.locator(`.tv-sheet button[aria-label="${l}"]`).first().getAttribute('aria-pressed').catch(() => null); } await page.locator(`${scope} button[aria-label="${l}"]`).first().click().catch(() => {}); break; }
    }
    rec(`toggle: ${name}`, pressed != null && after != null && pressed !== after ? 'works' : 'broken');
    if (!inLeft) await page.locator('.tv-sheet button[aria-label="Close"]').click().catch(() => {});
  }

  /* pinch-zoom / pan on touch; wheel on desktop */
  const paneShot = async () => (await page.locator('.tv-canvas').screenshot()).toString('base64');
  const s0 = await paneShot();
  if (cdp) {
    const c = P(0.5, 0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 30, y: c.y, id: 1 }, { x: c.x + 30, y: c.y, id: 2 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 30 - i * 10, y: c.y, id: 1 }, { x: c.x + 30 + i * 10, y: c.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(P(0.5, 0.5).x, P(0.5, 0.5).y); await page.mouse.wheel(0, -400);
  }
  await page.waitForTimeout(400);
  rec(size.touch ? 'touch: pinch zoom' : 'mouse: wheel zoom', (await paneShot()) !== s0 ? 'works' : 'broken');
  const s1 = await paneShot();
  await drag(P(0.3, 0.5), P(0.7, 0.5), 8);
  await page.waitForTimeout(300);
  rec(size.touch ? 'touch: one-finger pan' : 'mouse: drag pan', (await paneShot()) !== s1 ? 'works' : 'broken');

  /* keyboard (desktop) */
  if (!size.touch) {
    const n = (await drawings()).length;
    await page.mouse.move(P(0.5, 0.45).x, P(0.5, 0.45).y);
    await page.keyboard.press('Alt+KeyH');
    await page.waitForTimeout(150);
    rec('keyboard: Alt+H line at cursor', (await drawings()).length === n + 1 ? 'works' : 'broken');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(150);
    rec('keyboard: Del deletes selected', (await drawings()).length === n ? 'works' : 'broken');
  }

  /* light mode renders */
  await page.evaluate(() => localStorage.setItem('qe-mode', 'light'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tv-canvas canvas');
  await page.waitForTimeout(2000);
  const light = await page.evaluate(() => {
    const root = document.querySelector('.tv-root') as HTMLElement;
    const bg = getComputedStyle(root).backgroundColor;
    const m = bg.match(/\d+/g)!.map(Number);
    return { bg, lum: (m[0] + m[1] + m[2]) / 3, mode: document.documentElement.getAttribute('data-mode') };
  });
  rec('light mode: chart surface is light', light.lum > 180 ? 'works' : 'broken', `${light.mode} · ${light.bg}`);
  await shot('light');

  rec('no page errors', errors.length ? 'broken' : 'works', errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function main() {
  const pw = loadPlaywright();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await pw.chromium.launch({ headless: true });
  const rows: Row[] = [];
  try { for (const s of sizes) await auditSize(browser, s, rows); } finally { await browser.close(); }
  fs.writeFileSync(path.join(ROOT, 'research', 'chart-audit.json'), JSON.stringify({ ranAt: new Date().toISOString(), data: 'TEST HARNESS fixtures — not market data', rows }, null, 2));
  const checks = [...new Set(rows.map((r) => r.check))];
  const labels = [...new Set(rows.map((r) => r.size))];
  console.log(`\n| Check | ${labels.join(' | ')} |\n|---|${labels.map(() => '---').join('|')}|`);
  for (const c of checks) console.log(`| ${c} | ${labels.map((l) => rows.find((r) => r.check === c && r.size === l)?.status ?? '—').join(' | ')} |`);
  const bad = rows.filter((r) => r.status === 'broken' || r.status === 'missing').length;
  console.log(`\n${rows.length - bad}/${rows.length} checks work.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
