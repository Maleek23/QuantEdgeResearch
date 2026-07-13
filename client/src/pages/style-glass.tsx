/**
 * PREMIUM GLASS — full dashboard mock at platform scale, so the chosen style
 * can be judged as a whole screen (not a single card). Self-contained sample
 * data. Route: /glass-dashboard. The design language here becomes the law.
 */
const cyan = '#22d3ee';
const bull = '#10b981';
const bear = '#ef4444';
const gold = '#f59e0b';

const mesh =
  'radial-gradient(60% 80% at 12% 0%, rgba(34,211,238,0.10), transparent 60%),' +
  'radial-gradient(50% 70% at 95% 10%, rgba(168,85,247,0.10), transparent 60%),' +
  'radial-gradient(70% 90% at 50% 110%, rgba(239,68,68,0.06), transparent 60%),' +
  '#060709';

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.035)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const SIGNALS = [
  { sym: 'AVGO', dir: 'BEAR', conf: 89, band: 'ELITE', rr: 2.5, chg: -7.92 },
  { sym: 'NVDA', dir: 'BULL', conf: 84, band: 'STRONG', rr: 2.2, chg: 3.1 },
  { sym: 'COIN', dir: 'BULL', conf: 76, band: 'HIGH', rr: 2.0, chg: 5.4 },
  { sym: 'KLAC', dir: 'BULL', conf: 72, band: 'HIGH', rr: 2.4, chg: 2.8 },
  { sym: 'IWM', dir: 'BEAR', conf: 68, band: 'STRONG', rr: 2.5, chg: -1.6 },
  { sym: 'SMCI', dir: 'BULL', conf: 64, band: 'MED', rr: 2.0, chg: 4.2 },
];

function MicroLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40">{children}</div>;
}

function KpiTile({ label, value, sub, color = '#fff' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={glass}>
      <MicroLabel>{label}</MicroLabel>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

function Chip({ name, pct }: { name: string; pct: number }) {
  const up = pct >= 0;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-mono"
      style={{ background: up ? `${bull}14` : `${bear}14`, color: up ? bull : bear, border: `1px solid ${up ? bull : bear}30` }}>
      {name}<span className="tabular-nums opacity-80">{up ? '+' : ''}{pct}%</span>
    </span>
  );
}

function GlassSignal({ s }: { s: typeof SIGNALS[number] }) {
  const isBull = s.dir === 'BULL';
  const c = isBull ? bull : bear;
  return (
    <div className="relative overflow-hidden rounded-2xl p-3.5 transition-transform hover:-translate-y-0.5" style={glass}>
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c}66, transparent)` }} />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl grid place-items-center text-[10px] font-bold" style={{ background: `${c}20`, color: c, border: `1px solid ${c}40` }}>{s.sym.slice(0, 2)}</div>
          <div>
            <div className="text-sm font-semibold text-white tracking-tight" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s.sym}</div>
            <div className="text-[10px]" style={{ color: c }}>{isBull ? '▲' : '▼'} {s.band} · {s.rr}R</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold leading-none tabular-nums" style={{ color: c, fontFamily: "'IBM Plex Mono', monospace", textShadow: `0 0 22px ${c}55` }}>{s.conf}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-1.5 flex-1 mr-3 rounded-full bg-white/8 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.conf}%`, background: c }} /></div>
        <span className="text-[11px] font-mono tabular-nums" style={{ color: s.chg >= 0 ? bull : bear }}>{s.chg >= 0 ? '+' : ''}{s.chg}%</span>
      </div>
    </div>
  );
}

export default function StyleGlass() {
  return (
    <div className="min-h-screen text-white" style={{ background: mesh, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-6 py-7">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full" style={{ background: bull, boxShadow: `0 0 10px ${bull}` }} />
              <MicroLabel>Live · Market Open · 11:42 ET</MicroLabel>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              <span style={{ color: cyan }}>Money</span> is rotating into chips
            </h1>
          </div>
          <div className="flex gap-2 text-right">
            {[['VIX', '18.7'], ['10Y', '4.53%'], ['BTC', '$63.7k']].map(([l, v]) => (
              <div key={l} className="rounded-xl px-3 py-2" style={glass}>
                <MicroLabel>{l}</MicroLabel>
                <div className="text-sm font-mono tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <KpiTile label="Active Signals" value="12" sub="10 long · 2 short" color="#fff" />
          <KpiTile label="Avg Conf" value="73%" color={bull} />
          <KpiTile label="Top Conf" value="89%" color={bull} />
          <KpiTile label="Regime" value="RANGING" sub="risk neutral" color={gold} />
          <KpiTile label="Breadth" value="59%" sub="above 50DMA" color={cyan} />
        </div>

        {/* Money flow */}
        <div className="rounded-2xl px-4 py-3 mb-5" style={glass}>
          <div className="flex items-center gap-3 flex-wrap">
            <MicroLabel>Money Flow</MicroLabel>
            <span className="text-[10px] font-mono" style={{ color: bear }}>OUT OF</span>
            <Chip name="Utilities" pct={-1.9} /><Chip name="Real Estate" pct={-1.6} />
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>→</span>
            <span className="text-[10px] font-mono" style={{ color: bull }}>INTO</span>
            <Chip name="Semis" pct={5.7} /><Chip name="Tech" pct={2.7} /><Chip name="Energy" pct={1.0} />
            <span className="ml-auto text-[11px] font-mono tabular-nums" style={{ color: bull }}>SPY +0.49%</span>
          </div>
        </div>

        {/* Signal board */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight"><span style={{ color: cyan }}>Active</span> Signals</h2>
          <MicroLabel>Ranked · best setups</MicroLabel>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SIGNALS.map((s) => <GlassSignal key={s.sym} s={s} />)}
        </div>
      </div>
    </div>
  );
}
