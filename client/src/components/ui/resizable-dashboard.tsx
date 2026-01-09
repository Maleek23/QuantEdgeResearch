import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { usePreferences } from "@/contexts/preferences-context";
import { cn } from "@/lib/utils";

interface PanelConfig {
  id: string;
  defaultSize: number;
  minSize?: number;
  maxSize?: number;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
}

interface ResizableDashboardProps {
  pageId: string;
  direction?: "horizontal" | "vertical";
  panels: PanelConfig[];
  className?: string;
  onLayoutChange?: (sizes: Record<string, number>) => void;
}

export function ResizableDashboard({
  pageId,
  direction = "horizontal",
  panels,
  className,
  onLayoutChange,
}: ResizableDashboardProps) {
  const { getLayout, saveLayout, densityClass } = usePreferences();
  const savedLayout = getLayout(pageId);
  const [sizes, setSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (savedLayout?.panelSizes) {
      setSizes(savedLayout.panelSizes);
    }
  }, [savedLayout]);

  const handleResize = useCallback(
    (panelId: string, size: number) => {
      setSizes((prev) => {
        const updated = { ...prev, [panelId]: size };
        onLayoutChange?.(updated);
        return updated;
      });
    },
    [onLayoutChange]
  );

  const handleResizeEnd = useCallback(() => {
    if (Object.keys(sizes).length > 0) {
      saveLayout(pageId, { panelSizes: sizes });
    }
  }, [saveLayout, pageId, sizes]);

  return (
    <ResizablePanelGroup
      direction={direction}
      className={cn("h-full w-full", densityClass, className)}
      onLayout={(layout) => {
        const newSizes: Record<string, number> = {};
        panels.forEach((panel, index) => {
          if (layout[index] !== undefined) {
            newSizes[panel.id] = layout[index];
          }
        });
        setSizes(newSizes);
      }}
    >
      {panels.map((panel, index) => (
        <div key={panel.id} className="contents">
          <ResizablePanel
            id={panel.id}
            defaultSize={sizes[panel.id] ?? panel.defaultSize}
            minSize={panel.minSize ?? 15}
            maxSize={panel.maxSize ?? 85}
            collapsible={panel.collapsible}
            className={cn("transition-all", panel.className)}
          >
            <div className="h-full w-full overflow-auto">{panel.children}</div>
          </ResizablePanel>
          {index < panels.length - 1 && (
            <ResizableHandle
              withHandle
              className="bg-border/50 hover:bg-cyan-500/30 transition-colors"
            />
          )}
        </div>
      ))}
    </ResizablePanelGroup>
  );
}

interface SimpleTwoColumnLayoutProps {
  pageId: string;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  leftDefaultSize?: number;
  leftMinSize?: number;
  rightMinSize?: number;
  className?: string;
}

export function TwoColumnLayout({
  pageId,
  leftPanel,
  rightPanel,
  leftDefaultSize = 65,
  leftMinSize = 40,
  rightMinSize = 20,
  className,
}: SimpleTwoColumnLayoutProps) {
  return (
    <ResizableDashboard
      pageId={pageId}
      direction="horizontal"
      className={className}
      panels={[
        {
          id: "left",
          defaultSize: leftDefaultSize,
          minSize: leftMinSize,
          children: leftPanel,
        },
        {
          id: "right",
          defaultSize: 100 - leftDefaultSize,
          minSize: rightMinSize,
          children: rightPanel,
        },
      ]}
    />
  );
}

interface ThreeColumnLayoutProps {
  pageId: string;
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  leftDefaultSize?: number;
  centerDefaultSize?: number;
  className?: string;
}

export function ThreeColumnLayout({
  pageId,
  leftPanel,
  centerPanel,
  rightPanel,
  leftDefaultSize = 25,
  centerDefaultSize = 50,
  className,
}: ThreeColumnLayoutProps) {
  return (
    <ResizableDashboard
      pageId={pageId}
      direction="horizontal"
      className={className}
      panels={[
        {
          id: "left",
          defaultSize: leftDefaultSize,
          minSize: 15,
          children: leftPanel,
          collapsible: true,
        },
        {
          id: "center",
          defaultSize: centerDefaultSize,
          minSize: 30,
          children: centerPanel,
        },
        {
          id: "right",
          defaultSize: 100 - leftDefaultSize - centerDefaultSize,
          minSize: 15,
          children: rightPanel,
          collapsible: true,
        },
      ]}
    />
  );
}
