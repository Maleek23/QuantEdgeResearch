import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Sphere, Html } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import { Suspense, useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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

// Central QuantEdge Core Sphere
function QuantEdgeCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
      // Pulsing effect
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <Sphere ref={meshRef} args={[1.5, 64, 64]} position={[0, 0, 0]}>
      <meshStandardMaterial
        color="#3b82f6"
        emissive="#3b82f6"
        emissiveIntensity={0.5}
        wireframe={true}
        transparent
        opacity={0.7}
      />
    </Sphere>
  );
}

// Orbiting Metric Display
function OrbitingMetric({ 
  label, 
  value, 
  angle, 
  radius = 5,
  color = "#22c55e" 
}: { 
  label: string; 
  value: string; 
  angle: number;
  radius?: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.elapsedTime * 0.3 + angle;
      groupRef.current.position.x = Math.cos(t) * radius;
      groupRef.current.position.z = Math.sin(t) * radius;
      groupRef.current.position.y = Math.sin(t * 2) * 0.5;
      groupRef.current.lookAt(0, 0, 0);
    }
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        distanceFactor={10}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div className="bg-background/90 backdrop-blur-sm border border-primary/30 rounded-lg px-4 py-2 shadow-lg">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color }}>
            {value}
          </div>
        </div>
      </Html>
    </group>
  );
}

// Matrix-style Digital Rain
function MatrixRain({ tradeIdeas }: { tradeIdeas: any[] }) {
  const symbols = useMemo(() => {
    return tradeIdeas.slice(0, 20).map((idea, i) => ({
      symbol: idea.symbol,
      price: idea.entryPrice,
      x: (Math.random() - 0.5) * 30,
      z: (Math.random() - 0.5) * 30,
      speed: 0.5 + Math.random() * 1,
      offset: Math.random() * 10,
    }));
  }, [tradeIdeas]);

  return (
    <>
      {symbols.map((item, i) => (
        <FallingSymbol
          key={i}
          symbol={item.symbol}
          price={item.price}
          x={item.x}
          z={item.z}
          speed={item.speed}
          offset={item.offset}
        />
      ))}
    </>
  );
}

function FallingSymbol({ 
  symbol, 
  price, 
  x, 
  z, 
  speed, 
  offset 
}: { 
  symbol: string; 
  price: number; 
  x: number; 
  z: number; 
  speed: number;
  offset: number;
}) {
  const textRef = useRef<any>(null);
  
  useFrame((state) => {
    if (textRef.current) {
      const y = 10 - ((state.clock.elapsedTime * speed + offset) % 20);
      textRef.current.position.y = y;
    }
  });

  return (
    <Text
      ref={textRef}
      position={[x, 10, z]}
      fontSize={0.5}
      color="#22c55e"
      anchorX="center"
      anchorY="middle"
      font="/fonts/JetBrainsMono-Regular.ttf"
    >
      {symbol}\n${price.toFixed(2)}
    </Text>
  );
}

// Deep Space Background with Stars
function DeepSpaceBackground() {
  return (
    <>
      {/* Ambient stars */}
      <Stars
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />
      
      {/* Colored nebula-like particles */}
      <Stars
        radius={80}
        depth={40}
        count={1000}
        factor={3}
        saturation={0.5}
        fade
        speed={0.5}
      />
    </>
  );
}

// Main 3D Scene
function HolographicScene({ stats, tradeIdeas }: { stats: any; tradeIdeas: any[] }) {
  const metrics = [
    { label: 'Win Rate', value: `${stats?.overall?.winRate?.toFixed(1) || '0'}%`, angle: 0, color: '#22c55e' },
    { label: 'Quant Accuracy', value: `${stats?.overall?.quantAccuracy?.toFixed(1) || '0'}%`, angle: Math.PI / 2, color: '#3b82f6' },
    { label: 'Total Trades', value: `${stats?.overall?.totalIdeas || '0'}`, angle: Math.PI, color: '#f59e0b' },
    { label: 'Active Ideas', value: `${stats?.overall?.openIdeas || '0'}`, angle: (3 * Math.PI) / 2, color: '#a855f7' },
    { label: 'Winners', value: `${stats?.overall?.wonIdeas || '0'}`, angle: Math.PI / 4, color: '#10b981', radius: 7 },
    { label: 'Losers', value: `${stats?.overall?.lostIdeas || '0'}`, angle: (5 * Math.PI) / 4, color: '#ef4444', radius: 7 },
  ];

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#3b82f6" />
      
      {/* Background */}
      <DeepSpaceBackground />
      
      {/* Central Core */}
      <QuantEdgeCore />
      
      {/* Orbiting Metrics */}
      {metrics.map((metric, i) => (
        <OrbitingMetric
          key={i}
          label={metric.label}
          value={metric.value}
          angle={metric.angle}
          radius={metric.radius}
          color={metric.color}
        />
      ))}
      
      {/* Matrix Rain */}
      {tradeIdeas.length > 0 && <MatrixRain tradeIdeas={tradeIdeas} />}
      
      {/* Camera Controls */}
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={50}
      />
    </>
  );
}

// Loading Fallback
function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-primary">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Initializing Holographic Display...</p>
      </div>
    </Html>
  );
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

        <Card className="bg-background/80 backdrop-blur-sm border-primary/30">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              Performance Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Win Rate</p>
                <p className="text-3xl font-bold text-green-500">
                  {stats?.overall?.winRate?.toFixed(1) || '0'}%
                </p>
              </div>
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Quant Accuracy</p>
                <p className="text-3xl font-bold text-blue-500">
                  {stats?.overall?.quantAccuracy?.toFixed(1) || '0'}%
                </p>
              </div>
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Total Trades</p>
                <p className="text-3xl font-bold text-amber-500">
                  {stats?.overall?.totalIdeas || '0'}
                </p>
              </div>
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Active Ideas</p>
                <p className="text-3xl font-bold text-purple-500">
                  {stats?.overall?.openIdeas || '0'}
                </p>
              </div>
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Winners</p>
                <p className="text-3xl font-bold text-green-500">
                  {stats?.overall?.wonIdeas || '0'}
                </p>
              </div>
              <div className="bg-card/50 rounded-lg p-4 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase mb-1">Losers</p>
                <p className="text-3xl font-bold text-red-500">
                  {stats?.overall?.lostIdeas || '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground text-center">
          To view the full 3D holographic visualization, please use a modern browser with WebGL support.
        </p>
      </div>
    </div>
  );
}

// Main Page Component
export default function HolographicView() {
  const { data: stats } = usePerformanceStats();
  const { data: tradeIdeas } = useTradeIdeas();
  const webglSupported = useWebGLSupport();

  // Show fallback if WebGL is not supported
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

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 5, 15], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <HolographicScene 
            stats={stats} 
            tradeIdeas={Array.isArray(tradeIdeas) ? tradeIdeas : []} 
          />
        </Suspense>
      </Canvas>

      {/* Instructions Overlay */}
      <div className="absolute bottom-6 left-6 z-10">
        <Card className="bg-background/80 backdrop-blur-sm border-primary/30">
          <div className="p-3 text-xs text-muted-foreground">
            <p>🖱️ Click + Drag to rotate • Scroll to zoom • Right-click to pan</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
