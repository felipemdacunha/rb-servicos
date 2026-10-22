import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApi } from "./api";
import { openDatabase, type DatabaseTarget } from "./db";

try { process.loadEnvFile(); } catch { /* .env é opcional */ }

const isDev = process.argv.includes("--dev");
const port = Number(process.env.PORT ?? 3000);
// Nuvem: banco no Turso. Sem TURSO_DATABASE_URL, usa um arquivo local.
const target: DatabaseTarget = process.env.TURSO_DATABASE_URL
  ? { url: process.env.TURSO_DATABASE_URL.trim(), authToken: process.env.TURSO_AUTH_TOKEN?.trim() }
  : resolve(process.env.DATABASE_PATH ?? "./data/rb-servicos.db");

const db = await openDatabase(target);
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? true : "loopback");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  if (!isDev) {
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
      "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
    ].join("; "));
  }
  next();
});

app.use("/api", createApi(db, { secureCookies: process.env.COOKIE_SECURE === "true" }));

if (isDev) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  const publicDir = resolve(import.meta.dirname, "public");
  if (!existsSync(publicDir)) {
    console.error("Build não encontrado. Rode `npm run build` antes de `npm start`.");
    process.exit(1);
  }
  app.use(express.static(publicDir, {
    index: false,
    setHeaders: (res, path) => {
      if (/[\\/]assets[\\/]/.test(path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
  app.get(/^\/(assets|icons)\//, (_req, res) => res.status(404).type("text/plain").send("Arquivo não encontrado."));
  app.get("*", (_req, res) => res.setHeader("Cache-Control", "no-cache").sendFile(resolve(publicDir, "index.html")));
}

app.listen(port, () => {
  console.log(`R&B Serviços rodando em http://localhost:${port} (${isDev ? "desenvolvimento" : "produção"})`);
  console.log(`Banco de dados: ${db.kind === "turso" ? "Turso (nuvem)" : target}`);
});
