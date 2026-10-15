// Motor de análise epidemiológica — Pirajá · Entero
//
// Tradução fiel de analysis_engine.py (v8) para JavaScript. As regras, os
// denominadores e os arredondamentos são os mesmos do original; os comentários
// explicativos completos (histórico v1→v8) estão no arquivo Python, que fica
// no repositório como referência.
//
// Representação dos dados: uma "tabela" é { columns: [...], rows: [{...}] },
// com as colunas já normalizadas (normalizeColumns). Cada linha guarda também
// _idx, a posição original na planilha (usada como chave de coleta sem rótulo).

import { normText, pyRound, ordenarPor, sortedStr, erfc, semAcento, splitWs } from "./util.js";

export const PARASITE_MAP = {
  "e. vermiculares": "Enterobius vermicularis",
  "e. vermiculares +++": "Enterobius vermicularis",
  "e. vermicularis": "Enterobius vermicularis",
  "enterobius vermicularis": "Enterobius vermicularis",
  "e. nana": "Endolimax nana",
  "e.nana": "Endolimax nana",
  "e. nana +++": "Endolimax nana",
  "endolimax nana": "Endolimax nana",
  "g. lamblia": "Giardia lamblia",
  "giardia lamblia": "Giardia lamblia",
  "b. coli": "Balantidium coli",
  "balantidium coli": "Balantidium coli",
  "e. histolytica/dispar": "Entamoeba histolytica/dispar",
  "entamoeba histolytica/dispar": "Entamoeba histolytica/dispar",
  "i. butschlii": "Iodamoeba butschlii",
  "iodamoeba butschlii": "Iodamoeba butschlii",
  "iodamoeba": "Iodamoeba butschlii",
  "e. coli": "Entamoeba coli",
  "entamoeba coli": "Entamoeba coli",
  "a. lumbricoides": "Ascaris lumbricoides",
  "ascaris lumbricoides": "Ascaris lumbricoides",
  "t. trichiura": "Trichuris trichiura",
  "trichuris trichiura": "Trichuris trichiura",
  "ancilostomídeo": "Ancilostomídeos",
  "ancilostomideo": "Ancilostomídeos",
  "ancilostomídeos": "Ancilostomídeos",
  "ancilostomideos": "Ancilostomídeos",
  "s. stercoralis": "Strongyloides stercoralis",
  "strongyloides stercoralis": "Strongyloides stercoralis",
  "h. nana": "Hymenolepis nana",
  "hymenolepis nana": "Hymenolepis nana",
  "taenia sp.": "Taenia sp.",
  "taenia sp": "Taenia sp.",
  "s. mansoni": "Schistosoma mansoni",
  "schistosoma mansoni": "Schistosoma mansoni",
  "b. hominis": "Blastocystis sp.",
  "blastocystis hominis": "Blastocystis sp.",
  "blastocystis sp.": "Blastocystis sp.",
  "blastocystis sp": "Blastocystis sp.",
  "blastocystis": "Blastocystis sp.",
  "c. mesnili": "Chilomastix mesnili",
  "chilomastix mesnili": "Chilomastix mesnili",
  "e. hartmanni": "Entamoeba hartmanni",
  "entamoeba hartmanni": "Entamoeba hartmanni",
  "g. duodenalis": "Giardia lamblia",
  "giardia duodenalis": "Giardia lamblia",
  "giardia intestinalis": "Giardia lamblia",
};

export const PATOGENICOS = new Set([
  "Enterobius vermicularis", "Giardia lamblia", "Balantidium coli", "Entamoeba histolytica/dispar",
  "Ascaris lumbricoides", "Trichuris trichiura", "Ancilostomídeos", "Strongyloides stercoralis",
  "Hymenolepis nana", "Taenia sp.", "Schistosoma mansoni",
]);
// Blastocystis sp. fica de propósito SEM classificação padrão (patogenicidade
// controversa) — quem usa o sistema decide na configuração.
export const COMENSAIS = new Set([
  "Endolimax nana", "Iodamoeba butschlii", "Entamoeba coli", "Chilomastix mesnili", "Entamoeba hartmanni",
]);
const NEGATIVE_TOKENS = new Set(["-", "negativo", "neg"]);
const INSUFFICIENT_TOKENS = new Set(["amostra insuficiente", "insuficiente"]);
const NOT_PERFORMED_TOKENS = new Set([
  "não realizado", "nao realizado", "não realizada", "nao realizada",
  "não feito", "nao feito", "não executado", "nao executado",
]);

export const CATEGORIAS_VALIDAS = ["Patogênico", "Comensal", "Não classificado"];
export const DOMINIO_FECAL = "fecal";
export const DOMINIO_LAMINA = "lamina";

/**
 * Configuração da análise: renomear (Map nome detectado -> nome final),
 * excluidos (Set), categorias (Map nome final -> categoria), metodos (lista
 * [coluna, nome, coluna_status, dominio] ou null = detectar), n_amostras
 * (número ou null = todas) e criterios.
 */
export function novaConfig(o = {}) {
  return {
    renomear: o.renomear || new Map(),
    excluidos: o.excluidos || new Set(),
    categorias: o.categorias || new Map(),
    metodos: o.metodos === undefined ? null : o.metodos,
    n_amostras: o.n_amostras ?? null,
    criterios: o.criterios || {},
  };
}

export function categoriaDe(especie, cfg = null) {
  if (cfg && cfg.categorias.has(especie)) return cfg.categorias.get(especie);
  if (PATOGENICOS.has(especie)) return "Patogênico";
  if (COMENSAIS.has(especie)) return "Comensal";
  return "Não classificado";
}

// (coluna, nome de exibição, coluna de status, domínio)
export const METHOD_CATALOG = [
  ["metodo_graham", "Graham", "status_lamina", "lamina"],
  ["metodo_hpj", "HPJ", "status_amostra", "fecal"],
  ["metodo_willis", "Willis", "status_amostra", "fecal"],
  ["metodo_baermann_picanco", "Baermann-Picanço", "status_amostra", "fecal"],
  ["metodo_faust", "Faust", "status_amostra", "fecal"],
  ["metodo_kato_katz", "Kato-Katz", "status_amostra", "fecal"],
  ["metodo_mifc", "MIFC (Blagg)", "status_amostra", "fecal"],
  ["metodo_ritchie", "Ritchie (formol-éter)", "status_amostra", "fecal"],
];

export const REQUIRED_COLUMNS = ["id_paciente", "coleta", "nome_paciente"];
export const TERRITORIO_COLS = ["bairro", "municipio", "uf"];

// ---------------------------------------------------------------------------
// coletas
// ---------------------------------------------------------------------------
export function normColeta(x) {
  const t = normText(x);
  if (t === null) return null;
  return t.replace(/\s+/gu, "").toUpperCase();
}

export function coletaRank(x) {
  const c = normColeta(x);
  if (c === null) return null;
  const m = /^P(\d+)$/.exec(c);
  if (!m || parseInt(m[1], 10) < 1) return null;
  return parseInt(m[1], 10);
}

export function maxColetas(df) {
  if (!df.columns.includes("coleta")) return 0;
  let mx = 0;
  for (const r of df.rows) {
    const k = coletaRank(r.coleta);
    if (k !== null && k > mx) mx = k;
  }
  return mx;
}

// ---------------------------------------------------------------------------
// leitura das células
// ---------------------------------------------------------------------------
const GENUS_ABBR_RE = /^([a-zà-ÿ])\s*\.\s*(.+)$/iu;

export function normalizeSpeciesToken(p) {
  p = p.trim().replace(/\s+/gu, " ");
  const m = GENUS_ABBR_RE.exec(p);
  if (m) p = `${m[1].toLowerCase()}. ${m[2].trim()}`;
  return p;
}

/** str.capitalize() do Python: 1ª letra maiúscula, resto minúsculo. */
function capitalize(s) {
  if (!s) return s;
  const cp = String.fromCodePoint(s.codePointAt(0));
  return cp.toUpperCase() + s.slice(cp.length).toLowerCase();
}

export function stdStatus(x) {
  const t = normText(x);
  if (t === null) return null;
  const up = semAcento(t.toUpperCase());
  if (up.includes("NAO")) return "Não entregue";
  if (up.includes("ENTREGUE")) return "Entregue";
  return t;
}

/** Leitura da célula sem configuração: [label, especies, positivo]. */
export function parseResultCellRaw(raw) {
  const t = normText(raw);
  if (t === null) return [null, [], false];
  const low = t.toLowerCase();
  // remove marcação de intensidade antes de separar espécies por '+'
  let cleaned = low.replace(/\(\s*\++\s*\)/gu, " ");
  cleaned = cleaned.replace(/\+{2,}/gu, " ");
  cleaned = splitWs(cleaned).join(" ");
  if (NOT_PERFORMED_TOKENS.has(cleaned)) return ["Não realizado", [], false];
  if (NEGATIVE_TOKENS.has(cleaned) || low === "-") return ["Negativo", [], false];
  if (INSUFFICIENT_TOKENS.has(cleaned)) return ["Amostra insuficiente", [], false];
  const parts = cleaned.split(/\s*\+\s*|\s*,\s*/u);
  const species = [];
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const key = normalizeSpeciesToken(p);
    const std = Object.prototype.hasOwnProperty.call(PARASITE_MAP, key) ? PARASITE_MAP[key] : capitalize(key);
    if (!species.includes(std)) species.push(std);
  }
  if (!species.length) return [null, [], false];
  return [species.join(" + "), species, true];
}

/** Aplica a configuração: parasitos excluídos saem e "Agrupar como" é aplicado. */
export function parseResultCell(raw, cfg = null) {
  const [label, species, positive] = parseResultCellRaw(raw);
  if (!cfg || !positive) return [label, species, positive];
  const final = [];
  for (const s of species) {
    if (cfg.excluidos.has(s)) continue;
    const s2 = cfg.renomear.get(s) || s;
    if (!final.includes(s2)) final.push(s2);
  }
  if (!final.length) return ["Negativo", [], false];
  return [final.join(" + "), final, true];
}

function classifyInstance(label, positive) {
  if (positive) return "positivo";
  if (label === "Negativo") return "negativo";
  if (label === "Não realizado") return "nao_realizado";
  // "Amostra insuficiente" ou célula vazia
  return "inconclusivo";
}

function reduceStatus(lista) {
  if (!lista.length) return null;
  if (lista.includes("positivo")) return "positivo";
  if (lista.includes("negativo")) return "negativo";
  return "inconclusivo";
}

// ---------------------------------------------------------------------------
// colunas
// ---------------------------------------------------------------------------
export function normalizeColumns(df) {
  let cols = df.columns.map((c) => String(c).trim().toLowerCase().replaceAll(" ", "_"));
  if (!cols.includes("nome_paciente") && cols.includes("nome_crianca")) {
    cols = cols.map((c) => (c === "nome_crianca" ? "nome_paciente" : c));
  }
  const aliases = {
    "município": "municipio", cidade: "municipio", bairro_residencia: "bairro",
    bairro_de_residencia: "bairro", "bairro_de_residência": "bairro", estado: "uf",
  };
  const atual = [...cols];
  cols = cols.map((c) => (aliases[c] && !atual.includes(aliases[c]) ? aliases[c] : c));
  const rows = df.rows.map((r) => {
    const o = { _idx: r._idx };
    df.columns.forEach((orig, i) => { if (!(cols[i] in o)) o[cols[i]] = r[orig] ?? null; });
    return o;
  });
  return { columns: [...new Set(cols)], rows };
}

export function getActiveMethods(df) {
  return METHOD_CATALOG.filter((m) => df.columns.includes(m[0]));
}

export function validateColumns(df, activeMethods = null) {
  const errors = [];
  const missing = REQUIRED_COLUMNS.filter((c) => !df.columns.includes(c));
  if (missing.length) {
    errors.push(`Colunas ausentes: ${missing.join(", ")}. Baixe o modelo novamente e confira os cabeçalhos.`);
  }
  const active = activeMethods === null ? getActiveMethods(df) : activeMethods;
  if (!active.length) {
    const known = METHOD_CATALOG.map((m) => m[1]).join(", ");
    errors.push(
      "Nenhum método selecionado ou reconhecido na planilha " +
      `(métodos do catálogo: ${known}). Confira os cabeçalhos 'metodo_<nome>' ou ` +
      "marque ao menos um método na configuração.",
    );
  } else {
    const dom = new Set(active.map((m) => m[3]));
    if (dom.has("fecal") && !df.columns.includes("status_amostra")) {
      errors.push("A planilha tem método(s) de amostra fecal, mas falta a coluna " +
        "'status_amostra' (status de entrega do pote de fezes).");
    }
    if (dom.has("lamina") && !df.columns.includes("status_lamina")) {
      errors.push("A planilha tem método(s) de lâmina/swab, mas falta a coluna " +
        "'status_lamina' (status de entrega da lâmina).");
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// estatística inferencial — IC95% (Wilson), McNemar, Cochran-Armitage
// ---------------------------------------------------------------------------
const Z95 = 1.959963984540054;

/** IC95% de Wilson, em %, arredondado a 1 casa; [null, null] se n = 0. */
export function wilsonCi(positivos, n, z = Z95) {
  if (n === null || n === undefined || n === 0 || Number.isNaN(n)) return [null, null];
  n = Math.trunc(n);
  positivos = Math.trunc(positivos);
  const p = positivos / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centro = p + z2 / (2 * n);
  const margem = z * Math.sqrt((p * (1 - p) / n) + z2 / (4 * n * n));
  let lo = (centro - margem) / denom;
  let hi = (centro + margem) / denom;
  lo = Math.max(0.0, lo);
  hi = Math.min(1.0, hi);
  return [pyRound(100 * lo, 1), pyRound(100 * hi, 1)];
}

function comb(n, k) {
  let r = 1n;
  for (let i = 1n; i <= BigInt(k); i++) r = (r * (BigInt(n) - i + 1n)) / i;
  return r;
}

export function mcnemarHpjWillis(porPaciente, activeMethods = null) {
  let nomeHpj = "HPJ", nomeWillis = "Willis";
  if (activeMethods !== null) {
    const byCol = new Map();
    for (const [col, nome] of activeMethods) byCol.set(col, nome);
    nomeHpj = byCol.has("metodo_hpj") ? byCol.get("metodo_hpj") : null;
    nomeWillis = byCol.has("metodo_willis") ? byCol.get("metodo_willis") : null;
  }
  const vazio = { n_pareado: 0, tabela: null, estatistica: null, p_valor: null, metodo: null };
  if (nomeHpj === null || nomeWillis === null || !porPaciente.length) return vazio;
  const tem = (r, nome) => r.metodos && Object.prototype.hasOwnProperty.call(r.metodos, nome);
  if (!tem(porPaciente[0], nomeHpj) || !tem(porPaciente[0], nomeWillis)) return vazio;
  const conc = (s) => s === "positivo" || s === "negativo";
  const base = porPaciente.filter((r) => conc(r.metodos[nomeHpj].status) && conc(r.metodos[nomeWillis].status));
  const n = base.length;
  if (n === 0) return vazio;
  let pp = 0, pn = 0, np_ = 0, nn = 0;
  for (const r of base) {
    const h = r.metodos[nomeHpj].status === "positivo";
    const w = r.metodos[nomeWillis].status === "positivo";
    if (h && w) pp++; else if (h) pn++; else if (w) np_++; else nn++;
  }
  const nDisc = pn + np_;
  if (nDisc === 0) {
    return { n_pareado: n, tabela: { pp, pn, np: np_, nn }, estatistica: 0.0, p_valor: 1.0, metodo: "sem_discordancia" };
  }
  let pValor, estatistica, metodo;
  if (nDisc < 25) {
    const k = Math.min(pn, np_);
    let s = 0n;
    for (let i = 0; i <= k; i++) s += comb(nDisc, i);
    pValor = Math.min(1.0, Number(2n * s) * (0.5 ** nDisc));
    estatistica = k;
    metodo = "exato";
  } else {
    estatistica = ((Math.abs(pn - np_) - 1) ** 2) / nDisc;
    pValor = erfc(Math.sqrt(estatistica / 2));
    metodo = "chi2_corrigido";
  }
  return {
    n_pareado: n, tabela: { pp, pn, np: np_, nn },
    estatistica: pyRound(estatistica, 4), p_valor: pyRound(pValor, 4), metodo,
  };
}

export const AVISO_COCHRAN =
  "Compara SUBGRUPOS diferentes de pacientes (quem entregou 1, 2 ou 3 potes) — " +
  "sujeito a viés de seleção. A leitura mais confiável do ganho por coleta " +
  "adicional é a curva cumulativa (fecal_cumulativa), medida repetida no mesmo " +
  "grupo de pacientes, que não depende deste teste.";

export function cochranArmitageTrend(grupos) {
  const nada = { estatistica_z: null, p_valor: null, n_grupos: grupos.length, aviso: AVISO_COCHRAN };
  if (!grupos.length || grupos.length < 2) return nada;
  const t = grupos.map((g) => g.n_potes_entregues);
  const ni = grupos.map((g) => g.n_pacientes);
  const xi = grupos.map((g) => g.n_positivos);
  let N = 0, X = 0;
  for (let i = 0; i < t.length; i++) { N += ni[i]; X += xi[i]; }
  if (N === 0 || X === 0 || X === N) return nada;
  const pBar = X / N;
  let s = 0;
  for (let i = 0; i < t.length; i++) s += ni[i] * t[i];
  const tBar = s / N;
  let T = 0;
  for (let i = 0; i < t.length; i++) T += xi[i] * (t[i] - tBar);
  let v = 0;
  for (let i = 0; i < t.length; i++) v += ni[i] * (t[i] - tBar) ** 2;
  const varT = pBar * (1 - pBar) * v;
  if (varT <= 0) return nada;
  const z = T / Math.sqrt(varT);
  const p = erfc(Math.abs(z) / Math.sqrt(2));
  return { estatistica_z: pyRound(z, 4), p_valor: pyRound(p, 4), n_grupos: grupos.length, aviso: AVISO_COCHRAN };
}

// ---------------------------------------------------------------------------
// território (moradia do paciente)
// ---------------------------------------------------------------------------
export function chaveTerritorio(x) {
  const t = normText(x) || "";
  return splitWs(semAcento(t).toLowerCase()).join(" ");
}

function moda(valores) {
  // Series.mode(): os valores mais frequentes, em ordem; pega o primeiro
  const cont = new Map();
  for (const v of valores) cont.set(v, (cont.get(v) || 0) + 1);
  let mx = 0;
  for (const c of cont.values()) mx = Math.max(mx, c);
  return sortedStr([...cont.entries()].filter(([, c]) => c === mx).map(([v]) => v))[0];
}

export function prevalenciaTerritorio(base, nivel) {
  const cols = nivel === "municipio" ? ["municipio", "uf"] : ["bairro", "municipio", "uf"];
  if (!base || !base.length) return [];
  const d = base.filter((r) => String(r[nivel]).trim() !== "").map((r) => ({ ...r }));
  if (!d.length) return [];
  // UF esquecida: completa pela UF dos outros pacientes do mesmo município,
  // quando nos dados só existe uma UF para aquele nome de município
  const km = d.map((r) => chaveTerritorio(r.municipio));
  const ufsPorMun = new Map();
  d.forEach((r, i) => {
    const u = String(r.uf).trim().toUpperCase();
    if (u === "") return;
    if (!ufsPorMun.has(km[i])) ufsPorMun.set(km[i], new Set());
    ufsPorMun.get(km[i]).add(u);
  });
  d.forEach((r, i) => {
    if (String(r.uf).trim() === "") {
      const s = ufsPorMun.get(km[i]);
      r.uf = s && s.size === 1 ? [...s][0] : "";
    }
  });
  const grupos = new Map();
  for (const r of d) {
    const k = cols.map((c) => chaveTerritorio(r[c])).join(" | ");
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  const out = [];
  for (const k of sortedStr([...grupos.keys()])) {
    const g = grupos.get(k);
    const r = {};
    for (const c of cols) {
      const vals = g.map((x) => String(x[c]));
      r[c] = vals.some((v) => v.trim() !== "") ? moda(vals.filter((v) => v !== "")) : "";
    }
    const n = g.length;
    const pos = g.filter((x) => x.positivo_algum_metodo).length;
    const pat = g.filter((x) => x.positivo_fecal_patogenico || x.positivo_lamina_patogenico).length;
    const [inf, sup] = wilsonCi(pos, n);
    Object.assign(r, {
      n_pacientes: n, n_positivos: pos, prevalencia: pyRound(100 * pos / n, 1),
      ic95_inf: inf, ic95_sup: sup, n_positivos_patogenico: pat,
      prevalencia_patogenico: pyRound(100 * pat / n, 1),
    });
    out.push(r);
  }
  return ordenarPor(out, (r) => [-r.n_pacientes, -r.prevalencia]);
}

// ---------------------------------------------------------------------------
// base por paciente
// ---------------------------------------------------------------------------
function agruparPorPaciente(df) {
  const grupos = new Map();
  for (const row of df.rows) {
    const id = normText(row.id_paciente);
    if (id === null) continue;
    if (!grupos.has(id)) grupos.set(id, []);
    grupos.get(id).push(row);
  }
  return sortedStr([...grupos.keys()]).map((id) => [id, grupos.get(id)]);
}

const activeFecal = (am) => am.filter((m) => m[3] === "fecal");
const activeLamina = (am) => am.filter((m) => m[3] === "lamina");

export function buildPerChild(df, activeMethods = null, cfg = null) {
  if (activeMethods === null) activeMethods = getActiveMethods(df);
  const rows = [];
  for (const [id, g] of agruparPorPaciente(df)) {
    const nome = normText(g[0].nome_paciente) || "";
    // coletas DISTINTAS com material entregue (linha duplicada não conta duas vezes)
    const poteColetas = new Set(), laminaColetas = new Set();
    const espFec = new Set(), espLam = new Set();
    const fecalInst = [], laminaInst = [];
    const instPorMetodo = {}, posMetodo = {}, espPorMetodo = {};
    for (const [, nm] of activeMethods) { instPorMetodo[nm] = []; posMetodo[nm] = false; espPorMetodo[nm] = new Set(); }

    for (const row of g) {
      const stA = stdStatus(row.status_amostra);
      const stL = stdStatus(row.status_lamina);
      const coletaKey = normColeta(row.coleta) || `__linha_${row._idx}`;
      if (stA === "Entregue") poteColetas.add(coletaKey);
      if (stL === "Entregue") laminaColetas.add(coletaKey);
      for (const [col, nm, statusKey, dominio] of activeMethods) {
        const status = statusKey === "status_amostra" ? stA : stL;
        if (status !== "Entregue") continue; // método não tentado nesta coleta
        const [label, species, positive] = parseResultCell(row[col], cfg);
        const inst = classifyInstance(label, positive);
        if (inst === "nao_realizado") continue; // fora de qualquer denominador
        instPorMetodo[nm].push(inst);
        (dominio === "fecal" ? fecalInst : laminaInst).push(inst);
        if (positive) {
          posMetodo[nm] = true;
          for (const s of species) {
            espPorMetodo[nm].add(s);
            (dominio === "fecal" ? espFec : espLam).add(s);
          }
        }
      }
    }
    const nPote = poteColetas.size, nLamina = laminaColetas.size;
    // território: primeiro valor preenchido; marca se há valores diferentes
    const terr = {};
    let inconsistente = false;
    for (const tcol of TERRITORIO_COLS) {
      const vals = df.columns.includes(tcol) ? g.map((r) => normText(r[tcol])).filter(Boolean) : [];
      terr[tcol] = vals.length ? vals[0] : "";
      if (new Set(vals.map(chaveTerritorio)).size > 1) inconsistente = true;
    }
    const fecalStatus = reduceStatus(fecalInst);
    const laminaStatus = reduceStatus(laminaInst);
    let categoria;
    if (nPote > 0 && nLamina > 0) categoria = "Fezes e lâmina";
    else if (nPote > 0) categoria = "Apenas fezes (sem lâmina)";
    else if (nLamina > 0) categoria = "Apenas lâmina (sem fezes)";
    else categoria = "Nenhum material";
    const especiesFecais = sortedStr(espFec);
    const especiesLamina = sortedStr(espLam);
    const especiesTotal = sortedStr(new Set([...espFec, ...espLam]));
    const positivoFecal = fecalStatus === "positivo";
    const positivoLamina = laminaStatus === "positivo";
    const pat = (e) => categoriaDe(e, cfg) === "Patogênico";
    const r = {
      id_paciente: id,
      nome_paciente: nome,
      bairro: terr.bairro,
      municipio: terr.municipio,
      uf: terr.uf.toUpperCase(),
      territorio_inconsistente: inconsistente,
      n_coletas_registradas: g.length,
      n_coletas_pote_entregue: nPote,
      n_coletas_lamina_entregue: nLamina,
      categoria_amostragem: categoria,
      participou_estudo: nPote > 0 || nLamina > 0,
      fecal_status: fecalStatus,
      lamina_status: laminaStatus,
      positivo_fecal: positivoFecal,
      positivo_lamina: positivoLamina,
      positivo_algum_metodo: Boolean(positivoFecal || positivoLamina),
      especies_fecais: especiesFecais,
      especies_fecais_str: especiesFecais.join("; "),
      especies_lamina: especiesLamina,
      especies_lamina_str: especiesLamina.join("; "),
      especies: especiesTotal,
      especies_str: especiesTotal.join("; "),
      n_especies_distintas_fecais: especiesFecais.length,
      poliparasitado_fecal: especiesFecais.length > 1,
      tem_patogenico: especiesTotal.some(pat),
      tem_comensal: especiesTotal.some((e) => categoriaDe(e, cfg) === "Comensal"),
      positivo_fecal_patogenico: positivoFecal && especiesFecais.some(pat),
      positivo_lamina_patogenico: positivoLamina && especiesLamina.some(pat),
      metodos: {},
    };
    for (const [, nm] of activeMethods) {
      r.metodos[nm] = { positivo: posMetodo[nm], status: reduceStatus(instPorMetodo[nm]), especies: sortedStr(espPorMetodo[nm]) };
    }
    rows.push(r);
  }
  return rows;
}

/**
 * Curva de positividade cumulativa no MESMO grupo de pacientes (os que
 * entregaram o número máximo de potes); a posição de cada pote é a ordem das
 * coletas entregues (1ª, 2ª, 3ª), não o número do rótulo.
 */
export function buildFecalCumulativeCurve(df, fecalMethods = null, cfg = null) {
  if (fecalMethods === null) fecalMethods = activeFecal(getActiveMethods(df));
  const porPac = new Map(); // id -> Map(rank -> positivo)
  for (const [id, g] of agruparPorPaciente(df)) {
    for (const row of g) {
      if (stdStatus(row.status_amostra) !== "Entregue") continue;
      const rank = coletaRank(row.coleta);
      if (rank === null) continue;
      let positivo = false;
      for (const [col] of fecalMethods) if (parseResultCell(row[col], cfg)[2]) positivo = true;
      if (!porPac.has(id)) porPac.set(id, new Map());
      const m = porPac.get(id);
      m.set(rank, (m.get(rank) || false) || positivo);
    }
  }
  if (!porPac.size) return [];
  const ordens = new Map();
  for (const [id, m] of porPac) ordens.set(id, [...m.keys()].sort((a, b) => a - b).map((k) => m.get(k)));
  let maxN = 0;
  for (const l of ordens.values()) maxN = Math.max(maxN, l.length);
  const coorte = [...ordens.values()].filter((l) => l.length === maxN);
  const n = coorte.length;
  const out = [];
  for (let k = 1; k <= maxN; k++) {
    let pos = 0;
    for (const l of coorte) if (l.slice(0, k).some(Boolean)) pos++;
    out.push({ k, n_pacientes: n, prevalencia_cumulativa: n ? pyRound(100 * pos / n, 1) : 0.0 });
  }
  return out;
}

export function coletasDuplicadas(df) {
  if (!df.columns.includes("id_paciente") || !df.columns.includes("coleta")) return [];
  const cont = new Map();
  for (const r of df.rows) {
    const id = normText(r.id_paciente), c = normColeta(r.coleta);
    if (id === null || c === null) continue;
    const k = JSON.stringify([id, c]);
    cont.set(k, (cont.get(k) || 0) + 1);
  }
  const out = [];
  for (const [k, n] of cont) {
    if (n > 1) { const [id, c] = JSON.parse(k); out.push({ id_paciente: id, coleta: c, n_linhas: n }); }
  }
  return ordenarPor(out, (r) => [r.id_paciente, r.coleta]);
}

export function coletasNaoReconhecidas(df) {
  if (!df.columns.includes("coleta") || !df.columns.includes("id_paciente")) return [];
  const s = new Set();
  for (const r of df.rows) {
    if (normText(r.id_paciente) === null) continue;
    if (coletaRank(r.coleta) === null) {
      const t = normText(r.coleta);
      if (t !== null) s.add(t);
    }
  }
  return sortedStr(s);
}

// ---------------------------------------------------------------------------
// critérios de inclusão de pacientes
// ---------------------------------------------------------------------------
export const TODAS = -1;
export const CRITERIOS_PADRAO = { min_fezes: 0, min_lamina: 0, excluir_inconclusivos: false, exigir_todos_metodos: false };

export function criteriosAtivos(criterios) {
  const c = { ...CRITERIOS_PADRAO, ...(criterios || {}) };
  return Boolean(c.min_fezes || c.min_lamina || c.excluir_inconclusivos || c.exigir_todos_metodos);
}

const nExigido = (v, nTotal) => (v === TODAS ? nTotal : Math.trunc(v || 0));

export function descreverCriterios(criterios, nTotal) {
  const c = { ...CRITERIOS_PADRAO, ...(criterios || {}) };
  const frases = [];
  for (const [chave, material] of [["min_fezes", "pote de fezes"], ["min_lamina", "lâmina"]]) {
    const v = c[chave];
    if (v === TODAS) frases.push(`${material} entregue em todas as ${nTotal} coletas (P1–P${nTotal})`);
    else if (v) frases.push(`${material} entregue em pelo menos ${Math.trunc(v)} coleta(s)`);
  }
  if (c.excluir_inconclusivos) frases.push('todas as amostras entregues com resultado em todos os métodos (sem "Amostra insuficiente" nem célula vazia)');
  if (c.exigir_todos_metodos) frases.push('todos os métodos incluídos realizados em todas as amostras entregues (sem "Não realizado")');
  return frases;
}

export function aplicarCriteriosInclusao(df, activeMethods, criterios, nTotal) {
  if (!criteriosAtivos(criterios) || !df.rows.length) return [df, []];
  const c = { ...CRITERIOS_PADRAO, ...criterios };
  const minF = nExigido(c.min_fezes, nTotal), minL = nExigido(c.min_lamina, nTotal);
  const manter = new Set(), excluidos = [];
  for (const [pid, g] of agruparPorPaciente(df)) {
    const pote = new Set(), lamina = new Set(), inconc = new Set(), naoReal = new Set();
    for (const row of g) {
      const stF = stdStatus(row.status_amostra), stL = stdStatus(row.status_lamina);
      const coleta = normColeta(row.coleta) || `__linha_${row._idx}`;
      if (stF === "Entregue") pote.add(coleta);
      if (stL === "Entregue") lamina.add(coleta);
      for (const [col, nm, statusKey] of activeMethods) {
        const status = statusKey === "status_amostra" ? stF : stL;
        if (status !== "Entregue") continue;
        const [label, , positivo] = parseResultCellRaw(row[col]);
        const inst = classifyInstance(label, positivo);
        const rot = normColeta(row.coleta) || "?";
        if (inst === "inconclusivo") inconc.add(`${nm} (${rot})`);
        else if (inst === "nao_realizado") naoReal.add(`${nm} (${rot})`);
      }
    }
    const motivos = [];
    if (minF && pote.size < minF) motivos.push(`fezes em ${pote.size} de ${minF} coleta(s) exigida(s)`);
    if (minL && lamina.size < minL) motivos.push(`lâmina em ${lamina.size} de ${minL} coleta(s) exigida(s)`);
    if (c.excluir_inconclusivos && inconc.size) motivos.push("sem resultado: " + sortedStr(inconc).join(", "));
    if (c.exigir_todos_metodos && naoReal.size) motivos.push("não realizado: " + sortedStr(naoReal).join(", "));
    if (motivos.length) excluidos.push({ id_paciente: pid, nome_paciente: normText(g[0].nome_paciente) || "", motivo: motivos.join("; ") });
    else manter.add(pid);
  }
  const rows = df.rows.filter((r) => manter.has(normText(r.id_paciente)));
  return [{ columns: df.columns, rows }, excluidos];
}

export function aplicarLimiteAmostras(df, nAmostras) {
  if (!nAmostras || !df.columns.includes("coleta")) return df;
  return {
    columns: df.columns,
    rows: df.rows.filter((r) => { const k = coletaRank(r.coleta); return k === null || k <= Math.trunc(nAmostras); }),
  };
}

// ---------------------------------------------------------------------------
// métricas
// ---------------------------------------------------------------------------
const pct = (num, den) => (den ? pyRound(100 * num / den, 1) : 0.0);
const conclusivo = (s) => s === "positivo" || s === "negativo";
const contar = (rows, f) => rows.reduce((a, r) => a + (f(r) ? 1 : 0), 0);

export const CATEGORIAS_AMOSTRAGEM = ["Fezes e lâmina", "Apenas fezes (sem lâmina)", "Apenas lâmina (sem fezes)", "Nenhum material"];

/** Aplica limite de amostras e critérios de inclusão e calcula as métricas. */
export function computeMetrics(df, cfg = null) {
  let activeMethods;
  if (cfg && cfg.metodos !== null) activeMethods = cfg.metodos.filter((m) => df.columns.includes(m[0]));
  else activeMethods = getActiveMethods(df);
  if (cfg) df = aplicarLimiteAmostras(df, cfg.n_amostras);
  const totalAntes = df.columns.includes("id_paciente")
    ? new Set(df.rows.map((r) => normText(r.id_paciente)).filter((x) => x !== null)).size : 0;
  const criterios = cfg ? cfg.criterios : {};
  const nTotal = ((cfg && cfg.n_amostras) ? cfg.n_amostras : null) || maxColetas(df) || 1;
  let excluidos;
  [df, excluidos] = aplicarCriteriosInclusao(df, activeMethods, criterios, nTotal);
  const m = _computeMetrics(df, cfg, activeMethods);
  m.criterios = criteriosAtivos(criterios) ? descreverCriterios(criterios, nTotal) : [];
  m.excluidos_criterios = excluidos;
  m.total_antes_criterios = totalAntes;

  // território (bairro / município de moradia), se a planilha tiver
  const pp = m.por_paciente;
  const temTerr = pp.length > 0 && TERRITORIO_COLS.some((c) => df.columns.includes(c)) &&
    pp.some((r) => String(r.bairro).trim() !== "" || String(r.municipio).trim() !== "");
  m.tem_territorio = temTerr;
  const base = m.combinada_base;
  m.territorio_municipio = temTerr ? prevalenciaTerritorio(base, "municipio") : [];
  m.territorio_bairro = temTerr ? prevalenciaTerritorio(base, "bairro") : [];
  if (temTerr && base.length) {
    m.territorio_sem_bairro = contar(base, (r) => String(r.bairro).trim() === "");
    m.territorio_sem_municipio = contar(base, (r) => String(r.municipio).trim() === "");
    m.territorio_inconsistentes = pp.filter((r) => r.territorio_inconsistente).map((r) => r.id_paciente);
  } else {
    m.territorio_sem_bairro = 0;
    m.territorio_sem_municipio = 0;
    m.territorio_inconsistentes = [];
  }
  return m;
}

function emptyMetrics(activeMethods) {
  const v = [];
  return {
    por_paciente: v, total: 0, analisavel: v, fecal: v, apenas_lamina: v,
    fecal_conclusivo: v, fecal_inconclusivo: v, lamina_conclusivo: v, lamina_inconclusivo: v,
    lamina_only_conclusivo: v, lamina_only_inconclusivo: v, combinada_base: v, combinada_inconclusiva: v,
    cat_counts: Object.fromEntries(CATEGORIAS_AMOSTRAGEM.map((c) => [c, 0])),
    prev_fecal: 0.0, prev_fecal_ic95_inf: null, prev_fecal_ic95_sup: null,
    prev_lamina: 0.0, prev_lamina_ic95_inf: null, prev_lamina_ic95_sup: null,
    prev_lamina_only: 0.0, prev_lamina_only_ic95_inf: null, prev_lamina_only_ic95_sup: null,
    prev_combinada: 0.0, prev_combinada_ic95_inf: null, prev_combinada_ic95_sup: null,
    especies_resumo: [], poli: 0, mono: 0, neg: 0, combos_resumo: [], metodos_resumo: [],
    efeito_n_coletas: [], fecal_cumulativa: [], metodo_especie_resumo: [], todos_parasitos_resumo: [],
    mcnemar_hpj_willis: mcnemarHpjWillis([]), cochran_armitage_efeito_coletas: cochranArmitageTrend([]),
    metodos_ativos: activeMethods, metodos_ativos_nomes: activeMethods.map((m) => m[1]),
    prev_fecal_patogenico: 0.0, prev_fecal_patogenico_ic95_inf: null, prev_fecal_patogenico_ic95_sup: null,
    n_fecal_patogenico: 0,
    prev_lamina_patogenico: 0.0, prev_lamina_patogenico_ic95_inf: null, prev_lamina_patogenico_ic95_sup: null,
    n_lamina_patogenico: 0, especies_lamina_resumo: [], config: null,
  };
}

function resumoEspecies(rows, campo, base, cfg) {
  const cont = new Map();
  for (const r of rows) for (const e of r[campo]) cont.set(e, (cont.get(e) || 0) + 1);
  if (!cont.size) return [];
  let out = [...cont.entries()].map(([e, n]) => ({ especie: e, n, prevalencia: pct(n, base), categoria: categoriaDe(e, cfg) }));
  // empates em ordem alfabética (o pandas não garante ordem nos empates)
  out = ordenarPor(out, (r) => [-r.n, r.especie]);
  for (const r of out) [r.ic95_inf, r.ic95_sup] = wilsonCi(r.n, base);
  return out;
}

function _computeMetrics(df, cfg, activeMethods) {
  const fecalAtivos = activeFecal(activeMethods);
  const porPaciente = buildPerChild(df, activeMethods, cfg);
  const total = porPaciente.length;
  if (total === 0) return emptyMetrics(activeMethods);

  const analisavel = porPaciente.filter((r) => r.participou_estudo);
  const fecal = analisavel.filter((r) => r.n_coletas_pote_entregue > 0);
  const apenasLamina = analisavel.filter((r) => r.n_coletas_pote_entregue === 0);
  const catCounts = Object.fromEntries(CATEGORIAS_AMOSTRAGEM.map((c) => [c, contar(porPaciente, (r) => r.categoria_amostragem === c)]));

  // prevalências: só entram pacientes com resultado CONCLUSIVO no domínio
  const fecalConc = fecal.filter((r) => conclusivo(r.fecal_status));
  const fecalInc = fecal.filter((r) => r.fecal_status === "inconclusivo");
  const laminaConc = analisavel.filter((r) => conclusivo(r.lamina_status));
  const laminaInc = analisavel.filter((r) => r.lamina_status === "inconclusivo");
  const laminaOnlyConc = apenasLamina.filter((r) => conclusivo(r.lamina_status));
  const laminaOnlyInc = apenasLamina.filter((r) => r.lamina_status === "inconclusivo");
  const temConc = (r) => conclusivo(r.fecal_status) || conclusivo(r.lamina_status);
  const combinadaBase = analisavel.filter(temConc);
  const combinadaInc = analisavel.filter((r) => !temConc(r));

  const nPosF = contar(fecalConc, (r) => r.positivo_fecal);
  const nPosL = contar(laminaConc, (r) => r.positivo_lamina);
  const nPosLO = contar(laminaOnlyConc, (r) => r.positivo_lamina);
  const nPosC = contar(combinadaBase, (r) => r.positivo_algum_metodo);
  const icF = wilsonCi(nPosF, fecalConc.length);
  const icL = wilsonCi(nPosL, laminaConc.length);
  const icLO = wilsonCi(nPosLO, laminaOnlyConc.length);
  const icC = wilsonCi(nPosC, combinadaBase.length);

  // prevalência por espécie — só espécies de origem fecal
  const especiesResumo = resumoEspecies(fecalConc, "especies_fecais", fecalConc.length, cfg);

  // mono/poliparasitismo — espécies fecais
  const poli = contar(fecalConc, (r) => r.n_especies_distintas_fecais > 1);
  const mono = contar(fecalConc, (r) => r.n_especies_distintas_fecais === 1);
  const neg = contar(fecalConc, (r) => r.n_especies_distintas_fecais === 0);
  const combos = new Map();
  for (const r of fecalConc) {
    if (!r.poliparasitado_fecal) continue;
    const k = sortedStr(r.especies_fecais).join(" + ");
    combos.set(k, (combos.get(k) || 0) + 1);
  }
  const combosResumo = ordenarPor([...combos.entries()].map(([k, v]) => ({ combinacao: k, n: v })), (r) => [-r.n, r.combinacao]);

  // comparação de métodos — denominador = conclusivos naquele método
  const metodosResumo = [];
  for (const [, nm, , dominio] of activeMethods) {
    const conc = analisavel.filter((r) => conclusivo(r.metodos[nm].status));
    const inc = contar(analisavel, (r) => r.metodos[nm].status === "inconclusivo");
    const pos = contar(conc, (r) => r.metodos[nm].status === "positivo");
    const [i, s] = wilsonCi(pos, conc.length);
    metodosResumo.push({
      metodo: nm, amostra_biologica: dominio === "lamina" ? "Lâmina" : "Pote de fezes",
      n_pacientes_testaveis: conc.length, n_pacientes_positivas: pos, n_pacientes_inconclusivas: inc,
      prevalencia: pct(pos, conc.length), ic95_inf: i, ic95_sup: s,
    });
  }

  // espécie x método
  const metodoEspecie = [];
  for (const [, nm] of activeMethods) {
    const conc = analisavel.filter((r) => conclusivo(r.metodos[nm].status));
    const cont = new Map();
    for (const r of conc) for (const e of r.metodos[nm].especies) cont.set(e, (cont.get(e) || 0) + 1);
    for (const [e, n] of cont) {
      metodoEspecie.push({ metodo: nm, especie: e, n, prevalencia: pct(n, conc.length), categoria: categoriaDe(e, cfg) });
    }
  }
  const denPorMetodo = new Map(metodosResumo.map((r) => [r.metodo, r.n_pacientes_testaveis]));
  for (const r of metodoEspecie) [r.ic95_inf, r.ic95_sup] = wilsonCi(r.n, denPorMetodo.get(r.metodo) || 0);

  // todos os parasitos (fezes + lâmina), sem contar o mesmo paciente duas vezes
  const metodosPorEspecie = new Map();
  {
    const tmp = new Map();
    for (const r of metodoEspecie) {
      if (!tmp.has(r.especie)) tmp.set(r.especie, new Set());
      tmp.get(r.especie).add(r.metodo);
    }
    for (const e of sortedStr(tmp.keys())) metodosPorEspecie.set(e, sortedStr(tmp.get(e)).join(" + "));
  }
  const laminaNomes = new Set(activeLamina(activeMethods).map((m) => m[1]));
  const espFecaisTodas = new Set(especiesResumo.map((r) => r.especie));
  const laminaEspDf = laminaNomes.size ? metodoEspecie.filter((r) => laminaNomes.has(r.metodo)) : [];
  const espLaminaTodas = new Set(laminaEspDf.map((r) => r.especie));
  const multi = sortedStr([...espFecaisTodas].filter((e) => espLaminaTodas.has(e)));
  const multiSet = new Set(multi);
  const lamTest = metodosResumo.filter((r) => laminaNomes.has(r.metodo)).map((r) => r.n_pacientes_testaveis);
  const laminaConclusivosN = lamTest.length ? Math.max(...lamTest) : 0;
  const laminaLabel = laminaNomes.size ? sortedStr(laminaNomes).join(" / ") : "Lâmina";

  let todos = [];
  for (const r of especiesResumo) {
    if (multiSet.has(r.especie)) continue;
    todos.push({ especie: r.especie, categoria: r.categoria, dominio: "Fecal", n: r.n, prevalencia: r.prevalencia,
      base_n: fecalConc.length, metodos: metodosPorEspecie.get(r.especie) || "" });
  }
  for (const r of laminaEspDf) {
    if (multiSet.has(r.especie)) continue;
    todos.push({ especie: r.especie, categoria: r.categoria, dominio: `Lâmina (${laminaLabel})`, n: r.n,
      prevalencia: r.prevalencia, base_n: laminaConclusivosN, metodos: r.metodo });
  }
  for (const especie of multi) {
    const doEsp = (metodosPorEspecie.get(especie) || "").split(" + ");
    const metodosDesta = activeMethods.map((m) => m[1]).filter((nm) => doEsp.includes(nm));
    let baseN = 0, n = 0;
    for (const r of porPaciente) {
      if (metodosDesta.some((nm) => conclusivo(r.metodos[nm].status))) baseN++;
      if (metodosDesta.some((nm) => r.metodos[nm].especies.includes(especie))) n++;
    }
    todos.push({ especie, categoria: categoriaDe(especie, cfg), dominio: "Fecal + Lâmina", n,
      prevalencia: pct(n, baseN), base_n: baseN, metodos: metodosPorEspecie.get(especie) || "" });
  }
  todos = ordenarPor(todos, (r) => [-r.prevalencia, r.especie]);
  for (const r of todos) [r.ic95_inf, r.ic95_sup] = wilsonCi(r.n, r.base_n);

  // efeito do nº de potes — só positividade fecal, entre fecais conclusivos
  const porPotes = new Map();
  for (const r of fecalConc) {
    const k = r.n_coletas_pote_entregue;
    if (!porPotes.has(k)) porPotes.set(k, []);
    porPotes.get(k).push(r);
  }
  const efeito = [...porPotes.keys()].sort((a, b) => a - b).map((k) => {
    const g = porPotes.get(k);
    const nPos = contar(g, (r) => r.positivo_fecal);
    return { n_potes_entregues: k, n_pacientes: g.length, n_positivos: nPos, prevalencia: pct(nPos, g.length) };
  });

  const cumulativa = buildFecalCumulativeCurve(df, fecalAtivos, cfg);

  // somente patogênicos, separado por domínio
  const nFecalPat = contar(fecalConc, (r) => r.positivo_fecal_patogenico);
  const nLaminaPat = contar(laminaConc, (r) => r.positivo_lamina_patogenico);
  const icFP = wilsonCi(nFecalPat, fecalConc.length);
  const icLP = wilsonCi(nLaminaPat, laminaConc.length);
  const especiesLaminaResumo = resumoEspecies(laminaConc, "especies_lamina", laminaConc.length, cfg);

  return {
    por_paciente: porPaciente, total, analisavel, fecal, apenas_lamina: apenasLamina,
    fecal_conclusivo: fecalConc, fecal_inconclusivo: fecalInc,
    lamina_conclusivo: laminaConc, lamina_inconclusivo: laminaInc,
    lamina_only_conclusivo: laminaOnlyConc, lamina_only_inconclusivo: laminaOnlyInc,
    combinada_base: combinadaBase, combinada_inconclusiva: combinadaInc,
    cat_counts: catCounts,
    prev_fecal: pct(nPosF, fecalConc.length), prev_fecal_ic95_inf: icF[0], prev_fecal_ic95_sup: icF[1],
    prev_lamina: pct(nPosL, laminaConc.length), prev_lamina_ic95_inf: icL[0], prev_lamina_ic95_sup: icL[1],
    prev_lamina_only: pct(nPosLO, laminaOnlyConc.length), prev_lamina_only_ic95_inf: icLO[0], prev_lamina_only_ic95_sup: icLO[1],
    prev_combinada: pct(nPosC, combinadaBase.length), prev_combinada_ic95_inf: icC[0], prev_combinada_ic95_sup: icC[1],
    especies_resumo: especiesResumo, poli, mono, neg, combos_resumo: combosResumo,
    metodos_resumo: metodosResumo, efeito_n_coletas: efeito, fecal_cumulativa: cumulativa,
    metodo_especie_resumo: metodoEspecie, todos_parasitos_resumo: todos,
    mcnemar_hpj_willis: mcnemarHpjWillis(porPaciente, activeMethods),
    cochran_armitage_efeito_coletas: cochranArmitageTrend(efeito),
    metodos_ativos: activeMethods, metodos_ativos_nomes: activeMethods.map((m) => m[1]),
    prev_fecal_patogenico: pct(nFecalPat, fecalConc.length),
    prev_fecal_patogenico_ic95_inf: icFP[0], prev_fecal_patogenico_ic95_sup: icFP[1], n_fecal_patogenico: nFecalPat,
    prev_lamina_patogenico: pct(nLaminaPat, laminaConc.length),
    prev_lamina_patogenico_ic95_inf: icLP[0], prev_lamina_patogenico_ic95_sup: icLP[1], n_lamina_patogenico: nLaminaPat,
    especies_lamina_resumo: especiesLaminaResumo, config: cfg,
  };
}
