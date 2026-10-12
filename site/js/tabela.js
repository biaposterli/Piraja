// Leitura de planilhas (.xlsx com ExcelJS; .xls antigo com SheetJS) e
// conversão de uma aba em tabela, imitando o pandas.read_excel do app
// original: 1ª linha = cabeçalho, células vazias = nulo, textos como "NA" ou
// "#N/A" lidos como vazio, cabeçalhos repetidos viram "nome.1", "nome.2"...

import { isNulo, pyStr } from "./util.js";

// valores que o pandas lê como vazio (na_values padrão)
const NA_TEXTOS = new Set(["-1.#IND", "1.#QNAN", "1.#IND", "-1.#QNAN", "#N/A N/A", "#N/A", "N/A", "n/a", "NA",
  "<NA>", "#NA", "NULL", "null", "NaN", "-NaN", "nan", "-nan", "None", ""]);

/** Normaliza o valor de uma célula do ExcelJS para número/texto/data/booleano/nulo. */
export function valorCelulaExcelJS(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return valorCelulaExcelJS(v.result);
    if ("formula" in v || "sharedFormula" in v) return null;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return valorCelulaExcelJS(v.text);
    if ("error" in v) return v.error;
  }
  return String(v);
}

/** Lê o arquivo e devolve { nomes: [abas], abas: { nome: matriz } }. */
export async function lerPlanilha(buffer, nomeArquivo = "") {
  if (/\.xls$/i.test(nomeArquivo) || ehCfb(buffer)) return lerComSheetJS(buffer);
  try {
    return await lerComExcelJS(buffer);
  } catch (e) {
    // algumas planilhas exportadas por outros programas o ExcelJS não abre
    try { return await lerComSheetJS(buffer); } catch { throw e; }
  }
}

function ehCfb(buffer) {
  const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  return b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
}

async function lerComExcelJS(buffer) {
  const ExcelJS = await carregarExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const nomes = [], abas = {};
  wb.eachSheet((ws) => {
    nomes.push(ws.name);
    const m = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const linha = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        linha[colNumber - 1] = valorCelulaExcelJS(cell.value);
      });
      m[rowNumber - 1] = linha;
    });
    abas[ws.name] = normalizarMatriz(m);
  });
  return { nomes, abas };
}

async function lerComSheetJS(buffer) {
  const XLSX = await carregarSheetJS();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  const nomes = wb.SheetNames.slice(), abas = {};
  for (const n of nomes) {
    const m = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
    abas[n] = normalizarMatriz(m);
  }
  return { nomes, abas };
}

/** Preenche buracos com null, apara linhas vazias no fim e iguala as larguras. */
export function normalizarMatriz(m) {
  const linhas = [];
  for (let i = 0; i < m.length; i++) {
    const l = m[i] || [];
    const out = [];
    for (let j = 0; j < l.length; j++) {
      let v = l[j];
      if (v === undefined || (typeof v === "number" && Number.isNaN(v))) v = null;
      out.push(v);
    }
    while (out.length && (out[out.length - 1] === null || out[out.length - 1] === "")) out.pop();
    linhas.push(out);
  }
  while (linhas.length && linhas[linhas.length - 1].length === 0) linhas.pop();
  const larg = Math.max(0, ...linhas.map((l) => l.length));
  for (const l of linhas) while (l.length < larg) l.push(null);
  return linhas;
}

/** Aba (matriz) -> { columns, rows } como o pandas.read_excel(header=0). */
export function tabelaDeMatriz(matriz) {
  if (!matriz || !matriz.length) return { columns: [], rows: [] };
  const cab = matriz[0];
  const columns = [];
  const usados = new Set();
  cab.forEach((c, i) => {
    let nome = isNulo(c) || c === "" ? `Unnamed: ${i}` : pyStr(c);
    if (usados.has(nome)) {
      let k = 1;
      while (usados.has(`${nome}.${k}`)) k++;
      nome = `${nome}.${k}`;
    }
    usados.add(nome);
    columns.push(nome);
  });
  const rows = [];
  for (let i = 1; i < matriz.length; i++) {
    const o = { _idx: i - 1 };
    columns.forEach((c, j) => {
      let v = matriz[i][j];
      if (typeof v === "string" && NA_TEXTOS.has(v)) v = null;
      o[c] = v === undefined ? null : v;
    });
    rows.push(o);
  }
  return { columns, rows };
}

/** Versão "header=None" (abas de configuração): mesmos valores vazios do pandas. */
export function matrizSemNA(matriz) {
  return matriz.map((l) => l.map((v) => (typeof v === "string" && NA_TEXTOS.has(v) ? null : v)));
}

// ---------------------------------------------------------------------------
// bibliotecas (carregadas só quando precisa)
// ---------------------------------------------------------------------------
const _scripts = new Map();
export function carregarScript(src) {
  if (!_scripts.has(src)) {
    _scripts.set(src, new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error("Não foi possível carregar " + src));
      document.head.appendChild(s);
    }));
  }
  return _scripts.get(src);
}

export async function carregarExcelJS() {
  if (globalThis.ExcelJS) return globalThis.ExcelJS;
  await carregarScript("vendor/exceljs.min.js");
  return globalThis.ExcelJS;
}

export async function carregarSheetJS() {
  if (globalThis.XLSX) return globalThis.XLSX;
  await carregarScript("vendor/xlsx.full.min.js");
  return globalThis.XLSX;
}
