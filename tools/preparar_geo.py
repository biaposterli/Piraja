"""Gera os arquivos auxiliares de mapa usados pela versão web (site/geo):

  contorno_uf/<UF>.geojson.gz   contorno de cada estado tirado da malha municipal
                                (mesmo cálculo de mapas.contorno_uf_real)
  municipios_indice.json.gz     [cd_mun, nome, uf] de todos os municípios — para
                                achar a UF de um município sem baixar as 27 malhas
  arquivos.json                 lista das malhas disponíveis (o site não pede as que não existem)

Rodar de novo só se as malhas em site/geo mudarem:
    python3 tools/preparar_geo.py
"""
import gzip
import json
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

GEO = Path(__file__).resolve().parents[1] / "site" / "geo"


def arredondar(o, casas=5):
    if isinstance(o, float):
        return round(o, casas)
    if isinstance(o, (list, tuple)):
        return [arredondar(x, casas) for x in o]
    return o


def main():
    (GEO / "contorno_uf").mkdir(exist_ok=True)
    indice = []
    for p in sorted((GEO / "malha_municipal_2025").glob("*.geojson.gz")):
        uf = p.name.split(".")[0]
        feats = json.load(gzip.open(p))["features"]
        for f in feats:
            indice.append([f["properties"]["cd_mun"], f["properties"]["nome"], f["properties"]["uf"]])
        d = 0.0006  # fecha as frestas de ~90 m entre municípios simplificados separadamente
        geom = unary_union([shape(f["geometry"]).buffer(d) for f in feats]).buffer(-d)
        g = mapping(geom)
        g = {"type": g["type"], "coordinates": arredondar(g["coordinates"])}
        fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"sigla": uf}, "geometry": g}]}
        with gzip.open(GEO / "contorno_uf" / f"{uf}.geojson.gz", "wt", encoding="utf-8") as fh:
            json.dump(fc, fh, separators=(",", ":"), ensure_ascii=False)
        print(uf, end=" ", flush=True)
    with gzip.open(GEO / "municipios_indice.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(indice, fh, separators=(",", ":"), ensure_ascii=False)
    print(f"\n{len(indice)} municípios no índice")
    arquivos = sorted(str(p.relative_to(GEO)).replace("\\", "/") for p in GEO.rglob("*.gz"))
    (GEO / "arquivos.json").write_text(json.dumps(arquivos, ensure_ascii=False))
    print(f"{len(arquivos)} arquivos listados em geo/arquivos.json")


if __name__ == "__main__":
    main()
