// Ilustrações autorais (SVG) da apresentação do painel — identidade Pirajá.
// Tradução de ilustracoes.py: formas geométricas simples, o ponto como
// unidade (cada ponto é um paciente) e o cobre marcando o "positivo".

const MATA = "#11483D", FOLHA = "#328567", COBRE = "#9C4A2F", COBRE_CLARO = "#D08A6A", PAPEL = "#F4F1EA";
const TINTA = "#1B2421", LINHA = "#DCD6C8", TINTA_SUAVE = "#4E5B55", FOLHA_CLARA = "#E3EEE8", COBRE_TINT = "#F3E4DB";
const BRANCO = "#FFFFFF", MATA_PONTO = "#1F6150";
const RAMPA = ["#F3E4DB", "#E2B49A", "#C97E5C", "#9C4A2F", "#5E2A19"];
const TXT = "font-family:'Instrument Sans',sans-serif;font-weight:600";

const r1 = (v) => Math.round(v * 10) / 10;

function svg(corpo, w = 220, h = 150, classe = "pj-ilu", titulo = "") {
  const t = titulo ? `<title>${titulo}</title>` : "";
  return `<svg class="${classe}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${titulo}">${t}${corpo}</svg>`;
}

// ------------------------------------------------------------------ 1. planilha
export function planilha() {
  const c = [];
  c.push(`<rect x="38" y="14" width="144" height="124" rx="9" fill="${BRANCO}" stroke="${LINHA}" stroke-width="1.5"/>`);
  c.push(`<path d="M38 23a9 9 0 0 1 9-9h126a9 9 0 0 1 9 9v13H38z" fill="${MATA}"/>`);
  for (const x of [102, 124, 146, 168]) c.push(`<rect x="${x - 6}" y="22" width="12" height="4" rx="2" fill="${PAPEL}" opacity=".55"/>`);
  const linhas = [["P1", "npnn"], ["P2", "nppn"], ["P3", "inpn"], ["P1", "nnnn"]];
  linhas.forEach(([rot, cel], k) => {
    const y = 40 + k * 23;
    if (k % 2 === 0) c.push(`<rect x="39" y="${y}" width="142" height="23" fill="${PAPEL}"/>`);
    const corRot = k < 3 ? MATA : TINTA_SUAVE;
    c.push(`<rect x="48" y="${y + 5}" width="26" height="13" rx="6.5" fill="${k < 3 ? FOLHA_CLARA : LINHA}"/>`);
    c.push(`<text x="61" y="${r1(y + 14.6)}" text-anchor="middle" font-size="9" fill="${corRot}" style="${TXT}">${rot}</text>`);
    c.push(`<rect x="80" y="${r1(y + 9.5)}" width="12" height="4" rx="2" fill="${LINHA}"/>`);
    [...cel].forEach((s, j) => {
      const cx = 102 + j * 22, cy = r1(y + 11.5);
      if (s === "p") c.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${COBRE}"/>`);
      else if (s === "n") c.push(`<circle cx="${cx}" cy="${cy}" r="5" fill="${FOLHA}"/>`);
      else c.push(`<circle cx="${cx}" cy="${cy}" r="4.3" fill="none" stroke="${TINTA_SUAVE}" stroke-width="1.4" stroke-dasharray="2 2"/>`);
    });
  });
  c.push(`<path d="M34 44v58" stroke="${COBRE}" stroke-width="2" stroke-linecap="round"/>`);
  c.push(`<path d="M34 44h3M34 102h3" stroke="${COBRE}" stroke-width="2" stroke-linecap="round"/>`);
  c.push(`<rect x="146" y="124" width="48" height="20" rx="10" fill="${COBRE}"/>`);
  c.push(`<text x="170" y="137.5" text-anchor="middle" font-size="10" fill="${PAPEL}" style="${TXT}">.xlsx</text>`);
  return svg(c.join(""), 220, 150, "pj-ilu", "Planilha com uma linha por coleta");
}

// ------------------------------------------------------------------ 2. configurar
function ovoAscaris(cx, cy, cor) {
  let pts = "";
  for (let a = 0; a < 10; a++) {
    pts += `<circle cx="${(cx + 15 * Math.cos(a / 10 * 6.2832)).toFixed(1)}" cy="${(cy + 10.5 * Math.sin(a / 10 * 6.2832)).toFixed(1)}" r="2.6" fill="${cor}"/>`;
  }
  return pts + `<ellipse cx="${cx}" cy="${cy}" rx="14" ry="9.5" fill="${cor}"/><ellipse cx="${cx}" cy="${cy}" rx="8" ry="5" fill="${BRANCO}" opacity=".35"/>`;
}
function ovoTrichuris(cx, cy, cor) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="13" ry="8" fill="${cor}"/>` +
    `<rect x="${cx - 17.5}" y="${cy - 3}" width="5" height="6" rx="2.5" fill="${cor}"/>` +
    `<rect x="${cx + 12.5}" y="${cy - 3}" width="5" height="6" rx="2.5" fill="${cor}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="8" ry="4" fill="${BRANCO}" opacity=".35"/>`;
}
function cisto(cx, cy, cor) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="12" ry="9" fill="none" stroke="${cor}" stroke-width="2.6"/>` +
    `<circle cx="${cx - 4}" cy="${cy - 2}" r="2.2" fill="${cor}"/><circle cx="${cx + 4}" cy="${cy - 2}" r="2.2" fill="${cor}"/>` +
    `<circle cx="${cx - 4}" cy="${r1(cy + 3.2)}" r="2.2" fill="${cor}"/><circle cx="${cx + 4}" cy="${r1(cy + 3.2)}" r="2.2" fill="${cor}"/>`;
}
function toggle(x, y, on) {
  return `<rect x="${x}" y="${y}" width="30" height="18" rx="9" fill="${on ? MATA : LINHA}"/>` +
    `<circle cx="${on ? x + 21 : x + 9}" cy="${y + 9}" r="6.5" fill="${BRANCO}"/>`;
}

export function configurar() {
  const c = [`<rect x="20" y="14" width="180" height="124" rx="9" fill="${BRANCO}" stroke="${LINHA}" stroke-width="1.5"/>`];
  const linhas = [[ovoAscaris, COBRE, "Patogênico", COBRE_TINT, COBRE, true],
    [cisto, FOLHA, "Comensal", FOLHA_CLARA, MATA, true],
    [ovoTrichuris, COBRE, "Patogênico", COBRE_TINT, COBRE, false]];
  linhas.forEach(([desenho, cor, rot, chip, corTxt, on], k) => {
    const y = 39 + k * 37;
    if (k) c.push(`<line x1="32" y1="${y - 18.5}" x2="188" y2="${y - 18.5}" stroke="${LINHA}" stroke-width="1"/>`);
    c.push(desenho(52, y, on ? cor : "#C9C3B5"));
    if (!on) { chip = PAPEL; corTxt = TINTA_SUAVE; rot = "Fora da análise"; }
    c.push(`<rect x="78" y="${y - 9}" width="70" height="18" rx="9" fill="${chip}"/>`);
    c.push(`<text x="113" y="${r1(y + 3.6)}" text-anchor="middle" font-size="9.5" fill="${corTxt}" style="${TXT}">${rot}</text>`);
    c.push(toggle(156, y - 9, on));
  });
  return svg(c.join(""), 220, 150, "pj-ilu", "Escolha e classificação dos parasitos");
}

// ------------------------------------------------------------------ 3. prevalência
export function prevalencia() {
  const c = [];
  const positivos = new Set([2, 7, 9, 13, 16, 22, 25, 28]);
  for (let i = 0; i < 30; i++) {
    c.push(`<circle cx="${28 + (i % 5) * 15}" cy="${30 + Math.floor(i / 5) * 15}" r="5.4" fill="${positivos.has(i) ? COBRE : FOLHA}"/>`);
  }
  c.push(`<path d="M106 68h16" stroke="${TINTA_SUAVE}" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M117 62l6 6-6 6" fill="none" stroke="${TINTA_SUAVE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
  const base = 122;
  c.push(`<line x1="134" y1="${base}" x2="206" y2="${base}" stroke="${TINTA}" stroke-width="1.5"/>`);
  for (const [x, h, cor, lo, hi, rot] of [[144, 58, MATA, 44, 74, "Fezes"], [178, 36, FOLHA, 24, 50, "Lâmina"]]) {
    c.push(`<rect x="${x}" y="${base - h}" width="22" height="${h}" rx="3" fill="${cor}"/>`);
    const xm = x + 11;
    c.push(`<path d="M${xm} ${base - hi}V${base - lo}M${xm - 5} ${base - hi}h10M${xm - 5} ${base - lo}h10" stroke="${COBRE}" stroke-width="2" stroke-linecap="round"/>`);
    c.push(`<text x="${xm}" y="${base + 14}" text-anchor="middle" font-size="9.5" fill="${TINTA_SUAVE}" style="${TXT}">${rot}</text>`);
  }
  c.push(`<rect x="150" y="22" width="48" height="18" rx="9" fill="${COBRE_TINT}"/>` +
    `<text x="174" y="34.6" text-anchor="middle" font-size="9.5" fill="${COBRE}" style="${TXT}">IC 95%</text>`);
  return svg(c.join(""), 220, 150, "pj-ilu", "Prevalência por paciente com intervalo de confiança");
}

// ------------------------------------------------------------------ 4. mapa
export function mapa() {
  const P = { A: [42, 40], B: [82, 18], C: [126, 30], D: [152, 70], E: [136, 116], F: [90, 136],
    G: [46, 116], H: [28, 76], I: [86, 56], J: [112, 78], K: [76, 96] };
  const areas = [["HABIK", 1], ["BCJI", 0], ["CDJ", 2], ["DEJ", 3], ["EFKJ", 2], ["FGHK", 0], ["IJK", 4]];
  const c = [];
  const caminho = (nome) => "M" + [...nome].map((p) => `${P[p][0]} ${P[p][1]}`).join("L") + "Z";
  for (const [nome, cl] of areas) c.push(`<path d="${caminho(nome)}" fill="${RAMPA[cl]}" stroke="${BRANCO}" stroke-width="2" stroke-linejoin="round"/>`);
  c.push(`<path d="${caminho("ABCDEFGH")}" fill="none" stroke="${TINTA}" stroke-width="1.6" stroke-linejoin="round"/>`);
  c.push(`<path d="M184 16l7 20-7-5z" fill="${TINTA}"/><path d="M184 16l-7 20 7-5z" fill="none" stroke="${TINTA}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<text x="184" y="50" text-anchor="middle" font-size="10" fill="${TINTA}" style="${TXT}">N</text>`);
  RAMPA.forEach((cor, k) => {
    c.push(`<rect x="172" y="${62 + k * 11}" width="12" height="9" rx="1.5" fill="${cor}"/>` +
      `<rect x="188" y="${65.5 + k * 11}" width="${14 - k}" height="2.5" rx="1.25" fill="${LINHA}"/>`);
  });
  c.push(`<rect x="150" y="132" width="16" height="5" fill="${TINTA}"/><rect x="166" y="132" width="16" height="5" fill="${BRANCO}" stroke="${TINTA}" stroke-width="1"/><rect x="182" y="132" width="16" height="5" fill="${TINTA}"/>`);
  return svg(c.join(""), 220, 150, "pj-ilu", "Mapa de prevalência por território");
}

// ------------------------------------------------------------------ 5. relatório
export function relatorio() {
  const c = [];
  c.push(`<g transform="rotate(6 140 76)"><rect x="98" y="20" width="84" height="106" rx="7" fill="${BRANCO}" stroke="${LINHA}" stroke-width="1.5"/>` +
    `<path d="M98 27a7 7 0 0 1 7-7h70a7 7 0 0 1 7 7v7H98z" fill="${FOLHA}"/>`);
  for (let k = 0; k < 5; k++) {
    const y = 44 + k * 14;
    c.push(`<line x1="104" y1="${y + 9}" x2="176" y2="${y + 9}" stroke="${LINHA}" stroke-width="1"/>` +
      `<rect x="106" y="${y + 1}" width="22" height="4" rx="2" fill="${LINHA}"/>` +
      `<rect x="${150 + (k * 7) % 12}" y="${y + 1}" width="${18 - (k * 5) % 9}" height="4" rx="2" fill="${FOLHA}"/>`);
  }
  c.push(`<rect x="128" y="106" width="44" height="17" rx="8.5" fill="${FOLHA}"/>` +
    `<text x="150" y="118" text-anchor="middle" font-size="9" fill="${PAPEL}" style="${TXT}">EXCEL</text></g>`);
  c.push(`<g transform="rotate(-4 84 82)"><rect x="40" y="26" width="88" height="112" rx="7" fill="${BRANCO}" stroke="${LINHA}" stroke-width="1.5"/>` +
    `<rect x="50" y="38" width="48" height="6" rx="3" fill="${MATA}"/>` +
    `<rect x="50" y="49" width="66" height="3.5" rx="1.75" fill="${LINHA}"/>` +
    `<rect x="50" y="56" width="56" height="3.5" rx="1.75" fill="${LINHA}"/>` +
    `<line x1="50" y1="100" x2="118" y2="100" stroke="${TINTA}" stroke-width="1.2"/>`);
  [26, 18, 32, 12, 22].forEach((h, k) => {
    c.push(`<rect x="${53 + k * 13}" y="${100 - h}" width="8" height="${h}" rx="1.5" fill="${k === 2 ? COBRE : MATA}"/>`);
  });
  c.push(`<rect x="50" y="108" width="66" height="3.5" rx="1.75" fill="${LINHA}"/>` +
    `<rect x="50" y="115" width="44" height="3.5" rx="1.75" fill="${LINHA}"/>` +
    `<rect x="76" y="122" width="40" height="17" rx="8.5" fill="${COBRE}"/>` +
    `<text x="96" y="134" text-anchor="middle" font-size="9" fill="${PAPEL}" style="${TXT}">PDF</text></g>`);
  c.push(`<circle cx="178" cy="128" r="14" fill="${MATA}"/>` +
    `<path d="M178 120v13M172.5 128l5.5 5.5 5.5-5.5M171 137h14" fill="none" stroke="${PAPEL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
  return svg(c.join(""), 220, 150, "pj-ilu", "Relatório em PDF e Excel");
}

// ------------------------------------------------------------------ hero: lâmina ao microscópio
export function microscopio() {
  const c = ['<defs><clipPath id="pj-campo"><circle cx="110" cy="110" r="96"/></clipPath></defs>'];
  c.push(`<circle cx="110" cy="110" r="104" fill="none" stroke="${MATA_PONTO}" stroke-width="6"/>`);
  c.push(`<circle cx="110" cy="110" r="96" fill="#0D3A31"/>`);
  const g = ['<g clip-path="url(#pj-campo)">'];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) g.push(`<circle cx="${14 + i * 24}" cy="${14 + j * 24}" r="2.6" fill="${MATA_PONTO}"/>`);
  g.push(`<path d="M110 14V206M14 110H206" stroke="${MATA_PONTO}" stroke-width="1" stroke-dasharray="3 5"/>`);
  const cx = 78, cy = 82;
  for (let a = 0; a < 14; a++) {
    const t = a / 14 * 2 * Math.PI;
    g.push(`<circle cx="${(cx + 25 * Math.cos(t)).toFixed(1)}" cy="${(cy + 19 * Math.sin(t)).toFixed(1)}" r="4" fill="${COBRE_CLARO}"/>`);
  }
  g.push(`<ellipse cx="${cx}" cy="${cy}" rx="23.5" ry="17.5" fill="${COBRE_CLARO}"/><ellipse cx="${cx}" cy="${cy}" rx="14" ry="10" fill="${COBRE}"/>`);
  const tx = 148, ty = 140;
  g.push(`<g transform="rotate(-28 ${tx} ${ty})"><ellipse cx="${tx}" cy="${ty}" rx="22" ry="12" fill="${PAPEL}"/>` +
    `<rect x="${tx - 29}" y="${ty - 4.5}" width="9" height="9" rx="4.5" fill="${PAPEL}"/>` +
    `<rect x="${tx + 20}" y="${ty - 4.5}" width="9" height="9" rx="4.5" fill="${PAPEL}"/>` +
    `<ellipse cx="${tx}" cy="${ty}" rx="14" ry="6.5" fill="${FOLHA}"/></g>`);
  const ex = 150, ey = 66;
  g.push(`<g transform="rotate(18 ${ex} ${ey})"><path d="M${ex - 9} ${ey - 22}C${ex + 16} ${ey - 20} ${ex + 16} ${ey + 20} ${ex - 9} ${ey + 22}` +
    `C${ex - 15} ${ey + 10} ${ex - 15} ${ey - 10} ${ex - 9} ${ey - 22}Z" fill="none" stroke="${PAPEL}" stroke-width="3"/>` +
    `<path d="M${ex - 5} ${ey - 12}C${ex + 7} ${ey - 8} ${ex + 7} ${ey + 8} ${ex - 5} ${ey + 12}" fill="none" stroke="${COBRE_CLARO}" stroke-width="3" stroke-linecap="round"/></g>`);
  const gx = 72, gy = 150;
  g.push(`<ellipse cx="${gx}" cy="${gy}" rx="19" ry="14" fill="none" stroke="${FOLHA}" stroke-width="3.2"/>`);
  for (const [dx, dy] of [[-6, -4], [6, -4], [-6, 5], [6, 5]]) g.push(`<circle cx="${gx + dx}" cy="${gy + dy}" r="3.2" fill="${FOLHA}"/>`);
  for (const [x, y, r] of [[118, 104, 7], [176, 104, 5.5], [112, 176, 6]]) {
    g.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${PAPEL}" stroke-width="2" opacity=".55"/>`);
  }
  g.push("</g>");
  c.push(g.join(""));
  c.push(`<path d="M48 52A90 90 0 0 1 96 22" fill="none" stroke="${PAPEL}" stroke-width="3" stroke-linecap="round" opacity=".25"/>`);
  return svg(c.join(""), 220, 220, "pj-hero-ilu", "Lâmina ao microscópio");
}

export const ETAPAS = [
  ["Planilha", "Preencha o modelo", "Uma linha por coleta de cada paciente (P1, P2, P3…), com o resultado de cada método.", planilha],
  ["Configuração", "Ajuste a análise", "Escolha os parasitos, marque patogênicos e comensais, e defina métodos, amostras e critérios de inclusão.", configurar],
  ["Análise", "Veja a prevalência", "Por paciente, separada entre fezes e lâmina (Graham), com IC 95% e comparação entre métodos.", prevalencia],
  ["Território · opcional", "Gere o mapa", "Com bairro e município na planilha, o painel mapeia a prevalência no padrão cartográfico.", mapa],
  ["Relatório", "Baixe tudo pronto", "Relatório em PDF e Excel, com tabelas, gráficos e mapa, pronto para o artigo.", relatorio],
];

// ================================================================== ícones (24×24)
function ico(corpo, tam = 20) {
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${corpo}</svg>`;
}

export const icones = {
  parasito: (cor = MATA, acento = COBRE) => ico(
    `<path d="M3.2 17.6C5.4 10.4 9.4 9.6 11.3 13.6S16 18.4 18 10.6" fill="none" stroke="${cor}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<circle cx="18.6" cy="7.8" r="3.1" fill="${acento}"/><circle cx="3.2" cy="17.6" r=".9" fill="${PAPEL}"/>`),
  microscopio: (cor = MATA, acento = COBRE) => ico(
    `<rect x="7.6" y="2" width="4.6" height="9.4" rx="1.6" fill="${cor}"/>` +
    `<rect x="8.7" y="11.2" width="2.4" height="2.3" rx=".6" fill="${acento}"/>` +
    `<rect x="4.2" y="14.6" width="9.6" height="2.2" rx="1.1" fill="${cor}"/>` +
    `<path d="M12.2 6.2H14a4.2 4.2 0 0 1 4.2 4.2V19.4" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<rect x="3.4" y="19" width="17.2" height="2.8" rx="1.4" fill="${cor}"/>`),
  pote: (cor = MATA, acento = COBRE) => ico(
    `<rect x="5.4" y="2.6" width="13.2" height="4.4" rx="1.3" fill="${acento}"/>` +
    `<path d="M6.4 8.6h11.2l-.9 11.3a2 2 0 0 1-2 1.8H9.3a2 2 0 0 1-2-1.8z" fill="${cor}"/>` +
    `<rect x="8.9" y="11.6" width="6.2" height="4.6" rx="1" fill="${PAPEL}" opacity=".9"/>`),
  criterios: (cor = MATA, acento = COBRE) => ico(
    `<path d="M2.6 3.4h14.2l-5.3 6.6v5.8l-3.6 2.4v-8.2z" fill="${cor}" stroke="${cor}" stroke-width="1" stroke-linejoin="round"/>` +
    `<circle cx="17.6" cy="17.4" r="4.9" fill="${acento}"/>` +
    `<path d="M15.3 17.5l1.6 1.6 3.1-3.2" fill="none" stroke="${PAPEL}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`),
  visao: (cor = MATA, acento = COBRE) => {
    const c = [`<rect x="2.5" y="21" width="19" height="1.6" rx=".8" fill="${cor}"/>`];
    for (const [x, n, topo] of [[6, 2, false], [12, 4, true], [18, 3, false]]) {
      for (let k = 0; k < n; k++) c.push(`<circle cx="${x}" cy="${r1(17.6 - k * 4.6)}" r="2.05" fill="${topo && k === n - 1 ? acento : cor}"/>`);
    }
    return ico(c.join(""));
  },
  paciente: (cor = MATA, acento = COBRE) => ico(
    `<circle cx="7.6" cy="7.6" r="3.4" fill="${cor}"/><path d="M1.8 20a5.8 5.8 0 0 1 11.6 0z" fill="${cor}"/>` +
    `<rect x="15.2" y="6" width="7" height="2.2" rx="1.1" fill="${cor}"/>` +
    `<rect x="15.2" y="11.2" width="7" height="2.2" rx="1.1" fill="${cor}"/>` +
    `<rect x="15.2" y="16.4" width="4.6" height="2.2" rx="1.1" fill="${acento}"/>`),
  baixar: (cor = MATA, acento = COBRE) => ico(
    `<path d="M12 3.2v10.6M7.4 9.6l4.6 4.6 4.6-4.6" fill="none" stroke="${acento}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M3.8 14.6v3.8a2.4 2.4 0 0 0 2.4 2.4h11.6a2.4 2.4 0 0 0 2.4-2.4v-3.8" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  mapa: (cor = MATA) => ico(
    `<path d="M2.4 6.4l6.2-2.2v15.4l-6.2 2.2z" fill="${FOLHA}"/>` +
    `<path d="M8.6 4.2l6.8 2.2v15.4l-6.8-2.2z" fill="${COBRE_CLARO}"/>` +
    `<path d="M15.4 6.4l6.2-2.2v15.4l-6.2 2.2z" fill="${cor}"/>` +
    `<path d="M2.4 6.4l6.2-2.2 6.8 2.2 6.2-2.2v15.4l-6.2 2.2-6.8-2.2-6.2 2.2z" fill="none" stroke="${cor}" stroke-width="1.2" stroke-linejoin="round"/>`),
  upload: (cor = MATA, acento = COBRE) => ico(
    `<path d="M12 14.4V3.8M7.4 8.4L12 3.8l4.6 4.6" fill="none" stroke="${acento}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M3.8 14.6v3.8a2.4 2.4 0 0 0 2.4 2.4h11.6a2.4 2.4 0 0 0 2.4-2.4v-3.8" fill="none" stroke="${cor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`, 28),
  cadeado: (cor = MATA, acento = COBRE) => ico(
    `<rect x="4.4" y="10.2" width="15.2" height="11" rx="2.4" fill="${cor}"/>` +
    `<path d="M7.8 10.2V7.6a4.2 4.2 0 0 1 8.4 0v2.6" fill="none" stroke="${cor}" stroke-width="2.4"/>` +
    `<circle cx="12" cy="15.4" r="1.9" fill="${acento}"/>`, 18),
};
