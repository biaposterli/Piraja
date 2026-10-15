// Planilhas Excel geradas no navegador (ExcelJS): modelo de preenchimento,
// configuração da análise, planilha com a configuração anexada e relatório.
// O acabamento visual segue estilo_planilha.py (identidade Pirajá).

import { METHOD_CATALOG, PARASITE_MAP, PATOGENICOS, COMENSAIS, CATEGORIAS_VALIDAS } from "./engine.js";
import { AMOSTRAS_VALIDAS, CONFIG_SHEETS, abasConfig, abasConfigModelo } from "./config.js";
import { chaveTexto, sortedStr, isNulo } from "./util.js";
import { carregarExcelJS } from "./tabela.js";

// paleta "Mata, barro e papel"
const MATA = "11483D", FOLHA = "328567", COBRE = "9C4A2F", PAPEL = "F4F1EA", SUPERFICIE = "FBF9F4";
const TINTA = "1B2421", TINTA_SUAVE = "4E5B55", TINTA_CLARA = "7A857F", LINHA = "DCD6C8";
const FOLHA_TINTA = "E3EEE8", COBRE_TINTA = "F3E4DB";
// fontes que existem em qualquer Excel/LibreOffice (a planilha não embute fontes)
const SERIFA = "Georgia", SANS = "Calibri";
const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
  "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

const argb = (c) => "FF" + c;
const preenche = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(c) }, bgColor: { argb: argb(c) } });
const fino = { style: "thin", color: { argb: argb(LINHA) } };
const BORDA = { left: fino, right: fino, top: fino, bottom: fino };
const fonte = (o = {}) => ({ name: o.name || SANS, size: o.size || 11, bold: !!o.bold, italic: !!o.italic, color: { argb: argb(o.color || TINTA) }, ...(o.underline ? { underline: true } : {}) });

export const LOGO_PNG = "brand/piraja-entero-cor.png";

async function lerBinario(caminho) {
  if (globalThis.__pjLerArquivo) return globalThis.__pjLerArquivo(caminho); // testes fora do navegador
  const r = await fetch(caminho);
  if (!r.ok) throw new Error(`não foi possível carregar ${caminho}`);
  return new Uint8Array(await r.arrayBuffer());
}

function letra(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function lenPy(v) {
  // len(str(v)) do Python, para as larguras de coluna
  if (v === null || v === undefined) return 0;
  if (typeof v === "boolean") return v ? 4 : 5;
  return [...String(v)].length;
}

// ---------------------------------------------------------------- helpers de aba
function preparar(ws) {
  ws.views = [{ zoomScale: 110 }];
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function congelar(ws, xSplit, ySplit, extra = {}) {
  ws.views = [{ state: "frozen", xSplit, ySplit, zoomScale: 110, ...extra }];
}

/** Escreve uma matriz (1ª linha = cabeçalho) a partir da linha inicial (1-based). */
function escrever(ws, matriz, linha0 = 1) {
  matriz.forEach((l, i) => {
    const row = ws.getRow(linha0 + i);
    l.forEach((v, j) => {
      if (isNulo(v) || v === "") return;
      row.getCell(j + 1).value = v;
    });
  });
}

/** Cabeçalho no estilo do pandas (negrito, borda fina, centralizado) — usado onde não há estilo próprio. */
function cabecalhoPandas(ws, linha, n) {
  const fino2 = { style: "thin", color: { argb: "FF000000" } };
  for (let j = 1; j <= n; j++) {
    const c = ws.getRow(linha).getCell(j);
    c.font = { bold: true };
    c.border = { left: fino2, right: fino2, top: fino2, bottom: fino2 };
    c.alignment = { horizontal: "center", vertical: "top" };
  }
}

function cabecalho(ws, linha = 1, cor = MATA, altura = 34, colunas = null) {
  const row = ws.getRow(linha);
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    if (colunas && !colunas.has(col)) return;
    cell.fill = preenche(cor);
    cell.font = fonte({ bold: true, color: PAPEL });
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
    cell.border = BORDA;
  });
  row.height = altura;
}

function corpo(ws, primeira = 2, zebra = true, wrap = true) {
  const ultima = ws.rowCount, ncol = ws.columnCount;
  for (let r = primeira; r <= ultima; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ncol; c++) {
      const cell = row.getCell(c);
      cell.font = fonte();
      cell.alignment = { vertical: "top", wrapText: wrap, indent: 1 };
      cell.border = BORDA;
      cell.fill = preenche(zebra && (r - primeira) % 2 ? SUPERFICIE : "FFFFFF");
    }
  }
}

function larguras(ws, mapa) {
  for (const [col, w] of Object.entries(mapa)) ws.getColumn(col).width = w;
}

function larguraPorConteudo(ws, min, max, extra) {
  for (let c = 1; c <= ws.columnCount; c++) {
    let lg = 0, tem = false;
    ws.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value && typeof cell.value === "object" && "text" in cell.value ? cell.value.text : cell.value;
      if (v === null || v === undefined) return;
      tem = true;
      lg = Math.max(lg, lenPy(v));
    });
    ws.getColumn(c).width = Math.min(Math.max(min, (tem ? lg : 8) + extra), max);
  }
}

/** Lista suspensa que SUGERE valores mas aceita outros (aviso, não bloqueio). */
function lista(ws, valores, intervalo, titulo, msg) {
  ws.dataValidations.add(intervalo, {
    type: "list", allowBlank: true, formulae: ['"' + valores.join(",") + '"'],
    showErrorMessage: true, errorStyle: "warning", errorTitle: titulo, error: msg, showInputMessage: false,
  });
}

function colunasPorNome(ws, linha = 1) {
  const m = {};
  ws.getRow(linha).eachCell({ includeEmpty: false }, (cell, col) => { m[String(cell.value)] = letra(col); });
  return m;
}

// ---------------------------------------------------------------- estilos por aba (estilo_planilha.py)
async function leiaMe(wb, ws, texto, logo, parceiros = null) {
  ws.views = [{ showGridLines: false, zoomScale: 110 }];
  larguras(ws, { A: 3, B: 110 });
  let linha = 2;
  if (logo) {
    const id = wb.addImage({ buffer: logo.buf, extension: "png" });
    ws.addImage(id, { tl: { col: 1, row: 1 }, ext: { width: Math.round(62 * logo.w / logo.h), height: 62 } });
    ws.getRow(2).height = 50;
    linha = 5;
  }
  colocarParceiros(wb, ws, parceiros, 1, logo ? Math.round(62 * logo.w / logo.h) + 40 : 0);
  if (parceiros && !logo) { ws.getRow(2).height = 50; linha = 5; }
  const t = ws.getCell(linha, 2);
  t.value = "Modelo de planilha — levantamento de parasitoses intestinais";
  t.font = fonte({ name: SERIFA, size: 20, bold: true, color: MATA });
  ws.getRow(linha).height = 30;
  const e = ws.getCell(linha + 1, 2);
  e.value = "LEIA ANTES DE PREENCHER";
  e.font = fonte({ size: 10, bold: true, color: COBRE });
  e.border = { bottom: fino };
  linha += 3;
  for (const par of texto.split("\n\n").map((p) => p.trim()).filter(Boolean)) {
    const c = ws.getCell(linha, 2);
    c.value = par;
    const destaque = par.slice(0, 40) === par.slice(0, 40).toUpperCase() && /[A-ZÀ-Ý]/.test(par.slice(0, 40)) || par.startsWith("CONFIGURAÇÃO");
    c.font = fonte({ size: 11.5, color: destaque ? MATA : TINTA });
    c.alignment = { wrapText: true, vertical: "top" };
    if (destaque) c.fill = preenche(FOLHA_TINTA);
    ws.getRow(linha).height = Math.max(18, 16 * (Math.floor(par.length / 105) + 1) + 6);
    linha += 2;
  }
  const a = ws.getCell(linha, 2);
  a.value = "Abas deste arquivo";
  a.font = fonte({ name: SERIFA, size: 14, bold: true, color: MATA });
  linha += 1;
  for (const [nome, desc] of [
    ["Dados", "onde você registra os resultados — uma linha por coleta (P1, P2, P3…) de cada paciente."],
    ["Legenda", "o que é cada coluna e os valores aceitos."],
    ["Especies_Reconhecidas", "parasitos que o sistema já reconhece e as grafias aceitas."],
    ["Config_*", "configuração da análise (opcional): parasitos, métodos, nº de amostras e critérios de inclusão."],
  ]) {
    const c = ws.getCell(linha, 2);
    c.value = `${nome}  —  ${desc}`;
    c.font = fonte({ color: TINTA_SUAVE });
    linha += 1;
  }
  ws.properties.tabColor = { argb: argb(MATA) };
}

function dados(ws, colunasLamina) {
  const cab = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => { cab[col] = String(c.value); });
  const LARG = { id_paciente: 14, coleta: 10, nome_paciente: 24, nome_responsavel: 24, status_amostra: 17, status_lamina: 17,
    bairro: 22, municipio: 20, uf: 7, observacoes: 46 };
  cab.forEach((nome, i) => {
    if (!nome) return;
    const cor = colunasLamina.has(nome) ? COBRE : nome.startsWith("metodo_") ? FOLHA : MATA;
    cabecalho(ws, 1, cor, 36, new Set([i]));
    ws.getColumn(i).width = nome.startsWith("metodo_") ? 30 : (LARG[nome] ?? 18);
  });
  // linhas de exemplo: cinza-claro e itálico, para ficar claro que são só referência
  for (let r = 2; r <= ws.rowCount; r++) {
    for (let c = 1; c < cab.length; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.font = fonte({ italic: true, color: TINTA_CLARA });
      cell.fill = preenche(PAPEL);
      cell.border = BORDA;
      cell.alignment = { vertical: "top", wrapText: false };
    }
  }
  ws.getCell("A2").note = {
    texts: [{ text: "Linhas de exemplo (F-001 e F-002): servem só de referência. Apague-as antes de enviar, senão entram na análise." }],
    editAs: "absolute",
  };
  congelar(ws, 2, 1);
  ws.autoFilter = `A1:${letra(cab.length - 1)}${Math.max(ws.rowCount, 2)}`;
  const col = colunasPorNome(ws);
  for (const campo of ["status_amostra", "status_lamina"]) {
    if (col[campo]) lista(ws, ["Entregue", "Não entregue"], `${col[campo]}2:${col[campo]}2000`, "Status", "Valores esperados: Entregue ou Não entregue.");
  }
  if (col.uf) lista(ws, UFS, `${col.uf}2:${col.uf}5000`, "UF", "Use a sigla do estado (ex.: RN).");
  if (col.coleta) lista(ws, ["P1", "P2", "P3", "P4", "P5", "P6"], `${col.coleta}2:${col.coleta}2000`, "Coleta", "Use P1, P2, P3… para identificar a coleta.");
  ws.properties.tabColor = { argb: argb(COBRE) };
}

function legenda(ws) {
  cabecalho(ws);
  corpo(ws);
  larguras(ws, { A: 26, B: 62, C: 80 });
  for (let r = 2; r <= ws.rowCount; r++) ws.getRow(r).getCell(1).font = fonte({ bold: true, color: MATA });
  congelar(ws, 0, 1);
}

function especies(ws) {
  // A1 = título da nota, A2 = nota; tabela a partir da linha 4 (cabeçalho)
  ws.mergeCells("A2:C2");
  ws.getCell("A1").font = fonte({ name: SERIFA, size: 14, bold: true, color: MATA });
  ws.getCell("A2").font = fonte({ color: TINTA_SUAVE });
  ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
  ws.getCell("A2").fill = preenche(FOLHA_TINTA);
  ws.getRow(2).height = 125;
  cabecalho(ws, 4);
  corpo(ws, 5);
  larguras(ws, { A: 38, B: 20, C: 70 });
  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.getCell(1).font = fonte({ italic: true });
    const cat = String(row.getCell(2).value ?? "");
    if (cat.startsWith("Patog")) { row.getCell(2).fill = preenche(COBRE_TINTA); row.getCell(2).font = fonte({ bold: true, color: COBRE }); }
    else if (cat.startsWith("Comens")) { row.getCell(2).fill = preenche(FOLHA_TINTA); row.getCell(2).font = fonte({ bold: true, color: FOLHA }); }
  }
  congelar(ws, 0, 4);
}

function config(ws, nome) {
  cabecalho(ws, 1, FOLHA);
  corpo(ws, 2, true, false);
  larguraPorConteudo(ws, 12, 70, 4);
  congelar(ws, 0, 1);
  const col = colunasPorNome(ws);
  const ultima = Math.max(ws.rowCount, 2) + 200;
  if (col.Incluir) lista(ws, ["Sim", "Não"], `${col.Incluir}2:${col.Incluir}${ultima}`, "Incluir", "Use Sim ou Não.");
  if (col["Classificação"]) {
    lista(ws, CATEGORIAS_VALIDAS, `${col["Classificação"]}2:${col["Classificação"]}${ultima}`, "Classificação",
      "Valores esperados: " + CATEGORIAS_VALIDAS.join(", ") + ".");
  }
  if (col.Amostra) lista(ws, AMOSTRAS_VALIDAS, `${col.Amostra}2:${col.Amostra}${ultima}`, "Amostra", "Valores esperados: " + AMOSTRAS_VALIDAS.join(", ") + ".");
  if (nome === "Config_Amostras" || nome === "Config_Criterios") {
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.getCell(1).font = fonte({ bold: true, color: MATA });
      row.getCell(2).font = fonte({ name: SERIFA, size: 13, bold: true, color: COBRE });
      row.getCell(2).alignment = { horizontal: "center", vertical: "top" };
    }
  }
  ws.properties.tabColor = { argb: argb(FOLHA) };
}

// logos de realização (LaPaHV + UFRN), sempre juntos
export const LOGOS_PARCEIROS = ["brand/parceiros/lapahv.png", "brand/parceiros/ufrn.png"];

async function logoInfo(caminho = LOGO_PNG) {
  try {
    const buf = await lerBinario(caminho);
    // dimensões do PNG (cabeçalho IHDR)
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { buf, w: dv.getUint32(16), h: dv.getUint32(20) };
  } catch { return null; }
}

async function parceirosInfo() {
  const l = await Promise.all(LOGOS_PARCEIROS.map((c) => logoInfo(c)));
  return l.every(Boolean) ? l : null;
}

/** Logos LaPaHV + UFRN lado a lado, na coluna `col` (0 = A), deslocados `xPx` px da borda dela. */
const EMU = 9525; // por pixel
function colocarParceiros(wb, ws, parceiros, col, xPx) {
  if (!parceiros) return;
  const [lap, ufrn] = parceiros;
  const hLap = 62, hUfrn = 30;
  const wLap = Math.round(hLap * lap.w / lap.h), wUfrn = Math.round(hUfrn * ufrn.w / ufrn.h);
  const ancora = (x, y) => ({ nativeCol: col, nativeColOff: Math.round(x * EMU), nativeRow: 1, nativeRowOff: Math.round(y * EMU) });
  ws.addImage(wb.addImage({ buffer: lap.buf, extension: "png" }), { tl: ancora(xPx, 0), ext: { width: wLap, height: hLap } });
  // a UFRN fica à direita, centrada na altura do LaPaHV
  ws.addImage(wb.addImage({ buffer: ufrn.buf, extension: "png" }), { tl: ancora(xPx + wLap + 16, (hLap - hUfrn) / 2), ext: { width: wUfrn, height: hUfrn } });
}

async function paraBytes(wb) {
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function addConfigAbas(wb, abas) {
  for (const [nome, mat] of Object.entries(abas)) {
    const ws = wb.addWorksheet(nome);
    preparar(ws);
    escrever(ws, mat);
    config(ws, nome);
  }
}

// ======================================================================= modelo
const LEIA_ME = "Este modelo traz uma coluna para cada método que o Pirajá reconhece. Se o seu " +
  "laboratório não usa algum deles, pode simplesmente APAGAR a coluna inteira antes de " +
  "enviar — o sistema detecta sozinho quais métodos estão presentes na planilha e ajusta " +
  "as análises (denominadores, gráficos e tabelas) de acordo. Não é preciso preencher " +
  "nem manter colunas de métodos não utilizados.\n\n" +
  "Veja a aba 'Espécies reconhecidas' para a lista de parasitos que o sistema já sabe " +
  "identificar e a grafia aceita para cada um, e como anotar poliparasitismo (mais de uma " +
  "espécie na mesma célula).\n\n" +
  "Use 'Não realizado' numa célula de método quando aquele método específico não chegou a " +
  "ser executado NESSA amostra (mesmo com o pote/lâmina entregue) — diferente de 'Amostra " +
  "insuficiente', que é quando o método foi tentado mas não deu resultado. Uma célula " +
  "'Não realizado' não entra em nenhum denominador do relatório para aquele método.\n\n" +
  "Território (opcional): preencha bairro, municipio e uf com o lugar onde o paciente MORA. " +
  "Com isso o relatório mostra a prevalência por bairro e por município e pode gerar o mapa (opcional). " +
  "Escreva o nome do bairro sempre do mesmo jeito; acentos e maiúsculas não importam. Não " +
  "coloque endereço. Em São Paulo (SP), use o nome do DISTRITO (ex.: Capão Redondo, Itaquera); " +
  "no Distrito Federal, o nome da REGIÃO ADMINISTRATIVA (ex.: Ceilândia, Taguatinga, Plano Piloto) " +
  "e 'Brasília' como município.\n\n" +
  "CONFIGURAÇÃO DA ANÁLISE (opcional) — abas Config_Parasitos, Config_Metodos, " +
  "Config_Amostras e Config_Criterios: defina quais parasitos entram na análise (Incluir = Sim/Não), se cada " +
  "um é Patogênico ou Comensal, quais métodos entram e se são de Fezes ou de Lâmina " +
  "(Graham), e quantas amostras (P1..Pn) por paciente considerar e os critérios de inclusão de pacientes (por exemplo, " +
  "só quem entregou todas as amostras). 'Agrupar como' junta " +
  "grafias diferentes numa só espécie. Se essas abas estiverem na planilha, o site já abre " +
  "a configuração preenchida; se não estiverem, você configura no próprio site e pode " +
  "baixar a configuração para reaproveitar.";

const NOTA_ESPECIES = "Maiúsculas/minúsculas não importam, e 'e.coli', 'e. coli' e 'e .coli' são todos " +
  "reconhecidos como a mesma grafia. Uma espécie escrita de um jeito que NÃO está nesta " +
  "lista (nem por extenso, nem abreviada como aqui) ainda é aceita e aparece no relatório, " +
  "mas como 'Não classificado' — sem entrar automaticamente em Patogênico ou Comensal — e " +
  "pode virar uma linha separada da mesma espécie já cadastrada com outra grafia. Prefira " +
  "sempre uma das grafias desta lista, ou o nome científico completo (ex.: 'Giardia " +
  "lamblia').\n\n" +
  "Poliparasitismo: para registrar mais de uma espécie na MESMA amostra/método, escreva " +
  "todas na mesma célula separadas por ' + ' (ex.: 'E. nana + G. lamblia + Enterobius " +
  "vermicularis'). Vírgula também é aceita como separador. Não crie uma linha extra nem " +
  "repita a coleta — é uma célula só, com todas as espécies encontradas.";

export async function gerarModelo() {
  const ExcelJS = await carregarExcelJS();
  const colFecal = METHOD_CATALOG.filter((m) => m[3] === "fecal").map((m) => m[0]);
  const colLamina = METHOD_CATALOG.filter((m) => m[3] === "lamina").map((m) => m[0]);
  const headers = ["id_paciente", "coleta", "nome_paciente", "nome_responsavel", "bairro", "municipio", "uf",
    "status_amostra", "status_lamina", ...colLamina, ...colFecal, "observacoes"];
  const linhaEx = (id, coleta, stA, stL, valores, obs) => {
    const row = {
      id_paciente: id, coleta, nome_paciente: "Exemplo Da Silva", nome_responsavel: "Nome Do Responsável",
      bairro: id === "F-001" ? "Lagoa Nova" : "Felipe Camarão", municipio: "Natal", uf: "RN",
      status_amostra: stA, status_lamina: stL, observacoes: obs,
    };
    for (const c of [...colLamina, ...colFecal]) row[c] = c in valores ? valores[c] : "-";
    return headers.map((h) => row[h]);
  };
  const exemplo = [headers,
    linhaEx("F-001", "P1", "Entregue", "Entregue", { metodo_hpj: "E. nana" }, ""),
    linhaEx("F-001", "P2", "Entregue", "Entregue", Object.fromEntries(colLamina.map((c) => [c, "Enterobius vermicularis"])), ""),
    linhaEx("F-001", "P3", "Não entregue", "Entregue", Object.fromEntries(colFecal.map((c) => [c, ""])), "amostra fecal não coletada"),
    linhaEx("F-002", "P1", "Entregue", "Entregue",
      { metodo_hpj: "E. nana + G. lamblia", ...Object.fromEntries(colLamina.filter((c) => c !== "metodo_graham").map((c) => [c, "Não realizado"])) },
      "poliparasitismo (2 espécies na mesma célula, separadas por '+')"),
  ];

  const legMetodo = {
    metodo_graham: "Resultado do Graham — Enterobius vermicularis, Taenia sp.",
    metodo_hpj: "Resultado do HPJ (Hoffman, Pons e Janer / Lutz) — sedimentação espontânea.",
    metodo_willis: "Resultado do Willis — flutuação espontânea, ovos leves (ancilostomídeos).",
    metodo_baermann_picanco: "Resultado do Baermann-Picanço — larvas de Strongyloides.",
    metodo_faust: "Resultado do Faust — centrífugo-flutuação, cistos/oocistos de protozoários.",
    metodo_kato_katz: "Resultado do Kato-Katz — quantificação de ovos de helmintos.",
    metodo_mifc: "Resultado do MIFC (Blagg) — sedimentação por centrifugação.",
    metodo_ritchie: "Resultado do Ritchie (formol-éter) — sedimentação por centrifugação.",
  };
  const aceitos = "'-' (negativo) · 'Amostra insuficiente' (tentou, mas não deu resultado) · " +
    "'Não realizado' (esse método não foi feito nessa amostra — não entra em nenhuma conta) · " +
    "ou espécie(s) reconhecida(s) (veja a aba 'Espécies reconhecidas'). Para poliparasitismo, " +
    "escreva mais de uma espécie na MESMA célula separadas por ' + ' (ex.: 'E. nana + G. lamblia').";
  const leg = [["Coluna", "O que é", "Valores aceitos"],
    ["id_paciente", "Código único do paciente (repete nas linhas de P1/P2/P3)", "texto livre, ex.: F-001"],
    ["coleta", "Qual coleta essa linha representa", "P1, P2, P3 ... (quantas o estudo tiver)"],
    ["nome_paciente", "Nome da criança", "texto livre"],
    ["nome_responsavel", "Nome do responsável (opcional)", "texto livre ou vazio"],
    ["bairro", "Bairro onde o paciente MORA (opcional — usado na prevalência por bairro e no mapa). Só o nome do bairro, nunca o endereço. Em São Paulo/SP use o DISTRITO; no DF, a REGIÃO ADMINISTRATIVA (com municipio = Brasília).", "texto, ex.: Lagoa Nova"],
    ["municipio", "Município onde o paciente mora (opcional, mas necessário para o bairro: há bairros com o mesmo nome em cidades diferentes)", "texto, ex.: Natal"],
    ["uf", "Sigla do estado do município (opcional)", "RN, PB, PE..."],
    ["status_amostra", "Status de entrega do POTE DE FEZES — usado pelos métodos fecais abaixo", "Entregue / Não entregue"],
    ["status_lamina", "Status de entrega da LÂMINA — usado pelo(s) método(s) de lâmina abaixo", "Entregue / Não entregue"],
    ...METHOD_CATALOG.map(([col, nome]) => [col, legMetodo[col] || `Resultado do ${nome}.`, aceitos]),
    ["observacoes", "Observações livres (opcional)", "texto livre ou vazio"]];

  const variantes = new Map();
  for (const [k, v] of Object.entries(PARASITE_MAP)) { if (!variantes.has(v)) variantes.set(v, []); variantes.get(v).push(k); }
  const esp = [["Espécie (nome padronizado no relatório)", "Categoria clínica", "Grafias aceitas na célula (maiúsc./minúsc. tanto faz)"]];
  for (const e of sortedStr(variantes.keys())) {
    const vs = [...new Set(variantes.get(e))].sort((a, b) => a.length - b.length);
    esp.push([e, PATOGENICOS.has(e) ? "Patogênico" : COMENSAIS.has(e) ? "Comensal" : "Não classificado", vs.join(", ")]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pirajá";
  const logo = await logoInfo();
  const wsL = wb.addWorksheet("Leia-me"); preparar(wsL); await leiaMe(wb, wsL, LEIA_ME, logo, await parceirosInfo());
  const wsD = wb.addWorksheet("Dados"); preparar(wsD); escrever(wsD, exemplo); dados(wsD, new Set(colLamina));
  const wsG = wb.addWorksheet("Legenda"); preparar(wsG); escrever(wsG, leg); legenda(wsG);
  const wsE = wb.addWorksheet("Especies_Reconhecidas"); preparar(wsE);
  escrever(wsE, [["Como preencher espécies e poliparasitismo"], [NOTA_ESPECIES]]);
  escrever(wsE, esp, 4);
  especies(wsE);
  addConfigAbas(wb, abasConfigModelo());
  return paraBytes(wb);
}

// ======================================================================= configuração
export async function configXlsx(par, met, n, crit) {
  const ExcelJS = await carregarExcelJS();
  const wb = new ExcelJS.Workbook();
  addConfigAbas(wb, abasConfig(par, met, n, crit));
  return paraBytes(wb);
}

/** A planilha enviada + abas Config_* (substitui as antigas, se houver). */
export async function planilhaComConfig(buffer, nomeArquivo, planilhaLida, par, met, n, crit) {
  const ExcelJS = await carregarExcelJS();
  const ehConfig = new Set(CONFIG_SHEETS.map(chaveTexto));
  const abas = abasConfig(par, met, n, crit);
  let wb = null;
  if (!/\.xls$/i.test(nomeArquivo)) {
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      for (const ws of [...wb.worksheets]) if (ehConfig.has(chaveTexto(ws.name))) wb.removeWorksheet(ws.id);
    } catch { wb = null; }
  }
  if (!wb) {
    // .xls antigo (ou arquivo que não abriu): reescreve só os dados
    wb = new ExcelJS.Workbook();
    for (const nome of planilhaLida.nomes) {
      if (ehConfig.has(chaveTexto(nome))) continue;
      const ws = wb.addWorksheet(nome.slice(0, 31));
      escrever(ws, planilhaLida.abas[nome]);
      cabecalhoPandas(ws, 1, (planilhaLida.abas[nome][0] || []).length);
    }
  }
  addConfigAbas(wb, abas);
  return paraBytes(wb);
}

// ======================================================================= relatório em Excel
const DESCRICAO_ABAS = {
  Base_por_Crianca: "Uma linha por paciente, com o resultado consolidado de cada método e amostra.",
  Categoria_Amostragem: "Pacientes por profundidade de amostragem (fezes e lâmina, só fezes, só lâmina…).",
  Prevalencia_Geral: "Prevalências gerais com IC 95% (Wilson) e número de pacientes inconclusivos.",
  Metodos_Ativos: "Métodos considerados nesta análise.",
  Todos_os_Parasitos: "Prevalência de cada parasito, reunindo fezes e lâmina.",
  Prevalencia_Especie_Lamina: "Prevalência por espécie nos métodos de lâmina.",
  Todos_x_Patogenicos: "Prevalência considerando todos os parasitos x somente os patogênicos.",
  Prevalencia_por_Especie: "Prevalência por espécie nas amostras de fezes.",
  Prevalencia_Metodo_x_Especie: "Prevalência de cada espécie em cada método.",
  Poliparasitismo: "Pacientes negativos, com mono e com poliparasitismo.",
  Combinacoes: "Combinações de espécies encontradas no mesmo paciente.",
  Comparacao_Metodos: "Positividade e prevalência de cada método.",
  Prevalencia_x_NColetas: "Prevalência conforme o número de coletas entregues.",
  Curva_Cumulativa_Fecal: "Prevalência acumulada a cada nova coleta de fezes.",
  McNemar_HPJ_x_Willis: "Teste de McNemar comparando HPJ e Willis nos mesmos pacientes.",
  CochranArmitage_NPotes: "Teste de tendência de Cochran-Armitage para o número de coletas.",
  Prevalencia_Municipio: "Prevalência por município de moradia, com IC 95%.",
  Prevalencia_Bairro: "Prevalência por bairro de moradia, com IC 95%.",
  Config_Parasitos: "Configuração usada: parasitos incluídos e classificação.",
  Config_Metodos: "Configuração usada: métodos incluídos e tipo de amostra.",
  Config_Amostras: "Configuração usada: número de amostras por paciente.",
  Config_Criterios: "Configuração usada: critérios de inclusão de pacientes.",
  Pacientes_Excluidos: "Pacientes que não atenderam aos critérios de inclusão, com o motivo.",
};

const COLS_PCT = new Set(["valor_pct", "prevalencia", "ic95_inf", "ic95_sup", "%", "prevalencia_cumulativa"]);

/** Lista de objetos -> matriz com as colunas pedidas (na ordem). */
function matriz(linhas, colunas) {
  return [colunas, ...linhas.map((r) => colunas.map((c) => (r[c] === undefined ? null : r[c])))];
}

const BASE_COLS = ["id_paciente", "nome_paciente", "bairro", "municipio", "uf", "territorio_inconsistente",
  "n_coletas_registradas", "n_coletas_pote_entregue", "n_coletas_lamina_entregue", "categoria_amostragem",
  "participou_estudo", "fecal_status", "lamina_status", "positivo_fecal", "positivo_lamina", "positivo_algum_metodo",
  "especies_fecais_str", "especies_lamina_str", "especies_str", "n_especies_distintas_fecais", "poliparasitado_fecal",
  "tem_patogenico", "tem_comensal", "positivo_fecal_patogenico", "positivo_lamina_patogenico"];

export function abasRelatorio(m, cfgEstado) {
  const nomes = m.metodos_ativos_nomes;
  const abas = [];
  const pp = m.por_paciente.map((r) => {
    const o = {};
    for (const c of BASE_COLS) o[c] = r[c];
    for (const nm of nomes) { o[`positivo_${nm}`] = r.metodos[nm].positivo; o[`status_${nm}`] = r.metodos[nm].status; }
    return o;
  });
  abas.push(["Base_por_Crianca", matriz(pp, [...BASE_COLS, ...nomes.flatMap((nm) => [`positivo_${nm}`, `status_${nm}`])])]);
  abas.push(["Categoria_Amostragem", [["categoria_amostragem", "n"], ...Object.entries(m.cat_counts)]]);
  const linhaPrev = (metrica, valor, base, inf, sup) => ({ metrica, valor_pct: base.length ? valor : null, ic95_inf: inf, ic95_sup: sup, n_pacientes: base.length });
  abas.push(["Prevalencia_Geral", matriz([
    linhaPrev("Prevalência — amostra fecal (conclusiva)", m.prev_fecal, m.fecal_conclusivo, m.prev_fecal_ic95_inf, m.prev_fecal_ic95_sup),
    linhaPrev("Prevalência — lâmina, todos os pacientes (conclusiva)", m.prev_lamina, m.lamina_conclusivo, m.prev_lamina_ic95_inf, m.prev_lamina_ic95_sup),
    linhaPrev("Prevalência — subgrupo só-lâmina (conclusiva)", m.prev_lamina_only, m.lamina_only_conclusivo, m.prev_lamina_only_ic95_inf, m.prev_lamina_only_ic95_sup),
    linhaPrev("Prevalência combinada (conclusiva)", m.prev_combinada, m.combinada_base, m.prev_combinada_ic95_inf, m.prev_combinada_ic95_sup),
    { metrica: "Inconclusivas — fezes (amostra insuficiente em tudo)", n_pacientes: m.fecal_inconclusivo.length },
    { metrica: "Inconclusivas — lâmina, todos os pacientes", n_pacientes: m.lamina_inconclusivo.length },
    { metrica: "Inconclusivas — subgrupo só-lâmina", n_pacientes: m.lamina_only_inconclusivo.length },
    { metrica: "Métodos detectados nesta planilha", n_pacientes: null },
  ], ["metrica", "valor_pct", "ic95_inf", "ic95_sup", "n_pacientes"])]);
  abas.push(["Metodos_Ativos", [["metodos_ativos"], ...nomes.map((x) => [x])]]);
  const ESP = ["especie", "n", "prevalencia", "categoria", "ic95_inf", "ic95_sup"];
  abas.push(["Todos_os_Parasitos", matriz(m.todos_parasitos_resumo, ["especie", "categoria", "dominio", "n", "prevalencia", "base_n", "metodos", "ic95_inf", "ic95_sup"])]);
  abas.push(["Prevalencia_Especie_Lamina", matriz(m.especies_lamina_resumo, ESP)]);
  const posF = m.fecal_conclusivo.filter((r) => r.positivo_fecal).length;
  const posL = m.lamina_conclusivo.filter((r) => r.positivo_lamina).length;
  abas.push(["Todos_x_Patogenicos", matriz([
    { amostra: "Fezes", grupo: "Todos os parasitos", valor_pct: m.prev_fecal, ic95_inf: m.prev_fecal_ic95_inf, ic95_sup: m.prev_fecal_ic95_sup, n_positivos: posF, n_base: m.fecal_conclusivo.length },
    { amostra: "Fezes", grupo: "Somente patogênicos", valor_pct: m.prev_fecal_patogenico, ic95_inf: m.prev_fecal_patogenico_ic95_inf, ic95_sup: m.prev_fecal_patogenico_ic95_sup, n_positivos: m.n_fecal_patogenico, n_base: m.fecal_conclusivo.length },
    { amostra: "Lâmina", grupo: "Todos os parasitos", valor_pct: m.prev_lamina, ic95_inf: m.prev_lamina_ic95_inf, ic95_sup: m.prev_lamina_ic95_sup, n_positivos: posL, n_base: m.lamina_conclusivo.length },
    { amostra: "Lâmina", grupo: "Somente patogênicos", valor_pct: m.prev_lamina_patogenico, ic95_inf: m.prev_lamina_patogenico_ic95_inf, ic95_sup: m.prev_lamina_patogenico_ic95_sup, n_positivos: m.n_lamina_patogenico, n_base: m.lamina_conclusivo.length },
  ], ["amostra", "grupo", "valor_pct", "ic95_inf", "ic95_sup", "n_positivos", "n_base"])]);
  abas.push(["Prevalencia_por_Especie", matriz(m.especies_resumo, ESP)]);
  abas.push(["Prevalencia_Metodo_x_Especie", matriz(m.metodo_especie_resumo, ["metodo", "especie", "n", "prevalencia", "categoria", "ic95_inf", "ic95_sup"])]);
  abas.push(["Poliparasitismo", [["categoria", "n"], ["Negativo", m.neg], ["Monoparasitismo", m.mono], ["Poliparasitismo", m.poli]]]);
  abas.push(["Combinacoes", matriz(m.combos_resumo, ["combinacao", "n"])]);
  abas.push(["Comparacao_Metodos", matriz(m.metodos_resumo, ["metodo", "amostra_biologica", "n_pacientes_testaveis", "n_pacientes_positivas", "n_pacientes_inconclusivas", "prevalencia", "ic95_inf", "ic95_sup"])]);
  abas.push(["Prevalencia_x_NColetas", matriz(m.efeito_n_coletas, ["n_potes_entregues", "n_pacientes", "n_positivos", "prevalencia"])]);
  abas.push(["Curva_Cumulativa_Fecal", matriz(m.fecal_cumulativa, ["k", "n_pacientes", "prevalencia_cumulativa"])]);
  const mc = m.mcnemar_hpj_willis, tb = mc.tabela || {};
  abas.push(["McNemar_HPJ_x_Willis", [["n_pareado", "HPJ+ / Willis+", "HPJ+ / Willis-", "HPJ- / Willis+", "HPJ- / Willis-", "estatistica", "p_valor", "metodo"],
    [mc.n_pareado, tb.pp ?? null, tb.pn ?? null, tb.np ?? null, tb.nn ?? null, mc.estatistica, mc.p_valor, mc.metodo]]]);
  const ca = m.cochran_armitage_efeito_coletas;
  abas.push(["CochranArmitage_NPotes", [["n_grupos", "estatistica_z", "p_valor", "aviso"], [ca.n_grupos, ca.estatistica_z, ca.p_valor, ca.aviso]]]);
  const TERR = ["n_pacientes", "n_positivos", "prevalencia", "ic95_inf", "ic95_sup", "n_positivos_patogenico", "prevalencia_patogenico"];
  if (m.tem_territorio) {
    if (m.territorio_municipio.length) abas.push(["Prevalencia_Municipio", matriz(m.territorio_municipio, ["municipio", "uf", ...TERR])]);
    if (m.territorio_bairro.length) abas.push(["Prevalencia_Bairro", matriz(m.territorio_bairro, ["bairro", "municipio", "uf", ...TERR])]);
  }
  if (m.excluidos_criterios.length) {
    abas.push(["Pacientes_Excluidos", [["id_paciente", "nome_paciente", "motivo_exclusao"],
      ...m.excluidos_criterios.map((r) => [r.id_paciente, r.nome_paciente, r.motivo])]]);
  }
  if (cfgEstado) for (const [nome, mat] of Object.entries(abasConfig(cfgEstado.par, cfgEstado.met, cfgEstado.n, cfgEstado.crit))) abas.push([nome, mat]);
  return abas;
}

function tabelaRelatorio(ws) {
  if (ws.rowCount < 1 || ws.columnCount < 1) return;
  cabecalho(ws, 1, MATA, 32);
  corpo(ws, 2, true, false);
  const cab = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => { cab[String(c.value).trim().toLowerCase()] = col; });
  larguraPorConteudo(ws, 12, 60, 4);
  for (const [nome, idx] of Object.entries(cab)) {
    let fmt = null;
    if (COLS_PCT.has(nome) || nome.startsWith("prevalencia") || nome.endsWith("_pct")) fmt = "0.0";
    else if (nome.includes("p_valor")) fmt = "0.0000";
    else if (nome.startsWith("estatistica")) fmt = "0.000";
    if (fmt) for (let r = 2; r <= ws.rowCount; r++) { const c = ws.getRow(r).getCell(idx); if (typeof c.value === "number") c.numFmt = fmt; }
  }
  for (const nome of ["categoria", "classificação", "classificacao"]) {
    if (!(nome in cab)) continue;
    for (let r = 2; r <= ws.rowCount; r++) {
      const c = ws.getRow(r).getCell(cab[nome]);
      const v = String(c.value ?? "");
      if (v.startsWith("Patog")) { c.fill = preenche(COBRE_TINTA); c.font = fonte({ bold: true, color: COBRE }); }
      else if (v.startsWith("Comens")) { c.fill = preenche(FOLHA_TINTA); c.font = fonte({ bold: true, color: FOLHA }); }
    }
  }
  for (let r = 2; r <= ws.rowCount; r++) ws.getRow(r).getCell(1).font = fonte({ bold: true, color: MATA });
  congelar(ws, 1, 1);
  ws.autoFilter = `A1:${letra(ws.columnCount)}${Math.max(ws.rowCount, 1)}`;
  ws.properties.tabColor = { argb: argb(MATA) };
}

/** Capa com sumário (links para cada aba). ws já criada como 1ª aba; outras = nomes das demais. */
function capa(wb, ws, outras, logo, geradoEm, resumo, parceiros = null) {
  ws.views = [{ showGridLines: false, zoomScale: 110 }];
  larguras(ws, { A: 3, B: 34, C: 90 });
  let linha = 2;
  if (logo) {
    const id = wb.addImage({ buffer: logo.buf, extension: "png" });
    ws.addImage(id, { tl: { col: 1, row: 1 }, ext: { width: Math.round(62 * logo.w / logo.h), height: 62 } });
    ws.getRow(2).height = 50;
    linha = 5;
  }
  colocarParceiros(wb, ws, parceiros, 1, logo ? Math.round(62 * logo.w / logo.h) + 40 : 0);
  if (parceiros && !logo) { ws.getRow(2).height = 50; linha = 5; }
  const t = ws.getCell(linha, 2);
  t.value = "Relatório de análise epidemiológica";
  t.font = fonte({ name: SERIFA, size: 22, bold: true, color: MATA });
  ws.getRow(linha).height = 32;
  if (geradoEm) { const g = ws.getCell(linha + 1, 2); g.value = geradoEm; g.font = fonte({ size: 10, color: TINTA_CLARA }); }
  linha += 2;
  if (resumo) {
    const c = ws.getCell(linha, 2);
    c.value = resumo;
    ws.mergeCells(linha, 2, linha, 3);
    c.font = fonte({ color: TINTA_SUAVE });
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(linha).height = 34;
    linha += 1;
  }
  linha += 1;
  const ct = ws.getCell(linha, 2);
  ct.value = "CONTEÚDO";
  ct.font = fonte({ size: 10, bold: true, color: COBRE });
  ct.border = { bottom: fino };
  ws.getCell(linha, 3).border = { bottom: fino };
  linha += 1;
  outras.forEach((nome, i) => {
    const c = ws.getCell(linha, 2);
    c.value = { text: nome.replaceAll("_", " "), hyperlink: `#'${nome}'!A1` };
    c.font = fonte({ bold: true, color: MATA, underline: true });
    const d = ws.getCell(linha, 3);
    d.value = DESCRICAO_ABAS[nome] || "";
    d.font = fonte({ color: TINTA_SUAVE });
    if (i % 2) { c.fill = preenche(SUPERFICIE); d.fill = preenche(SUPERFICIE); }
    linha += 1;
  });
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.properties.tabColor = { argb: argb(COBRE) };
}

export function agoraTexto(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function relatorioExcel(m, cfgEstado) {
  const ExcelJS = await carregarExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pirajá";
  const abas = abasRelatorio(m, cfgEstado);
  const wsCapa = wb.addWorksheet("Capa");
  for (const [nome, mat] of abas) {
    const ws = wb.addWorksheet(nome);
    preparar(ws);
    escrever(ws, mat);
    if (nome.startsWith("Config_")) config(ws, nome); else tabelaRelatorio(ws);
  }
  const nomes = m.metodos_ativos_nomes;
  const resumo = `${m.total} pacientes cadastrados · ${m.fecal.length} com amostra fecal entregue · ` +
    `${m.apenas_lamina.length} só com lâmina · métodos: ${nomes.length ? nomes.join(", ") : "—"}.`;
  capa(wb, wsCapa, abas.map(([n]) => n), await logoInfo(), `Gerado em ${agoraTexto()}`, resumo, await parceirosInfo());
  return paraBytes(wb);
}
