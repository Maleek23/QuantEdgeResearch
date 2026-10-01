/**
 * DEVICE SHOTS — screenshot every page of the DEV device harness at phone,
 * tablet and small-laptop sizes in Dark and Light, and list the layout defects
 * a screenshot hides (horizontal overflow and who causes it, small tap targets,
 * text below the type floor). Client only: no server, no database.
 *
 *   npx vite --config vite.config.ts --port 5179 --host 127.0.0.1   # terminal 1
 *   npx tsx research/device-shots.ts before                         # → docs/screens/devices/before/
 *
 * Env: SHOTS_BASE (default http://127.0.0.1:5179) · SHOTS_PAGES (comma list of
 * slugs) · SHOTS_SIZES ("375,768") · SHOTS_MODES ("dark,light") · PLAYWRIGHT_CORE.
 * Writes <label>/<slug>-<w>-<mode>.jpg and <label>/report.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LABEL = process.argv[2] || 'shots';
const OUT = path.join(ROOT, 'docs', 'screens', 'devices', LABEL);
const BASE = process.env.SHOTS_BASE || 'http://127.0.0.1:5179';

export const PAGES: Array<{ slug: string; path: string; admin?: boolean; out?: boolean }> = [
  { slug: 'today', path: '/today' },
  { slug: 'nexus', path: '/t' },
  { slug: 'nexus-detail', path: '/t?idea=fixture-NVDA&sym=NVDA' },
  { slug: 'nexus-0dte', path: '/t?nx=0dte' },
  { slug: 'flow', path: '/t?tab=flow' },
  { slug: 'ticker', path: '/r/NVDA' },
  { slug: 'sectors', path: '/t?tab=sectors' },
  { slug: 'crypto', path: '/t?tab=crypto' },
  { slug: 'journal', path: '/t?tab=journal' },
  { slug: 'journal-daily', path: '/t?tab=journal&jtab=daily' },
  { slug: 'settings', path: '/settings' },
  { slug: 'admin', path: '/admin', admin: true },
  { slug: 'landing', path: '/', out: true },
  { slug: 'pricing', path: '/?section=pricing', out: true },
  { slug: 'signup', path: '/signup', out: true },
  { slug: 'login', path: '/login', out: true },
  { slug: 'how-to', path: '/how-to' },
];
const SIZES = [
  { w: 375, h: 812, phone: true },
  { w: 390, h: 844, phone: true },
  { w: 768, h: 1024, phone: false, touch: true },
  { w: 1366, h: 768, phone: false },
];

function loadPlaywright(): any {
  const req = createRequire(import.meta.url);
  const tries = [process.env.PLAYWRIGHT_CORE, 'playwright-core'].filter(Boolean) as string[];
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) tries.push(path.join(npx, d, 'node_modules', 'playwright-core'));
  const ver = (t: string) => { try { return req(path.join(t, 'package.json')).version as string; } catch { return '0'; } };
  tries.sort((a, b) => ver(b).localeCompare(ver(a), undefined, { numeric: true })); // newest = the one with a downloaded browser
  for (const t of tries) { try { return req(t); } catch { /* next */ } }
  throw new Error('playwright-core not found — set PLAYWRIGHT_CORE');
}

/** Runs in the page: overflow culprits, small targets, tiny text. */
function probe(phone: boolean) {
  const vw = window.innerWidth;
  const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const name = (el: Element) => {
    const c = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `${el.tagName.toLowerCase()}${c ? '.' + c : ''}${t ? ` "${t}"` : ''}`;
  };
  const scrollsX = (el: Element | null): boolean => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e); if ((s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') && e.clientWidth < vw + 1) return true;
    }
    return false;
  };
  const all = Array.from(document.querySelectorAll('body *')).filter((e) => !e.closest('[data-harness]'));
  const overflow: string[] = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && r.width > 0 && vis(el) && !scrollsX(el.parentElement)) {
      if (!Array.from(el.children).some((c) => c.getBoundingClientRect().right > vw + 1)) overflow.push(`${name(el)} right=${Math.round(r.right)}`);
    }
  }
  const small: string[] = [];
  const coarse = matchMedia('(pointer: coarse)').matches;
  const minT = phone || coarse ? 44 : 24; // DESIGN_SYSTEM §10: 44 on touch, 24 desktop (WCAG 2.5.8)
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"], input:not([type=hidden]), select, textarea, [role="switch"], [role="checkbox"]')) {
    if (!vis(el) || el.closest('[data-harness]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue; // sr-only
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p');
    // an absolutely positioned ::after is the hit area for compact chips and switches (index.css)
    const af = getComputedStyle(el, '::after');
    const hit = af.content !== 'none' && af.position === 'absolute' ? { w: Math.max(r.width, parseFloat(af.width) || 0), h: Math.max(r.height, parseFloat(af.height) || 0) } : { w: r.width, h: r.height };
    if (!inline && (hit.h < minT || hit.w < minT)) small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const tiny: string[] = [];
  const floor = phone ? 11 : 10;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || seen.has(el) || !(n.textContent || '').trim()) continue; seen.add(el);
    if (el.closest('[data-harness], svg, canvas') || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < floor) tiny.push(`${name(el)} ${fs}px`);
  }
  return {
    docOverflow: document.documentElement.scrollWidth - vw,
    overflow: overflow.slice(0, 15), overflowCount: overflow.length,
    small: small.slice(0, 20), smallCount: small.length,
    tiny: tiny.slice(0, 15), tinyCount: tiny.length,
    notFound: (document.body.innerText || '').includes('no fixture'),
  };
}

async function shoot(browser: any, s: (typeof SIZES)[number], mode: string, pages: typeof PAGES, report: Record<string, unknown>) {
  // One context per size × mode so the dev server's module graph is cached across pages.
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, isMobile: s.phone, hasTouch: s.phone || !!(s as any).touch });
  await ctx.addInitScript('window.__name = (f) => f;'); // tsx keepNames helper used inside probe()
  await ctx.addInitScript((m: string) => {
    try { sessionStorage.setItem('qe-harness', '1'); localStorage.setItem('qe-mode', m); } catch { /* */ }
  }, mode);
  for (const pg of pages) {
    const page = await ctx.newPage();
    await page.addInitScript(({ admin, out }: any) => {
      try {
        if (admin) sessionStorage.setItem('qe-harness-admin', '1'); else sessionStorage.removeItem('qe-harness-admin');
        if (out) sessionStorage.setItem('qe-harness-out', '1'); else sessionStorage.removeItem('qe-harness-out');
      } catch { /* */ }
    }, { admin: !!pg.admin, out: !!pg.out });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message.slice(0, 160)));
    page.on('console', (m: any) => { if (m.type() === 'info' && m.text().startsWith('[harness] no fixture')) errors.push(m.text()); });
    const key = `${pg.slug}-${s.w}-${mode}`;
    try {
      await page.goto(BASE + pg.path, { waitUntil: 'load', timeout: 60_000 });
      // Settle: wait for page/tool skeletons to leave (cold vite compiles are slow), then a beat.
      await page.waitForFunction(() => !document.querySelector('.qe-skel, .qe-skel-block, #app-loader'), null, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      report[key] = { ...(await page.evaluate(probe, s.phone)), errors: [...new Set(errors)].slice(0, 12) };
      // Pages scroll inside the shell's <main>, not the document: grow the viewport by the
      // scroller's hidden height so one image shows the whole page (capped at 5000px).
      const extra = await page.evaluate(() => {
        let best = 0;
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          const st = getComputedStyle(el);
          if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && el.clientHeight > window.innerHeight * 0.5) best = Math.max(best, el.scrollHeight - el.clientHeight);
        }
        return Math.max(best, document.documentElement.scrollHeight - window.innerHeight);
      });
      if (extra > 0) { await page.setViewportSize({ width: s.w, height: Math.min(s.h + extra, 5000) }); await page.waitForTimeout(700); }
      await page.screenshot({ path: path.join(OUT, `${key}.jpg`), type: 'jpeg', quality: 45 });
      const r = report[key] as any;
      console.log(`${key.padEnd(28)} docOverflow=${r.docOverflow} overflow=${r.overflowCount} small=${r.smallCount} tiny=${r.tinyCount}${errors.length ? ' errors=' + errors.length : ''}`);
    } catch (e) {
      console.log(`${key} FAILED ${(e as Error).message.slice(0, 120)}`);
    }
    await page.close();
  }
  await ctx.close();
}

async function main() {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.SHOTS_PAGES?.split(',');
  const pages = PAGES.filter((p) => !only || only.includes(p.slug));
  const sizes = process.env.SHOTS_SIZES ? SIZES.filter((s) => process.env.SHOTS_SIZES!.split(',').includes(String(s.w))) : SIZES;
  const modes = (process.env.SHOTS_MODES || 'dark,light').split(',');
  const report: Record<string, unknown> = {};
  const jobs = sizes.flatMap((s) => modes.map((m) => () => shoot(browser, s, m, pages, report)));
  const par = Number(process.env.SHOTS_PAR || 4);
  await Promise.all(Array.from({ length: par }, async () => { for (let j = jobs.shift(); j; j = jobs.shift()) await j(); }));
  const prev = fs.existsSync(path.join(OUT, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8')) : {};
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...prev, ...report }, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
