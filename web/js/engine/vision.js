// On-device image analysis: scene/object labels (MobileNetV2, ImageNet), faces (YuNet),
// colour statistics, sharpness, a perceptual hash for near-duplicates and a small preview.
// Runs inside the analysis worker; nothing leaves the device.

import * as ort from '../../vendor/ort/ort.wasm.min.mjs';

let clsSession = null;
let faceSession = null;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export async function initVision({ classifier, faces, wasmBase }) {
  ort.env.wasm.numThreads = 1; // one thread per worker; we run several workers instead
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = wasmBase;
  ort.env.logLevel = 'error';
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  clsSession = await ort.InferenceSession.create(classifier, opts);
  faceSession = faces ? await ort.InferenceSession.create(faces, opts) : null;
}

function canvas(w, h) {
  const c = new OffscreenCanvas(w, h);
  return [c, c.getContext('2d', { willReadFrequently: true, alpha: false })];
}

/** Draw a bitmap with an EXIF orientation applied (only needed for raw EXIF thumbnails). */
export function orientBitmap(bmp, orient) {
  if (!orient || orient === 1) return bmp;
  const swap = orient >= 5;
  const w = swap ? bmp.height : bmp.width, h = swap ? bmp.width : bmp.height;
  const [c, ctx] = canvas(w, h);
  const t = {
    2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, h], 4: [1, 0, 0, -1, 0, h],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, w, 0], 7: [0, -1, -1, 0, w, h], 8: [0, -1, 1, 0, 0, h],
  }[orient];
  if (t) ctx.setTransform(...t);
  ctx.drawImage(bmp, 0, 0);
  return c;
}

async function classify(src, w, h) {
  const crop = Math.min(w, h) * 0.875;
  const [, ctx] = canvas(224, 224);
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(src, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, 224, 224);
  const px = ctx.getImageData(0, 0, 224, 224).data;
  const n = 224 * 224;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    data[i] = (px[i * 4] / 255 - MEAN[0]) / STD[0];
    data[n + i] = (px[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    data[2 * n + i] = (px[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  const out = await clsSession.run({ input: new ort.Tensor('float32', data, [1, 3, 224, 224]) });
  const logits = out.output.data;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  const p = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i++) { p[i] = Math.exp(logits[i] - max); sum += p[i]; }
  const top = [];
  for (let k = 0; k < 8; k++) {
    let bi = 0, bv = -1;
    for (let i = 0; i < p.length; i++) if (p[i] > bv) { bv = p[i]; bi = i; }
    if (bv / sum < 0.01 && k > 2) break;
    top.push([bi, Math.round((bv / sum) * 1000) / 1000]);
    p[bi] = -1;
  }
  return top;
}

async function detectFaces(src, w, h) {
  if (!faceSession) return [];
  const scale = Math.min(1, 416 / Math.max(w, h));
  const nw = Math.max(32, Math.round(w * scale)), nh = Math.max(32, Math.round(h * scale));
  const pw = Math.ceil(nw / 32) * 32, ph = Math.ceil(nh / 32) * 32;
  const [, ctx] = canvas(pw, ph);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, pw, ph);
  ctx.drawImage(src, 0, 0, w, h, 0, 0, nw, nh);
  const px = ctx.getImageData(0, 0, pw, ph).data;
  const n = pw * ph;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { // BGR, 0..255
    data[i] = px[i * 4 + 2];
    data[n + i] = px[i * 4 + 1];
    data[2 * n + i] = px[i * 4];
  }
  const out = await faceSession.run({ input: new ort.Tensor('float32', data, [1, 3, ph, pw]) });
  const dets = [];
  for (const s of [8, 16, 32]) {
    const cols = pw / s;
    const cls = out[`cls_${s}`].data, obj = out[`obj_${s}`].data, bb = out[`bbox_${s}`].data;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < 0.75) continue;
      const r = Math.floor(i / cols), c = i % cols;
      const cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s;
      const fw = Math.exp(bb[i * 4 + 2]) * s, fh = Math.exp(bb[i * 4 + 3]) * s;
      dets.push([score, cx - fw / 2, cy - fh / 2, fw, fh]);
    }
  }
  dets.sort((a, b) => b[0] - a[0]);
  const keep = [];
  for (const d of dets) {
    if (keep.every((k) => iou(d, k) < 0.3)) keep.push(d);
    if (keep.length >= 40) break;
  }
  return keep.map(([score, x, y, fw, fh]) => ({ s: +score.toFixed(2), a: +((fw * fh) / (nw * nh)).toFixed(4),
    x: +(x / nw).toFixed(3), y: +(y / nh).toFixed(3), w: +(fw / nw).toFixed(3), h: +(fh / nh).toFixed(3) }));
}

function iou(a, b) {
  const x1 = Math.max(a[1], b[1]), y1 = Math.max(a[2], b[2]);
  const x2 = Math.min(a[1] + a[3], b[1] + b[3]), y2 = Math.min(a[2] + a[4], b[2] + b[4]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[3] * a[4] + b[3] * b[4] - inter);
}

/** Colour statistics on a 64x64 version of the image. */
function colourStats(src, w, h) {
  const S = 64;
  const [, ctx] = canvas(S, S);
  ctx.drawImage(src, 0, 0, w, h, 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  let lum = 0, sat = 0, warm = 0, sky = 0, skyN = 0, green = 0, white = 0, dark = 0;
  for (let i = 0, k = 0; i < px.length; i += 4, k++) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, s = max ? (max - min) / max : 0;
    let hue = 0;
    if (max !== min) {
      if (max === r) hue = (60 * ((g - b) / (max - min)) + 360) % 360;
      else if (max === g) hue = 60 * ((b - r) / (max - min)) + 120;
      else hue = 60 * ((r - g) / (max - min)) + 240;
    }
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum += l; sat += s;
    if (s > 0.35 && v > 0.35 && (hue < 50 || hue > 340)) warm++;
    if (hue > 70 && hue < 170 && s > 0.25 && v > 0.2) green++;
    if (v > 0.85 && s < 0.12) white++;
    if (v < 0.15) dark++;
    if (k < S * S / 3) { skyN++; if (hue > 185 && hue < 250 && s > 0.15 && v > 0.45) sky++; }
  }
  const n = S * S;
  const f = (x) => +x.toFixed(3);
  return { lum: f(lum / n), sat: f(sat / n), warm: f(warm / n), green: f(green / n), white: f(white / n), dark: f(dark / n), sky: f(sky / skyN) };
}

/** Sharpness (variance of the Laplacian), edge density (text-like) and a 64-bit difference hash. */
function structure(src, w, h) {
  const scale = Math.min(1, 256 / Math.max(w, h));
  const W = Math.max(16, Math.round(w * scale)), H = Math.max(16, Math.round(h * scale));
  const [, ctx] = canvas(W, H);
  ctx.drawImage(src, 0, 0, w, h, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0, k = 0; i < px.length; i += 4, k++) g[k] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  let sum = 0, sum2 = 0, edges = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap = g[i - W] + g[i + W] + g[i - 1] + g[i + 1] - 4 * g[i];
      sum += lap; sum2 += lap * lap; n++;
      if (Math.abs(lap) > 40) edges++;
    }
  }
  const mean = sum / n;
  const blur = sum2 / n - mean * mean;
  // dHash: 9x8 grey, compare horizontal neighbours
  const [, c2] = canvas(9, 8);
  c2.imageSmoothingQuality = 'high';
  c2.drawImage(src, 0, 0, w, h, 0, 0, 9, 8);
  const d = c2.getImageData(0, 0, 9, 8).data;
  let hi = 0, lo = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const a = d[(y * 9 + x) * 4] + d[(y * 9 + x) * 4 + 1] + d[(y * 9 + x) * 4 + 2];
      const b = d[(y * 9 + x + 1) * 4] + d[(y * 9 + x + 1) * 4 + 1] + d[(y * 9 + x + 1) * 4 + 2];
      const bit = a > b ? 1 : 0;
      const idx = y * 8 + x;
      if (idx < 32) hi = (hi << 1) | bit; else lo = (lo << 1) | bit;
    }
  }
  const hex = (v) => (v >>> 0).toString(16).padStart(8, '0');
  return { blur: Math.round(blur), edges: +(edges / n).toFixed(3), dhash: hex(hi) + hex(lo) };
}

async function preview(src, w, h) {
  const scale = Math.min(1, 240 / Math.max(w, h));
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const [c, ctx] = canvas(W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h, 0, 0, W, H);
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.72 });
}

/** Full analysis of a decoded image (ImageBitmap or OffscreenCanvas). */
export async function analyse(src) {
  const w = src.width, h = src.height;
  const [top, faces] = [await classify(src, w, h), await detectFaces(src, w, h)];
  return { top, faces, ...colourStats(src, w, h), ...structure(src, w, h), preview: await preview(src, w, h) };
}
