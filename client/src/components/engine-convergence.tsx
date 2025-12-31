export function EngineConvergence({ className = "" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 300 280" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="aiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="quantGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* Grid background pattern */}
      <pattern id="miniGrid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(6,182,212,0.08)" strokeWidth="0.5" />
      </pattern>
      <rect width="300" height="280" fill="url(#miniGrid)" />
      
      {/* Engine nodes */}
      {/* AI Engine - Top */}
      <g filter="url(#glow)">
        <circle cx="60" cy="50" r="28" fill="rgba(168,85,247,0.1)" stroke="#a855f7" strokeWidth="1.5" />
        <text x="60" y="45" textAnchor="middle" fill="#a855f7" fontSize="10" fontFamily="monospace" fontWeight="600">AI</text>
        <text x="60" y="58" textAnchor="middle" fill="#a855f7" fontSize="7" fontFamily="monospace" opacity="0.7">ENGINE</text>
      </g>
      
      {/* Quant Engine - Middle */}
      <g filter="url(#glow)">
        <circle cx="60" cy="140" r="28" fill="rgba(59,130,246,0.1)" stroke="#3b82f6" strokeWidth="1.5" />
        <text x="60" y="135" textAnchor="middle" fill="#3b82f6" fontSize="10" fontFamily="monospace" fontWeight="600">QUANT</text>
        <text x="60" y="148" textAnchor="middle" fill="#3b82f6" fontSize="7" fontFamily="monospace" opacity="0.7">ENGINE</text>
      </g>
      
      {/* Flow Scanner - Bottom */}
      <g filter="url(#glow)">
        <circle cx="60" cy="230" r="28" fill="rgba(6,182,212,0.1)" stroke="#06b6d4" strokeWidth="1.5" />
        <text x="60" y="225" textAnchor="middle" fill="#06b6d4" fontSize="10" fontFamily="monospace" fontWeight="600">FLOW</text>
        <text x="60" y="238" textAnchor="middle" fill="#06b6d4" fontSize="7" fontFamily="monospace" opacity="0.7">SCANNER</text>
      </g>
      
      {/* Convergence lines with animation */}
      <path 
        d="M 88 50 Q 150 50 180 140" 
        stroke="url(#aiGradient)" 
        strokeWidth="2" 
        fill="none"
        strokeDasharray="4 2"
        className="animate-pulse"
      />
      <path 
        d="M 88 140 L 180 140" 
        stroke="url(#quantGradient)" 
        strokeWidth="2" 
        fill="none"
        strokeDasharray="4 2"
        className="animate-pulse"
        style={{ animationDelay: '0.3s' }}
      />
      <path 
        d="M 88 230 Q 150 230 180 140" 
        stroke="url(#flowGradient)" 
        strokeWidth="2" 
        fill="none"
        strokeDasharray="4 2"
        className="animate-pulse"
        style={{ animationDelay: '0.6s' }}
      />
      
      {/* Central convergence node */}
      <g filter="url(#glow)">
        <circle cx="210" cy="140" r="35" fill="rgba(6,182,212,0.15)" stroke="#06b6d4" strokeWidth="2" />
        <circle cx="210" cy="140" r="22" fill="rgba(6,182,212,0.2)" stroke="#06b6d4" strokeWidth="1" />
        <text x="210" y="135" textAnchor="middle" fill="#06b6d4" fontSize="11" fontFamily="monospace" fontWeight="700">ONE</text>
        <text x="210" y="150" textAnchor="middle" fill="#06b6d4" fontSize="11" fontFamily="monospace" fontWeight="700">EDGE</text>
      </g>
      
      {/* Output signal */}
      <path 
        d="M 245 140 L 285 140" 
        stroke="#06b6d4" 
        strokeWidth="2" 
        markerEnd="url(#arrowhead)"
      />
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#06b6d4" />
        </marker>
      </defs>
      
      {/* Data points animation hint */}
      <circle cx="120" cy="60" r="2" fill="#a855f7" opacity="0.6" className="animate-ping" />
      <circle cx="140" cy="130" r="2" fill="#3b82f6" opacity="0.6" className="animate-ping" style={{ animationDelay: '0.5s' }} />
      <circle cx="130" cy="210" r="2" fill="#06b6d4" opacity="0.6" className="animate-ping" style={{ animationDelay: '1s' }} />
    </svg>
  );
}
