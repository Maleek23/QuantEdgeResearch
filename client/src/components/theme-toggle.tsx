import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className, showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative group",
        "text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground",
        "hover:bg-gray-100 dark:hover:bg-muted",
        "transition-all duration-200",
        className
      )}
      data-testid="button-theme-toggle"
    >
      <Sun className={cn(
        "h-4 w-4 transition-all duration-300",
        isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
      )} />
      <Moon className={cn(
        "absolute h-4 w-4 transition-all duration-300",
        isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
      )} />
      {showLabel && (
        <span className="ml-2 text-xs font-medium">
          {isDark ? "Dark" : "Light"}
        </span>
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
