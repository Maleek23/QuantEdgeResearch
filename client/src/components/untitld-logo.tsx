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
      <div className="relative flex items-center justify-center overflow-hidden">
        {/* UN Text - slides into slash */}
        <span
          className={cn(
            "inline-block font-bold transition-all duration-700 ease-in-out",
            isCollapsed
              ? "opacity-0 scale-0 translate-x-8 -translate-y-2"
              : "opacity-100 scale-100 translate-x-0 translate-y-0"
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
            isCollapsed ? "text-4xl scale-150 mx-0" : "text-base scale-100 mx-1"
          )}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: isCollapsed ? "drop-shadow(0 0 12px rgba(139, 92, 246, 0.8))" : "none",
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
                  filter: "blur(8px)",
                }}
              >
                /
              </span>
              <span
                className="absolute inset-0 animate-ping opacity-75"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(12px)",
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
            "inline-block font-bold transition-all duration-700 ease-in-out",
            isCollapsed
              ? "opacity-0 scale-0 -translate-x-8 translate-y-2"
              : "opacity-100 scale-100 translate-x-0 translate-y-0"
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
