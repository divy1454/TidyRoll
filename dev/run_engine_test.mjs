// Runs tests/engine.html in headless Chromium on a folder of photos and prints the result as JSON.
// Usage: node run_engine_test.mjs <photoDir> <outJson> [workers]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [dir, out, workers] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-features=SharedArrayBuffer'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
await page.goto(`${BASE}/tests/engine.html${workers ? '?workers=' + workers : ''}`);
await page.waitForFunction(() => window.__ready === true);
await page.setInputFiles('#dir', dir);
await page.waitForFunction(() => window.__result, null, { timeout: 600000, polling: 500 });
const res = await page.evaluate(() => window.__result);
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res.timing));
await browser.close();
