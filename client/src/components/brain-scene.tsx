import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Html } from '@react-three/drei';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SignalPerformance {
  signalName: string;
  grade: string;
  winRate: number;
  avgGain: number;
  tradeCount: number;
  reliability: number;
}

interface NeuronProps {
  position: [number, number, number];
  signal: SignalPerformance;
  index: number;
  totalSignals: number;
}

// Animated 3D Neuron
function Neuron({ position, signal, index, totalSignals }: NeuronProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const pulseSpeed = 1 + signal.reliability;
      const scale = 1 + Math.sin(state.clock.elapsedTime * pulseSpeed + index) * 0.2;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  const color = useMemo(() => {
    if (signal.winRate >= 60) return '#10b981'; // green
    if (signal.winRate >= 50) return '#3b82f6'; // blue
    if (signal.winRate >= 40) return '#f59e0b'; // amber
    return '#ef4444'; // red
  }, [signal.winRate]);

  const size = 0.3 + (signal.reliability * 0.7);

  return (
    <group>
      <Sphere ref={meshRef} args={[size, 32, 32]} position={position}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          metalness={0.3}
          roughness={0.4}
        />
      </Sphere>

      <Html
        position={position}
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <Card className="bg-black/90 backdrop-blur-sm border border-cyan-500/30 p-3 shadow-2xl min-w-[180px]">
          <div className="text-cyan-400 text-xs font-semibold mb-2 truncate">
            {signal.signalName}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Grade:</span>
              <Badge variant="outline" className="text-xs">{signal.grade}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Win Rate:</span>
              <span className="text-green-400 font-medium">{signal.winRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Gain:</span>
              <span className="text-cyan-400 font-medium">{signal.avgGain > 0 ? '+' : ''}{signal.avgGain.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trades:</span>
              <span className="text-purple-400 font-medium">{signal.tradeCount}</span>
            </div>
          </div>
        </Card>
      </Html>
    </group>
  );
}

// Connection Lines between Neurons
function NeuralConnections({ signals }: { signals: SignalPerformance[] }) {
  // Memoize positions - only recalculate when signals length changes
  const positions = useMemo(() => {
    return signals.map((_, i) => {
      const radius = 4;
      const angle = (i / signals.length) * Math.PI * 2;
      return [
        Math.cos(angle) * radius,
        Math.sin(angle * 0.5) * 2,
        Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [signals.length]);

  // Store Line objects in ref to prevent recreation on every render
  const linesRef = useRef<THREE.Line[]>([]);

  // Create Line objects only when positions or signals change
  const lineObjects = useMemo(() => {
    // Dispose old lines before creating new ones
    linesRef.current.forEach(line => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });

    const newLines: THREE.Line[] = [];
    
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const strength = (signals[i].reliability + signals[j].reliability) / 2;
        
        const points = [
          new THREE.Vector3(...positions[i]),
          new THREE.Vector3(...positions[j]),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: "#3b82f6",
          opacity: strength * 0.3,
          transparent: true,
        });
        
        newLines.push(new THREE.Line(geometry, material));
      }
    }
    
    linesRef.current = newLines;
    return newLines;
  }, [positions, signals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      linesRef.current.forEach(line => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      linesRef.current = [];
    };
  }, []);

  return (
    <>
      {lineObjects.map((line, i) => (
        <primitive key={i} object={line} />
      ))}
    </>
  );
}

// Main Brain Scene
export function BrainScene({ signals }: { signals: SignalPerformance[] }) {
  const neuronPositions = useMemo(() => {
    return signals.map((_, i) => {
      const radius = 4;
      const angle = (i / signals.length) * Math.PI * 2;
      return [
        Math.cos(angle) * radius,
        Math.sin(angle * 0.5) * 2,
        Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [signals]);

  return (
    <Canvas 
      camera={{ position: [0, 0, 12], fov: 60 }}
      gl={{ 
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: true,
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
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#3b82f6" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

      <NeuralConnections signals={signals} />

      {signals.map((signal, i) => (
        <Neuron
          key={i}
          position={neuronPositions[i]}
          signal={signal}
          index={i}
          totalSignals={signals.length}
        />
      ))}

      <OrbitControls
        enableZoom={true}
        enablePan={true}
        minDistance={5}
        maxDistance={20}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </Canvas>
  );
}
