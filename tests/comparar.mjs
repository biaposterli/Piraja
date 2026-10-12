// Compara o motor em JavaScript (site/js) com o resultado de referência do
// motor original em Python, caso a caso.
//
// Uso: node tests/comparar.mjs <pasta_dos_casos> [caminho_node_modules]
// (a pasta é gerada por tests/gerar_casos.py; node_modules precisa ter exceljs)

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const pasta = process.argv[2];
const nm = process.argv[3] || path.resolve("node_modules");
const require = createRequire(path.join(nm, "x.js"));
globalThis.ExcelJS = require("exceljs");

const { lerPlanilha } = await import("../site/js/tabela.js");
const { prepararPlanilha, estadoInicialConfig, analisar } = await import("../site/js/pipeline.js");
const { coletasDuplicadas, coletasNaoReconhecidas } = await import("../site/js/engine.js");
const { abasConfig } = await import("../site/js/config.js");

// ---- deixa os objetos do JS no mesmo formato do JSON do Python
function linhaPaciente(r) {
  const o = { ...r };
  delete o.metodos;
  for (const [nm, v] of Object.entries(r.metodos || {})) {
    o[`positivo_${nm}`] = v.positivo;
    o[`status_${nm}`] = v.status;
    o[`especies_${nm}`] = v.especies;
  }
  return o;
}
const TABELAS_PACIENTE = ["por_paciente", "analisavel", "fecal", "apenas_lamina", "fecal_conclusivo", "fecal_inconclusivo",
  "lamina_conclusivo", "lamina_inconclusivo", "lamina_only_conclusivo", "lamina_only_inconclusivo", "combinada_base",
  "combinada_inconclusiva"];

function formatoPython(m) {
  const o = { ...m };
  delete o.config;
  for (const k of TABELAS_PACIENTE) o[k] = m[k].map(linhaPaciente);
  return JSON.parse(JSON.stringify(o));
}

function abasParaRecords(abas) {
  const out = {};
  for (const [nome, mat] of Object.entries(abas)) {
    const [cab, ...linhas] = mat;
    out[nome] = linhas.map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
  }
  return out;
}

// ---- comparação profunda com relatório da 1ª diferença
function diff(a, b, caminho, saida) {
  if (saida.length > 12) return;
  if (a === b) return;
  if (typeof a === "number" && typeof b === "number" && Object.is(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { saida.push(`${caminho}: tamanho ${a.length} (py) x ${b.length} (js)`); return; }
    a.forEach((x, i) => diff(x, b[i], `${caminho}[${i}]`, saida));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of ks) {
      if (!(k in b)) { saida.push(`${caminho}.${k}: só no Python (${JSON.stringify(a[k]).slice(0, 80)})`); continue; }
      if (!(k in a)) { saida.push(`${caminho}.${k}: só no JS (${JSON.stringify(b[k]).slice(0, 80)})`); continue; }
      diff(a[k], b[k], `${caminho}.${k}`, saida);
    }
    return;
  }
  saida.push(`${caminho}: ${JSON.stringify(a)} (py) x ${JSON.stringify(b)} (js)`);
}

// tabelas ordenadas por contagem/prevalência: o pandas não garante a ordem dos
// empates (varia até com o processador), então a comparação ignora a ordem
// entre linhas empatadas
const ORDENADAS = { especies_resumo: "n", especies_lamina_resumo: "n", combos_resumo: "n", todos_parasitos_resumo: "prevalencia" };
function semOrdemDeEmpate(m) {
  if (!m) return;
  for (const [t, campo] of Object.entries(ORDENADAS)) {
    if (!Array.isArray(m[t])) continue;
    m[t] = [...m[t]].sort((a, b) => (b[campo] - a[campo]) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
}

const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".xlsx")).sort();
let ok = 0, falhas = 0;
for (const f of arquivos) {
  const ref = JSON.parse(readFileSync(path.join(pasta, f.replace(".xlsx", ".py.json")), "utf8"));
  const buf = readFileSync(path.join(pasta, f));
  const planilha = await lerPlanilha(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), f);
  const prep = prepararPlanilha(planilha);
  const js = { cfg_planilha: JSON.parse(JSON.stringify(prep.cfgPlanilha)) };
  if (prep.erros.length) js.erro_leitura = true;
  else {
    const est = estadoInicialConfig(prep.df, prep.cfgPlanilha);
    const r = analisar(prep.df, est);
    Object.assign(js, {
      par: est.par, met: est.met, n: est.n, max: est.max, avisos: est.avisos, avisos_cfg: r.avisosCfg,
      cfg: {
        renomear: Object.fromEntries(r.cfg.renomear), excluidos: [...r.cfg.excluidos].sort(),
        categorias: Object.fromEntries(r.cfg.categorias), metodos: r.cfg.metodos,
        n_amostras: r.cfg.n_amostras, criterios: r.cfg.criterios,
      },
      abas_config: abasParaRecords(abasConfig(est.par, est.met, est.n, est.crit)),
      erros_validacao: r.erros,
    });
    if (!r.erros.length) {
      js.metrics = formatoPython(r.metrics);
      js.duplicadas = coletasDuplicadas(prep.df);
      js.nao_reconhecidas = coletasNaoReconhecidas(prep.df);
    }
  }
  semOrdemDeEmpate(ref.metrics);
  if (js.metrics) semOrdemDeEmpate(js.metrics);
  const saida = [];
  diff(ref, JSON.parse(JSON.stringify(js)), "", saida);
  if (saida.length) {
    falhas++;
    console.log(`✗ ${f}`);
    for (const s of saida) console.log("   " + s);
  } else ok++;
}
console.log(`\n${ok} de ${arquivos.length} casos idênticos ao Python` + (falhas ? ` — ${falhas} com diferença` : ""));
process.exit(falhas ? 1 : 0);
