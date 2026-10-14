/**
 * NEXUS P&L screenshots on the DEV harness (/dev/nexus-workspace — fixture book, no server, no DB).
 *
 *   npx vite --port 5179 --strictPort                        (client only)
 *   PNL_BASE=http://localhost:5179 npx tsx research/nexus-pnl/shots.ts
 *
 * Writes research/nexus-pnl/{board,detail,history}-{1440,390}.png and prints
 * timings (first P&L chip, marks round trip, progressive fill of the "slow" TSLA mark).
 * playwright-core is loaded from the machine's npx cache (never installed into this repo).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.PNL_BASE ?? 'http://localhost:5179';

function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries: string[] = ['playwright-core'];
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules', 'playwright-core');
    if (fs.existsSync(path.join(p, 'package.json'))) tries.push(p);
  }
  for (const t of tries) { try { return req(t); } catch { /* next */ } }
  throw new Error('playwright-core not found');
}

const pw = loadPlaywright();
(async () => {
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: w < 768, hasTouch: w < 768 });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`${BASE}/dev/nexus-workspace?tab=oracle`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForSelector('[data-testid="nexus-day-strip"]', { timeout: 60_000 });
    const tStrip = Date.now() - t0;
    await page.waitForSelector('[data-testid="nexus-pnl-chip"][data-pnl-status="open"]', { timeout: 30_000 });
    const tChip = Date.now() - t0;
    const loading0 = await page.evaluate(() => document.querySelector('.nxpl-loading')?.textContent ?? null);
    // progressive fill: TSLA is pending on the first marks call, filled on the re-ask (2.5 s)
    await page.waitForFunction(() => !document.querySelector('.nxpl-loading'), null, { timeout: 15_000 }).catch(() => null);
    const tFilled = Date.now() - t0;
    await page.waitForTimeout(800);
    const strip = await page.evaluate(() => document.querySelector('[data-testid="nexus-day-strip"]')?.textContent ?? null);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="nexus-pnl-chip"]')).map((e) => `${e.getAttribute('data-pnl-status')}:${(e.textContent ?? '').trim()}`));
    await page.screenshot({ path: path.join(OUT, `board-${w}.png`), fullPage: false });
    // open the NVDA row inline → P&L block
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button.nxp-row')).find((x) => /NVDA/.test(x.textContent ?? '')) as HTMLElement | undefined;
      b?.click();
    });
    await page.waitForSelector('[data-testid="nexus-inline-detail"] [data-testid="nexus-pnl-block"]', { timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(1500);
    await page.evaluate(() => document.querySelector('[data-testid="nexus-inline-detail"] [data-testid="nexus-pnl-block"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    const block = await page.evaluate(() => document.querySelector('[data-testid="nexus-inline-detail"] [data-testid="nexus-pnl-block"]')?.textContent ?? null);
    await page.screenshot({ path: path.join(OUT, `detail-${w}.png`), fullPage: false });
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    // HISTORY tab
    await page.goto(`${BASE}/dev/nexus-workspace?tab=oracle&nx=history`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ix-hist [data-testid="nexus-day-strip"]', { timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(1200);
    const hist = await page.evaluate(() => document.querySelector('.ix-hist [data-testid="nexus-day-strip"]')?.textContent ?? null);
    await page.screenshot({ path: path.join(OUT, `history-${w}.png`), fullPage: false });
    console.log(JSON.stringify({ w, ms: { dayStrip: tStrip, firstOpenChip: tChip, allMarksFilled: tFilled }, loadingAtFirstPaint: loading0, strip, chips: chips.slice(0, 12), block: block?.slice(0, 400), history: hist, overflowX }, null, 1));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
