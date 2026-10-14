/**
 * CHARTING-PRO SHOTS — drives the pro chart on the DEV harness (synthetic
 * fixtures, no server, no database) at 1440 and 390, draws with the real
 * tools, and saves screenshots + the chart's own exported snapshot PNGs here.
 *
 *   npx vite --port 5179 --strictPort &            # client only; harness fixtures
 *   SHOOT_BASE=http://localhost:5179 npx tsx research/charting-pro/shoot.ts
 *
 * PLAYWRIGHT_CORE: path to playwright-core (default: newest in ~/.npm/_npx).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.SHOOT_BASE || 'http://localhost:5179';
const KEY = 'qe-drawings-v1:audit-user:SPY';

function loadPw() {
  const tries: string[] = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) {
    for (const d of fs.readdirSync(npx)) {
      const p = path.join(npx, d, 'node_modules', 'playwright-core');
      if (fs.existsSync(p)) tries.push(p);
    }
  }
  const req = createRequire(import.meta.url);
  for (const p of tries) { try { return req(p); } catch { /* next */ } }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE');
}

// tsx's __name helper + the onboarding sheet marked done (as research/chart-audit.ts does)
async function prep(ctx: { addInitScript: (s: unknown) => Promise<void> }) {
  await ctx.addInitScript({ content: 'window.__name = window.__name || ((f) => f); try { localStorage.setItem("qe-onboarded-v1", "2026-09-29"); localStorage.setItem("qe-mode", "dark"); } catch (e) {}' });
}

/** The one-time profile sheet (onboarding-host.tsx) opens ~0.9 s after load: wait for it, then "Not now". */
async function dismiss(page: any) {
  await sleep(1500);
  const x = page.locator('.ob-x').first();
  if (await x.count()) { await x.click().catch(() => {}); await sleep(400); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pw = loadPw();
  const browser = await pw.chromium.launch({ headless: true });
  const log: string[] = [];

  /* ── desktop 1440 ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
    await prep(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => log.push(`pageerror: ${e.message}`));
    await page.goto(`${BASE}/t?tab=chart&harness=1`);
    await page.waitForSelector('.tv-canvas canvas', { timeout: 60_000 });
    await sleep(2500);
    await page.evaluate((k: string) => localStorage.removeItem(k), KEY);
    await page.reload();
    await page.waitForSelector('.tv-canvas canvas', { timeout: 60_000 });
    await sleep(3000);
    await dismiss(page);
    const box = (await page.locator('.tv-canvas').boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
    const tool = async (label: string) => { await page.locator(`.tv-left .tv-tool[aria-label^="${label}"]`).click(); await sleep(120); };
    const click = async (x: number, y: number) => { const p = at(x, y); await page.mouse.click(p.x, p.y); await sleep(120); };

    await tool('Trend line'); await click(120, 560); await click(560, 300);
    await tool('Extended line'); await click(300, 200); await click(500, 260);
    await tool('Fib retracement'); await click(620, 520); await click(820, 240);
    await tool('Long position'); await click(700, 430);
    await tool('Horizontal line'); await click(420, 150);
    await tool('Rectangle'); await click(150, 330); await click(330, 430);
    await tool('Price label'); await click(980, 380);
    await tool('Parallel channel'); await click(40, 640); await click(260, 470); await click(260, 540);
    // select the horizontal line and arm an alert (harness answers writes with {ok:true})
    await click(200, 150);
    await page.locator('.tv-float button[aria-label^="Alert when price crosses"]').click().catch(() => log.push('no alert button'));
    await sleep(300);
    await page.keyboard.press('Escape');
    // style the trend line: select, loss colour, dashed
    await click(340, 430);
    await page.locator('.tv-float button[aria-label="Colour loss"]').click().catch(() => {});
    await page.locator('.tv-float button[aria-label="dashed line"]').click().catch(() => {});
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-drawings-selected.png') });

    // Drawings list
    await page.keyboard.press('Escape');
    await page.locator('.tv-top button[aria-label="Drawings list"]').click();
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-drawings-list.png') });
    await page.locator('.tv-dlist button[aria-label="Close drawings list"]').click();

    // keyboard help
    await page.mouse.move(at(500, 300).x, at(500, 300).y);
    await page.keyboard.press('Shift+Slash');
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-shortcuts.png') });
    await page.keyboard.press('Escape');
    await sleep(200);

    // interval menu (presets + custom)
    await page.locator('.tv-top .tv-tf').click();
    await sleep(200);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-intervals.png'), clip: { x: box.x - 60, y: 40, width: 520, height: 640 } });
    await page.locator('.tv-menu-tf input[aria-label="Custom interval"]').fill('3m');
    await page.locator('.tv-menu-tf button[type=submit]').click();
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-3m-drawings-follow.png') });
    await page.locator('.tv-top .tv-tf').click();
    await page.locator('.tv-menu-tf .tv-mitem', { hasText: '5M' }).first().click();
    await sleep(1500);

    // indicators search
    await page.locator('.tv-top button[aria-label="Indicators and layers"]').click();
    await page.locator('.tv-isearch input').fill('vwap');
    await sleep(200);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-indicator-search.png'), clip: { x: box.x - 60, y: 40, width: 560, height: 360 } });
    await page.keyboard.press('Escape');

    // snapshot: the chart's own PNG (drawings + legend + branded footer)
    await page.locator('.tv-top button[aria-label="Snapshot"]').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.tv-menu-snap .tv-mitem', { hasText: 'Save image' }).click()]);
    await dl.saveAs(path.join(OUT, 'snapshot-1440-export.png'));
    log.push(`desktop snapshot: ${dl.suggestedFilename()}`);
    const saved = await page.evaluate((k: string) => localStorage.getItem(k), KEY);
    fs.writeFileSync(path.join(OUT, '.drawings-seed.json'), saved ?? '');
    await ctx.close();
  }

  /* ── phone 390 ── */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, acceptDownloads: true });
    await prep(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => log.push(`phone pageerror: ${e.message}`));
    const seed = fs.readFileSync(path.join(OUT, '.drawings-seed.json'), 'utf8');
    await page.addInitScript(([k, v]: [string, string]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } } catch { /* */ } }, [KEY, seed]);
    await page.goto(`${BASE}/t?tab=chart&harness=1`);
    await page.waitForSelector('.tv-canvas canvas', { timeout: 60_000 });
    await sleep(3500);
    await dismiss(page);
    await page.screenshot({ path: path.join(OUT, 'phone-390-drawings.png') });
    // tap the position box → mini toolbar (two rows) at the bottom
    const box = (await page.locator('.tv-canvas').boundingBox())!;
    const lst = JSON.parse(seed).drawings as { tool: string }[];
    log.push(`phone drawings: ${lst.map((d) => d.tool).join(',')}`);
    await page.touchscreen.tap(box.x + box.width * 0.45, box.y + 40);
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'phone-390-selected.png') });
    // drawing sheet
    await page.locator('.tv-top button[aria-label="Drawing tools"]').click();
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'phone-390-draw-sheet.png') });
    await page.locator('.tv-sheet button[aria-label="Close"]').click();
    // More → Save image (phone snapshot)
    await page.locator('.tv-top button[aria-label^="Chart settings"]').click();
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'phone-390-more.png') });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.locator('.tv-menu button', { hasText: 'Save image' }).click()]);
    await dl.saveAs(path.join(OUT, 'snapshot-390-export.png'));
    log.push(`phone snapshot: ${dl.suggestedFilename()}`);
    await ctx.close();
  }
  await browser.close();
  fs.rmSync(path.join(OUT, '.drawings-seed.json'), { force: true });
  console.log(log.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
