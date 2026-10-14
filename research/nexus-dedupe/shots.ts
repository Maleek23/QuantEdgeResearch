/**
 * NEXUS dedupe-detail screenshots on the DEV harness (/dev/nexus-workspace).
 *   npx vite --port 5173 (client only — fixtures, no server, no DB)
 *   ND_TAG=before|after ND_BASE=http://localhost:5173 npx tsx research/nexus-dedupe/shots.ts
 * Writes research/nexus-dedupe/{tag}-{1440|390}.png and prints DOM checks.
 * playwright-core is loaded from the machine's npx cache (never installed here).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.ND_BASE ?? 'http://localhost:5173';
const TAG = process.env.ND_TAG ?? 'after';

function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries = ['playwright-core'];
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules', 'playwright-core');
    if (fs.existsSync(path.join(p, 'package.json'))) tries.push(p);
  }
  for (const t of tries) { try { return req(t); } catch { /* next */ } }
  throw new Error('playwright-core not found');
}

(async () => {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch(process.env.ND_CHROME ? { executablePath: process.env.ND_CHROME } : {});
  for (const [w, h] of [[1440, 1100], [390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/nexus-workspace`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const row = page.locator('.nxd-board .nxp-acc').filter({ hasText: 'PLTR' }).first();
    await row.locator('> *').first().click();
    await page.waitForTimeout(3000);
    const checks = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        inlineDetails: document.querySelectorAll('[data-testid="nexus-inline-detail"]').length,
        detailTool: !!document.querySelector('[data-tool="nexus-detail"]'),
        pnlBlocks: document.querySelectorAll('[data-testid="nexus-pnl-block"]').length,
        ohlcTable: /most recent 20 bars/.test(t),
        caciOnBoard: /CACI/.test((document.querySelector('.nxd-board') as HTMLElement | null)?.innerText ?? ''),
        sharesText: /shares idea/i.test(t),
        lastTrade: (t.match(/last trade[^\n]*/gi) ?? []).slice(0, 3),
        strip: ((document.querySelector('[data-testid="nexus-day-strip"]') as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' '),
        resolved: ((document.querySelector('section.nxr') as HTMLElement | null)?.innerText ?? '').split('\n').filter((l) => /^[A-Z]{2,5}\b/.test(l)).join(' / '),
        levelsMore: (t.match(/Show all \d+ levels/) ?? [])[0] ?? null,
      };
    });
    console.log(TAG, w, JSON.stringify(checks));
    await page.screenshot({ path: path.join(OUT, `${TAG}-${w}.png`), fullPage: w === 390 });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
