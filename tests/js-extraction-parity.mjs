import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const original = execFileSync('git', ['show', 'origin/main:index.html'], { encoding: 'utf8' });
const updated = readFileSync('index.html', 'utf8');
const paths = ['js/binder.js', 'js/market-prices.js', 'js/public-reader.js', 'js/firebase-cloud.js'];
const oldScripts = [...original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => match[2].length > 2000);
assert.equal(oldScripts.length, paths.length);
let restored = updated;
for (let i = 0; i < paths.length; i++) {
  const file = paths[i];
  const source = readFileSync(file, 'utf8');
  assert.equal(source, oldScripts[i][2], file + ' differs from the source');
  const tag = '<script' + (i === 3 ? ' type="module"' : '') +
    ' src="' + file + '?v=20261109-js1"></script>';
  assert.ok(restored.includes(tag), file + ' is not included in index');
  restored = restored.replace(tag, () => oldScripts[i][0]);
}
assert.equal(restored, original, 'Index changed beyond lossless script extraction');

const root = process.cwd();
const app = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const match = /^\/(original|updated)\/(.*)$/.exec(path);
  if (!match) { response.writeHead(404); response.end(); return; }
  const [, version, relPath] = match;
  const name = relPath || 'index.html';
  if (name === 'index.html') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(version === 'original' ? original : updated);
    return;
  }
  const absolute = resolve(root, name);
  if (!absolute.startsWith(root + '/') || name.includes('..')) {
    response.writeHead(403); response.end(); return;
  }
  try {
    const extensions = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', extensions[extname(name)] || 'application/octet-stream');
    response.end(readFileSync(absolute));
  } catch {
    response.writeHead(404); response.end();
  }
});
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + app.address().port;
const browser = await chromium.launch({headless:true});
async function exercise(version, viewport) {
  const context = await browser.newContext({viewport, locale:'he-IL', deviceScaleFactor:1, serviceWorkers:'block'});
  await context.route('**/*', route => route.request().url().startsWith(origin)
    ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/js/')) fetched.push({
      file: response.url().split('/').at(-1).split('?')[0], status: response.status()
    });
  });
  await page.goto(origin + '/' + version + '/', {waitUntil:'load'});
  await page.waitForFunction(() => window.VintageBinder && window.VintageReader && window.VintageMarketPrices);
  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('#cards .poke-card').length,
    catalogFallback: document.querySelectorAll('.static-card').length,
    methods: [
      typeof window.VintageBinder.getProgress,
      typeof window.VintageBinder.adoptProgress,
      typeof window.VintageMarketPrices.show,
      typeof window.VintageReader.show,
      typeof window.VintageDealBridge.getWishlistCards
    ],
    tabs: [...document.querySelectorAll('[data-view-btn]')].map(b => b.dataset.viewBtn)
  }));
  const states = {};
  for (const tab of ['catalog','owned','binder','wishlist','shipments','deals']) {
    await page.evaluate(name => document.querySelector('[data-view-btn="' + name + '"]').click(), tab);
    states[tab] = await page.evaluate(() => ({
      activeTabs: [...document.querySelectorAll('[data-view-btn][aria-pressed="true"]')]
        .map(e => e.dataset.viewBtn),
      view: document.body.dataset.view || '',
      visiblePages: [...document.querySelectorAll('[data-view]')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => e.dataset.view).slice(0, 8)
    }));
  }
  await page.evaluate(() => document.querySelector('[data-view-btn="catalog"]').click());
  await page.locator('#search').fill('Pikachu');
  const filtered = await page.evaluate(() => ({
    cards: document.querySelectorAll('#cards .poke-card').length,
    search: document.querySelector('#search').value
  }));
  // Explicitly verify the refactored browser can fetch and parse all four extracted scripts.
  if (version === 'updated') {
    for (const file of paths) {
      assert.ok(fetched.some(item => item.file === file.split('/').at(-1) && item.status === 200),
        'Script did not load with 200: '+file);
    }
  }
  await context.close();
  return {initial,states,filtered,errors};
}
try {
  for (const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    const a = await exercise('original', viewport);
    const b = await exercise('updated', viewport);
    assert.deepEqual(b.initial, a.initial, 'Bootstrap output changed at '+viewport.width);
    assert.deepEqual(b.states, a.states, 'Navigation changed at '+viewport.width);
    assert.deepEqual(b.filtered, a.filtered, 'Catalog search changed at '+viewport.width);
    assert.deepEqual(b.errors, a.errors, 'Unexpected browser error difference at '+viewport.width);
    console.log('PASS JS browser parity:', viewport.width, 'px, cards', b.initial.cards);
  }
} finally {
  await browser.close();
  await new Promise(resolve => app.close(resolve));
}
