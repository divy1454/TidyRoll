// Analysis worker: reads metadata, decodes a small version of each photo and runs the models.
// The main thread keeps several of these busy in parallel.

import { initVision, analyse, orientBitmap } from './vision.js';
import { readPhotoMeta, readThumbnail, readVideoMeta } from './meta.js';

const queue = [];
let busy = false;
let ready = false;

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      await initVision(m);
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err && err.message || err) });
    }
    return;
  }
  if (m.type === 'job') {
    queue.push(m);
    pump();
  }
};

async function pump() {
  if (busy || !ready) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    let res;
    try {
      res = await run(job);
    } catch (err) {
      res = { error: String(err && err.message || err) };
    }
    self.postMessage({ type: 'result', id: job.id, ...res });
  }
  busy = false;
}

const NO_DECODE = /\.(heic|heif|dng|tiff?)$/i;

async function decode(job, meta) {
  if (job.bitmap) return { src: job.bitmap, via: 'frame' };
  if (job.url) { // Android app: thumbnail served by the native side
    const r = await fetch(job.url);
    if (!r.ok) return null;
    return { src: await createImageBitmap(await r.blob()), via: 'native' };
  }
  const file = job.file;
  // 1. The tiny preview most phones embed in the EXIF header: decoding it is ~20x faster.
  if (/\.(jpe?g|heic|heif)$/i.test(file.name)) {
    const th = await readThumbnail(file);
    if (th && th.length > 2000) {
      try {
        const bmp = await createImageBitmap(new Blob([th], { type: 'image/jpeg' }), { imageOrientation: 'none' });
        if (Math.max(bmp.width, bmp.height) >= 320) return { src: orientBitmap(bmp, meta.orient), via: 'exif' };
        bmp.close?.();
      } catch { /* fall through to a full decode */ }
    }
  }
  if (NO_DECODE.test(file.name)) return null;
  // 2. Full decode, scaled down by the browser.
  try {
    let opts = { resizeWidth: 512, resizeQuality: 'medium' };
    if (meta.w && meta.h) {
      const portrait = (meta.orient >= 5) !== (meta.h > meta.w);
      opts = portrait ? { resizeHeight: 512, resizeQuality: 'medium' } : opts;
    }
    return { src: await createImageBitmap(file, opts), via: 'full' };
  } catch {
    return null;
  }
}

async function run(job) {
  const t0 = performance.now();
  let meta = job.meta || {};
  if (job.file && job.kind === 'photo') meta = await readPhotoMeta(job.file);
  if (job.metaUrl) { // Android app: EXIF read natively (with the location permission), served as JSON
    try { const r = await fetch(job.metaUrl); if (r.ok) meta = { ...meta, ...(await r.json()) }; } catch { /* keep list data */ }
  }
  if (job.file && job.kind === 'video') return { meta: await readVideoMeta(job.file), ms: Math.round(performance.now() - t0) };
  const dec = await decode(job, meta);
  if (!dec) return { meta, feat: null, ms: Math.round(performance.now() - t0) };
  const t1 = performance.now();
  const feat = await analyse(dec.src);
  feat.via = dec.via;
  feat.sw = dec.src.width; feat.sh = dec.src.height;
  dec.src.close?.();
  return { meta, feat, ms: Math.round(performance.now() - t0), decodeMs: Math.round(t1 - t0) };
}
