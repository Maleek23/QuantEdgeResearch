import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { workspacePresets, zIndex } from "@/lib/design-tokens";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { usePreferences } from "@/contexts/preferences-context";
import {
  Maximize2,
  Minimize2,
  Layout,
  Columns2,
  Columns3,
  Grid2x2,
  PanelLeft,
  Focus,
} from "lucide-react";

/**
 * QuantEdge Workspace System
 * ==========================
 * Multi-panel resizable workspace for traders who need multiple views.
 *
 * Built on top of react-resizable-panels (already in the project).
 * Extends the existing ResizableDashboard with:
 *   - Preset layouts (focus, split, sidebar, triple, tradeDesk, quad)
 *   - Fullscreen toggle per panel
 *   - Layout switcher toolbar
 *   - Persistent layout via preferences context
 *
 * Usage:
 *   import { QEWorkspace, QEWorkspacePanel } from "@/components/ui/qe-workspace";
 *
 *   <QEWorkspace
 *     id="trade-desk"
 *     preset="tradeDesk"
 *     onPresetChange={setPreset}
 *   >
 *     <QEWorkspacePanel id="chart" title="Price Chart" minSize={20}>
 *       <ChartWidget />
 *     </QEWorkspacePanel>
 *     <QEWorkspacePanel id="orders" title="Order Book" minSize={15}>
 *       <OrderBookWidget />
 *     </QEWorkspacePanel>
 *     <QEWorkspacePanel id="positions" title="Positions" minSize={15}>
 *       <PositionsWidget />
 *     </QEWorkspacePanel>
 *   </QEWorkspace>
 */

// =============================================================================
// TYPES
// =============================================================================

export type WorkspacePreset = keyof typeof workspacePresets;

export interface WorkspacePanelConfig {
  id: string;
  title?: string;
  icon?: React.ReactNode;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  children: React.ReactNode;
}

// =============================================================================
// QEWorkspacePanel -- Used as children of QEWorkspace (declarative config)
// =============================================================================

export interface QEWorkspacePanelProps {
  id: string;
  title?: string;
  icon?: React.ReactNode;
  minSize?: number;
  maxSize?: number;
  collapsible?: boolean;
  children: React.ReactNode;
}

/**
 * Declarative panel config component.
 * Does NOT render anything itself -- QEWorkspace reads its props.
 */
export function QEWorkspacePanel(_props: QEWorkspacePanelProps): null {
  return null;
}
QEWorkspacePanel.displayName = "QEWorkspacePanel";

// =============================================================================
// QEWorkspaceToolbar -- Layout preset switcher
// =============================================================================

interface QEWorkspaceToolbarProps {
  currentPreset: WorkspacePreset;
  onPresetChange: (preset: WorkspacePreset) => void;
  panelCount: number;
  className?: string;
}

const presetIcons: Record<WorkspacePreset, React.ReactNode> = {
  focus: <Focus className="w-3.5 h-3.5" />,
  split: <Columns2 className="w-3.5 h-3.5" />,
  sidebar: <PanelLeft className="w-3.5 h-3.5" />,
  triple: <Columns3 className="w-3.5 h-3.5" />,
  tradeDesk: <Layout className="w-3.5 h-3.5" />,
  quad: <Grid2x2 className="w-3.5 h-3.5" />,
};

const presetLabels: Record<WorkspacePreset, string> = {
  focus: "Focus",
  split: "Split",
  sidebar: "Sidebar",
  triple: "Triple",
  tradeDesk: "Trade Desk",
  quad: "Quad",
};

function QEWorkspaceToolbar({
  currentPreset,
  onPresetChange,
  panelCount,
  className,
}: QEWorkspaceToolbarProps) {
  // Only show presets that work with the number of panels available
  const availablePresets = (Object.keys(workspacePresets) as WorkspacePreset[]).filter(
    (preset) => {
      const config = workspacePresets[preset];
      const totalSlots = config.cols * config.rows;
      return totalSlots <= panelCount;
    }
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]",
        className
      )}
    >
      {availablePresets.map((preset) => (
        <button
          key={preset}
          onClick={() => onPresetChange(preset)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all",
            preset === currentPreset
              ? "bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-[#00d4ff]"
              : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
          )}
          title={presetLabels[preset]}
        >
          {presetIcons[preset]}
          <span className="hidden sm:inline">{presetLabels[preset]}</span>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Panel Header Bar -- Title + fullscreen toggle inside each panel
// =============================================================================

interface PanelHeaderProps {
  title?: string;
  icon?: React.ReactNode;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

function PanelHeader({ title, icon, isFullscreen, onToggleFullscreen }: PanelHeaderProps) {
  if (!title) return null;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02] flex-shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider truncate font-display">
          {title}
        </span>
      </div>
      <button
        onClick={onToggleFullscreen}
        className="p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-white transition-colors flex-shrink-0"
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? (
          <Minimize2 className="w-3.5 h-3.5" />
        ) : (
          <Maximize2 className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// =============================================================================
// QEWorkspace -- Main workspace component
// =============================================================================

export interface QEWorkspaceProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Unique workspace ID for layout persistence */
  id: string;
  /** Current layout preset */
  preset?: WorkspacePreset;
  /** Called when user changes preset */
  onPresetChange?: (preset: WorkspacePreset) => void;
  /** Show the layout toolbar (default: true) */
  showToolbar?: boolean;
  /** Direction for the main split */
  direction?: "horizontal" | "vertical";
  /** Children must be QEWorkspacePanel components */
  children: React.ReactNode;
}

export function QEWorkspace({
  id,
  preset: controlledPreset,
  onPresetChange,
  showToolbar = true,
  direction = "horizontal",
  className,
  children,
  ...props
}: QEWorkspaceProps) {
  // ── Extract panel configs from children ──────────────────────────────────
  const panels: WorkspacePanelConfig[] = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<QEWorkspacePanelProps> =>
        React.isValidElement(child) && child.type === QEWorkspacePanel
    )
    .map((child) => ({
      id: child.props.id,
      title: child.props.title,
      icon: child.props.icon,
      minSize: child.props.minSize,
      maxSize: child.props.maxSize,
      collapsible: child.props.collapsible,
      children: child.props.children,
    }));

  // ── Preset state ─────────────────────────────────────────────────────────
  const [internalPreset, setInternalPreset] = useState<WorkspacePreset>("split");
  const activePreset = controlledPreset ?? internalPreset;

  const handlePresetChange = useCallback(
    (p: WorkspacePreset) => {
      if (onPresetChange) {
        onPresetChange(p);
      } else {
        setInternalPreset(p);
      }
    },
    [onPresetChange]
  );

  // ── Fullscreen state ─────────────────────────────────────────────────────
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

  const toggleFullscreen = useCallback((panelId: string) => {
    setFullscreenPanel((prev) => (prev === panelId ? null : panelId));
  }, []);

  // ── Layout persistence ───────────────────────────────────────────────────
  const { getLayout, saveLayout } = usePreferences();
  const savedLayout = getLayout(`workspace-${id}`);
  const hasMountedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      hasMountedRef.current = true;
    }, 200);
    return () => {
      clearTimeout(timer);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleLayoutChange = useCallback(
    (sizes: number[]) => {
      if (!hasMountedRef.current) return;

      const newSizes: Record<string, number> = {};
      panels.forEach((p, i) => {
        if (sizes[i] !== undefined) newSizes[p.id] = sizes[i];
      });

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveLayout(`workspace-${id}`, { panelSizes: newSizes });
      }, 600);
    },
    [panels, id, saveLayout]
  );

  // ── Compute default sizes from preset ────────────────────────────────────
  const getDefaultSizes = useCallback((): number[] => {
    // Check saved sizes first
    if (savedLayout?.panelSizes) {
      const saved = panels.map((p) => savedLayout.panelSizes?.[p.id]);
      if (saved.every((s) => s !== undefined)) return saved as number[];
    }

    // Calculate from preset
    const presetConfig = workspacePresets[activePreset];
    const totalSlots = presetConfig.cols * presetConfig.rows;
    const templateParts = presetConfig.template.split(" ");

    // Parse template fractions
    const frValues = templateParts.map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)fr$/);
      if (match) return parseFloat(match[1]);
      // For fixed values like "320px", approximate as 1fr
      return 1;
    });

    const totalFr = frValues.reduce((sum, v) => sum + v, 0);
    const baseSizes = frValues.map((v) => (v / totalFr) * 100);

    // Map to actual panels (repeat or trim to match panel count)
    return panels.map((_, i) => {
      if (i < baseSizes.length) return baseSizes[i];
      // Extra panels get equal share of remaining space
      return 100 / panels.length;
    });
  }, [activePreset, panels, savedLayout]);

  // ── Render ───────────────────────────────────────────────────────────────

  // If a panel is fullscreen, just show that one
  if (fullscreenPanel) {
    const panel = panels.find((p) => p.id === fullscreenPanel);
    if (panel) {
      return (
        <div className={cn("relative h-full", className)} {...props}>
          {showToolbar && (
            <div className="flex items-center justify-between mb-2">
              <QEWorkspaceToolbar
                currentPreset={activePreset}
                onPresetChange={handlePresetChange}
                panelCount={panels.length}
              />
            </div>
          )}
          <div className="rounded-lg bg-[#0c1219]/80 border border-white/[0.08] backdrop-blur-md h-[calc(100%-2.5rem)] overflow-hidden flex flex-col">
            <PanelHeader
              title={panel.title}
              icon={panel.icon}
              isFullscreen={true}
              onToggleFullscreen={() => toggleFullscreen(panel.id)}
            />
            <div className="flex-1 overflow-auto">{panel.children}</div>
          </div>
        </div>
      );
    }
  }

  // Determine layout direction based on preset
  const presetConfig = workspacePresets[activePreset];
  const isGridLayout = presetConfig.rows > 1;
  const defaultSizes = getDefaultSizes();

  // For grid layouts (tradeDesk, quad), we need nested groups
  if (isGridLayout && panels.length >= 3) {
    return (
      <div className={cn("relative h-full flex flex-col", className)} {...props}>
        {showToolbar && (
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <QEWorkspaceToolbar
              currentPreset={activePreset}
              onPresetChange={handlePresetChange}
              panelCount={panels.length}
            />
          </div>
        )}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full w-full"
            onLayout={handleLayoutChange}
          >
            {/* Left / main panel */}
            <ResizablePanel
              id={panels[0].id}
              defaultSize={defaultSizes[0]}
              minSize={panels[0].minSize ?? 25}
              className="h-full"
            >
              <div className="h-full rounded-lg bg-[#0c1219]/80 border border-white/[0.08] backdrop-blur-md overflow-hidden flex flex-col">
                <PanelHeader
                  title={panels[0].title}
                  icon={panels[0].icon}
                  isFullscreen={false}
                  onToggleFullscreen={() => toggleFullscreen(panels[0].id)}
                />
                <div className="flex-1 overflow-auto">{panels[0].children}</div>
              </div>
            </ResizablePanel>

            <ResizableHandle
              withHandle
              className="bg-transparent hover:bg-[#00d4ff]/20 transition-colors mx-1"
            />

            {/* Right stacked panels */}
            <ResizablePanel
              id="right-stack"
              defaultSize={100 - defaultSizes[0]}
              minSize={20}
              className="h-full"
            >
              <ResizablePanelGroup direction="vertical" className="h-full">
                {panels.slice(1).map((panel, idx) => (
                  <React.Fragment key={panel.id}>
                    {idx > 0 && (
                      <ResizableHandle
                        withHandle
                        className="bg-transparent hover:bg-[#00d4ff]/20 transition-colors my-1"
                      />
                    )}
                    <ResizablePanel
                      id={panel.id}
                      defaultSize={100 / (panels.length - 1)}
                      minSize={panel.minSize ?? 15}
                      collapsible={panel.collapsible}
                    >
                      <div className="h-full rounded-lg bg-[#0c1219]/80 border border-white/[0.08] backdrop-blur-md overflow-hidden flex flex-col">
                        <PanelHeader
                          title={panel.title}
                          icon={panel.icon}
                          isFullscreen={false}
                          onToggleFullscreen={() => toggleFullscreen(panel.id)}
                        />
                        <div className="flex-1 overflow-auto">{panel.children}</div>
                      </div>
                    </ResizablePanel>
                  </React.Fragment>
                ))}
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    );
  }

  // Standard horizontal/vertical split for non-grid layouts
  return (
    <div className={cn("relative h-full flex flex-col", className)} {...props}>
      {showToolbar && (
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <QEWorkspaceToolbar
            currentPreset={activePreset}
            onPresetChange={handlePresetChange}
            panelCount={panels.length}
          />
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction={direction}
          className="h-full w-full"
          onLayout={handleLayoutChange}
        >
          {panels.map((panel, idx) => (
            <React.Fragment key={panel.id}>
              {idx > 0 && (
                <ResizableHandle
                  withHandle
                  className="bg-transparent hover:bg-[#00d4ff]/20 transition-colors mx-1"
                />
              )}
              <ResizablePanel
                id={panel.id}
                defaultSize={defaultSizes[idx]}
                minSize={panel.minSize ?? 15}
                maxSize={panel.maxSize ?? 85}
                collapsible={panel.collapsible}
              >
                <div className="h-full rounded-lg bg-[#0c1219]/80 border border-white/[0.08] backdrop-blur-md overflow-hidden flex flex-col">
                  <PanelHeader
                    title={panel.title}
                    icon={panel.icon}
                    isFullscreen={false}
                    onToggleFullscreen={() => toggleFullscreen(panel.id)}
                  />
                  <div className="flex-1 overflow-auto">{panel.children}</div>
                </div>
              </ResizablePanel>
            </React.Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
