// Offline reverse geocoding: country (Natural Earth borders), nearest town (GeoNames, pop. >= 5000)
// and time zone. No network calls - the data files ship with the app.

const BASE = new URL('../../', import.meta.url).href;

export class Geo {
  async load() {
    const [cj, ct] = await Promise.all([
      fetch(BASE + 'data/countries.json').then((r) => r.json()),
      fetch(BASE + 'data/cities.tsv').then((r) => r.text()),
    ]);
    this.names = cj.n;
    this.micro = new Set(cj.micro || []);
    this.countries = cj.c.map(([ni, b, rings]) => ({
      ni, b, rings: rings.map((flat) => {
        const out = new Int32Array(flat.length);
        let x = 0, y = 0;
        for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out[i] = x; out[i + 1] = y; }
        return out;
      }),
    }));
    const lines = ct.split('\n');
    this.tzs = lines[0].split('\t');
    const n = lines.length - 1;
    this.cName = new Array(n);
    this.cLat = new Float32Array(n); this.cLon = new Float32Array(n);
    this.cCountry = new Int16Array(n); this.cPop = new Float32Array(n); this.cTz = new Int16Array(n);
    this.grid = new Map();
    let k = 0;
    for (let i = 1; i < lines.length; i++) {
      const f = lines[i].split('\t');
      if (f.length < 6) continue;
      this.cName[k] = f[0];
      this.cLat[k] = +f[1] / 1000; this.cLon[k] = +f[2] / 1000;
      this.cCountry[k] = +f[3]; this.cPop[k] = +f[4]; this.cTz[k] = +f[5];
      const key = cell(this.cLat[k], this.cLon[k]);
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(k);
      k++;
    }
    this.count = k;
    this.cache = new Map();
    return this;
  }

  countryAt(lat, lon) {
    const x = lon * 100, y = lat * 100;
    for (const c of this.countries) {
      const b = c.b;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pointIn(c.rings, x, y)) return c.ni;
    }
    return -1;
  }

  /** Towns within maxKm, nearest first. */
  near(lat, lon, maxKm = 40) {
    const out = [];
    const la = Math.floor(lat), lo = Math.floor(lon);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.grid.get((la + dy) * 1000 + wrapLon(lo + dx));
        if (!arr) continue;
        for (const i of arr) {
          const d = km(lat, lon, this.cLat[i], this.cLon[i]);
          if (d <= maxKm) out.push([d, i]);
        }
      }
    }
    return out.sort((a, b) => a[0] - b[0]);
  }

  /** { country, town, tz } for a coordinate; results are cached on a ~1 km grid. */
  lookup(lat, lon) {
    const key = Math.round(lat * 100) + ':' + Math.round(lon * 100);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const near = this.near(lat, lon, 60);
    let ci = this.countryAt(lat, lon);
    if (near.length && near[0][0] < 3 && this.micro.has(this.cCountry[near[0][1]])) ci = this.cCountry[near[0][1]];
    if (ci < 0 && near.length && near[0][0] < 40) ci = this.cCountry[near[0][1]]; // on a lake, boat or coast
    // Town name: close beats big, but a big city nearby beats its own suburbs.
    let town = null, best = Infinity;
    for (const [d, i] of near) {
      if (d > 30) break;
      const score = d - 8 * Math.log10(Math.max(1, this.cPop[i] / 5000));
      if (score < best) { best = score; town = i; }
    }
    const res = {
      country: ci >= 0 ? this.names[ci] : null,
      town: town != null ? this.cName[town] : null,
      tz: near.length ? this.tzs[this.cTz[near[0][1]]] : null,
    };
    this.cache.set(key, res);
    return res;
  }
}

function cell(lat, lon) { return Math.floor(lat) * 1000 + wrapLon(Math.floor(lon)); }
function wrapLon(l) { return ((l + 180) % 360 + 360) % 360 - 180; }

function pointIn(rings, x, y) {
  let inside = false;
  for (const r of rings) {
    const n = r.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function km(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** UTC offset in minutes of an IANA zone at a given UTC instant (uses the browser's tz database). */
export function tzOffset(tz, utcMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(utcMs));
    const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  } catch { return null; }
}
