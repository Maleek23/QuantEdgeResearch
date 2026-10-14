/**
 * GEX Trinity screenshots on the DEV harness (/dev/gex-phone — fixture books, no server, no DB).
 *
 *   npx vite --port 5174 --strictPort                       (client only)
 *   TRI_BASE=http://localhost:5174 npx tsx research/gex-trinity/shots.ts
 *
 * Writes research/gex-trinity/trinity-{1440,390}.png and prints horizontal-overflow checks.
 * playwright-core is loaded from the machine's npx cache (never installed into this repo).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.TRI_BASE ?? 'http://localhost:5174';

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
  // CHROME_PATH: any local Chromium build when the npx playwright-core expects a different revision.
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]] as const) {
    // Pick the dashboard at desktop width (the phone stack has no dashboard menu; the active one persists), then size down.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/gex-phone?tab=gex`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForTimeout(2500);
    // pick the shipped "Trinity" dashboard from the dashboard menu
    await page.evaluate(async () => {
      const b = [...document.querySelectorAll('button')].find((x) => /^(GEX|Trinity)$/.test((x.textContent ?? '').trim()));
      b?.click();
      await new Promise((r) => setTimeout(r, 400));
      const t = [...document.querySelectorAll('.fd-dash-name')].find((e) => /Trinity/.test(e.textContent ?? '')) as HTMLElement | undefined;
      t?.click();
    });
    await page.waitForSelector('[data-testid="trinity-agreement"]', { timeout: 30_000 }).catch(() => null);
    if (mobile) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(1500);
      await page.evaluate(() => document.querySelector('[data-testid="trinity-agreement"]')?.scrollIntoView({ block: 'start' }));
    }
    await page.waitForTimeout(1500);
    const file = path.join(OUT, `trinity-${w}.png`);
    await page.screenshot({ path: file, fullPage: false });
    const check = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      sentence: document.querySelector('.trin-sentence')?.textContent ?? null,
      cards: document.querySelectorAll('.trin-card').length,
    }));
    console.log(w, JSON.stringify(check), '→', path.relative(process.cwd(), file));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
