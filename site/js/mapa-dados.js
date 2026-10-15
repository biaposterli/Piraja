// Mapas — dados: malhas do IBGE (carregadas sob demanda), associação dos
// nomes da planilha às áreas, limites enviados por quem usa e classes.
// Tradução da parte de dados de mapas.py.

import { semAcento, splitWs, isNulo, pyRound, sortedStr, cmpStr } from "./util.js";
import { npRound1 } from "./relatorio.js";
import { carregarScript } from "./tabela.js";

export const RAMPA = ["#F3E4DB", "#E2B49A", "#C97E5C", "#9C4A2F", "#5E2A19"];
export const FONTE_MALHA = "Base cartográfica: IBGE, Malha Municipal Digital (2025)";
export const SRC_TXT = "Sistema de referência: SIRGAS 2000 (EPSG:4674)";
export const FONTE_BAIRROS_IBGE = "IBGE, Malha de Bairros (Censo 2022)";

export const REGIOES = {
  Norte: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
  Nordeste: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  "Centro-Oeste": ["DF", "GO", "MS", "MT"],
  Sudeste: ["ES", "MG", "RJ", "SP"],
  Sul: ["PR", "RS", "SC"],
};
export const REGIAO_DA_UF = Object.fromEntries(Object.entries(REGIOES).flatMap(([r, us]) => us.map((u) => [u, r])));
export const NOME_UF = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};
export const TODAS_UFS = sortedStr(Object.keys(NOME_UF));
// cidades em que a divisão intramunicipal oficial não se chama "bairro"
export const TERMO_DIVISAO = { "São Paulo/SP": "distrito", "Brasília/DF": "região administrativa" };
// nomes populares -> nome oficial da divisão (por código de município do IBGE)
const APELIDOS = {
  5300108: {
    estrutural: "scia", "cidade estrutural": "scia", "vila estrutural": "scia",
    "sol nascente": "sol nascente/por do sol", "por do sol": "sol nascente/por do sol",
    sudoeste: "sudoeste/octogonal", octogonal: "sudoeste/octogonal",
    brasilia: "plano piloto", "asa sul": "plano piloto", "asa norte": "plano piloto",
    "nucleo bandeirantes": "nucleo bandeirante", itapoa: "itapoa",
  },
};

/** Chave de nome de lugar: sem acento, minúsculas, hífen vira espaço. */
export function chave(x) {
  const t = isNulo(x) ? "" : String(x);
  return splitWs(semAcento(t).toLowerCase().replaceAll("-", " ")).join(" ");
}

// ---------------------------------------------------------------------------
// geometria básica (coordenadas em graus)
// ---------------------------------------------------------------------------
export function poligonos(geom) {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates];
  if (geom.type === "MultiPolygon") return geom.coordinates;
  if (geom.type === "GeometryCollection") return geom.geometries.flatMap(poligonos);
  return [];
}

export function bboxGeom(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pol of poligonos(geom)) {
    for (const [x, y] of pol[0] || []) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return [x0, y0, x1, y1];
}

export function limitesTotais(feats) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of feats) {
    const c = f.bbox;
    b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])];
  }
  return b;
}

function areaAnel(anel) {
  let a = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) a += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  return Math.abs(a / 2);
}

export function areaGeom(geom) {
  let a = 0;
  for (const pol of poligonos(geom)) {
    a += areaAnel(pol[0] || []);
    for (const h of pol.slice(1)) a -= areaAnel(h);
  }
  return a;
}

function dentroAnel(x, y, anel) {
  let d = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

export function contem(geom, x, y) {
  for (const pol of poligonos(geom)) {
    if (!pol[0] || !dentroAnel(x, y, pol[0])) continue;
    if (pol.slice(1).some((h) => dentroAnel(x, y, h))) continue;
    return true;
  }
  return false;
}

export const intersectaCaixa = (b, ext) => !(b[2] < ext[0] || b[0] > ext[2] || b[3] < ext[1] || b[1] > ext[3]);
export const recortar = (feats, ext) => feats.filter((f) => intersectaCaixa(f.bbox, ext));

/** Ponto representativo (pólo de inacessibilidade do maior polígono, com o aspecto da latitude). */
let _polylabel = null;
export async function prepararPolylabel() {
  if (!_polylabel) _polylabel = (await import("../vendor/polylabel.js")).default;
  return _polylabel;
}
export function pontoRepresentativo(geom) {
  const pols = poligonos(geom);
  if (!pols.length) return null;
  let melhor = pols[0], am = -1;
  for (const p of pols) { const a = areaAnel(p[0] || []); if (a > am) { am = a; melhor = p; } }
  const b = bboxGeom({ type: "Polygon", coordinates: melhor });
  const k = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
  const proj = melhor.map((anel) => anel.map(([x, y]) => [x * k, y]));
  const prec = Math.max((b[2] - b[0]) * k, b[3] - b[1]) / 200 || 1e-6;
  const [px, py] = _polylabel(proj, prec);
  return [px / k, py];
}

// ---------------------------------------------------------------------------
// carregamento das malhas (geo/*.geojson.gz, descompactadas no navegador)
// ---------------------------------------------------------------------------
const _cache = new Map();

// lista das malhas que existem (geo/arquivos.json, gerado por tools/preparar_geo.py):
// evita pedir ao servidor arquivos que não existem (ex.: malha complementar de uma UF)
let _manifesto = null;
async function existe(caminho) {
  if (!_manifesto) {
    _manifesto = (async () => {
      try {
        const b = await lerBytes("geo/arquivos.json");
        return b ? new Set(JSON.parse(new TextDecoder().decode(b))) : null;
      } catch { return null; }
    })();
  }
  const m = await _manifesto;
  return !m || m.has(caminho.replace(/^geo\//, ""));
}

async function lerBytes(caminho) {
  if (globalThis.__pjLerArquivo) {
    try { return await globalThis.__pjLerArquivo(caminho); } catch { return null; }
  }
  const r = await fetch(caminho);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`não foi possível baixar ${caminho} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

async function descompactar(bytes) {
  // alguns servidores já entregam o .gz descompactado (Content-Encoding): confere a assinatura
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function carregarJson(caminho) {
  if (!_cache.has(caminho)) {
    _cache.set(caminho, (async () => {
      if (!(await existe(caminho))) return null;
      const b = await lerBytes(caminho);
      if (!b) return null;
      return JSON.parse(new TextDecoder().decode(await descompactar(b)));
    })());
  }
  return _cache.get(caminho);
}

function feicoes(fc, extra = {}) {
  return fc.features.map((f) => ({ props: { ...f.properties, ...extra }, geom: f.geometry, bbox: bboxGeom(f.geometry) }));
}

const _feats = new Map();
async function memo(chaveMemo, fn) {
  if (!_feats.has(chaveMemo)) _feats.set(chaveMemo, fn());
  return _feats.get(chaveMemo);
}

export function municipiosUf(uf) {
  return memo(`m:${uf}`, async () => {
    const fc = await carregarJson(`geo/malha_municipal_2025/${uf.toUpperCase()}.geojson.gz`);
    if (!fc) return null;
    return feicoes(fc).map((f) => ({ ...f, k: chave(f.props.nome) }));
  });
}

export function municipiosUfDetalhe(uf) {
  return memo(`md:${uf}`, async () => {
    const fc = await carregarJson(`geo/malha_municipal_detalhe/${uf.toUpperCase()}.geojson.gz`);
    if (!fc) return municipiosUf(uf);
    return feicoes(fc).map((f) => ({ ...f, k: chave(f.props.nome) }));
  });
}

export function contornoUfs() {
  return memo("ufs", async () => feicoes(await carregarJson("geo/ufs_2025.geojson.gz")));
}

export function contornoUfReal(uf) {
  return memo(`cu:${uf}`, async () => {
    const fc = await carregarJson(`geo/contorno_uf/${uf.toUpperCase()}.geojson.gz`);
    return fc ? feicoes(fc) : null;
  });
}

export function indiceMunicipios() {
  return memo("indice", async () => {
    const lista = await carregarJson("geo/municipios_indice.json.gz");
    return lista.map(([cd, nome, uf]) => ({ cd_mun: cd, nome, uf, k: chave(nome) }));
  });
}

/** Divisões intramunicipais da UF: bairros do IBGE + malhas complementares. */
export function bairrosUf(uf) {
  return memo(`b:${uf}`, async () => {
    const partes = [];
    const ibge = await carregarJson(`geo/malha_bairros_2022/${uf.toUpperCase()}.geojson.gz`);
    if (ibge) partes.push(...feicoes(ibge, { fonte: FONTE_BAIRROS_IBGE }));
    const extra = await carregarJson(`geo/malha_bairros_extra/${uf.toUpperCase()}.geojson.gz`);
    if (extra) partes.push(...feicoes(extra));
    if (!partes.length) return null;
    // se um município tiver malha complementar, ela substitui a do IBGE para ele
    const extraMun = new Set(partes.filter((f) => f.props.fonte !== FONTE_BAIRROS_IBGE).map((f) => String(f.props.cd_mun)));
    return partes.filter((f) => !(f.props.fonte === FONTE_BAIRROS_IBGE && extraMun.has(String(f.props.cd_mun))))
      .map((f) => ({ ...f, k: chave(f.props.nome), km: chave(f.props.municipio) }));
  });
}

async function ufsNaExtensao(ext) {
  const ufs = await contornoUfs();
  return ufs.filter((f) => intersectaCaixa(f.bbox, ext)).map((f) => f.props.sigla);
}

// ---------------------------------------------------------------------------
// difflib.get_close_matches (Python) — para nomes de bairro parecidos
// ---------------------------------------------------------------------------
class SequenceMatcher {
  constructor(a, b) { this.a = a; this.b = b; this._b2j(); }
  _b2j() {
    const b = this.b;
    this.b2j = new Map();
    [...b].forEach((ch, i) => { if (!this.b2j.has(ch)) this.b2j.set(ch, []); this.b2j.get(ch).push(i); });
    const n = b.length;
    if (n >= 200) { // autojunk
      const lim = Math.floor(n / 100) + 1;
      for (const [ch, idx] of [...this.b2j]) if (idx.length > lim) this.b2j.delete(ch);
    }
  }
  longest(alo, ahi, blo, bhi) {
    const a = this.a;
    let besti = alo, bestj = blo, bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const nova = new Map();
      for (const j of this.b2j.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        nova.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = nova;
    }
    return [besti, bestj, bestsize];
  }
  matchingBlocks() {
    const la = this.a.length, lb = this.b.length;
    const fila = [[0, la, 0, lb]], blocos = [];
    while (fila.length) {
      const [alo, ahi, blo, bhi] = fila.pop();
      const [i, j, k] = this.longest(alo, ahi, blo, bhi);
      if (k) {
        blocos.push([i, j, k]);
        if (alo < i && blo < j) fila.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) fila.push([i + k, ahi, j + k, bhi]);
      }
    }
    blocos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    return blocos;
  }
  ratio() {
    const m = this.matchingBlocks().reduce((s, b) => s + b[2], 0);
    const t = this.a.length + this.b.length;
    return t ? (2 * m) / t : 1;
  }
  quickRatio() {
    const cont = new Map();
    for (const ch of this.b) cont.set(ch, (cont.get(ch) || 0) + 1);
    let m = 0;
    for (const ch of this.a) { const n = cont.get(ch) || 0; if (n > 0) m++; cont.set(ch, n - 1); }
    const t = this.a.length + this.b.length;
    return t ? (2 * m) / t : 1;
  }
  realQuickRatio() {
    const la = this.a.length, lb = this.b.length, t = la + lb;
    return t ? (2 * Math.min(la, lb)) / t : 1;
  }
}

export function closeMatch(palavra, possiveis, cutoff = 0.82) {
  let melhor = null;
  for (const x of possiveis) {
    const s = new SequenceMatcher(x, palavra);
    if (s.realQuickRatio() >= cutoff && s.quickRatio() >= cutoff) {
      const r = s.ratio();
      if (r >= cutoff && (!melhor || r > melhor[0] || (r === melhor[0] && cmpStr(x, melhor[1]) > 0))) melhor = [r, x];
    }
  }
  return melhor ? melhor[1] : null;
}

// ---------------------------------------------------------------------------
// associação: tabela de prevalência -> áreas da malha
// ---------------------------------------------------------------------------
function wilson196(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [pyRound(100 * Math.max(0.0, c - h), 1), pyRound(100 * Math.min(1.0, c + h), 1)];
}

const CAMPOS = ["n_pacientes", "n_positivos", "prevalencia", "ic95_inf", "ic95_sup", "n_positivos_patogenico", "prevalencia_patogenico"];

async function codigoMunicipio(nome, uf) {
  const k = chave(nome);
  const idx = await indiceMunicipios();
  const achados = idx.filter((m) => m.k === k && (!uf || m.uf === uf));
  return achados.length === 1 ? achados[0] : null;
}

export async function casarMunicipios(tab) {
  const avisos = [], areas = [], ufs = new Set();
  const idx = await indiceMunicipios();
  for (const r of tab) {
    const k = chave(r.municipio);
    const uf = String(r.uf ?? "").trim().toUpperCase();
    const achados = idx.filter((m) => m.k === k && (uf ? m.uf === uf : true));
    if (!achados.length) {
      avisos.push(`Município não encontrado na malha do IBGE: ${r.municipio}` + (uf ? `/${uf}` : ""));
      continue;
    }
    if (achados.length > 1) {
      avisos.push(`'${r.municipio}' existe em mais de um estado — preencha a coluna uf`);
      continue;
    }
    const feats = await municipiosUf(achados[0].uf);
    const f = feats.find((x) => String(x.props.cd_mun) === String(achados[0].cd_mun));
    const props = { ...f.props };
    for (const c of Object.keys(r)) if (c !== "municipio" && c !== "uf") props[c] = r[c];
    areas.push({ ...f, props });
    ufs.add(props.uf);
  }
  return { areas: areas.length ? areas : null, ufs, avisos };
}

export async function casarBairrosIbge(tab) {
  const avisos = [], partes = [], munisOk = new Set(), ufs = new Set();
  const semMalha = new Set(), naoAchados = [], aproximados = [];
  for (const r of tab) {
    const ufIn = String(r.uf ?? "").trim().toUpperCase();
    const cod = await codigoMunicipio(r.municipio, ufIn);
    if (!cod) { naoAchados.push(`${r.bairro} (${r.municipio})`); continue; }
    const { cd_mun: cdMun, uf } = cod;
    const b = await bairrosUf(uf);
    const bm = b ? b.filter((f) => String(f.props.cd_mun) === String(cdMun)) : [];
    if (!bm.length) { semMalha.add(`${r.municipio}/${uf}`); continue; }
    munisOk.add(String(cdMun));
    ufs.add(uf);
    let k = chave(r.bairro);
    k = (APELIDOS[cdMun] || {})[k] || k;
    let hit = bm.filter((f) => f.k === k);
    if (!hit.length) hit = bm.filter((f) => f.k.split("/").map((p) => p.trim()).includes(k)); // nome composto "A/B"
    if (!hit.length) {
      const parecido = closeMatch(k, bm.map((f) => f.k), 0.82);
      if (!parecido) { naoAchados.push(`${r.bairro} (${r.municipio})`); continue; }
      hit = bm.filter((f) => f.k === parecido);
      aproximados.push(`${r.bairro} → ${hit[0].props.nome}`);
    }
    const props = { ...hit[0].props, nome: r.bairro };
    for (const c of Object.keys(r)) if (!["bairro", "municipio", "uf"].includes(c)) props[c] = r[c];
    partes.push({ ...hit[0], props });
  }
  if (semMalha.size) {
    avisos.push("Municípios sem divisão em bairros nas malhas disponíveis (IBGE, Censo 2022, e complementares): " +
      sortedStr(semMalha).join(", ") + ". Use o mapa por município ou envie os limites da prefeitura.");
  }
  if (aproximados.length) avisos.push("Bairros associados pelo nome mais parecido na malha de bairros — confira: " + aproximados.join("; "));
  if (naoAchados.length) avisos.push("Bairros não encontrados nas malhas de bairros (ficaram fora do mapa): " + naoAchados.join(", "));
  if (!partes.length) return { areas: null, sem: null, ufs, avisos };

  // se dois nomes da planilha caíram no mesmo bairro do IBGE, soma
  let com = partes;
  const cont = new Map();
  for (const p of partes) cont.set(p.props.cd_bairro, (cont.get(p.props.cd_bairro) || 0) + 1);
  if ([...cont.values()].some((n) => n > 1)) {
    const dups = partes.filter((p) => cont.get(p.props.cd_bairro) > 1).map((p) => p.props.nome);
    avisos.push("Nomes diferentes da planilha caíram no mesmo bairro do IBGE e foram somados: " + sortedStr(new Set(dups)).join(", "));
    const grupos = new Map();
    for (const p of partes) { if (!grupos.has(p.props.cd_bairro)) grupos.set(p.props.cd_bairro, []); grupos.get(p.props.cd_bairro).push(p); }
    com = sortedStr([...grupos.keys()].map(String)).map((cd) => {
      const g = grupos.get(cd) ?? grupos.get(Number(cd));
      const soma = (c) => g.reduce((a, x) => a + x.props[c], 0);
      const n = soma("n_pacientes"), pos = soma("n_positivos"), pat = soma("n_positivos_patogenico");
      const [i, s] = wilson196(pos, n);
      return { ...g[0], props: { ...g[0].props, cd_bairro: g[0].props.cd_bairro, nome: g.map((x) => x.props.nome).join(" / "),
        n_pacientes: n, n_positivos: pos, n_positivos_patogenico: pat, prevalencia: npRound1(100 * pos / n),
        prevalencia_patogenico: npRound1(100 * pat / n), ic95_inf: i, ic95_sup: s } };
    });
  }
  const usados = new Set(com.map((f) => f.props.cd_bairro));
  const todos = [];
  for (const u of ufs) todos.push(...((await bairrosUf(u)) || []));
  const sem = todos.filter((f) => munisOk.has(String(f.props.cd_mun)) && !usados.has(f.props.cd_bairro));
  return { areas: com, sem, ufs, avisos };
}

// ---------------------------------------------------------------------------
// limites de bairros enviados por quem usa (GeoJSON ou shapefile .zip)
// ---------------------------------------------------------------------------
const PROJ_BR = {
  4674: "+proj=longlat +ellps=GRS80 +no_defs", 4326: "+proj=longlat +datum=WGS84 +no_defs",
  4618: "+proj=longlat +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +no_defs",
};
for (let z = 18; z <= 25; z++) {
  PROJ_BR[31960 + z] = `+proj=utm +zone=${z} +south +ellps=GRS80 +units=m +no_defs`; // SIRGAS 2000 / UTM zS (31978–31985)
  PROJ_BR[32700 + z] = `+proj=utm +zone=${z} +south +datum=WGS84 +units=m +no_defs`;
  PROJ_BR[29170 + z] = `+proj=utm +zone=${z} +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs`; // SAD69
}
PROJ_BR[31982 + 0] = PROJ_BR[31982]; // (mantém)

function epsgDoCrs(crs) {
  const nome = crs?.properties?.name || "";
  const m = /(?:EPSG::?|EPSG:)(\d+)/i.exec(nome) || /^(\d+)$/.exec(nome);
  if (/CRS84/i.test(nome)) return 4326;
  return m ? Number(m[1]) : null;
}

function reprojetarGeom(geom, fn) {
  const anel = (a) => a.map(([x, y]) => fn([x, y]));
  if (geom.type === "Polygon") return { type: "Polygon", coordinates: geom.coordinates.map(anel) };
  if (geom.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: geom.coordinates.map((p) => p.map(anel)) };
  return geom;
}

/** Lê GeoJSON ou shapefile (.zip). Devolve { feats, cols } (cols = colunas de texto). */
export async function lerLimites(buffer, nomeArquivo) {
  let fc;
  if (/\.zip$/i.test(nomeArquivo)) {
    if (!globalThis.shp) await carregarScript("vendor/shp.min.js");
    let r = await globalThis.shp(buffer); // converte para WGS84 pelo .prj
    if (Array.isArray(r)) r = { type: "FeatureCollection", features: r.flatMap((x) => x.features) };
    if (!r.features?.length) throw new Error("O .zip não tem um arquivo .shp com polígonos.");
    fc = r;
  } else {
    fc = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
    if (fc.type === "Feature") fc = { type: "FeatureCollection", features: [fc] };
    const epsg = epsgDoCrs(fc.crs);
    if (epsg && epsg !== 4674 && epsg !== 4326) {
      if (!PROJ_BR[epsg]) throw new Error(`sistema de coordenadas EPSG:${epsg} não suportado — salve o arquivo em SIRGAS 2000 (EPSG:4674) ou WGS 84`);
      if (!globalThis.proj4) await carregarScript("vendor/proj4.js");
      const conv = globalThis.proj4(PROJ_BR[epsg], PROJ_BR[4674]);
      fc = { ...fc, features: fc.features.map((f) => ({ ...f, geometry: f.geometry && reprojetarGeom(f.geometry, (p) => conv.forward(p)) })) };
    }
  }
  const feats = fc.features.filter((f) => f.geometry && ["Polygon", "MultiPolygon"].includes(f.geometry.type))
    .map((f) => ({ props: { ...(f.properties || {}) }, geom: f.geometry, bbox: bboxGeom(f.geometry) }));
  if (!feats.length) throw new Error("o arquivo não tem polígonos");
  const b = limitesTotais(feats);
  if (b[0] < -180 || b[2] > 180 || b[1] < -90 || b[3] > 90) {
    throw new Error("as coordenadas não estão em graus (latitude/longitude) — informe o sistema de coordenadas (.prj) ou salve em SIRGAS 2000");
  }
  const chaves = new Set();
  for (const f of feats) for (const k of Object.keys(f.props)) chaves.add(k);
  const cols = [...chaves].filter((k) => feats.some((f) => typeof f.props[k] === "string"));
  return { feats, cols };
}

export function colunaNomeProvavel(cols) {
  const pref = ["nm_bairro", "bairro", "nome_bairro", "nome", "nm_bai", "name", "nm"];
  const k = new Map(cols.map((c) => [c.toLowerCase(), c]));
  for (const p of pref) if (k.has(p)) return k.get(p);
  for (const c of cols) if (c.toLowerCase().includes("bairro") || c.toLowerCase().includes("nome")) return c;
  return cols.length ? cols[0] : null;
}

const titulo = (s) => { let o = "", ant = false; for (const ch of s) { const l = /\p{L}/u.test(ch); o += l ? (ant ? ch.toLowerCase() : ch.toUpperCase()) : ch; ant = l; } return o; };

export function casarBairros(tab, limites, colNome) {
  // dissolve por nome (mesmo bairro em vários polígonos)
  const porK = new Map();
  for (const f of limites.feats) {
    const k = chave(f.props[colNome]);
    if (!porK.has(k)) porK.set(k, { props: { ...f.props }, pols: [] });
    porK.get(k).pols.push(...poligonos(f.geom));
  }
  const lim = sortedStr([...porK.keys()]).map((k) => {
    const g = { type: "MultiPolygon", coordinates: porK.get(k).pols };
    return { k, props: porK.get(k).props, geom: g, bbox: bboxGeom(g) };
  });
  let t = tab.map((r) => ({ ...r, k: chave(r.bairro) }));
  const avisos = [];
  const cont = new Map();
  for (const r of t) cont.set(r.k, (cont.get(r.k) || 0) + 1);
  if ([...cont.values()].some((n) => n > 1)) {
    avisos.push("Bairros com o mesmo nome em municípios diferentes foram somados no mapa: " +
      sortedStr(new Set(t.filter((r) => cont.get(r.k) > 1).map((r) => r.bairro))).join(", "));
    const g = new Map();
    for (const r of t) { if (!g.has(r.k)) g.set(r.k, []); g.get(r.k).push(r); }
    t = sortedStr([...g.keys()]).map((k) => {
      const l = g.get(k), soma = (c) => l.reduce((a, x) => a + x[c], 0);
      const n = soma("n_pacientes"), pos = soma("n_positivos"), pat = soma("n_positivos_patogenico");
      return { k, bairro: l[0].bairro, n_pacientes: n, n_positivos: pos, n_positivos_patogenico: pat,
        prevalencia: npRound1(100 * pos / n), prevalencia_patogenico: npRound1(100 * pat / n) };
    });
  }
  const porDado = new Map(t.map((r) => [r.k, r]));
  const faltando = sortedStr([...new Set(t.map((r) => r.k))].filter((k) => !porK.has(k)));
  if (faltando.length) avisos.push("Bairros da planilha que não estão no arquivo de limites: " + faltando.map((k) => porDado.get(k).bairro).join(", "));
  const todos = lim.map((f) => {
    const d = porDado.get(f.k);
    const props = { ...f.props };
    if (d) for (const c of ["bairro", ...CAMPOS]) if (c in d) props[c] = d[c];
    props.nome = d ? d.bairro : titulo(String(f.props[colNome]));
    return { props, geom: f.geom, bbox: f.bbox, temDado: Boolean(d) };
  });
  const com = todos.filter((f) => f.temDado);
  return { areas: com.length ? com : null, todos, avisos };
}

// ---------------------------------------------------------------------------
// classes de prevalência
// ---------------------------------------------------------------------------
export function classes(valores, modo = "auto") {
  if (modo === "fixas") return [0, 10, 20, 40, 60, 100.0001];
  const v = valores.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
  if (!v.length) return [0, 20, 40, 60, 80, 100.0001];
  let lo = 5 * Math.floor(Math.min(...v) / 5);
  let hi = 5 * Math.ceil(Math.max(...v) / 5);
  if (hi <= lo) hi = lo + 5;
  if (v.length < 3) return [0, 10, 20, 40, 60, 100.0001]; // uma ou duas áreas
  const passo = Math.max(5, 5 * Math.ceil((hi - lo) / 25));
  if (lo + 4 * passo >= 100) lo = Math.max(0, 100 - 5 * passo);
  const lims = Array.from({ length: 6 }, (_, i) => lo + i * passo);
  lims[5] = Math.max(lims[5], Math.max(...v)) + 0.0001;
  return lims;
}

/** f"{x:g}" do Python, com vírgula decimal. */
export function fmtG(x) {
  return String(Number(Number(x).toPrecision(6))).replace(".", ",");
}

export function rotulosClasses(lims) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const a = lims[i], b = lims[i + 1];
    if (i === 0 && a === 0) out.push(`< ${fmtG(b)}%`);
    else if (i === 4) out.push(`≥ ${fmtG(a)}%`);
    else out.push(`${fmtG(a)}–${fmtG(pyRound(b, 1))}%`);
  }
  return out;
}

export function corDe(v, lims) {
  for (let i = 0; i < 5; i++) if (v < lims[i + 1]) return RAMPA[i];
  return RAMPA[4];
}

// ---------------------------------------------------------------------------
// opções de recorte a partir dos dados
// ---------------------------------------------------------------------------
function somaOrdenada(pares) {
  const m = new Map();
  for (const [k, v] of pares) m.set(k, (m.get(k) || 0) + v);
  return sortedStr([...m.keys()]).map((k) => [k, m.get(k)]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

export function opcoesRecorte(metrics, nivel) {
  const tab = metrics[nivel === "municipio" ? "territorio_municipio" : "territorio_bairro"];
  if (!tab || !tab.length) return { regiao: [], estado: [], municipio: [] };
  const t = tab.map((r) => ({ ...r, _uf: String(r.uf).toUpperCase() })).filter((r) => r._uf in NOME_UF);
  return {
    regiao: somaOrdenada(t.map((r) => [REGIAO_DA_UF[r._uf], r.n_pacientes])),
    estado: somaOrdenada(t.map((r) => [r._uf, r.n_pacientes])),
    municipio: somaOrdenada(t.map((r) => [`${r.municipio}/${r._uf}`, r.n_pacientes])),
  };
}

export function ufsDoRecorte(recorte, valor) {
  if (recorte === "regiao") return new Set(REGIOES[valor] || []);
  if (recorte === "estado") return new Set([String(valor).toUpperCase()]);
  if (recorte === "municipio") return new Set([String(valor).split("/").slice(1).join("/").toUpperCase()]);
  return new Set(Object.keys(NOME_UF));
}

function extPad(b, frac = 0.06, minimo = 0.01) {
  const pad = Math.max(b[2] - b[0], b[3] - b[1]) * frac + minimo;
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}

// ---------------------------------------------------------------------------
// cena do mapa (equivalente a preparar_mapa, antes de desenhar)
// ---------------------------------------------------------------------------
export async function prepararCena(metrics, o) {
  const { nivel, indicador, modoClasses = "auto", limites = null, colNome = null, recorte = "brasil", recorteValor = null, estilo = "areas" } = o;
  let { mostrarRotulos = null } = o;
  await prepararPolylabel();
  const valorCol = indicador === "todos" ? "prevalencia" : "prevalencia_patogenico";
  const qual = indicador === "todos" ? "enteroparasitos" : "enteroparasitos patogênicos";
  const avisos = [];
  const ufsRec = ufsDoRecorte(recorte, recorteValor);
  const tabM = metrics.territorio_municipio;
  if (!tabM || !tabM.length) return { ok: false, erro: "Nenhum paciente com município preenchido — não há o que mapear.", avisos };

  let areas, sem = null, rotArea, unidade, nota = "";
  const nomeFoco = recorte === "municipio" ? String(recorteValor).split("/")[0] : null;
  if (nivel === "municipio") {
    let t = tabM.filter((r) => recorte === "brasil" || ufsRec.has(String(r.uf).toUpperCase()));
    if (recorte === "municipio") t = t.filter((r) => chave(r.municipio) === chave(nomeFoco));
    if (!t.length) return { ok: false, erro: "Nenhum paciente com município neste recorte.", avisos };
    const r = await casarMunicipios(t);
    avisos.push(...r.avisos);
    if (!r.areas) return { ok: false, erro: "Nenhum município do recorte foi encontrado na malha do IBGE.", avisos };
    areas = r.areas;
    rotArea = "Município";
    unidade = "município";
  } else {
    const tabB = metrics.territorio_bairro;
    if (!tabB || !tabB.length) return { ok: false, erro: "Nenhum paciente com bairro preenchido.", avisos };
    let tb = tabB.filter((r) => recorte === "brasil" || ufsRec.has(String(r.uf).toUpperCase()));
    if (recorte === "municipio") tb = tb.filter((r) => chave(r.municipio) === chave(nomeFoco));
    if (!tb.length) return { ok: false, erro: "Nenhum paciente com bairro neste recorte.", avisos };
    if (!limites) {
      const r = await casarBairrosIbge(tb);
      avisos.push(...r.avisos);
      if (!r.areas) {
        return { ok: false, erro: "Nenhum bairro do recorte foi encontrado nas malhas de bairros. Use o mapa por município ou envie os limites da prefeitura.", avisos };
      }
      areas = r.areas;
      sem = r.sem;
      const fontes = sortedStr(new Set(areas.map((f) => f.props.fonte).filter(Boolean)));
      nota = "Limites intramunicipais: " + (fontes.length ? fontes : [FONTE_BAIRROS_IBGE]).join("; ");
    } else {
      const r = casarBairros(tb, limites, colNome);
      avisos.push(...r.avisos);
      if (!r.areas) {
        return { ok: false, erro: "Nenhum bairro da planilha foi encontrado no arquivo de limites (confira a coluna com o nome do bairro).", avisos };
      }
      areas = r.areas;
      sem = r.todos.filter((f) => !f.temDado);
      nota = "Limites intramunicipais: arquivo enviado pelo usuário";
    }
    rotArea = "Bairro";
    unidade = recorte === "municipio" ? (TERMO_DIVISAO[recorteValor] || "bairro") : "bairro";
  }

  // extensão e camadas de fundo, conforme o recorte
  const ufsGdf = await contornoUfs();
  const ufsDados = new Set(areas.map((f) => String(f.props.uf || "").toUpperCase()).filter(Boolean));
  let ext, fundo = [], fundoClaro = [], ufsContorno = null, local;
  if (recorte === "brasil") {
    ext = extPad(limitesTotais(ufsGdf), 0.03);
    fundo = [ufsGdf];
    local = "Brasil";
  } else if (recorte === "regiao") {
    const reg = ufsGdf.filter((f) => ufsRec.has(f.props.sigla));
    ext = extPad(limitesTotais(reg), 0.05);
    fundo = [ufsGdf];
    ufsContorno = reg;
    local = `Região ${recorteValor}`;
  } else if (recorte === "estado") {
    const uf = [...ufsRec][0];
    const munUf = await municipiosUf(uf);
    ext = extPad(limitesTotais(munUf), 0.05);
    for (const u of await ufsNaExtensao(ext)) {
      if (u === uf) continue;
      const g = await municipiosUf(u);
      if (g) fundoClaro.push(recortar(g, ext));
    }
    fundo = [munUf];
    ufsContorno = await contornoUfReal(uf);
    local = NOME_UF[uf] || uf;
  } else {
    const [nomeF, ...resto] = String(recorteValor).split("/");
    const uf = resto.join("/");
    const munUf = await municipiosUfDetalhe(uf);
    const alvo = munUf ? munUf.filter((f) => f.k === chave(nomeF)) : [];
    ext = extPad(alvo.length ? limitesTotais(alvo) : limitesTotais(areas), 0.08);
    const us = await ufsNaExtensao(ext);
    for (const u of us.length ? us : [uf]) {
      const g = await municipiosUfDetalhe(u);
      if (g) fundo.push(recortar(g, ext));
    }
    if (nivel === "municipio" && alvo.length) {
      const det = new Map(alvo.map((f) => [String(f.props.cd_mun), f]));
      areas = areas.map((f) => (det.has(String(f.props.cd_mun)) ? { ...f, geom: det.get(String(f.props.cd_mun)).geom, bbox: det.get(String(f.props.cd_mun)).bbox } : f));
    }
    local = String(recorteValor);
  }
  if (sem && sem.length) sem = recortar(sem, ext);
  const pontos = estilo === "pontos";
  const lims = classes(areas.map((f) => f.props[valorCol]), modoClasses);
  if (mostrarRotulos === null) mostrarRotulos = areas.length <= 15;
  const pequenos = areas.filter((f) => f.props.n_pacientes < 10).length;
  if (pequenos) avisos.push(`${pequenos} área(s) com menos de 10 pacientes: prevalência pouco precisa — interprete com cuidado (veja o IC 95% na tabela).`);
  if (!pontos && nivel === "municipio" && (recorte === "brasil" || recorte === "regiao")) {
    avisos.push("Em escala nacional/regional, municípios pequenos ficam quase invisíveis como áreas — se for o caso, use 'Círculos proporcionais'.");
  }
  for (const f of areas) f.ponto = pontoRepresentativo(f.geom);
  const titulo = `Prevalência de ${qual} por ${unidade} de residência — ${local}`;
  return {
    ok: true, avisos, titulo,
    cena: { areas, valorCol, lims, ext, pontos, rotulos: mostrarRotulos, fundo, fundoClaro, ufsContorno, sem, rotuloArea: rotArea,
      recorte, ufsDestaque: ufsDados.size ? ufsDados : ufsRec, titulo, nota, ufsGdf },
  };
}
