import { useState } from "react";
import {
  QEPanel,
  QEPanelGlass,
  QEPanelNested,
  QEPanelInteractive,
  QEPanelStat,
  QELayer,
  QEPanelHeader,
  QEPanelContent,
  QEPanelFooter,
  QEStatCard,
  QEGradeDisplay,
  QEConfidenceBar,
  QEStatusDot,
} from "@/components/ui/qe-panel";
import {
  QEPageShell,
  QEPageHeader,
  QESectionDivider,
  QEGridLayout,
  QEEmptyState,
} from "@/components/ui/qe-page-shell";
import {
  QEWorkspace,
  QEWorkspacePanel,
  type WorkspacePreset,
} from "@/components/ui/qe-workspace";
import {
  Activity,
  BarChart3,
  Brain,
  Crosshair,
  Eye,
  Flame,
  Layers,
  LineChart,
  Shield,
  TrendingUp,
  Zap,
  AlertTriangle,
  BookOpen,
} from "lucide-react";

/**
 * Design System Test Page
 * =======================
 * Visual regression test for the unified QuantEdge design system.
 * Navigate to /design-system to view.
 */

export default function DesignSystemTest() {
  const [workspacePreset, setWorkspacePreset] = useState<WorkspacePreset>("split");

  return (
    <QEPageShell width="wide" grid="cyan" orbs={true}>
      <QEPageHeader
        title="Design System"
        marker="QE // UNIFIED COMPONENT LIBRARY"
        subtitle="Visual test of all panel variants, layout components, and workspace presets"
        icon={<Layers className="w-5 h-5 text-[#00d4ff]" />}
        iconAccent="cyan"
        actions={
          <div className="flex items-center gap-2">
            <QEStatusDot status="live" label="Dev" />
            <span className="text-xs text-slate-500 font-mono">v1.0</span>
          </div>
        }
      />

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Panel Variants */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="01" label="PANEL VARIANTS" />

      <QEGridLayout cols={3} gap="md">
        {/* Default Panel */}
        <QEPanel>
          <QEPanelHeader title="Default Panel" badge="DEFAULT" />
          <QEPanelContent>
            <p className="text-sm text-slate-400">
              Standard card/section container. Used for most content blocks.
            </p>
            <QEPanelNested compact>
              <p className="text-xs text-slate-500">Nested panel inside default</p>
            </QEPanelNested>
          </QEPanelContent>
        </QEPanel>

        {/* Glass Panel */}
        <QEPanelGlass>
          <QEPanelHeader
            title="Glass Panel"
            badge="GLASS"
            badgeColor="ai"
            icon={<Shield className="w-4 h-4" />}
          />
          <QEPanelContent>
            <p className="text-sm text-slate-400">
              Elevated glass surface. Used for nav bars, sidebars, modals.
            </p>
          </QEPanelContent>
        </QEPanelGlass>

        {/* Interactive Panel */}
        <QEPanelInteractive onClick={() => alert("Clicked!")}>
          <QEPanelHeader
            title="Interactive Panel"
            badge="CLICK ME"
            badgeColor="bullish"
          />
          <QEPanelContent>
            <p className="text-sm text-slate-400">
              Clickable card with hover border glow. For watchlist items, scan results, etc.
            </p>
          </QEPanelContent>
        </QEPanelInteractive>

        {/* Stat Panel */}
        <QEPanelStat>
          <QEPanelHeader title="Stat Panel" badge="METRIC" badgeColor="gold" />
          <QEPanelContent>
            <div className="text-3xl font-black font-mono text-white tracking-tighter">$5,847.23</div>
            <div className="text-xs text-emerald-400 font-medium">+12.4% today</div>
          </QEPanelContent>
        </QEPanelStat>

        {/* Layer (Architecture Blueprint) */}
        <QELayer className="col-span-2">
          <QEPanelHeader
            marker="LAYER GROUP"
            title="Architecture Layer"
            subtitle="Dashed-border container from Blueprint template"
          />
          <QEPanelContent>
            <QEGridLayout cols={3} gap="sm">
              <QEPanelNested compact>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">TCH</div>
                <div className="text-sm font-bold text-white">Technical</div>
              </QEPanelNested>
              <QEPanelNested compact>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">FND</div>
                <div className="text-sm font-bold text-white">Fundamental</div>
              </QEPanelNested>
              <QEPanelNested compact>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SNT</div>
                <div className="text-sm font-bold text-white">Sentiment</div>
              </QEPanelNested>
            </QEGridLayout>
          </QEPanelContent>
        </QELayer>
      </QEGridLayout>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Stat Cards */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="02" label="STAT CARDS" />

      <QEGridLayout cols={4} gap="md">
        <QEStatCard
          label="Win Rate"
          value="78.4%"
          change="+3.2% this week"
          changeType="positive"
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <QEStatCard
          label="Avg P&L"
          value="$1,247"
          change="-$82 vs last month"
          changeType="negative"
          icon={<BarChart3 className="w-4 h-4" />}
        />
        <QEStatCard
          label="Open Positions"
          value="12"
          change="4 in profit"
          changeType="positive"
          icon={<Crosshair className="w-4 h-4" />}
        />
        <QEStatCard
          label="AI Confidence"
          value="86%"
          change="High Conviction"
          changeType="positive"
          icon={<Brain className="w-4 h-4" />}
        />
      </QEGridLayout>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Badges, Grades & Indicators */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="03" label="GRADES & INDICATORS" />

      <QEGridLayout cols={2} gap="md">
        <QEPanel>
          <QEPanelHeader title="Engine Grades" marker="6-ENGINE SCORING" />
          <QEPanelContent>
            <div className="flex flex-wrap gap-4">
              <QEGradeDisplay grade="S" label="TCH" size="md" />
              <QEGradeDisplay grade="A" label="FND" size="md" />
              <QEGradeDisplay grade="B" label="SNT" size="md" />
              <QEGradeDisplay grade="C" label="QNT" size="md" />
              <QEGradeDisplay grade="D" label="FLW" size="md" />
              <QEGradeDisplay grade="F" label="CAT" size="md" />
            </div>
          </QEPanelContent>
        </QEPanel>

        <QEPanel>
          <QEPanelHeader title="Confidence Bars" />
          <QEPanelContent>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">High (92%)</div>
                <QEConfidenceBar value={92} showLabel size="md" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Medium (67%)</div>
                <QEConfidenceBar value={67} showLabel size="md" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Low (34%)</div>
                <QEConfidenceBar value={34} showLabel size="md" />
              </div>
            </div>
          </QEPanelContent>
        </QEPanel>
      </QEGridLayout>

      <QEPanel className="mt-3">
        <QEPanelHeader title="Status Indicators" />
        <QEPanelContent>
          <div className="flex items-center gap-6">
            <QEStatusDot status="online" label="Connected" />
            <QEStatusDot status="live" label="Live Market" />
            <QEStatusDot status="warning" label="High Volatility" />
            <QEStatusDot status="error" label="API Error" />
          </div>
        </QEPanelContent>
      </QEPanel>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: Panel with Header, Content, Footer */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="04" label="COMPOSED PANELS" />

      <QEGridLayout cols={2} gap="md">
        <QEPanel glow="cyan">
          <QEPanelHeader
            title="SPX 0DTE Scanner"
            marker="SCAN // LIVE"
            badge="12 SIGNALS"
            badgeColor="live"
            icon={<Zap className="w-4 h-4 text-[#00d4ff]" />}
            actions={
              <button className="text-[10px] font-bold uppercase tracking-wider text-[#00d4ff] hover:text-white transition-colors">
                View All →
              </button>
            }
          />
          <QEPanelContent>
            {[
              { symbol: "SPX 5850C", confidence: 87, direction: "CALL" },
              { symbol: "SPX 5820P", confidence: 72, direction: "PUT" },
              { symbol: "SPX 5860C", confidence: 64, direction: "CALL" },
            ].map((signal) => (
              <QEPanelNested key={signal.symbol} compact>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold font-mono text-white">{signal.symbol}</span>
                    <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider ${signal.direction === "CALL" ? "text-emerald-400" : "text-red-400"}`}>
                      {signal.direction}
                    </span>
                  </div>
                  <QEConfidenceBar value={signal.confidence} showLabel className="w-24" />
                </div>
              </QEPanelNested>
            ))}
          </QEPanelContent>
          <QEPanelFooter>
            <span className="text-[10px] font-mono text-slate-500">Last scan: 2s ago</span>
            <QEStatusDot status="live" />
          </QEPanelFooter>
        </QEPanel>

        <QEPanel glow="ai">
          <QEPanelHeader
            title="AI Intelligence Brief"
            badge="AI"
            badgeColor="ai"
            icon={<Brain className="w-4 h-4 text-violet-400" />}
          />
          <QEPanelContent>
            <QEPanelNested compact>
              <div className="flex items-center gap-2 mb-2">
                <QEGradeDisplay grade="S" />
                <span className="text-sm font-semibold text-white">AAPL</span>
                <span className="text-xs text-emerald-400">Strong Buy</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                6-engine convergence at 92%. Technical breakout above $198 resistance
                confirmed with above-average volume. Sentiment shift positive.
              </p>
            </QEPanelNested>
            <QEPanelNested compact>
              <div className="flex items-center gap-2 mb-2">
                <QEGradeDisplay grade="A" />
                <span className="text-sm font-semibold text-white">NVDA</span>
                <span className="text-xs text-emerald-400">Buy</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Institutional accumulation detected. Order flow divergence bullish.
                Catalyst: earnings in 3 days.
              </p>
            </QEPanelNested>
          </QEPanelContent>
          <QEPanelFooter>
            <span className="text-[10px] font-mono text-slate-500">Updated: 12:34 CT</span>
            <button className="bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded hover:bg-violet-500/20 transition-colors">
              Full Brief →
            </button>
          </QEPanelFooter>
        </QEPanel>
      </QEGridLayout>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: Empty State */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="05" label="EMPTY STATE" />

      <QEPanel>
        <QEEmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="No Trade Journal Entries"
          description="Start logging your trades to track performance and identify patterns in your trading strategy."
          action={
            <button className="bg-[#00d4ff] hover:bg-[#00bfe8] text-black font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
              Log First Trade
            </button>
          }
        />
      </QEPanel>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: Workspace */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="06" label="MULTI-PANEL WORKSPACE" />

      <div className="h-[500px] mb-8">
        <QEWorkspace
          id="design-test"
          preset={workspacePreset}
          onPresetChange={setWorkspacePreset}
        >
          <QEWorkspacePanel id="chart" title="Price Chart" icon={<LineChart className="w-3.5 h-3.5" />} minSize={20}>
            <div className="p-4 h-full flex items-center justify-center">
              <div className="text-center">
                <LineChart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <div className="text-sm font-semibold text-white font-display">Chart Panel</div>
                <p className="text-xs text-slate-500 mt-1">Drag handles to resize • Click expand icon to fullscreen</p>
              </div>
            </div>
          </QEWorkspacePanel>

          <QEWorkspacePanel id="scanner" title="Scanner" icon={<Eye className="w-3.5 h-3.5" />} minSize={15}>
            <div className="p-4 h-full flex items-center justify-center">
              <div className="text-center">
                <Eye className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <div className="text-sm font-semibold text-white font-display">Scanner Panel</div>
                <p className="text-xs text-slate-500 mt-1">Live signal feed</p>
              </div>
            </div>
          </QEWorkspacePanel>

          <QEWorkspacePanel id="orders" title="Order Flow" icon={<Activity className="w-3.5 h-3.5" />} minSize={15}>
            <div className="p-4 h-full flex items-center justify-center">
              <div className="text-center">
                <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <div className="text-sm font-semibold text-white font-display">Order Flow Panel</div>
                <p className="text-xs text-slate-500 mt-1">Whale detection & flow</p>
              </div>
            </div>
          </QEWorkspacePanel>

          <QEWorkspacePanel id="alerts" title="Alerts" icon={<AlertTriangle className="w-3.5 h-3.5" />} minSize={15} collapsible>
            <div className="p-4 h-full flex items-center justify-center">
              <div className="text-center">
                <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <div className="text-sm font-semibold text-white font-display">Alerts Panel</div>
                <p className="text-xs text-slate-500 mt-1">Price & signal alerts</p>
              </div>
            </div>
          </QEWorkspacePanel>
        </QEWorkspace>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: Typography & Colors */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <QESectionDivider number="07" label="TYPOGRAPHY & COLORS" />

      <QEGridLayout cols={2} gap="md" className="mb-12">
        <QEPanel>
          <QEPanelHeader title="Font Stack" />
          <QEPanelContent>
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Display — Space Grotesk</div>
                <div className="text-3xl font-bold font-display tracking-tight text-white">QuantEdge Intelligence</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Body — Inter</div>
                <div className="text-sm text-slate-300">The quick brown fox jumps over the lazy dog. AI-powered convergence scoring across 6 engines.</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Mono — JetBrains Mono</div>
                <div className="text-sm font-mono text-[#00d4ff]">$5,847.23 &nbsp; +12.4% &nbsp; VOL 2.3M &nbsp; IV 32.1%</div>
              </div>
            </div>
          </QEPanelContent>
        </QEPanel>

        <QEPanel>
          <QEPanelHeader title="Color Palette" />
          <QEPanelContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#00d4ff]" />
                <div>
                  <div className="text-xs font-bold text-white">Electric Cyan</div>
                  <div className="text-[10px] font-mono text-slate-500">#00d4ff — Primary accent</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#8b5cf6]" />
                <div>
                  <div className="text-xs font-bold text-white">AI Violet</div>
                  <div className="text-[10px] font-mono text-slate-500">#8b5cf6 — AI/Intelligence</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#10b981]" />
                <div>
                  <div className="text-xs font-bold text-white">Bullish Green</div>
                  <div className="text-[10px] font-mono text-slate-500">#10b981 — Profit / Long</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#ef4444]" />
                <div>
                  <div className="text-xs font-bold text-white">Bearish Red</div>
                  <div className="text-[10px] font-mono text-slate-500">#ef4444 — Loss / Short</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#f59e0b]" />
                <div>
                  <div className="text-xs font-bold text-white">Gold</div>
                  <div className="text-[10px] font-mono text-slate-500">#f59e0b — Premium / Warning</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-[#b6ff33]" />
                <div>
                  <div className="text-xs font-bold text-white">Live Lime</div>
                  <div className="text-[10px] font-mono text-slate-500">#b6ff33 — Live / High conviction</div>
                </div>
              </div>
            </div>
          </QEPanelContent>
        </QEPanel>
      </QEGridLayout>
    </QEPageShell>
  );
}
