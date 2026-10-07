import "./lib/insecure-context-polyfills"; // must run before anything touches crypto.randomUUID
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/lux/lux.css";
import "./styles/phone-density.css"; // phone content density — ⓘ sheets, compact stamps, clamps (components/ui/qe-phone.tsx)
import "./styles/modes.css"; // visual modes — html[data-mode] token overrides (lib/visual-mode.ts)
import "./lib/visual-mode"; // applies the saved mode (index.html already did, pre-paint)
import { ErrorBoundary } from "./components/error-boundary";
import { initClientObservability } from "./lib/observability";
import { installStaleBundleGuard } from "./lib/stale-bundle";
import { armBoot } from "./lib/boot";

// Initialize observability immediately (before any other code can throw)
void initClientObservability();
// After a deploy an open tab can load a chunk that no longer exists, or mix old
// and new code ("useRef is not defined"). Detect it, say so, reload once.
installStaleBundleGuard();

// Signal to diagnostic script that the module loaded successfully
(window as any).__QE_LOADED = true;

// Global error handler to catch ALL errors including those not caught by React
window.onerror = function(message, source, lineno, colno, error) {
  console.error('=== GLOBAL ERROR ===');
  console.error('Message:', message);
  console.error('Source:', source);
  console.error('Line:', lineno, 'Column:', colno);
  console.error('Error object:', error);
  console.error('Stack:', error?.stack);
  console.error('====================');
  return false;
};

window.onunhandledrejection = function(event) {
  console.error('=== UNHANDLED PROMISE REJECTION ===');
  console.error('Reason:', event.reason);
  console.error('===================================');
};

// The boot screen (#app-loader) is NOT removed at module load any more — it
// used to vanish before React had painted, exposing a second spinner. After
// React's FIRST commit (so every boot-phase <BootHold/> has registered) it
// leaves as soon as nothing holds it (lib/boot.ts, ui/qe-loading.tsx).
function BootArm() {
  useEffect(() => { armBoot(); }, []);
  return null;
}

const mount = () => createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BootArm />
    <App />
  </ErrorBoundary>
);
// DEV-only phone harness (/dev/gex-phone): fixture API, no server or DB. The
// whole branch (and its chunk) is dropped from production builds.
if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/gex-phone")) {
  import("./dev/gex-phone-mocks").then((m) => { m.installGexPhoneMocks(); mount(); });
} else if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/nexus-workspace")) {
  // DEV-only NEXUS workspace harness (/dev/nexus-workspace): fixture book, no server or DB
  import("./dev/nexus-workspace-mocks").then((m) => { m.installNexusWorkspaceMocks(); mount(); });
} else {
  mount();
}

// PWA installability — the SW is a pure passthrough (no caching; a trading
// terminal must never serve stale bundles). Registered post-load, best-effort.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* not fatal */ });
  });
}
