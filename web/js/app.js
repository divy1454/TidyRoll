// Tidyroll: screens and flow. The sorting itself lives in ./engine.

import { Analyzer } from './engine/analyzer.js';
import { Geo } from './engine/geo.js';
import { initLabels } from './engine/labels.js';
import { placeItem, tagItem, CATEGORY_NAMES, MONTHS } from './engine/organize.js';
import { buildPlan, removeFromPlan, DEFAULT_OPTIONS } from './engine/planner.js';
import { search } from './engine/search.js';
import { kindOf } from './engine/meta.js';
import { can, pickFolder, fromFileList, fromDrop, fromGallery } from './sources.js';
import { saveToFolder, pickOutputFolder, undoFolder, downloadAlbum, saveToGallery, undoGallery, planSize, lastSession } from './output.js';
import { PRINTS } from './art.js';

const $ = (s) => document.querySelector(s);
const nf = new Intl.NumberFormat('en');
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
const plural = (n, one, many = one + 's') => `${nf.format(n)} ${n === 1 ? one : many}`;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const GROUPS = [
  ['trips', 'Trips'], ['places', 'Places'], ['people', 'People'], ['things', 'Pets, food and other things'],
  ['moments', 'Night and golden hour'], ['picks', 'Your picks'], ['videos', 'Videos'], ['cleanup', 'Clean-up'], ['years', 'Years'],
];

const state = {
  source: null, items: [], byId: new Map(), plan: null, options: structuredClone(DEFAULT_OPTIONS),
  analyzer: null, geo: null, abort: null, session: null, busy: false,
};

// ------------------------------------------------------------------ views
function show(id) {
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== id;
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`#${id} h1, #${id} h2`);
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}

let toastTimer;
function toast(msg, ms = 6000) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function meter(el, done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.querySelector('span').style.width = pct + '%';
  el.setAttribute('aria-valuenow', pct);
}

const dateText = (t) => {
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

function printEl(it, { develop = false, delay = 0 } = {}) {
  const p = document.createElement('div');
  p.className = 'print' + (develop && !reduceMotion ? ' develop' : '');
  if (delay) p.style.setProperty('--d', delay + 's');
  if (it?.thumb) {
    const img = document.createElement('img');
    img.src = it.thumb; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    p.append(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'ph';
    ph.textContent = it ? (it.name.split('.').pop() || '').toUpperCase() : '';
    p.append(ph);
  }
  return p;
}

// ------------------------------------------------------------------ start
function setupStart() {
  const tray = $('#hero-tray');
  const spots = [[4, 5, -6], [36, 3, 3], [67, 7, -2], [7, 35, 4], [37, 31, -4], [66, 37, 6], [4, 63, -3], [35, 60, 2], [64, 64, -5]];
  PRINTS.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'print' + (reduceMotion ? '' : ' develop');
    const [x, y, r] = spots[i % spots.length];
    el.style.cssText = `left:${x}%;top:${y}%;transform:rotate(${r}deg);--d:${(0.35 + i * 0.17).toFixed(2)}s`;
    const img = document.createElement('img');
    img.src = p.src; img.alt = '';
    el.append(img);
    tray.append(el);
  });

  if (can.native) {
    $('#pick-gallery').hidden = false;
    $('#pick-folder').hidden = true;
    $('#drop-hint').hidden = true; $('#howto-pc').hidden = true;
    $('#bar-note').textContent = 'Runs on this phone. Nothing is uploaded.';
    $('#start-title').textContent = 'Tidy your gallery into albums.';
  } else if (can.folder && !isMobile) {
    // Chrome / Edge on a computer: full folder access.
  } else if (isMobile) {
    $('#pick-folder').hidden = true;
    $('#pick-files-label').hidden = false;
    $('#drop-hint').hidden = true; $('#howto-pc').hidden = true;
    if (/Android/i.test(navigator.userAgent)) $('#mobile-note').hidden = false;
  } else {
    $('#pick-folder').hidden = true;
    $('#pick-dir-input-label').hidden = false; $('#pick-dir-input-label').classList.add('primary');
    $('#pick-files-label').hidden = false; $('#pick-files-label').classList.remove('primary');
  }

  $('#pick-folder').addEventListener('click', async () => {
    try { await chosen(await pickFolder({ skipNames: [state.options.root] })); }
    catch (e) { if (e.name !== 'AbortError') toast('That folder could not be opened. ' + e.message); }
  });
  for (const id of ['#pick-files', '#pick-dir-input']) {
    $(id).addEventListener('change', (e) => { if (e.target.files.length) chosen(fromFileList(e.target.files)); e.target.value = ''; });
  }
  $('#pick-gallery').addEventListener('click', async () => {
    try { await chosen(await fromGallery()); }
    catch (e) { toast(e.code === 'denied' ? 'Tidyroll needs access to your photos to sort them. You can allow it in Settings, Apps, Tidyroll, Permissions.' : 'The gallery could not be opened. ' + e.message, 9000); }
  });

  // Drop a folder anywhere
  if (!can.native) {
    let depth = 0;
    const drop = $('#drop');
    const ok = () => !$('#view-start').hidden || !$('#view-brief').hidden;
    addEventListener('dragenter', (e) => { if (!ok() || !e.dataTransfer?.types.includes('Files')) return; depth++; drop.hidden = false; });
    addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.hidden = true; } });
    addEventListener('dragover', (e) => { if (ok()) e.preventDefault(); });
    addEventListener('drop', async (e) => {
      if (!ok()) return;
      e.preventDefault(); depth = 0; drop.hidden = true;
      try { await chosen(await fromDrop(e.dataTransfer, { skipNames: [state.options.root] })); }
      catch (err) { toast('That could not be opened. ' + err.message); }
    });
  }
}

// ------------------------------------------------------------------ choices
function chosen(src) {
  if (!src.entries.length) { toast('No photos or videos were found there. Choose the folder that holds your camera photos, like DCIM or Pictures.', 8000); return; }
  state.source = src;
  let photos = 0, videos = 0;
  for (const e of src.entries) (kindOf(e.name, e.type) === 'video' || e.native?.kind === 'video' ? videos++ : photos++);
  $('#brief-title').textContent = `Found ${plural(photos, 'photo')}${videos ? ' and ' + plural(videos, 'video') : ''}.`;
  $('#brief-sub').textContent = src.partial
    ? 'You gave access to some photos only. To sort everything, allow access to all photos in Settings.'
    : `From “${src.label}”. Choose what to make, then start. You can change everything before any album is saved.`;
  const mins = Math.max(1, Math.round(src.entries.length / (isMobile ? 500 : 1200)));
  $('#brief-time').textContent = src.entries.length > 300 ? `This takes about ${plural(mins, 'minute')} on ${isMobile ? 'most phones' : 'most laptops'}. You can stop at any time and keep what is done.` : '';
  renderGroupChips();
  show('view-brief');
}

function renderGroupChips() {
  const box = $('#groups');
  box.textContent = '';
  for (const [key, label] of GROUPS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = label;
    b.setAttribute('aria-pressed', String(!!state.options.include[key]));
    b.addEventListener('click', () => {
      state.options.include[key] = !state.options.include[key];
      b.setAttribute('aria-pressed', String(state.options.include[key]));
    });
    box.append(b);
  }
}

function readChoices() {
  const o = state.options;
  const range = document.querySelector('input[name=range]:checked').value;
  const now = Date.now() - new Date().getTimezoneOffset() * 60000;
  o.from = o.to = null;
  if (range === '12m') o.from = now - 365 * 86400000;
  if (range === 'year') o.from = Date.UTC(new Date().getFullYear(), 0, 1);
  if (range === 'custom') {
    const f = $('#date-from').valueAsNumber, t = $('#date-to').valueAsNumber;
    if (!isNaN(f)) o.from = f;
    if (!isNaN(t)) o.to = t + 86399999;
  }
  o.leaveOut = { screenshots: false, whatsapp: false, social: false, docs: false };
  for (const c of document.querySelectorAll('input[name=out]:checked')) o.leaveOut[c.value] = true;
  o.custom = $('#custom').value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  o.root = $('#root-name').value.trim() || 'Sorted Albums';
}

function setupBrief() {
  for (const r of document.querySelectorAll('input[name=range]')) r.addEventListener('change', () => { $('#dates').hidden = r.value !== 'custom' || !r.checked; });
  $('#back-start').addEventListener('click', () => show('view-start'));
  $('#brief').addEventListener('submit', (e) => {
    e.preventDefault();
    readChoices();
    if (state.items.length && state.items.analysedFrom === state.source) { rebuild(); show('view-sheet'); return; }
    develop();
  });
}

// ------------------------------------------------------------------ developing
const env = new Map();
let envTimer = null;
function countEnvelope(it) {
  const keys = [];
  if (it.source === 'screenshot') keys.push('Screenshots');
  else if (it.source === 'whatsapp') keys.push('WhatsApp');
  if (it.country) keys.push(it.country);
  if (it.nfaces) keys.push('People');
  if (it.main) keys.push(CATEGORY_NAMES[it.main]);
  if (it.cats?.night) keys.push('Night');
  if (it.kind === 'video') keys.push('Videos');
  for (const k of keys) env.set(k, (env.get(k) || 0) + 1);
  if (!envTimer) envTimer = setTimeout(renderEnvelopes, 350);
}
const shown = new Map();
function renderEnvelopes() {
  envTimer = null;
  const list = $('#env-list');
  const top = [...env.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  list.textContent = '';
  for (const [k, n] of top) {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.textContent = k;
    const num = document.createElement('span'); num.className = 'n'; num.textContent = nf.format(n);
    if (shown.get(k) !== n) { num.classList.add('bump'); requestAnimationFrame(() => requestAnimationFrame(() => num.classList.remove('bump'))); }
    shown.set(k, n);
    li.append(name, num);
    list.append(li);
  }
}

async function ensureEngine(status) {
  if (!state.analyzer) {
    const an = new Analyzer();
    const [labels, geo] = await Promise.all([an.init(status), new Geo().load()]);
    initLabels(labels);
    state.analyzer = an; state.geo = geo;
  }
}

async function develop() {
  const entries = state.source.entries;
  env.clear(); shown.clear(); $('#env-list').textContent = ''; $('#dev-tray').textContent = '';
  const status = $('#dev-status'), m = $('#dev-meter');
  meter(m, 0, 1);
  show('view-develop');
  state.busy = true;
  state.abort = new AbortController();
  try {
    status.textContent = 'Loading the on-device models. This happens once.';
    await ensureEngine(() => {});
    const tray = $('#dev-tray');
    let shownPrints = 0;
    const started = performance.now();
    const items = await state.analyzer.run(entries, {
      signal: state.abort.signal,
      onItem: (it, update) => {
        placeItem(it, state.geo);
        tagItem(it);
        if (update) return;
        countEnvelope(it);
        if (it.thumb && (shownPrints++ % (entries.length > 400 ? 3 : 1) === 0)) {
          tray.prepend(printEl(it, { develop: true }));
          while (tray.children.length > 42) tray.lastChild.remove();
        }
      },
      onProgress: (done, total) => {
        meter(m, done, total);
        const secs = (performance.now() - started) / 1000;
        const left = done > 20 ? Math.round((secs / done) * (total - done)) : null;
        status.textContent = `${nf.format(done)} of ${nf.format(total)} looked at` + (left != null && left > 5 ? `, about ${left > 90 ? plural(Math.round(left / 60), 'minute') : plural(left, 'second')} left` : '');
      },
    });
    state.items = items; state.items.analysedFrom = state.source;
    state.byId = new Map(items.map((it) => [it.id, it]));
    renderEnvelopes();
    if (state.abort.signal.aborted) toast(`Stopped. ${plural(items.length, 'photo')} were sorted; the rest were left out.`);
    rebuild();
    show('view-sheet');
  } catch (e) {
    console.error(e);
    toast('Sorting could not start: ' + (e.message || e) + '. Try Chrome or Edge, or reload the page.', 10000);
    show('view-brief');
  } finally {
    state.busy = false;
  }
}

// ------------------------------------------------------------------ contact sheet
function rebuild() {
  state.plan = buildPlan(state.items, state.options);
  renderSheet();
}

function renderSheet() {
  const plan = state.plan, t = plan.totals;
  const scope = t.scope;
  $('#sheet-sub').textContent = `${nf.format(t.inAlbums)} of ${plural(scope, 'photo and video', 'photos and videos')} are in ${plural(t.albums, 'album')}.`
    + (t.duplicates ? ` ${plural(t.duplicates, 'extra copy', 'extra copies')} and bursts are under Clean-up.` : '')
    + (plan.home?.town ? ` Home looks like ${plan.home.town}, so trips are anywhere else.` : '');
  const save = $('#save'), note = $('#sheet-note');
  note.hidden = true;
  if (can.native) { save.textContent = 'Create albums in my gallery'; save.hidden = false; }
  else if (can.saveToFolder && !isMobile) { save.textContent = 'Save albums to a folder'; save.hidden = false; }
  else {
    save.hidden = true;
    note.hidden = false;
    note.textContent = 'This browser cannot write albums into folders. Open an album to download it as a ZIP, or use Chrome or Edge on a computer to save them all at once.';
  }
  const out = $('#groups-out');
  out.textContent = '';
  for (const g of plan.groups) {
    const sec = document.createElement('section');
    sec.className = 'group';
    const h = document.createElement('h3');
    h.className = 'group-title';
    h.textContent = g.name;
    const small = document.createElement('small');
    small.textContent = plural(g.albums.filter((a) => !a.empty).length, 'album');
    h.append(small);
    const grid = document.createElement('div');
    grid.className = 'albums';
    for (const a of g.albums) grid.append(albumTile(a));
    sec.append(h, grid);
    out.append(sec);
  }
  if (!plan.groups.length) {
    const p = document.createElement('p');
    p.className = 'lede';
    p.textContent = 'No albums with enough photos yet. Try including more dates or turning on more album types under Change choices.';
    out.append(p);
  }
}

function albumTile(a) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'album' + (a.ids.length < 2 ? ' single' : '') + (a.empty ? ' empty' : '');
  b.dataset.id = a.id;
  const stack = document.createElement('div');
  stack.className = 'stack';
  stack.append(printEl(state.byId.get(a.cover)));
  const name = document.createElement('span'); name.className = 'album-name'; name.textContent = a.name;
  const count = document.createElement('span'); count.className = 'album-count';
  count.textContent = a.empty ? (a.unknown?.length ? `“${a.unknown.join(' ')}” isn't something Tidyroll can find yet` : 'No matching photos') : plural(a.ids.length, 'photo');
  b.append(stack, name, count);
  b.addEventListener('click', () => openAlbum(a.id));
  return b;
}

// ------------------------------------------------------------------ album dialog
let current = null;
function openAlbum(id, { results = null, query = '' } = {}) {
  const dlg = $('#album');
  const a = results ? { id: null, name: query, ids: results } : state.plan.albums.find((x) => x.id === id);
  if (!a) return;
  current = a;
  $('#album-name').value = a.name;
  $('#album-name').readOnly = !!results;
  $('#album-sub').textContent = results ? `${plural(a.ids.length, 'photo')} match “${query}”.` : `${plural(a.ids.length, 'photo')}. Select the name to rename it. Remove anything that doesn't belong.`;
  $('#album-zip').hidden = !!results || can.native || (can.saveToFolder && !isMobile) || !a.ids.length;
  $('#album-keep').hidden = !results || !a.ids.length;
  $('#album-remove').hidden = !!results;
  const grid = $('#album-grid');
  grid.textContent = '';
  const render = (from, to) => {
    for (const id of a.ids.slice(from, to)) {
      const it = state.byId.get(id);
      if (!it) continue;
      const cell = document.createElement('div');
      cell.className = 'cell' + (matchMedia('(hover: none)').matches ? ' touch' : '');
      cell.append(printEl(it));
      const cap = document.createElement('span'); cap.className = 'cap';
      cap.textContent = [dateText(it.t), it.town || it.country].filter(Boolean).join(', ') || it.name;
      cell.append(cap);
      if (!results) {
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'x'; x.textContent = '×';
        x.setAttribute('aria-label', `Remove ${it.name} from this album`);
        x.addEventListener('click', () => {
          removeFromPlan(state.plan, a.id, id);
          cell.remove();
          $('#album-sub').textContent = `${plural(a.ids.length, 'photo')}. Select the name to rename it. Remove anything that doesn't belong.`;
          refreshTile(a);
        });
        cell.append(x);
      }
      grid.append(cell);
    }
  };
  render(0, 300);
  if (a.ids.length > 300) {
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'btn'; more.textContent = `Show all ${nf.format(a.ids.length)}`;
    more.addEventListener('click', () => { more.remove(); render(300, a.ids.length); });
    grid.append(more);
  }
  dlg.showModal();
}

function refreshTile(a) {
  const old = document.querySelector(`.album[data-id="${CSS.escape(a.id)}"]`);
  if (!old) return renderSheet();
  if (!a.ids.length) { renderSheet(); return; }
  old.replaceWith(albumTile(a));
  const t = state.plan.totals;
  $('#sheet-sub').textContent = `${nf.format(t.inAlbums)} of ${plural(t.scope, 'photo and video', 'photos and videos')} are in ${plural(t.albums, 'album')}.`;
}

function setupAlbumDialog() {
  const dlg = $('#album');
  $('#album-name').addEventListener('change', (e) => {
    if (!current?.id) return;
    current.name = e.target.value.trim() || current.name;
    refreshTile(current);
  });
  $('#album-remove').addEventListener('click', () => {
    if (!current?.id) return;
    removeFromPlan(state.plan, current.id);
    dlg.close();
    renderSheet();
    toast(`Removed the album “${current.name}”. The photos are still in your roll.`);
  });
  $('#album-keep').addEventListener('click', () => {
    if (!current) return;
    const id = 'picks:' + current.name.toLowerCase().replace(/\W+/g, '-');
    state.plan.albums = state.plan.albums.filter((x) => x.id !== id);
    const a = { id, group: 'picks', name: current.name.replace(/^./, (c) => c.toUpperCase()), ids: [...current.ids], cover: current.ids[0] };
    state.plan.albums.push(a);
    let g = state.plan.groups.find((x) => x.key === 'picks');
    if (!g) { g = { key: 'picks', name: 'Your picks', albums: [] }; state.plan.groups.unshift(g); }
    g.albums = g.albums.filter((x) => x.id !== id).concat(a);
    state.plan.totals.albums = state.plan.albums.filter((x) => x.ids.length).length;
    state.plan.totals.inAlbums = new Set(state.plan.albums.flatMap((x) => x.ids)).size;
    dlg.close();
    renderSheet();
    toast(`Added the album “${a.name}” under Your picks.`);
  });
  $('#album-zip').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await downloadAlbum(current, state.byId, { onProgress: (d, t) => { btn.textContent = `Packing ${d} of ${t}`; } });
      btn.textContent = 'Downloaded';
    } catch (err) { toast('The ZIP could not be made: ' + err.message); btn.textContent = 'Download as ZIP'; }
    finally { btn.disabled = false; setTimeout(() => { btn.textContent = 'Download as ZIP'; }, 4000); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

// ------------------------------------------------------------------ search
function setupSearch() {
  $('#find').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    if (q.length < 2) return;
    const r = search(q, state.items);
    if (r.unknown.length) { toast(`Tidyroll doesn't know “${r.unknown.join(' ')}” yet. Try things like dog, beach, food, night, a place or a year.`, 8000); return; }
    if (!r.ids.length) { toast(`No photos match “${q}”.`); return; }
    openAlbum(null, { results: r.ids, query: q });
  });
}

// ------------------------------------------------------------------ saving
function setupSave() {
  $('#change').addEventListener('click', () => { renderGroupChips(); show('view-brief'); });
  $('#stop').addEventListener('click', () => state.abort?.abort());
  $('#save').addEventListener('click', async () => {
    const plan = state.plan;
    const { files, bytes } = planSize(plan, state.byId);
    if (!files) { toast('There is nothing to save yet.'); return; }
    const st = $('#saving-status'), m = $('#saving-meter');
    if (can.native) {
      show('view-saving');
      st.textContent = `Copying ${plural(files, 'photo')} (${gb(bytes)}) into your gallery`;
      const onP = (e) => { meter(m, e.detail.done, e.detail.total); st.textContent = `${nf.format(e.detail.done)} of ${nf.format(e.detail.total)} copied`; };
      addEventListener('native-progress', onP);
      try {
        const r = await saveToGallery(plan, state.byId);
        state.session = { native: true, logId: r.logId };
        done(`${plural(r.files, 'copy', 'copies')} are in ${plural(plan.totals.albums, 'album')} in your gallery, in Pictures, ${plan.root}. Your originals are where they were.`);
      } catch (e) { toast('Saving stopped: ' + e.message); show('view-sheet'); }
      finally { removeEventListener('native-progress', onP); }
      return;
    }
    let parent;
    try { parent = await pickOutputFolder(); } catch (e) { if (e.name !== 'AbortError') toast(e.message); return; }
    show('view-saving');
    state.busy = true;
    st.textContent = `Copying ${plural(files, 'photo')} (${gb(bytes)})`;
    try {
      const s = await saveToFolder(plan, state.byId, { parent, onProgress: (d, t, album) => { meter(m, d, t); st.textContent = `${nf.format(d)} of ${nf.format(t)} copied, now “${album}”`; } });
      state.session = s;
      done(`${plural(s.files, 'copy', 'copies')} are in “${s.rootName}” inside “${parent.name}”. Your originals are where they were.` + (s.skipped ? ` ${plural(s.skipped, 'copy', 'copies')} were already there, so they were left as they are.` : ''));
    } catch (e) {
      toast('Saving stopped: ' + e.message + '. Anything already copied stays; run Save again to finish.', 10000);
      show('view-sheet');
    } finally { state.busy = false; }
  });
  $('#undo').addEventListener('click', async () => {
    const btn = $('#undo');
    btn.disabled = true;
    try {
      if (state.session?.native) {
        const r = await undoGallery(state.session.logId);
        toast(`Removed ${plural(r.removed, 'copy', 'copies')} from your gallery. Your originals were never touched.`);
      } else {
        const s = state.session || (await lastSession());
        if (!s) { toast('Nothing to undo here.'); return; }
        const r = await undoFolder(s);
        toast(`Removed ${plural(r.removed, 'copy', 'copies')}.` + (r.kept ? ` ${plural(r.kept, 'file')} changed since saving, so ${r.kept === 1 ? 'it was' : 'they were'} kept.` : '') + ' Your originals were never touched.', 9000);
      }
      state.session = null;
      show('view-sheet');
    } catch (e) { toast('Undo stopped: ' + e.message); }
    finally { btn.disabled = false; }
  });
  $('#again').addEventListener('click', () => { state.items = []; state.source = null; state.plan = null; show('view-start'); });
  $('#back-sheet').addEventListener('click', () => show('view-sheet'));
  addEventListener('beforeunload', (e) => { if (state.busy) { e.preventDefault(); e.returnValue = ''; } });
}

function done(text) {
  $('#done-title').textContent = 'Albums saved.';
  $('#done-sub').textContent = text;
  show('view-done');
}

const gb = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB');

// Android back button: close the open layer or step back; returning false lets the app close.
window.__tidyrollBack = () => {
  const dlg = $('#album');
  if (dlg.open) { dlg.close(); return true; }
  const view = [...document.querySelectorAll('.view')].find((v) => !v.hidden)?.id;
  if (view === 'view-develop' || view === 'view-saving') return true;
  if (view === 'view-brief') { show('view-start'); return true; }
  if (view === 'view-sheet') { show('view-brief'); return true; }
  if (view === 'view-done') { show('view-sheet'); return true; }
  return false;
};

// ------------------------------------------------------------------ boot
setupStart();
setupBrief();
setupAlbumDialog();
setupSearch();
setupSave();
if ('serviceWorker' in navigator && location.protocol === 'https:' && !can.native) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__tidyroll = state; // handy for support and tests
