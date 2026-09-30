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
