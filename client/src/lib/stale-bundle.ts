/**
 * STALE-BUNDLE RESILIENCE — what happens to an open tab after a deploy.
 *
 * A deploy replaces every hashed chunk. A tab opened before it still runs the
 * old entry bundle, so the next lazy import can 404 ("Failed to fetch
 * dynamically imported module"), or an old chunk can meet a new one and throw
 * a ReferenceError such as "useRef is not defined". Both look like app bugs to
 * the trader; both are cured by one reload.
 *
 * Policy:
 *   - chunk-load failures        → stale, always (they only happen across deploys)
 *   - ReferenceError / "is not a function" / module-script errors
 *                                → stale ONLY if the server's index.html now
 *                                  points at a different entry bundle. A real
 *                                  bug on the current build must stay visible,
 *                                  not turn into a reload loop.
 *   - stale → show "New version available — reload" and auto-reload ONCE.
 *     A sessionStorage stamp guards the loop: if we already auto-reloaded in
 *     the last 2 minutes, only the banner (with its button) is shown.
 *
 * The banner is plain DOM, not React: it has to work when the React tree is
 * the thing that just crashed.
 */

const RELOAD_STAMP_KEY = 'qe-stale-reload-at';
const LOOP_WINDOW_MS = 120_000;
const BANNER_ID = 'qe-stale-bundle-banner';

const CHUNK_PATTERNS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'failed to load module script',
  'loading chunk',
  'loading css chunk',
  'unable to preload css',
  'dynamically imported module',
];

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try { return String((err as { message?: unknown })?.message ?? err); } catch { return ''; }
}

export function isChunkLoadError(err: unknown): boolean {
  const m = messageOf(err).toLowerCase();
  return CHUNK_PATTERNS.some((p) => m.includes(p));
}

/** Errors that a mixed old/new bundle produces — but a real bug can too. */
export function isSuspectStaleError(err: unknown): boolean {
  if (isChunkLoadError(err)) return true;
  const m = messageOf(err);
  return /ReferenceError: .+ is not defined/.test(m)
    || (/is not a function/.test(m) && /assets\//i.test((err as Error)?.stack ?? ''))
    || /Cannot access '.+' before initialization/.test(m);
}

/** The entry script this page booted from, e.g. "/assets/index-Cel4SZdN.js". */
function currentEntry(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  if (!el) return null;
  try { return new URL(el.src, location.href).pathname; } catch { return el.getAttribute('src'); }
}

let versionCheck: Promise<boolean> | null = null;
/** True when the server now serves a different entry bundle than this tab runs. */
export function newVersionAvailable(): Promise<boolean> {
  if (versionCheck) return versionCheck;
  versionCheck = (async () => {
    const mine = currentEntry();
    if (!mine) return false; // dev server (no hashed entry) — never claim a new build
    try {
      const r = await fetch('/', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'text/html' } });
      if (!r.ok) return false;
      const html = await r.text();
      const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
      return !!m && m[1] !== mine;
    } catch {
      return false;
    } finally {
      // Allow a fresh check later (e.g. the periodic poll after the next deploy).
      setTimeout(() => { versionCheck = null; }, 30_000);
    }
  })();
  return versionCheck;
}

function readStamp(): number {
  try { return Number(sessionStorage.getItem(RELOAD_STAMP_KEY)) || 0; } catch { return 0; }
}
function writeStamp() {
  try { sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now())); } catch { /* private mode */ }
}

function reloadNow() {
  writeStamp();
  location.reload();
}

export function showNewVersionBanner(opts: { autoReloadMs?: number } = {}) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(BANNER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:calc(16px + env(safe-area-inset-bottom))', 'transform:translateX(-50%)',
      'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:12px',
      'padding:9px 12px 9px 14px', 'border-radius:8px',
      'background:#0f1622', 'color:#e8ecf3', 'border:1px solid rgba(59,140,255,0.45)',
      'box-shadow:0 10px 30px rgba(0,0,0,0.45)',
      "font:600 12px/1.3 'JetBrains Mono',ui-monospace,monospace", 'max-width:calc(100vw - 32px)',
    ].join(';');
    const text = document.createElement('span');
    text.dataset.role = 'text';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Reload';
    btn.style.cssText = 'cursor:pointer;border:0;border-radius:5px;padding:5px 10px;background:#3b8cff;color:#04101f;font:700 11px/1 inherit;letter-spacing:.04em';
    btn.addEventListener('click', reloadNow);
    el.append(text, btn);
    document.body.appendChild(el);
  }
  const text = el.querySelector<HTMLElement>('[data-role=text]');
  if (text) text.textContent = opts.autoReloadMs ? 'New version available — reloading…' : 'New version available — reload to update';
  if (opts.autoReloadMs) setTimeout(reloadNow, opts.autoReloadMs);
}

/**
 * Entry point for every error path. Returns true when the error was handled as
 * a stale bundle (the caller may then render a quiet placeholder instead of a
 * crash screen).
 */
export async function recoverIfStale(err: unknown): Promise<boolean> {
  if (!isSuspectStaleError(err)) return false;
  const confirmed = isChunkLoadError(err) || await newVersionAvailable();
  if (!confirmed) return false;
  const recentlyReloaded = Date.now() - readStamp() < LOOP_WINDOW_MS;
  showNewVersionBanner(recentlyReloaded ? {} : { autoReloadMs: 1200 });
  return true;
}

let installed = false;
/**
 * Global listeners: uncaught errors, unhandled rejections, Vite's preload
 * failures, plus a cheap periodic check (visible tabs only, every 10 min) so a
 * long-lived tab learns about a deploy before it trips over one.
 */
export function installStaleBundleGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => { void recoverIfStale(e.error ?? e.message); });
  window.addEventListener('unhandledrejection', (e) => { void recoverIfStale(e.reason); });
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    void recoverIfStale((e as Event & { payload?: unknown }).payload ?? new Error('Failed to fetch dynamically imported module'));
  });
  const poll = async () => {
    if (document.visibilityState !== 'visible') return;
    if (await newVersionAvailable()) showNewVersionBanner();
  };
  setInterval(poll, 10 * 60_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void poll(); });
}
