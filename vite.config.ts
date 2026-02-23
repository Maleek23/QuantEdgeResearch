import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(), // Enable to see exact error location
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Target modern browsers for smaller output
    target: "es2020",
    // Increase chunk size warning limit (we're splitting intelligently below)
    chunkSizeWarningLimit: 600,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Minify with esbuild (faster than terser, good compression)
    minify: "esbuild",
    rollupOptions: {
      output: {
        // Split vendor libraries into stable chunks that cache well across deploys.
        // Page chunks change often (new features), but vendor chunks rarely change —
        // so returning users only re-download what actually changed.
        manualChunks(id) {
          // React core — changes rarely, cached long-term
          if (id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // TanStack Query — data fetching layer
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          // Radix UI primitives (used by shadcn/ui)
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // Framer Motion — animation library (large)
          if (id.includes("node_modules/framer-motion/")) {
            return "vendor-framer";
          }
          // Recharts — charting library (d3 stays in vendor-misc to avoid circular TDZ errors)
          if (id.includes("node_modules/recharts/")) {
            return "vendor-recharts";
          }
          // Lucide icons
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          // 3D / Spline / React Three Fiber — only used on landing/specific pages
          if (id.includes("node_modules/@react-three/") ||
              id.includes("node_modules/three/") ||
              id.includes("node_modules/@splinetool/") ||
              id.includes("node_modules/@mediapipe/") ||
              id.includes("node_modules/@dimforge/")) {
            return "vendor-3d";
          }
          // React Spring — animation (used in specific components)
          if (id.includes("node_modules/@react-spring/")) {
            return "vendor-spring";
          }
          // Remotion — video rendering (heavy, rarely loaded)
          if (id.includes("node_modules/@remotion/") ||
              id.includes("node_modules/remotion/")) {
            return "vendor-remotion";
          }
          // Drizzle ORM (shared schema types)
          if (id.includes("node_modules/drizzle-")) {
            return "vendor-drizzle";
          }
          // All other node_modules in one chunk
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    hmr: {
      overlay: true, // Enable error overlay to show exact error location
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
