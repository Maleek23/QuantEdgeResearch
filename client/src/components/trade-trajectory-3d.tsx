import { useRef, useMemo, useState, useEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { useQuery } from "@tanstack/react-query";
import type { TradeIdea } from "@shared/schema";
import * as THREE from "three";
import { AlertCircle } from "lucide-react";

// Error Boundary to catch React Three Fiber crashes
class Canvas3DErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('3D Canvas Error:', error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface TradePoint {
  id: string;
  symbol: string;
  entry: number;
  current: number;
  target: number;
  status: 'winner' | 'loser' | 'active';
  percentGain: number;
  source: string;
}

function TradeParticle({ trade }: { trade: TradePoint }) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate active trades with gentle pulsing
  useFrame((state) => {
    if (meshRef.current && trade.status === 'active') {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.setScalar(scale);
    }
  });

  // Map entry price to X, current price to Y, target to Z
  const position: [number, number, number] = [
    (trade.entry - 100) / 50, // Normalize around 0
    (trade.current - 100) / 50,
    (trade.target - 100) / 50,
  ];

  // Color based on status
  const color = trade.status === 'winner' ? '#10b981' : 
                trade.status === 'loser' ? '#ef4444' : 
                '#3b82f6';

  return (
    <group>
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color}
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
        />
      </mesh>
      
      {/* Trade label on hover */}
      <Html position={position} style={{ pointerEvents: 'none' }}>
        <div className="bg-background/95 border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
          <div className="font-semibold">{trade.symbol}</div>
          <div className="text-muted-foreground">
            {trade.status === 'active' ? 'Active' : `${trade.percentGain > 0 ? '+' : ''}${trade.percentGain.toFixed(1)}%`}
          </div>
        </div>
      </Html>
    </group>
  );
}

function TradeTrajectoryLine({ trade }: { trade: TradePoint }) {
  const points = useMemo(() => {
    return [
      new THREE.Vector3((trade.entry - 100) / 50, (trade.current - 100) / 50, (trade.target - 100) / 50),
      new THREE.Vector3((trade.current - 100) / 50, (trade.current - 100) / 50, (trade.current - 100) / 50),
      new THREE.Vector3((trade.target - 100) / 50, (trade.target - 100) / 50, (trade.target - 100) / 50),
    ];
  }, [trade]);

  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return geometry;
  }, [points]);

  const color = trade.status === 'winner' ? '#10b981' : 
                trade.status === 'loser' ? '#ef4444' : 
                '#3b82f6';

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color={color} opacity={0.3} transparent linewidth={1} />
    </line>
  );
}

function Scene({ trades }: { trades: TradePoint[] }) {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle rotation
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.001;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Ambient lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />

      {/* Grid helper for reference */}
      <gridHelper args={[10, 10]} rotation={[0, 0, 0]} />

      {/* Render all trades */}
      {trades.map((trade) => (
        <TradeParticle key={trade.id} trade={trade} />
      ))}

      {/* Orbit controls for user interaction */}
      <OrbitControls 
        enableZoom={true}
        enablePan={true}
        enableRotate={true}
        autoRotate={false}
        maxDistance={20}
        minDistance={5}
      />
    </group>
  );
}

export function TradeTrajectory3D() {
  const { data: allIdeas, isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  const [webglSupported, setWebglSupported] = useState(true);
  const [canvasError, setCanvasError] = useState(false);

  // Check WebGL support on mount
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebglSupported(false);
      }
    } catch (e) {
      setWebglSupported(false);
    }
  }, []);

  // Transform trade ideas into 3D points
  const trades: TradePoint[] = useMemo(() => {
    if (!allIdeas) return [];

    return allIdeas
      .filter(idea => idea.outcomeStatus !== 'open' && idea.exitPrice) // Only closed trades with exit prices
      .slice(0, 50) // Limit to 50 for performance
      .map(idea => {
        const current = idea.exitPrice || idea.entryPrice;
        const percentGain = idea.percentGain || 0;
        const status: 'winner' | 'loser' | 'active' = 
          idea.outcomeStatus === 'hit_target' ? 'winner' :
          idea.outcomeStatus === 'hit_stop' ? 'loser' :
          'active';

        return {
          id: idea.id,
          symbol: idea.symbol,
          entry: idea.entryPrice,
          current: current,
          target: idea.targetPrice,
          status,
          percentGain,
          source: idea.source || 'unknown',
        };
      });
  }, [allIdeas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // WebGL not supported fallback
  if (!webglSupported || canvasError) {
    return (
      <div className="space-y-4" data-testid="trade-trajectory-3d">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-1">3D Trade Trajectory</h3>
          <p className="text-sm text-muted-foreground">
            Interactive visualization of {trades.length} validated trades
          </p>
        </div>

        <div className="h-96 bg-muted/20 rounded-lg border border-border overflow-hidden flex items-center justify-center">
          <div className="text-center p-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              3D visualization requires WebGL support
            </p>
            <p className="text-xs text-muted-foreground">
              Your browser or environment doesn't support WebGL. Please try a modern browser with hardware acceleration enabled.
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Winners: {trades.filter(t => t.status === 'winner').length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Losers: {trades.filter(t => t.status === 'loser').length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Active: {trades.filter(t => t.status === 'active').length}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="trade-trajectory-3d">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">3D Trade Trajectory</h3>
        <p className="text-sm text-muted-foreground">
          Interactive visualization of {trades.length} validated trades
        </p>
      </div>

      {/* 3D Canvas with error boundary */}
      <div className="h-96 bg-muted/20 rounded-lg border border-border overflow-hidden">
        <Canvas3DErrorBoundary onError={() => setCanvasError(true)}>
          <Canvas 
            camera={{ position: [8, 8, 8], fov: 50 }}
            onCreated={({ gl }) => {
              console.log('WebGL context created successfully');
            }}
          >
            <Scene trades={trades} />
          </Canvas>
        </Canvas3DErrorBoundary>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Winners</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Losers</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Active</span>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-xs text-muted-foreground">
        Drag to rotate • Scroll to zoom • Each sphere represents a trade journey
      </p>
    </div>
  );
}
