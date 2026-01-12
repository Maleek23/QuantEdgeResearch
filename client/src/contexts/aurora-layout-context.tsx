import { createContext, useContext, useState, ReactNode } from "react";

interface AuroraLayoutContextType {
  railCollapsed: boolean;
  setRailCollapsed: (collapsed: boolean) => void;
  railWidth: number;
}

const AuroraLayoutContext = createContext<AuroraLayoutContextType | null>(null);

export function AuroraLayoutProvider({ children }: { children: ReactNode }) {
  const [railCollapsed, setRailCollapsed] = useState(true);
  
  const railWidth = railCollapsed ? 68 : 200;

  return (
    <AuroraLayoutContext.Provider value={{ railCollapsed, setRailCollapsed, railWidth }}>
      {children}
    </AuroraLayoutContext.Provider>
  );
}

export function useAuroraLayout() {
  const context = useContext(AuroraLayoutContext);
  if (!context) {
    return { railCollapsed: true, setRailCollapsed: () => {}, railWidth: 68 };
  }
  return context;
}
