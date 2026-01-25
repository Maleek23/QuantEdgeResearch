import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { AuroraBackground } from "@/components/aurora-background";
import {
  MessageSquare,
  FileText,
  Search,
  Clock,
  Eye,
  Trash2,
  BarChart3,
  TrendingUp,
  Target,
} from "lucide-react";

const mockChatHistory = [
  { id: 1, title: "NVDA Analysis Discussion", date: "Jan 25, 2026", messages: 12 },
  { id: 2, title: "Market Outlook Q1 2026", date: "Jan 24, 2026", messages: 8 },
  { id: 3, title: "TSLA Earnings Preview", date: "Jan 23, 2026", messages: 15 },
  { id: 4, title: "Crypto Market Analysis", date: "Jan 22, 2026", messages: 6 },
];

const mockResearchHistory = [
  { id: 1, symbol: "USAR", name: "USA Rare Earth Inc", type: "Swing Trade Analysis", date: "Jan 25, 2026", signal: "BUY" },
  { id: 2, symbol: "NVDA", name: "NVIDIA Corporation", type: "Technical Analysis", date: "Jan 24, 2026", signal: "HOLD" },
  { id: 3, symbol: "PLTR", name: "Palantir Technologies", type: "Buy or Sell", date: "Jan 23, 2026", signal: "BUY" },
  { id: 4, symbol: "TSLA", name: "Tesla Inc", type: "Fundamental Analysis", date: "Jan 22, 2026", signal: "HOLD" },
  { id: 5, symbol: "AMD", name: "Advanced Micro Devices", type: "News Sentiment", date: "Jan 21, 2026", signal: "BUY" },
];

export default function History() {
  const [location] = useLocation();
  const defaultTab = location.includes("/research") ? "research" : "chat";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "BUY": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "SELL": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "HOLD": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      default: return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen relative z-10 pb-20">
        <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <h1 className="text-2xl font-semibold text-slate-100">History</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search history..."
              className="pl-9 w-64 bg-slate-800/50 border-slate-700"
              data-testid="input-search-history"
            />
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-800/50 mb-6">
              <TabsTrigger 
                value="chat" 
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 gap-2"
                data-testid="tab-chat-history"
              >
                <MessageSquare className="w-4 h-4" />
                Chat History
              </TabsTrigger>
              <TabsTrigger 
                value="research" 
                className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 gap-2"
                data-testid="tab-research-history"
              >
                <FileText className="w-4 h-4" />
                Research History
              </TabsTrigger>
            </TabsList>

            {/* Chat History Tab */}
            <TabsContent value="chat">
              <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <p className="text-sm text-slate-400">Your previous AI chat conversations</p>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {mockChatHistory.map((chat) => (
                    <div 
                      key={chat.id}
                      className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between cursor-pointer"
                      data-testid={`chat-history-${chat.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                          <MessageSquare className="w-5 h-5 text-cyan-400" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{chat.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            {chat.date}
                            <span>•</span>
                            <span>{chat.messages} messages</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-cyan-400">
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {mockChatHistory.length === 0 && (
                  <div className="p-12 text-center">
                    <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No chat history yet</p>
                    <p className="text-sm text-slate-500 mt-1">Your AI conversations will appear here</p>
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Research History Tab */}
            <TabsContent value="research">
              <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
                <div className="p-4 border-b border-slate-800">
                  <p className="text-sm text-slate-400">Every analysis you've run, organized and ready to revisit</p>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {mockResearchHistory.map((research) => (
                    <div 
                      key={research.id}
                      className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between"
                      data-testid={`research-history-${research.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-cyan-400">{research.symbol}</span>
                            <span className="text-sm text-slate-400">{research.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                              <BarChart3 className="w-3 h-3 mr-1" />
                              {research.type}
                            </Badge>
                            <span className="text-xs text-slate-500">• {research.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={cn("text-xs", getSignalColor(research.signal))}>
                          {research.signal}
                        </Badge>
                        <Button variant="ghost" size="sm" className="text-cyan-400">
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {mockResearchHistory.length === 0 && (
                  <div className="p-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No research history yet</p>
                    <p className="text-sm text-slate-500 mt-1">Run an analysis to get started</p>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
    </>
  );
}
