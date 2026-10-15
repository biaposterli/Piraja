// Relatório em PDF (pdfmake) — mesmas seções e textos de report_pdf.py, com
// as fontes da identidade (Fraunces e Instrument Sans) embutidas e os
// gráficos em vetor (os mesmos SVG da tela).

import { carregarScript } from "./tabela.js";
import { COR, graficoEspecies, graficoTodos, colunas, rosca, linha } from "./graficos.js";
import { pivotMetodoEspecie, npRound1 } from "./relatorio.js";
import { agoraTexto, LOGO_PNG } from "./planilhas.js";
import { CATEGORIAS_AMOSTRAGEM } from "./engine.js";

const MM = 72 / 25.4;
const INK = "#1B2421", INK_SOFT = "#4E5B55", INK_FAINT = "#7A857F", TEAL = "#328567", TEAL_DARK = "#11483D";
const BRICK_TINT = "#F3E4DB", SAGE = "#A9C3B8", LINE = "#DCD6C8";

const FONTES = {
  "InstrumentSans-Regular.ttf": "brand/fonts/InstrumentSans-Regular.ttf",
  "InstrumentSans-SemiBold.ttf": "brand/fonts/InstrumentSans-SemiBold.ttf",
  "Fraunces-Regular.ttf": "brand/fonts/Fraunces-Regular.ttf",
  "Fraunces-SemiBold.ttf": "brand/fonts/Fraunces-SemiBold.ttf",
};

async function binario(caminho) {
  if (globalThis.__pjLerArquivo) return globalThis.__pjLerArquivo(caminho);
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`não foi possível carregar ${caminho}`);
  return new Uint8Array(await r.arrayBuffer());
}

function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

let _pdfMake = null;
async function prepararPdfMake() {
  if (_pdfMake) return _pdfMake;
  if (!globalThis.pdfMake) await carregarScript("vendor/pdfmake.min.js");
  const vfs = {};
  for (const [nome, caminho] of Object.entries(FONTES)) vfs[nome] = base64(await binario(caminho));
  _pdfMake = { pdfMake: globalThis.pdfMake, vfs };
  return _pdfMake;
}

const FONTS = {
  InstrumentSans: { normal: "InstrumentSans-Regular.ttf", bold: "InstrumentSans-SemiBold.ttf",
    italics: "InstrumentSans-Regular.ttf", bolditalics: "InstrumentSans-SemiBold.ttf" },
  Fraunces: { normal: "Fraunces-Regular.ttf", bold: "Fraunces-SemiBold.ttf",
    italics: "Fraunces-Regular.ttf", bolditalics: "Fraunces-SemiBold.ttf" },
};

// ---------------------------------------------------------------- blocos
const P = (texto, estilo = "body", extra = {}) => ({ text: texto, style: estilo, ...extra });
const h2 = (t, extra = {}) => ({ text: t, style: "h2", ...extra });
const h3 = (t) => ({ text: t, style: "h3" });
const esp = (mm) => ({ text: "", margin: [0, 0, 0, mm * MM] });

function nota(conteudo) {
  return {
    table: { widths: ["*"], body: [[{ text: conteudo, style: "note" }]] },
    layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => "#9C4A2F",
      fillColor: () => BRICK_TINT, paddingLeft: () => 10, paddingRight: () => 8, paddingTop: () => 7, paddingBottom: () => 7 },
    margin: [0, 2, 0, 4],
  };
}

function regua(espessura, cor) {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: 174 * MM, y2: 0, lineWidth: espessura, lineColor: cor }], margin: [0, 0, 0, 0] };
}

/** Tabela no estilo do relatório (cabeçalho cinza, filete salvia, linhas finas). */
function tabelaPdf(cabecalho, linhas, larguras, o = {}) {
  if (!linhas.length) return P("Sem dados.");
  const fs = o.fonte || 8;
  const hp = o.padding ?? 6;
  return {
    table: {
      headerRows: 1, widths: larguras.map((w) => (w === "*" ? "*" : w * MM)), dontBreakRows: true,
      body: [cabecalho.map((t) => ({ text: t, bold: true, color: INK_FAINT, fontSize: fs })),
        ...linhas.map((l) => l.map((v) => ({ text: v === null || v === undefined ? "None" : String(v), color: INK, fontSize: fs })))],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : i === 1 ? 0.9 : 0.4),
      hLineColor: (i) => (i === 1 ? SAGE : LINE), vLineWidth: () => 0,
      paddingLeft: () => hp, paddingRight: () => hp, paddingTop: () => 4, paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 2],
  };
}

const svgNo = (svg, larguraMm) => ({ svg, width: larguraMm * MM, font: "InstrumentSans" });

function icTexto(inf, sup) {
  if (inf === null || inf === undefined || sup === null || sup === undefined) return "—";
  return `${inf.toFixed(1)}–${sup.toFixed(1)}%`;
}
const prevTxt = (prev, n) => (n ? `${prev.toFixed(1)}%` : "—");
function baseTxt(pos, n, temMetodo, dominio) {
  if (!temMetodo) return `Não avaliado: nenhum método de ${dominio} nesta planilha`;
  if (!n) return "Não avaliado: nenhum resultado conclusivo";
  return `${pos} de ${n} pacientes (conclusivas)`;
}
/** str(float) do Python para os números de 1 casa ("22.4", "0.0"). */
const pyF = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));

// ---------------------------------------------------------------- gráficos (equivalentes aos de matplotlib)
const OPCOES_PDF = { fundo: "#FFFFFF", fonte: 11 };

function chartEspecies(d, titulo, larguraMm) {
  if (!d.length) return null;
  const w = larguraMm * MM * 1.35;
  return svgNo(graficoEspecies(d, { ...OPCOES_PDF, largura: w, titulo, semLegenda: true, passo: 26, alturaBarra: 17 }), larguraMm);
}

// ---------------------------------------------------------------- seções
function statTable(m) {
  const dom = new Set(m.metodos_ativos.map((x) => x[3]));
  const nF = m.fecal_conclusivo.length, nL = m.lamina_conclusivo.length, nC = m.combinada_base.length;
  const cel = (rot, prev, n, inf, sup, base) => ({
    stack: [
      { text: rot, bold: true, fontSize: 7.5, color: INK_FAINT },
      { text: prevTxt(prev, n), font: "Fraunces", bold: true, fontSize: 20, color: TEAL_DARK, margin: [0, 8, 0, 6] },
      ...(n ? [{ text: `IC95% ${icTexto(inf, sup)}`, fontSize: 8, color: TEAL, margin: [0, 0, 0, 6] }] : [{ text: " ", fontSize: 8, margin: [0, 0, 0, 6] }]),
      { text: base, fontSize: 8, color: INK_FAINT },
    ],
  });
  return {
    table: {
      widths: [56 * MM, 56 * MM, 56 * MM],
      body: [[
        cel("PREVALÊNCIA — AMOSTRA FECAL", m.prev_fecal, nF, m.prev_fecal_ic95_inf, m.prev_fecal_ic95_sup,
          baseTxt(m.fecal_conclusivo.filter((r) => r.positivo_fecal).length, nF, dom.has("fecal"), "fezes")),
        cel("PREVALÊNCIA — LÂMINA (TODOS)", m.prev_lamina, nL, m.prev_lamina_ic95_inf, m.prev_lamina_ic95_sup,
          baseTxt(m.lamina_conclusivo.filter((r) => r.positivo_lamina).length, nL, dom.has("lamina"), "lâmina")),
        cel("PREVALÊNCIA COMBINADA", m.prev_combinada, nC, m.prev_combinada_ic95_inf, m.prev_combinada_ic95_sup,
          baseTxt(m.combinada_base.filter((r) => r.positivo_algum_metodo).length, nC, true, "")),
      ]],
    },
    layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => LINE, vLineColor: () => LINE,
      paddingLeft: () => 10, paddingRight: () => 8, paddingTop: () => 8, paddingBottom: () => 8 },
  };
}

function resumoConfig(m) {
  const cfg = m.config;
  if (!cfg) return null;
  const fezes = m.metodos_ativos.filter((x) => x[3] === "fecal").map((x) => x[1]);
  const lamina = m.metodos_ativos.filter((x) => x[3] === "lamina").map((x) => x[1]);
  const ord = (a) => [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const pat = ord([...cfg.categorias].filter(([, c]) => c === "Patogênico").map(([e]) => e));
  const com = ord([...cfg.categorias].filter(([, c]) => c === "Comensal").map(([e]) => e));
  const partes = [
    [{ text: "Métodos de fezes:", bold: true }, ` ${fezes.join(", ") || "—"}`],
    [{ text: "Métodos de lâmina:", bold: true }, ` ${lamina.join(", ") || "—"}`],
    [{ text: "Amostras por paciente:", bold: true }, cfg.n_amostras ? ` até P${cfg.n_amostras}` : " todas"],
    [{ text: "Patogênicos:", bold: true }, ` ${pat.join(", ") || "—"}`],
    [{ text: "Comensais:", bold: true }, ` ${com.join(", ") || "—"}`],
  ];
  if (cfg.excluidos.size) partes.push([{ text: "Excluídos da análise:", bold: true }, ` ${ord(cfg.excluidos).join(", ")}`]);
  const out = [{ text: "Configuração da análise", bold: true }, " · "];
  partes.forEach((p, i) => { if (i) out.push(" · "); out.push(...p); });
  return out;
}

function secaoDominio(cont, titulo, espDf, nBase, nPos, prev, ic, nPat, prevPat, icPat, temMetodo) {
  cont.push(h2(titulo));
  if (!temMetodo) { cont.push(P("Nenhum método deste tipo de amostra foi incluído na análise.")); return; }
  if (!nBase) { cont.push(P("Nenhum resultado conclusivo neste tipo de amostra.")); return; }
  cont.push(P([{ text: "Todos os parasitos:", bold: true }, ` ${prev.toFixed(1)}% (${nPos} de ${nBase}; IC95% ${icTexto(...ic)}) · `,
    { text: "Somente patogênicos:", bold: true }, ` ${prevPat.toFixed(1)}% (${nPat} de ${nBase}; IC95% ${icTexto(...icPat)}). `,
    "Base: pacientes com resultado conclusivo neste tipo de amostra."]));
  cont.push(esp(2));
  const tudo = chartEspecies(espDf, "Todos os parasitos", 84);
  const pat = chartEspecies(espDf.filter((r) => r.categoria === "Patogênico"), "Somente patogênicos", 84);
  cont.push({ columns: [tudo || P("Nenhum parasito detectado.", "small"), pat || P("Nenhum parasito patogênico detectado.", "small")], columnGap: 6 * MM });
  if (espDf.length) {
    cont.push(esp(2));
    cont.push(tabelaPdf(["Espécie", "N", "Prevalência %", "Categoria", "IC 95%"],
      espDf.map((r) => [r.especie, r.n, pyF(r.prevalencia), r.categoria, icTexto(r.ic95_inf, r.ic95_sup)]), [52, 16, 24, 26, 26]));
  }
}

// ---------------------------------------------------------------- documento
export async function gerarPdf(m, { mapa = null } = {}) {
  const { pdfMake, vfs } = await prepararPdfMake();
  let logo = null;
  try { logo = "data:image/png;base64," + base64(await binario(LOGO_PNG)); } catch { logo = null; }
  const nomes = m.metodos_ativos_nomes.length ? m.metodos_ativos_nomes : m.metodos_resumo.map((r) => r.metodo);
  const c = [];

  // cabeçalho: assinatura Pirajá · Entero + filete verde-mata
  c.push({
    columns: [
      logo ? { image: logo, width: 44 * MM } : { text: "Pirajá", style: "title" },
      { stack: [{ text: "Relatório de análise epidemiológica", style: "meta" }, { text: `Gerado em ${agoraTexto()}`, style: "meta" }],
        alignment: "right", margin: [0, 18, 0, 0] },
    ],
  });
  c.push(esp(3), regua(1.4, TEAL_DARK), esp(5));
  c.push({ text: "Relatório de análise epidemiológica", style: "title" }, esp(3));
  c.push(P(`${m.total} pacientes ${m.criterios.length ? "incluídos" : "cadastrados"} · ${m.fecal.length} com amostra fecal entregue · ` +
    `${m.apenas_lamina.length} só com lâmina · métodos analisados: ${nomes.length ? nomes.join(", ") : "—"}.`));
  const rc = resumoConfig(m);
  if (rc) c.push(esp(2), P(rc, "small"));
  c.push(esp(4));

  if (m.criterios.length) {
    const nExc = m.excluidos_criterios.length;
    c.push(nota([{ text: "Critérios de inclusão:", bold: true }, ` ${m.criterios.join("; ")}. Entraram na análise ${m.total} de ` +
      `${m.total_antes_criterios} pacientes; ${nExc} foram excluídos de todas as contas (lista com o motivo no relatório em Excel, aba Pacientes_Excluidos).`]));
    c.push(esp(3));
  }

  c.push(statTable(m), esp(3));
  if (m.fecal_inconclusivo.length + m.lamina_inconclusivo.length > 0) {
    const nl = m.lamina_inconclusivo.length;
    c.push(nota([{ text: "Amostras inconclusivas:", bold: true }, ` ${m.fecal_inconclusivo.length} criança(s) com pote de fezes entregue tiveram ` +
      'todos os métodos fecais marcados como "Amostra insuficiente" (ou sem resultado registrado)' +
      (nl ? `; ${nl} paciente(s) com lâmina entregue na mesma situação` : "") +
      ". Esses pacientes foram excluídos dos denominadores de prevalência — não contam como negativas."]));
    c.push(esp(2));
  }
  if (m.apenas_lamina.length > 0) {
    c.push(nota([{ text: "Atenção:", bold: true }, ` ${m.apenas_lamina.length} paciente(s) só entregaram a lâmina, nunca o pote de fezes — para eles, apenas ` +
      "o(s) método(s) de lâmina pôde(puderam) ser pesquisado(s). Os resultados desse subgrupo já estão incluídos na prevalência de lâmina " +
      "do resumo acima (que soma todos os pacientes com resultado conclusivo de lâmina, tenham entregado só lâmina ou fezes e lâmina); " +
      `isoladamente, a prevalência só neste subgrupo é de ${m.prev_lamina_only.toFixed(1)}% (${m.lamina_only_conclusivo.filter((r) => r.positivo_lamina).length} ` +
      `de ${m.lamina_only_conclusivo.length} pacientes conclusivos).`]));
  }

  // fezes x lâmina, todos x somente patogênicos
  const dom = new Set(m.metodos_ativos.map((x) => x[3]));
  const lamNomes = m.metodos_ativos.filter((x) => x[3] === "lamina").map((x) => x[1]);
  const fc = m.fecal_conclusivo, lc = m.lamina_conclusivo;
  secaoDominio(c, "Parasitos em amostras de fezes — todos x somente patogênicos", m.especies_resumo, fc.length,
    fc.filter((r) => r.positivo_fecal).length, m.prev_fecal, [m.prev_fecal_ic95_inf, m.prev_fecal_ic95_sup],
    m.n_fecal_patogenico, m.prev_fecal_patogenico, [m.prev_fecal_patogenico_ic95_inf, m.prev_fecal_patogenico_ic95_sup], dom.has("fecal"));
  secaoDominio(c, `Parasitos na lâmina (${lamNomes.join(" / ") || "Graham"}) — todos x somente patogênicos`, m.especies_lamina_resumo, lc.length,
    lc.filter((r) => r.positivo_lamina).length, m.prev_lamina, [m.prev_lamina_ic95_inf, m.prev_lamina_ic95_sup],
    m.n_lamina_patogenico, m.prev_lamina_patogenico, [m.prev_lamina_patogenico_ic95_inf, m.prev_lamina_patogenico_ic95_sup], dom.has("lamina"));

  // profundidade de amostragem
  c.push(h2("Pacientes por profundidade de amostragem"));
  c.push(tabelaPdf(["Categoria", "Nº crianças", "%"], CATEGORIAS_AMOSTRAGEM.map((k) => {
    return [k, m.cat_counts[k], pyF(npRound1(100 * m.cat_counts[k] / m.total))];
  }), [80, 35, 25]));

  // território
  if (m.tem_territorio) {
    c.push(h2("Prevalência por território (moradia)"));
    c.push(P("Pacientes com resultado conclusivo, agrupados pelo bairro e município onde moram. Positivo = qualquer parasito em qualquer tipo de amostra (mesma base da prevalência combinada)."));
    c.push(esp(2));
    for (const [chave, nivel, cols, larg] of [["territorio_municipio", "município", ["municipio", "uf"], [62, 14]],
      ["territorio_bairro", "bairro", ["bairro", "municipio", "uf"], [44, 34, 12]]]) {
      const d = m[chave];
      if (!d.length) continue;
      const rot = { bairro: "Bairro", municipio: "Município", uf: "UF" };
      c.push(h3(`Por ${nivel}`));
      c.push(tabelaPdf([...cols.map((x) => rot[x]), "Pacientes", "Positivos", "Prevalência %", "IC 95%"],
        d.map((r) => [...cols.map((x) => r[x]), r.n_pacientes, r.n_positivos, pyF(r.prevalencia), icTexto(r.ic95_inf, r.ic95_sup)]),
        [...larg, 18, 18, 22, 24]));
    }
    if (mapa) {
      c.push(esp(4));
      c.push({ stack: [h3("Mapa"), { image: mapa.dataUrl, width: 172 * MM }], unbreakable: true });
    }
  }

  // todos os parasitos
  c.push(h2("Prevalência de todos os parasitos"));
  c.push(P("Espécies fecais e achados de lâmina, reunidos num só gráfico. As bases de cálculo diferem por domínio (ver coluna \"Base N\" na tabela abaixo). " +
    "Quando a mesma espécie foi encontrada em métodos de domínios diferentes (ex.: Enterobius vermicularis, tipicamente por um método de lâmina, mas " +
    "ocasionalmente também visível num método fecal), ela aparece numa única linha \"Fecal + Lâmina\", com denominador e numerador calculados por " +
    "criança — quem foi detectado em mais de um método conta uma vez só, não duas.", "small"));
  c.push(esp(1.5));
  if (m.todos_parasitos_resumo.length) {
    c.push(svgNo(graficoTodos(m.todos_parasitos_resumo, { ...OPCOES_PDF, largura: 160 * MM * 1.3, comMetodos: true, passo: 26, alturaBarra: 17 }), 160), esp(2));
  }
  c.push(tabelaPdf(["Espécie", "Categoria", "Amostra", "N", "Prevalência %", "Base N", "Método(s)", "IC 95%"],
    m.todos_parasitos_resumo.map((r) => [r.especie, r.categoria, r.dominio, r.n, pyF(r.prevalencia), r.base_n, r.metodos, icTexto(r.ic95_inf, r.ic95_sup)]),
    [32, 18, 20, 10, 18, 14, 28, 20]));

  // método x espécie
  c.push(h2("Prevalência por método diagnóstico e espécie"));
  c.push(P("Cada valor é a prevalência (%) daquela espécie especificamente pelo método indicado; denominador = pacientes com resultado conclusivo naquele " +
    "método. Uma mesma espécie pode aparecer em mais de um método fecal. Colunas mostram só os métodos presentes nesta planilha.", "small"));
  c.push(esp(1.5));
  if (m.metodo_especie_resumo.length && nomes.length) {
    const piv = pivotMetodoEspecie(m);
    const nMet = Math.max(nomes.length, 1);
    const colEsp = nMet > 5 ? 44 : 50;
    const colMet = Math.min(25, (174 - colEsp) / nMet);
    const muitos = nMet > 5;
    c.push(tabelaPdf(["Espécie", ...nomes.map((x) => x.replaceAll("-", "-\n").replaceAll(" (", "\n("))],
      piv.map((r) => [r.especie, ...nomes.map((_, i) => (r[`m${i}`] === null ? "—" : pyF(r[`m${i}`])))]),
      [colEsp, ...nomes.map(() => colMet)], { fonte: muitos ? 7 : 8, padding: muitos ? 2 : 6 }));
    c.push(esp(2), P("Intervalos de confiança de 95% (Wilson) correspondentes a cada célula acima:", "small"), esp(1));
    c.push(tabelaPdf(["Método", "Espécie", "N", "Prevalência %", "Categoria", "IC 95%"],
      m.metodo_especie_resumo.map((r) => [r.metodo, r.especie, r.n, pyF(r.prevalencia), r.categoria, icTexto(r.ic95_inf, r.ic95_sup)]),
      [25, 40, 12, 22, 25, 26]));
  } else c.push(P("Sem dados suficientes para este cruzamento."));

  // espécies (fezes)
  c.push(h2("Prevalência por espécie — métodos fecais (base: fezes com resultado conclusivo)"));
  c.push(P("Cada espécie encontrada por algum método fecal presente nesta planilha, especificamente — inclusive Enterobius vermicularis, se algum " +
    "caso tiver sido identificado incidentalmente num método fecal (achado válido, não erro de digitação). A prevalência combinada dessa espécie " +
    "com métodos de lâmina, sem contar o mesmo paciente duas vezes, está no gráfico unificado acima.", "small"));
  c.push(esp(1.5));
  if (m.especies_resumo.length) {
    c.push(svgNo(graficoEspecies(m.especies_resumo, { ...OPCOES_PDF, largura: 160 * MM * 1.3, semLegenda: true, passo: 26, alturaBarra: 17 }), 160), esp(2));
  }
  c.push(tabelaPdf(["Espécie", "N", "Prevalência %", "Categoria", "IC 95%"],
    m.especies_resumo.map((r) => [r.especie, r.n, pyF(r.prevalencia), r.categoria, icTexto(r.ic95_inf, r.ic95_sup)]), [52, 16, 24, 24, 24]));

  // poliparasitismo
  c.push(h2("Mono x poliparasitismo (base: espécies de origem fecal)"));
  if (m.neg + m.mono + m.poli > 0) {
    c.push(svgNo(rosca([{ rotulo: "Negativo", valor: m.neg, cor: COR.SALVIA }, { rotulo: "Monoparasitismo", valor: m.mono, cor: COR.FOLHA },
      { rotulo: "Poliparasitismo", valor: m.poli, cor: COR.COBRE }], { ...OPCOES_PDF, largura: 420, altura: 220, furo: 0 }), 110), esp(2));
  }
  if (m.combos_resumo.length) {
    c.push(P("Combinações mais frequentes:"));
    c.push(tabelaPdf(["Combinação", "N"], m.combos_resumo.map((r) => [r.combinacao, r.n]), [110, 20]));
  }

  // comparação de métodos
  c.push(h2("Comparação entre métodos diagnósticos"));
  c.push(P('Denominador = pacientes com resultado conclusivo naquele método específico (exclui "Amostra insuficiente" e "Não realizado"). ' +
    "Lista os métodos efetivamente presentes nesta planilha.", "small"));
  c.push(esp(1.5));
  if (m.metodos_resumo.length) {
    c.push(svgNo(colunas([{ cor: COR.FOLHA, barras: m.metodos_resumo.map((r) => ({ rotulo: r.metodo, valor: r.prevalencia, texto: `${pyF(r.prevalencia)}%` })) }],
      { ...OPCOES_PDF, largura: 600, altura: 300, ymax: 105, tituloY: "Prevalência (%)", rotacionar: true }), 160), esp(2));
  }
  c.push(tabelaPdf(["Método", "Amostra", "Testáveis", "Positivas", "Inconclusivas", "Prevalência %", "IC 95%"],
    m.metodos_resumo.map((r) => [r.metodo, r.amostra_biologica, r.n_pacientes_testaveis, r.n_pacientes_positivas, r.n_pacientes_inconclusivas,
      pyF(r.prevalencia), icTexto(r.ic95_inf, r.ic95_sup)]), [24, 20, 16, 16, 18, 20, 22]));

  c.push(esp(3), h3("HPJ x Willis — teste de McNemar"));
  const mc = m.mcnemar_hpj_willis;
  if (mc.n_pareado === 0 || !mc.tabela) {
    c.push(P("Sem pacientes com resultado conclusivo em HPJ e Willis simultaneamente (ou um dos dois métodos não está presente nesta planilha) — teste não calculado."));
  } else {
    const tb = mc.tabela;
    c.push(P("Compara os dois métodos aplicados à mesma amostra de fezes da mesma criança (dados pareados), usando só os pacientes em que os dois métodos discordaram entre si.", "small"));
    c.push(esp(1.5), tabelaPdf(["", "Willis +", "Willis −"], [["HPJ +", tb.pp, tb.pn], ["HPJ −", tb.np, tb.nn]], [30, 30, 30]), esp(2));
    const rot = { exato: "teste exato (< 25 discordâncias)", chi2_corrigido: "qui-quadrado com correção de continuidade",
      sem_discordancia: "sem discordâncias — nada a testar" }[mc.metodo] || mc.metodo;
    c.push(P([`n pareado = ${mc.n_pareado} · ${tb.pn + tb.np} discordância(s) (${tb.pn} HPJ+/Willis−, ${tb.np} HPJ−/Willis+) · ${rot} · `,
      { text: `p-valor = ${mc.p_valor.toFixed(4)}`, bold: true }, "."]));
  }

  // nº de potes
  c.push(h2("Efeito do número de potes de fezes entregues"));
  c.push(P("Baseado apenas em positividade fecal. Compara subgrupos diferentes de crianças — pode ter viés de seleção; ver curva cumulativa abaixo para uma leitura sem esse viés.", "small"));
  c.push(esp(1.5));
  if (m.efeito_n_coletas.length) {
    c.push(svgNo(colunas([{ cor: COR.MATA, barras: m.efeito_n_coletas.map((r) => ({ rotulo: `${r.n_potes_entregues} pote(s)\nn=${r.n_pacientes}`,
      valor: r.prevalencia, texto: `${pyF(r.prevalencia)}%` })) }], { ...OPCOES_PDF, largura: 600, altura: 290, ymax: 105, tituloY: "Prevalência (%)" }), 160));
  }
  const ca = m.cochran_armitage_efeito_coletas;
  if (ca.p_valor !== null) {
    c.push(esp(1.5), P(`Teste de tendência de Cochran-Armitage: Z = ${ca.estatistica_z.toFixed(3)}, p-valor = ${ca.p_valor.toFixed(4)} (${ca.n_grupos} grupos). ${ca.aviso}`, "small"));
  }

  // curva cumulativa
  if (m.fecal_cumulativa.length) {
    c.push(h2("Ganho marginal por amostra — curva cumulativa"));
    c.push(P(`Mesmo grupo de ${m.fecal_cumulativa[0].n_pacientes} paciente(s) que entregou o número máximo de potes observado no estudo, medida repetida ` +
      "(1ª, 1ª+2ª ... coletas). Sem viés de comparar subgrupos diferentes de crianças.", "small"));
    c.push(esp(1.5));
    c.push(svgNo(linha(m.fecal_cumulativa.map((r) => ({ x: r.k, y: r.prevalencia_cumulativa, texto: `${pyF(r.prevalencia_cumulativa)}%` })),
      { ...OPCOES_PDF, largura: 600, altura: 290, ymax: 105, cor: COR.MATA, corPonto: COR.MATA, tituloX: "Nº de potes considerados (cumulativo)",
        tituloY: "Prevalência cumulativa (%)" }), 160));
  }

  // base por paciente (amostra)
  c.push(h2("Base por paciente"));
  c.push(P("Tabela completa disponível no arquivo Excel exportado junto com este PDF; abaixo, uma amostra das primeiras linhas."));
  c.push(esp(2));
  const base = [...m.por_paciente].sort((a, b) => (a.id_paciente < b.id_paciente ? -1 : a.id_paciente > b.id_paciente ? 1 : 0));
  c.push(tabelaPdf(["ID", "Nome", "Amostragem", "Espécies"],
    base.slice(0, 30).map((r) => [r.id_paciente, r.nome_paciente, r.categoria_amostragem, r.especies_str]), [22, 42, 42, 54]));
  if (base.length > 30) c.push(esp(2), P(`… e mais ${base.length - 30} pacientes. Veja a lista completa no Excel exportado.`, "small"));

  c.push(esp(6), regua(0.8, LINE), esp(3));
  c.push(P("Nota metodológica: a prevalência é calculada por paciente, não por exame — uma criança conta como positiva se qualquer uma de suas coletas " +
    "(P1, P2, ... Pn) revelou o parasita. O pote de fezes alimenta os métodos de domínio fecal; a lâmina alimenta exclusivamente os métodos de domínio " +
    "lâmina/swab. Pacientes cujos únicos resultados foram \"Amostra insuficiente\" são reportadas à parte como inconclusivas e não entram nos " +
    "denominadores de prevalência. Uma coluna de método marcada como \"Não realizado\" numa coleta específica é excluída inteiramente do denominador " +
    "daquele método nessa coleta — não conta como positiva, negativa nem inconclusiva. Esta planilha trouxe os seguintes métodos: " +
    `${nomes.length ? nomes.join(", ") : "—"}.`, "small"));

  const dd = {
    pageSize: "A4",
    pageMargins: [18 * MM, 18 * MM, 18 * MM, 16 * MM],
    info: { title: "Relatório de Análise Epidemiológica — Pirajá", creator: "Pirajá", producer: "Pirajá (pdfmake)" },
    defaultStyle: { font: "InstrumentSans", fontSize: 9.5, color: INK_SOFT, lineHeight: 1.25 },
    styles: {
      title: { font: "Fraunces", bold: true, fontSize: 20, color: TEAL_DARK },
      meta: { fontSize: 8, color: INK_FAINT, lineHeight: 1.3 },
      h2: { font: "Fraunces", bold: true, fontSize: 13.5, color: TEAL_DARK, margin: [0, 16, 0, 6] },
      h3: { font: "Fraunces", bold: true, fontSize: 11.5, color: TEAL_DARK, margin: [0, 6, 0, 4] },
      body: { fontSize: 9.5, color: INK_SOFT, lineHeight: 1.3 },
      note: { fontSize: 9, color: INK_SOFT, lineHeight: 1.3 },
      small: { fontSize: 8, color: INK_FAINT, lineHeight: 1.25 },
    },
    footer: (atual, total) => ({ text: `Pirajá · Entero — página ${atual} de ${total}`, alignment: "right", fontSize: 7, color: INK_FAINT,
      margin: [0, 18, 18 * MM, 0] }),
    content: c,
  };
  return new Promise((res, rej) => {
    try { pdfMake.createPdf(dd, null, FONTS, vfs).getBuffer((b) => res(new Uint8Array(b))); } catch (e) { rej(e); }
  });
}
