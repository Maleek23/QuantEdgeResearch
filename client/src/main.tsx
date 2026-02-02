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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
