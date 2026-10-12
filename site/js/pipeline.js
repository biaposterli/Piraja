// Fluxo do app (passos 02 → 03 → relatório), sem interface: escolhe a aba de
// dados, lê a configuração da planilha, monta as tabelas do passo 03 e calcula.
// Usado pelo site e pelos testes que comparam com o motor em Python.

import { normalizeColumns, REQUIRED_COLUMNS, CRITERIOS_PADRAO, validateColumns, computeMetrics } from "./engine.js";
import { CONFIG_SHEETS, detectarColunasMetodo, lerConfigDaPlanilha, montarTabelasIniciais, construirConfig } from "./config.js";
import { tabelaDeMatriz } from "./tabela.js";

/** Planilha lida (lerPlanilha) -> { df, cfgPlanilha, aba } ou { erros }. */
export function prepararPlanilha(planilha) {
  const cfgKeys = new Set(CONFIG_SHEETS.map((x) => x.trim().toLowerCase()));
  let abasDados = planilha.nomes.filter((s) => !cfgKeys.has(s.trim().toLowerCase()));
  if (!abasDados.length) abasDados = planilha.nomes;
  if (!abasDados.length) return { erros: ["A planilha não tem nenhuma aba."] };
  const aba = abasDados.find((s) => s.trim().toLowerCase() === "dados") || abasDados[0];
  const df = normalizeColumns(tabelaDeMatriz(planilha.abas[aba]));
  const cfgPlanilha = lerConfigDaPlanilha(planilha);
  const erros = [];
  const faltando = REQUIRED_COLUMNS.filter((c) => !df.columns.includes(c));
  if (faltando.length) {
    erros.push(`Colunas ausentes: ${faltando.join(", ")}. Baixe o modelo novamente e confira os cabeçalhos.`);
  } else if (!detectarColunasMetodo(df).length && !cfgPlanilha.metodos) {
    erros.push("Nenhuma coluna de método encontrada (cabeçalhos 'metodo_<nome>'). Confira a planilha " +
      "ou inclua a aba Config_Metodos indicando as colunas de resultado.");
  }
  return { df, cfgPlanilha, aba, erros };
}

/** Estado inicial do passo 03 (o mesmo que o app monta ao receber a planilha). */
export function estadoInicialConfig(df, cfgPlanilha) {
  const t = montarTabelasIniciais(df, cfgPlanilha);
  return {
    par: t.parasitos, met: t.metodos, n: t.n, max: t.maxObs, avisos: t.avisos,
    crit: { ...CRITERIOS_PADRAO, ...(cfgPlanilha.criterios || {}) },
    origem: Object.keys(cfgPlanilha).sort(),
  };
}

/** Configuração (estado do passo 03) -> { cfg, avisosCfg, erros, metrics }. */
export function analisar(df, estado) {
  const { cfg, avisos } = construirConfig(estado.par, estado.met, estado.n, estado.crit);
  const erros = validateColumns(df, cfg.metodos);
  if (erros.length) return { cfg, avisosCfg: avisos, erros, metrics: null };
  return { cfg, avisosCfg: avisos, erros: [], metrics: computeMetrics(df, cfg) };
}
