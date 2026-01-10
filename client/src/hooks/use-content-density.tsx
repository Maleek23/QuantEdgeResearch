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

export function useContentDensity() {
  const context = useContext(ContentDensityContext);
  
  if (!context) {
    const [density, setDensity] = useState<ContentDensity>('standard');
    
    return {
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
    };
  }
  
  return context;
}

export function DensityControl({ className }: { className?: string }) {
  const { density, setDensity } = useContentDensity();
  
  return (
    <div className={`flex space-x-1 bg-slate-800/50 rounded p-1 ${className || ''}`}>
      <button
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
