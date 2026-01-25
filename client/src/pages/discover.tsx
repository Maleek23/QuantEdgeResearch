import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
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
    <div className="min-h-screen">
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
            <Card className="p-4 bg-slate-900/60 border-slate-800">
              <nav className="space-y-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                      activeCategory === cat.id
                        ? "bg-cyan-500/10 text-cyan-400"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
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
                className="overflow-hidden bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all cursor-pointer group"
                data-testid={`article-${article.id}`}
              >
                <div className="aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center relative">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-slate-600 mb-2">STOCK MARKET</div>
                    <div className="text-lg text-slate-500">BULL VS BEAR</div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-slate-100 mb-2 group-hover:text-cyan-400 transition-colors">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <span>{article.date}</span>
                    <Badge variant="outline" className="text-xs border-slate-700">
                      {article.category}
                    </Badge>
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
                    className="p-4 bg-slate-900/60 border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                    data-testid={`news-${i}`}
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                      <span>{news.source}</span>
                      <span>•</span>
                      <span>{news.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 line-clamp-2">{news.title}</p>
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
            <div className="space-y-4">
              {sidebarArticles.map((article, i) => (
                <div 
                  key={i}
                  className="flex gap-3 cursor-pointer group"
                  data-testid={`sidebar-article-${i}`}
                >
                  <div className="w-20 h-14 rounded-lg bg-gradient-to-br from-slate-800 to-slate-700 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors">
                      {article.title}
                    </p>
                    <span className="text-xs text-slate-500 mt-1">{article.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
