// Builds the album plan (folders and albums) from analysed items and the person's choices.

import { CATEGORY_NAMES, findHome, findTrips, findBusyDays, findDuplicates, findBlurry, dayOf } from './organize.js';
import { search } from './search.js';

export const DEFAULT_OPTIONS = {
  root: 'Sorted Albums',
  from: null, to: null,
  include: { trips: true, places: true, people: true, things: true, moments: true, picks: true, cleanup: true, videos: true, years: false },
  leaveOut: { screenshots: false, whatsapp: false, social: false, docs: false },
  custom: [],
  minAlbum: 3,
};

const GROUP_NAMES = {
  trips: 'Trips', places: 'Places', people: 'People', things: 'Things', moments: 'Moments',
  picks: 'Your picks', videos: 'Videos', cleanup: 'Clean-up', years: 'Years',
};

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

export function buildPlan(all, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts, include: { ...DEFAULT_OPTIONS.include, ...(opts.include || {}) }, leaveOut: { ...DEFAULT_OPTIONS.leaveOut, ...(opts.leaveOut || {}) } };
  // Scope: date range and things to leave out entirely.
  const items = all.filter((it) => {
    if (o.from != null && (it.t == null || it.t < o.from)) return false;
    if (o.to != null && (it.t == null || it.t > o.to)) return false;
    if (o.leaveOut.screenshots && (it.source === 'screenshot' || it.source === 'screenrec')) return false;
    if (o.leaveOut.whatsapp && it.source === 'whatsapp') return false;
    if (o.leaveOut.social && (it.source === 'social' || it.source === 'download')) return false;
    if (o.leaveOut.docs && it.cats?.docs) return false;
    return true;
  });
  const albums = [];
  const add = (group, name, list, extra = {}) => {
    const ids = [...new Set(list.map((it) => it.id))];
    if (ids.length < (extra.min ?? o.minAlbum)) return null;
    const a = { id: `${group}:${slug(name)}`, group, name, ids, ranked: rankCovers(list, extra.coverBy || (group === 'trips' || group === 'places' ? 'scenic' : null)), ...extra };
    delete a.min; delete a.coverBy;
    albums.push(a);
    return a;
  };
  const home = findHome(items);
  let tripDays = new Set();

  if (o.include.trips) {
    const trips = findTrips(items, home);
    for (const t of trips) {
      add('trips', t.name, t.items, { start: t.start, end: t.end, min: 5 });
      for (let d = t.start; d <= t.end; d++) tripDays.add(d);
    }
  }
  if (o.include.places) {
    const byCountry = groupBy(items.filter((it) => it.country), (it) => it.country);
    for (const [c, list] of sortBySize(byCountry)) add('places', c, list, { min: 5 });
    const byTown = groupBy(items.filter((it) => it.town), (it) => it.town + '|' + it.country);
    const towns = sortBySize(byTown).filter(([, l]) => l.length >= 12).slice(0, 12);
    const countryNames = new Set(byCountry.keys());
    for (const [k, list] of towns) {
      const town = k.split('|')[0];
      add('places', countryNames.has(town) ? town + ' (town)' : town, list, { min: 12 });
    }
  }
  const cams = items.filter((it) => it.source !== 'screenshot' && it.source !== 'screenrec');
  if (o.include.people) {
    add('people', CATEGORY_NAMES.portraits, cams.filter((it) => it.cats?.portraits), { coverBy: 'portraits' });
    add('people', CATEGORY_NAMES.groups, cams.filter((it) => it.cats?.groups), { coverBy: 'groups' });
    add('people', 'Everyone', cams.filter((it) => it.cats?.people), { coverBy: 'people' });
  }
  if (o.include.things) {
    for (const k of ['pets', 'food', 'nature', 'water', 'city', 'travel', 'style', 'home', 'tech']) {
      add('things', CATEGORY_NAMES[k], cams.filter((it) => (it.cats?.[k] || 0) >= 0.35 || it.main === k), { coverBy: k });
    }
  }
  if (o.include.moments) {
    add('moments', 'Golden hour', cams.filter((it) => it.cats?.golden), { coverBy: 'golden' });
    add('moments', 'Night', cams.filter((it) => it.cats?.night), { coverBy: 'night' });
    add('moments', 'Favourites', items.filter((it) => it.fav));
    for (const e of findBusyDays(items, tripDays)) add('moments', 'Big day, ' + e.name, e.items, { min: 10 });
  }
  if (o.include.picks) {
    for (const q of o.custom.map((s) => s.trim()).filter(Boolean)) {
      const r = search(q, items);
      const ids = new Set(r.ids);
      const a = add('picks', title(q), items.filter((it) => ids.has(it.id)), { min: 1, query: q });
      if (!a) albums.push({ id: `picks:${slug(q)}`, group: 'picks', name: title(q), ids: [], empty: true, query: q, unknown: r.unknown });
    }
  }
  if (o.include.videos) {
    const vids = items.filter((it) => it.kind === 'video');
    add('videos', 'All videos', vids);
    add('videos', 'Short clips (under 15 s)', vids.filter((it) => it.dur && it.dur < 15));
    add('videos', 'Long videos (over 2 min)', vids.filter((it) => it.dur && it.dur > 120));
  }
  if (o.include.cleanup) {
    if (!o.leaveOut.screenshots) {
      add('cleanup', 'Screenshots', items.filter((it) => it.source === 'screenshot'));
      add('cleanup', 'Screen recordings', items.filter((it) => it.source === 'screenrec'));
    }
    if (!o.leaveOut.whatsapp) add('cleanup', 'WhatsApp', items.filter((it) => it.source === 'whatsapp'));
    if (!o.leaveOut.social) add('cleanup', 'Saved from apps & downloads', items.filter((it) => it.source === 'social' || it.source === 'download'));
    if (!o.leaveOut.docs) add('cleanup', CATEGORY_NAMES.docs, items.filter((it) => it.cats?.docs), { coverBy: 'docs' });
    add('cleanup', 'Duplicates & bursts', findDuplicates(items), { min: 1 });
    add('cleanup', 'Blurry', findBlurry(items), { min: 2 });
  }
  if (o.include.years) {
    const byYear = groupBy(items.filter((it) => it.t != null), (it) => String(new Date(it.t).getUTCFullYear()));
    for (const [y, list] of [...byYear.entries()].sort()) add('years', y, list);
  }

  // Covers: the best photo for each album, without repeating a cover already used.
  const usedCovers = new Set();
  for (const a of albums) {
    const ranked = a.ranked || [];
    a.cover = ranked.find((id) => !usedCovers.has(id)) || ranked[0] || a.ids[0];
    usedCovers.add(a.cover);
    delete a.ranked;
  }
  const groups = [];
  for (const g of Object.keys(GROUP_NAMES)) {
    const list = albums.filter((a) => a.group === g);
    if (list.length) groups.push({ key: g, name: GROUP_NAMES[g], albums: list });
  }
  const inAlbums = new Set(albums.flatMap((a) => a.ids));
  return {
    root: o.root, options: o, home, groups, albums,
    totals: { photos: items.filter((i) => i.kind === 'photo').length, videos: items.filter((i) => i.kind === 'video').length,
      scope: items.length, inAlbums: inAlbums.size, albums: albums.filter((a) => !a.empty).length,
      duplicates: albums.find((a) => a.id === 'cleanup:duplicates-bursts')?.ids.length || 0,
      days: new Set(items.filter((i) => i.t != null).map((i) => dayOf(i.t))).size },
  };
}

function groupBy(list, key) {
  const m = new Map();
  for (const it of list) { const k = key(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return m;
}
const sortBySize = (m) => [...m.entries()].sort((a, b) => b[1].length - a[1].length);
const title = (q) => q.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());

const SCENIC = ['water', 'nature', 'city', 'golden'];
function rankCovers(list, by) {
  const scored = [];
  for (const it of list) {
    if (!it.thumb) continue;
    let v = Math.log10((it.blur || 1) + 1) + (it.fav ? 2 : 0) + (it.source === 'camera' ? 1 : 0) - (it.cats?.night ? 1 : 0);
    if (by === 'scenic') v += Math.max(0, ...SCENIC.map((k) => it.cats?.[k] || 0)) * 3;
    else if (by && it.cats?.[by]) v += it.cats[by] * 3;
    if (it.dupOf) v -= 5;
    scored.push([v, it.id]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 12).map((x) => x[1]);
}

/** Remove one photo from an album, or a whole album, without rebuilding. */
export function removeFromPlan(plan, albumId, itemId) {
  const a = plan.albums.find((x) => x.id === albumId);
  if (!a) return;
  if (itemId == null) {
    plan.albums = plan.albums.filter((x) => x !== a);
    for (const g of plan.groups) g.albums = g.albums.filter((x) => x !== a);
    plan.groups = plan.groups.filter((g) => g.albums.length);
  } else {
    a.ids = a.ids.filter((id) => id !== itemId);
    if (a.cover === itemId) a.cover = a.ids[0];
  }
  plan.totals.inAlbums = new Set(plan.albums.flatMap((x) => x.ids)).size;
  plan.totals.albums = plan.albums.filter((x) => !x.empty && x.ids.length).length;
}
