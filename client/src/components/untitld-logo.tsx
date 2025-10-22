import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface UntitldLogoProps {
  collapsed?: boolean;
  className?: string;
}

export function UntitldLogo({ collapsed = false, className }: UntitldLogoProps) {
  return (
    <div className={cn(
      "relative inline-flex items-center justify-center",
      collapsed ? "h-14 w-14" : "min-h-[24px]",
      className
    )}>
      {/* Contained portal badge when collapsed - 52px circle */}
      {collapsed && (
        <div 
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.15) 50%, transparent 100%)',
            boxShadow: '0 0 25px rgba(59, 130, 246, 0.3), 0 0 15px rgba(139, 92, 246, 0.2)',
            filter: 'blur(12px)',
          }}
        />
      )}
      
      <div className="relative flex items-center justify-center">
        {/* UN Text - slides RIGHT into slash with staggered timing */}
        <span
          className={cn(
            "inline-block font-semibold",
            collapsed
              ? "opacity-0 scale-0 translate-x-8 blur-md"
              : "opacity-100 scale-100 translate-x-0 blur-0 text-[11px]"
          )}
          style={{
            transformOrigin: "center right",
            transition: collapsed 
              ? "all 320ms cubic-bezier(0.22, 1, 0.36, 1) 0ms" // UN starts immediately
              : "all 240ms cubic-bezier(0.22, 1, 0.36, 1) 120ms", // UN returns with delay
          }}
        >
          UN
        </span>

        {/* The Slash - Portal with 3-stage animation (anticipation → expansion → convergence) */}
        <span
          className={cn(
            "inline-block font-bold relative",
            collapsed ? "text-4xl" : "text-[11px] mx-0.5"
          )}
          style={{
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: collapsed 
              ? "drop-shadow(0 0 20px rgba(139, 92, 246, 0.8)) drop-shadow(0 0 12px rgba(59, 130, 246, 0.6))" 
              : "none",
            transition: collapsed
              ? "all 240ms cubic-bezier(0.22, 1, 0.36, 1) 120ms" // Portal expands after anticipation
              : "all 180ms cubic-bezier(0.22, 1, 0.36, 1) 0ms",
          }}
        >
          /
          {/* Layered glow effects when collapsed */}
          {collapsed && (
            <>
              <span
                className="absolute inset-0 animate-pulse"
                style={{
                  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ef4444 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "blur(15px)",
                }}
              >
                /
              </span>
              <span
                className="absolute inset-0 animate-ping opacity-70"
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
            </>
          )}
        </span>

        {/* TITLD Text - slides LEFT into slash with 80ms delay */}
        <span
          className={cn(
            "inline-block font-semibold",
            collapsed
              ? "opacity-0 scale-0 -translate-x-8 blur-md"
              : "opacity-100 scale-100 translate-x-0 blur-0 text-[11px]"
          )}
          style={{
            transformOrigin: "center left",
            transition: collapsed
              ? "all 320ms cubic-bezier(0.22, 1, 0.36, 1) 80ms" // TITLD follows 80ms after UN
              : "all 240ms cubic-bezier(0.22, 1, 0.36, 1) 200ms", // TITLD returns last
          }}
        >
          TITLD
        </span>
      </div>
    </div>
  );
}
