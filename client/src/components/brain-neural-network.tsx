import { lazy, Suspense, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { WebGLErrorBoundary } from './webgl-error-boundary';

// Lazy load the 3D brain scene to avoid Vite plugin issues
const BrainScene = lazy(() => 
  import('@/components/brain-scene').then(m => ({ default: m.BrainScene }))
);

interface SignalPerformance {
  signalName: string;
  grade: string;
  winRate: number;
  avgGain: number;
  tradeCount: number;
  reliability: number;
}

interface BrainNeuralNetworkProps {
  signals: SignalPerformance[];
}

// WebGL Detection Hook
function useWebGLSupport() {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setSupported(!!gl);
    } catch (e) {
      setSupported(false);
    }
  }, []);

  return supported;
}

export function BrainNeuralNetwork({ signals }: BrainNeuralNetworkProps) {
  const webglSupported = useWebGLSupport();

  const avgWinRate = signals.reduce((sum, s) => sum + s.winRate, 0) / signals.length / 100;
  const topPerformer = [...signals].sort((a, b) => b.winRate - a.winRate)[0];
  const bottomPerformer = [...signals].sort((a, b) => a.winRate - b.winRate)[0];

  // WebGL not supported - show fallback
  if (webglSupported === false) {
    return (
      <Card className="bg-gradient-to-br from-background via-primary/5 to-background border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">ML Learning Network</CardTitle>
              <CardDescription className="mt-1">
                Neural network visualization of signal performance and learning patterns
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="border-amber-500/50 bg-amber-500/10 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <AlertDescription className="text-muted-foreground">
              WebGL is not available in your browser. Showing performance metrics in 2D mode.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg bg-card/50 border border-border/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">Avg Win Rate</div>
              <div className="text-xl font-bold text-green-400">{(avgWinRate * 100).toFixed(1)}%</div>
            </div>
            <div className="rounded-lg bg-card/50 border border-border/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">Top Signal</div>
              <div className="text-sm font-semibold text-cyan-400 truncate">{topPerformer?.signalName.split(' ')[0]}</div>
              <div className="text-xs text-muted-foreground">{topPerformer?.winRate.toFixed(0)}% wins</div>
            </div>
            <div className="rounded-lg bg-card/50 border border-border/50 p-3">
              <div className="text-xs text-muted-foreground mb-1">Improving</div>
              <div className="text-sm font-semibold text-amber-400 truncate">{bottomPerformer?.signalName.split(' ')[0]}</div>
              <div className="text-xs text-muted-foreground">{bottomPerformer?.winRate.toFixed(0)}% wins</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals.map((signal, i) => (
              <Card key={i} className="bg-card/30 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{signal.signalName}</CardTitle>
                    <Badge variant="outline">{signal.grade}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Win Rate:</span>
                    <span className="text-green-400 font-medium">{signal.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg Gain:</span>
                    <span className="text-blue-400 font-medium">{signal.avgGain > 0 ? '+' : ''}{signal.avgGain.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trades:</span>
                    <span className="text-purple-400 font-medium">{signal.tradeCount}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // WebGL checking
  if (webglSupported === null) {
    return (
      <Card className="bg-gradient-to-br from-background via-primary/5 to-background border-primary/20">
        <CardContent className="p-12">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Initializing neural network...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // WebGL supported - show 3D visualization
  return (
    <Card className="bg-gradient-to-br from-background via-primary/5 to-background border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">ML Learning Network</CardTitle>
            <CardDescription className="mt-1">
              Neural network visualization of signal performance and learning patterns
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg bg-card/50 border border-border/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Avg Win Rate</div>
            <div className="text-xl font-bold text-green-400">{(avgWinRate * 100).toFixed(1)}%</div>
          </div>
          <div className="rounded-lg bg-card/50 border border-border/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Top Signal</div>
            <div className="text-sm font-semibold text-cyan-400 truncate">{topPerformer?.signalName.split(' ')[0]}</div>
            <div className="text-xs text-muted-foreground">{topPerformer?.winRate.toFixed(0)}% wins</div>
          </div>
          <div className="rounded-lg bg-card/50 border border-border/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">Improving</div>
            <div className="text-sm font-semibold text-amber-400 truncate">{bottomPerformer?.signalName.split(' ')[0]}</div>
            <div className="text-xs text-muted-foreground">{bottomPerformer?.winRate.toFixed(0)}% wins</div>
          </div>
        </div>

        {/* 3D Visualization */}
        <div className="relative w-full h-[600px] rounded-lg overflow-hidden border border-primary/20 bg-black">
          <WebGLErrorBoundary fallback={
            <div className="h-full flex items-center justify-center">
              <Alert className="border-red-500/50 bg-red-500/10 max-w-md">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <AlertDescription className="text-muted-foreground">
                  WebGL rendering failed. Please refresh the page or try a different browser.
                </AlertDescription>
              </Alert>
            </div>
          }>
            <Suspense fallback={
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Loading 3D neural network...</p>
                </div>
              </div>
            }>
              <BrainScene signals={signals} />
            </Suspense>
          </WebGLErrorBoundary>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
          <span className="text-muted-foreground">Signal Grades:</span>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">60%+ Win Rate</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-muted-foreground">50-60%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-xs text-muted-foreground">40-50%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-xs text-muted-foreground">&lt;40%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
