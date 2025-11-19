import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress Vite dev-banner plugin error (cosmetic only, doesn't affect functionality)
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes("Cannot read properties of undefined (reading 'replit')")) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

// Suppress unhandled promise rejections from the same plugin
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message?.includes("Cannot read properties of undefined (reading 'replit')")) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
