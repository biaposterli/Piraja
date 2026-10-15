// Mapas — desenho: figura no padrão cartográfico (para artigo/PDF, exportada
// em PNG/TIFF 300 dpi) e mapa interativo. Tradução da parte gráfica de
// mapas.py (o layout da figura reproduz o da figura do matplotlib).

import { esc } from "./util.js";
import { RAMPA, FONTE_MALHA, SRC_TXT, poligonos, contem, areaGeom, corDe, rotulosClasses, intersectaCaixa } from "./mapa-dados.js";
import { larguraTexto } from "./graficos.js";

const TINTA = "#1B2421", TINTA_SUAVE = "#4E5B55", MATA = "#11483D", COBRE = "#9C4A2F";
const LINHA = "#DCD6C8", SEM_DADO = "#ECE8DF", FUNDO = "#F7FAFB", BORDA = "#B9B3A6";

// figura de 7,6 x 6,0 polegadas desenhada em pixels de 150 dpi (como no matplotlib)
const DPI = 150, PT = DPI / 72;
const FW = 7.6 * DPI, FH = 6.0 * DPI;
const FONTE = "Instrument Sans";

const br = (v, d = 1) => Number(v).toFixed(d).replace(".", ",");
const fmtG = (v) => String(Number(Number(v).toPrecision(6))).replace(".", ",");
const tam = (n, nmax) => 40 + 520 * (n / Math.max(nmax, 1)); // área do círculo em pt²

// ---------------------------------------------------------------------------
// geometria -> caminho SVG
// ---------------------------------------------------------------------------
function caminho(geom, X, Y, tol = 0.35) {
  let d = "";
  for (const pol of poligonos(geom)) {
    for (const anel of pol) {
      let px = null, py = null, n = 0, seg = "";
      for (let i = 0; i < anel.length; i++) {
        const x = X(anel[i][0]), y = Y(anel[i][1]);
        if (px !== null && i < anel.length - 1 && Math.abs(x - px) < tol && Math.abs(y - py) < tol) continue;
        seg += (n ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
        px = x; py = y; n++;
      }
      if (n >= 3) d += seg + "Z";
    }
  }
  return d;
}

function camada(feats, X, Y, fill, stroke, sw, extra = "") {
  const ds = feats.map((f) => caminho(f.geom, X, Y)).filter(Boolean);
  if (!ds.length) return "";
  return `<path d="${ds.join("")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" fill-rule="evenodd"${extra}/>`;
}

function contornoSemPreenchimento(feats, X, Y, stroke, sw) {
  return camada(feats, X, Y, "none", stroke, sw);
}

const texto = (x, y, t, o = {}) => {
  const tr = o.rot ? ` transform="rotate(${o.rot} ${x.toFixed(1)} ${y.toFixed(1)})"` : "";
  const halo = o.halo ? ` stroke="#FFFFFF" stroke-width="${o.halo}" stroke-linejoin="round" paint-order="stroke"` : "";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(o.tam * PT).toFixed(2)}" fill="${o.cor || TINTA}" ` +
    `text-anchor="${o.anc || "start"}" dominant-baseline="${o.base || "auto"}"${o.peso ? ` font-weight="${o.peso}"` : ""}${tr}${halo}>${esc(t)}</text>`;
};

/** Texto de várias linhas centrado verticalmente em y (linespacing do matplotlib). */
function textoMulti(x, y, linhas, o) {
  const lh = o.tam * PT * (o.ls || 1.1) * 1.2;
  const y0 = y - ((linhas.length - 1) * lh) / 2;
  return linhas.map((l, i) => texto(x, y0 + i * lh, l, { ...o, base: "central" })).join("");
}

// ---------------------------------------------------------------------------
// eixos com aspecto 1/cos(lat) (adjustable="box", centralizado)
// ---------------------------------------------------------------------------
function eixos(rect, ext, aspecto) {
  const [rx, ry, rw, rh] = rect; // em px, y para baixo
  const dx = ext[2] - ext[0], dy = ext[3] - ext[1];
  let w = rw, h = rh;
  if ((dy * aspecto) / dx > rh / rw) { h = rh; w = (rh * dx) / (dy * aspecto); } else { w = rw; h = (rw * dy * aspecto) / dx; }
  const x = rx + (rw - w) / 2, y = ry + (rh - h) / 2;
  return { x, y, w, h, ext, X: (lon) => x + ((lon - ext[0]) / dx) * w, Y: (lat) => y + ((ext[3] - lat) / dy) * h,
    inv: (px, py) => [ext[0] + ((px - x) / w) * dx, ext[3] - ((py - y) / h) * dy] };
}

const fig = (fx, fy) => [fx * FW, (1 - fy) * FH]; // fração da figura (y para cima) -> px

// ---------------------------------------------------------------------------
// elementos cartográficos
// ---------------------------------------------------------------------------
function grade(ax) {
  const [x0, y0, x1, y1] = ax.ext;
  const larg = Math.max(x1 - x0, y1 - y0);
  const passos = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  const passo = passos.reduce((m, p) => (Math.abs(larg / p - 5) < Math.abs(larg / m - 5) ? p : m));
  const casas = passo < 0.1 ? 2 : passo < 1 ? 1 : 0;
  // (marcas coladas à borda do quadro ficariam sobre o rótulo do outro eixo)
  const lista = (a, b) => { const o = []; const m = (b - a) * 0.015;
    for (let v = Math.ceil(a / passo) * passo; v < b - 1e-12; v += passo) if (v - a > m && b - v > m) o.push(+v.toFixed(8)); return o; };
  const fx = (v) => `${Math.abs(v).toFixed(casas)}°${v < 0 ? "O" : "L"}`.replace(".", ",");
  const fy = (v) => `${Math.abs(v).toFixed(casas)}°${v < 0 ? "S" : "N"}`.replace(".", ",");
  let s = "";
  const dash = `stroke-dasharray="${(1.2 * PT).toFixed(1)} ${(1.2 * PT).toFixed(1)}"`;
  const tl = 3 * PT, pad = 3.5 * PT, fs = 6.5;
  for (const v of lista(x0, x1)) {
    const X = ax.X(v);
    s += `<line x1="${X.toFixed(1)}" y1="${ax.y}" x2="${X.toFixed(1)}" y2="${ax.y + ax.h}" stroke="${LINHA}" stroke-width="${0.4 * PT}" ${dash}/>`;
    s += `<line x1="${X.toFixed(1)}" y1="${ax.y + ax.h}" x2="${X.toFixed(1)}" y2="${ax.y + ax.h - tl}" stroke="${TINTA_SUAVE}" stroke-width="${0.8 * PT}"/>`;
    s += `<line x1="${X.toFixed(1)}" y1="${ax.y}" x2="${X.toFixed(1)}" y2="${ax.y + tl}" stroke="${TINTA_SUAVE}" stroke-width="${0.8 * PT}"/>`;
    s += texto(X, ax.y + ax.h + pad, fx(v), { tam: fs, cor: TINTA_SUAVE, anc: "middle", base: "hanging" });
    s += texto(X, ax.y - pad, fx(v), { tam: fs, cor: TINTA_SUAVE, anc: "middle" });
  }
  for (const v of lista(y0, y1)) {
    const Y = ax.Y(v);
    s += `<line x1="${ax.x}" y1="${Y.toFixed(1)}" x2="${ax.x + ax.w}" y2="${Y.toFixed(1)}" stroke="${LINHA}" stroke-width="${0.4 * PT}" ${dash}/>`;
    s += `<line x1="${ax.x}" y1="${Y.toFixed(1)}" x2="${ax.x + tl}" y2="${Y.toFixed(1)}" stroke="${TINTA_SUAVE}" stroke-width="${0.8 * PT}"/>`;
    s += `<line x1="${ax.x + ax.w}" y1="${Y.toFixed(1)}" x2="${ax.x + ax.w - tl}" y2="${Y.toFixed(1)}" stroke="${TINTA_SUAVE}" stroke-width="${0.8 * PT}"/>`;
    s += texto(ax.x - pad, Y, fy(v), { tam: fs, cor: TINTA_SUAVE, anc: "middle", rot: -90 });
    s += texto(ax.x + ax.w + pad + fs * PT * 0.8, Y, fy(v), { tam: fs, cor: TINTA_SUAVE, anc: "middle", rot: -90 });
  }
  return s;
}

function norte(ax, fx = 0.93, fy = 0.86, t = 0.07) {
  const x = ax.x + fx * ax.w, yb = ax.y + (1 - fy) * ax.h, yt = ax.y + (1 - fy - t) * ax.h;
  const hl = 9 * PT, hw = 4.5 * PT;
  return `<line x1="${x.toFixed(1)}" y1="${yb.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(yt + hl).toFixed(1)}" stroke="${TINTA}" stroke-width="${1.4 * PT}"/>` +
    `<path d="M${x.toFixed(1)} ${yt.toFixed(1)}L${(x - hw).toFixed(1)} ${(yt + hl).toFixed(1)}L${(x + hw).toFixed(1)} ${(yt + hl).toFixed(1)}Z" fill="${TINTA}"/>` +
    texto(x, ax.y + (1 - fy - t - 0.012) * ax.h, "N", { tam: 11, anc: "middle" });
}

function escala(ax, lat, fx = 0.05, fy = 0.05) {
  const [x0, y0, x1, y1] = ax.ext;
  const kmGrau = 111.32 * Math.cos((lat * Math.PI) / 180);
  const alvo = ((x1 - x0) * kmGrau) / 4;
  const passo = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500].reduce((m, v) => (Math.abs(v - alvo) < Math.abs(m - alvo) ? v : m));
  const seg = passo / 2 / kmGrau;
  const bx = x0 + fx * (x1 - x0), by = y0 + fy * (y1 - y0), h = (y1 - y0) * 0.012;
  let s = "";
  for (let i = 0; i < 2; i++) {
    const X0 = ax.X(bx + i * seg), X1 = ax.X(bx + (i + 1) * seg);
    s += `<rect x="${X0.toFixed(1)}" y="${ax.Y(by + h).toFixed(1)}" width="${(X1 - X0).toFixed(1)}" height="${(ax.Y(by) - ax.Y(by + h)).toFixed(1)}" fill="${i === 0 ? TINTA : "#FFFFFF"}" stroke="${TINTA}" stroke-width="${0.7 * PT}"/>`;
  }
  [0, passo / 2, passo].forEach((v, i) => {
    s += texto(ax.X(bx + i * seg), ax.Y(by + h * 1.8), fmtG(v), { tam: 6.5, anc: "middle", halo: 2 * PT });
  });
  s += texto(ax.X(bx + 2 * seg + seg * 0.15), ax.Y(by + h / 2), "km", { tam: 6.5, base: "central", halo: 2 * PT });
  return s;
}

/** Legenda no estilo do matplotlib (caixa arredondada, título à esquerda). */
function legenda(x, yTopo, titulo, itens, o = {}) {
  const fs = 6.8 * PT, ft = 7.2 * PT;
  const bp = (o.borderpad ?? 0.7) * fs, ls = (o.labelspacing ?? 0.45) * fs, htp = (o.handletextpad ?? 0.8) * fs;
  const hl = 1.4 * fs, hh = 0.7 * fs;
  const alturas = itens.map((it) => Math.max(fs * 1.2, it.diam || 0));
  const larguraH = Math.max(hl, ...itens.map((it) => it.diam || 0));
  const larguraTxt = Math.max(...itens.map((it) => larguraTexto(it.rotulo, fs)), 0);
  const w = Math.max(larguraTexto(titulo, ft, 400), larguraH + htp + larguraTxt) + 2 * bp;
  const h = 2 * bp + ft * 1.25 + ls + alturas.reduce((a, b) => a + b, 0) + ls * (itens.length - 1);
  x += 0.5 * fs; yTopo += 0.5 * fs; // borderaxespad
  let s = `<rect x="${x.toFixed(1)}" y="${yTopo.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(0.4 * fs).toFixed(1)}" fill="#FFFFFF" fill-opacity=".95" stroke="${LINHA}" stroke-width="${0.8 * PT}"/>`;
  s += `<text x="${(x + bp).toFixed(1)}" y="${(yTopo + bp + ft * 0.9).toFixed(1)}" font-size="${ft.toFixed(1)}" fill="${TINTA}">${esc(titulo)}</text>`;
  let y = yTopo + bp + ft * 1.25 + ls;
  itens.forEach((it, i) => {
    const ah = alturas[i], cy = y + ah / 2;
    if (it.diam) {
      s += `<circle cx="${(x + bp + larguraH / 2).toFixed(1)}" cy="${cy.toFixed(1)}" r="${(it.diam / 2).toFixed(1)}" fill="#FFFFFF" stroke="${TINTA}" stroke-width="${PT}"/>`;
    } else {
      s += `<rect x="${(x + bp).toFixed(1)}" y="${(cy - hh / 2).toFixed(1)}" width="${hl.toFixed(1)}" height="${hh.toFixed(1)}" fill="${it.cor}" stroke="${TINTA_SUAVE}" stroke-width="${0.4 * PT}"/>`;
    }
    s += `<text x="${(x + bp + larguraH + htp).toFixed(1)}" y="${cy.toFixed(1)}" font-size="${fs.toFixed(1)}" fill="${TINTA}" dominant-baseline="central">${esc(it.rotulo)}</text>`;
    y += ah + ls;
  });
  return s;
}

function inset(rectFig, ufs, destaque, ext) {
  const [fx, fy, fw, fh] = rectFig;
  const [rx, ryTop] = fig(fx, fy + fh);
  const rw = fw * FW, rh = fh * FH;
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of ufs) b = [Math.min(b[0], f.bbox[0]), Math.min(b[1], f.bbox[1]), Math.max(b[2], f.bbox[2]), Math.max(b[3], f.bbox[3])];
  const pad = 0.6;
  const caixa = [ext[0] - pad, ext[1] - pad, ext[2] + pad, ext[3] + pad];
  b = [Math.min(b[0], caixa[0]), Math.min(b[1], caixa[1]), Math.max(b[2], caixa[2]), Math.max(b[3], caixa[3])];
  const mx = (b[2] - b[0]) * 0.05, my = (b[3] - b[1]) * 0.05;
  const lim = [b[0] - mx, b[1] - my, b[2] + mx, b[3] + my];
  const ax = eixos([rx, ryTop, rw, rh], lim, 1 / Math.cos((-15 * Math.PI) / 180));
  const id = "clip-inset";
  let s = `<clipPath id="${id}"><rect x="${ax.x}" y="${ax.y}" width="${ax.w}" height="${ax.h}"/></clipPath>`;
  s += `<rect x="${ax.x}" y="${ax.y}" width="${ax.w}" height="${ax.h}" fill="#FFFFFF"/><g clip-path="url(#${id})">`;
  s += camada(ufs.filter((f) => !destaque.has(f.props.sigla)), ax.X, ax.Y, SEM_DADO, "#FFFFFF", 0.3 * PT);
  s += camada(ufs.filter((f) => destaque.has(f.props.sigla)), ax.X, ax.Y, MATA, "#FFFFFF", 0.3 * PT);
  s += `<rect x="${ax.X(caixa[0]).toFixed(1)}" y="${ax.Y(caixa[3]).toFixed(1)}" width="${(ax.X(caixa[2]) - ax.X(caixa[0])).toFixed(1)}" height="${(ax.Y(caixa[1]) - ax.Y(caixa[3])).toFixed(1)}" fill="none" stroke="${COBRE}" stroke-width="${1.2 * PT}"/>`;
  s += `</g><rect x="${ax.x}" y="${ax.y}" width="${ax.w}" height="${ax.h}" fill="none" stroke="${TINTA}" stroke-width="${0.6 * PT}"/>`;
  s += texto(ax.x + 0.04 * ax.w, ax.y + 0.04 * ax.h, "Localização", { tam: 6.2, cor: TINTA_SUAVE, base: "hanging" });
  return s;
}

// ---------------------------------------------------------------------------
// etiquetas sem sobreposição (mesmo algoritmo de mapas._posicionar_rotulos),
// em coordenadas de tela com y para cima, como no matplotlib
// ---------------------------------------------------------------------------
const sobrepoe = (a, b, folga = 1.5) => !(a[2] + folga <= b[0] || b[2] + folga <= a[0] || a[3] + folga <= b[1] || b[3] + folga <= a[1]);
function linhaCruza(p0, p1, c, passos = 24) {
  for (let k = 1; k < passos; k++) {
    const t = k / passos, x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
    if (c[0] <= x && x <= c[2] && c[1] <= y && y <= c[3]) return true;
  }
  return false;
}
function segsCruzam(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function bordaCaixa(p, c, gap = 1.5) {
  const cx = (c[0] + c[2]) / 2, cy = (c[1] + c[3]) / 2, dx = p[0] - cx, dy = p[1] - cy;
  const hw = (c[2] - c[0]) / 2 + gap, hh = (c[3] - c[1]) / 2 + gap;
  if (dx === 0 && dy === 0) return [cx, cy];
  const t = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  return [cx + dx * t, cy + dy * t];
}
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function medidaTexto(txt, fonte) {
  const ls = txt.split("\n");
  const fs = fonte * PT;
  const w = Math.max(...ls.map((l) => larguraTexto(l, fs)));
  const h = fs * 1.17 + (ls.length - 1) * fs * 1.1 * 1.2;
  return [w + 3, h + 2];
}

function posicionarRotulos(ax, itens, raioPx, pontos, fonte = 5.6) {
  // tela com y para cima: (px, FH - py)
  const T = (x, y) => [ax.X(x), FH - ax.Y(y)];
  const inv = (px, py) => ax.inv(px, FH - py);
  const axb = { x0: ax.x, y0: FH - (ax.y + ax.h), x1: ax.x + ax.w, y1: FH - ax.y };
  const W = ax.w, H = ax.h;
  const lim = [axb.x0 + 3, axb.y0 + 3, axb.x1 - 3, axb.y1 - 3];
  const fixos = [[axb.x0 + 0.885 * W, axb.y0 + 0.83 * H, axb.x1, axb.y1], [axb.x0, axb.y0, axb.x0 + 0.36 * W, axb.y0 + 0.13 * H]];
  const caixas = [], linhas = [];
  const anc = itens.map((it) => T(it.x, it.y));
  const raio = raioPx || itens.map(() => 4.0);
  const obstAnc = anc.map(([x, y], i) => [x - raio[i], y - raio[i], x + raio[i], y + raio[i]]);
  const cx0 = anc.reduce((a, p) => a + p[0], 0) / Math.max(anc.length, 1);
  const cy0 = anc.reduce((a, p) => a + p[1], 0) / Math.max(anc.length, 1);
  const livre = (c, i, linhaDe = null) => {
    if (c[0] < lim[0] || c[1] < lim[1] || c[2] > lim[2] || c[3] > lim[3]) return false;
    if ([...fixos, ...caixas].some((o) => sobrepoe(c, o))) return false;
    if (obstAnc.some((o, j) => j !== i && sobrepoe(c, o, 0.5))) return false;
    if (linhas.some(([a, b]) => linhaCruza(a, b, c))) return false;
    if (linhaDe) {
      const p1 = bordaCaixa(linhaDe, c);
      if (caixas.some((o) => linhaCruza(linhaDe, p1, o))) return false;
      if (linhas.some(([a, b]) => segsCruzam(linhaDe, p1, a, b))) return false;
      if (obstAnc.some((o, j) => j !== i && linhaCruza(linhaDe, p1, o))) return false;
    }
    return true;
  };
  const ordem = itens.map((_, i) => i).sort((a, b) => itens[b].prioridade - itens[a].prioridade || a - b);
  const res = itens.map((it) => ({ ...it }));
  const numerados = [];
  for (const i of ordem) {
    const it = res[i];
    const [axx, ayy] = anc[i];
    const txt = pontos ? `${it.nome} (${br(it.valor)}%)` : `${it.nome}\n${br(it.valor)}%`;
    const [w, h] = medidaTexto(txt, fonte);
    it.texto = txt;
    let feito = false;
    let cands;
    if (pontos) {
      const r = raio[i];
      cands = [[axx + r + 3 + w / 2, ayy], [axx - r - 3 - w / 2, ayy], [axx, ayy + r + 2 + h / 2], [axx, ayy - r - 2 - h / 2]];
    } else {
      cands = [[axx, ayy], ...[[0, 0.55], [0, -0.55], [0.3, 0], [-0.3, 0], [0.3, 0.5], [-0.3, 0.5], [0.3, -0.5], [-0.3, -0.5]].map(([dx, dy]) => [axx + dx * w, ayy + dy * h])];
    }
    for (const [ccx, ccy] of cands) {
      const c = [ccx - w / 2, ccy - h / 2, ccx + w / 2, ccy + h / 2];
      if (!pontos && (ccx !== axx || ccy !== ayy)) {
        const [gx, gy] = inv(ccx, ccy);
        if (!it.geom || !contem(it.geom, gx, gy)) continue;
      }
      if (livre(c, i)) { it.modo = "dentro"; it.caixa = c; feito = true; break; }
    }
    if (!feito) {
      const ox = axx - cx0, oy = ayy - cy0;
      const angFora = Math.abs(ox) + Math.abs(oy) > 1 ? Math.atan2(oy, ox) : Math.PI / 2;
      const base = Math.max(h * 1.1, 12) + raio[i];
      const dMax = 0.2 * Math.max(W, H) + raio[i];
      const angs = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8).sort((a, b) => angDiff(a, angFora) - angDiff(b, angFora));
      for (const mult of [1.0, 1.6, 2.3, 3.2, 4.3, 5.6, 7.2]) {
        if (base * mult > dMax) break;
        for (const a of angs) {
          const d = base * mult;
          const ccx = axx + Math.cos(a) * (d + (w / 2) * Math.abs(Math.cos(a)));
          const ccy = ayy + Math.sin(a) * (d + (h / 2) * Math.abs(Math.sin(a)));
          const c = [ccx - w / 2, ccy - h / 2, ccx + w / 2, ccy + h / 2];
          if (livre(c, i, [axx, ayy])) { it.modo = "chamada"; it.caixa = c; feito = true; break; }
        }
        if (feito) break;
      }
    }
    if (feito) {
      caixas.push(it.caixa);
      const c = it.caixa;
      if (it.modo === "chamada") {
        const p1 = bordaCaixa([axx, ayy], c);
        linhas.push([[axx, ayy], p1]);
        it.linha = [inv(axx, ayy), inv(...p1)];
      }
      [it.lx, it.ly] = inv((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
    } else { it.modo = "numero"; numerados.push(i); }
  }
  // numeração em ordem de leitura (de cima para baixo, da esquerda para a direita)
  const lado = (fonte * DPI / 72) * 1.25 + 2;
  const pyRoundInt = (v) => { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 ? f + 1 : f); };
  numerados.sort((a, b) => (-pyRoundInt(anc[a][1] / 20)) - (-pyRoundInt(anc[b][1] / 20)) || anc[a][0] - anc[b][0]);
  numerados.forEach((i, idx) => {
    const it = res[i];
    it.num = idx + 1;
    const [axx, ayy] = anc[i];
    const ox = axx - cx0, oy = ayy - cy0;
    const angFora = Math.abs(ox) + Math.abs(oy) > 1 ? Math.atan2(oy, ox) : Math.PI / 2;
    const angs = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8).sort((a, b) => angDiff(a, angFora) - angDiff(b, angFora));
    let achado = null;
    for (const d of [0, 1.3, 2.0, 2.8, 3.8, 5.0]) {
      for (const a of d === 0 ? [0] : angs) {
        const ccx = axx + Math.cos(a) * (d * lado + (d ? raio[i] : 0));
        const ccy = ayy + Math.sin(a) * (d * lado + (d ? raio[i] : 0));
        const c = [ccx - lado / 2, ccy - lado / 2, ccx + lado / 2, ccy + lado / 2];
        if (livre(c, i, d === 0 ? null : [axx, ayy])) { achado = [c, d]; break; }
      }
      if (achado) break;
    }
    if (!achado) achado = [[axx - lado / 2, ayy - lado / 2, axx + lado / 2, ayy + lado / 2], 0];
    const [c, d] = achado;
    caixas.push(c);
    [it.nx, it.ny] = inv((c[0] + c[2]) / 2, (c[1] + c[3]) / 2);
    if (d) {
      const p1 = bordaCaixa([axx, ayy], c, 0.5);
      linhas.push([[axx, ayy], p1]);
      it.linha = [inv(axx, ayy), inv(...p1)];
    }
  });
  // no modo círculos, a lista de numerados vai para um canto livre dentro do mapa
  const info = { listaAx: null };
  if (numerados.length && pontos) {
    const nLinhas = numerados.length + 1;
    const larg = Math.max(...numerados.map((i) => medidaTexto(`${res[i].nome} (${br(res[i].valor)}%)`, fonte)[0])) + 14;
    const alt = nLinhas * (fonte * DPI / 72) * 1.45 + 8;
    const cantos = [
      [axb.x0 + 6, axb.y1 - 6 - alt, axb.x0 + 6 + larg, axb.y1 - 6],
      [axb.x1 - 6 - larg, axb.y0 + 6, axb.x1 - 6, axb.y0 + 6 + alt],
      [axb.x0 + 6, axb.y0 + 0.14 * H, axb.x0 + 6 + larg, axb.y0 + 0.14 * H + alt],
    ];
    const custo = (c) => caixas.filter((o) => sobrepoe(c, o, 0)).length * 3 + obstAnc.filter((o) => sobrepoe(c, o, 0)).length;
    let melhor = cantos[0];
    for (const c of cantos) if (custo(c) < custo(melhor)) melhor = c;
    info.listaAx = [(melhor[0] - axb.x0) / W, (melhor[3] - axb.y0) / H];
  }
  return { res, info };
}

function desenharRotulos(ax, res, info, fonte = 5.6, topo = 0.335) {
  let s = "";
  const lista = [];
  for (const it of res) {
    if (it.linha) {
      const [[x0, y0], [x1, y1]] = it.linha;
      s += `<line x1="${ax.X(x0).toFixed(1)}" y1="${ax.Y(y0).toFixed(1)}" x2="${ax.X(x1).toFixed(1)}" y2="${ax.Y(y1).toFixed(1)}" stroke="${TINTA}" stroke-width="${0.45 * PT}" stroke-linecap="round"/>`;
      s += `<circle cx="${ax.X(x0).toFixed(1)}" cy="${ax.Y(y0).toFixed(1)}" r="${(0.95 * PT).toFixed(1)}" fill="${TINTA}"/>`;
    }
    if (it.modo === "dentro" || it.modo === "chamada") {
      s += textoMulti(ax.X(it.lx), ax.Y(it.ly), it.texto.split("\n"), { tam: fonte, anc: "middle", halo: 2.2 * PT, ls: 1.1 });
    } else if (it.num) {
      const x = ax.X(it.nx), y = ax.Y(it.ny);
      const r = ((fonte - 0.6) * PT) * 0.75 + 0.2 * (fonte - 0.6) * PT;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#FFFFFF" stroke="${TINTA}" stroke-width="${0.45 * PT}"/>`;
      s += texto(x, y, String(it.num), { tam: fonte - 0.6, anc: "middle", base: "central" });
      lista.push([it.num, `${it.num}  ${it.nome} (${br(it.valor)}%)`]);
    }
  }
  lista.sort((a, b) => a[0] - b[0]);
  if (lista.length && info && info.listaAx) {
    const [fx, fy] = info.listaAx;
    const x = ax.x + fx * ax.w, yTop = ax.y + (1 - fy) * ax.h;
    const linhas = ["Áreas numeradas", ...lista.map(([, t]) => t)];
    const fs = fonte * PT, lh = fs * 1.35 * 1.2;
    const w = Math.max(...linhas.map((l) => larguraTexto(l, fs))) + fs;
    s += `<rect x="${(x - fs / 2).toFixed(1)}" y="${(yTop - fs / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${(linhas.length * lh + fs / 2).toFixed(1)}" rx="${(fs / 3).toFixed(1)}" fill="#FFFFFF" fill-opacity=".95" stroke="${LINHA}" stroke-width="${0.6 * PT}"/>`;
    linhas.forEach((l, i) => { s += texto(x, yTop + i * lh, l, { tam: fonte, base: "hanging" }); });
  } else if (lista.length) {
    const linhas = lista.map(([, t]) => t);
    const ncol = linhas.length <= 12 ? 1 : 2;
    const por = Math.ceil(linhas.length / ncol);
    const [tx, ty] = fig(0.765, topo);
    s += texto(tx, ty, "Áreas numeradas", { tam: 6.4, base: "hanging" });
    const fsl = ncol === 1 ? 5.6 : 4.9, lh = fsl * PT * 1.35 * 1.2;
    for (let c = 0; c < ncol; c++) {
      const [cx, cy] = fig(0.765 + c * 0.115, topo - 0.025);
      linhas.slice(c * por, (c + 1) * por).forEach((l, i) => { s += texto(cx, cy + i * lh, l, { tam: fsl, base: "hanging" }); });
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// figura estática (padrão cartográfico)
// ---------------------------------------------------------------------------
export function figuraEstatica(cena) {
  const { areas, valorCol, lims, ext, pontos } = cena;
  const lat = (ext[1] + ext[3]) / 2;
  const [rx, ryTop] = fig(0.075, 0.085 + 0.83);
  const ax = eixos([rx, ryTop, 0.66 * FW, 0.83 * FH], ext, 1 / Math.cos((lat * Math.PI) / 180));
  const visiveis = (fs) => fs.filter((f) => intersectaCaixa(f.bbox, ext));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" width="${FW}" height="${FH}" font-family="${FONTE}, sans-serif">`;
  s += `<rect width="${FW}" height="${FH}" fill="#FFFFFF"/>`;
  s += `<clipPath id="clip-ax"><rect x="${ax.x.toFixed(1)}" y="${ax.y.toFixed(1)}" width="${ax.w.toFixed(1)}" height="${ax.h.toFixed(1)}"/></clipPath>`;
  s += `<rect x="${ax.x.toFixed(1)}" y="${ax.y.toFixed(1)}" width="${ax.w.toFixed(1)}" height="${ax.h.toFixed(1)}" fill="${FUNDO}"/>`;
  s += `<g clip-path="url(#clip-ax)">`;
  const lwFundo = (cena.recorte === "brasil" || cena.recorte === "regiao" ? 0.25 : 0.6) * PT;
  for (const c of cena.fundoClaro || []) s += camada(visiveis(c), ax.X, ax.Y, "#FFFFFF", "#E9E5DC", 0.4 * PT);
  for (const c of cena.fundo) s += camada(visiveis(c), ax.X, ax.Y, "#FFFFFF", BORDA, lwFundo);
  if (cena.ufsContorno) s += contornoSemPreenchimento(cena.ufsContorno, ax.X, ax.Y, "#8F8A80", 0.6 * PT);
  if (cena.sem && cena.sem.length) s += camada(cena.sem, ax.X, ax.Y, SEM_DADO, "#FFFFFF", 0.5 * PT);
  const nmax = Math.max(...areas.map((f) => f.props.n_pacientes));
  if (pontos) {
    for (const f of [...areas].sort((a, b) => b.props.n_pacientes - a.props.n_pacientes)) {
      const r = (Math.sqrt(tam(f.props.n_pacientes, nmax)) / 2) * PT;
      s += `<circle cx="${ax.X(f.ponto[0]).toFixed(1)}" cy="${ax.Y(f.ponto[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="${corDe(f.props[valorCol], lims)}" stroke="${TINTA}" stroke-width="${0.6 * PT}"/>`;
    }
  } else {
    // áreas pequenas demais para a escala ganham um contorno fino escuro
    const escuro = cena.recorte === "brasil" || cena.recorte === "regiao";
    for (const f of areas) {
      s += `<path d="${caminho(f.geom, ax.X, ax.Y)}" fill="${corDe(f.props[valorCol], lims)}" stroke="${escuro ? TINTA : "#FFFFFF"}" stroke-width="${(escuro ? 0.35 : 0.9) * PT}" stroke-linejoin="round" fill-rule="evenodd"/>`;
    }
  }
  s += `</g>`;
  s += grade(ax);
  s += `<rect x="${ax.x.toFixed(1)}" y="${ax.y.toFixed(1)}" width="${ax.w.toFixed(1)}" height="${ax.h.toFixed(1)}" fill="none" stroke="${TINTA}" stroke-width="${0.8 * PT}"/>`;
  s += norte(ax);
  s += escala(ax, lat);
  const itensLeg = RAMPA.map((c, i) => ({ cor: c, rotulo: rotulosClasses(lims)[i] }));
  if (cena.sem && cena.sem.length) itensLeg.push({ cor: SEM_DADO, rotulo: `${cena.rotuloArea} sem dados` });
  s += legenda(ax.x + 1.06 * ax.w, ax.y + (1 - 0.62) * ax.h, "Prevalência", itensLeg);
  if (pontos) {
    const refs = [...new Set([0.25, 0.5, 1.0].map((f) => Math.max(1, Math.round(nmax * f))))].sort((a, b) => a - b);
    s += legenda(ax.x + 1.06 * ax.w, ax.y + (1 - 0.25) * ax.h, "Pacientes (n)",
      refs.map((v) => ({ rotulo: String(v), diam: Math.sqrt(tam(v, nmax)) * PT })), { borderpad: 0.9, labelspacing: 1.3, handletextpad: 1.2 });
  }
  if (cena.recorte !== "brasil") s += inset([0.765, 0.6, 0.2, 0.3], cena.ufsGdf, new Set(cena.ufsDestaque), ext);
  cena.rotulosPos = null;
  if (cena.rotulos && areas.length) {
    const itens = areas.map((f) => ({ nome: f.props.nome, valor: f.props[valorCol], x: f.ponto[0], y: f.ponto[1], geom: f.geom,
      prioridade: pontos ? f.props.n_pacientes : areaGeom(f.geom) }));
    const raio = pontos ? areas.map((f) => (Math.sqrt(tam(f.props.n_pacientes, nmax)) / 2) * PT) : null;
    const { res, info } = posicionarRotulos(ax, itens, raio, pontos);
    s += desenharRotulos(ax, res, info);
    cena.rotulosPos = res;
  }
  const [tx, ty] = fig(0.075, 0.985);
  s += texto(tx, ty, cena.titulo, { tam: 10.5, cor: MATA, base: "hanging" });
  const [fx, fy] = fig(0.5, 0.012);
  s += texto(fx, fy, `${SRC_TXT} · ${FONTE_MALHA}` + (cena.nota ? ` · ${cena.nota}` : ""), { tam: 6.0, cor: TINTA_SUAVE, anc: "middle" });
  return s + "</svg>";
}

// ---------------------------------------------------------------------------
// exportação: PNG e TIFF em 300 dpi (fontes embutidas no SVG)
// ---------------------------------------------------------------------------
let _fonteB64 = null;
async function fonteBase64() {
  if (_fonteB64) return _fonteB64;
  const r = await fetch("brand/fonts/InstrumentSans-Regular.ttf");
  const b = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  _fonteB64 = btoa(s);
  return _fonteB64;
}

export async function svgParaCanvas(svg, escala = 2) {
  const css = `<style>@font-face{font-family:"${FONTE}";src:url(data:font/ttf;base64,${await fonteBase64()}) format("truetype");}</style>`;
  const comFonte = svg.replace(/(<svg[^>]*>)/, `$1<defs>${css}</defs>`);
  const url = URL.createObjectURL(new Blob([comFonte], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("falha ao desenhar a figura")); img.src = url; });
    const cv = document.createElement("canvas");
    cv.width = Math.round(FW * escala); cv.height = Math.round(FH * escala);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  } finally { URL.revokeObjectURL(url); }
}

/** PNG com resolução gravada (pHYs) de 300 dpi. */
export async function canvasParaPng(cv, dpi = 300) {
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  const b = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const dados = new Uint8Array(13);
  const dv = new DataView(dados.buffer);
  dv.setUint32(4, ppm); dv.setUint32(8, ppm); dados[12] = 1;
  const nome = new TextEncoder().encode("pHYs");
  dados.set([0, 0, 0, 9], 0);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  chunk.set([0, 0, 0, 9], 0); chunk.set(nome, 4); chunk.set(dados.subarray(4), 8);
  new DataView(chunk.buffer).setUint32(17, crc32(chunk.subarray(4, 17)));
  // insere logo depois do IHDR (8 de assinatura + 25 do IHDR)
  const out = new Uint8Array(b.length + chunk.length);
  out.set(b.subarray(0, 33), 0); out.set(chunk, 33); out.set(b.subarray(33), 33 + chunk.length);
  return out;
}

let _crcT = null;
function crc32(bytes) {
  if (!_crcT) { _crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (const x of bytes) c = _crcT[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** TIFF RGB com compressão PackBits e 300 dpi. */
export function canvasParaTiff(cv, dpi = 300) {
  const { width: w, height: h } = cv;
  const px = cv.getContext("2d").getImageData(0, 0, w, h).data;
  const faixas = [];
  const linha = new Uint8Array(w * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; linha[x * 3] = px[i]; linha[x * 3 + 1] = px[i + 1]; linha[x * 3 + 2] = px[i + 2]; }
    faixas.push(packbits(linha));
  }
  const nTags = 13;
  const cabec = 8, ifd = 2 + nTags * 12 + 4;
  const extras = 6 + 16 + 4 * h * 2; // BitsPerSample(3x2) + 2 rationals + offsets + counts
  let pos = cabec + ifd;
  const posBits = pos; pos += 6;
  const posXRes = pos; pos += 8;
  const posYRes = pos; pos += 8;
  const posOff = pos; pos += 4 * h;
  const posCnt = pos; pos += 4 * h;
  void extras;
  let total = pos;
  const offs = [];
  for (const f of faixas) { offs.push(total); total += f.length; }
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  buf.set([0x49, 0x49, 42, 0]); dv.setUint32(4, cabec, true);
  let p = cabec;
  dv.setUint16(p, nTags, true); p += 2;
  const tag = (id, tipo, n, valor) => { dv.setUint16(p, id, true); dv.setUint16(p + 2, tipo, true); dv.setUint32(p + 4, n, true);
    if (tipo === 3 && n === 1) dv.setUint16(p + 8, valor, true); else dv.setUint32(p + 8, valor, true); p += 12; };
  tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 3, posBits); tag(259, 3, 1, 32773); tag(262, 3, 1, 2);
  tag(273, 4, h, posOff); tag(277, 3, 1, 3); tag(278, 4, 1, 1); tag(279, 4, h, posCnt);
  tag(282, 5, 1, posXRes); tag(283, 5, 1, posYRes); tag(284, 3, 1, 1); tag(296, 3, 1, 2);
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 3; i++) dv.setUint16(posBits + 2 * i, 8, true);
  dv.setUint32(posXRes, dpi, true); dv.setUint32(posXRes + 4, 1, true);
  dv.setUint32(posYRes, dpi, true); dv.setUint32(posYRes + 4, 1, true);
  faixas.forEach((f, i) => { dv.setUint32(posOff + 4 * i, offs[i], true); dv.setUint32(posCnt + 4 * i, f.length, true); buf.set(f, offs[i]); });
  return buf;
}

function packbits(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    let j = i;
    while (j + 1 < src.length && src[j + 1] === src[i] && j - i < 127) j++;
    if (j > i) { out.push(-(j - i) & 0xff, src[i]); i = j + 1; continue; }
    const ini = i;
    while (i < src.length && i - ini < 128 && !(i + 2 < src.length && src[i] === src[i + 1] && src[i] === src[i + 2])) i++;
    out.push(i - ini - 1);
    for (let k = ini; k < i; k++) out.push(src[k]);
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// mapa interativo (SVG redesenhado a cada zoom/arrasto: traços e textos
// mantêm o tamanho, como no plotly)
// ---------------------------------------------------------------------------
export function mapaInterativo(el, cena) {
  const { areas, valorCol, lims, pontos, rotuloArea } = cena;
  const ext0 = cena.ext;
  let vista = [...ext0];
  const lat = (ext0[1] + ext0[3]) / 2;
  const aspecto = 1 / Math.cos((lat * Math.PI) / 180);
  const larg = Math.max(320, el.clientWidth || 900);
  const altura = Math.min(620, Math.max(360, (larg * (ext0[3] - ext0[1]) * aspecto) / (ext0[2] - ext0[0])));
  const nmax = Math.max(...areas.map((f) => f.props.n_pacientes));
  const pos = cena.rotulos ? cena.rotulosPos : null;
  const dica = (f) => {
    const p = f.props;
    const ic = valorCol === "prevalencia" && p.ic95_inf !== null && p.ic95_inf !== undefined && p.ic95_sup !== null
      ? ` (IC 95% ${br(p.ic95_inf)}–${br(p.ic95_sup)}%)` : "";
    return `${p.nome}\n${rotuloArea}\nPacientes: ${Math.trunc(p.n_pacientes)}\nPrevalência: ${br(p[valorCol])}%${ic}`;
  };
  el.innerHTML = `<svg viewBox="0 0 ${larg} ${altura}" width="${larg}" height="${altura}" font-family="${FONTE}, sans-serif" role="img" aria-label="${esc(cena.titulo)}"></svg>` +
    `<div class="zoom"><button type="button" data-z="1.5" aria-label="Aproximar">+</button><button type="button" data-z="0.667" aria-label="Afastar">−</button><button type="button" data-z="0" aria-label="Enquadrar">⟲</button></div>`;
  const svg = el.querySelector("svg");
  let mostrada = [...vista]; // extensão realmente desenhada (ajustada ao formato do quadro)

  const desenhar = () => {
    const ax = eixos([0, 0, larg, altura], vista, aspecto);
    // a vista ocupa a área toda: ajusta a extensão ao formato do quadro
    const vx = (vista[2] - vista[0]) * (larg / ax.w), vy = (vista[3] - vista[1]) * (altura / ax.h);
    const cxv = (vista[0] + vista[2]) / 2, cyv = (vista[1] + vista[3]) / 2;
    const v = [cxv - vx / 2, cyv - vy / 2, cxv + vx / 2, cyv + vy / 2];
    const A = eixos([0, 0, larg, altura], v, aspecto);
    mostrada = v;
    const vis = (fs) => fs.filter((f) => intersectaCaixa(f.bbox, v));
    const tol = 0.6;
    let s = `<rect width="${larg}" height="${altura}" fill="${FUNDO}"/>`;
    const cam = (fs, fill, stroke, sw) => {
      const d = vis(fs).map((f) => caminho(f.geom, A.X, A.Y, tol)).join("");
      return d ? `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" fill-rule="evenodd" stroke-linejoin="round"/>` : "";
    };
    for (const c of cena.fundoClaro || []) s += cam(c, "#FFFFFF", "#E9E5DC", 0.5);
    for (const c of cena.fundo) s += cam(c, "#FFFFFF", BORDA, cena.recorte === "brasil" || cena.recorte === "regiao" ? 0.5 : 0.8);
    if (cena.ufsContorno) s += cam(cena.ufsContorno, "none", "#8F8A80", 1);
    if (cena.sem && cena.sem.length) s += cam(cena.sem, SEM_DADO, "#FFFFFF", 0.8);
    if (pontos) {
      for (const f of [...areas].sort((a, b) => b.props.n_pacientes - a.props.n_pacientes)) {
        const r = (Math.sqrt(tam(f.props.n_pacientes, nmax)) * 1.35) / 2;
        s += `<circle class="area" cx="${A.X(f.ponto[0]).toFixed(1)}" cy="${A.Y(f.ponto[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="${corDe(f.props[valorCol], lims)}" stroke="${TINTA}" stroke-width=".8" data-dica="${esc(dica(f))}"/>`;
      }
    } else {
      const escuro = cena.recorte === "brasil" || cena.recorte === "regiao";
      for (const f of vis(areas)) {
        s += `<path class="area" d="${caminho(f.geom, A.X, A.Y, tol)}" fill="${corDe(f.props[valorCol], lims)}" stroke="${escuro ? TINTA : "#FFFFFF"}" stroke-width="${escuro ? 0.6 : 1.3}" fill-rule="evenodd" data-dica="${esc(dica(f))}"/>`;
      }
      // ponto no centro de cada área: facilita o hover em áreas pequenas
      for (const f of areas) s += `<circle cx="${A.X(f.ponto[0]).toFixed(1)}" cy="${A.Y(f.ponto[1]).toFixed(1)}" r="6" fill="transparent" data-dica="${esc(dica(f))}"/>`;
    }
    // etiquetas: mesmas posições da figura (sem sobreposição)
    if (pos) {
      const lista = [];
      for (const it of pos) {
        if (it.linha) {
          const [[x0, y0], [x1, y1]] = it.linha;
          s += `<line x1="${A.X(x0).toFixed(1)}" y1="${A.Y(y0).toFixed(1)}" x2="${A.X(x1).toFixed(1)}" y2="${A.Y(y1).toFixed(1)}" stroke="${TINTA}" stroke-width=".8"/>` +
            `<circle cx="${A.X(x0).toFixed(1)}" cy="${A.Y(y0).toFixed(1)}" r="2" fill="${TINTA}"/>`;
        }
        if (it.modo === "dentro" || it.modo === "chamada") {
          const ls = it.texto.split("\n");
          ls.forEach((l, i) => {
            s += `<text x="${A.X(it.lx).toFixed(1)}" y="${(A.Y(it.ly) + (i - (ls.length - 1) / 2) * 13).toFixed(1)}" font-size="11" fill="${TINTA}" text-anchor="middle" dominant-baseline="central" stroke="#FFFFFF" stroke-width="2.6" stroke-opacity=".75" paint-order="stroke" pointer-events="none">${esc(l)}</text>`;
          });
        } else if (it.num) {
          s += `<circle cx="${A.X(it.nx).toFixed(1)}" cy="${A.Y(it.ny).toFixed(1)}" r="8" fill="#FFFFFF" stroke="${TINTA}" stroke-width=".8"/>` +
            `<text x="${A.X(it.nx).toFixed(1)}" y="${A.Y(it.ny).toFixed(1)}" font-size="9" font-weight="600" fill="${TINTA}" text-anchor="middle" dominant-baseline="central" pointer-events="none">${it.num}</text>`;
          lista.push([it.num, `${it.num}  ${it.nome} (${br(it.valor)}%)`]);
        }
      }
      if (lista.length) {
        lista.sort((a, b) => a[0] - b[0]);
        const linhas = ["Áreas numeradas", ...lista.map(([, t]) => t)];
        const w = Math.max(...linhas.map((l) => larguraTexto(l, 10))) + 14;
        s += `<rect x="8" y="8" width="${w.toFixed(0)}" height="${linhas.length * 14 + 10}" rx="4" fill="#FFFFFF" fill-opacity=".92" stroke="${LINHA}"/>`;
        linhas.forEach((l, i) => { s += `<text x="15" y="${22 + i * 14}" font-size="10" fill="${TINTA}"${i ? "" : ' font-weight="600"'}>${esc(l)}</text>`; });
      }
    }
    // norte, coordenadas e legenda
    s += `<text x="${larg - 26}" y="26" font-size="15" font-weight="600" fill="${TINTA}" text-anchor="middle">N</text>` +
      `<path d="M${larg - 26} 32l6 14h-12z" fill="${TINTA}"/>`;
    const passo = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].find((p) => (v[2] - v[0]) / p <= 7) || 10;
    const cas = passo < 0.1 ? 2 : passo < 1 ? 1 : 0;
    for (let x = Math.ceil(v[0] / passo) * passo; x < v[2]; x += passo) {
      s += `<text x="${A.X(x).toFixed(1)}" y="${altura - 6}" font-size="10" fill="${TINTA_SUAVE}" text-anchor="middle">${Math.abs(x).toFixed(cas).replace(".", ",")}°${x < 0 ? "O" : "L"}</text>`;
    }
    for (let y = Math.ceil(v[1] / passo) * passo; y < v[3]; y += passo) {
      s += `<text x="6" y="${A.Y(y).toFixed(1)}" font-size="10" fill="${TINTA_SUAVE}" dominant-baseline="central">${Math.abs(y).toFixed(cas).replace(".", ",")}°${y < 0 ? "S" : "N"}</text>`;
    }
    const rots = rotulosClasses(lims);
    const lw = Math.max(...rots.map((r) => larguraTexto(r, 11))) + 40;
    const lh = 18 * RAMPA.length + 34;
    const lx = larg - lw - 10, ly = altura - lh - 10;
    s += `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="4" fill="#FFFFFF" fill-opacity=".92" stroke="${LINHA}"/>` +
      `<text x="${lx + 10}" y="${ly + 20}" font-size="11.5" font-weight="600" fill="${TINTA}">Prevalência</text>`;
    RAMPA.forEach((c, i) => {
      s += `<rect x="${lx + 10}" y="${ly + 30 + i * 18}" width="13" height="13" fill="${c}" stroke="${TINTA_SUAVE}" stroke-width=".5"/>` +
        `<text x="${lx + 30}" y="${ly + 41 + i * 18}" font-size="11" fill="${TINTA}">${esc(rots[i])}</text>`;
    });
    svg.innerHTML = s;
  };
  desenhar();

  // zoom (roda do mouse, botões) e arrasto
  let quadro = 0;
  const pedir = () => { if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; desenhar(); }); };
  const zoom = (fator, fx = 0.5, fy = 0.5) => {
    const m = mostrada;
    const w = m[2] - m[0], h = m[3] - m[1];
    const cx = m[0] + fx * w, cy = m[3] - fy * h;
    const nw = w / fator, nh = h / fator;
    const maxW = (ext0[2] - ext0[0]) * 1.5;
    if (nw > maxW) return;
    vista = [cx - fx * nw, cy - (1 - fy) * nh, cx + (1 - fx) * nw, cy + fy * nh];
    pedir();
  };
  el.querySelector(".zoom").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-z]");
    if (!b) return;
    const z = Number(b.dataset.z);
    if (z === 0) { vista = [...ext0]; pedir(); } else zoom(z);
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  let arr = null;
  svg.addEventListener("pointerdown", (e) => { arr = { x: e.clientX, y: e.clientY, v: [...mostrada] }; svg.setPointerCapture(e.pointerId); svg.classList.add("arrastando"); });
  svg.addEventListener("pointermove", (e) => {
    if (!arr) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - arr.x) / r.width) * (arr.v[2] - arr.v[0]);
    const dy = ((e.clientY - arr.y) / r.height) * (arr.v[3] - arr.v[1]);
    vista = [arr.v[0] - dx, arr.v[1] + dy, arr.v[2] - dx, arr.v[3] + dy];
    pedir();
  });
  const soltar = () => { arr = null; svg.classList.remove("arrastando"); };
  svg.addEventListener("pointerup", soltar);
  svg.addEventListener("pointercancel", soltar);
}
