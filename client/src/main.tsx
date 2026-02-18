import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/error-boundary";

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

// Remove the inline HTML loading indicator once React takes over
const appLoader = document.getElementById("app-loader");
if (appLoader) {
  appLoader.style.transition = "opacity 0.3s ease-out";
  appLoader.style.opacity = "0";
  setTimeout(() => appLoader.remove(), 300);
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
