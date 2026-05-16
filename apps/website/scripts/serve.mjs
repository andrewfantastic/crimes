// Tiny dev server for the website skeleton. Serves files from `src/`.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "../src");
const port = Number(process.env.PORT ?? 4321);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

createServer(async (req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
  let target = join(srcDir, urlPath === "/" ? "/index.html" : urlPath);
  try {
    const s = await stat(target);
    if (s.isDirectory()) target = join(target, "index.html");
    const ext = extname(target);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    createReadStream(target).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
  }
}).listen(port, () => {
  console.log(`crimes website skeleton: http://localhost:${port}`);
});
