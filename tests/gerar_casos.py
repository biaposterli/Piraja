"""Gera planilhas de teste aleatórias (com casos difíceis) e o resultado de
referência calculado pelo motor ORIGINAL em Python.

Uso:  python3 tests/gerar_casos.py <pasta_saida> [n_casos] [semente]

Para cada caso grava caso_NNN.xlsx e caso_NNN.py.json (métricas do Python).
O teste em JavaScript (comparar.mjs) lê as mesmas planilhas e compara.
"""
import io
import json
import math
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from analysis_engine import (  # noqa: E402
    METHOD_CATALOG, PARASITE_MAP, TODAS, compute_metrics, normalize_columns, validate_columns,
    coletas_duplicadas, coletas_nao_reconhecidas,
)
from analysis_config import (  # noqa: E402
    CONFIG_SHEETS, abas_config_modelo, construir_config, detectar_colunas_metodo, ler_config_da_planilha,
    montar_tabelas_iniciais, _abas_config,
)

ESPECIES_EXTRA = ["Cryptosporidium sp.", "Cyclospora", "ovos de Toxocara", "Isospora belli", "Na"]
STATUS = ["Entregue", "Entregue", "Entregue", "Não entregue", "nao entregue", "ENTREGUE ", "", None, "Entregue"]
BAIRROS = [("Lagoa Nova", "Natal", "RN"), ("lagoa nova", "Natal", "rn"), ("Felipe Camarão", "Natal", "RN"),
           ("Felipe Camarao", "natal", ""), ("Ponta Negra", "Natal", "RN"), ("Centro", "Parnamirim", "RN"),
           ("Centro", "João Pessoa", "PB"), ("Mangabeira", "João Pessoa", "PB"), ("", "Natal", "RN"),
           ("Tirol", "", ""), ("Capão Redondo", "São Paulo", "SP"), ("Ceilândia", "Brasília", "DF"),
           ("", "", ""), ("Alecrim", "Natal", None)]


def token_especie(rng):
    if rng.random() < 0.08:
        return rng.choice(ESPECIES_EXTRA)
    k = rng.choice(list(PARASITE_MAP))
    r = rng.random()
    if r < 0.15:
        k = k.replace(". ", ".")
    elif r < 0.25:
        k = k.replace(". ", " .")
    elif r < 0.35:
        k = k.upper()
    elif r < 0.45:
        k = k.title()
    if rng.random() < 0.1:
        k += rng.choice([" (+)", " (++)", " +++", "  (+++)"])
    return k


def celula(rng, dominio):
    r = rng.random()
    if r < 0.40:
        return rng.choice(["-", "Negativo", "neg", "NEGATIVO", " - "])
    if r < 0.47:
        return rng.choice(["Amostra insuficiente", "insuficiente", "AMOSTRA INSUFICIENTE"])
    if r < 0.52:
        return rng.choice(["Não realizado", "nao realizado", "Não feito", "não executado"])
    if r < 0.56:
        return rng.choice([None, "", "NA", "  "])
    n = 1 if rng.random() < 0.7 else rng.choice([2, 2, 3])
    if dominio == "lamina" and rng.random() < 0.7:
        esp = ["Enterobius vermicularis" if rng.random() < 0.5 else "E. vermicularis"]
        if n > 1:
            esp.append(token_especie(rng))
    else:
        esp = [token_especie(rng) for _ in range(n)]
    sep = rng.choice([" + ", "+", ", ", " +  "])
    return sep.join(esp)


def gerar_caso(rng, idx):
    metodos = [m for m in METHOD_CATALOG if rng.random() < 0.55]
    if not any(m[3] == "fecal" for m in metodos) and rng.random() < 0.8:
        metodos.append(METHOD_CATALOG[1])
    if rng.random() < 0.4:
        metodos.append(("metodo_hpj", "HPJ", "status_amostra", "fecal"))
        metodos.append(("metodo_willis", "Willis", "status_amostra", "fecal"))
    vistos = set()
    metodos = [m for m in metodos if not (m[0] in vistos or vistos.add(m[0]))]
    extras = []
    if rng.random() < 0.25:
        extras.append(("metodo_lugol_direto", "fecal"))
    if rng.random() < 0.15:
        extras.append(("metodo_swab_anal", "lamina"))

    n_pac = rng.choice([1, 3, 8, 20, 45, 90, 160])
    max_p = rng.choice([1, 2, 3, 3, 4, 6])
    tem_terr = rng.random() < 0.6
    nome_col = "nome_crianca" if rng.random() < 0.15 else "nome_paciente"
    linhas = []
    for p in range(n_pac):
        pid = rng.choice([f"F-{p + 1:03d}", f"f-{p + 1:03d}" if rng.random() < 0.02 else f"F-{p + 1:03d}",
                          str(p + 1) if rng.random() < 0.1 else f"F-{p + 1:03d}"])
        n_col = rng.randint(1, max_p)
        coletas = sorted(rng.sample(range(1, max_p + 1), n_col))
        b, mu, uf = rng.choice(BAIRROS)
        for k in coletas:
            rot = f"P{k}"
            r = rng.random()
            if r < 0.04:
                rot = f"p{k}"
            elif r < 0.07:
                rot = f" P{k} "
            elif r < 0.09:
                rot = f"P {k}"
            elif r < 0.10:
                rot = str(k)
            elif r < 0.105:
                rot = None
            row = {"id_paciente": pid, "coleta": rot, nome_col: f"Paciente {p}",
                   "status_amostra": rng.choice(STATUS), "status_lamina": rng.choice(STATUS)}
            if tem_terr:
                if rng.random() < 0.05:
                    b2, mu2, uf2 = rng.choice(BAIRROS)
                else:
                    b2, mu2, uf2 = b, mu, uf
                row.update({"bairro": b2 or None, "municipio": mu2 or None, "uf": uf2 or None})
            for col, _, _, dom in metodos:
                row[col] = celula(rng, dom)
            for col, dom in extras:
                row[col] = celula(rng, dom)
            linhas.append(row)
            if rng.random() < 0.03:  # coleta repetida
                linhas.append(dict(row))
    rng.shuffle(linhas) if rng.random() < 0.3 else None
    if rng.random() < 0.1:
        linhas.append({"id_paciente": None, "coleta": None})
    df = pd.DataFrame(linhas)
    if rng.random() < 0.1:
        df = df.rename(columns={"municipio": "Município", "bairro": "Bairro"})
    if rng.random() < 0.1:
        df = df.rename(columns={"id_paciente": "ID Paciente", "status_amostra": " Status Amostra"})

    abas_cfg = {}
    if rng.random() < 0.45:
        # configuração na planilha: a da própria análise padrão, com mudanças
        especies = sorted(set(PARASITE_MAP.values()))
        par = pd.DataFrame([{"Incluir": rng.choice(["Sim", "Sim", "Sim", "Não", "nao", ""]),
                             "Parasito": e,
                             "Classificação": rng.choice(["Patogênico", "Comensal", "patogenico", "Não classificado", ""]),
                             "Agrupar como": rng.choice(["", "", "", "", "Grupo X", "Giardia lamblia"])}
                            for e in especies if rng.random() < 0.8])
        met = pd.DataFrame([{"Incluir": rng.choice(["Sim", "Sim", "Não"]), "Coluna": c,
                             "Método": rng.choice([n, "", "Meu " + n]),
                             "Amostra": rng.choice(["Fezes", "Lâmina (Graham)", "", "lamina"])}
                            for c, n, _, _ in METHOD_CATALOG if rng.random() < 0.7])
        abas_cfg["Config_Parasitos"] = par
        abas_cfg["Config_Metodos"] = met
        if rng.random() < 0.7:
            abas_cfg["Config_Amostras"] = pd.DataFrame(
                [["Quantidade de amostras por paciente", rng.choice([1, 2, 3, "3", 5, "x"]), "obs"]],
                columns=["Parâmetro", "Valor", "Observação"])
        if rng.random() < 0.7:
            abas_cfg["Config_Criterios"] = pd.DataFrame([
                ["Mínimo de coletas com fezes entregues", rng.choice([0, 1, 2, "Todas", "todas", "2.7"]), ""],
                ["Mínimo de coletas com lâmina entregue", rng.choice([0, 0, 1, "Todas"]), ""],
                ["Excluir paciente com amostra sem resultado", rng.choice(["Sim", "Não", "Não", ""]), ""],
                ["Exigir todos os métodos realizados", rng.choice(["Sim", "Não", "Não"]), ""],
            ], columns=["Critério de inclusão", "Valor", "Observação"])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        if rng.random() < 0.2:
            pd.DataFrame([["leia"]], columns=["Leia antes"]).to_excel(w, sheet_name="Leia-me", index=False)
        df.to_excel(w, sheet_name="Dados", index=False)
        for nome, d in abas_cfg.items():
            d.to_excel(w, sheet_name=nome, index=False)
    return buf.getvalue()


# --------------------------------------------------------------------------- referência
def _jsonavel(v):
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        v = float(v)
    if isinstance(v, float):
        return None if math.isnan(v) else v
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, (set, frozenset)):
        return sorted(v)
    if isinstance(v, dict):
        return {str(k): _jsonavel(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonavel(x) for x in v]
    if isinstance(v, pd.DataFrame):
        return [{str(k): _jsonavel(x) for k, x in r.items()} for r in v.to_dict("records")]
    if isinstance(v, pd.Series):
        return {str(k): _jsonavel(x) for k, x in v.items()}
    return v


def referencia(xlsx: bytes) -> dict:
    """Mesmo fluxo do app.py (passos 02 → 03 → relatório) com a configuração padrão."""
    xls = pd.ExcelFile(io.BytesIO(xlsx))
    cfg_keys = {x.strip().lower() for x in CONFIG_SHEETS}
    abas = [s for s in xls.sheet_names if s.strip().lower() not in cfg_keys] or xls.sheet_names
    sheet = next((s for s in abas if s.strip().lower() == "dados"), abas[0])
    df = normalize_columns(pd.read_excel(xls, sheet_name=sheet))
    cfg_planilha = ler_config_da_planilha(xls)
    out = {"cfg_planilha": _jsonavel({k: v for k, v in cfg_planilha.items()})}
    from analysis_engine import REQUIRED_COLUMNS
    faltando = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if faltando or (not detectar_colunas_metodo(df) and "metodos" not in cfg_planilha):
        out["erro_leitura"] = True
        return out
    par, met, n, mx, avisos = montar_tabelas_iniciais(df, cfg_planilha)
    crit = {**{"min_fezes": 0, "min_lamina": 0, "excluir_inconclusivos": False, "exigir_todos_metodos": False},
            **cfg_planilha.get("criterios", {})}
    cfg, avisos_cfg = construir_config(par, met, n, crit)
    out.update({"par": _jsonavel(par), "met": _jsonavel(met), "n": n, "max": mx, "avisos": avisos,
                "avisos_cfg": avisos_cfg,
                "cfg": {"renomear": cfg.renomear, "excluidos": sorted(cfg.excluidos),
                        "categorias": cfg.categorias, "metodos": [list(m) for m in cfg.metodos],
                        "n_amostras": cfg.n_amostras, "criterios": cfg.criterios},
                "abas_config": _jsonavel(_abas_config(par, met, n, crit))})
    errs = validate_columns(df, cfg.metodos)
    out["erros_validacao"] = errs
    if errs:
        return out
    m = compute_metrics(df, cfg)
    m = {k: v for k, v in m.items() if k not in ("config",)}
    m["metodos_ativos"] = [list(x) for x in m["metodos_ativos"]]
    out["metrics"] = _jsonavel(m)
    out["duplicadas"] = _jsonavel(coletas_duplicadas(df))
    out["nao_reconhecidas"] = coletas_nao_reconhecidas(df)
    return out


if __name__ == "__main__":
    pasta = Path(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    semente = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    pasta.mkdir(parents=True, exist_ok=True)
    rng = random.Random(semente)
    for i in range(n):
        x = gerar_caso(rng, i)
        (pasta / f"caso_{i:03d}.xlsx").write_bytes(x)
        ref = referencia(x)
        (pasta / f"caso_{i:03d}.py.json").write_text(json.dumps(ref, ensure_ascii=False, default=str))
    print(f"{n} casos gerados em {pasta}")
