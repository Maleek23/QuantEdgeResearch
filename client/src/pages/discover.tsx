import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { AuroraBackground } from "@/components/aurora-background";
import {
  TrendingUp,
  Star,
  Crown,
  BarChart3,
  Lightbulb,
  Coins,
  Bitcoin,
  Newspaper,
  ChevronRight,
  ArrowRight,
  Search,
  Sparkles,
  Clock,
  Eye,
} from "lucide-react";

const categories = [
  { id: "top", label: "Top", icon: TrendingUp },
  { id: "featured", label: "Featured", icon: Star },
  { id: "pro-only", label: "Pro Only", icon: Crown },
  { id: "stock-analysis", label: "Stock Analysis", icon: BarChart3 },
  { id: "investment-ideas", label: "Investment Ideas", icon: Lightbulb },
  { id: "etfs", label: "ETFs", icon: Coins },
  { id: "crypto", label: "Crypto", icon: Bitcoin },
  { id: "new-release", label: "New Release", icon: Newspaper },
];

const featuredArticles = [
  {
    id: "1",
    title: "Cathie Wood's Golden Age Thesis: What Investors Need to Know in 2026",
    date: "Jan 20, 2026",
    category: "Investment Ideas",
    image: "stock-market",
    featured: true,
  },
];

const sidebarArticles = [
  { title: "Walmart Joins Nasdaq-100 in 2026: What Investors Need to Know", date: "Jan 18, 2026" },
  { title: "Apple and Google AI Partnership 2026: Everything You Need to Know About Gemini-P...", date: "Jan 14, 2026" },
  { title: "Memory Stocks Crushed AI Chip Stocks in 2025: Why the Supercycle Is Just Getting...", date: "Jan 08, 2026" },
  { title: "Warren Buffett Steps Down: What Investors Need to Know About Berkshire Hathaway'...", date: "Jan 05, 2026" },
  { title: "From Launch to Liftoff: 12 Months of AI Agents for Everyday Investors and Trader...", date: "Dec 30, 2025" },
];

const breakingNews = [
  { title: "Top 5 Waste Management & Landfill", source: "Stock News", time: "53 minutes ago" },
  { title: "Procter & Gamble Confirms a Bottom", source: "Stock News", time: "57 minutes ago" },
  { title: "AI Chip Demand Surges in Q1 2026", source: "Stock News", time: "1 hour ago" },
  { title: "Fed Signals Rate Cut Possibility", source: "Stock News", time: "2 hours ago" },
];

export default function Discover() {
  const [activeCategory, setActiveCategory] = useState("top");
  const [activeTab, setActiveTab] = useState("market-lens");

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen relative z-10 pb-20">
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-slate-100">Discover</h1>
          <div className="flex gap-2">
            <Button
              variant={activeTab === "market-lens" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("market-lens")}
              className={cn(
                activeTab === "market-lens" 
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" 
                  : "border-slate-700 text-slate-400"
              )}
              data-testid="tab-market-lens"
            >
              <Star className="w-4 h-4 mr-2" />
              Market Lens
            </Button>
            <Button
              variant={activeTab === "breaking-news" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("breaking-news")}
              className={cn(
                activeTab === "breaking-news" 
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" 
                  : "border-slate-700 text-slate-400"
              )}
              data-testid="tab-breaking-news"
            >
              <Newspaper className="w-4 h-4 mr-2" />
              Breaking News
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Left Sidebar - Categories */}
          <div className="col-span-2">
            <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20">
              <div className="mb-4 pb-3 border-b border-cyan-500/20">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Categories
                </h3>
              </div>
              <nav className="space-y-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                      activeCategory === cat.id
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "text-slate-400 hover:text-slate-200 hover:bg-cyan-500/10 border border-transparent"
                    )}
                    data-testid={`category-${cat.id}`}
                  >
                    <cat.icon className="w-4 h-4" />
                    {cat.label}
                  </button>
                ))}
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <div className="col-span-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">Featured Articles</h2>
              <Button variant="ghost" className="text-cyan-400 text-sm p-0 h-auto" data-testid="link-view-more">
                View More <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            {/* Featured Article Card */}
            {featuredArticles.map((article) => (
              <Card
                key={article.id}
                className="overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-xl"
                data-testid={`article-${article.id}`}
              >
                <div className="aspect-[16/9] bg-gradient-to-br from-cyan-900/20 via-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1),transparent_50%)]" />
                  <div className="text-center relative z-10">
                    <div className="text-4xl font-bold text-slate-600 mb-2 group-hover:text-slate-500 transition-colors">STOCK MARKET</div>
                    <div className="text-lg text-slate-500 group-hover:text-cyan-500/50 transition-colors">BULL VS BEAR</div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                  <Badge className="absolute top-4 right-4 bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                    <Star className="w-3 h-3 mr-1" />
                    Featured
                  </Badge>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-cyan-400 transition-colors leading-tight">
                    {article.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.date}
                      </div>
                      <Badge variant="outline" className="text-xs border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                        {article.category}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Read <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {/* Breaking News Section */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-100">Breaking News For You</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {breakingNews.map((news, i) => (
                  <Card
                    key={i}
                    className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group"
                    data-testid={`news-${i}`}
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                      <Newspaper className="w-3 h-3 text-cyan-500/70" />
                      <span>{news.source}</span>
                      <span>•</span>
                      <span>{news.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors">{news.title}</p>
                    <div className="mt-2 flex items-center text-xs text-cyan-500/70 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="w-3 h-3 mr-1" />
                      Read more
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar - More Articles */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-400">Latest</span>
              <Button variant="ghost" className="text-cyan-400 text-sm p-0 h-auto">
                View More <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <div className="space-y-3">
              {sidebarArticles.map((article, i) => (
                <Card
                  key={i}
                  className="flex gap-3 cursor-pointer group p-3 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all"
                  data-testid={`sidebar-article-${i}`}
                >
                  <div className="w-20 h-14 rounded-lg bg-gradient-to-br from-cyan-900/20 via-slate-800 to-slate-900 flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.15),transparent)]" />
                    <Newspaper className="w-6 h-6 text-slate-600 relative z-10" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors mb-1">
                      {article.title}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {article.date}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
