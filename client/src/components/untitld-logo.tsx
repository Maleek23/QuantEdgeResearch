import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface UntitldLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function UntitldLogo({ collapsed = false, className }: UntitldLogoProps) {
  // Remove internal state - use prop directly for instant reactivity
  return (
    <div className={cn(
      "relative inline-flex items-center justify-center transition-all duration-700 ease-in-out",
      collapsed ? "min-h-[120px] scale-150" : "min-h-[24px] scale-100",
      className
    )}>
      {/* Cinematic glow background when collapsed */}
      {collapsed && (
        <div 
          className="absolute inset-0 rounded-full transition-all duration-700 animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.2) 50%, transparent 100%)',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.6), 0 0 80px rgba(139, 92, 246, 0.4)',
            filter: 'blur(20px)',
          }}
        />
      )}
      
      <div className="relative flex items-center justify-center">
        {/* UN Text - slides RIGHT into slash */}
        <span
          className={cn(
            "inline-block font-semibold transition-all duration-700 ease-in-out",
            collapsed
              ? "opacity-0 scale-0 translate-x-10 blur-md"
              : "opacity-100 scale-100 translate-x-0 blur-0 text-[11px]"
          )}
          style={{
            transformOrigin: "center right",
          }}
        >
          UN
        </span>

        {/* The Slash - PORTAL HERO */}
        <span
          className={cn(
            "inline-block font-bold relative transition-all duration-700 ease-in-out",
            collapsed ? "text-6xl scale-100" : "text-[11px] mx-0.5"
          )}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: collapsed 
              ? "drop-shadow(0 0 30px rgba(139, 92, 246, 1)) drop-shadow(0 0 20px rgba(59, 130, 246, 1))" 
              : "none",
          }}
        >
          /
          {/* Multi-layer pulsing glow when collapsed */}
          {collapsed && (
            <>
              <span
                className="absolute inset-0 animate-pulse"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(20px)",
                }}
              >
                /
              </span>
              <span
                className="absolute inset-0 animate-ping opacity-80"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(30px)",
                }}
              >
                /
              </span>
            </>
          )}
        </span>

        {/* TITLD Text - slides LEFT into slash */}
        <span
          className={cn(
            "inline-block font-semibold transition-all duration-700 ease-in-out",
            collapsed
              ? "opacity-0 scale-0 -translate-x-10 blur-md"
              : "opacity-100 scale-100 translate-x-0 blur-0 text-[11px]"
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
