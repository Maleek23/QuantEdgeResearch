import { useState, useCallback, useMemo, createContext, useContext } from 'react';

export type ContentDensity = 'minimal' | 'standard' | 'detailed';
export type UserType = 'beginner' | 'intermediate' | 'expert';

interface ContentDensityContextValue {
  density: ContentDensity;
  setDensity: (density: ContentDensity) => void;
  isMinimal: boolean;
  isStandard: boolean;
  isDetailed: boolean;
  collapseAll: () => void;
  expandAll: () => void;
  getDefaultDensity: (userType: UserType) => ContentDensity;
}

const ContentDensityContext = createContext<ContentDensityContextValue | null>(null);

export function ContentDensityProvider({ 
  children, 
  defaultDensity = 'standard' 
}: { 
  children: React.ReactNode;
  defaultDensity?: ContentDensity;
}) {
  const [density, setDensity] = useState<ContentDensity>(defaultDensity);

  const value = useMemo(() => ({
    density,
    setDensity,
    isMinimal: density === 'minimal',
    isStandard: density === 'standard',
    isDetailed: density === 'detailed',
    collapseAll: () => setDensity('minimal'),
    expandAll: () => setDensity('detailed'),
    getDefaultDensity: (userType: UserType): ContentDensity => {
      if (userType === 'beginner') return 'detailed';
      if (userType === 'intermediate') return 'standard';
      return 'minimal';
    },
  }), [density]);

  return (
    <ContentDensityContext.Provider value={value}>
      {children}
    </ContentDensityContext.Provider>
  );
}

const defaultDensityValue: ContentDensityContextValue = {
  density: 'standard',
  setDensity: () => {},
  isMinimal: false,
  isStandard: true,
  isDetailed: false,
  collapseAll: () => {},
  expandAll: () => {},
  getDefaultDensity: (userType: UserType): ContentDensity => {
    if (userType === 'beginner') return 'detailed';
    if (userType === 'intermediate') return 'standard';
    return 'minimal';
  },
};

export function useContentDensity() {
  const context = useContext(ContentDensityContext);
  return context ?? defaultDensityValue;
}

export function DensityControl({ className }: { className?: string }) {
  const { density, setDensity } = useContentDensity();
  
  return (
    <div className={`flex space-x-1 bg-slate-800/50 rounded p-1 ${className || ''}`}>
      <button
        data-testid="button-density-minimal"
        onClick={() => setDensity('minimal')}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
          density === 'minimal' 
            ? 'bg-cyan-500 text-slate-950' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
        }`}
      >
        Minimal
      </button>
      <button
        data-testid="button-density-standard"
        onClick={() => setDensity('standard')}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
          density === 'standard' 
            ? 'bg-cyan-500 text-slate-950' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
        }`}
      >
        Standard
      </button>
      <button
        data-testid="button-density-detailed"
        onClick={() => setDensity('detailed')}
        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
          density === 'detailed' 
            ? 'bg-cyan-500 text-slate-950' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
        }`}
      >
        Detailed
      </button>
    </div>
  );
}
