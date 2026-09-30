import { lazy, ComponentType } from "react";
import { isChunkLoadError as isStaleChunkError, showNewVersionBanner } from "@/lib/stale-bundle";

/**
 * Enhanced lazy import with automatic retry and cache-busting reload.
 *
 * Problem: After a new deployment, Vite generates new chunk hashes (e.g., stock-detail-Abc123.js).
 * Users with cached HTML still reference old chunk names → 404 → "Failed to fetch dynamically imported module".
 *
 * Solution:
 * 1. Retry the import up to 3 times with increasing delays
 * 2. On final failure, force a full page reload (clears the cached HTML that has stale chunk references)
 * 3. Use sessionStorage flag to prevent infinite reload loops
 */

const RELOAD_FLAG_PREFIX = "chunk_reload_";
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 2000]; // ms between retries

const isChunkLoadError = isStaleChunkError;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drop-in replacement for React.lazy() that handles chunk load failures gracefully.
 *
 * Usage:
 *   const StockDetail = lazyWithRetry(() => import("@/pages/stock-detail"));
 *
 * Instead of:
 *   const StockDetail = lazy(() => import("@/pages/stock-detail"));
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  moduleName?: string
) {
  return lazy(async () => {
    const pageKey = moduleName || importFn.toString().slice(0, 100);
    const reloadKey = RELOAD_FLAG_PREFIX + btoa(pageKey).slice(0, 20);

    // Try the import with retries
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const module = await importFn();
        // Success — clear any reload flag
        sessionStorage.removeItem(reloadKey);
        return module;
      } catch (error) {
        if (!isChunkLoadError(error)) {
          // Not a chunk load error — throw immediately
          throw error;
        }

        console.warn(
          `[LazyLoad] Chunk load failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
          error instanceof Error ? error.message : error
        );

        if (attempt < MAX_RETRIES) {
          // Wait before retrying
          await sleep(RETRY_DELAYS[attempt]);
        }
      }
    }

    // All retries exhausted — check if we already tried a reload
    const hasReloaded = sessionStorage.getItem(reloadKey);
    if (!hasReloaded) {
      // Force reload to get fresh HTML with correct chunk references
      console.warn("[LazyLoad] All retries failed. Reloading page to fetch updated chunks...");
      sessionStorage.setItem(reloadKey, "1");
      showNewVersionBanner({ autoReloadMs: 600 });
      // Wait briefly for the reload to take effect, then reject so Suspense doesn't hang forever
      return new Promise<{ default: T }>((_, reject) => {
        setTimeout(() => reject(new Error('Reloading to fetch updated code...')), 8000);
      });
    }

    // Already reloaded once and still failing — clear flag and show error
    sessionStorage.removeItem(reloadKey);
    throw new Error(
      `Failed to load page module after retries and reload. ` +
      `Please clear your browser cache and try again, or contact support.`
    );
  });
}
