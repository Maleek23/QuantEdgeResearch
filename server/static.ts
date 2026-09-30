/**
 * Production static serving + the shared `log` helper.
 *
 * Deliberately free of any `vite` import: prod (dist/web.js, dist/worker.js)
 * must never load vite/rollup/babel. Dev-only middleware lives in ./vite.ts and
 * is dynamically imported from the dev branch of the entry points.
 */
import express, { type Express } from "express";
import { renderSeoPage } from "./seo-serve";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Hashed assets (JS/CSS chunks with content hashes) — cache aggressively (1 year).
  // When content changes, Vite generates new filenames, so stale caches are never served.
  app.use(
    "/assets",
    express.static(path.resolve(distPath, "assets"), {
      maxAge: "1y",
      immutable: true,
    })
  );

  // Everything else (index.html, favicon, etc.) — no cache so users always get latest HTML.
  // This ensures new deploys are picked up immediately without chunk hash mismatches.
  app.use(
    express.static(distPath, {
      // "/" must reach the SPA fallback below so it gets the server-injected
      // meta and JSON-LD like every other route (static would serve raw index.html).
      index: false,
      maxAge: 0,
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        // HTML must never be cached — stale HTML references old chunk hashes
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist (SPA routing)
  app.use("*", (req, res) => {
    // Never serve HTML for missing static assets — return 404 so the browser
    // knows the file is gone and doesn't silently try to parse HTML as JS/CSS.
    // Without this, stale cached HTML requesting old chunk hashes (e.g.
    // /assets/index-OLD.js) gets index.html back with 200, the browser tries
    // to parse HTML as JavaScript, fails silently, and the app never mounts.
    if (req.originalUrl.startsWith('/assets/')) {
      return res.status(404).type('text').send('Asset not found');
    }
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    const indexPath = path.resolve(distPath, "index.html");
    fs.readFile(indexPath, "utf-8", async (error, html) => {
      if (error) return res.status(500).type("text").send("Unable to load application");
      const seo = await renderSeoPage(html, req.originalUrl);
      res.status(seo.status).type("html").send(seo.html);
    });
  });
}
