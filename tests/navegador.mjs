// Teste do site num navegador real (Chromium headless): abre a página, envia
// uma planilha, percorre as abas e salva capturas de tela. Registra qualquer
// erro do console.
//
// Uso: node tests/navegador.mjs <url_do_site> <planilha.xlsx> <pasta_saida> [roteiro]
// (precisa de puppeteer-core e @sparticuz/chromium no node_modules indicado
// por NODE_PATH ou na pasta atual)

import { createRequire } from "node:module";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const [url, planilha, saida, roteiro = "basico"] = process.argv.slice(2);
const req = createRequire(path.join(process.env.NAV_MODULES || process.cwd(), "x.js"));
const chromium = req("@sparticuz/chromium");
const puppeteer = req("puppeteer-core");
mkdirSync(saida, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await (chromium.default || chromium).executablePath(),
  args: [...(chromium.default || chromium).args, "--allow-file-access-from-files"],
  headless: true, defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const erros = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => erros.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => erros.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const cap = async (nome, opts = {}) => {
  await page.screenshot({ path: path.join(saida, `${nome}.png`), fullPage: opts.full ?? true });
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await cap("01-inicio", { full: false });

const client = await page.createCDPSession();
await client.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: path.resolve(saida) });

if (planilha) {
  const input = await page.$("#arquivo");
  await input.uploadFile(planilha);
  try {
    await page.waitForSelector("#passo-3, #msgs-arquivo .pj-alerta", { timeout: 60000 });
  } catch (e) {
    await cap("erro");
    console.log("tempo esgotado esperando o passo 3\n" + erros.join("\n"));
    await browser.close();
    process.exit(1);
  }
  await esperar(800);
  await cap("02-config");
  if (await page.$("#relatorio .pj-abas")) {
    const abas = await page.$$eval("#relatorio .pj-abas[data-grupo=rel] .pj-aba", (bs) => bs.map((b) => b.dataset.aba));
    for (const a of abas) {
      await page.click(`#relatorio .pj-aba[data-aba="${a}"]`);
      await esperar(300);
      const el = await page.$(`[data-painel="${a}"]`);
      await el.screenshot({ path: path.join(saida, `03-${a}.png`) });
    }
  }
  if (roteiro.includes("mapa")) {
    await page.click(`#relatorio .pj-aba[data-aba="rel-geral"]`);
    await page.click("#mapa-on");
    const esperarFigura = async (nome) => {
      try {
        await page.waitForSelector("#painel-mapa .pj-figura img, #painel-mapa .pj-alerta.info, #painel-mapa .pj-alerta.erro", { timeout: 120000 });
      } catch { console.log("mapa não terminou: " + nome); }
      await esperar(600);
      const el = await page.$("#painel-mapa");
      await el.screenshot({ path: path.join(saida, `mapa-${nome}.png`) });
      const img = await page.$("#painel-mapa .pj-figura img");
      if (img) {
        const src = await page.$eval("#painel-mapa .pj-figura img", (i) => i.src);
        const b64 = await page.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }, src);
        writeFileSync(path.join(saida, `figura-${nome}.png`), Buffer.from(b64, "base64"));
      }
    };
    await esperarFigura("municipio-brasil");
    for (const passo of (process.env.MAPA_PASSOS || "").split(";").filter(Boolean)) {
      // formato: nome=valor,nome=valor|rotulo
      const [pares, nome] = passo.split("|");
      for (const par of pares.split(",")) {
        const [n, v] = par.split("=");
        await page.evaluate((n, v) => {
          const el = document.querySelector(`#painel-mapa [name="${n}"][value="${v}"]`) || document.querySelector(`#painel-mapa select[name="${n}"]`);
          if (el.tagName === "SELECT") el.value = v; else el.checked = true;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, n, v);
        await esperar(300);
      }
      await esperarFigura(nome);
    }
  }
  if (roteiro.includes("exportar")) {
    await page.click(`#relatorio .pj-aba[data-aba="rel-exportar"]`);
    for (const acao of ["baixar-excel", "baixar-pdf"]) {
      await page.click(`[data-acao="${acao}"]`);
      await page.waitForFunction((a) => !document.querySelector(`[data-acao="${a}"]`).disabled, { timeout: 120000 }, acao);
      await esperar(1500);
    }
    await page.click(`[data-acao="baixar-config"]`);
    await esperar(1500);
    await page.click(`[data-acao="baixar-planilha-config"]`);
    await esperar(1500);
    await page.click(`#passo-1 [data-acao="baixar-modelo"]`);
    await esperar(2500);
  }
}
writeFileSync(path.join(saida, "erros.txt"), erros.join("\n"));
console.log(erros.length ? erros.join("\n") : "sem erros no console");
await browser.close();
