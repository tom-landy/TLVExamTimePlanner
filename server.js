import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import process from "node:process";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.RENDER ? "0.0.0.0" : process.env.HOST || "127.0.0.1";
const ROOT = process.cwd();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safePath(requestedPath);

  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const fallbackPath = join(ROOT, "index.html");
  const targetPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : fallbackPath;
  const extension = extname(targetPath);

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(targetPath).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`Exam planner is running on http://${HOST}:${PORT}`);
});

function safePath(requestedPath) {
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(ROOT, normalizedPath);
  return absolutePath.startsWith(ROOT) ? absolutePath : null;
}
