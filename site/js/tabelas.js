// Tabelas HTML do relatório (cabeçalho fixo, rolagem e ordenação por coluna).

import { esc, cmpStr } from "./util.js";

const registro = new Map();
let seq = 0;

/**
 * colunas: [{ k: chave, t: título, tipo?: "int"|"pct"|"num"|"txt"|"bool"|"cat"|"status"|"ic", fmt? }]
 * linhas: lista de objetos. opts: { altura, ordenavel = true, indice = false }
 */
export function tabela(colunas, linhas, opts = {}) {
  const id = `t${++seq}`;
  registro.set(id, { colunas, linhas, ordem: null });
  const alt = opts.altura ? ` style="max-height:${opts.altura}px"` : "";
  return `<div class="pj-tabela-wrap"${alt}><table class="pj-tabela" data-tabela="${id}">` +
    cabecalho(colunas, opts.ordenavel !== false, null) + `<tbody>${corpo(colunas, linhas)}</tbody></table></div>`;
}

const numerico = (c) => ["int", "pct", "num"].includes(c.tipo);

function cabecalho(colunas, ordenavel, ordem) {
  return "<thead><tr>" + colunas.map((c, i) => {
    const seta = ordem && ordem.i === i ? (ordem.desc ? "▼" : "▲") : ordenavel ? "↕" : "";
    return `<th class="${numerico(c) ? "num " : ""}${ordenavel ? "ord" : ""}" data-col="${i}" scope="col">${esc(c.t)}${seta ? `<span class="seta">${seta}</span>` : ""}</th>`;
  }).join("") + "</tr></thead>";
}

export function formatar(v, c) {
  if (c.fmt) return c.fmt(v);
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) || v === "") {
    return c.tipo === "txt" && v === "" ? "" : `<span class="pj-vazio">—</span>`;
  }
  switch (c.tipo) {
    case "pct": return Number(v).toFixed(1);
    case "num": return String(v);
    case "int": return String(v);
    case "bool": return v ? "Sim" : "Não";
    case "cat": {
      const cl = v === "Patogênico" ? "pat" : v === "Comensal" ? "com" : "nc";
      return `<span class="pj-chip ${cl}">${esc(v)}</span>`;
    }
    case "status": return esc({ positivo: "Positivo", negativo: "Negativo", inconclusivo: "Inconclusivo" }[v] || v);
    default: return esc(v);
  }
}

function corpo(colunas, linhas) {
  if (!linhas.length) return `<tr><td colspan="${colunas.length}" class="pj-vazio">Sem dados.</td></tr>`;
  const classe = (c) => [numerico(c) ? "num" : "", c.quebra ? "quebra" : ""].join(" ").trim();
  return linhas.map((r) => "<tr>" + colunas.map((c) => `<td class="${classe(c)}">${formatar(r[c.k], c)}</td>`).join("") + "</tr>").join("");
}

function valorOrd(v) {
  if (v === null || v === undefined || v === "") return null;
  return v;
}

/** Liga a ordenação ao clicar no cabeçalho (delegação no documento; chamar uma vez). */
export function ligarOrdenacao(raiz = document) {
  raiz.addEventListener("click", (ev) => {
    const th = ev.target.closest("th.ord");
    if (!th) return;
    const tab = th.closest("table[data-tabela]");
    const info = registro.get(tab.dataset.tabela);
    if (!info) return;
    const i = Number(th.dataset.col);
    const desc = info.ordem && info.ordem.i === i ? !info.ordem.desc : numerico(info.colunas[i]);
    info.ordem = { i, desc };
    const k = info.colunas[i].k;
    const linhas = info.linhas.map((r, j) => [r, j]).sort((A, B) => {
      const a = valorOrd(A[0][k]), b = valorOrd(B[0][k]);
      if (a === null && b === null) return A[1] - B[1];
      if (a === null) return 1;
      if (b === null) return -1;
      let c = typeof a === "number" && typeof b === "number" ? a - b : cmpStr(String(a).toLowerCase(), String(b).toLowerCase());
      if (desc) c = -c;
      return c || A[1] - B[1];
    }).map(([r]) => r);
    tab.querySelector("thead").outerHTML = cabecalho(info.colunas, true, info.ordem);
    tab.querySelector("tbody").innerHTML = corpo(info.colunas, linhas);
  });
}

/** Coluna "IC 95%" no formato do app ("11.0 – 42.1%"). */
export function textoIC(r, sep = " – ") {
  const i = r.ic95_inf, s = r.ic95_sup;
  if (i === null || i === undefined || s === null || s === undefined) return "—";
  return `${Number(i).toFixed(1)}${sep}${Number(s).toFixed(1)}%`;
}

export function comIC(linhas, sep = " – ") {
  return linhas.map((r) => ({ ...r, ic: textoIC(r, sep) }));
}
