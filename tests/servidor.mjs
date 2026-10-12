// Servidor estático de teste que aplica site/_headers (como o Cloudflare Pages).
// Uso: node tests/servidor.mjs [porta]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
const raiz = path.resolve("site"), porta = Number(process.argv[2] || 8766);
const regras = [];
let atual = null;
for (const l of readFileSync(path.join(raiz, "_headers"), "utf8").split("\n")) {
  if (!l.trim() || l.trim().startsWith("#")) continue;
  if (!/^\s/.test(l)) { atual = { padrao: l.trim(), h: {} }; regras.push(atual); }
  else { const i = l.indexOf(":"); atual.h[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
}
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json", ".gz": "application/gzip", ".txt": "text/plain" };
createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (u.endsWith("/")) u += "index.html";
  const f = path.join(raiz, u);
  if (!f.startsWith(raiz) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("404"); return; }
  const h = { "Content-Type": tipos[path.extname(f)] || "application/octet-stream" };
  for (const r of regras) {
    const re = new RegExp("^" + r.padrao.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    if (re.test(u)) Object.assign(h, r.h);
  }
  res.writeHead(200, h);
  res.end(readFileSync(f));
}).listen(porta, () => console.log("http://localhost:" + porta));
