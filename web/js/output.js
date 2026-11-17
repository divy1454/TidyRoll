// Saving albums: copies into folders on Windows/desktop (originals untouched), ZIP downloads on
// browsers that cannot write folders, and real gallery albums inside the Android app.

import { Zip, ZipPassThrough } from '../vendor/fflate/fflate.mjs';
import { nativeCall } from './sources.js';

const LOG_NAME = '.tidyroll-log.json';
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A name that is safe as a folder on Windows, Android and macOS. */
export function safeName(s) {
  let n = String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!n || RESERVED.test(n)) n = '_' + n;
  return n.slice(0, 120);
}

function folderPlan(plan) {
  const used = new Map();
  return plan.albums.filter((a) => !a.empty && a.ids.length).map((a) => {
    const group = safeName(plan.groups.find((g) => g.key === a.group)?.name || a.group);
    let name = safeName(a.name);
    const key = (group + '/' + name).toLowerCase();
    const n = (used.get(key) || 0) + 1;
    used.set(key, n);
    if (n > 1) name += ` (${n})`;
    return { album: a, group, name };
  });
}

export function planSize(plan, byId) {
  let files = 0, bytes = 0;
  for (const a of plan.albums) for (const id of a.ids) { files++; bytes += byId.get(id)?.size || 0; }
  return { files, bytes };
}

async function exists(dir, name) {
  try { return await dir.getFileHandle(name); } catch { return null; }
}

/**
 * Copy every album into <chosen folder>/<root>/<group>/<album>/.
 * Returns a session object that can undo exactly what was written.
 */
export const pickOutputFolder = () => window.showDirectoryPicker({ id: 'albums-out', mode: 'readwrite', startIn: 'pictures' });

export async function saveToFolder(plan, byId, { parent, onProgress = () => {}, signal } = {}) {
  parent ||= await pickOutputFolder();
  const rootName = safeName(plan.root);
  const root = await parent.getDirectoryHandle(rootName, { create: true });
  const jobs = folderPlan(plan);
  const total = jobs.reduce((n, j) => n + j.album.ids.length, 0);
  const log = { app: 'tidyroll', version: 1, root: rootName, created: [], at: new Date().toISOString() };
  let done = 0, bytes = 0, skipped = 0;
  for (const j of jobs) {
    const g = await root.getDirectoryHandle(j.group, { create: true });
    const d = await g.getDirectoryHandle(j.name, { create: true });
    for (const id of j.album.ids) {
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError');
      const it = byId.get(id);
      if (!it) continue;
      const file = await it.ref.getFile();
      let name = it.name;
      const prev = await exists(d, name);
      if (prev) {
        const pf = await prev.getFile();
        if (pf.size === file.size) { skipped++; onProgress(++done, total, j.name); continue; } // already there
        const dot = name.lastIndexOf('.');
        for (let k = 2; await exists(d, name); k++) name = dot > 0 ? `${it.name.slice(0, dot)} (${k})${it.name.slice(dot)}` : `${it.name} (${k})`;
      }
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await file.stream().pipeTo(w);
      log.created.push({ path: [j.group, j.name, name], size: file.size });
      bytes += file.size;
      onProgress(++done, total, j.name);
    }
  }
  // The log lets Undo remove exactly these copies, even after the page is closed.
  let older = [];
  try { older = JSON.parse(await (await (await exists(root, LOG_NAME)).getFile()).text()).created || []; } catch { older = []; }
  const lh = await root.getFileHandle(LOG_NAME, { create: true });
  const lw = await lh.createWritable();
  await lw.write(JSON.stringify({ ...log, created: [...older, ...log.created] }));
  await lw.close();
  rememberSession(parent, rootName);
  return { parent, root, rootName, log, files: log.created.length, skipped, bytes };
}

/** Remove the copies listed in the log (only files that are unchanged), then empty folders. */
export async function undoFolder(session, { onProgress = () => {} } = {}) {
  const { root, parent, rootName } = session;
  let log = session.log;
  try { log = JSON.parse(await (await (await root.getFileHandle(LOG_NAME)).getFile()).text()); } catch { /* use the in-memory log */ }
  let removed = 0, kept = 0, i = 0;
  for (const c of log.created) {
    try {
      let d = root;
      for (const seg of c.path.slice(0, -1)) d = await d.getDirectoryHandle(seg);
      const fh = await d.getFileHandle(c.path[c.path.length - 1]);
      const f = await fh.getFile();
      if (f.size === c.size) { await d.removeEntry(c.path[c.path.length - 1]); removed++; } else kept++;
    } catch { /* already gone */ }
    onProgress(++i, log.created.length);
  }
  try { await root.removeEntry(LOG_NAME); } catch { /* ignore */ }
  await pruneEmpty(root);
  try { await parent.removeEntry(rootName); } catch { /* not empty: the person's own files stay */ }
  forgetSession();
  return { removed, kept };
}

async function pruneEmpty(dir) {
  let empty = true;
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') {
      if (await pruneEmpty(h)) { try { await dir.removeEntry(name); } catch { empty = false; } } else empty = false;
    } else empty = false;
  }
  return empty;
}

// Remember the last save (folder handle) so Undo still works after a reload.
function idb() {
  return new Promise((ok, bad) => {
    const r = indexedDB.open('tidyroll', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
}
async function rememberSession(parent, rootName) {
  try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put({ parent, rootName, at: Date.now() }, 'last'); } catch { /* optional */ }
}
async function forgetSession() {
  try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete('last'); } catch { /* optional */ }
}
export async function lastSession() {
  try {
    const db = await idb();
    const v = await new Promise((ok) => { const r = db.transaction('kv').objectStore('kv').get('last'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
    if (!v) return null;
    if ((await v.parent.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await v.parent.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    const root = await v.parent.getDirectoryHandle(v.rootName);
    return { parent: v.parent, root, rootName: v.rootName, log: { created: [] } };
  } catch { return null; }
}

/** One album as a ZIP download (no compression - photos are already compressed). */
export async function downloadAlbum(album, byId, { onProgress = () => {} } = {}) {
  const chunks = [];
  let fail = null;
  const zip = new Zip((err, data) => { if (err) fail = err; else chunks.push(data); });
  const used = new Set();
  let i = 0;
  for (const id of album.ids) {
    const it = byId.get(id);
    if (!it) continue;
    const file = await it.ref.getFile();
    let name = it.name;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = it.name.replace(/(\.[^.]+)?$/, ` (${k})$1`);
    used.add(name.toLowerCase());
    const entry = new ZipPassThrough(name);
    entry.mtime = file.lastModified || Date.now();
    zip.add(entry);
    const reader = file.stream().getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { entry.push(new Uint8Array(0), true); break; }
      entry.push(value);
    }
    onProgress(++i, album.ids.length);
    if (fail) throw fail;
  }
  zip.end();
  const blob = new Blob(chunks, { type: 'application/zip' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeName(album.name) + '.zip';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  return blob.size;
}

/** Android app: create the albums in the phone's gallery (Pictures/<root>/<album>). */
export async function saveToGallery(plan, byId) {
  const jobs = folderPlan(plan).map((j) => ({ group: j.group, name: j.name, ids: j.album.ids.map((id) => byId.get(id)?.ref?.nativeId).filter(Boolean) }));
  return nativeCall('applyPlan', { root: safeName(plan.root), albums: jobs });
}
export const undoGallery = (logId) => nativeCall('undo', logId);
