/**
 * High-Conviction Alert System
 * Shows popup notifications when very high confidence trade ideas appear
 * Works across the entire app, not just on Trade Desk
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  X,
  Zap,
  Target,
  Clock,
  ChevronRight,
  Volume2,
} from "lucide-react";
import type { TradeIdea } from "@shared/schema";

interface HighConvictionAlertProps {
  enabled?: boolean;
  minConfidence?: number; // Minimum confidence to trigger alert (default 85)
  soundEnabled?: boolean;
}

export function HighConvictionAlertProvider({
  enabled = true,
  minConfidence = 85,
  soundEnabled = true,
}: HighConvictionAlertProps) {
  const [, setLocation] = useLocation();
  const [alerts, setAlerts] = useState<TradeIdea[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const lastCheckRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll for new high-conviction ideas every 30 seconds
  const { data: ideas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', 'alerts'],
    queryFn: async () => {
      const res = await fetch('/api/trade-ideas/best-setups?period=daily&limit=20');
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    enabled,
    refetchInterval: 30000, // Check every 30 seconds
    staleTime: 20000,
  });

  // Check for new high-conviction ideas
  useEffect(() => {
    if (!ideas || !enabled) return;

    // Filter for very high conviction (85%+) ideas
    const highConviction = ideas.filter(idea => {
      const confidence = idea.confidenceScore || 0;
      const grade = idea.probabilityBand || '';
      const isHighGrade = ['A+', 'A', 'A-'].includes(grade);
      return confidence >= minConfidence || isHighGrade;
    });

    // Find truly new alerts (not seen before)
    const newAlerts = highConviction.filter(idea => {
      const ideaKey = `${idea.id}-${idea.timestamp}`;
      if (dismissedIds.has(idea.id || '')) return false;
      if (lastCheckRef.current && idea.timestamp &&
          new Date(idea.timestamp) <= new Date(lastCheckRef.current)) return false;
      return true;
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => {
        // Add new alerts, keeping max 3 visible
        const combined = [...newAlerts, ...prev];
        const unique = combined.filter((idea, idx) =>
          combined.findIndex(i => i.id === idea.id) === idx
        );
        return unique.slice(0, 3);
      });

      // Play alert sound
      if (soundEnabled && !isMuted && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }

    // Update last check time
    if (ideas.length > 0 && ideas[0].timestamp) {
      lastCheckRef.current = ideas[0].timestamp;
    }
  }, [ideas, enabled, minConfidence, soundEnabled, isMuted, dismissedIds]);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    setDismissedIds(prev => new Set([...Array.from(prev), id]));
  };

  const goToTradeDesk = (idea: TradeIdea) => {
    dismissAlert(idea.id || '');
    setLocation('/trade-desk');
  };

  if (!enabled || alerts.length === 0) return null;

  return (
    <>
      {/* Hidden audio element for alert sound */}
      <audio ref={audioRef} preload="auto">
        <source src="/alert.mp3" type="audio/mpeg" />
      </audio>

      {/* Alert Stack - Fixed position in bottom right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
        {alerts.map((idea, idx) => (
          <Card
            key={idea.id || idx}
            className={cn(
              "p-4 border-2 shadow-2xl animate-in slide-in-from-right-5 duration-300",
              "bg-gradient-to-br from-amber-500/10 via-black to-amber-900/10",
              "border-amber-500/50"
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/20">
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                      High Conviction Alert
                    </span>
                    {idea.probabilityBand && (
                      <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        {idea.probabilityBand}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {idea.confidenceScore}% confidence
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-slate-500 hover:text-white"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  <Volume2 className={cn("w-3 h-3", isMuted && "opacity-30")} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-slate-500 hover:text-white"
                  onClick={() => dismissAlert(idea.id || '')}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Symbol & Direction */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl font-bold text-white font-mono">
                {idea.symbol}
              </span>
              <Badge
                className={cn(
                  "text-xs font-bold",
                  idea.direction?.toLowerCase() === 'long' || idea.direction === 'bullish'
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                )}
              >
                {idea.direction?.toLowerCase() === 'long' || idea.direction === 'bullish' ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {idea.direction?.toUpperCase() || 'LONG'}
              </Badge>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <div className="p-2 rounded bg-slate-800/50">
                <div className="text-[10px] text-slate-500">Entry</div>
                <div className="text-sm font-mono text-white">
                  ${safeToFixed(idea.entryPrice, 2, '—')}
                </div>
              </div>
              <div className="p-2 rounded bg-emerald-500/10">
                <div className="text-[10px] text-slate-500">Target</div>
                <div className="text-sm font-mono text-emerald-400">
                  ${safeToFixed(idea.targetPrice, 2, '—')}
                </div>
              </div>
              <div className="p-2 rounded bg-red-500/10">
                <div className="text-[10px] text-slate-500">Stop</div>
                <div className="text-sm font-mono text-red-400">
                  ${safeToFixed(idea.stopLoss, 2, '—')}
                </div>
              </div>
            </div>

            {/* Catalyst/Analysis Preview */}
            {idea.catalyst && (
              <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                {idea.catalyst}
              </p>
            )}

            {/* Action Button */}
            <Button
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium"
              onClick={() => goToTradeDesk(idea)}
            >
              View in Trade Desk
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Card>
        ))}
      </div>
    </>
  );
}
