# Pirajá · versão web (site estático)

A pasta **`site/`** é o Pirajá inteiro como site estático: HTML, CSS e JavaScript.
Não há servidor nem banco de dados — a planilha é lida e analisada **no navegador de
quem usa** e nenhum dado sai do computador dela. Por isso o site pode ser publicado
em qualquer hospedagem de arquivos estáticos (Cloudflare Pages, GitHub Pages,
Netlify, um servidor do laboratório ou até um pendrive com um servidor local).

## O que tem em `site/`

| Pasta / arquivo | Conteúdo |
|---|---|
| `index.html`, `css/` | página e identidade visual (Fraunces + Instrument Sans, servidas pelo próprio site) |
| `js/engine.js`, `js/config.js` | motor de análise e configuração — tradução de `analysis_engine.py` e `analysis_config.py` |
| `js/relatorio.js`, `js/graficos.js`, `js/tabelas.js` | relatório na tela (passo 04), gráficos em SVG |
| `js/planilhas.js`, `js/pdf.js` | modelo, configuração e relatório em Excel; relatório em PDF |
| `js/mapa-*.js` | mapas (figura para artigo em PNG/TIFF 300 dpi e mapa interativo) |
| `geo/` | malhas do IBGE (as mesmas usadas pelo app em Python) |
| `brand/` | logotipos e fontes |
| `vendor/` | bibliotecas de terceiros (sem depender de CDN; licenças em `vendor/LICENCAS.txt`) |
| `_headers` | cabeçalhos HTTP (cache e segurança) — lido pelo Cloudflare Pages e pelo Netlify |

## Testar no próprio computador

```bash
cd site
python3 -m http.server 8000
```

e abrir <http://localhost:8000>. (Abrir o `index.html` direto com duplo clique não
funciona: o navegador bloqueia os módulos JavaScript fora de um servidor.)

## Antes de tudo: o site precisa estar na branch `main`

O Cloudflare publica a branch `main`. Enquanto o pull request com a pasta `site/`
não for aceito (*merge*), a `main` não tem o site e a implantação falha.

## Publicar no Cloudflare — fluxo "Workers" (o padrão atual do painel)

1. **Workers & Pages → Create → Import a repository** e escolha **Piraja**.
2. Deixe os campos assim (o arquivo `wrangler.jsonc` na raiz já diz ao Cloudflare
   que o site é a pasta `site/`):
   - **Build command:** deixe em branco
   - **Deploy command:** `npx wrangler deploy`
3. **Deploy.** O endereço fica `piraja.<sua-conta>.workers.dev`.

## Publicar no Cloudflare Pages (endereço gratuito `*.pages.dev`)

1. No painel do Cloudflare: **Workers & Pages → Create application → Pages →
   Import an existing Git repository**.
2. Autorize o GitHub e escolha o repositório **Piraja**; clique em **Begin setup**.
3. Preencha:
   - **Project name:** `piraja` (vira o endereço `piraja.pages.dev`, se estiver livre)
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** `exit 0`
   - **Build output directory:** `site`
4. **Save and Deploy.** A cada `git push` na `main` o site é atualizado sozinho;
   pull requests ganham um endereço de prévia.

Para usar um domínio próprio depois: no projeto, **Custom domains → Set up a custom domain**.

### Alternativa sem GitHub (envio direto)

No mesmo painel, **Create application → Pages → Upload assets**, e arraste a pasta
`site/`. Para atualizar, envie a pasta de novo.

## Atualizar as malhas do mapa

Se os arquivos em `site/geo/` mudarem, gere de novo os auxiliares (contorno dos
estados, índice de municípios e lista de arquivos):

```bash
pip install shapely
python3 tools/preparar_geo.py
```

## Testes

`tests/` compara o motor em JavaScript com o motor original em Python em centenas de
planilhas aleatórias (com coletas repetidas, rótulos fora do padrão, "Amostra
insuficiente", "Não realizado", critérios de inclusão, território etc.):

```bash
pip install pandas openpyxl
python3 tests/gerar_casos.py /tmp/casos 150 11      # gera planilhas + resultado do Python
npm install exceljs                                  # numa pasta qualquer
node tests/comparar.mjs /tmp/casos <pasta>/node_modules
```

A única diferença esperada é a **ordem entre espécies empatadas** nas tabelas: no
pandas ela não é garantida (varia até com o processador); no site, empates ficam em
ordem alfabética.

## E o app em Python (Streamlit)?

Continua funcionando (`streamlit run app.py`) e é a referência dos cálculos. Ele
agora lê as malhas e a marca de `site/geo` e `site/brand`, que são compartilhadas
com a versão web.
