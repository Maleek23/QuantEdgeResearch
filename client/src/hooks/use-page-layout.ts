import { useState, useCallback, useEffect } from "react";
import { usePreferences, type PageLayout, type WidgetConfig } from "@/contexts/preferences-context";

interface UsePageLayoutOptions {
  pageId: string;
  defaultWidgets?: WidgetConfig[];
  defaultColumns?: number;
  defaultRowHeight?: number;
}

export function usePageLayout({
  pageId,
  defaultWidgets = [],
  defaultColumns = 12,
  defaultRowHeight = 60,
}: UsePageLayoutOptions) {
  const { getLayout, saveLayout, isLoading } = usePreferences();
  const savedLayout = getLayout(pageId);

  const [widgets, setWidgets] = useState<WidgetConfig[]>(
    savedLayout?.widgets || defaultWidgets
  );
  const [columns, setColumns] = useState(savedLayout?.columns || defaultColumns);
  const [rowHeight, setRowHeight] = useState(savedLayout?.rowHeight || defaultRowHeight);
  const [panelSizes, setPanelSizes] = useState<Record<string, number>>(
    savedLayout?.panelSizes || {}
  );
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (savedLayout) {
      setWidgets(savedLayout.widgets || defaultWidgets);
      setColumns(savedLayout.columns || defaultColumns);
      setRowHeight(savedLayout.rowHeight || defaultRowHeight);
      setPanelSizes(savedLayout.panelSizes || {});
    }
  }, [savedLayout, defaultWidgets, defaultColumns, defaultRowHeight]);

  const updateWidget = useCallback((widgetId: string, updates: Partial<WidgetConfig>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, ...updates } : w))
    );
    setIsDirty(true);
  }, []);

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, visible: !w.visible } : w))
    );
    setIsDirty(true);
  }, []);

  const updatePanelSize = useCallback((panelId: string, size: number) => {
    setPanelSizes((prev) => ({ ...prev, [panelId]: size }));
    setIsDirty(true);
  }, []);

  const resetToDefault = useCallback(() => {
    setWidgets(defaultWidgets);
    setColumns(defaultColumns);
    setRowHeight(defaultRowHeight);
    setPanelSizes({});
    setIsDirty(true);
  }, [defaultWidgets, defaultColumns, defaultRowHeight]);

  const save = useCallback(async () => {
    await saveLayout(pageId, {
      pageId,
      layoutName: "custom",
      widgets,
      columns,
      rowHeight,
      panelSizes,
      isDefault: false,
    });
    setIsDirty(false);
  }, [saveLayout, pageId, widgets, columns, rowHeight, panelSizes]);

  return {
    widgets,
    columns,
    rowHeight,
    panelSizes,
    isLoading,
    isDirty,
    updateWidget,
    toggleWidgetVisibility,
    updatePanelSize,
    setWidgets,
    setColumns,
    setRowHeight,
    resetToDefault,
    save,
  };
}
