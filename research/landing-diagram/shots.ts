/**
 * Landing systems-diagram + charts screenshots, client-only (no server, no DB).
 *
 *   npx vite --port 5181 --strictPort
 *   LD_BASE=http://localhost:5181 npx tsx research/landing-diagram/shots.ts
 *
 * Writes research/landing-diagram/{how,numbers}-{1440,390}-{dark,light}.png and
 * prints horizontal-overflow checks. playwright-core from the npx cache only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.LD_BASE ?? 'http://localhost:5181';

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
  for (const mode of ['dark', 'light'] as const) {
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: mode, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForSelector('#sec-how', { timeout: 120_000 });
      // Force the landing theme to match (the app stores its own theme choice).
      await page.evaluate((m: string) => {
        const root = document.querySelector('.lv2');
        if (root) root.classList.toggle('light', m === 'light');
      }, mode);
      await page.addStyleTag({ content: '.lv2-nav,.lv2-announce{visibility:hidden}' });
      await page.waitForTimeout(1500);
      for (const id of ['sec-how', 'sec-numbers']) {
        const el = await page.$(`#${id}`);
        await el.scrollIntoViewIfNeeded();
        if (id === 'sec-how') await page.hover('.sys-nodes button >> nth=7').catch(() => {});
        if (id === 'sec-numbers') {
          const svg = await page.$('.lv2-chart-svg.play');
          const b = await svg.boundingBox();
          await page.mouse.move(b.x + b.width * 0.42, b.y + b.height / 2);
        }
        await page.waitForTimeout(300);
        const file = path.join(OUT, `${id.replace('sec-', '')}-${w}-${mode}.png`);
        await el.screenshot({ path: file });
        console.log('wrote', path.basename(file));
      }
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${w} ${mode} horizontal overflow: ${over}px`);
      await ctx.close();
    }
  }
  await browser.close();
})();
