// End-to-end UI test in headless Chromium: start -> choices -> develop -> albums -> save -> undo.
// The folder picker is replaced with the browser's private file system so saving can be checked.
import { chromium } from 'playwright';

const shots = process.argv[2] || '/tmp/shots';
const roll = process.argv[3];
if (!roll) { console.error('Usage: node run_ui_test.mjs <screenshotDir> <photoFolder>'); process.exit(1); }
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  window.showDirectoryPicker = async (opts) => {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(opts?.mode === 'readwrite' ? 'Pictures' : 'Input', { create: true });
  };
});
await page.goto(`${BASE}/web/index.html`);
await page.waitForTimeout(3600);
await page.screenshot({ path: `${shots}/1-start.png` });

await page.setInputFiles('#pick-dir-input', roll);
await page.waitForSelector('#view-brief:not([hidden])');
await page.fill('#custom', 'dog, coffee, Italy 2026');
await page.screenshot({ path: `${shots}/2-brief.png`, fullPage: true });

await page.click('#start');
await page.waitForSelector('#view-develop:not([hidden])');
await page.waitForFunction(() => document.querySelectorAll('#dev-tray .print').length >= 14, null, { timeout: 120000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${shots}/3-develop.png` });

await page.waitForSelector('#view-sheet:not([hidden])', { timeout: 300000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/4-sheet.png`, fullPage: true });
const sheet = await page.evaluate(() => ({
  sub: document.querySelector('#sheet-sub').textContent,
  groups: [...document.querySelectorAll('.group')].map((g) => g.querySelector('.group-title').firstChild.textContent + ': ' + [...g.querySelectorAll('.album-name')].map((n) => n.textContent).join(' | ')),
}));
console.log(JSON.stringify(sheet, null, 1));

// Album dialog: remove one photo, rename
await page.click('.album[data-id^="trips:"]');
await page.waitForSelector('#album[open]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/5-album.png` });
const before = await page.locator('#album-grid .cell').count();
await page.locator('#album-grid .cell').first().hover();
await page.locator('#album-grid .cell .x').first().click();
const after = await page.locator('#album-grid .cell').count();
await page.fill('#album-name', 'Goa with the gang');
await page.press('#album-name', 'Enter');
await page.waitForTimeout(200);
if (await page.locator('#album[open]').count()) await page.click('#album .album-head button');
console.log('remove one:', before, '->', after, '| renamed tile:', await page.locator('.album-name', { hasText: 'Goa with the gang' }).count());

// Search
await page.fill('#q', 'dog');
await page.press('#q', 'Enter');
await page.waitForSelector('#album[open]');
console.log('search dog results:', await page.locator('#album-grid .cell').count(), '|', await page.textContent('#album-sub'));
await page.screenshot({ path: `${shots}/6-search.png` });
await page.click('#album .album-head button');

// Save into the private file system, then check what was written
await page.click('#save');
await page.waitForSelector('#view-done:not([hidden])', { timeout: 120000 });
await page.screenshot({ path: `${shots}/7-done.png` });
const written = await page.evaluate(async () => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Pictures');
  const out = [];
  async function walk(d, p) { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') await walk(h, p + n + '/'); else out.push(p + n); } }
  await walk(root, '');
  return { total: out.length, sample: out.filter((x) => !x.endsWith('.json')).slice(0, 8), log: out.filter((x) => x.endsWith('.json')), done: document.querySelector('#done-sub').textContent };
});
console.log('written:', JSON.stringify(written, null, 1));

await page.click('#undo');
await page.waitForSelector('#view-sheet:not([hidden])', { timeout: 60000 });
const left = await page.evaluate(async () => {
  const pics = await (await navigator.storage.getDirectory()).getDirectoryHandle('Pictures');
  const out = [];
  for await (const [n] of pics.entries()) out.push(n);
  return { left: out, toast: document.querySelector('#toast').textContent };
});
console.log('after undo:', JSON.stringify(left));

// Phone-sized layout
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' });
await m.goto(`${BASE}/web/index.html`);
await m.waitForTimeout(3400);
await m.screenshot({ path: `${shots}/8-mobile-start.png` });
console.log('errors:', JSON.stringify(errors));
await browser.close();
