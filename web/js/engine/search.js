// Plain-language search over analysed photos: "dog", "Italy 2025", "beach sunset", "screenshots".

import { SYNONYMS, synonymLabels, labelName } from './labels.js';
import { MONTHS } from './organize.js';

const MONTH_WORDS = {};
['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  .forEach((m, i) => { MONTH_WORDS[m] = i; MONTH_WORDS[m.slice(0, 3)] = i; });
MONTH_WORDS.sept = 8;
const SEASONS = { summer: [5, 6, 7], winter: [11, 0, 1], spring: [2, 3, 4], autumn: [8, 9, 10], fall: [8, 9, 10], monsoon: [5, 6, 7, 8] };
const STOP = new Set(['in', 'of', 'my', 'the', 'from', 'at', 'on', 'with', 'and', 'a', 'an', 'all', 'photos', 'photo', 'pics', 'pictures', 'images', 'shots', 'me', 'some']);
const SOURCE_WORDS = {
  screenshot: (it) => it.source === 'screenshot', screenshots: (it) => it.source === 'screenshot',
  whatsapp: (it) => it.source === 'whatsapp', video: (it) => it.kind === 'video', videos: (it) => it.kind === 'video',
  clips: (it) => it.kind === 'video', favourite: (it) => it.fav, favorite: (it) => it.fav, favourites: (it) => it.fav, favorites: (it) => it.fav,
  instagram: (it) => it.app === 'Instagram', downloads: (it) => it.source === 'download', recordings: (it) => it.source === 'screenrec',
};

export function labelScore(it, set) {
  if (!it.top) return 0;
  let s = 0;
  for (const [i, p] of it.top) if (set.has(i)) s += p;
  return s;
}

function tokens(q) {
  const t = q.toLowerCase().replace(/[,;]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'golden' && t[i + 1] === 'hour') { out.push('golden hour'); i++; continue; }
    out.push(t[i]);
  }
  return out.filter((w) => !STOP.has(w));
}

/** Build matchers from a query. Returns { tests, understood, unknown }. */
export function compile(query, items) {
  const places = new Map();
  for (const it of items) {
    if (it.country) places.set(it.country.toLowerCase(), ['country', it.country]);
    if (it.town) places.set(it.town.toLowerCase(), ['town', it.town]);
  }
  const words = tokens(query);
  const tests = [], understood = [], unknown = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // multi-word places ("united kingdom", "new york")
    const two = i + 1 < words.length ? w + ' ' + words[i + 1] : null;
    if (two && places.has(two)) { const [k, v] = places.get(two); tests.push((it) => it[k] === v); understood.push(v); i++; continue; }
    if (places.has(w)) { const [k, v] = places.get(w); tests.push((it) => it[k] === v); understood.push(v); continue; }
    const placePrefix = w.length >= 4 && [...places.keys()].find((p) => p.startsWith(w));
    if (/^(19|20)\d{2}$/.test(w)) { const y = +w; tests.push((it) => it.t != null && new Date(it.t).getUTCFullYear() === y); understood.push(w); continue; }
    if (w in MONTH_WORDS) { const m = MONTH_WORDS[w]; tests.push((it) => it.t != null && new Date(it.t).getUTCMonth() === m); understood.push(MONTHS[m]); continue; }
    if (w in SEASONS) { const ms = SEASONS[w]; tests.push((it) => it.t != null && ms.includes(new Date(it.t).getUTCMonth())); understood.push(w); continue; }
    if (w in SOURCE_WORDS) { tests.push(SOURCE_WORDS[w]); understood.push(w); continue; }
    const syn = SYNONYMS[w] || SYNONYMS[w.replace(/s$/, '')];
    if (syn) {
      if (syn.category) { const c = syn.category; tests.push((it) => !!(it.cats && it.cats[c])); }
      else { const set = synonymLabels(syn); tests.push((it) => labelScore(it, set) >= 0.2); }
      understood.push(w);
      continue;
    }
    if (placePrefix) { const [k, v] = places.get(placePrefix); tests.push((it) => it[k] === v); understood.push(v); continue; }
    // Any ImageNet label containing the word ("pizza", "violin", "lighthouse"→beacon is not covered).
    const set = new Set();
    for (let li = 0; li < 1000; li++) if (new RegExp(`\\b${escape(w)}`, 'i').test(labelName(li))) set.add(li);
    if (set.size) { tests.push((it) => labelScore(it, set) >= 0.15); understood.push(w); continue; }
    unknown.push(w);
  }
  return { tests, understood, unknown };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function search(query, items) {
  const { tests, understood, unknown } = compile(query, items);
  if (!tests.length || unknown.length) return { ids: [], understood, unknown };
  const ids = items.filter((it) => tests.every((t) => t(it))).map((it) => it.id);
  return { ids, understood, unknown };
}
