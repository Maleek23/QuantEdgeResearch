import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import * as THREE from 'three';
import { WebGLErrorBoundary } from './webgl-error-boundary';
import { isWebGLSupported } from '@/lib/webgl-support';

interface SignalCombination {
  combination: string;
  occurrences: number;
  winRate: number;
  avgGain: number;
}

interface SignalCorrelationCubeProps {
  combinations: SignalCombination[];
}

// Map full signal names to short codes
const signalNameMap: Record<string, string> = {
  'RSI Divergence': 'RSI',
  'MACD Crossover': 'MACD',
  'Momentum': 'MOM',
  'Volume Spike': 'VOL',
  'Multi-Timeframe': 'MTF',
  'Volatility': 'VIX',
  'Support/Resistance': 'S/R',
};

const getShortCode = (fullName: string): string => {
  return signalNameMap[fullName] || fullName.split(' ')[0].toUpperCase().slice(0, 3);
};

const signals = ['RSI', 'MACD', 'MOM', 'VOL', 'MTF', 'VIX', 'S/R'];

function getHeatColor(winRate: number): string {
  if (winRate >= 0.75) return '#22c55e'; // green-500
  if (winRate >= 0.65) return '#4ade80'; // green-400
  if (winRate >= 0.55) return '#3b82f6'; // blue-500
  if (winRate >= 0.45) return '#60a5fa'; // blue-400
  if (winRate >= 0.35) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
}

interface CubeFaceProps {
  combinations: SignalCombination[];
  position: [number, number, number];
  rotation: [number, number, number];
}

// Memoize CubeFace to prevent unnecessary re-renders and geometry recreation
// React Three Fiber automatically disposes declarative geometries/materials on unmount
const CubeFace = memo(({ combinations, position, rotation }: CubeFaceProps) => {
  const [hovered, setHovered] = useState<string | null>(null);
  
  // Create matrix data - memoized to prevent recalculation
  const matrix = useMemo(() => {
    const matrixData: { signal1: string; signal2: string; winRate: number; occurrences: number; avgGain: number }[] = [];
    
    combinations.forEach(combo => {
      const parts = combo.combination.split(' + ');
      if (parts.length === 2) {
        const signal1 = getShortCode(parts[0].trim());
        const signal2 = getShortCode(parts[1].trim());
        
        matrixData.push({
          signal1,
          signal2,
          winRate: combo.winRate,
          occurrences: combo.occurrences,
          avgGain: combo.avgGain
        });
      }
    });
    
    return matrixData;
  }, [combinations]);

  const getCell = (s1: string, s2: string) => {
    if (s1 === s2) return null;
    return matrix.find(m => 
      (m.signal1 === s1 && m.signal2 === s2) || 
      (m.signal1 === s2 && m.signal2 === s1)
    );
  };

  const gridSize = 7;
  const cellSize = 0.25;
  const spacing = 0.02;
  const totalSize = gridSize * (cellSize + spacing);
  const offset = totalSize / 2 - (cellSize + spacing) / 2;

  return (
    <group position={position} rotation={rotation}>
      {/* Background plane */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[totalSize + 0.2, totalSize + 0.2]} />
        <meshStandardMaterial color="#1a1a2e" opacity={0.9} transparent />
      </mesh>
      
      {/* Grid cells */}
      {signals.map((s1, i) => 
        signals.map((s2, j) => {
          const cell = getCell(s1, s2);
          const cellKey = `${s1}-${s2}`;
          const isHovered = hovered === cellKey;
          
          const x = i * (cellSize + spacing) - offset;
          const y = -j * (cellSize + spacing) + offset;
          
          const color = s1 === s2 
            ? '#374151' // gray-700 for diagonal
            : cell 
              ? getHeatColor(cell.winRate)
              : '#1f2937'; // gray-800 for N/A
          
          return (
            <group key={cellKey}>
              <mesh
                position={[x, y, 0]}
                onPointerOver={() => setHovered(cellKey)}
                onPointerOut={() => setHovered(null)}
                scale={isHovered ? 1.1 : 1}
              >
                <planeGeometry args={[cellSize, cellSize]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isHovered ? 0.5 : 0.2}
                  transparent
                  opacity={0.9}
                />
              </mesh>
              
              {isHovered && cell && (
                <Html position={[x, y, 0.1]} center>
                  <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-md p-2 text-xs shadow-lg pointer-events-none">
                    <div className="font-semibold text-foreground">{s1} + {s2}</div>
                    <div className="text-muted-foreground mt-1">
                      Win Rate: <span className="text-green-400 font-medium">{(cell.winRate * 100).toFixed(1)}%</span>
                    </div>
                    <div className="text-muted-foreground">
                      Avg Gain: <span className="text-cyan-400 font-medium">{cell.avgGain > 0 ? '+' : ''}{cell.avgGain.toFixed(2)}%</span>
                    </div>
                    <div className="text-muted-foreground">
                      Count: {cell.occurrences}
                    </div>
                  </div>
                </Html>
              )}
            </group>
          );
        })
      )}
      
      {/* Row labels (left side) */}
      {signals.map((signal, i) => (
        <Text
          key={`row-${signal}`}
          position={[-offset - 0.3, -i * (cellSize + spacing) + offset, 0]}
          fontSize={0.15}
          color="#94a3b8"
          anchorX="right"
          anchorY="middle"
        >
          {signal}
        </Text>
      ))}
      
      {/* Column labels (top) */}
      {signals.map((signal, i) => (
        <Text
          key={`col-${signal}`}
          position={[i * (cellSize + spacing) - offset, offset + 0.3, 0]}
          fontSize={0.15}
          color="#94a3b8"
          anchorX="center"
          anchorY="bottom"
          rotation={[0, 0, Math.PI / 6]}
        >
          {signal}
        </Text>
      ))}
    </group>
  );
});

function CorrelationCube({ combinations }: { combinations: SignalCombination[] }) {
  return (
    <group>
      {/* Front face */}
      <CubeFace
        combinations={combinations}
        position={[0, 0, 1]}
        rotation={[0, 0, 0]}
      />
      
      {/* Back face */}
      <CubeFace
        combinations={combinations}
        position={[0, 0, -1]}
        rotation={[0, Math.PI, 0]}
      />
      
      {/* Right face */}
      <CubeFace
        combinations={combinations}
        position={[1, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      
      {/* Left face */}
      <CubeFace
        combinations={combinations}
        position={[-1, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      
      {/* Top face */}
      <CubeFace
        combinations={combinations}
        position={[0, 1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      
      {/* Bottom face */}
      <CubeFace
        combinations={combinations}
        position={[0, -1, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

export function SignalCorrelationCube({ combinations }: SignalCorrelationCubeProps) {
  const [hasWebGL, setHasWebGL] = useState<boolean | null>(null);

  useEffect(() => {
    // Check for WebGL support before attempting to render Canvas
    setHasWebGL(isWebGLSupported());
  }, []);

  const webglFallback = (
    <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-4">
      <p className="text-sm text-muted-foreground">
        3D visualization requires WebGL support, which is not available in your browser.
      </p>
      <p className="text-xs text-muted-foreground max-w-md">
        Please try viewing this page in a modern browser with WebGL enabled, or check the Data Tables tab for the same information in table format.
      </p>
    </div>
  );

  return (
    <Card className="gradient-border-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Target className="h-5 w-5 text-purple-500" />
          </div>
          3D Signal Correlation Cube
        </CardTitle>
        <CardDescription>
          Interactive 3D cube showing signal combination performance. Drag to rotate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {combinations.length === 0 ? (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            <p>No combination data available yet. Generate more research briefs to see correlations.</p>
          </div>
        ) : hasWebGL === null ? (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground">
            <p>Checking 3D support...</p>
          </div>
        ) : !hasWebGL ? (
          webglFallback
        ) : (
          <WebGLErrorBoundary fallback={webglFallback}>
            <div className="h-[500px] bg-gradient-to-br from-background to-background/50 rounded-lg overflow-hidden border border-border/50">
              <Canvas
                camera={{ position: [3, 3, 3], fov: 50 }}
                gl={{ 
                  antialias: true, 
                  alpha: true,
                  preserveDrawingBuffer: true,
                  powerPreference: 'high-performance'
                }}
                onCreated={({ gl }) => {
                  // Handle context loss
                  gl.domElement.addEventListener('webglcontextlost', (event) => {
                    event.preventDefault();
                    console.warn('WebGL context lost. Attempting to restore...');
                  });
                  
                  gl.domElement.addEventListener('webglcontextrestored', () => {
                    console.log('WebGL context restored - reloading page to reinitialize scene');
                    // Reload page to fully reinitialize WebGL resources
                    window.location.reload();
                  });
                }}
              >
                <color attach="background" args={['#0a0a0a']} />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />
                
                <CorrelationCube combinations={combinations} />
                
                <OrbitControls
                  enableZoom={true}
                  enablePan={true}
                  minDistance={2}
                  maxDistance={8}
                  autoRotate={false}
                />
              </Canvas>
            </div>
          </WebGLErrorBoundary>
        )}
        
        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Win Rate:</span>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            <span className="text-xs text-muted-foreground">&lt;35%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
            <span className="text-xs text-muted-foreground">35-45%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#60a5fa' }} />
            <span className="text-xs text-muted-foreground">45-55%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-xs text-muted-foreground">55-65%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#4ade80' }} />
            <span className="text-xs text-muted-foreground">65-75%</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-xs text-muted-foreground">75%+</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
