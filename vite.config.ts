import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/**
 * `/` preload (build only): the landing is a lazy route chunk, so on its own its JS
 * and CSS would only be requested after the 460 KB main bundle has run. This injects
 * a tiny inline script into index.html that, on `/` for a visitor, preloads the
 * landing chunk's JS (modulepreload) and stylesheet (preload as=style) in parallel
 * with the main bundle. Same hrefs + crossorigin as Vite's own preload helper, so
 * the later import() reuses these fetches. Paired with App.tsx importLanding (one
 * import promise, which waits for the CSS) and the index.html landing skeleton.
 */
function landingPreload(): Plugin {
  return {
    name: "qe-landing-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {});
        const landing = chunks.find((c) => c.type === "chunk" && !!c.facadeModuleId && /[\\/]client[\\/]src[\\/]pages[\\/]landing-v2\.tsx$/.test(c.facadeModuleId));
        if (!landing || landing.type !== "chunk") return;
        const entry = chunks.find((c) => c.type === "chunk" && c.isEntry);
        const css = [...(landing.viteMetadata?.importedCss ?? [])];
        const js = [landing.fileName, ...landing.imports.filter((f) => f !== entry?.fileName)];
        const deps = [...css.map((f) => ["s", "/" + f]), ...js.map((f) => ["m", "/" + f])];
        if (!deps.length) return;
        return [{
          tag: "script",
          injectTo: "head-prepend",
          children: `(function(){try{if(location.pathname!=="/"||localStorage.getItem("qe-auth-hint")==="1")return}catch(e){}${JSON.stringify(deps)}.forEach(function(d){var l=document.createElement("link");if(d[0]==="s"){l.rel="preload";l.as="style"}else l.rel="modulepreload";l.href=d[1];l.crossOrigin="";document.head.appendChild(l)})})();`,
        }];
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    landingPreload(),
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
    // Let Vite/Rollup handle chunk splitting automatically.
    // Manual chunking causes circular dependency TDZ crashes between vendor packages.
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
