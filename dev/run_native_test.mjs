// Runs the web app as the Android app would: served from https://appassets.androidplatform.net with a
// fake window.TidyrollNative and the same /api/media, /thumb and /meta endpoints the Java code serves.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const mock = JSON.parse(readFileSync(process.argv[2] || '/tmp/native_mock.json', 'utf8'));
import { fileURLToPath } from 'node:url';
const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const SHOTS = process.argv[3] || '/tmp';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.tsv': 'text/plain', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36' });
const errors = [];
const offsite = [];
await ctx.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.host !== 'appassets.androidplatform.net') { offsite.push(u.href); return route.fulfill({ status: 403, body: '' }); }
  const p = u.pathname;
  if (p === '/api/media') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: mock.items, location: true }) });
  if (p.startsWith('/thumb/')) { const f = mock.paths[p.slice(7)]; return f && !f.endsWith('.mp4') ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(f) }) : route.fulfill({ status: 404, body: '' }); }
  if (p.startsWith('/meta/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mock.meta[p.slice(6)] || {}) });
  const file = join(WEB, p === '/' ? 'index.html' : p);
  if (!existsSync(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
});
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  window.__applied = null;
  const cb = (id, v) => setTimeout(() => window.__tidyrollCallback(id, v), 30);
  window.TidyrollNative = {
    version: () => '1',
    requestPermission: (id) => cb(id, { state: 'granted', location: true }),
    applyPlan: (json, id) => {
      const plan = JSON.parse(json);
      window.__applied = plan;
      const total = plan.albums.reduce((n, a) => n + a.ids.length, 0);
      let d = 0;
      const tick = () => { d = Math.min(total, d + 7); window.__tidyrollProgress(d, total, 'x'); if (d < total) setTimeout(tick, 20); else cb(id, { logId: 'save-1', files: total, skipped: 0, bytes: 1 }); };
      tick();
    },
    undo: (logId, id) => cb(id, { removed: window.__applied ? window.__applied.albums.reduce((n, a) => n + a.ids.length, 0) : 0, kept: 0 }),
    freeSpace: () => 5e10,
  };
});
await page.goto('https://appassets.androidplatform.net/index.html');
await page.waitForTimeout(3300);
await page.screenshot({ path: `${SHOTS}/app-start.png` });
console.log('app start: gallery button visible =', await page.isVisible('#pick-gallery'), '| folder button hidden =', !(await page.isVisible('#pick-folder')));
await page.click('#pick-gallery');
await page.waitForSelector('#view-brief:not([hidden])');
console.log('brief:', await page.textContent('#brief-title'));
await page.click('#start');
await page.waitForSelector('#view-sheet:not([hidden])', { timeout: 300000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/app-sheet.png`, fullPage: false });
const res = await page.evaluate(() => {
  const s = window.__tidyroll;
  return { sub: document.querySelector('#sheet-sub').textContent, save: document.querySelector('#save').textContent,
    trips: s.plan.albums.filter((a) => a.group === 'trips').map((a) => a.name + ' (' + a.ids.length + ')'),
    countries: [...new Set(s.items.map((i) => i.country).filter(Boolean))], withGps: s.items.filter((i) => i.lat != null).length,
    tsrc: s.items.reduce((m, i) => ((m[i.tsrc] = (m[i.tsrc] || 0) + 1), m), {}) };
});
console.log(JSON.stringify(res, null, 1));
await page.click('#save');
await page.waitForSelector('#view-done:not([hidden])', { timeout: 60000 });
const applied = await page.evaluate(() => ({ root: window.__applied.root, albums: window.__applied.albums.length, sample: window.__applied.albums.slice(0, 3), done: document.querySelector('#done-sub').textContent }));
console.log('applied:', JSON.stringify(applied).slice(0, 600));
await page.click('#undo');
await page.waitForSelector('#view-sheet:not([hidden])');
console.log('undo toast:', await page.textContent('#toast'));
console.log('back handler:', await page.evaluate(() => [window.__tidyrollBack(), document.querySelector('.view:not([hidden])').id]));
console.log('requests to other hosts:', offsite.length, '| errors:', JSON.stringify(errors));
await browser.close();
