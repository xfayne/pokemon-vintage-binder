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
// First extraction compares inline scripts exactly; later refactors validate
// that the external script assets stay linked, while the smoke tests below
// catch unintended behavioral changes.
const extractionPR = oldScripts.length === paths.length;
assert.ok(extractionPR || oldScripts.length === 0, 'Unexpected baseline script structure');
let restored = updated;
for (let i = 0; i < paths.length; i++) {
  const file = paths[i];
  const source = readFileSync(file, 'utf8');
  assert.ok(source.length > 100, file + ' is unexpectedly empty');
  const tag = '<script' + (i === 3 ? ' type="module"' : '') +
    ' src="' + file + '?v=20261109-js1"></script>';
  assert.ok(restored.includes(tag), file + ' is not included in index');
  if (extractionPR) {
    assert.equal(source, oldScripts[i][2], file + ' differs from original inline source');
    restored = restored.replace(tag, () => oldScripts[i][0]);
  }
}
if (extractionPR) {
  assert.equal(restored, original, 'Index changed beyond lossless script extraction');
}
// Verify that the new catalog data represents a literal, lossless move
// of the original metadata, not an edited set of card names or numbers.
if (updated.includes('js/catalog-data.js')) {
  const oldBinder = execFileSync('git', ['show', 'origin/main:js/binder.js'], { encoding: 'utf8' });
  const newBinder = readFileSync('js/binder.js', 'utf8');
  const setsStart = oldBinder.indexOf('const SETS=[');
  const setsEnd = oldBinder.indexOf('];', setsStart) + 2;
  const packsStart = oldBinder.indexOf('const OFFLINE_PACKS=');
  const packsEnd = oldBinder.indexOf(';\nfunction embeddedCards', packsStart) + 1;
  assert.ok(setsStart >= 0 && packsStart >= 0 && packsEnd > packsStart, 'Catalog source anchors missing');
  const sets = oldBinder.slice(setsStart, setsEnd);
  const packs = oldBinder.slice(packsStart, packsEnd);
  const data = readFileSync('js/catalog-data.js', 'utf8');
  assert.ok(data.includes(sets) && data.includes(packs), 'Catalog data was modified');
  const rebuilt = newBinder.replace('const {SETS,OFFLINE_PACKS}=window.VintageCatalogData;', () => sets)
    .replace('\nfunction embeddedCards(){', () => '\n' + packs + '\nfunction embeddedCards(){');
  assert.equal(rebuilt, oldBinder, 'Catalog extraction changed binder code beyond the dependency');
}
const root = process.cwd();
const mainAssets = new Map();
function readMainAsset(name) {
  if (!mainAssets.has(name)) {
    mainAssets.set(name, execFileSync('git', ['show', 'origin/main:' + name], { maxBuffer: 20 * 1024 * 1024 }));
  }
  return mainAssets.get(name);
}
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
    // Baseline MUST load the main-branch files, not modified assets from the PR.
    // Otherwise a JavaScript refactor could accidentally be compared against itself.
    const data = version === 'original' && /^(js|deal-finder|css|assets)\//.test(name)
      ? readMainAsset(name) : readFileSync(absolute);
    response.end(data);
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
  // A separately loaded catalog metadata file must initialize before binder.js.
  if (version === 'updated' && updated.includes('js/catalog-data.js')) {
    assert.ok(fetched.some(item => item.file === 'catalog-data.js' && item.status === 200),
      'Catalog data script did not load successfully');
    const dataReady = await page.evaluate(() => window.VintageCatalogData?.SETS?.length >= 14
      && Object.keys(window.VintageCatalogData.OFFLINE_PACKS || {}).length >= 14);
    assert.ok(dataReady, 'Catalog metadata missing at runtime');
  }
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
