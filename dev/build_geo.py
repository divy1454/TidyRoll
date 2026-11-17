"""Build compact offline geodata for the sorter.

Usage: python3 -I build_geo.py COUNTRIES_TOPOJSON CITIES_TXT OUT_DIR

countries.json : {"n":[names], "c":[[nameIdx, [minLon,minLat,maxLon,maxLat], [ring, ...]], ...]}
                 rings are delta-encoded integer coordinates in 1/100 degree.
cities.tsv     : name \t lat*1000 \t lon*1000 \t countryIdx \t pop \t tzIdx  (first line: tz list)
"""
import json
import sys
from collections import Counter, defaultdict

topo_path, cities_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
topo = json.load(open(topo_path))
sx, sy = topo["transform"]["scale"]
tx, ty = topo["transform"]["translate"]

arcs = []
for arc in topo["arcs"]:
    x = y = 0
    pts = []
    for dx, dy in arc:
        x += dx
        y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)


def ring(idxs):
    pts = []
    for i in idxs:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts


# Friendlier names for Natural Earth's abbreviations.
FIX = {
    "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Central African Rep.": "Central African Republic",
    "Bosnia and Herz.": "Bosnia and Herzegovina", "Dominican Rep.": "Dominican Republic", "Eq. Guinea": "Equatorial Guinea",
    "S. Sudan": "South Sudan", "Solomon Is.": "Solomon Islands", "Marshall Is.": "Marshall Islands", "Cook Is.": "Cook Islands",
    "Faeroe Is.": "Faroe Islands", "Falkland Is.": "Falkland Islands", "Cayman Is.": "Cayman Islands", "Turks and Caicos Is.": "Turks and Caicos",
    "N. Mariana Is.": "Northern Mariana Islands", "U.S. Virgin Is.": "US Virgin Islands", "British Virgin Is.": "British Virgin Islands",
    "Fr. Polynesia": "French Polynesia", "Fr. S. Antarctic Lands": "French Southern Lands", "Heard I. and McDonald Is.": "Heard and McDonald Islands",
    "St. Kitts and Nevis": "Saint Kitts and Nevis", "St. Vin. and Gren.": "Saint Vincent and the Grenadines", "Saint Lucia": "Saint Lucia",
    "St. Pierre and Miquelon": "Saint Pierre and Miquelon", "São Tomé and Principe": "São Tomé and Príncipe", "W. Sahara": "Western Sahara",
    "Antigua and Barb.": "Antigua and Barbuda", "Br. Indian Ocean Ter.": "British Indian Ocean Territory", "Wallis and Futuna Is.": "Wallis and Futuna",
    "Ashmore and Cartier Is.": "Ashmore and Cartier Islands", "Indian Ocean Ter.": "Australian Indian Ocean Territories",
    "Siachen Glacier": "India", "N. Cyprus": "Cyprus", "Macedonia": "North Macedonia", "eSwatini": "Eswatini",
    "Côte d'Ivoire": "Côte d'Ivoire", "Czechia": "Czechia", "Timor-Leste": "Timor-Leste",
}

names, index = [], {}
countries = []
for g in topo["objects"]["countries"]["geometries"]:
    name = FIX.get(g["properties"]["name"], g["properties"]["name"])
    if name not in index:
        index[name] = len(names)
        names.append(name)
    polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]] if g["type"] == "Polygon" else []
    rings = []
    for poly in polys:
        for r in poly:
            pts = []
            for lon, lat in ring(r):
                q = (round(lon * 100), round(lat * 100))
                if not pts or pts[-1] != q:
                    pts.append(q)
            if len(pts) >= 4:
                rings.append(pts)
    if not rings:
        continue
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    enc = []
    for r in rings:
        flat, px, py = [], 0, 0
        for x, y in r:
            flat += [x - px, y - py]
            px, py = x, y
        enc.append(flat)
    countries.append([index[name], [min(xs), min(ys), max(xs), max(ys)], enc])

json.dump({"n": names, "c": countries}, open(f"{out}/countries.json", "w"), separators=(",", ":"))


# --- point in polygon (same algorithm as the app) to give every city a country
def inside(rings, x, y):
    c = False
    for r in rings:
        n = len(r)
        j = n - 1
        for i in range(n):
            xi, yi = r[i]
            xj, yj = r[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                c = not c
            j = i
    return c


decoded = []
for ni, b, enc in countries:
    rings = []
    for flat in enc:
        pts, px, py = [], 0, 0
        for k in range(0, len(flat), 2):
            px += flat[k]
            py += flat[k + 1]
            pts.append((px, py))
        rings.append(pts)
    decoded.append((ni, b, rings))


def country_of(lon, lat):
    x, y = lon * 100, lat * 100
    for ni, b, rings in decoded:
        if b[0] <= x <= b[2] and b[1] <= y <= b[3] and inside(rings, x, y):
            return ni
    return -1


rows = []
cc_votes = defaultdict(Counter)
for line in open(cities_path, encoding="utf8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 18:
        continue
    name, lat, lon, cc, pop, tz = f[1], float(f[4]), float(f[5]), f[8], int(f[14] or 0), f[17]
    rows.append([name, lat, lon, cc, pop, tz])

for r in rows:
    if r[4] >= 100000:  # vote big cities only: fast and reliable
        ni = country_of(r[2], r[1])
        if ni >= 0:
            cc_votes[r[3]][ni] += 1
cc_name = {cc: v.most_common(1)[0][0] for cc, v in cc_votes.items()}
missing = sorted({r[3] for r in rows} - set(cc_name))
for cc in missing:  # small territories: vote with every city
    v = Counter(country_of(r[2], r[1]) for r in rows if r[3] == cc)
    v.pop(-1, None)
    if v:
        cc_name[cc] = v.most_common(1)[0][0]

MICRO = {"PN": "Pitcairn Islands", "CC": "Cocos Islands", "TC": "Turks and Caicos", "TK": "Tokelau", "MC": "Monaco",
         "MO": "Macau", "CX": "Christmas Island", "TV": "Tuvalu", "JE": "Jersey", "GI": "Gibraltar", "VA": "Vatican City",
         "SM": "San Marino", "LI": "Liechtenstein", "AD": "Andorra", "MT": "Malta", "SG": "Singapore", "BH": "Bahrain"}
for cc in sorted({r[3] for r in rows}):
    if cc in MICRO and (cc not in cc_name or cc in ("MC", "GI", "MO", "VA", "SM")):
        nm = MICRO[cc]
        if nm not in index:
            index[nm] = len(names)
            names.append(nm)
        cc_name[cc] = index[nm]
json.dump({"n": names, "c": countries, "micro": sorted(i for cc, i in cc_name.items() if cc in ("MC", "GI", "MO", "VA", "SM"))},
          open(f"{out}/countries.json", "w"), separators=(",", ":"))

tzs = sorted({r[5] for r in rows})
tzi = {t: i for i, t in enumerate(tzs)}
with open(f"{out}/cities.tsv", "w", encoding="utf8") as fh:
    fh.write("\t".join(tzs) + "\n")
    for name, lat, lon, cc, pop, tz in sorted(rows, key=lambda r: -r[4]):
        fh.write(f"{name}\t{round(lat * 1000)}\t{round(lon * 1000)}\t{cc_name.get(cc, -1)}\t{pop}\t{tzi[tz]}\n")

print("countries:", len(countries), "names:", len(names), "cities:", len(rows), "tz:", len(tzs), "cc without country:", [c for c in {r[3] for r in rows} if c not in cc_name])
