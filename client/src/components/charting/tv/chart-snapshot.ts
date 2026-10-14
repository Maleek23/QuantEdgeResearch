/**
 * CHART SNAPSHOT — one PNG of everything on the chart.
 *
 * lightweight-charts' takeScreenshot() leaves out the TOP layer by default —
 * and the user's drawings paint on the top layer, which is why snapshots used
 * to come back without them. Here:
 *   1. takeScreenshot(true) — panes + both axes + the top layer (drawings,
 *      position boxes, alert bells), at the device pixel ratio;
 *   2. the DOM overlays repainted onto it at the same ratio: the crosshair
 *      legend (symbol · interval · O H L C · volume · every active layer row)
 *      and the faint symbol watermark;
 *   3. a branded footer band: symbol · interval · time ET · quantedgelabs.net.
 *
 * Then: copy to the clipboard, save (blob download), or the share sheet on a
 * phone. The layout maths are pure (tested in scripts/test-charting-pro.ts).
 */

export interface SnapshotMeta { symbol: string; tfLabel: string; at: number; extra?: string }

export const SNAP_FOOTER_CSS = 30;
export const SNAP_SITE = 'quantedgelabs.net';

const ET_STAMP = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });

/** "SPY · 5m · Mon, Oct 13, 2026, 10:42 ET" */
export function snapshotCaption(m: SnapshotMeta): string {
  return `${m.symbol} · ${m.tfLabel} · ${ET_STAMP.format(m.at).replace(' at ', ', ')} ET${m.extra ? ` · ${m.extra}` : ''}`;
}

export function snapshotFileName(m: SnapshotMeta): string {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(m.at)) p[part.type] = part.value;
  const tf = m.tfLabel.replace(/[^A-Za-z0-9]+/g, '');
  return `${m.symbol.replace(/[^A-Za-z0-9._-]+/g, '')}-${tf}-${p.year}${p.month}${p.day}-${p.hour}${p.minute}ET.png`;
}

/** Output geometry in device pixels: the chart on top, the footer band under it. */
export function snapshotLayout(chartW: number, chartH: number, dpr: number): { w: number; h: number; footer: { y: number; h: number }; pad: number; font: number } {
  const r = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const fh = Math.round(SNAP_FOOTER_CSS * r);
  return { w: chartW, h: chartH + fh, footer: { y: chartH, h: fh }, pad: Math.round(10 * r), font: Math.round(12 * r) };
}

/** Fit a caption into `maxW` (measured by `measure`), dropping trailing " · " parts first, then ellipsis. */
export function fitCaption(text: string, maxW: number, measure: (s: string) => number): string {
  if (measure(text) <= maxW) return text;
  const parts = text.split(' · ');
  while (parts.length > 2) {
    parts.pop();
    const t = parts.join(' · ');
    if (measure(t) <= maxW) return t;
  }
  let t = parts.join(' · ');
  while (t.length > 1 && measure(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export interface LegendLine { text: string; color?: string; bold?: boolean }
export interface SnapshotColors { bg: string; panel: string; text: string; mute: string; accent: string; line: string }

/**
 * Compose the final canvas. `chartCanvas` comes from takeScreenshot(true);
 * `cssW` is the chart element's CSS width (so the device-pixel ratio is
 * exact, whatever the browser zoom).
 */
export function composeSnapshot(
  chartCanvas: HTMLCanvasElement, cssW: number, meta: SnapshotMeta, legend: LegendLine[][], colors: SnapshotColors,
  opts: { watermark?: boolean; logo?: HTMLImageElement | null } = {},
): HTMLCanvasElement {
  const dpr = cssW > 0 ? chartCanvas.width / cssW : (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const L = snapshotLayout(chartCanvas.width, chartCanvas.height, dpr);
  const out = document.createElement('canvas');
  out.width = L.w; out.height = L.h;
  const ctx = out.getContext('2d');
  if (!ctx) return chartCanvas;
  ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, L.w, L.h);
  ctx.drawImage(chartCanvas, 0, 0);

  const font = (px: number, weight = 600) => `${weight} ${Math.round(px * dpr)}px "JetBrains Mono", ui-monospace, monospace`;

  // watermark (as on screen: faint, centred)
  if (opts.watermark !== false) {
    ctx.save();
    ctx.globalAlpha = 0.07; ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(Math.max(40, Math.min(100, (L.w / dpr) * 0.07)), 800);
    ctx.fillText(meta.symbol, L.w / 2, L.footer.y / 2);
    ctx.restore();
  }

  // legend rows, top-left, with the on-screen halo so they read over candles
  ctx.save();
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  let y = 6 * dpr;
  const x0 = 8 * dpr;
  const maxX = L.w - 72 * dpr; // stay clear of the price axis
  for (const row of legend) {
    let x = x0;
    for (const seg of row) {
      ctx.font = font(11.5, seg.bold ? 700 : 500);
      const tw = ctx.measureText(seg.text).width;
      if (x + tw > maxX) break;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = colors.bg; ctx.lineJoin = 'round';
      ctx.strokeText(seg.text, x, y);
      ctx.fillStyle = seg.color ?? colors.text;
      ctx.fillText(seg.text, x, y);
      x += tw + 7 * dpr;
    }
    y += 17 * dpr;
    if (y > L.footer.y * 0.45) break;
  }
  ctx.restore();

  // footer band
  const fy = L.footer.y; const fh = L.footer.h;
  ctx.fillStyle = colors.panel; ctx.fillRect(0, fy, L.w, fh);
  ctx.fillStyle = colors.line; ctx.fillRect(0, fy, L.w, Math.max(1, Math.round(dpr)));
  ctx.textBaseline = 'middle';
  let rx = L.w - L.pad;
  ctx.font = font(12, 700); ctx.textAlign = 'right'; ctx.fillStyle = colors.accent;
  ctx.fillText(SNAP_SITE, rx, fy + fh / 2);
  rx -= ctx.measureText(SNAP_SITE).width + 8 * dpr;
  if (opts.logo && opts.logo.complete && opts.logo.naturalWidth) {
    const lh = fh * 0.62; const lw = (opts.logo.naturalWidth / opts.logo.naturalHeight) * lh;
    try { ctx.drawImage(opts.logo, rx - lw, fy + (fh - lh) / 2, lw, lh); rx -= lw + 8 * dpr; } catch { /* tainted / not decoded */ }
  }
  ctx.textAlign = 'left'; ctx.fillStyle = colors.text; ctx.font = font(12, 600);
  const cap = fitCaption(snapshotCaption(meta), rx - L.pad * 2, (s) => ctx.measureText(s).width);
  ctx.fillText(cap, L.pad, fy + fh / 2);
  return out;
}

/** The legend as painted on screen: one array of coloured segments per visible row. */
export function readLegend(root: Element | null): LegendLine[][] {
  if (!root) return [];
  const rows: LegendLine[][] = [];
  root.querySelectorAll('.tv-leg-row').forEach((row) => {
    const segs: LegendLine[] = [];
    const walk = (el: Element) => {
      if (el.classList.contains('tv-leg-x') || el.tagName === 'BUTTON') return;
      const kids = Array.from(el.children);
      if (!kids.length || el.classList.contains('tv-leg-sym')) {
        const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (t) {
          const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
          segs.push({ text: t, color: cs?.color || undefined, bold: cs ? Number(cs.fontWeight) >= 700 : false });
        }
        return;
      }
      // mixed text + elements: keep the order of text nodes too
      el.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          const t = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (t) segs.push({ text: t, color: typeof getComputedStyle === 'function' ? getComputedStyle(el).color : undefined });
        } else if (n.nodeType === 1) walk(n as Element);
      });
    };
    walk(row);
    // "O 575.40" reads better than "O" "575.40" as separate words
    const merged: LegendLine[] = [];
    for (const s of segs) {
      const prev = merged[merged.length - 1];
      if (prev && /^[OHLC]$/.test(prev.text)) { prev.text = `${prev.text} ${s.text}`; prev.color = s.color; continue; }
      merged.push({ ...s });
    }
    if (merged.length) rows.push(merged);
  });
  return rows;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((ok) => { try { c.toBlob(ok, 'image/png'); } catch { ok(null); } });
}

export type SnapAction = 'copy' | 'save' | 'share';
export type SnapResult = { ok: true; text: string; href?: string; file?: string } | { ok: false; text: string };

/** Copy / save / share a composed snapshot. `blob` may be a promise (Safari wants ClipboardItem built inside the gesture). */
export async function deliverSnapshot(action: SnapAction, blobP: Promise<Blob | null>, name: string, title: string): Promise<SnapResult> {
  const nav = (typeof navigator !== 'undefined' ? navigator : null) as (Navigator & { canShare?: (d: ShareData) => boolean }) | null;
  if (action === 'copy') {
    const CI = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!nav?.clipboard?.write || !CI) return { ok: false, text: 'Copy image is not supported in this browser — use Save image' };
    try {
      await nav.clipboard.write([new CI({ 'image/png': blobP.then((b) => { if (!b) throw new Error('no image'); return b; }) })]);
      return { ok: true, text: 'Chart image copied to the clipboard' };
    } catch {
      return { ok: false, text: 'Copy was blocked — use Save image' };
    }
  }
  const blob = await blobP;
  if (!blob) return { ok: false, text: 'Snapshot failed — the chart could not be captured' };
  if (action === 'share' || (action === 'save' && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)) {
    if (typeof File !== 'undefined' && nav?.share) {
      const file = new File([blob], name, { type: 'image/png' });
      if (nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title }); return { ok: true, text: 'Snapshot ready to save or send' }; } catch (e) {
          if ((e as Error)?.name === 'AbortError') return { ok: true, text: 'Share cancelled' };
        }
      }
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return { ok: true, text: action === 'share' ? `Sharing is not available here — saved ${name}` : `Snapshot saved — ${name}`, href, file: name };
}
