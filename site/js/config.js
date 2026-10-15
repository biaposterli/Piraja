// Configuração da análise — parasitos, classificação, métodos, nº de amostras e
// critérios de inclusão. Tradução de analysis_config.py.
//
// Versão híbrida: se a planilha tiver as abas Config_*, elas pré-preenchem a
// configuração; se não tiver, ela é montada com o que foi detectado nos
// resultados. Em ambos os casos quem usa revisa no site e pode baixar a
// configuração pronta. As tabelas são listas de objetos com as mesmas
// colunas usadas no site e nas abas Config_*.

import {
  CATEGORIAS_VALIDAS, DOMINIO_FECAL, DOMINIO_LAMINA, METHOD_CATALOG, PARASITE_MAP, CRITERIOS_PADRAO, TODAS,
  parseResultCellRaw, categoriaDe, maxColetas, novaConfig,
} from "./engine.js";
import { chaveTexto, texto, isNulo, cmpStr, sortedStr } from "./util.js";
import { tabelaDeMatriz, matrizSemNA } from "./tabela.js";

export const SHEET_PARASITOS = "Config_Parasitos";
export const SHEET_METODOS = "Config_Metodos";
export const SHEET_AMOSTRAS = "Config_Amostras";
export const SHEET_CRITERIOS = "Config_Criterios";
export const CONFIG_SHEETS = [SHEET_PARASITOS, SHEET_METODOS, SHEET_AMOSTRAS, SHEET_CRITERIOS];

export const AMOSTRA_FEZES = "Fezes";
export const AMOSTRA_LAMINA = "Lâmina (Graham)";
export const AMOSTRAS_VALIDAS = [AMOSTRA_FEZES, AMOSTRA_LAMINA];

export const PAR_COLS = ["Incluir", "Parasito", "Classificação", "Agrupar como", "Encontrado em", "Ocorrências"];
export const MET_COLS = ["Incluir", "Coluna", "Método", "Amostra"];
export const PARAM_N_AMOSTRAS = "Quantidade de amostras por paciente";

// aba Config_Criterios: (chave interna, rótulo na planilha, explicação)
export const CRITERIOS_ROTULOS = [
  ["min_fezes", "Mínimo de coletas com fezes entregues",
    "0 = sem exigência; um número (1, 2...) ou 'Todas' (todas as coletas P1..Pn consideradas)."],
  ["min_lamina", "Mínimo de coletas com lâmina entregue", "0 = sem exigência; um número (1, 2...) ou 'Todas'."],
  ["excluir_inconclusivos", "Excluir paciente com amostra sem resultado",
    "Sim = exclui quem teve 'Amostra insuficiente' ou célula vazia em algum método incluído."],
  ["exigir_todos_metodos", "Exigir todos os métodos realizados",
    "Sim = exclui quem teve algum método incluído marcado 'Não realizado'."],
];

function criterioValorPlanilha(chave, valor) {
  if (chave === "min_fezes" || chave === "min_lamina") return valor === TODAS ? "Todas" : Math.trunc(valor || 0);
  return valor ? "Sim" : "Não";
}

/** float() do Python para os valores das abas de configuração (NaN se não for número). */
function paraNumero(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v ?? "").trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return NaN;
  return parseFloat(s);
}

function criterioDaPlanilha(chave, valor) {
  if (chave === "min_fezes" || chave === "min_lamina") {
    if (chaveTexto(valor).startsWith("tod")) return TODAS;
    const n = paraNumero(valor);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.trunc(n));
  }
  return asBool(valor, false);
}

export function asBool(x, padrao = true) {
  if (typeof x === "boolean") return x;
  const k = chaveTexto(x);
  if (k === "" || k === "nan") return padrao;
  if (["nao", "n", "no", "false", "falso", "0", "excluir"].includes(k)) return false;
  return true;
}

export function asCategoria(x) {
  const k = chaveTexto(x);
  if (k.startsWith("pat")) return "Patogênico";
  if (k.startsWith("com")) return "Comensal";
  return "Não classificado";
}

export function asAmostra(x) {
  const k = chaveTexto(x);
  if (["lam", "graham", "swab", "fita", "perianal"].some((w) => k.includes(w))) return AMOSTRA_LAMINA;
  return AMOSTRA_FEZES;
}

export const dominioDe = (amostra) => (amostra === AMOSTRA_LAMINA ? DOMINIO_LAMINA : DOMINIO_FECAL);
export const amostraDe = (dominio) => (dominio === DOMINIO_LAMINA ? AMOSTRA_LAMINA : AMOSTRA_FEZES);

// ---------------------------------------------------------------------------
// detecção a partir da planilha de resultados
// ---------------------------------------------------------------------------
const CATALOG_BY_COL = new Map(METHOD_CATALOG.map(([col, nome, , dom]) => [col, [nome, dom]]));

/** str.title() do Python: maiúscula após qualquer caractere que não seja letra. */
function title(s) {
  let out = "", ant = false;
  for (const ch of s) {
    const letra = /\p{L}/u.test(ch);
    out += letra ? (ant ? ch.toLowerCase() : ch.toUpperCase()) : ch;
    ant = letra;
  }
  return out;
}

export function nomePadraoMetodo(col) {
  if (CATALOG_BY_COL.has(col)) return CATALOG_BY_COL.get(col)[0];
  const base = col.startsWith("metodo_") ? col.slice("metodo_".length) : col;
  return title(base.replaceAll("_", " ").trim()) || col;
}

export function dominioPadraoMetodo(col) {
  if (CATALOG_BY_COL.has(col)) return CATALOG_BY_COL.get(col)[1];
  const k = chaveTexto(col);
  return ["graham", "swab", "lamina", "fita"].some((w) => k.includes(w)) ? DOMINIO_LAMINA : DOMINIO_FECAL;
}

/** Colunas de método presentes: as do catálogo + qualquer outra 'metodo_*'. */
export function detectarColunasMetodo(df) {
  const cat = METHOD_CATALOG.map((m) => m[0]).filter((c) => df.columns.includes(c));
  const extras = df.columns.filter((c) => String(c).startsWith("metodo_") && !cat.includes(c));
  return [...cat, ...extras];
}

export function tabelaMetodosDetectados(df) {
  return detectarColunasMetodo(df).map((col) => ({
    Incluir: true, Coluna: col, "Método": nomePadraoMetodo(col), Amostra: amostraDe(dominioPadraoMetodo(col)),
  }));
}

/** Parasitos encontrados nas colunas de método incluídas: nº de células e onde. */
export function contarParasitos(df, metodos) {
  const cont = new Map(), onde = new Map();
  for (const m of metodos.filter((x) => asBool(x.Incluir))) {
    const col = m.Coluna;
    if (!df.columns.includes(col)) continue;
    const dominio = dominioDe(m.Amostra);
    for (const r of df.rows) {
      const [, especies, positivo] = parseResultCellRaw(r[col]);
      if (!positivo) continue;
      for (const e of especies) {
        cont.set(e, (cont.get(e) || 0) + 1);
        if (!onde.has(e)) onde.set(e, new Set());
        onde.get(e).add(dominio);
      }
    }
  }
  const chaves = [...cont.keys()].sort((a, b) => (cont.get(b) - cont.get(a)) || cmpStr(a, b));
  return chaves.map((e) => {
    const d = onde.get(e) || new Set();
    const enc = [d.has(DOMINIO_FECAL) ? AMOSTRA_FEZES : "", d.has(DOMINIO_LAMINA) ? "Lâmina" : ""].filter(Boolean).join(" + ");
    return { Parasito: e, "Encontrado em": enc, "Ocorrências": cont.get(e) };
  });
}

export function tabelaParasitosPadrao(contagem) {
  return contagem.map((r) => ({
    Incluir: true, Parasito: r.Parasito, "Classificação": categoriaDe(r.Parasito), "Agrupar como": "",
    "Encontrado em": r["Encontrado em"], "Ocorrências": Math.trunc(r["Ocorrências"]),
  }));
}

// ---------------------------------------------------------------------------
// leitura das abas Config_* (planilha = { nomes: [...], abas: { nome: matriz } })
// ---------------------------------------------------------------------------
function renomearColunas(tab, esperadas) {
  const byKey = new Map(esperadas.map((c) => [chaveTexto(c), c]));
  const novo = (c) => (byKey.has(chaveTexto(c)) ? byKey.get(chaveTexto(c)) : c);
  return {
    columns: tab.columns.map(novo),
    rows: tab.rows.map((r) => {
      const o = {};
      for (const c of tab.columns) { const n = novo(c); if (!(n in o)) o[n] = r[c]; }
      return o;
    }),
  };
}

export function lerConfigDaPlanilha(planilha) {
  const byKey = new Map();
  for (const s of planilha.nomes) byKey.set(chaveTexto(s), s);
  const out = {};

  let s = byKey.get(chaveTexto(SHEET_PARASITOS));
  if (s) {
    const d = renomearColunas(tabelaDeMatriz(planilha.abas[s]), PAR_COLS);
    if (d.columns.includes("Parasito")) {
      const temInc = d.columns.includes("Incluir"), temCl = d.columns.includes("Classificação");
      const temAg = d.columns.includes("Agrupar como");
      out.parasitos = d.rows.filter((r) => texto(r.Parasito) !== "").map((r) => {
        const p = texto(r.Parasito);
        return {
          Incluir: temInc ? asBool(r.Incluir) : true,
          Parasito: p,
          "Classificação": temCl ? asCategoria(r["Classificação"]) : categoriaDe(p),
          "Agrupar como": temAg ? texto(r["Agrupar como"]) : "",
        };
      });
    }
  }

  s = byKey.get(chaveTexto(SHEET_METODOS));
  if (s) {
    const d = renomearColunas(tabelaDeMatriz(planilha.abas[s]), MET_COLS);
    if (d.columns.includes("Coluna")) {
      const temInc = d.columns.includes("Incluir");
      out.metodos = d.rows.filter((r) => texto(r.Coluna) !== "").map((r) => {
        const c = texto(r.Coluna).toLowerCase().replaceAll(" ", "_");
        const n = d.columns.includes("Método") ? r["Método"] : "";
        const a = d.columns.includes("Amostra") ? r.Amostra : "";
        return {
          Incluir: temInc ? asBool(r.Incluir) : true,
          Coluna: c,
          "Método": texto(n) || nomePadraoMetodo(c),
          Amostra: texto(a) ? asAmostra(a) : amostraDe(dominioPadraoMetodo(c)),
        };
      });
    }
  }

  s = byKey.get(chaveTexto(SHEET_AMOSTRAS));
  if (s) {
    for (const linha of matrizSemNA(planilha.abas[s])) {
      const vals = linha.filter((v) => !isNulo(v));
      if (vals.length >= 2 && chaveTexto(vals[0]).includes("amostra")) {
        const n = paraNumero(vals[1]);
        if (Number.isFinite(n)) out.n_amostras = Math.trunc(n);
        break;
      }
    }
  }

  s = byKey.get(chaveTexto(SHEET_CRITERIOS));
  if (s) {
    const porRotulo = new Map(CRITERIOS_ROTULOS.map(([ch, r]) => [chaveTexto(r), ch]));
    const crit = { ...CRITERIOS_PADRAO };
    let achou = false;
    for (const vals of matrizSemNA(planilha.abas[s])) {
      if (vals.length >= 2 && porRotulo.has(chaveTexto(vals[0]))) {
        const ch = porRotulo.get(chaveTexto(vals[0]));
        crit[ch] = criterioDaPlanilha(ch, vals[1]);
        achou = true;
      }
    }
    if (achou) out.criterios = crit;
  }
  return out;
}

// ---------------------------------------------------------------------------
// combinação: configuração da planilha + o que foi detectado
// ---------------------------------------------------------------------------
function comContagem(par, contagem) {
  const info = new Map(contagem.map((r) => [r.Parasito, r]));
  return par.map((r) => ({
    Incluir: r.Incluir, Parasito: r.Parasito, "Classificação": r["Classificação"], "Agrupar como": r["Agrupar como"] ?? "",
    "Encontrado em": info.has(r.Parasito) ? info.get(r.Parasito)["Encontrado em"] : "—",
    "Ocorrências": info.has(r.Parasito) ? Math.trunc(info.get(r.Parasito)["Ocorrências"]) : 0,
  }));
}

/** Devolve { parasitos, metodos, n, maxObs, avisos }. */
export function montarTabelasIniciais(df, cfgPlanilha) {
  const avisos = [];
  const detectados = tabelaMetodosDetectados(df);
  let metodos;
  if (cfgPlanilha.metodos) {
    let met = cfgPlanilha.metodos;
    const faltando = met.map((r) => r.Coluna).filter((c) => !df.columns.includes(c));
    if (faltando.length) avisos.push("Métodos da configuração sem coluna nos dados (ignorados): " + faltando.join(", ") + ".");
    met = met.filter((r) => df.columns.includes(r.Coluna));
    const cols = new Set(met.map((r) => r.Coluna));
    const novos = detectados.filter((r) => !cols.has(r.Coluna));
    if (novos.length) {
      avisos.push("Colunas de método que não estavam na configuração (incluídas): " + novos.map((r) => r.Coluna).join(", ") + ".");
    }
    metodos = [...met, ...novos];
  } else metodos = detectados;

  const contagem = contarParasitos(df, metodos);
  let parasitos;
  if (cfgPlanilha.parasitos) {
    const vistos = new Set();
    const par = cfgPlanilha.parasitos.filter((r) => (vistos.has(r.Parasito) ? false : (vistos.add(r.Parasito), true)));
    const nomes = new Set(par.map((r) => r.Parasito));
    const novos = tabelaParasitosPadrao(contagem.filter((r) => !nomes.has(r.Parasito)));
    if (novos.length) {
      avisos.push("Parasitos encontrados nos dados que não estavam na configuração (incluídos com a " +
        "classificação padrão — confira): " + novos.map((r) => r.Parasito).join(", ") + ".");
    }
    parasitos = [...comContagem(par, contagem), ...novos];
  } else parasitos = tabelaParasitosPadrao(contagem);

  const maxObs = maxColetas(df);
  const n = cfgPlanilha.n_amostras || maxObs || 1;
  if (maxObs && n > maxObs) avisos.push(`A configuração pede ${n} amostras por paciente, mas a planilha só vai até P${maxObs}.`);
  return { parasitos, metodos, n: Math.trunc(n), maxObs: Math.trunc(maxObs), avisos };
}

/** Recalcula as contagens depois que os métodos mudam; mantém as escolhas. */
export function atualizarContagens(parasitos, df, metodos) {
  const contagem = contarParasitos(df, metodos);
  const nomes = new Set(parasitos.map((r) => r.Parasito));
  const novos = tabelaParasitosPadrao(contagem.filter((r) => !nomes.has(r.Parasito)));
  return [...comContagem(parasitos, contagem), ...novos];
}

// ---------------------------------------------------------------------------
// tabelas editadas -> configuração
// ---------------------------------------------------------------------------
export function construirConfig(parasitos, metodos, nAmostras, criterios = null) {
  const avisos = [];
  const metTuplas = [];
  const usados = new Set();
  for (const r of metodos) {
    if (!asBool(r.Incluir)) continue;
    const col = texto(r.Coluna);
    let nome = texto(r["Método"]) || nomePadraoMetodo(col);
    const base = nome;
    let i = 2;
    while (usados.has(nome)) { nome = `${base} (${i})`; i++; }
    usados.add(nome);
    const dom = dominioDe(asAmostra(r.Amostra));
    metTuplas.push([col, nome, dom === DOMINIO_LAMINA ? "status_lamina" : "status_amostra", dom]);
  }

  const excluidos = new Set(), renomear = new Map(), categorias = new Map();
  const porAlvo = new Map();
  for (const r of parasitos) {
    const p = texto(r.Parasito);
    if (!p) continue;
    if (!asBool(r.Incluir)) { excluidos.add(p); continue; }
    const alvo = texto(r["Agrupar como"] ?? "") || p;
    if (alvo !== p) renomear.set(p, alvo);
    const cat = CATEGORIAS_VALIDAS.includes(r["Classificação"]) ? r["Classificação"] : asCategoria(r["Classificação"]);
    if (!porAlvo.has(alvo)) porAlvo.set(alvo, []);
    porAlvo.get(alvo).push([p, cat]);
  }
  for (const [alvo, itens] of porAlvo) {
    // vale a classificação da linha cujo nome é o próprio nome final; senão, a 1ª
    const escolhido = itens.find(([p]) => p === alvo) || itens[0];
    categorias.set(alvo, escolhido[1]);
    if (new Set(itens.map(([, c]) => c)).size > 1) {
      avisos.push(`'${alvo}': nomes agrupados com classificações diferentes — vale '${escolhido[1]}' (da linha '${escolhido[0]}').`);
    }
  }
  const naoClass = sortedStr([...categorias].filter(([, c]) => c === "Não classificado").map(([e]) => e));
  if (naoClass.length) {
    const txt = naoClass.join(", ");
    avisos.push("Sem classificação (não entram nos gráficos de patogênicos): " + txt + (txt.endsWith(".") ? "" : "."));
  }
  const cfg = novaConfig({
    renomear, excluidos, categorias, metodos: metTuplas,
    n_amostras: nAmostras ? Math.trunc(nAmostras) : null,
    criterios: { ...CRITERIOS_PADRAO, ...(criterios || {}) },
  });
  return { cfg, avisos };
}

// ---------------------------------------------------------------------------
// exportação (abas Config_* como matrizes; 1ª linha = cabeçalho)
// ---------------------------------------------------------------------------
export function abasConfig(parasitos, metodos, nAmostras, criterios = null) {
  const sn = (b) => (asBool(b) ? "Sim" : "Não");
  const par = [["Incluir", "Parasito", "Classificação", "Agrupar como"]];
  for (const r of parasitos) par.push([sn(r.Incluir), r.Parasito, r["Classificação"], r["Agrupar como"] ?? ""]);
  const met = [MET_COLS.slice()];
  for (const r of metodos) met.push([sn(r.Incluir), r.Coluna, r["Método"], r.Amostra]);
  const amo = [["Parâmetro", "Valor", "Observação"],
    [PARAM_N_AMOSTRAS, nAmostras ? Math.trunc(nAmostras) : "",
      "Coletas P1..Pn consideradas por paciente. Coletas acima desse número são ignoradas."]];
  const c = { ...CRITERIOS_PADRAO, ...(criterios || {}) };
  const cri = [["Critério de inclusão", "Valor", "Observação"]];
  for (const [ch, rot, expl] of CRITERIOS_ROTULOS) cri.push([rot, criterioValorPlanilha(ch, c[ch]), expl]);
  return { [SHEET_PARASITOS]: par, [SHEET_METODOS]: met, [SHEET_AMOSTRAS]: amo, [SHEET_CRITERIOS]: cri };
}

/** Abas de configuração do MODELO: todos os parasitos e métodos conhecidos. */
export function abasConfigModelo() {
  const especies = sortedStr(new Set(Object.values(PARASITE_MAP)));
  const par = especies.map((e) => ({ Incluir: true, Parasito: e, "Classificação": categoriaDe(e), "Agrupar como": "" }));
  const met = METHOD_CATALOG.map(([col, nome, , dom]) => ({ Incluir: true, Coluna: col, "Método": nome, Amostra: amostraDe(dom) }));
  return abasConfig(par, met, 3);
}
