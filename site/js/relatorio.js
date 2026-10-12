// Passo 04 — relatório na tela (mesmas seções e textos do app original).

import { esc } from "./util.js";
import { tabela, comIC, textoIC } from "./tabelas.js";
import { COR, graficoEspecies, graficoTodos, colunas, rosca, linha } from "./graficos.js";
import { icones } from "./ilustracoes.js";
import { CATEGORIAS_AMOSTRAGEM } from "./engine.js";

// ---------------------------------------------------------------- pequenos blocos
/** Series.round(1) do pandas (numpy: arredonda x·10 com empate para o par). */
export function npRound1(v) {
  const x = v * 10, f = Math.floor(x), d = x - f;
  const r = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  return r / 10;
}

export function formatIC(inf, sup) {
  if (inf === null || inf === undefined || sup === null || sup === undefined) return "IC95% não calculável (n=0)";
  return `IC95%: ${inf.toFixed(1)}–${sup.toFixed(1)}%`;
}
const prevValor = (prev, n) => (n ? `${prev.toFixed(1)}%` : "—");
function prevLegenda(inf, sup, n, temMetodo, dominio) {
  if (!temMetodo) return `Não avaliado — nenhum método de ${dominio} nesta planilha.`;
  if (!n) return "Não avaliado — nenhum resultado conclusivo.";
  return formatIC(inf, sup);
}

function ajuda(txt) {
  return txt ? `<span class="pj-ajuda" tabindex="0" data-dica="${esc(txt)}" aria-label="${esc(txt)}">?</span>` : "";
}

export function metrica(rotulo, valor, legenda = "", dica = "") {
  return `<div class="pj-metrica"><div class="rot"><span>${esc(rotulo)}</span>${ajuda(dica)}</div>` +
    `<div class="val">${esc(valor)}</div>${legenda ? `<div class="leg">${esc(legenda)}</div>` : ""}</div>`;
}

export function secaoTitulo(t, legenda = "") {
  return `<div class="pj-secao-titulo">${esc(t)}</div>` + (legenda ? `<div class="pj-legenda">${esc(legenda)}</div>` : "");
}
export function subTitulo(t, legenda = "") {
  return `<div class="pj-secao-sub">${esc(t)}</div>` + (legenda ? `<div class="pj-legenda">${esc(legenda)}</div>` : "");
}
export const info = (t) => `<div class="pj-alerta info">${t}</div>`;
// Gráficos são desenhados na largura real do contêiner (texto sempre nítido e
// do mesmo tamanho): aqui só fica o "lugar" e a função que desenha.
const _graficos = new Map();
let _gseq = 0;
export function grafico(fn) {
  const id = `g${++_gseq}`;
  _graficos.set(id, fn);
  return `<div class="pj-grafico-box" data-g="${id}"></div>`;
}
/** Desenha (ou redesenha, se a largura mudou) os gráficos visíveis dentro de raiz. */
export function desenharGraficos(raiz = document) {
  for (const el of raiz.querySelectorAll(".pj-grafico-box[data-g]")) {
    if (!el.offsetParent) continue; // aba fechada: desenha quando abrir
    const w = Math.round(el.clientWidth);
    if (!w || Number(el.dataset.w) === w) continue;
    const fn = _graficos.get(el.dataset.g);
    if (!fn) continue;
    el.innerHTML = fn(Math.max(280, w));
    el.dataset.w = String(w);
  }
}
export function expansivel(titulo, corpo, aberto = false) {
  return `<details class="pj-exp"${aberto ? " open" : ""}><summary>${esc(titulo)}</summary><div class="corpo">${corpo}</div></details>`;
}

const COLS_ESPECIE = [
  { k: "especie", t: "Espécie" }, { k: "n", t: "N", tipo: "int" }, { k: "prevalencia", t: "Prevalência %", tipo: "pct" },
  { k: "categoria", t: "Categoria", tipo: "cat" }, { k: "ic", t: "IC 95%", tipo: "txt" },
];

// ---------------------------------------------------------------- gráficos por espécie
function graficoEspeciesTela(esp, soPat, vazio) {
  let d = esp;
  if (d.length && soPat) d = d.filter((r) => r.categoria === "Patogênico");
  if (!d.length) return info(vazio);
  return grafico((w) => graficoEspecies(d, { largura: w }));
}

function blocoDominio(titulo, legenda, esp, nBase, nPos, prev, ic, nPat, prevPat, icPat, temMetodo) {
  let h = secaoTitulo(titulo, legenda);
  if (!temMetodo) return h + info("Nenhum método deste tipo de amostra foi incluído na análise (veja o passo 03).");
  if (!nBase) return h + info("Nenhum paciente com resultado conclusivo neste tipo de amostra.");
  h += `<div class="pj-cols c2">` +
    metrica("Positividade — todos os parasitos", prevValor(prev, nBase), `${nPos} de ${nBase} pacientes · ${formatIC(...ic)}`) +
    metrica("Positividade — somente patogênicos", prevValor(prevPat, nBase), `${nPat} de ${nBase} pacientes · ${formatIC(...icPat)}`) +
    `</div><div class="pj-cols c2" style="margin-top:14px">` +
    `<div>${subTitulo("Todos os parasitos")}${graficoEspeciesTela(esp, false, "Nenhum parasito detectado.")}</div>` +
    `<div>${subTitulo("Somente patogênicos")}${graficoEspeciesTela(esp, true, "Nenhum parasito patogênico detectado.")}</div></div>`;
  h += expansivel("Tabela por espécie com IC95% (Wilson)", tabela(COLS_ESPECIE, comIC(esp)));
  return h;
}

// ---------------------------------------------------------------- abas
function abaGeral(m) {
  const dom = new Set(m.metodos_ativos.map((x) => x[3]));
  const temF = dom.has("fecal"), temL = dom.has("lamina");
  const nF = m.fecal_conclusivo.length, nL = m.lamina_conclusivo.length, nC = m.combinada_base.length;
  let h = `<div class="pj-secao">${secaoTitulo("Resumo executivo")}<div class="pj-cols c3">` +
    metrica("Prevalência — amostra fecal", prevValor(m.prev_fecal, nF),
      prevLegenda(m.prev_fecal_ic95_inf, m.prev_fecal_ic95_sup, nF, temF, "amostra fecal"),
      "Base: pacientes com resultado CONCLUSIVO em pelo menos um método fecal presente nesta planilha. Achados exclusivos de métodos de lâmina não entram aqui — veja 'Espécies & parasitos' para a prevalência de Enterobius. Pacientes com todos os resultados fecais marcados como 'Amostra insuficiente' são excluídos do denominador (não contam como negativos). IC95% calculado pelo método de Wilson.") +
    metrica("Prevalência — lâmina (todos os pacientes)", prevValor(m.prev_lamina, nL),
      prevLegenda(m.prev_lamina_ic95_inf, m.prev_lamina_ic95_sup, nL, temL, "lâmina"),
      "Base: TODOS os pacientes com resultado conclusivo do(s) método(s) de lâmina desta planilha (Graham) — tenham eles entregado só a lâmina ou fezes e lâmina. Reflete tipicamente Enterobius vermicularis — o único parasita pesquisável só com a lâmina. O subgrupo que entregou exclusivamente lâmina é reportado à parte logo abaixo, mas seus resultados já estão somados aqui. IC95% calculado pelo método de Wilson.") +
    metrica("Prevalência combinada", prevValor(m.prev_combinada, nC),
      prevLegenda(m.prev_combinada_ic95_inf, m.prev_combinada_ic95_sup, nC, true, "nenhum domínio"),
      "Todos os pacientes com pelo menos um resultado conclusivo, em qualquer domínio (fezes e/ou lâmina) — use com cautela, mistura profundidades diagnósticas diferentes. IC95% calculado pelo método de Wilson.") +
    `</div><div class="pj-cols c3" style="margin-top:14px">` +
    metrica("Fezes — somente patogênicos", prevValor(m.prev_fecal_patogenico, nF),
      prevLegenda(m.prev_fecal_patogenico_ic95_inf, m.prev_fecal_patogenico_ic95_sup, nF, temF, "amostra fecal"),
      "Mesma base da prevalência fecal; conta só pacientes com ao menos um parasito classificado como patogênico no passo 03.") +
    metrica("Lâmina — somente patogênicos", prevValor(m.prev_lamina_patogenico, nL),
      prevLegenda(m.prev_lamina_patogenico_ic95_inf, m.prev_lamina_patogenico_ic95_sup, nL, temL, "lâmina"),
      "Mesma base da prevalência de lâmina; conta só pacientes com ao menos um parasito classificado como patogênico no passo 03.") +
    `<div></div></div>`;

  const nInc = m.fecal_inconclusivo.length + m.lamina_inconclusivo.length;
  if (nInc > 0) {
    const nl = m.lamina_inconclusivo.length;
    h += `<div class="pj-note"><strong>Amostras inconclusivas:</strong> ${m.fecal_inconclusivo.length} paciente(s) entregaram pote de fezes mas ` +
      `tiveram <em>todos</em> os métodos fecais marcados como "Amostra insuficiente" (ou sem resultado registrado)` +
      `${nl ? `, ${nl} paciente(s) com lâmina entregue na mesma situação` : ""}. Esses pacientes foram excluídos dos denominadores de prevalência acima — eles ` +
      `<u>não</u> contam como negativos, pois não houve diagnóstico conclusivo. Células marcadas como "Não realizado" não entram nesta contagem — elas são ` +
      `excluídas do denominador do método sem contar como inconclusivas.</div>`;
  }
  if (m.apenas_lamina.length > 0) {
    const pos = m.lamina_only_conclusivo.filter((r) => r.positivo_lamina).length;
    h += `<div class="pj-note"><strong>Atenção:</strong> ${m.apenas_lamina.length} paciente(s) só entregaram a lâmina, nunca o pote de fezes — para eles, apenas ` +
      `o(s) método(s) de lâmina desta planilha pôde(puderam) ser pesquisado(s). Esses resultados já estão somados na "Prevalência — lâmina (todos os pacientes)" ` +
      `acima; isoladamente, a prevalência só neste subgrupo é de ${m.prev_lamina_only.toFixed(1)}% (${pos} de ${m.lamina_only_conclusivo.length} pacientes conclusivos).</div>`;
  }
  h += `</div>`;

  // profundidade de amostragem
  const cat = CATEGORIAS_AMOSTRAGEM.map((c) => ({ c, n: m.cat_counts[c], p: npRound1(100 * m.cat_counts[c] / m.total) }));
  h += `<div class="pj-secao">${secaoTitulo("Pacientes por profundidade de amostragem")}` +
    tabela([{ k: "c", t: "Categoria de amostragem" }, { k: "n", t: "Pacientes", tipo: "int" }, { k: "p", t: "%", tipo: "pct" }], cat, { ordenavel: false }) + `</div>`;

  // território
  if (m.tem_territorio) {
    h += `<div class="pj-secao">` + secaoTitulo("Prevalência por território (moradia)",
      "Pacientes com resultado conclusivo, agrupados pelo bairro e município onde moram. Positivo = qualquer parasito em qualquer tipo de amostra (mesma base da prevalência combinada). IC95% pelo método de Wilson.");
    const colsT = (nivel) => [
      ...(nivel === "bairro" ? [{ k: "bairro", t: "Bairro" }] : []), { k: "municipio", t: "Município" }, { k: "uf", t: "UF" },
      { k: "n_pacientes", t: "Pacientes", tipo: "int" }, { k: "n_positivos", t: "Positivos", tipo: "int" },
      { k: "prevalencia", t: "Prevalência %", tipo: "pct" }, { k: "ic", t: "IC 95%" }, { k: "prevalencia_patogenico", t: "Só patogênicos %", tipo: "pct" }];
    const tm = m.territorio_municipio, tb = m.territorio_bairro;
    const pequenos = tb.filter((r) => r.n_pacientes < 10).length;
    h += `<div class="pj-abas simples" role="tablist" data-grupo="terr">` +
      `<button class="pj-aba" role="tab" aria-selected="true" data-aba="terr-mun">Por município</button>` +
      `<button class="pj-aba" role="tab" aria-selected="false" data-aba="terr-bai">Por bairro</button></div>` +
      `<div data-painel="terr-mun" data-grupo="terr">${tm.length ? tabela(colsT("municipio"), comIC(tm)) : info("Nenhum paciente com município preenchido.")}</div>` +
      `<div data-painel="terr-bai" data-grupo="terr" hidden>${tb.length ? tabela(colsT("bairro"), comIC(tb)) +
        (pequenos ? `<div class="pj-legenda">${pequenos} bairro(s) com menos de 10 pacientes: a prevalência desses bairros é pouco precisa (veja a largura do IC95%).</div>` : "")
        : info("Nenhum paciente com bairro preenchido.")}</div>`;
    const av = [];
    if (m.territorio_sem_bairro) av.push(`${m.territorio_sem_bairro} paciente(s) sem bairro preenchido ficaram fora da tabela por bairro`);
    if (m.territorio_sem_municipio) av.push(`${m.territorio_sem_municipio} sem município ficaram fora da tabela por município`);
    const inc = m.territorio_inconsistentes;
    if (inc.length) {
      av.push(`${inc.length} paciente(s) com bairro/município diferentes entre as coletas — foi usado o da primeira linha (${inc.slice(0, 10).join(", ")}${inc.length > 10 ? "…" : ""})`);
    }
    if (av.length) h += `<div class="pj-legenda">Atenção: ${esc(av.join("; "))}.</div>`;
    h += `<div style="margin-top:14px"><label class="pj-toggle" data-dica="Mapa de prevalência por município ou bairro de residência, no padrão cartográfico (para artigo) e interativo. Opcional.">` +
      `<input type="checkbox" id="mapa-on"> ${icones.mapa()} Gerar mapa</label></div><div id="painel-mapa"></div></div>`;
  }
  return h;
}

function abaEspecies(m) {
  const fec = m.metodos_ativos.filter((x) => x[3] === "fecal").map((x) => x[1]);
  const lam = m.metodos_ativos.filter((x) => x[3] === "lamina").map((x) => x[1]);
  const fc = m.fecal_conclusivo, lc = m.lamina_conclusivo;
  let h = `<div class="pj-secao">` + blocoDominio(
    "Amostras de fezes — todos os parasitos x somente patogênicos",
    `Métodos de fezes: ${fec.join(", ") || "—"}. Base: pacientes com resultado conclusivo nas fezes; um paciente conta uma vez por espécie, mesmo que ela tenha aparecido em mais de uma coleta ou método. Achados da lâmina não entram aqui.`,
    m.especies_resumo, fc.length, fc.filter((r) => r.positivo_fecal).length, m.prev_fecal, [m.prev_fecal_ic95_inf, m.prev_fecal_ic95_sup],
    m.n_fecal_patogenico, m.prev_fecal_patogenico, [m.prev_fecal_patogenico_ic95_inf, m.prev_fecal_patogenico_ic95_sup], fec.length > 0) + `</div>`;
  h += `<div class="pj-secao">` + blocoDominio(
    `Lâmina (${lam.join(" / ") || "Graham"}) — todos os parasitos x somente patogênicos`,
    "Base: pacientes com resultado conclusivo na lâmina (fita/swab perianal). Analisada separadamente das fezes, porque a lâmina pesquisa um conjunto diferente de parasitos (tipicamente Enterobius vermicularis).",
    m.especies_lamina_resumo, lc.length, lc.filter((r) => r.positivo_lamina).length, m.prev_lamina, [m.prev_lamina_ic95_inf, m.prev_lamina_ic95_sup],
    m.n_lamina_patogenico, m.prev_lamina_patogenico, [m.prev_lamina_patogenico_ic95_inf, m.prev_lamina_patogenico_ic95_sup], lam.length > 0) + `</div>`;

  // mono x poli
  h += `<div class="pj-secao">${secaoTitulo("Mono x poliparasitismo", "Base: espécies de origem fecal.")}<div class="pj-cols c23"><div>` +
    grafico((w) => rosca([{ rotulo: "Negativo", valor: m.neg, cor: COR.SALVIA }, { rotulo: "Monoparasitismo", valor: m.mono, cor: COR.FOLHA },
      { rotulo: "Poliparasitismo", valor: m.poli, cor: COR.COBRE }], { largura: Math.min(w, 460), altura: 240 })) +
    `</div><div>${subTitulo("Combinações mais frequentes")}` +
    (m.combos_resumo.length ? tabela([{ k: "combinacao", t: "Combinação", quebra: true }, { k: "n", t: "Pacientes", tipo: "int" }], m.combos_resumo, { altura: 300 })
      : info("Nenhuma coinfecção registrada.")) + `</div></div></div>`;

  // método x espécie
  h += `<div class="pj-secao">` + subTitulo("Prevalência por método diagnóstico e espécie",
    "Cada célula mostra a prevalência (%) daquela espécie especificamente pelo método indicado, com denominador = pacientes com resultado conclusivo NAQUELE método. Uma mesma espécie pode aparecer em mais de um método fecal (ex.: um ovo de helminto pode ser visto tanto no HPJ quanto no Willis). Colunas mostram só os métodos presentes nesta planilha.");
  if (m.metodo_especie_resumo.length && m.metodos_ativos_nomes.length) {
    h += tabela([{ k: "especie", t: "Espécie" }, ...m.metodos_ativos_nomes.map((nm, i) => ({ k: `m${i}`, t: nm, tipo: "pct" }))], pivotMetodoEspecie(m));
    h += expansivel("Ver com intervalos de confiança (IC95%, Wilson)", tabela([
      { k: "metodo", t: "Método" }, { k: "especie", t: "Espécie" }, { k: "n", t: "N", tipo: "int" },
      { k: "prevalencia", t: "Prevalência %", tipo: "pct" }, { k: "categoria", t: "Categoria", tipo: "cat" }, { k: "ic", t: "IC 95%" }],
    comIC(m.metodo_especie_resumo)));
  } else h += info("Nenhum dado suficiente para o cruzamento método x espécie.");
  h += `</div>`;

  // visão unificada
  const leg = "Reúne, num só gráfico, as espécies encontradas por métodos fecais e por métodos de lâmina presentes nesta planilha. As bases de cálculo diferem por domínio — a tabela ao lado do gráfico mostra o denominador (Base N) e o(s) método(s) que detectou(aram) cada espécie. Quando a mesma espécie foi encontrada em métodos de domínios diferentes (ex.: Enterobius vermicularis, tipicamente por um método de lâmina, mas ocasionalmente também visível num método fecal), ela aparece numa única linha \"Fecal + Lâmina\" — o cálculo é feito por paciente, então quem foi detectado por mais de um método conta uma vez só, não duas.";
  const corpo = secaoTitulo("Prevalência de todos os parasitos", leg) + `<div class="pj-cols c32"><div>` +
    (m.todos_parasitos_resumo.length ? grafico((w) => graficoTodos(m.todos_parasitos_resumo, { largura: w })) : info("Nenhum parasito detectado nesta base.")) +
    `</div><div>` + tabela([
    { k: "especie", t: "Espécie" }, { k: "categoria", t: "Categoria", tipo: "cat" }, { k: "dominio", t: "Amostra" }, { k: "n", t: "N", tipo: "int" },
    { k: "prevalencia", t: "Prevalência %", tipo: "pct" }, { k: "base_n", t: "Base N", tipo: "int" }, { k: "metodos", t: "Método(s)" }, { k: "ic", t: "IC 95%" }],
  comIC(m.todos_parasitos_resumo)) + `<div class="pj-legenda">IC95% pelo método de Wilson, calculado sobre o denominador (Base N) de cada espécie.</div></div></div>`;
  h += expansivel("Visão unificada — fezes e lâmina num só gráfico", corpo);
  return h;
}

export function pivotMetodoEspecie(m) {
  const nomes = m.metodos_ativos_nomes;
  const porEsp = new Map();
  for (const r of m.metodo_especie_resumo) {
    if (!porEsp.has(r.especie)) porEsp.set(r.especie, {});
    const o = porEsp.get(r.especie);
    if (!(r.metodo in o)) o[r.metodo] = r.prevalencia; // aggfunc="first"
  }
  return [...porEsp.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((e) => {
    const o = { especie: e };
    nomes.forEach((nm, i) => { o[`m${i}`] = nm in porEsp.get(e) ? porEsp.get(e)[nm] : null; });
    return o;
  });
}

function abaMetodos(m) {
  let h = `<div class="pj-secao">` + secaoTitulo("Comparação entre métodos diagnósticos",
    "Denominador = pacientes com resultado conclusivo naquele método específico (exclui quem teve só 'Amostra insuficiente' ou 'Não realizado' nesse método). Lista só os métodos presentes nesta planilha.");
  h += `<div class="pj-cols c32"><div>`;
  if (m.metodos_resumo.length) {
    const paineis = [];
    for (const [titulo, cor] of [["Pote de fezes", COR.FOLHA], ["Lâmina", COR.COBRE]]) {
      const b = m.metodos_resumo.filter((r) => r.amostra_biologica === titulo);
      if (b.length) {
        paineis.push({ titulo, cor, barras: b.map((r) => ({ rotulo: r.metodo, valor: r.prevalencia, texto: `${r.prevalencia.toFixed(1)}%`,
          dica: `${r.metodo} (${titulo})\nPrevalência: ${r.prevalencia.toFixed(1)}%\n${r.n_pacientes_positivas} de ${r.n_pacientes_testaveis} testáveis\nIC 95%: ${textoIC(r, "–")}` })) });
      }
    }
    h += grafico((w) => colunas(paineis, { largura: w, altura: 320, tituloY: "Prevalência (%)",
      ymax: Math.max(10, Math.min(110, Math.max(...m.metodos_resumo.map((r) => r.prevalencia)) * 1.2)) }));
  } else h += info("Nenhum método detectado nesta planilha.");
  h += `</div><div>` + tabela([
    { k: "metodo", t: "Método" }, { k: "amostra_biologica", t: "Amostra" }, { k: "n_pacientes_testaveis", t: "Testáveis", tipo: "int" },
    { k: "n_pacientes_positivas", t: "Positivas", tipo: "int" }, { k: "n_pacientes_inconclusivas", t: "Inconclusivas", tipo: "int" },
    { k: "prevalencia", t: "Prevalência %", tipo: "pct" }, { k: "ic", t: "IC 95%" }], comIC(m.metodos_resumo)) +
    `<div class="pj-legenda">IC95% pelo método de Wilson.</div></div></div></div>`;

  // McNemar
  h += `<div class="pj-secao">` + subTitulo("HPJ x Willis — teste de McNemar",
    "Compara os dois métodos aplicados à MESMA amostra de fezes da mesma criança (dados pareados) — testa se um método detecta mais positivos que o outro, usando só os pacientes em que os dois métodos discordaram entre si. Só calculado quando a planilha traz os dois métodos.");
  const mc = m.mcnemar_hpj_willis;
  if (mc.n_pareado === 0 || !mc.tabela) {
    h += info("Sem pacientes com resultado conclusivo em HPJ e Willis simultaneamente (ou um dos dois métodos não está presente nesta planilha) — teste não calculado.");
  } else {
    const tb = mc.tabela;
    const rot = { exato: "teste exato (< 25 discordâncias)", chi2_corrigido: "qui-quadrado com correção de continuidade",
      sem_discordancia: "sem discordâncias — nada a testar" }[mc.metodo] || mc.metodo;
    h += `<div class="pj-cols c23"><div>` + tabela([{ k: "r", t: "" }, { k: "a", t: "Willis +", tipo: "int" }, { k: "b", t: "Willis −", tipo: "int" }],
      [{ r: "HPJ +", a: tb.pp, b: tb.pn }, { r: "HPJ −", a: tb.np, b: tb.nn }], { ordenavel: false }) + `</div><div>` +
      metrica("p-valor (McNemar)", mc.p_valor !== null ? mc.p_valor.toFixed(4) : "—",
        `n pareado = ${mc.n_pareado} · ${tb.pn + tb.np} discordância(s) (${tb.pn} HPJ+/Willis−, ${tb.np} HPJ−/Willis+) · ${rot}.`) +
      (mc.p_valor !== null ? `<div class="pj-legenda">${mc.p_valor < 0.05 ? "p < 0,05 — diferença estatisticamente significativa entre os métodos nesta amostra." : "p ≥ 0,05 — sem evidência estatística de diferença entre os métodos nesta amostra."}</div>` : "") +
      `</div></div>`;
  }
  h += `</div>`;

  // nº de potes
  h += `<div class="pj-secao">` + secaoTitulo("Efeito do número de potes de fezes entregues",
    "Usa somente positividade fecal (qualquer método fecal presente na planilha). Compara SUBGRUPOS diferentes de pacientes (quem entregou 1, 2 ou 3 potes), o que pode ter viés de seleção — veja a curva cumulativa abaixo, calculada no mesmo grupo de pacientes, para uma estimativa sem esse viés.");
  if (m.efeito_n_coletas.length) {
    h += grafico((w) => colunas([{ cor: COR.MATA, barras: m.efeito_n_coletas.map((r) => ({ rotulo: String(r.n_potes_entregues), valor: r.prevalencia,
      texto: `n=${r.n_pacientes}`, dica: `${r.n_potes_entregues} pote(s) entregue(s)\nPrevalência: ${r.prevalencia.toFixed(1)}%\n${r.n_positivos} de ${r.n_pacientes} pacientes` })) }],
    { largura: Math.min(w, 760), altura: 300, tituloY: "Prevalência (%)", tituloX: "Nº de potes entregues",
      ymax: Math.max(10, Math.min(110, Math.max(...m.efeito_n_coletas.map((r) => r.prevalencia)) * 1.2)) }));
  } else h += info("Dados insuficientes para este gráfico.");
  const ca = m.cochran_armitage_efeito_coletas;
  if (ca.p_valor !== null) {
    h += `<div class="pj-legenda">Teste de tendência de Cochran-Armitage: Z = ${ca.estatistica_z.toFixed(3)}, p = ${ca.p_valor.toFixed(4)} (${ca.n_grupos} grupos). ${esc(ca.aviso)}</div>`;
  } else if (ca.n_grupos && ca.n_grupos >= 2) {
    h += `<div class="pj-legenda">Teste de tendência de Cochran-Armitage não calculável nesta base. ${esc(ca.aviso)}</div>`;
  }
  h += `</div>`;

  // curva cumulativa
  h += `<div class="pj-secao">${secaoTitulo("Ganho marginal por amostra — curva cumulativa")}`;
  const cum = m.fecal_cumulativa;
  if (cum.length) {
    const kMax = Math.max(...cum.map((r) => r.k));
    h += `<div class="pj-legenda">Mesmo grupo de ${cum[0].n_pacientes} paciente(s) que entregou o número máximo de potes observado no estudo (${kMax}), medindo quantas ficariam positivas se o laboratório parasse na 1ª, 2ª ... até a última coleta. Como é a mesma paciente sendo acompanhado (medida repetida), este gráfico não sofre o viés de comparar subgrupos diferentes de crianças.</div>`;
    h += grafico((w) => linha(cum.map((r) => ({ x: r.k, y: r.prevalencia_cumulativa, texto: `${r.prevalencia_cumulativa.toFixed(1)}%`,
      dica: `Até a ${r.k}ª coleta\nPrevalência cumulativa: ${r.prevalencia_cumulativa.toFixed(1)}%\nn = ${r.n_pacientes}` })),
    { largura: Math.min(w, 760), altura: 300, tituloX: "Nº de potes considerados (cumulativo)", tituloY: "Prevalência cumulativa (%)",
      ymax: Math.max(10, Math.min(110, Math.max(...cum.map((r) => r.prevalencia_cumulativa)) * 1.2)) }));
  } else h += info("Dados insuficientes para a curva cumulativa (nenhum paciente com coletas identificadas por P1/P2/P3).");
  return h + `</div>`;
}

function abaBase(m) {
  const linhas = [...m.por_paciente].sort((a, b) => (a.id_paciente < b.id_paciente ? -1 : a.id_paciente > b.id_paciente ? 1 : 0));
  return `<div class="pj-secao">${secaoTitulo("Base completa por criança")}` + tabela([
    { k: "id_paciente", t: "Paciente" }, { k: "nome_paciente", t: "Nome" }, { k: "categoria_amostragem", t: "Amostragem" },
    { k: "n_coletas_pote_entregue", t: "Potes", tipo: "int" }, { k: "n_coletas_lamina_entregue", t: "Lâminas", tipo: "int" },
    { k: "fecal_status", t: "Fezes", tipo: "status" }, { k: "lamina_status", t: "Lâmina", tipo: "status" },
    { k: "positivo_algum_metodo", t: "Positivo", tipo: "bool" }, { k: "tem_patogenico", t: "Patogênico", tipo: "bool" },
    { k: "especies_str", t: "Espécies", tipo: "txt", quebra: true }], linhas, { altura: 520 }) + `</div>`;
}

function abaExportar() {
  return `<div class="pj-secao">${secaoTitulo("Baixe os relatórios completos")}` +
    `<p class="pj-texto">O Excel traz todas as tabelas em abas separadas, prontas para uso em outras análises. O PDF traz um relatório formatado, pronto para impressão ou envio.</p>` +
    `<div class="pj-btns"><button class="pj-btn" type="button" data-acao="baixar-excel">${icones.baixar("#F4F1EA", "#F4F1EA")} Baixar relatório em Excel</button>` +
    `<button class="pj-btn" type="button" data-acao="baixar-pdf">${icones.baixar("#F4F1EA", "#F4F1EA")} Baixar relatório em PDF</button></div>` +
    `<div class="pj-legenda" id="nota-mapa-pdf" style="margin-top:10px"></div></div>`;
}

// ---------------------------------------------------------------- passo 04 inteiro
export function renderRelatorio(m) {
  const nomes = m.metodos_ativos_nomes;
  let h = `<section class="pj-passo" id="passo-4"><div class="pj-step"><div class="badge">4</div><h2>Relatório da análise</h2></div>` +
    `<div class="pj-legenda">${m.total} pacientes ${m.criterios.length ? "incluídos" : "cadastrados"} · ${m.fecal.length} com amostra fecal entregue · ` +
    `${m.apenas_lamina.length} só com lâmina · métodos: ${esc(nomes.join(", "))}.</div>`;
  if (m.criterios.length) {
    const exc = m.excluidos_criterios;
    h += `<div class="pj-note"><strong>Critérios de inclusão:</strong> ${esc(m.criterios.join("; "))}. Entraram na análise <strong>${m.total}</strong> ` +
      `de ${m.total_antes_criterios} pacientes; <strong>${exc.length}</strong> foram excluídos de todas as contas.</div>`;
    if (exc.length) {
      h += expansivel(`Ver os ${exc.length} pacientes excluídos e o motivo`,
        tabela([{ k: "id_paciente", t: "Paciente" }, { k: "nome_paciente", t: "Nome" }, { k: "motivo", t: "Motivo da exclusão", quebra: true }], exc));
    }
  }
  const abas = [["geral", "Visão geral", icones.visao()], ["especies", "Espécies & parasitos", icones.parasito()],
    ["metodos", "Métodos & amostragem", icones.microscopio()], ["base", "Base por paciente", icones.paciente()], ["exportar", "Exportar", icones.baixar()]];
  h += `<div class="pj-abas" role="tablist" data-grupo="rel">` + abas.map(([id, t, ic], i) =>
    `<button class="pj-aba" role="tab" aria-selected="${i === 0}" data-aba="rel-${id}">${ic}${esc(t)}</button>`).join("") + `</div>`;
  const conteudo = { geral: abaGeral(m), especies: abaEspecies(m), metodos: abaMetodos(m), base: abaBase(m), exportar: abaExportar() };
  h += abas.map(([id], i) => `<div data-painel="rel-${id}" data-grupo="rel"${i ? " hidden" : ""}>${conteudo[id]}</div>`).join("");
  return h + `</section>`;
}
