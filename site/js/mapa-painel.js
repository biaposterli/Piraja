// Painel do mapa (opcional) na Visão geral — mesmos controles do app original:
// nível, indicador, classes, recorte, estilo, limites dos bairros e rótulos.

import { esc } from "./util.js";
import { opcoesRecorte, prepararCena, NOME_UF, REGIOES, lerLimites, colunaNomeProvavel, chave } from "./mapa-dados.js";
import { figuraEstatica, mapaInterativo, svgParaCanvas, canvasParaPng, canvasParaTiff } from "./mapa-desenho.js";
import { icones } from "./ilustracoes.js";

function radios(nome, legenda, opcoes, atual, dica = "") {
  return `<fieldset class="pj-radio"${dica ? ` data-dica="${esc(dica)}"` : ""}><legend>${esc(legenda)}</legend><div class="opcoes">` +
    opcoes.map(([v, r]) => `<label><input type="radio" name="${nome}" value="${esc(v)}"${v === atual ? " checked" : ""}> ${esc(r)}</label>`).join("") +
    `</div></fieldset>`;
}

function seletor(nome, legenda, opcoes, atual, rotulo = (v) => v) {
  return `<label class="pj-campo"><span>${esc(legenda)}</span><select name="${nome}">` +
    opcoes.map((v) => `<option value="${esc(v)}"${v === atual ? " selected" : ""}>${esc(rotulo(v))}</option>`).join("") + `</select></label>`;
}

const alerta = (tipo, t) => `<div class="pj-alerta ${tipo}">${t}</div>`;

export async function montarPainelMapa(raiz, metrics, aoGerarFigura) {
  const E = {
    nivel: "municipio", indicador: "todos", classes: "auto", estilo: "areas", fonteBairros: "ibge",
    recorte: { municipio: "brasil", bairro: "municipio" }, valor: {}, rotulos: new Map(),
    limites: null, nomeArquivo: null, colNome: null, seq: 0,
  };
  raiz.innerHTML = `<div class="pj-mapa-ctrl"></div><div class="pj-mapa-saida"></div>`;
  const ctrl = raiz.querySelector(".pj-mapa-ctrl"), saida = raiz.querySelector(".pj-mapa-saida");

  const opc = () => opcoesRecorte(metrics, E.nivel);

  function nAreas(recorte, valor) {
    const tab = metrics[E.nivel === "municipio" ? "territorio_municipio" : "territorio_bairro"];
    const uf = (r) => String(r.uf).toUpperCase();
    if (recorte === "brasil") return tab.length;
    if (recorte === "regiao") return tab.filter((r) => (REGIOES[valor] || []).includes(uf(r))).length;
    if (recorte === "estado") return tab.filter((r) => uf(r) === valor).length;
    return tab.filter((r) => `${r.municipio}/${uf(r)}` === valor).length;
  }

  function renderCtrl() {
    const rec = E.recorte[E.nivel];
    const o = opc();
    let valor = null;
    if (rec !== "brasil") {
      const lista = o[rec] || [];
      if (!lista.includes(E.valor[`${E.nivel}:${rec}`])) E.valor[`${E.nivel}:${rec}`] = lista[0] ?? null;
      valor = E.valor[`${E.nivel}:${rec}`];
    }
    let h = `<div class="pj-controles">` +
      radios("nivel", "Nível", [["municipio", "Município"], ["bairro", "Bairro"]], E.nivel) +
      radios("indicador", "Indicador", [["todos", "Todos os parasitos"], ["patogenicos", "Somente patogênicos"]], E.indicador) +
      radios("classes", "Classes de prevalência", [["auto", "Automáticas"], ["fixas", "Fixas"]], E.classes,
        "Automáticas: 5 faixas de 5 em 5 pontos (ou mais largas) a partir dos dados. Fixas: <10, 10–20, 20–40, 40–60, ≥60% — use para comparar estudos.") +
      `</div><div class="pj-controles">` +
      radios("recorte", "Recorte do mapa", [["brasil", "Brasil"], ["regiao", "Região"], ["estado", "Estado"], ["municipio", "Município"]], rec,
        "Enquadramento do mapa: o Brasil inteiro, uma região (Norte, Nordeste...), um estado ou um município. Só entram os dados de dentro do recorte.");
    if (rec === "regiao") h += seletor("valor", "Região", o.regiao, valor);
    else if (rec === "estado") h += seletor("valor", "Estado", o.estado, valor, (u) => `${NOME_UF[u] || u} (${u})`);
    else if (rec === "municipio") h += seletor("valor", "Município", o.municipio, valor);
    if (E.nivel === "municipio") {
      h += radios("estilo", "Estilo", [["areas", "Áreas coloridas"], ["pontos", "Círculos"]], E.estilo,
        "Áreas: cada município pintado pela prevalência. Círculos: um círculo por município (cor = prevalência, tamanho = nº de pacientes) — melhor quando os municípios ficam pequenos na escala do mapa.");
    }
    h += `</div>`;
    if (E.nivel === "bairro") {
      h += `<div class="pj-controles">` + radios("fonteBairros", "Limites dos bairros",
        [["ibge", "Malha de bairros do IBGE (Censo 2022)"], ["arquivo", "Arquivo próprio (ex.: prefeitura)"]], E.fonteBairros,
        "A malha do IBGE só tem bairros nos municípios com divisão oficial em bairros. Se o seu município não tiver, ou se preferir os limites da prefeitura, envie um arquivo próprio.") + `</div>`;
      if (E.fonteBairros === "arquivo") {
        h += `<div class="pj-legenda">Envie os limites dos bairros em GeoJSON, ou shapefile compactado em .zip (com os arquivos .shp, .shx, .dbf e .prj). ` +
          `Os principais sistemas de coordenadas usados no Brasil (SIRGAS 2000, SAD69, WGS 84, geográficos ou UTM) são convertidos para SIRGAS 2000.</div>` +
          `<label class="pj-btn sec peq" style="cursor:pointer">${icones.upload("#11483D", "#9C4A2F").replace('width="28" height="28"', 'width="18" height="18"')} ` +
          `Arquivo de limites dos bairros<input type="file" name="limites" accept=".geojson,.json,.zip" hidden></label> ` +
          `<span class="pj-legenda">${E.nomeArquivo ? esc(E.nomeArquivo) : "nenhum arquivo"}</span>`;
        if (E.limites) {
          h += `<div style="max-width:420px">` + seletor("colNome", "Coluna com o nome do bairro no arquivo", E.limites.cols, E.colNome) + `</div>`;
        }
      }
    }
    if (rec === "brasil" || valor) {
      const chaveRot = `${E.nivel}:${rec}:${valor}`;
      if (!E.rotulos.has(chaveRot)) E.rotulos.set(chaveRot, nAreas(rec, valor) <= 15);
      h += `<label class="pj-check" data-dica="Com muitas áreas pequenas os rótulos se sobrepõem; os valores continuam ao passar o mouse no mapa interativo.">` +
        `<input type="checkbox" name="rotulos"${E.rotulos.get(chaveRot) ? " checked" : ""}> Mostrar nome e valor dentro das áreas</label>`;
    }
    ctrl.innerHTML = h;
  }

  async function gerar() {
    const seq = ++E.seq;
    const rec = E.recorte[E.nivel];
    const valor = rec === "brasil" ? null : E.valor[`${E.nivel}:${rec}`];
    aoGerarFigura(null);
    if (rec !== "brasil" && !valor) { saida.innerHTML = alerta("info", "Não há pacientes com essa informação para montar este recorte."); return; }
    if (E.nivel === "bairro" && E.fonteBairros === "arquivo") {
      if (!E.limites) { saida.innerHTML = alerta("info", "Envie o arquivo de limites dos bairros para gerar este mapa."); return; }
      if (!E.limites.cols.length) { saida.innerHTML = alerta("erro", "O arquivo de limites não tem nenhuma coluna de texto com o nome do bairro."); return; }
    }
    saida.innerHTML = `<div class="pj-carregando">Desenhando o mapa… (a malha do IBGE é baixada só na primeira vez)</div>`;
    let r;
    try {
      r = await prepararCena(metrics, {
        nivel: E.nivel, indicador: E.indicador, modoClasses: E.classes,
        limites: E.nivel === "bairro" && E.fonteBairros === "arquivo" ? E.limites : null, colNome: E.colNome,
        mostrarRotulos: E.rotulos.get(`${E.nivel}:${rec}:${valor}`) ?? null,
        recorte: rec, recorteValor: valor, estilo: E.nivel === "municipio" ? E.estilo : "areas",
      });
    } catch (e) {
      console.error(e);
      if (seq === E.seq) saida.innerHTML = alerta("erro", `Não foi possível gerar o mapa (${esc(e.message || e)}).`);
      return;
    }
    if (seq !== E.seq) return;
    let h = (r.avisos || []).map((a) => alerta("aviso", esc(a))).join("");
    if (!r.ok) { saida.innerHTML = h + alerta("info", esc(r.erro)); return; }
    const svg = figuraEstatica(r.cena);
    h += `<div class="pj-mapa"></div>` +
      `<div class="pj-legenda" style="margin-top:8px">Figura para artigo (300 dpi), com rosa dos ventos, escala, grade de coordenadas, mapa de localização, legenda e fonte. Ela também entra no relatório em PDF.</div>` +
      `<details class="pj-exp"><summary>Ver a figura para artigo</summary><div class="corpo pj-figura"><div class="pj-carregando">Preparando a figura…</div></div></details>` +
      `<div class="pj-btns"><button class="pj-btn" type="button" data-mapa="png" disabled>${icones.baixar("#F4F1EA", "#F4F1EA")} Figura PNG (300 dpi)</button>` +
      `<button class="pj-btn" type="button" data-mapa="tiff" disabled>${icones.baixar("#F4F1EA", "#F4F1EA")} Figura TIFF (300 dpi)</button></div>`;
    saida.innerHTML = h;
    mapaInterativo(saida.querySelector(".pj-mapa"), r.cena);
    const nomeBase = `mapa_prevalencia_${E.nivel}_${rec}` + (valor ? "_" + chave(valor).replaceAll(" ", "-").replaceAll("/", "-") : "");
    try {
      const cv = await svgParaCanvas(svg, 2);
      if (seq !== E.seq) return;
      const png = await canvasParaPng(cv, 300);
      const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
      saida.querySelector(".pj-figura").innerHTML = `<img src="${url}" alt="${esc(r.titulo)}">`;
      const bPng = saida.querySelector('[data-mapa="png"]'), bTif = saida.querySelector('[data-mapa="tiff"]');
      bPng.disabled = bTif.disabled = false;
      bPng.onclick = () => baixarBlob(new Blob([png], { type: "image/png" }), `${nomeBase}.png`);
      bTif.onclick = () => baixarBlob(new Blob([canvasParaTiff(cv, 300)], { type: "image/tiff" }), `${nomeBase}.tiff`);
      aoGerarFigura({ titulo: r.titulo, dataUrl: cv.toDataURL("image/png") });
    } catch (e) {
      console.error(e);
      saida.querySelector(".pj-figura").innerHTML = alerta("erro", `Não foi possível preparar a figura (${esc(e.message || e)}).`);
    }
  }

  function baixarBlob(blob, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  ctrl.addEventListener("change", async (e) => {
    const t = e.target;
    const rec = E.recorte[E.nivel];
    if (t.name === "nivel") E.nivel = t.value;
    else if (t.name === "indicador") E.indicador = t.value;
    else if (t.name === "classes") E.classes = t.value;
    else if (t.name === "estilo") E.estilo = t.value;
    else if (t.name === "fonteBairros") E.fonteBairros = t.value;
    else if (t.name === "recorte") E.recorte[E.nivel] = t.value;
    else if (t.name === "valor") E.valor[`${E.nivel}:${rec}`] = t.value;
    else if (t.name === "colNome") E.colNome = t.value;
    else if (t.name === "rotulos") E.rotulos.set(`${E.nivel}:${rec}:${E.valor[`${E.nivel}:${rec}`] ?? null}`, t.checked);
    else if (t.name === "limites" && t.files[0]) {
      const f = t.files[0];
      try {
        E.limites = await lerLimites(await f.arrayBuffer(), f.name);
        E.nomeArquivo = f.name;
        E.colNome = colunaNomeProvavel(E.limites.cols);
      } catch (err) {
        E.limites = null;
        E.nomeArquivo = f.name;
        renderCtrl();
        saida.innerHTML = alerta("erro", `Não consegui ler esse arquivo de limites (${esc(err.message || err)}).`);
        return;
      }
    }
    renderCtrl();
    gerar();
  });

  renderCtrl();
  await gerar();
}
