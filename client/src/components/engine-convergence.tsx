export function EngineConvergence({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Animated data streams visualization */}
      <svg 
        viewBox="0 0 400 320" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          {/* Gradients for data streams */}
          <linearGradient id="streamAI" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="streamQuant" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="streamFlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          
          {/* Glow filters */}
          <filter id="glowPurple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#a855f7" floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowBlue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#3b82f6" floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feFlood floodColor="#06b6d4" floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Background grid dots */}
        {[...Array(8)].map((_, row) => 
          [...Array(10)].map((_, col) => (
            <circle 
              key={`dot-${row}-${col}`}
              cx={40 + col * 36} 
              cy={40 + row * 36} 
              r="1" 
              fill="rgba(6,182,212,0.15)"
            />
          ))
        )}
        
        {/* AI Engine Column - Neural Pattern */}
        <g className="engine-ai">
          {/* Vertical data bar */}
          <rect x="45" y="50" width="4" height="220" fill="rgba(168,85,247,0.1)" rx="2" />
          
          {/* Animated signal bars */}
          <rect x="45" y="60" width="4" height="30" fill="#a855f7" opacity="0.3" rx="2">
            <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
          </rect>
          <rect x="45" y="100" width="4" height="20" fill="#a855f7" opacity="0.5" rx="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
          </rect>
          <rect x="45" y="140" width="4" height="40" fill="#a855f7" opacity="0.4" rx="2">
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
          </rect>
          <rect x="45" y="200" width="4" height="25" fill="#a855f7" opacity="0.6" rx="2">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="2.2s" repeatCount="indefinite" begin="0.9s" />
          </rect>
          
          {/* Engine label */}
          <text x="47" y="290" textAnchor="middle" fill="#a855f7" fontSize="9" fontFamily="monospace" fontWeight="600">AI</text>
        </g>
        
        {/* Quant Engine Column - Algorithmic Bars */}
        <g className="engine-quant">
          <rect x="115" y="50" width="4" height="220" fill="rgba(59,130,246,0.1)" rx="2" />
          
          {/* Candlestick-like patterns */}
          <rect x="113" y="70" width="8" height="15" fill="#3b82f6" opacity="0.4" rx="1">
            <animate attributeName="height" values="15;25;15" dur="3s" repeatCount="indefinite" />
          </rect>
          <rect x="113" y="95" width="8" height="35" fill="#3b82f6" opacity="0.6" rx="1">
            <animate attributeName="height" values="35;20;35" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
          </rect>
          <rect x="113" y="145" width="8" height="28" fill="#3b82f6" opacity="0.5" rx="1">
            <animate attributeName="height" values="28;40;28" dur="2.8s" repeatCount="indefinite" begin="1s" />
          </rect>
          <rect x="113" y="185" width="8" height="22" fill="#3b82f6" opacity="0.7" rx="1">
            <animate attributeName="height" values="22;12;22" dur="2.2s" repeatCount="indefinite" begin="1.5s" />
          </rect>
          <rect x="113" y="220" width="8" height="18" fill="#3b82f6" opacity="0.4" rx="1">
            <animate attributeName="height" values="18;30;18" dur="3.2s" repeatCount="indefinite" begin="0.3s" />
          </rect>
          
          <text x="117" y="290" textAnchor="middle" fill="#3b82f6" fontSize="9" fontFamily="monospace" fontWeight="600">QUANT</text>
        </g>
        
        {/* Flow Engine Column - Streaming Tape */}
        <g className="engine-flow">
          <rect x="185" y="50" width="4" height="220" fill="rgba(6,182,212,0.1)" rx="2" />
          
          {/* Flow stream indicators */}
          <circle cx="187" cy="65" r="4" fill="#06b6d4" opacity="0.5">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
            <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite" />
          </circle>
          <circle cx="187" cy="105" r="3" fill="#06b6d4" opacity="0.7">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.2s" repeatCount="indefinite" begin="0.2s" />
          </circle>
          <circle cx="187" cy="145" r="5" fill="#06b6d4" opacity="0.4">
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.5s" repeatCount="indefinite" begin="0.4s" />
            <animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite" begin="0.4s" />
          </circle>
          <circle cx="187" cy="185" r="3" fill="#06b6d4" opacity="0.6">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="0.8s" repeatCount="indefinite" begin="0.6s" />
          </circle>
          <circle cx="187" cy="225" r="4" fill="#06b6d4" opacity="0.8">
            <animate attributeName="opacity" values="0.8;1;0.8" dur="1.3s" repeatCount="indefinite" begin="0.8s" />
          </circle>
          
          <text x="187" y="290" textAnchor="middle" fill="#06b6d4" fontSize="9" fontFamily="monospace" fontWeight="600">FLOW</text>
        </g>
        
        {/* Convergence paths */}
        <g className="convergence-paths">
          {/* AI to core */}
          <path 
            d="M 55 160 Q 140 160 230 160" 
            stroke="url(#streamAI)" 
            strokeWidth="2" 
            fill="none"
            strokeDasharray="8 4"
          >
            <animate attributeName="stroke-dashoffset" values="0;-24" dur="1.5s" repeatCount="indefinite" />
          </path>
          
          {/* Quant to core */}
          <path 
            d="M 125 160 Q 180 160 230 160" 
            stroke="url(#streamQuant)" 
            strokeWidth="2" 
            fill="none"
            strokeDasharray="8 4"
          >
            <animate attributeName="stroke-dashoffset" values="0;-24" dur="1.2s" repeatCount="indefinite" />
          </path>
          
          {/* Flow to core */}
          <path 
            d="M 195 160 L 230 160" 
            stroke="url(#streamFlow)" 
            strokeWidth="2" 
            fill="none"
            strokeDasharray="8 4"
          >
            <animate attributeName="stroke-dashoffset" values="0;-24" dur="1s" repeatCount="indefinite" />
          </path>
        </g>
        
        {/* Central Core - The Edge */}
        <g filter="url(#glowCyan)">
          {/* Outer ring */}
          <circle cx="290" cy="160" r="50" fill="none" stroke="rgba(6,182,212,0.2)" strokeWidth="1" />
          
          {/* Middle ring with pulse */}
          <circle cx="290" cy="160" r="38" fill="none" stroke="rgba(6,182,212,0.4)" strokeWidth="1.5">
            <animate attributeName="r" values="38;42;38" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          
          {/* Inner core */}
          <circle cx="290" cy="160" r="28" fill="rgba(6,182,212,0.1)" stroke="#06b6d4" strokeWidth="2" />
          
          {/* Core waveform */}
          <path 
            d="M 268 160 Q 275 150 282 160 Q 289 170 296 160 Q 303 150 312 160" 
            stroke="#06b6d4" 
            strokeWidth="2" 
            fill="none"
            opacity="0.8"
          >
            <animate attributeName="d" 
              values="M 268 160 Q 275 150 282 160 Q 289 170 296 160 Q 303 150 312 160;
                      M 268 160 Q 275 170 282 160 Q 289 150 296 160 Q 303 170 312 160;
                      M 268 160 Q 275 150 282 160 Q 289 170 296 160 Q 303 150 312 160"
              dur="1.5s" 
              repeatCount="indefinite" 
            />
          </path>
          
          {/* Center dot */}
          <circle cx="290" cy="160" r="4" fill="#06b6d4">
            <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite" />
          </circle>
        </g>
        
        {/* Output arrow */}
        <g>
          <path d="M 345 160 L 380 160" stroke="#06b6d4" strokeWidth="2" opacity="0.6" />
          <polygon points="380,155 390,160 380,165" fill="#06b6d4" opacity="0.6" />
        </g>
        
        {/* Labels */}
        <text x="290" y="230" textAnchor="middle" fill="#06b6d4" fontSize="10" fontFamily="monospace" fontWeight="700" letterSpacing="0.1em">EDGE</text>
        
        {/* Win rate indicators */}
        <g className="stats" opacity="0.6">
          <text x="47" y="40" textAnchor="middle" fill="#a855f7" fontSize="7" fontFamily="monospace">57%</text>
          <text x="117" y="40" textAnchor="middle" fill="#3b82f6" fontSize="7" fontFamily="monospace">34%</text>
          <text x="187" y="40" textAnchor="middle" fill="#06b6d4" fontSize="7" fontFamily="monospace">82%</text>
        </g>
      </svg>
    </div>
  );
}
