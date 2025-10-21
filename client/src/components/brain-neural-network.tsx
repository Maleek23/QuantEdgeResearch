import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html } from '@react-three/drei';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain } from "lucide-react";
import * as THREE from 'three';

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

// Signal positions in 3D brain-like arrangement
const getBrainPosition = (index: number, total: number): [number, number, number] => {
  // Create a brain-like structure with signals distributed in layers
  const layers = [
    // Input layer (front hemisphere)
    [
      [-1.5, 0.8, 1.2],   // RSI - top left front
      [1.5, 0.8, 1.2],    // MACD - top right front
    ],
    // Processing layer (middle hemisphere)
    [
      [-1.2, -0.5, 0.5],  // Momentum - left middle
      [1.2, -0.5, 0.5],   // Volume - right middle
      [0, 1.5, 0.3],      // MTF - top center
    ],
    // Output layer (back hemisphere)
    [
      [-0.8, 0, -1],      // Volatility - back left
      [0.8, 0, -1],       // Support/Resistance - back right
    ]
  ];
  
  const flatPositions = layers.flat();
  return (flatPositions[index] || [0, 0, 0]) as [number, number, number];
};

const getGradeColor = (grade: string): string => {
  if (grade.startsWith('A')) return '#22c55e'; // green
  if (grade.startsWith('B')) return '#3b82f6'; // blue
  if (grade.startsWith('C')) return '#f59e0b'; // amber
  if (grade.startsWith('D')) return '#ef4444'; // red
  return '#6b7280'; // gray
};

interface NeuronNodeProps {
  signal: SignalPerformance;
  position: [number, number, number];
  index: number;
}

function NeuronNode({ signal, position, index }: NeuronNodeProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Pulse animation based on reliability
  useFrame((state) => {
    if (meshRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2 + index) * 0.1 + 1;
      meshRef.current.scale.setScalar(hovered ? 1.3 : pulse * (0.3 + signal.reliability * 0.7));
    }
  });

  const color = getGradeColor(signal.grade);
  const size = 0.2 + (signal.reliability * 0.3); // Bigger nodes = more reliable

  return (
    <group position={position}>
      <Sphere
        ref={meshRef}
        args={[size, 32, 32]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          transparent
          opacity={0.9}
          metalness={0.5}
          roughness={0.2}
        />
      </Sphere>
      
      {/* Outer glow sphere */}
      <Sphere args={[size * 1.5, 16, 16]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={hovered ? 0.3 : 0.1}
          side={THREE.BackSide}
        />
      </Sphere>
      
      {hovered && (
        <Html distanceFactor={10} center>
          <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-md p-3 text-xs shadow-lg pointer-events-none min-w-[200px]">
            <div className="font-semibold text-foreground text-sm mb-2">{signal.signalName}</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grade:</span>
                <Badge variant="outline" className="text-xs">{signal.grade}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Win Rate:</span>
                <span className="text-green-400 font-medium">{(signal.winRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Gain:</span>
                <span className="text-blue-400 font-medium">{signal.avgGain > 0 ? '+' : ''}{signal.avgGain.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trades:</span>
                <span className="text-foreground">{signal.tradeCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reliability:</span>
                <span className="text-cyan-400 font-medium">{(signal.reliability * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

interface NeuralConnectionProps {
  start: [number, number, number];
  end: [number, number, number];
  strength: number;
}

function NeuralConnection({ start, end, strength }: NeuralConnectionProps) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([...start, ...end]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geom;
  }, [start, end]);
  
  const color = useMemo(() => new THREE.Color().setHSL(0.55, 0.8, 0.5 + strength * 0.3), [strength]);
  
  return (
    <lineSegments args={[geometry]}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={0.3 + strength * 0.4}
      />
    </lineSegments>
  );
}

function RotatingBrain({ signals }: { signals: SignalPerformance[] }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });

  // Generate neural connections between signals
  const connections = useMemo(() => {
    const conns: { start: [number, number, number]; end: [number, number, number]; strength: number }[] = [];
    
    signals.forEach((signal1, i) => {
      signals.forEach((signal2, j) => {
        if (i < j) {
          const pos1 = getBrainPosition(i, signals.length);
          const pos2 = getBrainPosition(j, signals.length);
          
          // Connection strength based on both signals' reliability
          const strength = (signal1.reliability + signal2.reliability) / 2;
          
          // Only show connections above 30% combined reliability
          if (strength > 0.3) {
            conns.push({ start: pos1, end: pos2, strength });
          }
        }
      });
    });
    
    return conns;
  }, [signals]);

  return (
    <group ref={groupRef}>
      {/* Neural connections */}
      {connections.map((conn, i) => (
        <NeuralConnection key={i} {...conn} />
      ))}
      
      {/* Signal neurons */}
      {signals.map((signal, i) => (
        <NeuronNode
          key={signal.signalName}
          signal={signal}
          position={getBrainPosition(i, signals.length)}
          index={i}
        />
      ))}
      
      {/* Brain outline (transparent sphere) */}
      <Sphere args={[2.5, 32, 32]}>
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.05}
          wireframe
        />
      </Sphere>
    </group>
  );
}

export function BrainNeuralNetwork({ signals }: BrainNeuralNetworkProps) {
  // Calculate learning stats
  const totalTrades = signals.reduce((sum, s) => sum + s.tradeCount, 0);
  const avgWinRate = signals.reduce((sum, s) => sum + s.winRate, 0) / signals.length;
  const topPerformer = signals.reduce((best, s) => s.winRate > best.winRate ? s : best, signals[0]);
  const bottomPerformer = signals.reduce((worst, s) => s.winRate < worst.winRate ? s : worst, signals[0]);

  return (
    <Card className="gradient-border-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
            <Brain className="h-5 w-5 text-cyan-500" />
          </div>
          3D Neural Network Brain
        </CardTitle>
        <CardDescription>
          Interactive 3D visualization of signal relationships and adaptive learning. Drag to rotate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            <p>No signal data available yet. Generate trade ideas to train the neural network.</p>
          </div>
        ) : (
          <>
            <div className="h-[500px] bg-gradient-to-br from-background to-background/50 rounded-lg overflow-hidden border border-border/50">
              <Canvas
                camera={{ position: [4, 3, 4], fov: 50 }}
                gl={{ antialias: true, alpha: true }}
              >
                <color attach="background" args={['#0a0a0a']} />
                <ambientLight intensity={0.4} />
                <pointLight position={[10, 10, 10]} intensity={1} color="#00d9ff" />
                <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff00ff" />
                <pointLight position={[0, 10, 0]} intensity={0.5} color="#00ff88" />
                
                <RotatingBrain signals={signals} />
                
                <OrbitControls
                  enableZoom={true}
                  enablePan={true}
                  minDistance={3}
                  maxDistance={10}
                  autoRotate={false}
                />
              </Canvas>
            </div>
            
            {/* Learning stats panel */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-card/50 border border-border/50 p-3">
                <div className="text-xs text-muted-foreground mb-1">Historical Trades</div>
                <div className="text-xl font-bold text-foreground">{totalTrades}</div>
              </div>
              <div className="rounded-lg bg-card/50 border border-border/50 p-3">
                <div className="text-xs text-muted-foreground mb-1">Avg Win Rate</div>
                <div className="text-xl font-bold text-green-400">{(avgWinRate * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded-lg bg-card/50 border border-border/50 p-3">
                <div className="text-xs text-muted-foreground mb-1">Top Signal</div>
                <div className="text-sm font-semibold text-cyan-400 truncate">{topPerformer?.signalName.split(' ')[0]}</div>
                <div className="text-xs text-muted-foreground">{(topPerformer?.winRate * 100).toFixed(0)}% wins</div>
              </div>
              <div className="rounded-lg bg-card/50 border border-border/50 p-3">
                <div className="text-xs text-muted-foreground mb-1">Improving</div>
                <div className="text-sm font-semibold text-amber-400 truncate">{bottomPerformer?.signalName.split(' ')[0]}</div>
                <div className="text-xs text-muted-foreground">{(bottomPerformer?.winRate * 100).toFixed(0)}% wins</div>
              </div>
            </div>
            
            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
              <span className="text-muted-foreground">Signal Grades:</span>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-xs text-muted-foreground">A (90%+)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-xs text-muted-foreground">B (80-89%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                <span className="text-xs text-muted-foreground">C (70-79%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-xs text-muted-foreground">D (&lt;70%)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
