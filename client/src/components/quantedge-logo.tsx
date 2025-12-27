import { cn } from "@/lib/utils";

interface QuantEdgeLogoProps {
  collapsed?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function QuantEdgeLogo({ collapsed = false, className, size = "md" }: QuantEdgeLogoProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-10 w-10",
    lg: "h-14 w-14",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative shrink-0", sizeClasses[size])}>
        <svg 
          viewBox="0 0 48 48" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="qe-gradient-primary" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="qe-gradient-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          
          <rect 
            x="2" y="2" 
            width="44" height="44" 
            rx="10" 
            fill="#0f1419"
          />
          <rect 
            x="2" y="2" 
            width="44" height="44" 
            rx="10" 
            stroke="url(#qe-gradient-primary)" 
            strokeWidth="2.5"
            fill="none"
          />
          
          <text 
            x="24" 
            y="20" 
            textAnchor="middle" 
            fontSize="12" 
            fontWeight="600" 
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="#9ca3af"
            letterSpacing="1"
          >
            QE
          </text>
          
          <path 
            d="M10 36 L20 30 L30 32 L38 24" 
            stroke="url(#qe-gradient-primary)" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          />
          
          <circle cx="10" cy="36" r="3" fill="url(#qe-gradient-gold)" />
        </svg>
      </div>
      
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            QuantEdge
          </span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            Research
          </span>
        </div>
      )}
    </div>
  );
}

export function QuantEdgeIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 48 48" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
    >
      <defs>
        <linearGradient id="qe-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="qe-icon-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      
      <rect 
        x="2" y="2" 
        width="44" height="44" 
        rx="10" 
        fill="#0f1419"
      />
      <rect 
        x="2" y="2" 
        width="44" height="44" 
        rx="10" 
        stroke="url(#qe-icon-gradient)" 
        strokeWidth="2.5"
        fill="none"
      />
      
      <text 
        x="24" 
        y="20" 
        textAnchor="middle" 
        fontSize="12" 
        fontWeight="600" 
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="#9ca3af"
        letterSpacing="1"
      >
        QE
      </text>
      
      <path 
        d="M10 36 L20 30 L30 32 L38 24" 
        stroke="url(#qe-icon-gradient)" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      <circle cx="10" cy="36" r="3" fill="url(#qe-icon-gold)" />
    </svg>
  );
}
