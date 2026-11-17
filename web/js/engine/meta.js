// Photo and video metadata: capture time, GPS, camera, and where the file came from on the phone.
// Runs inside the analysis worker. Times are kept as "wall clock" milliseconds (local time of the
// photo, stored as if it were UTC) plus a true UTC time when the file tells us the offset.

import * as exifr from '../../vendor/exifr/exifr-lite.mjs';

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|dng|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|3gp|webm|mkv)$/i;

export function kindOf(name, type = '') {
  if (VIDEO_EXT.test(name) || type.startsWith('video/')) return 'video';
  if (IMAGE_EXT.test(name) || type.startsWith('image/')) return 'photo';
  return null;
}

/** Where a file came from, judged by its folder and name (Android and common PC copies). */
export function sourceOf(path, name) {
  const p = (path || '').toLowerCase();
  const n = name.toLowerCase();
  if (/(^|\/)screen ?recordings?(\/|$)/.test(p) || /^screen[_ -]?recording/.test(n) || /^screenrecorder/.test(n)) return { source: 'screenrec' };
  if (/(^|\/)screenshots?(\/|$)/.test(p) || /^screenshot[_ -]/.test(n) || /^scr_\d{8}/.test(n)) {
    const app = name.match(/^screenshot[_ -]\d{8}[_-]\d{6}[_-]([^.]+)\./i);
    return { source: 'screenshot', app: app ? app[1].replace(/_/g, ' ') : null };
  }
  if (p.includes('whatsapp') || /^(img|vid|aud|ptt)-\d{8}-wa\d+/.test(n)) return { source: 'whatsapp' };
  if (p.includes('telegram')) return { source: 'social', app: 'Telegram' };
  if (p.includes('instagram') || n.startsWith('ig_')) return { source: 'social', app: 'Instagram' };
  if (p.includes('snapchat') || n.startsWith('snapchat-')) return { source: 'social', app: 'Snapchat' };
  if (p.includes('facebook') || p.includes('messenger') || n.startsWith('fb_img_') || n.startsWith('received_')) return { source: 'social', app: 'Facebook' };
  if (/(^|\/)downloads?(\/|$)/.test(p)) return { source: 'download' };
  if (/(^|\/)dcim\/camera(\/|$)/.test(p) || /(^|\/)camera(\/|$)/.test(p)) return { source: 'camera' };
  if (/^(\d{8}_\d{6}|(img|vid|pxl|mvimg)_\d{8}_\d{6})/.test(n)) return { source: 'camera' };
  return { source: 'other' };
}

/** Wall-clock milliseconds from a file name like 20251221_174512.jpg, PXL_20251221_174512345.jpg,
 * Screenshot_20251221-174512_App.jpg or IMG-20251221-WA0003.jpg. */
export function timeFromName(name) {
  let m = name.match(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})[_\-T ]?(\d{2})(\d{2})(\d{2})/);
  if (m) return wall(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  m = name.match(/((?:19|20)\d{2})-(\d{2})-(\d{2})[ _T-](\d{2})[.:\-_](\d{2})[.:\-_](\d{2})/);
  if (m) return wall(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  m = name.match(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})-wa\d+/i) || name.match(/(?:^|[^\d])((?:19|20)\d{2})-(\d{2})-(\d{2})(?:[^\d]|$)/);
  if (m) return wall(+m[1], +m[2], +m[3], 12, 0, 0);
  return null;
}

function wall(y, mo, d, h = 0, mi = 0, s = 0) {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  return Date.UTC(y, mo - 1, d, h, mi, Math.min(s, 59));
}

function parseExifDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
  const m = String(v).match(/(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? wall(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : null;
}

function parseOffset(v) {
  const m = v && String(v).match(/^([+-])(\d{2}):?(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; // minutes
}

function dms(v, ref) {
  if (v == null) return null;
  let deg = typeof v === 'number' ? v : Array.isArray(v) ? (+v[0] || 0) + (+v[1] || 0) / 60 + (+v[2] || 0) / 3600 : NaN;
  if (!isFinite(deg)) return null;
  if (ref && /[SW]/i.test(String(ref))) deg = -deg;
  return deg;
}

// Note: exifr's `pick` option breaks the lite build, so we parse the (small) TIFF/EXIF/GPS blocks whole.
const EXIF_OPTS = { tiff: true, exif: true, gps: true, ifd1: false, interop: false, makerNote: false, userComment: false,
  xmp: false, reviveValues: false, translateValues: false };

/** EXIF for JPEG / HEIC. Returns a plain object; never throws. */
export async function readPhotoMeta(file) {
  const out = {};
  let x = null;
  try {
    x = await exifr.parse(file, EXIF_OPTS);
  } catch { x = null; }
  if (!x) return out;
  out.make = x.Make ? String(x.Make).trim() : null;
  out.model = x.Model ? String(x.Model).trim() : null;
  out.orient = +x.Orientation || 1;
  out.w = +x.ExifImageWidth || +x.ImageWidth || null;
  out.h = +x.ExifImageHeight || +x.ImageHeight || null;
  out.lens = x.LensModel ? String(x.LensModel) : null;
  out.software = x.Software ? String(x.Software) : null;
  out.wall = parseExifDate(x.DateTimeOriginal) ?? parseExifDate(x.CreateDate);
  const off = parseOffset(x.OffsetTimeOriginal) ?? parseOffset(x.OffsetTime);
  if (out.wall != null && off != null) { out.utc = out.wall - off * 60000; out.off = off; }
  const lat = dms(x.GPSLatitude, x.GPSLatitudeRef), lon = dms(x.GPSLongitude, x.GPSLongitudeRef);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
    out.lat = lat; out.lon = lon;
  }
  if (out.utc == null && x.GPSDateStamp && x.GPSTimeStamp) {
    const d = String(x.GPSDateStamp).match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
    const t = Array.isArray(x.GPSTimeStamp) ? x.GPSTimeStamp : String(x.GPSTimeStamp).split(/[:,\s]+/);
    if (d && t.length >= 3) {
      const utc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[0] || 0, +t[1] || 0, Math.floor(+t[2] || 0));
      if (out.wall != null && Math.abs(out.wall - utc) < 15 * 3600000) {
        out.utc = utc;
        out.off = Math.round((out.wall - utc) / 900000) * 15; // nearest quarter hour
      }
    }
  }
  return out;
}

export async function readThumbnail(file) {
  try { return (await exifr.thumbnail(file)) || null; } catch { return null; }
}

// ---------------------------------------------------------------- MP4 / MOV
async function bytes(blob, start, len) {
  return new Uint8Array(await blob.slice(start, Math.min(blob.size, start + len)).arrayBuffer());
}
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const type4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

async function findTopBox(blob, want) {
  let off = 0;
  for (let guard = 0; off + 8 <= blob.size && guard < 64; guard++) {
    const h = await bytes(blob, off, 16);
    let size = u32(h, 0);
    const t = type4(h, 4);
    let hdr = 8;
    if (size === 1) { size = u32(h, 8) * 4294967296 + u32(h, 12); hdr = 16; }
    if (size === 0) size = blob.size - off;
    if (size < 8) return null;
    if (t === want) return { off, size, hdr };
    off += size;
  }
  return null;
}

function* children(b, start, end) {
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const t = type4(b, o + 4);
    let hdr = 8;
    if (size === 1) { size = u32(b, o + 8) * 4294967296 + u32(b, o + 12); hdr = 16; }
    if (size === 0) size = end - o;
    if (size < 8 || o + size > end) return;
    yield { t, o, hdr, end: o + size };
    o += size;
  }
}

function iso6709(s) {
  const m = String(s).match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0) ? { lat, lon } : null;
}

/** Creation time (UTC), duration and GPS from an MP4/MOV header. */
export async function readVideoMeta(file) {
  const out = {};
  try {
    const moov = await findTopBox(file, 'moov');
    if (!moov || moov.size > 64 * 1024 * 1024) return out;
    const b = await bytes(file, moov.off, moov.size);
    for (const c of children(b, moov.hdr, b.length)) {
      if (c.t === 'mvhd') {
        const v = b[c.o + c.hdr];
        const p = c.o + c.hdr + 4;
        let created, scale, dur;
        if (v === 1) { created = u32(b, p) * 4294967296 + u32(b, p + 4); scale = u32(b, p + 16); dur = u32(b, p + 20) * 4294967296 + u32(b, p + 24); }
        else { created = u32(b, p); scale = u32(b, p + 8); dur = u32(b, p + 12); }
        if (created > 0) {
          const utc = (created - 2082844800) * 1000;
          if (utc > Date.UTC(1995, 0, 1) && utc < Date.UTC(2100, 0, 1)) out.utc = utc;
        }
        if (scale) out.dur = dur / scale;
      } else if (c.t === 'udta' || c.t === 'meta') {
        scanUdta(b, c, out);
      } else if (c.t === 'trak' && (!out.w)) {
        for (const tk of children(b, c.o + c.hdr, c.end)) {
          if (tk.t === 'tkhd') {
            const v = b[tk.o + tk.hdr];
            const p = tk.o + tk.hdr + (v === 1 ? 88 : 76);
            const w = u32(b, p) / 65536, h = u32(b, p + 4) / 65536;
            if (w > 0 && h > 0) { out.w = Math.round(w); out.h = Math.round(h); }
          }
        }
      }
    }
  } catch { /* unreadable header: fall back to name and file date */ }
  return out;
}

function scanUdta(b, box, out) {
  const start = box.o + box.hdr + (box.t === 'meta' ? 4 : 0);
  const keys = [];
  for (const c of children(b, start, box.end)) {
    if (c.t === '©xyz') { // Android / Samsung: ISO 6709 string
      const len = (b[c.o + c.hdr] << 8) | b[c.o + c.hdr + 1];
      const s = new TextDecoder().decode(b.subarray(c.o + c.hdr + 4, c.o + c.hdr + 4 + len));
      Object.assign(out, iso6709(s) || {});
    } else if (c.t === 'loci') { // 3GPP location box
      let p = c.o + c.hdr + 4 + 2;
      while (p < c.end && b[p] !== 0) p++;
      p += 2; // null + role
      const fx = (o) => ((u32(b, o) | 0) / 65536);
      const lon = fx(p), lat = fx(p + 4);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) { out.lat = lat; out.lon = lon; }
    } else if (c.t === 'meta') {
      scanUdta(b, c, out);
    } else if (c.t === 'keys') { // QuickTime metadata keys
      let p = c.o + c.hdr + 8;
      while (p + 8 <= c.end) { const sz = u32(b, p); keys.push(new TextDecoder().decode(b.subarray(p + 8, p + sz))); p += sz; }
    } else if (c.t === 'ilst' && keys.length) {
      for (const it of children(b, c.o + c.hdr, c.end)) {
        const k = keys[u32(b, it.o + 4) - 1] || '';
        if (/location/i.test(k)) {
          for (const d of children(b, it.o + 8, it.end)) {
            if (d.t === 'data') Object.assign(out, iso6709(new TextDecoder().decode(b.subarray(d.o + 16, d.end))) || {});
          }
        }
      }
    }
  }
}
