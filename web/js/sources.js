// Where photos come from: a folder (Windows/desktop), picked files (phones), a dropped folder,
// or the phone gallery when running inside the Android app.

import { kindOf } from './engine/meta.js';

const SKIP_DIR = /^(\.|\$recycle\.bin$|system volume information$|thumbnails$|\.thumbnails$|cache$|node_modules$)/i;

export const can = {
  folder: typeof window.showDirectoryPicker === 'function',
  saveToFolder: typeof window.showDirectoryPicker === 'function',
  native: typeof window.TidyrollNative === 'object' && window.TidyrollNative !== null,
};

let seq = 0;
const newId = () => 'p' + (++seq).toString(36);

/** Walk a directory handle; skips hidden/system folders and our own output folder. */
async function walk(dir, prefix, out, skipNames, onCount) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') {
      if (SKIP_DIR.test(name) || skipNames.has(name)) continue;
      await walk(h, prefix + name + '/', out, skipNames, onCount);
    } else if (kindOf(name)) {
      out.push({ id: newId(), name, path: prefix + name, handle: h, getFile: () => h.getFile() });
      if (out.length % 200 === 0) onCount(out.length);
    }
  }
}

export async function pickFolder({ skipNames = [], onCount = () => {} } = {}) {
  const dir = await window.showDirectoryPicker({ id: 'photos-in', mode: 'read', startIn: 'pictures' });
  const out = [];
  await walk(dir, dir.name + '/', out, new Set(skipNames), onCount);
  onCount(out.length);
  return { label: dir.name, entries: out, dir };
}

/** From an <input type=file> (multiple, maybe webkitdirectory). */
export function fromFileList(list) {
  const out = [];
  for (const f of list) {
    if (!kindOf(f.name, f.type)) continue;
    const path = f.webkitRelativePath || f.name;
    if (path.split('/').some((p) => SKIP_DIR.test(p))) continue;
    out.push({ id: newId(), name: f.name, path, type: f.type, size: f.size, mtime: f.lastModified, file: f, getFile: async () => f });
  }
  const label = out[0]?.path.includes('/') ? out[0].path.split('/')[0] : `${out.length} files`;
  return { label, entries: out };
}

/** From a drag-and-drop: folders included where the browser allows it. */
export async function fromDrop(dataTransfer, { skipNames = [], onCount = () => {} } = {}) {
  const out = [];
  const items = [...dataTransfer.items].filter((i) => i.kind === 'file');
  let label = null;
  for (const it of items) {
    if (it.getAsFileSystemHandle) {
      const h = await it.getAsFileSystemHandle();
      if (!h) continue;
      if (h.kind === 'directory') { label ||= h.name; await walk(h, h.name + '/', out, new Set(skipNames), onCount); continue; }
      if (kindOf(h.name)) out.push({ id: newId(), name: h.name, path: h.name, handle: h, getFile: () => h.getFile() });
      continue;
    }
    const entry = it.webkitGetAsEntry?.();
    if (entry?.isDirectory) { label ||= entry.name; await walkEntry(entry, entry.name + '/', out); continue; }
    const f = it.getAsFile();
    if (f && kindOf(f.name, f.type)) out.push({ id: newId(), name: f.name, path: f.name, file: f, getFile: async () => f });
  }
  onCount(out.length);
  return { label: label || `${out.length} files`, entries: out };
}

function walkEntry(dirEntry, prefix, out) {
  return new Promise((resolve) => {
    const reader = dirEntry.createReader();
    const batch = () => reader.readEntries(async (ents) => {
      if (!ents.length) return resolve();
      for (const e of ents) {
        if (e.isDirectory) { if (!SKIP_DIR.test(e.name)) await walkEntry(e, prefix + e.name + '/', out); }
        else if (kindOf(e.name)) {
          const file = () => new Promise((ok, bad) => e.file(ok, bad));
          out.push({ id: newId(), name: e.name, path: prefix + e.name, getFile: file });
        }
      }
      batch();
    }, () => resolve());
    batch();
  });
}

// ------------------------------------------------------------------ Android app bridge
const calls = new Map();
let callSeq = 0;
window.__tidyrollCallback = (id, json) => {
  const cb = calls.get(id);
  if (!cb) return;
  calls.delete(id);
  try {
    const v = typeof json === 'string' ? JSON.parse(json) : json;
    if (v && v.error) cb.reject(Object.assign(new Error(v.error), { code: v.code })); else cb.resolve(v);
  } catch (e) { cb.reject(e); }
};
window.__tidyrollProgress = (done, total, label) => window.dispatchEvent(new CustomEvent('native-progress', { detail: { done, total, label } }));

export function nativeCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = 'c' + (++callSeq);
    calls.set(id, { resolve, reject });
    try { window.TidyrollNative[method](...args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))), id); }
    catch (e) { calls.delete(id); reject(e); }
  });
}

/** The phone gallery, read by the Android app (with location access for places and trips). */
export async function fromGallery({ onCount = () => {} } = {}) {
  const perm = await nativeCall('requestPermission');
  if (perm.state === 'denied') throw Object.assign(new Error('Photo access was not allowed.'), { code: 'denied' });
  const base = 'https://appassets.androidplatform.net';
  const res = await fetch(base + '/api/media');
  const list = await res.json();
  if (list.error) throw new Error(list.error);
  const entries = list.items.map((m) => ({
    id: 'n' + m.id, name: m.name, path: m.path, size: m.size, mtime: m.mtime,
    native: { ...m, kind: m.kind }, thumbUrl: `${base}/thumb/${m.id}`, metaUrl: `${base}/meta/${m.id}`, nativeId: m.id,
  }));
  onCount(entries.length);
  return { label: perm.state === 'partial' ? 'Selected photos' : 'Gallery', entries, partial: perm.state === 'partial', location: perm.location };
}
