// Turns analysed records into facts: place, home and trips, categories, moments, duplicates, blur.

import { categoryScores, CATEGORY_NAMES } from './labels.js';
import { km, tzOffset } from './geo.js';

const DAY = 86400000;
export const dayOf = (t) => Math.floor(t / DAY);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Place names and corrected times. Cheap enough to call per item while scanning. */
export function placeItem(item, geo) {
  if (item.lat == null || !geo) return item;
  const g = geo.lookup(item.lat, item.lon);
  item.country = g.country; item.town = g.town; item.tz = g.tz;
  if (item.utcOnly && g.tz) { // video creation time is UTC: convert to the local wall clock there
    const off = tzOffset(g.tz, item.t);
    if (off != null) { item.utc = item.t; item.t = item.t + off * 60000; item.utcOnly = false; }
  }
  if (item.utc == null && item.t != null && g.tz) {
    const off = tzOffset(g.tz, item.t);
    if (off != null) item.utc = item.t - off * 60000;
  }
  return item;
}

/** Category flags from the model output, faces and colours. */
export function tagItem(item) {
  item.cats = {};
  if (item.source === 'screenshot' || item.source === 'screenrec') return item;
  const faces = (item.faces || []).filter((f) => f.a >= 0.002);
  const big = faces.reduce((m, f) => Math.max(m, f.a), 0);
  item.nfaces = faces.length;
  if (item.top) {
    const s = categoryScores(item.top);
    for (const [k, v] of Object.entries(s)) if (v >= 0.25) item.cats[k] = +v.toFixed(2);
    // Text-heavy pages: white, flat, dense fine edges (print), no faces and no clear scene.
    const scene = Math.max(item.cats.water || 0, item.cats.nature || 0, item.cats.pets || 0, item.cats.food || 0);
    if (!faces.length && item.white > 0.35 && item.sat < 0.18 && item.edges > 0.2 && scene < 0.4) item.cats.docs = Math.max(item.cats.docs || 0, 0.6);
    // Open landscapes with sky or greenery and nothing else recognised.
    if (!faces.length && !Object.keys(item.cats).length && item.sky > 0.35 && item.green > 0.15) item.cats.nature = 0.3;
  }
  if (faces.length) item.cats.people = Math.max(item.cats.people || 0, 0.5 + Math.min(0.5, big * 4));
  if (faces.length >= 1 && faces.length <= 2 && big >= 0.03) item.cats.portraits = +(0.5 + Math.min(0.5, big * 3)).toFixed(2);
  if (faces.length >= 3) item.cats.groups = Math.min(1, 0.4 + faces.length * 0.1);
  if (faces.length && item.cats.pets && item.cats.pets < 0.6) delete item.cats.pets; // a person with a dog is mostly about the person
  // Moments
  const hour = item.t != null ? new Date(item.t).getUTCHours() : null;
  if (item.lum != null) {
    const nightHour = hour != null && (hour >= 20 || hour < 5);
    if ((item.lum < 0.2 && nightHour) || item.lum < 0.09) item.cats.night = 0.8;
    const outdoor = (item.sky || 0) >= 0.08 || (item.green || 0) > 0.15 || item.cats.water || item.cats.nature || item.cats.city;
    if (!item.cats.night && outdoor && item.warm >= 0.18 && item.lum > 0.15 && !item.cats.docs && !item.cats.tech && !item.cats.home) {
      const elev = item.utc != null && item.lat != null ? sunElevation(item.utc, item.lat, item.lon) : null;
      if (elev != null ? elev > -4 && elev < 10 : hour != null && ((hour >= 17 && hour <= 19) || (hour >= 6 && hour <= 7)) && item.warm >= 0.3) {
        item.cats.golden = 0.7;
      }
    }
  }
  let best = null, bv = 0;
  for (const [k, v] of Object.entries(item.cats)) {
    if (['people', 'night', 'golden', 'portraits', 'groups'].includes(k)) continue;
    if (v > bv) { bv = v; best = k; }
  }
  item.main = best;
  return item;
}

/** Solar elevation in degrees (NOAA approximation). */
export function sunElevation(utcMs, lat, lon) {
  const d = utcMs / DAY + 2440587.5 - 2451545.0;
  const g = ((357.529 + 0.98560028 * d) % 360) * Math.PI / 180;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
  const e = (23.439 - 0.00000036 * d) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = (gmst * 15 + lon) * Math.PI / 180;
  const ha = lst - ra;
  const la = lat * Math.PI / 180;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
}

/** Find the home base: the ~10 km area with photos on the most different days. */
export function findHome(items) {
  const cells = new Map();
  for (const it of items) {
    if (it.lat == null || it.t == null) continue;
    const key = Math.round(it.lat * 10) + ':' + Math.round(it.lon * 10);
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { days: new Set(), lat: 0, lon: 0, n: 0, towns: new Map(), country: it.country }));
    c.days.add(dayOf(it.t)); c.lat += it.lat; c.lon += it.lon; c.n++;
    if (it.town) c.towns.set(it.town, (c.towns.get(it.town) || 0) + 1);
  }
  let best = null;
  for (const c of cells.values()) if (!best || c.days.size > best.days.size) best = c;
  if (!best || best.days.size < 3) return null;
  const town = [...best.towns.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { lat: best.lat / best.n, lon: best.lon / best.n, town, country: best.country, days: best.days.size };
}

/** Trips: runs of days spent more than radiusKm from home, with short gaps allowed. */
export function findTrips(items, home, { radiusKm = 60, minPhotos = 6, maxGapDays = 2 } = {}) {
  if (!home) return [];
  const byDay = new Map();
  for (const it of items) {
    if (it.t == null || !isCameraLike(it)) continue;
    const d = dayOf(it.t);
    let e = byDay.get(d);
    if (!e) byDay.set(d, (e = { away: 0, home: 0, items: [] }));
    e.items.push(it);
    if (it.lat != null) {
      if (km(it.lat, it.lon, home.lat, home.lon) > radiusKm || (home.country && it.country && it.country !== home.country)) e.away++;
      else e.home++;
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const trips = [];
  let cur = null;
  for (const d of days) {
    const e = byDay.get(d);
    const away = e.away > 0 && e.away >= e.home;
    const atHome = e.home > 0 && e.home > e.away;
    if (away) {
      if (cur && d - cur.end <= maxGapDays + 1) { cur.end = d; cur.days.push(d); }
      else { if (cur) trips.push(cur); cur = { start: d, end: d, days: [d] }; }
    } else if (atHome && cur) { trips.push(cur); cur = null; }
  }
  if (cur) trips.push(cur);
  const out = [];
  for (const tr of trips) {
    const its = [];
    for (let d = tr.start; d <= tr.end; d++) {
      const e = byDay.get(d);
      if (!e) continue;
      for (const it of e.items) {
        if (it.lat != null && km(it.lat, it.lon, home.lat, home.lon) <= radiusKm && it.country === home.country) continue;
        its.push(it);
      }
    }
    if (its.length < minPhotos) continue;
    out.push({ start: tr.start, end: tr.end, items: its, name: tripName(its, tr) });
  }
  // Two trips with the same name get their dates added.
  const seen = new Map();
  for (const t of out) seen.set(t.name, (seen.get(t.name) || 0) + 1);
  for (const t of out) if (seen.get(t.name) > 1) t.name = t.name.replace(/, [^,]*$/, ', ' + dayRange(t.start, t.end));
  return out;
}

function isCameraLike(it) {
  return it.source === 'camera' || it.source === 'other';
}

function tripName(its, tr) {
  const towns = new Map(), countries = new Map();
  let geo = 0;
  for (const it of its) {
    if (it.country) { countries.set(it.country, (countries.get(it.country) || 0) + 1); geo++; }
    if (it.town) towns.set(it.town, (towns.get(it.town) || 0) + 1);
  }
  const topTown = [...towns.entries()].sort((a, b) => b[1] - a[1])[0];
  const cs = [...countries.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= Math.max(2, geo * 0.1)).map(([c]) => c);
  let place;
  if (topTown && topTown[1] >= geo * 0.5) place = topTown[0];
  else if (cs.length === 1) place = cs[0];
  else if (cs.length === 2) place = cs.join(' & ');
  else if (cs.length > 2) place = cs.slice(0, -1).join(', ') + ' & ' + cs[cs.length - 1];
  else place = 'Trip';
  return place + ', ' + monthRange(tr.start, tr.end);
}

function monthRange(a, b) {
  const da = new Date(a * DAY), db = new Date(b * DAY);
  const ma = MONTHS[da.getUTCMonth()], mb = MONTHS[db.getUTCMonth()];
  if (da.getUTCFullYear() !== db.getUTCFullYear()) return `${ma} ${da.getUTCFullYear()} – ${mb} ${db.getUTCFullYear()}`;
  return ma === mb ? `${ma} ${da.getUTCFullYear()}` : `${ma}–${mb} ${db.getUTCFullYear()}`;
}

export function dayRange(a, b) {
  const da = new Date(a * DAY), db = new Date(b * DAY);
  const f = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (a === b) return `${f(da)} ${da.getUTCFullYear()}`;
  if (da.getUTCMonth() === db.getUTCMonth()) return `${da.getUTCDate()}–${f(db)} ${db.getUTCFullYear()}`;
  return `${f(da)} – ${f(db)} ${db.getUTCFullYear()}`;
}

/** Busy days outside trips: lots more photos than usual (useful when there is no GPS). */
export function findBusyDays(items, tripDays) {
  const byDay = new Map();
  for (const it of items) {
    if (it.t == null || !isCameraLike(it)) continue;
    const d = dayOf(it.t);
    if (tripDays.has(d)) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(it);
  }
  const counts = [...byDay.values()].map((a) => a.length).sort((a, b) => a - b);
  if (!counts.length) return [];
  const median = counts[Math.floor(counts.length / 2)];
  const min = Math.max(15, median * 4);
  const days = [...byDay.entries()].filter(([, a]) => a.length >= min).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [d, a] of days) {
    const last = out[out.length - 1];
    if (last && d - last.end === 1) { last.end = d; last.items.push(...a); }
    else out.push({ start: d, end: d, items: [...a] });
  }
  return out.map((e) => ({ ...e, name: dayRange(e.start, e.end) }));
}

const hamming = (a, b) => {
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
};

/** Near-duplicates and burst shots: same scene within a few minutes. The best shot stays out. */
export function findDuplicates(items, { maxDist = 6, windowMs = 10 * 60000 } = {}) {
  const list = items.filter((it) => it.dhash && it.kind === 'photo' && it.t != null && it.source !== 'screenshot').sort((a, b) => a.t - b.t);
  const parent = new Map(list.map((it) => [it.id, it.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].t - list[i].t <= windowMs; j++) {
      if (hamming(list[i].dhash, list[j].dhash) <= maxDist) parent.set(find(list[j].id), find(list[i].id));
    }
  }
  // Exact copies anywhere (same picture, same size, same capture time) - e.g. a photo saved twice.
  const exact = new Map();
  for (const it of items) {
    if (!it.dhash || !parent.has(it.id)) continue;
    const k = it.dhash + ':' + it.size + ':' + it.t;
    if (exact.has(k)) parent.set(find(it.id), find(exact.get(k).id)); else exact.set(k, it);
  }
  const groups = new Map();
  for (const it of items) {
    if (!parent.has(it.id)) continue;
    const r = find(it.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(it);
  }
  const extras = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => quality(b) - quality(a));
    g[0].keeper = true;
    for (const it of g.slice(1)) { it.dupOf = g[0].id; extras.push(it); }
  }
  return extras;
}

const quality = (it) => (it.blur || 0) * Math.sqrt((it.w || 1000) * (it.h || 1000)) + (it.fav ? 1e12 : 0) + (it.make ? 1e6 : 0);

/** Blurry photos: the bottom of the sharpness range, and below an absolute floor. */
export function findBlurry(items) {
  const cand = items.filter((it) => it.kind === 'photo' && it.blur != null && it.source === 'camera' && !it.cats?.night && !it.cats?.docs);
  if (cand.length < 5) return cand.filter((it) => it.blur < 25);
  const sorted = cand.map((it) => it.blur).sort((a, b) => a - b);
  const p8 = sorted[Math.floor(sorted.length * 0.08)];
  const limit = Math.min(Math.max(p8, 25), 120);
  return cand.filter((it) => it.blur <= limit && it.blur < 120);
}

export { CATEGORY_NAMES, MONTHS };
