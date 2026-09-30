import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { readSym, replaceUrlParams, SYM_PARAM } from "@/lib/url-state";

/** The terminal (/t) carries the focus ticker in ?sym= so a copied link reopens it. */
const URL_SYNC_PATH = "/t";

interface StockInfo {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
}

interface StockContextValue {
  currentStock: StockInfo | null;
  setCurrentStock: (stock: StockInfo | null) => void;
  clearStock: () => void;
}

const StockContext = createContext<StockContextValue | undefined>(undefined);

export function StockContextProvider({ children }: { children: ReactNode }) {
  const [currentStock, setCurrentStockState] = useState<StockInfo | null>(() => {
    if (typeof window === "undefined") return null;
    // A link's ?sym= wins over this tab's remembered ticker.
    if (window.location.pathname === URL_SYNC_PATH) {
      const fromUrl = readSym(window.location.search);
      if (fromUrl) {
        try { sessionStorage.setItem("quantedge_current_stock", JSON.stringify({ symbol: fromUrl })); } catch { /* ignore */ }
        return { symbol: fromUrl };
      }
    }
    try {
      const stored = sessionStorage.getItem("quantedge_current_stock");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setCurrentStock = useCallback((stock: StockInfo | null) => {
    setCurrentStockState(stock);
    // Store in sessionStorage for persistence across page navigation
    if (stock) {
      sessionStorage.setItem("quantedge_current_stock", JSON.stringify(stock));
    } else {
      sessionStorage.removeItem("quantedge_current_stock");
    }
  }, []);

  const clearStock = useCallback(() => {
    setCurrentStockState(null);
    sessionStorage.removeItem("quantedge_current_stock");
  }, []);

  return (
    <StockContext.Provider value={{ currentStock, setCurrentStock, clearStock }}>
      <FocusUrlSync symbol={currentStock?.symbol ?? null} setSymbol={(symbol) => setCurrentStock({ symbol })} />
      {children}
    </StockContext.Provider>
  );
}

export function useStockContext() {
  const context = useContext(StockContext);
  if (context === undefined) {
    throw new Error("useStockContext must be used within StockContextProvider");
  }
  return context;
}

/**
 * ?sym= ⇄ focus ticker inside /t (replaceState only — never a history entry).
 *   URL changed on its own (Back/Forward, a pasted link, NEXUS writing its
 *   selection) → the focus follows the URL.
 *   Focus changed (search, a row click) → the URL follows; a stale ?idea= for
 *   another symbol is dropped so NEXUS doesn't snap back to it.
 *   A tab switch strips the query → ?sym= is written back.
 */
function FocusUrlSync({ symbol, setSymbol }: { symbol: string | null; setSymbol: (s: string) => void }) {
  const [path] = useLocation();
  const search = useSearch();
  const lastUrl = useRef<string | null | undefined>(undefined);
  const lastCur = useRef<string | null | undefined>(undefined);
  const cur = symbol ? symbol.toUpperCase() : null;
  useEffect(() => {
    if (path !== URL_SYNC_PATH || typeof window === "undefined") return;
    const u = readSym(window.location.search);
    const first = lastUrl.current === undefined;
    const urlChanged = !first && u !== lastUrl.current;
    const curChanged = !first && cur !== lastCur.current;
    lastUrl.current = u;
    lastCur.current = cur;
    if (urlChanged && u && !curChanged) {
      if (u !== cur) { lastCur.current = u; setSymbol(u); }
      return;
    }
    if (cur && u !== cur) {
      const patch: Record<string, string | null> = { [SYM_PARAM]: cur };
      if (u) patch.idea = null;
      replaceUrlParams(patch);
      lastUrl.current = cur;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, search, cur]);
  return null;
}
