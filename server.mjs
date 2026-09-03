import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import insightsHandler from "./api/insights.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function loadLocalEnv() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.hasOwn(process.env, key)) process.env[key] = value;
  }
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
}

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const isPublicPath = requested === "/index.html"
    || requested.startsWith("/assets/")
    || requested.startsWith("/src/");
  if (!isPublicPath || requested.split("/").some((part) => part.startsWith("."))) return null;
  const normalized = normalize(requested).replace(/^([.][.][/\\])+/, "");
  const filePath = resolve(ROOT, `.${sep}${normalized}`);
  return filePath.startsWith(ROOT) ? filePath : null;
}

loadLocalEnv();

function readCliOption(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

const PORT = Number(readCliOption("--port") || process.env.PORT) || 4173;
const HOST = readCliOption("--host") || process.env.HOST || "127.0.0.1";

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === "/api/insights") {
    await insightsHandler(req, res);
    return;
  }

  if (url.pathname === "/api/health") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }));
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || "")) {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not Found");
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", MIME_TYPES.get(extname(filePath)) || "application/octet-stream");
  res.setHeader("Cache-Control", extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600");
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`Momentum запущен: http://${HOST}:${PORT}`);
  console.log(`AI: ${process.env.OPENAI_API_KEY ? "настроен" : "демо-режим"}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
