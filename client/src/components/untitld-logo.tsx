import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface UntitldLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function UntitldLogo({ collapsed = false, className }: UntitldLogoProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  
  useEffect(() => {
    setIsCollapsed(collapsed);
  }, [collapsed]);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <div className="relative flex items-center justify-center">
        {/* UN Text - slides into slash */}
        <span
          className={cn(
            "inline-block font-bold text-sm transition-all duration-700 ease-in-out",
            isCollapsed
              ? "opacity-0 scale-0 translate-x-8"
              : "opacity-100 scale-100 translate-x-0"
          )}
          style={{
            transformOrigin: "center right",
          }}
        >
          UN
        </span>

        {/* The Slash - Portal Effect */}
        <span
          className={cn(
            "inline-block font-bold relative transition-all duration-700 ease-in-out",
            isCollapsed ? "text-2xl scale-125" : "text-sm mx-0.5"
          )}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: isCollapsed ? "drop-shadow(0 0 16px rgba(139, 92, 246, 0.9))" : "none",
          }}
        >
          /
          {/* Pulsing glow effect when collapsed */}
          {isCollapsed && (
            <>
              <span
                className="absolute inset-0 animate-pulse"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(10px)",
                }}
              >
                /
              </span>
              <span
                className="absolute inset-0 animate-ping opacity-60"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(16px)",
                }}
              >
                /
              </span>
            </>
          )}
        </span>

        {/* TITLD Text - slides into slash */}
        <span
          className={cn(
            "inline-block font-bold text-sm transition-all duration-700 ease-in-out",
            isCollapsed
              ? "opacity-0 scale-0 -translate-x-8"
              : "opacity-100 scale-100 translate-x-0"
          )}
          style={{
            transformOrigin: "center left",
          }}
        >
          TITLD
        </span>
      </div>
    </div>
  );
}
