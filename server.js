/**
 * خادم ملفات ثابتة صغير بلا أي تبعيات خارجية.
 * يقدّم محتويات مجلد public على المنفذ PORT (افتراضياً 3000) وعلى كل الواجهات.
 *
 * التشغيل: node server.js   أو   npm start
 */
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const COMPRESSIBLE = /\.(html|css|js|mjs|json|svg|txt|webmanifest)$/i;

/** سياسة أمان محتوى صارمة: كل شيء محلي، لا سكربتات أو أنماط خارجية. */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
}

function cacheControlFor(filePath) {
  if (filePath.endsWith(".html")) return "no-cache";
  if (/\/(assets)\//.test(filePath)) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

function sendNotFound(res, headOnly) {
  const body = `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>الصفحة غير موجودة — Burger House</title>
<link rel="stylesheet" href="/css/styles.css"></head>
<body class="error-page"><main><h1>الصفحة غير موجودة</h1>
<p>ربما تم نقل الصفحة أو أن الرابط غير صحيح.</p>
<a class="btn btn--primary" href="/">العودة إلى الرئيسية</a></main></body></html>`;
  setSecurityHeaders(res);
  res.writeHead(404, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(headOnly ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed");
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const headOnly = req.method === "HEAD";

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end(headOnly ? undefined : "ok");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }

    if (pathname.includes("\0")) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request");
      return;
    }

    let filePath = path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    let info;
    try {
      info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        info = await stat(filePath);
      }
    } catch {
      sendNotFound(res, headOnly);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");

    setSecurityHeaders(res);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", cacheControlFor(filePath));
    res.setHeader("Last-Modified", info.mtime.toUTCString());

    if (acceptsGzip && COMPRESSIBLE.test(filePath) && info.size > 512) {
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.writeHead(200);
      if (headOnly) {
        res.end();
        return;
      }
      createReadStream(filePath).pipe(createGzip({ level: 9 })).pipe(res);
      return;
    }

    res.setHeader("Content-Length", info.size);
    res.writeHead(200);
    if (headOnly) {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("خطأ في معالجة الطلب:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Burger House يعمل على http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`\nإيقاف الخادم (${signal})...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
