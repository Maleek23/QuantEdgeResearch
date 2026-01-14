/**
 * ENGINE PERFORMANCE RADAR
 *
 * Radar chart showing all 6 engines' performance metrics
 * Animated, interactive, with real-time data updates
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface EngineData {
  engine: string;
  winRate: number;
  confidence: number;
  speed: number;
  accuracy: number;
  consistency: number;
  color: string;
}

const ENGINE_COLORS: Record<string, string> = {
  'Trading': '#8B5CF6',
  'Quant': '#3B82F6',
  'Risk': '#10B981',
  'Mean-Rev': '#F59E0B',
  'Confluence': '#EC4899',
  'Lotto': '#EF4444',
};

// Custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-lg p-3 shadow-xl">
      <p className="text-white font-semibold mb-2">{payload[0]?.payload?.subject}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-gray-400">{entry.name}:</span>
          <span className="text-white font-medium">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
};

export function EnginePerformanceRadar() {
  const [selectedEngines, setSelectedEngines] = useState<string[]>([
    'Trading',
    'Quant',
    'Confluence',
  ]);

  const [engineData, setEngineData] = useState<EngineData[]>([
    { engine: 'Trading', winRate: 58, confidence: 82, speed: 75, accuracy: 70, consistency: 65, color: '#8B5CF6' },
    { engine: 'Quant', winRate: 52, confidence: 75, speed: 90, accuracy: 68, consistency: 78, color: '#3B82F6' },
    { engine: 'Risk', winRate: 0, confidence: 91, speed: 95, accuracy: 88, consistency: 92, color: '#10B981' },
    { engine: 'Mean-Rev', winRate: 49, confidence: 68, speed: 85, accuracy: 62, consistency: 71, color: '#F59E0B' },
    { engine: 'Confluence', winRate: 61, confidence: 85, speed: 70, accuracy: 78, consistency: 73, color: '#EC4899' },
    { engine: 'Lotto', winRate: 23, confidence: 45, speed: 80, accuracy: 35, consistency: 40, color: '#EF4444' },
  ]);

  // Transform data for radar chart
  const radarData = useMemo(() => {
    return [
      { subject: 'Win Rate', fullMark: 100, ...Object.fromEntries(engineData.map(e => [e.engine, e.winRate])) },
      { subject: 'Confidence', fullMark: 100, ...Object.fromEntries(engineData.map(e => [e.engine, e.confidence])) },
      { subject: 'Speed', fullMark: 100, ...Object.fromEntries(engineData.map(e => [e.engine, e.speed])) },
      { subject: 'Accuracy', fullMark: 100, ...Object.fromEntries(engineData.map(e => [e.engine, e.accuracy])) },
      { subject: 'Consistency', fullMark: 100, ...Object.fromEntries(engineData.map(e => [e.engine, e.consistency])) },
    ];
  }, [engineData]);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setEngineData(prev =>
        prev.map(engine => ({
          ...engine,
          confidence: Math.min(100, Math.max(30, engine.confidence + (Math.random() - 0.5) * 3)),
          accuracy: Math.min(100, Math.max(30, engine.accuracy + (Math.random() - 0.5) * 2)),
        }))
      );
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const toggleEngine = (engine: string) => {
    setSelectedEngines(prev =>
      prev.includes(engine)
        ? prev.filter(e => e !== engine)
        : [...prev, engine]
    );
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Engine Performance</h3>
          <p className="text-sm text-gray-400">Compare all 6 engines across key metrics</p>
        </div>
        <motion.div
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 rounded-full"
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-xs text-purple-400 font-medium">Learning</span>
        </motion.div>
      </div>

      {/* Engine selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {engineData.map(engine => (
          <motion.button
            key={engine.engine}
            onClick={() => toggleEngine(engine.engine)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedEngines.includes(engine.engine)
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            style={{
              background: selectedEngines.includes(engine.engine)
                ? `${engine.color}30`
                : 'transparent',
              border: `1px solid ${selectedEngines.includes(engine.engine) ? engine.color : 'transparent'}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: engine.color }}
              />
              {engine.engine}
            </div>
          </motion.button>
        ))}
      </div>

      {/* Radar Chart */}
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="80%">
            <PolarGrid
              stroke="#374151"
              strokeDasharray="3 3"
            />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: '#6B7280', fontSize: 10 }}
              axisLine={false}
            />

            {selectedEngines.map(engine => {
              const engineInfo = engineData.find(e => e.engine === engine);
              if (!engineInfo) return null;

              return (
                <Radar
                  key={engine}
                  name={engine}
                  dataKey={engine}
                  stroke={engineInfo.color}
                  fill={engineInfo.color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              );
            })}

            <Tooltip content={<CustomTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-800">
        {selectedEngines.slice(0, 3).map(engineName => {
          const engine = engineData.find(e => e.engine === engineName);
          if (!engine) return null;

          return (
            <motion.div
              key={engine.engine}
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div
                className="text-2xl font-bold"
                style={{ color: engine.color }}
              >
                {engine.winRate > 0 ? `${engine.winRate}%` : 'N/A'}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {engine.engine} Win Rate
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default EnginePerformanceRadar;
