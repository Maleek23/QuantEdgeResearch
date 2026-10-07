/**
 * 0DTE desk screenshots + phone checks on the DEV harness (/dev/zerodte).
 *
 *   npx vite --port 5191 --strictPort --host 127.0.0.1   (client only — fixtures, no server, no DB)
 *   ZD_BASE=http://127.0.0.1:5191 npx tsx research/zerodte-shots.ts
 *
 * Writes docs/screens/zerodte/{fx}-{width}-{mode}.jpg for fx ∈ preopen|live|midday|closed,
 * width ∈ 1440|1366|390, mode ∈ dark|light, and prints per-shot checks:
 * horizontal overflow, interactive targets < 44px (phone) and text < 12px (phone).
 * playwright-core is loaded from the machine's npx cache (never installed into this repo).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs', 'screens', 'zerodte');
const BASE = process.env.ZD_BASE ?? 'http://127.0.0.1:5191';

function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries: string[] = [];
  if (process.env.PLAYWRIGHT_CORE) tries.push(process.env.PLAYWRIGHT_CORE);
  tries.push('playwright-core');
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) {
    const p = path.join(npx, d, 'node_modules', 'playwright-core');
    if (fs.existsSync(path.join(p, 'package.json'))) tries.push(p);
  }
  for (const t of tries) { try { return req(t); } catch { /* next */ } }
  throw new Error(`playwright-core not found (tried ${tries.join(', ')})`);
}

const FX = (process.env.ZD_FX ?? 'preopen,live,midday,closed').split(',');
const WIDTHS = (process.env.ZD_WIDTHS ?? '1440,1366,390').split(',').map(Number);
const MODES = (process.env.ZD_MODES ?? 'dark,light').split(',');

const pw = loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch({ headless: true });
let problems = 0;
for (const fx of FX) for (const w of WIDTHS) for (const mode of MODES) {
  const phone = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, deviceScaleFactor: phone ? 2 : 1, colorScheme: mode === 'light' ? 'light' : 'dark', isMobile: phone, hasTouch: phone });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/zerodte?fx=${fx}&mode=${mode}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.zd-banner', { timeout: 20_000 });
  await page.waitForTimeout(700);
  // Unclip the full-bleed shell so the whole desk lands in one full-page shot.
  await page.addStyleTag({ content: '.page-atmosphere,[data-testid=zerodte-harness]{height:auto!important;overflow:visible!important} html,body,#root{height:auto!important;overflow:visible!important}' });
  await page.waitForTimeout(200);
  const checks = await page.evaluate((isPhone: boolean) => {
    const root = document.querySelector('[data-testid=zerodte-harness]') as HTMLElement;
    const overflow = Math.max(document.documentElement.scrollWidth, root.scrollWidth) - window.innerWidth;
    const wide: string[] = [];
    root.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > window.innerWidth + 1 && !el.closest('.zd-table-wrap')) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
    });
    const small: string[] = []; const tiny: string[] = [];
    if (isPhone) {
      root.querySelectorAll<HTMLElement>('button, summary, [role=button]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height < 44) small.push(`${(el.textContent ?? '').trim().slice(0, 24)} (${Math.round(r.height)}px)`);
      });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const el = n.parentElement; if (!el || !(n.textContent ?? '').trim()) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12 && el.getBoundingClientRect().width > 0) tiny.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${fs}px "${(n.textContent ?? '').trim().slice(0, 18)}"`);
      }
    }
    return { overflow, wide: [...new Set(wide)].slice(0, 6), small: [...new Set(small)].slice(0, 8), tiny: [...new Set(tiny)].slice(0, 8) };
  }, phone);
  const file = path.join(OUT, `${fx}-${w}-${mode}.jpg`);
  await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 72 });
  const bad = checks.overflow > 0 || checks.wide.length || checks.small.length || checks.tiny.length;
  if (bad) problems++;
  console.log(`${bad ? '✗' : '✓'} ${fx}-${w}-${mode}  overflow ${checks.overflow}px${checks.wide.length ? ` · wide: ${checks.wide.join(', ')}` : ''}${checks.small.length ? ` · <44px: ${checks.small.join(', ')}` : ''}${checks.tiny.length ? ` · <12px: ${checks.tiny.join(', ')}` : ''}`);
  await ctx.close();
}
await browser.close();
console.log(`\n${problems ? `${problems} shot(s) with problems` : 'all shots clean'} → ${path.relative(ROOT, OUT)}`);
