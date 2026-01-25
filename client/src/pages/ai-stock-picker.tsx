import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Sparkles,
  Star,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Eye,
  Plus,
  BarChart3,
} from "lucide-react";

const dashboardItems = [
  { id: "overview", label: "Overview" },
  { id: "top-picks", label: "Today's Top Picks", active: true },
  { id: "agreed", label: "Most Agreed Stocks" },
];

const strategies = [
  {
    category: "Value Investing",
    icon: "💎",
    items: [
      { name: "Greenblatt Magic Formula", active: false },
      { name: "O'Shaughnessy's Value Finder", active: false },
      { name: "Quantitative Value Edge", active: false },
      { name: "Strategic Trending Value", active: false },
    ],
  },
  {
    category: "Quality-Focused",
    icon: "⭐",
    items: [
      { name: "Quality Shareholder Yield", active: false },
      { name: "Dynamic F-Score Momentum", active: false },
      { name: "Smart Growth Score", active: false },
    ],
  },
  {
    category: "Momentum Investing",
    icon: "🚀",
    items: [
      { name: "Quantitative Momentum Plus", active: false },
      { name: "Trending Value Momentum", active: false },
    ],
  },
];

const topPicks = [
  { symbol: "", price: 169.03, sector: "Technology", entryDate: "2026-01-24", marketCap: "33.38B" },
  { symbol: "", price: 108.10, sector: "Healthcare", entryDate: "2026-01-24", marketCap: "49.12B" },
  { symbol: "", price: 102.23, sector: "Industrials", entryDate: "2026-01-24", marketCap: "12.6B" },
  { symbol: "", price: 27.10, sector: "Energy", entryDate: "2026-01-24", marketCap: "10.08B" },
  { symbol: "", price: 236.39, sector: "Financials", entryDate: "2026-01-24", marketCap: "81.03B" },
];

export default function AIStockPicker() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Value Investing");

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-semibold text-cyan-400">AI Stock Picker</h1>
        </motion.div>

        <div className="grid grid-cols-12 gap-8">
          {/* Left Sidebar - Dashboard & Strategies */}
          <div className="col-span-3">
            {/* Dashboard */}
            <Card className="p-4 bg-slate-900/60 border-slate-800 mb-4">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Dashboard</h3>
              <nav className="space-y-1">
                {dashboardItems.map((item) => (
                  <button
                    key={item.id}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                      item.active
                        ? "bg-cyan-500/10 text-cyan-400"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                    data-testid={`dashboard-${item.id}`}
                  >
                    {item.id === "top-picks" && <Star className="w-4 h-4" />}
                    {item.id === "overview" && <BarChart3 className="w-4 h-4" />}
                    {item.id === "agreed" && <TrendingUp className="w-4 h-4" />}
                    {item.label}
                  </button>
                ))}
              </nav>
            </Card>

            {/* AI Stock Picker Strategies */}
            <Card className="p-4 bg-slate-900/60 border-slate-800">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">AI Stock Picker</h3>
              <div className="space-y-2">
                {strategies.map((strategy) => (
                  <div key={strategy.category}>
                    <button
                      onClick={() => setExpandedCategory(
                        expandedCategory === strategy.category ? null : strategy.category
                      )}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800/50 transition-all"
                      data-testid={`strategy-${strategy.category.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{strategy.icon}</span>
                        <span>{strategy.category}</span>
                      </div>
                      {expandedCategory === strategy.category ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                    {expandedCategory === strategy.category && (
                      <div className="ml-6 mt-1 space-y-1">
                        {strategy.items.map((item) => (
                          <button
                            key={item.name}
                            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/30 rounded transition-all"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            {/* Top Picks Header */}
            <Card className="p-6 bg-slate-900/60 border-slate-800 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Star className="w-5 h-5 text-amber-400" />
                <h2 className="text-xl font-semibold text-slate-100">Today's Top Picks</h2>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Analyzing 9,000+ U.S. stocks daily and using Stock Rank, Technical Rating, and Kai Score, 
                Top AI Stock Picks evaluates hundreds of technical, fundamental, and sentiment indicators 
                to identify high-potential stocks. By ranking stocks using multiple AI Stock Pickers, 
                it helps you cut through market noise and pick the best stocks with confidence.
              </p>
            </Card>

            {/* Selection Criteria */}
            <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 mb-6">
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-cyan-400">Selection Criteria:</span> Results from 
                13 strategies across four categories: Value Investing, Quality-Focused, Momentum Investing, 
                and Balanced Multi-Factor. These outputs are ranked by Stock Rank, Technical Rating, 
                or Kai Score, and the top 100 highest ranked stocks are selected.
              </p>
            </Card>

            {/* New This Week Table */}
            <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-100">New This Week</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800 text-sm text-slate-400">
                      <th className="text-left p-4 font-medium">Symbol</th>
                      <th className="text-right p-4 font-medium">Price($)</th>
                      <th className="text-left p-4 font-medium">Sector</th>
                      <th className="text-left p-4 font-medium">Entry Date</th>
                      <th className="text-right p-4 font-medium">
                        Market Cap($)
                        <ChevronDown className="w-3 h-3 inline ml-1" />
                      </th>
                      <th className="text-center p-4 font-medium">AI Research</th>
                      <th className="text-center p-4 font-medium">Add To Watch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPicks.map((pick, i) => (
                      <tr 
                        key={i} 
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                        data-testid={`top-pick-${i}`}
                      >
                        <td className="p-4">
                          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-slate-500" />
                          </div>
                        </td>
                        <td className="p-4 text-right text-slate-200 font-mono">{pick.price.toFixed(2)}</td>
                        <td className="p-4">
                          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
                            <Briefcase className="w-4 h-4 text-slate-500" />
                          </div>
                        </td>
                        <td className="p-4 text-slate-400 text-sm">{pick.entryDate}</td>
                        <td className="p-4 text-right text-slate-200">{pick.marketCap}</td>
                        <td className="p-4 text-center">
                          <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </td>
                        <td className="p-4 text-center">
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 text-center border-t border-slate-800">
                <Button variant="ghost" className="text-cyan-400">
                  Show More
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Briefcase(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
