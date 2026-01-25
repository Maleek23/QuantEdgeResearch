import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { AuroraBackground } from "@/components/aurora-background";
import {
  Users,
  TrendingUp,
  Building2,
  ChevronRight,
  ArrowRight,
  Search,
  BarChart3,
  Briefcase,
  Eye,
} from "lucide-react";

const insiderTrades = [
  { symbol: "NVDA", name: "Jensen Huang", type: "CEO", action: "Buy", shares: "100,000", value: "$18.7M", date: "Jan 20, 2026" },
  { symbol: "AAPL", name: "Tim Cook", type: "CEO", action: "Sell", shares: "50,000", value: "$12.4M", date: "Jan 19, 2026" },
  { symbol: "TSLA", name: "Elon Musk", type: "CEO", action: "Buy", shares: "200,000", value: "$89.8M", date: "Jan 18, 2026" },
  { symbol: "META", name: "Mark Zuckerberg", type: "CEO", action: "Sell", shares: "75,000", value: "$45.9M", date: "Jan 17, 2026" },
  { symbol: "MSFT", name: "Satya Nadella", type: "CEO", action: "Buy", shares: "25,000", value: "$10.8M", date: "Jan 16, 2026" },
];

const analystRatings = [
  { symbol: "PLTR", firm: "Goldman Sachs", rating: "Buy", target: "$95", change: "+15%", date: "Jan 20, 2026" },
  { symbol: "NVDA", firm: "Morgan Stanley", rating: "Overweight", target: "$220", change: "+18%", date: "Jan 19, 2026" },
  { symbol: "AMZN", firm: "JPMorgan", rating: "Buy", target: "$260", change: "+12%", date: "Jan 18, 2026" },
  { symbol: "GOOGL", firm: "Barclays", rating: "Hold", target: "$200", change: "+5%", date: "Jan 17, 2026" },
];

const insiderHotStocks = [
  { symbol: "IONQ", insiderBuys: 12, value: "$4.2M", sector: "Quantum Computing" },
  { symbol: "RKLB", insiderBuys: 8, value: "$2.8M", sector: "Space" },
  { symbol: "SOUN", insiderBuys: 6, value: "$1.9M", sector: "AI/ML" },
  { symbol: "SMR", insiderBuys: 5, value: "$3.1M", sector: "Nuclear" },
];

export default function SmartMoney() {
  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen relative z-10 pb-20">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-semibold text-slate-100 mb-3">Smart Money</h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Ever wonder what the pros are buying before stocks take off? Stop guessing and start
            following the money. See what insiders, Wall Street analysts, Congress members, and
            billionaire investors are actually buying—all in real time.
          </p>
        </motion.div>

        {/* Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-8 bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border-cyan-500/20 text-center mb-10">
            <div className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-3">
              10,000+
            </div>
            <p className="text-lg font-medium text-slate-200 mb-2">
              Insiders, Analysts & Billionaire Investors Tracked
            </p>
            <p className="text-sm text-slate-400">
              We watch them so you don't have to—see their moves in real time
            </p>
          </Card>
        </motion.div>

        {/* Action Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10"
        >
          <Card 
            className="p-6 bg-slate-900/60 border-slate-800 hover:border-cyan-500/30 transition-all cursor-pointer group"
            data-testid="card-analyst-ratings"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Analyst Stock Ratings</h3>
                  <p className="text-sm text-slate-400">Latest Wall Street calls</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </div>
          </Card>

          <Card 
            className="p-6 bg-slate-900/60 border-slate-800 hover:border-purple-500/30 transition-all cursor-pointer group"
            data-testid="card-insider-hot"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">Insider Hot Stocks</h3>
                  <p className="text-sm text-slate-400">Where insiders are buying</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-purple-400 transition-colors" />
            </div>
          </Card>
        </motion.div>

        {/* Recent Insider Trades Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-slate-100">Recent Insider Trades</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 text-sm text-slate-400">
                    <th className="text-left p-4 font-medium">Symbol</th>
                    <th className="text-left p-4 font-medium">Insider</th>
                    <th className="text-left p-4 font-medium">Type</th>
                    <th className="text-left p-4 font-medium">Action</th>
                    <th className="text-right p-4 font-medium">Shares</th>
                    <th className="text-right p-4 font-medium">Value</th>
                    <th className="text-right p-4 font-medium">Date</th>
                    <th className="text-center p-4 font-medium">Research</th>
                  </tr>
                </thead>
                <tbody>
                  {insiderTrades.map((trade, i) => (
                    <tr 
                      key={i} 
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      data-testid={`insider-trade-${i}`}
                    >
                      <td className="p-4">
                        <span className="font-semibold text-cyan-400">{trade.symbol}</span>
                      </td>
                      <td className="p-4 text-slate-200">{trade.name}</td>
                      <td className="p-4 text-slate-400 text-sm">{trade.type}</td>
                      <td className="p-4">
                        <Badge 
                          className={cn(
                            "text-xs",
                            trade.action === "Buy" 
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          )}
                        >
                          {trade.action}
                        </Badge>
                      </td>
                      <td className="p-4 text-right text-slate-200 font-mono">{trade.shares}</td>
                      <td className="p-4 text-right text-slate-200 font-mono">{trade.value}</td>
                      <td className="p-4 text-right text-slate-400 text-sm">{trade.date}</td>
                      <td className="p-4 text-center">
                        <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                          <Eye className="w-4 h-4 mr-1" />
                          Run Research
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 text-center border-t border-slate-800">
              <Button variant="ghost" className="text-cyan-400">
                View More <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Insider Hot Stocks Grid */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-8"
        >
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Insider Hot Stocks This Week</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {insiderHotStocks.map((stock, i) => (
              <Card 
                key={i}
                className="p-4 bg-slate-900/60 border-slate-800 hover:border-emerald-500/30 transition-all cursor-pointer"
                data-testid={`hot-stock-${stock.symbol}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-cyan-400">{stock.symbol}</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">
                    {stock.insiderBuys} buys
                  </Badge>
                </div>
                <div className="text-lg font-semibold text-slate-100 mb-1">{stock.value}</div>
                <div className="text-xs text-slate-400">{stock.sector}</div>
              </Card>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
    </>
  );
}
