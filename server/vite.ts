/**
 * DEV ONLY — Vite middleware. Imported dynamically from the development branch
 * of server/index.ts and server/web.ts so production never loads vite, rollup,
 * @vitejs/plugin-react (babel) or the vite config. `vite` itself is also
 * imported lazily so even a stray static import of this file stays cheap.
 */
import { type Express } from "express";
import { renderSeoPage } from "./seo-serve";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";

export { log, serveStatic } from "./static";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();
  const vite = await createViteServer({
    // Load the project config from disk (same file as before) instead of a
    // static import, which would drag vite + plugins into the prod bundle.
    configFile: path.resolve(import.meta.dirname, "..", "vite.config.ts"),
    customLogger: {
      ...viteLogger,
      error: (msg: string, options?: Parameters<typeof viteLogger.error>[1]) => {
        viteLogger.error(msg, options);
        // A source edit can briefly be invalid while it is being written. Vite can
        // recover on the next edit; killing Express here makes the whole preview
        // vanish and, unlike PM2, the preview launcher does not restart it.
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      const seo = await renderSeoPage(page, url);
      res.status(seo.status).set({ "Content-Type": "text/html" }).end(seo.html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

