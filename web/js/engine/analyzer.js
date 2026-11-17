// Runs the analysis workers over a list of files and assembles one record per photo/video.

import { kindOf, sourceOf, timeFromName } from './meta.js';

const BASE = new URL('../../', import.meta.url).href; // web/ root

export class Analyzer {
  constructor({ workers } = {}) {
    const cores = navigator.hardwareConcurrency || 4;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.size = workers || Math.max(1, Math.min(mobile ? 3 : 6, cores - 1));
    this.pool = [];
    this.pending = new Map();
    this.labelsText = null;
  }

  async init(onStatus = () => {}) {
    onStatus('Loading the on-device models');
    const [classifier, faces, labels] = await Promise.all([
      fetch(BASE + 'models/mobilenetv2-int8.onnx').then((r) => r.arrayBuffer()),
      fetch(BASE + 'models/yunet.onnx').then((r) => r.arrayBuffer()),
      fetch(BASE + 'models/imagenet-labels.txt').then((r) => r.text()),
    ]);
    this.labelsText = labels;
    const wasmBase = BASE + 'vendor/ort/';
    const boot = [];
    for (let i = 0; i < this.size; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const entry = { w, load: 0 };
      boot.push(new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          if (e.data.type === 'ready') { w.onmessage = (ev) => this._onMessage(entry, ev.data); resolve(); }
          else if (e.data.type === 'error') reject(new Error(e.data.error));
        };
        w.onerror = (e) => reject(new Error(e.message || 'Worker failed to start'));
      }));
      w.postMessage({ type: 'init', classifier: classifier.slice(0), faces: faces.slice(0), wasmBase });
      this.pool.push(entry);
    }
    await Promise.all(boot);
    onStatus('Ready');
    return labels;
  }

  _onMessage(entry, m) {
    if (m.type !== 'result') return;
    entry.load--;
    const p = this.pending.get(m.id);
    if (p) { this.pending.delete(m.id); p(m); }
  }

  _submit(job, transfer = []) {
    const entry = this.pool.reduce((a, b) => (b.load < a.load ? b : a));
    entry.load++;
    return new Promise((resolve) => {
      this.pending.set(job.id, resolve);
      entry.w.postMessage({ type: 'job', ...job }, transfer);
    });
  }

  /**
   * entries: [{ id, name, path, size, mtime, getFile(): Promise<File> } | { id, name, native: {...}, thumbUrl }]
   * onItem(item) is called as each record is ready.
   */
  async run(entries, { onItem = () => {}, onProgress = () => {}, signal } = {}) {
    const items = [];
    let done = 0;
    const inflight = this.size * 3;
    const videos = [];
    let next = 0;
    const work = async () => {
      while (next < entries.length) {
        if (signal?.aborted) return;
        const e = entries[next++];
        const item = await this._one(e);
        if (item) {
          items.push(item);
          if (item.kind === 'video' && !item.thumb && e.getFile) videos.push([item, e]);
          onItem(item);
        }
        onProgress(++done, entries.length);
      }
    };
    await Promise.all(Array.from({ length: inflight }, work));
    // Video previews need a <video> element, so they are grabbed here and analysed afterwards.
    let vi = 0;
    const vwork = async () => {
      while (vi < videos.length) {
        if (signal?.aborted) return;
        const [item, e] = videos[vi++];
        await this._videoFrame(item, await e.getFile());
        onItem(item, true);
      }
    };
    await Promise.all([vwork(), vwork()]);
    return items;
  }

  async _one(e) {
    const kind = e.native?.kind || kindOf(e.name, e.type);
    if (!kind) return null;
    const src = e.native?.source ? { source: e.native.source } : sourceOf(e.path, e.name);
    const base = { id: e.id, name: e.name, path: e.path || '', size: e.size, mtime: e.mtime, kind, ...src, ref: e };
    let res;
    if (e.native) {
      res = await this._submit({ id: e.id, url: e.thumbUrl, metaUrl: e.metaUrl, meta: {} });
      res.meta = { ...e.native, ...(res.meta || {}) };
    } else {
      const file = await e.getFile();
      base.size = file.size; base.mtime = file.lastModified; base.type = file.type;
      res = await this._submit({ id: e.id, file, kind, name: e.name });
    }
    return assemble(base, res);
  }

  async _videoFrame(item, file) {
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
      await withTimeout(new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = bad; }), 8000);
      if (!item.dur && isFinite(v.duration)) item.dur = v.duration;
      if (!item.w) { item.w = v.videoWidth; item.h = v.videoHeight; }
      v.currentTime = Math.min(1, (v.duration || 2) * 0.25);
      await withTimeout(new Promise((ok) => { v.onseeked = ok; }), 8000);
      const bmp = await createImageBitmap(v, { resizeWidth: 512, resizeQuality: 'medium' });
      const res = await this._submit({ id: item.id + '#f', bitmap: bmp, meta: {} }, [bmp]);
      if (res.feat) applyFeat(item, res.feat);
    } catch { /* unsupported codec: keep metadata only */ }
    finally { URL.revokeObjectURL(url); }
  }

  dispose() { this.pool.forEach((p) => p.w.terminate()); this.pool = []; }
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(new Error('timeout')), ms))]);
}

function applyFeat(item, f) {
  item.top = f.top; item.faces = f.faces;
  item.lum = f.lum; item.sat = f.sat; item.warm = f.warm; item.green = f.green; item.white = f.white;
  item.dark = f.dark; item.sky = f.sky; item.blur = f.blur; item.edges = f.edges; item.dhash = f.dhash;
  item.via = f.via;
  if (f.preview) item.thumb = URL.createObjectURL(f.preview);
}

/** Merge file info, metadata and analysis into one record. */
export function assemble(base, res) {
  const m = res.meta || {};
  const item = { ...base };
  item.make = m.make || null; item.model = m.model || null;
  item.w = m.w || null; item.h = m.h || null; item.orient = m.orient || 1;
  if (m.lat != null) { item.lat = m.lat; item.lon = m.lon; }
  item.dur = m.dur || null;
  item.fav = !!m.fav;
  // Capture time: EXIF wall clock > name > file date (local).
  const fromName = timeFromName(base.name);
  if (m.wall != null) { item.t = m.wall; item.tsrc = 'exif'; }
  else if (base.kind === 'video' && fromName != null) { item.t = fromName; item.tsrc = 'name'; }
  else if (m.utc != null && base.kind === 'video') { item.utcOnly = true; item.t = m.utc; item.tsrc = 'video'; }
  else if (fromName != null) { item.t = fromName; item.tsrc = 'name'; }
  else if (m.taken) { item.t = m.taken - new Date(m.taken).getTimezoneOffset() * 60000; item.tsrc = 'store'; }
  else if (base.mtime) { item.t = base.mtime - new Date(base.mtime).getTimezoneOffset() * 60000; item.tsrc = 'file'; }
  else { item.t = null; item.tsrc = 'none'; }
  item.utc = m.utc ?? null;
  if (item.source === 'other' && (item.make || m.camera)) item.source = 'camera';
  if (res.feat) applyFeat(item, res.feat);
  item.ms = res.ms;
  return item;
}
