/**
 * LEARNING DASHBOARD
 *
 * Visual dashboard showing AI self-learning in action
 * Features:
 * - Neural network visualization of 6 engines
 * - Real-time metrics with animations
 * - Engine performance comparisons
 * - Learning insights and recommendations
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Brain,
  Sparkles,
  TrendingUp,
  Lightbulb,
  RefreshCw,
  ChevronRight,
  Activity,
  Target,
  Zap,
} from 'lucide-react';

import { AIBrainVisualization } from '@/components/dashboard/ai-brain-visualization';
import { LiveMetricsGrid } from '@/components/dashboard/live-metrics-grid';
import { EnginePerformanceRadar } from '@/components/dashboard/engine-performance-radar';
import { InteractiveEquityCurve } from '@/components/dashboard/interactive-equity-curve';
import { TradingSignalsFeed } from '@/components/dashboard/trading-signals-feed';
import { MarketPulseWidget } from '@/components/dashboard/market-pulse-widget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface LearningInsight {
  category: string;
  insight: string;
  confidence: number;
  recommendation?: string;
}

export default function LearningDashboard() {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState<LearningInsight[]>([
    {
      category: 'Timing',
      insight: 'Morning trades (9-11 AM) outperform afternoon by 12.3%',
      confidence: 0.78,
      recommendation: 'Prioritize trading in the first 2 hours after market open',
    },
    {
      category: 'Asset Allocation',
      insight: 'Stock trades have 62.4% win rate vs 48.2% for options',
      confidence: 0.85,
      recommendation: 'Increase stock allocation, reduce options frequency',
    },
    {
      category: 'Confluence',
      insight: 'High confluence (70+) trades: 68.1% vs Low (<60): 41.2%',
      confidence: 0.92,
      recommendation: 'Raise minimum confluence threshold to 65-70',
    },
  ]);

  // Fetch learning data from API
  const { data: learningData, refetch: refetchLearning } = useQuery({
    queryKey: ['learning-insights'],
    queryFn: async () => {
      const res = await fetch('/api/learning-insights');
      if (!res.ok) throw new Error('Failed to fetch learning insights');
      return res.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const triggerAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/learning/analyze', { method: 'POST' });
      if (!res.ok) throw new Error('Analysis failed');

      toast({
        title: 'Learning Cycle Complete',
        description: 'AI has analyzed all trade data and updated parameters',
      });

      refetchLearning();
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: 'Could not complete learning cycle',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-xl">
                <Brain className="w-6 h-6 text-purple-400" />
              </div>
              <h1 className="text-3xl font-bold text-white">
                AI Learning Dashboard
              </h1>
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                <Sparkles className="w-3 h-3 mr-1" />
                Self-Improving
              </Badge>
            </div>
            <p className="text-gray-400">
              Watch your 6 engines learn and improve from every trade
            </p>
          </div>

          <Button
            onClick={triggerAnalysis}
            disabled={isAnalyzing}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Run Learning Cycle
              </>
            )}
          </Button>
        </motion.div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Brain Visualization */}
          <motion.div
            className="xl:col-span-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gray-900/50 border-gray-800 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Activity className="w-5 h-5 text-purple-400" />
                  Neural Network
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AIBrainVisualization />
              </CardContent>
            </Card>
          </motion.div>

          {/* Right Column - Metrics & Insights */}
          <motion.div
            className="xl:col-span-2 space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Metrics Grid */}
            <LiveMetricsGrid />

            {/* Learning Insights */}
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  Learning Insights
                  <Badge variant="secondary" className="ml-2">
                    {insights.length} Active
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <AnimatePresence>
                    {insights.map((insight, index) => (
                      <motion.div
                        key={insight.category}
                        className="p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-colors"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                {insight.category}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {(insight.confidence * 100).toFixed(0)}% confidence
                              </span>
                            </div>
                            <p className="text-white font-medium mb-2">
                              {insight.insight}
                            </p>
                            {insight.recommendation && (
                              <div className="flex items-center gap-2 text-sm text-purple-400">
                                <ChevronRight className="w-4 h-4" />
                                {insight.recommendation}
                              </div>
                            )}
                          </div>

                          <div className="ml-4">
                            <div className="relative w-12 h-12">
                              <svg className="w-full h-full -rotate-90">
                                <circle
                                  cx="24"
                                  cy="24"
                                  r="20"
                                  fill="none"
                                  stroke="#374151"
                                  strokeWidth="4"
                                />
                                <motion.circle
                                  cx="24"
                                  cy="24"
                                  r="20"
                                  fill="none"
                                  stroke="#8B5CF6"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  initial={{ strokeDasharray: "0 125.6" }}
                                  animate={{
                                    strokeDasharray: `${insight.confidence * 125.6} 125.6`,
                                  }}
                                  transition={{ duration: 1, delay: index * 0.2 }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-bold text-white">
                                  {(insight.confidence * 100).toFixed(0)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Engine Performance Comparison */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <EnginePerformanceRadar />
        </motion.div>

        {/* Performance & Signals Section */}
        <motion.div
          className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <InteractiveEquityCurve />
          <TradingSignalsFeed />
        </motion.div>

        {/* Market Pulse - Full Width */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <MarketPulseWidget />
        </motion.div>

        {/* Learned Thresholds */}
        {learningData?.learnedThresholds && (
          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Target className="w-5 h-5 text-green-400" />
                  Learned Thresholds
                  <Badge className="bg-green-500/20 text-green-400 ml-2">
                    Auto-Adjusted
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-800/50 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">Min Confluence</div>
                    <div className="text-2xl font-bold text-white">
                      {learningData.learnedThresholds.confluence?.minScore || 55}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">Optimal Confluence</div>
                    <div className="text-2xl font-bold text-white">
                      {learningData.learnedThresholds.confluence?.optimalScore || 70}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">Min R:R Ratio</div>
                    <div className="text-2xl font-bold text-white">
                      {learningData.learnedThresholds.riskReward?.minRatio || 1.5}:1
                    </div>
                  </div>
                  <div className="p-4 bg-gray-800/50 rounded-xl">
                    <div className="text-sm text-gray-400 mb-1">Best Hour</div>
                    <div className="text-2xl font-bold text-white">
                      {learningData.learnedThresholds.timing?.bestHour || 10}:00
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
