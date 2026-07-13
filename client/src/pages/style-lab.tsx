/**
 * STYLE LAB — the same QuantEdge content rendered in distinct visual styles so
 * the look can be CHOSEN by eye, not from text descriptions. Self-contained
 * (hardcoded sample data) so it always renders. Route: /style-lab
 */
import { useState } from 'react';

// One realistic sample signal, rendered three ways.
const SIG = {
  symbol: 'AVGO',
  name: 'Broadcom',
  dir: 'BEAR' as const,
  conf: 89,
  band: 'ELITE BEARISH',
  rr: 2.5,
  spot: 385.73,
  changePct: -7.92,
  entry: 385.73,
  stop: 392.4,
  target: 374.1,
  thesis: 'Negative gamma + VEX −7222 = coiled spring. Dealers must chase price on a break.',
};
const bear = '#ef4444';
const cyan = '#22d3ee';

// ─────────────────────────────────────────────────────────────
// STYLE A — TERMINAL (Fortress-dense): steel/dark, mono, compact, sharp.
function TerminalCard() {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', monospace" }} className="rounded-sm border border-white/10 bg-[#0a0b0d] p-3 w-full">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide text-white tabular-nums">{SIG.symbol}</span>
          <span className="text-[9px] font-bold px-1 py-px rounded-sm" style={{ color: bear, background: `${bear}1a` }}>▼ {SIG.dir}</span>
          <span className="text-[9px] uppercase tracking-widest text-white/40">swing · {SIG.rr}R</span>
        </div>
        <span className="text-[9px] uppercase tracking-widest" style={{ color: cyan }}>● live</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/40">conviction</div>
          <div className="text-3xl font-bold leading-none tabular-nums" style={{ color: bear }}>{SIG.conf}</div>
          <div className="text-[9px] uppercase tracking-widest mt-1" style={{ color: bear }}>{SIG.band}</div>
        </div>
        <div className="text-right text-[11px] tabular-nums">
          <div className="flex gap-3"><span className="text-white/40">ENTRY</span><span className="text-white">${SIG.entry.toFixed(2)}</span></div>
          <div className="flex gap-3"><span className="text-white/40">STOP</span><span style={{ color: bear }}>${SIG.stop.toFixed(2)}</span></div>
          <div className="flex gap-3"><span className="text-white/40">TGT</span><span style={{ color: '#10b981' }}>${SIG.target.toFixed(2)}</span></div>
        </div>
      </div>
      <div className="mt-2 h-1 w-full bg-white/10 rounded-sm overflow-hidden"><div className="h-full" style={{ width: `${SIG.conf}%`, background: bear }} /></div>
      <p className="mt-2 text-[10px] leading-snug text-white/50">{SIG.thesis}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLE B — PREMIUM GLASS (nafs / Asymmetrix): gradient mesh, glass, glow.
function GlassCard() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 p-4"
      style={{ background: 'radial-gradient(120% 120% at 0% 0%, rgba(34,211,238,0.10), transparent 50%), radial-gradient(120% 120% at 100% 100%, rgba(239,68,68,0.10), transparent 50%), rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl grid place-items-center text-xs font-bold text-white" style={{ background: `${bear}26`, border: `1px solid ${bear}40` }}>AV</div>
          <div>
            <div className="text-base font-semibold text-white tracking-tight">{SIG.symbol} <span className="text-white/40 text-xs">{SIG.name}</span></div>
            <div className="text-[11px]" style={{ color: bear }}>▼ {SIG.band}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold leading-none tabular-nums" style={{ color: bear, textShadow: `0 0 24px ${bear}66` }}>{SIG.conf}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/40 mt-1">conviction</div>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-white/60 mb-3">{SIG.thesis}</p>
      <div className="grid grid-cols-3 gap-2">
        {[['ENTRY', `$${SIG.entry.toFixed(2)}`, '#fff'], ['STOP', `$${SIG.stop.toFixed(2)}`, bear], ['TARGET', `$${SIG.target.toFixed(2)}`, '#10b981']].map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-white/40">{l}</div>
            <div className="text-sm font-semibold tabular-nums" style={{ color: c as string }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLE C — CLEAN SAAS (Linear / Vercel): flat, airy, calm, one accent.
function CleanCard() {
  return (
    <div className="w-full rounded-xl border border-white/[0.08] bg-[#111214] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-semibold text-white tracking-tight">{SIG.symbol}</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: bear, background: `${bear}14` }}>Bearish · {SIG.rr}:1</span>
        </div>
        <span className="text-xs text-white/40 tabular-nums">${SIG.spot.toFixed(2)} <span style={{ color: bear }}>{SIG.changePct}%</span></span>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-5xl font-semibold tabular-nums tracking-tight text-white">{SIG.conf}</span>
        <span className="text-sm text-white/40">/ 100 conviction</span>
      </div>
      <p className="text-sm leading-relaxed text-white/55 mb-4">{SIG.thesis}</p>
      <div className="flex items-center gap-6 text-sm">
        <div><span className="text-white/40">Entry </span><span className="text-white tabular-nums">${SIG.entry.toFixed(2)}</span></div>
        <div><span className="text-white/40">Stop </span><span className="tabular-nums" style={{ color: bear }}>${SIG.stop.toFixed(2)}</span></div>
        <div><span className="text-white/40">Target </span><span className="tabular-nums" style={{ color: '#10b981' }}>${SIG.target.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

const STYLES = [
  { id: 'terminal', name: 'A · Terminal', tag: 'Fortress-dense · Bloomberg', Comp: TerminalCard },
  { id: 'glass', name: 'B · Premium Glass', tag: 'nafs / Asymmetrix · gradient + glow', Comp: GlassCard },
  { id: 'clean', name: 'C · Clean SaaS', tag: 'Linear / Vercel · airy + calm', Comp: CleanCard },
] as const;

export default function StyleLab() {
  const [solo, setSolo] = useState<string | null>(null);
  const shown = solo ? STYLES.filter((s) => s.id === solo) : STYLES;
  return (
    <div className="min-h-screen bg-black text-white px-6 py-8" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Style Lab</h1>
        <p className="text-sm text-white/50 mb-6">Same signal, three looks. Pick the one that feels like QuantEdge — then I build the whole platform in it.</p>
        <div className="flex gap-2 mb-8">
          <button onClick={() => setSolo(null)} className={`text-xs px-3 py-1.5 rounded-md border ${!solo ? 'border-[#22d3ee] text-[#22d3ee]' : 'border-white/15 text-white/50'}`}>Compare all</button>
          {STYLES.map((s) => (
            <button key={s.id} onClick={() => setSolo(s.id)} className={`text-xs px-3 py-1.5 rounded-md border ${solo === s.id ? 'border-[#22d3ee] text-[#22d3ee]' : 'border-white/15 text-white/50'}`}>{s.name}</button>
          ))}
        </div>
        <div className={`grid gap-6 ${solo ? 'grid-cols-1 max-w-md' : 'md:grid-cols-3'}`}>
          {shown.map(({ id, name, tag, Comp }) => (
            <div key={id}>
              <div className="mb-2">
                <div className="text-sm font-semibold">{name}</div>
                <div className="text-[11px] text-white/40">{tag}</div>
              </div>
              <Comp />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
