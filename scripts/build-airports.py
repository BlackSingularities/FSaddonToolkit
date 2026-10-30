#!/usr/bin/env python3
"""Buduje wbudowaną bazę lotnisk (src-tauri/data/airports.tsv.gz) z OurAirports (domena publiczna).

Użycie: python scripts/build-airports.py [ścieżka/do/airports.csv]
Bez argumentu plik jest pobierany z https://davidmegginson.github.io/ourairports-data/airports.csv
"""
import csv, gzip, io, pathlib, sys, urllib.request

URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
TYPES = {"large_airport": "L", "medium_airport": "M", "small_airport": "S", "heliport": "H", "seaplane_base": "W"}

root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) > 1:
    raw = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
else:
    raw = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")

rows = []
for r in csv.DictReader(io.StringIO(raw)):
    kind = TYPES.get(r["type"])
    if not kind:
        continue
    # MSFS używa kodu ICAO, a gdy go nie ma – lokalnego identyfikatora (np. „K00”, „EPXX”).
    ident = (r.get("icao_code") or r.get("gps_code") or r["ident"] or "").strip().upper()
    if not ident or len(ident) > 8 or any(c in ident for c in "\t\n"):
        continue
    try:
        lat, lon = round(float(r["latitude_deg"]), 4), round(float(r["longitude_deg"]), 4)
    except ValueError:
        continue
    name = r["name"].replace("\t", " ").strip()
    city = r["municipality"].replace("\t", " ").strip()
    rows.append((ident, kind, lat, lon, r["iso_country"], name, city))
    if r["ident"].upper() != ident and len(r["ident"]) <= 8:
        rows.append((r["ident"].upper(), kind, lat, lon, r["iso_country"], name, city))

seen, out = set(), []
for row in sorted(rows, key=lambda x: (x[0], "LMSWH".index(x[1]))):
    if row[0] in seen:
        continue
    seen.add(row[0])
    out.append("\t".join(map(str, row)))

target = root / "src-tauri" / "data" / "airports.tsv.gz"
target.write_bytes(gzip.compress(("\n".join(out) + "\n").encode("utf-8"), 9, mtime=0))
print(f"{len(out)} lotnisk -> {target} ({target.stat().st_size // 1024} KiB)")
