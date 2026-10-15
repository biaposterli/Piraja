// Utilidades compartilhadas — Pirajá (versão web)
//
// Várias funções aqui existem para reproduzir EXATAMENTE o comportamento do
// motor original em Python (pandas), para que os números do site sejam os
// mesmos: arredondamento do Python (round com empate para o par), comparação
// de textos sem acento, ordenação estável etc.

/** Texto sem acentos (equivalente a unicodedata NFD + remover categoria Mn). */
export function semAcento(t) {
  return t.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** Equivalente ao str() do Python para os valores lidos da planilha. */
export function pyStr(x) {
  if (x === null || x === undefined) return "";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number") return String(x);
  if (x instanceof Date) return isNaN(x) ? "" : x.toISOString().slice(0, 19).replace("T", " ");
  return String(x);
}

export function isNulo(x) {
  return x === null || x === undefined || (typeof x === "number" && Number.isNaN(x));
}

/** Espaços em branco (os mesmos que o str.split() do Python reconhece). */
const WS = /[\s\u001c-\u001f\u0085]+/gu;
export function splitWs(t) {
  return t.split(WS).filter(Boolean);
}

/** norm_text do motor: null para vazio; strings com espaços colapsados. */
export function normText(x) {
  if (isNulo(x)) return null;
  if (typeof x !== "string") return pyStr(x);
  const t = splitWs(x).join(" ");
  return t ? t : null;
}

/** _key / chave de comparação: minúsculas, sem acento, espaços únicos. */
export function chaveTexto(x) {
  const t = isNulo(x) ? "" : pyStr(x);
  return splitWs(semAcento(t).trim().toLowerCase()).join(" ");
}

/** Texto limpo (espaços colapsados), "" para vazio. */
export function texto(x) {
  if (isNulo(x)) return "";
  return splitWs(pyStr(x)).join(" ");
}

// ---------------------------------------------------------------------------
// round() do Python: arredondamento correto do valor binário exato, com
// empate para o dígito par. Number.prototype.toFixed arredonda o valor exato,
// mas desempata para cima — então o empate exato é detectado à parte.
// ---------------------------------------------------------------------------
const _buf = new DataView(new ArrayBuffer(8));
function _decompor(x) {
  // x = M * 2^E (M inteiro, BigInt)
  _buf.setFloat64(0, x);
  const hi = _buf.getUint32(0), lo = _buf.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (expBits === 0) e = -1074;
  else { mant |= 1n << 52n; e = expBits - 1075; }
  return [mant, e];
}

function _ehEmpate(x, nd) {
  // x * 10^nd * 2 é inteiro ímpar?
  const [m, e] = _decompor(Math.abs(x));
  if (m === 0n) return false;
  let v = m * 10n ** BigInt(nd) * 2n;
  if (e >= 0) v <<= BigInt(e);
  else {
    const d = 1n << BigInt(-e);
    if (v % d !== 0n) return false;
    v /= d;
  }
  return v % 2n === 1n;
}

export function pyRound(x, nd = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return x;
  if (_ehEmpate(x, nd)) {
    // empate exato: x·10^(nd+1) é inteiro terminado em 5, então toFixed(nd+1)
    // é exato; corta o 5 e arredonda para o dígito par
    const s = Math.abs(x).toFixed(nd + 1);
    const [ip, fp = ""] = s.slice(0, -1).split(".");
    let digits = BigInt(ip + fp);
    if (digits % 2n === 1n) digits += 1n;
    const ds = digits.toString().padStart(nd + 1, "0");
    const r = nd > 0 ? ds.slice(0, ds.length - nd) + "." + ds.slice(ds.length - nd) : ds;
    const v = parseFloat(r);
    return x < 0 ? -v : v;
  }
  const v = parseFloat(Math.abs(x).toFixed(nd));
  return x < 0 ? -v : (v === 0 ? 0 : v);
}

// ---------------------------------------------------------------------------
// ordenação estável e comparação de textos como o Python (ponto de código)
// ---------------------------------------------------------------------------
export function cmpStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpVal(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return cmpStr(String(a), String(b));
}

/** Ordenação estável por uma chave (valor ou lista de valores). */
export function ordenarPor(lista, chaveFn, desc = false) {
  return lista
    .map((v, i) => [v, i])
    .sort((A, B) => {
      const a = chaveFn(A[0]), b = chaveFn(B[0]);
      let c;
      if (Array.isArray(a)) {
        c = 0;
        for (let k = 0; k < a.length && c === 0; k++) c = cmpVal(a[k], b[k]);
      } else c = cmpVal(a, b);
      if (desc) c = -c;
      return c !== 0 ? c : A[1] - B[1];
    })
    .map(([v]) => v);
}

export function sortedStr(arr) {
  return [...arr].sort(cmpStr);
}

// ---------------------------------------------------------------------------
// erfc com precisão de ~1e-16 (W. J. Cody, "Rational Chebyshev approximations
// for the error function", 1969) — o Math do JavaScript não tem erfc.
// ---------------------------------------------------------------------------
export function erfc(x) {
  const ax = Math.abs(x);
  if (ax < 0.5) return 1 - _erfCody(x);
  const r = _erfcCody(ax);
  return x < 0 ? 2 - r : r;
}

function _erfCody(x) {
  const a = [3.1611237438705656, 113.86415415105016, 377.485237685302, 3209.3775891384694, 0.18577770618460315];
  const b = [23.601290952344122, 244.02463793444417, 1282.6165260773723, 2844.236833439171];
  const y = x * x;
  let xnum = a[4] * y, xden = y;
  for (let i = 0; i < 3; i++) { xnum = (xnum + a[i]) * y; xden = (xden + b[i]) * y; }
  return x * (xnum + a[3]) / (xden + b[3]);
}

function _erfcCody(y) {
  const c = [0.5641895835203197, 8.883149794388377, 66.11919063714163, 298.63513819740013,
    881.952221241769, 1712.0476126340707, 2051.0783778260716, 1230.3393547979972, 2.1531153547440383e-8];
  const d = [15.744926110709835, 117.6939508913125, 537.1811018620099, 1621.3895745666903,
    3290.7992357334597, 4362.619090143247, 3439.3676741437216, 1230.3393548037495];
  const p = [0.30532663496123236, 0.36034489994980445, 0.12578172611122926, 0.016083785148742275,
    6.587491615298378e-4, 0.016315387137302097];
  const q = [2.568520192289822, 1.8729528499234604, 0.5279051029514285, 0.06051834131244132,
    0.0023352049762686918];
  const SQRPI = 0.5641895835477563;
  let res;
  if (y <= 4) {
    let xnum = c[8] * y, xden = y;
    for (let i = 0; i < 7; i++) { xnum = (xnum + c[i]) * y; xden = (xden + d[i]) * y; }
    res = (xnum + c[7]) / (xden + d[7]);
  } else {
    if (y >= 26.543) return 0;
    const z = 1 / (y * y);
    let xnum = p[5] * z, xden = z;
    for (let i = 0; i < 4; i++) { xnum = (xnum + p[i]) * z; xden = (xden + q[i]) * z; }
    res = z * (xnum + p[4]) / (xden + q[4]);
    res = (SQRPI - res) / y;
  }
  // exp(-y²) calculado em duas partes para não perder precisão
  const ysq = Math.trunc(y * 16) / 16;
  const del = (y - ysq) * (y + ysq);
  return Math.exp(-ysq * ysq) * Math.exp(-del) * res;
}

// ---------------------------------------------------------------------------
// formatação
// ---------------------------------------------------------------------------
export function f1(v) {
  return Number(v).toFixed(1);
}

export function br(v, d = 1) {
  return Number(v).toFixed(d).replace(".", ",");
}

/** Escapa texto para HTML/SVG. */
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
