import { cn } from "@/lib/utils";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

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
      <img 
        src={quantEdgeLabsLogoUrl} 
        alt="Quant Edge Labs" 
        className={cn("object-contain", sizeClasses[size])}
      />
      
      {!collapsed && (
        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Quant Edge
          </span>
          <span className="text-[10px] font-medium text-muted-foreground tracking-wide uppercase">
            Labs
          </span>
        </div>
      )}
    </div>
  );
}

export function QuantEdgeIcon({ className }: { className?: string }) {
  return (
    <img 
      src={quantEdgeLabsLogoUrl} 
      alt="Quant Edge Labs" 
      className={cn("h-8 w-8 object-contain", className)}
    />
  );
}
