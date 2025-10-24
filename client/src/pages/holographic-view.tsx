import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Canvas } from '@react-three/fiber';

// Lazy load the 3D scene to avoid Vite plugin issues
const HolographicScene = lazy(() => 
  import('@/components/holographic-scene').then(m => ({ default: m.HolographicScene }))
);

// Fetch performance stats
function usePerformanceStats() {
  return useQuery({
    queryKey: ['/api/performance/stats'],
  });
}

// Fetch trade ideas
function useTradeIdeas() {
  return useQuery({
    queryKey: ['/api/trade-ideas'],
  });
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

// WebGL Fallback Component
function WebGLFallback({ stats }: { stats: any }) {
  const overall = stats?.overall ?? {};
  const winRate = overall.winRate ?? 0;
  const totalTrades = overall.totalIdeas ?? 0;
  const profitFactor = overall.profitFactor ?? 0;
  const sharpeRatio = overall.sharpeRatio ?? 0;
  const maxDrawdown = overall.maxDrawdown ?? 0;
  const evScore = overall.evScore ?? 0;

  return (
    <div className="h-screen w-full bg-gradient-to-b from-black via-blue-950/20 to-black flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <AlertTitle className="text-amber-500">WebGL Not Available</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Your browser or environment doesn't support WebGL, which is required for 3D visualization.
            Showing performance metrics in 2D mode instead.
          </AlertDescription>
        </Alert>

        <Card className="bg-background/80 backdrop-blur-sm border-primary/30 p-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent mb-6">
            Performance Metrics
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
              <div className="text-2xl font-bold text-green-400">{winRate.toFixed(1)}%</div>
            </div>
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">Total Trades</div>
              <div className="text-2xl font-bold text-blue-400">{totalTrades}</div>
            </div>
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">Profit Factor</div>
              <div className="text-2xl font-bold text-amber-400">{profitFactor.toFixed(2)}</div>
            </div>
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">Sharpe Ratio</div>
              <div className="text-2xl font-bold text-purple-400">{sharpeRatio.toFixed(2)}</div>
            </div>
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">Max Drawdown</div>
              <div className="text-2xl font-bold text-red-400">{Math.abs(maxDrawdown).toFixed(1)}%</div>
            </div>
            <div className="bg-card/50 rounded-lg p-4 border border-border/50">
              <div className="text-sm text-muted-foreground mb-1">EV Score</div>
              <div className="text-2xl font-bold text-cyan-400">{evScore.toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Main Component
export default function HolographicView() {
  const { data: statsData, isLoading: statsLoading } = usePerformanceStats();
  const { data: tradeIdeasData, isLoading: ideasLoading } = useTradeIdeas();
  const webglSupported = useWebGLSupport();

  const stats = statsData;
  const tradeIdeas = Array.isArray(tradeIdeasData) ? tradeIdeasData : [];

  // Show loading state
  if (statsLoading || ideasLoading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-primary">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading holographic data...</p>
        </div>
      </div>
    );
  }

  // Show fallback if WebGL not supported
  if (webglSupported === false) {
    return <WebGLFallback stats={stats} />;
  }

  // Show loading while checking WebGL support
  if (webglSupported === null) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-primary">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-black relative" data-testid="holographic-view-canvas">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6">
        <Card className="bg-background/80 backdrop-blur-sm border-primary/30">
          <div className="p-4">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              Holographic Trading Floor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time 3D visualization of market data and performance metrics
            </p>
          </div>
        </Card>
      </div>

      {/* 3D Canvas with Lazy-Loaded Scene */}
      <Suspense fallback={
        <div className="h-screen w-full bg-black flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading 3D environment...</p>
          </div>
        </div>
      }>
        <HolographicScene stats={stats as any} tradeIdeas={tradeIdeas} />
      </Suspense>

      {/* Instructions Overlay */}
      <div className="absolute bottom-6 left-6 z-10">
        <Card className="bg-background/80 backdrop-blur-sm border-primary/30">
          <div className="p-3 text-xs text-muted-foreground">
            <p>Click + Drag to rotate • Scroll to zoom • Right-click to pan</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
