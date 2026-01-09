import { Settings2, LayoutGrid, Maximize2, Save, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences, type LayoutDensity } from "@/contexts/preferences-context";
import { cn } from "@/lib/utils";

interface PersonalizationToolbarProps {
  onSave?: () => void;
  onReset?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  className?: string;
  compact?: boolean;
}

export function PersonalizationToolbar({
  onSave,
  onReset,
  isDirty = false,
  isSaving = false,
  className,
  compact = false,
}: PersonalizationToolbarProps) {
  const { preferences, updatePreference } = usePreferences();

  const densityOptions: { value: LayoutDensity; label: string }[] = [
    { value: "compact", label: "Compact" },
    { value: "comfortable", label: "Comfortable" },
    { value: "spacious", label: "Spacious" },
  ];

  return (
    <div
      className={cn(
        "flex items-center gap-1 border border-border rounded-md bg-card/50 backdrop-blur-sm px-1 py-0.5",
        className
      )}
      data-testid="personalization-toolbar"
    >
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                data-testid="button-density"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Layout Density</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Layout Density
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={preferences.layoutDensity}
            onValueChange={(v) => updatePreference("layoutDensity", v as LayoutDensity)}
          >
            {densityOptions.map((opt) => (
              <DropdownMenuRadioItem
                key={opt.value}
                value={opt.value}
                className="text-sm"
                data-testid={`density-${opt.value}`}
              >
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {!compact && (
        <>
          <div className="w-px h-4 bg-border mx-0.5" />

          {onReset && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onReset}
                  data-testid="button-reset-layout"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset Layout</TooltipContent>
            </Tooltip>
          )}

          {onSave && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isDirty ? "default" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7", isDirty && "bg-cyan-600 hover:bg-cyan-700")}
                  onClick={onSave}
                  disabled={!isDirty || isSaving}
                  data-testid="button-save-layout"
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isDirty ? "Save Layout" : "No Changes"}
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </div>
  );
}
