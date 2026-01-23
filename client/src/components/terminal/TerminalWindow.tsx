import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, type ReactNode } from "react";
import { Folder, File, ChevronRight, ChevronDown, Terminal, Cpu, Activity } from "lucide-react";

interface TerminalWindowProps {
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

// Terminal window frame with traffic light buttons
export const TerminalWindow = ({ 
  title = "terminal", 
  children, 
  className = "",
  variant = "default"
}: TerminalWindowProps) => {
  const borderColors = {
    default: "border-cyan-500/30",
    success: "border-green-500/30",
    warning: "border-amber-500/30",
    danger: "border-red-500/30"
  };
  
  return (
    <div className={`rounded-lg overflow-hidden bg-slate-950 border ${borderColors[variant]} shadow-2xl ${className}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 border-b border-slate-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <span className="flex-1 text-center text-xs text-slate-500 font-mono">{title}</span>
        <Terminal className="w-3.5 h-3.5 text-slate-600" />
      </div>
      
      {/* Content */}
      <div className="p-4 font-mono text-sm">
        {children}
      </div>
    </div>
  );
};

// Typing animation effect
export const TypewriterText = ({ 
  text, 
  speed = 30,
  className = "",
  onComplete
}: { 
  text: string; 
  speed?: number;
  className?: string;
  onComplete?: () => void;
}) => {
  const [displayText, setDisplayText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);
    
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);
  
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);
  
  return (
    <span className={className}>
      {displayText}
      <span className={`${cursorVisible ? 'opacity-100' : 'opacity-0'} text-cyan-400`}>_</span>
    </span>
  );
};

// Command line prompt
export const CommandPrompt = ({ 
  command, 
  output,
  status = "success",
  isTyping = false,
  prefix = "quant@edge"
}: { 
  command: string;
  output?: ReactNode;
  status?: "success" | "error" | "pending";
  isTyping?: boolean;
  prefix?: string;
}) => {
  const statusColors = {
    success: "text-green-400",
    error: "text-red-400",
    pending: "text-amber-400"
  };
  
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-cyan-400">{prefix}</span>
        <span className="text-slate-500">$</span>
        {isTyping ? (
          <TypewriterText text={command} className="text-slate-200" />
        ) : (
          <span className="text-slate-200">{command}</span>
        )}
      </div>
      {output && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`pl-4 ${statusColors[status]}`}
        >
          {output}
        </motion.div>
      )}
    </div>
  );
};

// File tree component
interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  status?: "success" | "warning" | "error" | "pending";
  size?: string;
}

export const FileTree = ({ 
  nodes,
  animated = true,
  className = ""
}: { 
  nodes: FileNode[];
  animated?: boolean;
  className?: string;
}) => {
  return (
    <div className={`font-mono text-sm ${className}`}>
      {nodes.map((node, index) => (
        <FileTreeNode 
          key={node.name} 
          node={node} 
          depth={0} 
          index={index}
          animated={animated}
        />
      ))}
    </div>
  );
};

const FileTreeNode = ({ 
  node, 
  depth, 
  index,
  animated
}: { 
  node: FileNode; 
  depth: number; 
  index: number;
  animated: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  
  const statusColors = {
    success: "text-green-400",
    warning: "text-amber-400",
    error: "text-red-400",
    pending: "text-cyan-400"
  };
  
  const content = (
    <div 
      className={`flex items-center gap-2 py-0.5 hover:bg-slate-800/50 rounded px-1 cursor-pointer`}
      style={{ paddingLeft: depth * 16 }}
      onClick={() => node.type === "folder" && setIsOpen(!isOpen)}
    >
      {node.type === "folder" ? (
        <>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
          <Folder className="w-4 h-4 text-amber-400" />
        </>
      ) : (
        <>
          <span className="w-3.5" />
          <File className="w-4 h-4 text-cyan-400" />
        </>
      )}
      <span className={node.status ? statusColors[node.status] : "text-slate-300"}>
        {node.name}
      </span>
      {node.size && (
        <span className="text-slate-600 text-xs ml-auto">{node.size}</span>
      )}
    </div>
  );
  
  return (
    <>
      {animated ? (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          {content}
        </motion.div>
      ) : content}
      
      <AnimatePresence>
        {node.type === "folder" && isOpen && node.children && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {node.children.map((child, i) => (
              <FileTreeNode 
                key={child.name} 
                node={child} 
                depth={depth + 1} 
                index={i}
                animated={animated}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Progress bar with terminal style
export const TerminalProgress = ({ 
  value, 
  max = 100,
  label,
  showPercent = true,
  variant = "cyan"
}: { 
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  variant?: "cyan" | "green" | "amber" | "red";
}) => {
  const percent = Math.min((value / max) * 100, 100);
  const blocks = 20;
  const filled = Math.round((percent / 100) * blocks);
  
  const colors = {
    cyan: "text-cyan-400",
    green: "text-green-400",
    amber: "text-amber-400",
    red: "text-red-400"
  };
  
  return (
    <div className="font-mono text-sm">
      {label && <div className="text-slate-400 mb-1">{label}</div>}
      <div className="flex items-center gap-2">
        <span className="text-slate-600">[</span>
        <span className={colors[variant]}>
          {"█".repeat(filled)}{"░".repeat(blocks - filled)}
        </span>
        <span className="text-slate-600">]</span>
        {showPercent && (
          <span className="text-slate-400 w-12 text-right">{percent.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
};

// Trading stats in terminal style
export const TerminalStats = ({ 
  stats 
}: { 
  stats: { label: string; value: string | number; trend?: "up" | "down" | "neutral" }[] 
}) => {
  return (
    <div className="font-mono text-sm space-y-1">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center justify-between"
        >
          <span className="text-slate-500">{stat.label}:</span>
          <span className={
            stat.trend === "up" ? "text-green-400" :
            stat.trend === "down" ? "text-red-400" :
            "text-cyan-400"
          }>
            {stat.trend === "up" && "+ "}
            {stat.trend === "down" && "- "}
            {stat.value}
          </span>
        </motion.div>
      ))}
    </div>
  );
};

// Live data stream animation
export const DataStream = ({ 
  lines = 5,
  speed = 100
}: { 
  lines?: number;
  speed?: number;
}) => {
  const [data, setData] = useState<string[]>([]);
  
  useEffect(() => {
    const generateLine = () => {
      const types = ["INFO", "DATA", "TICK", "FLOW", "SCAN"];
      const symbols = ["NVDA", "AMD", "TSLA", "AAPL", "META", "MSFT", "GOOG"];
      const type = types[Math.floor(Math.random() * types.length)];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const value = (Math.random() * 10).toFixed(2);
      const timestamp = new Date().toLocaleTimeString();
      
      return `[${timestamp}] [${type}] ${symbol}: ${value}`;
    };
    
    const interval = setInterval(() => {
      setData(prev => {
        const newData = [...prev, generateLine()];
        return newData.slice(-lines);
      });
    }, speed);
    
    return () => clearInterval(interval);
  }, [lines, speed]);
  
  return (
    <div className="font-mono text-xs space-y-0.5 overflow-hidden">
      <AnimatePresence mode="popLayout">
        {data.map((line, index) => (
          <motion.div
            key={line + index}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="text-slate-400"
          >
            {line}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// System status indicator
export const SystemStatus = ({ 
  systems 
}: { 
  systems: { name: string; status: "online" | "offline" | "degraded" }[] 
}) => {
  const statusConfig = {
    online: { color: "text-green-400", dot: "bg-green-400", label: "ONLINE" },
    offline: { color: "text-red-400", dot: "bg-red-400", label: "OFFLINE" },
    degraded: { color: "text-amber-400", dot: "bg-amber-400", label: "DEGRADED" }
  };
  
  return (
    <div className="font-mono text-sm space-y-2">
      {systems.map((system, index) => {
        const config = statusConfig[system.status];
        return (
          <motion.div
            key={system.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <motion.div
                animate={system.status === "online" ? { 
                  opacity: [1, 0.5, 1],
                  scale: [1, 1.2, 1]
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className={`w-2 h-2 rounded-full ${config.dot}`}
              />
              <span className="text-slate-400">{system.name}</span>
            </div>
            <span className={config.color}>[{config.label}]</span>
          </motion.div>
        );
      })}
    </div>
  );
};

// Matrix-style rain effect (decorative background)
export const MatrixRain = ({ 
  className = "",
  opacity = 0.1
}: { 
  className?: string;
  opacity?: number;
}) => {
  const columns = 20;
  const chars = "01アイウエオカキクケコサシスセソタチツテト";
  
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} style={{ opacity }}>
      {Array.from({ length: columns }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute text-green-500 font-mono text-xs whitespace-pre"
          style={{ left: `${(i / columns) * 100}%` }}
          initial={{ y: "-100%" }}
          animate={{ y: "100%" }}
          transition={{
            duration: 5 + Math.random() * 5,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "linear"
          }}
        >
          {Array.from({ length: 20 }).map(() => 
            chars[Math.floor(Math.random() * chars.length)]
          ).join("\n")}
        </motion.div>
      ))}
    </div>
  );
};

export default {
  TerminalWindow,
  TypewriterText,
  CommandPrompt,
  FileTree,
  TerminalProgress,
  TerminalStats,
  DataStream,
  SystemStatus,
  MatrixRain
};
