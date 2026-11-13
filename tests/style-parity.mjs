import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const current = readFileSync('index.html', 'utf8');
const css = readFileSync('css/app.css', 'utf8');
const baseline = execFileSync('git', ['show', 'origin/main:index.html'], { encoding: 'utf8' });

const baselineCss = execFileSync('git', ['show', 'origin/main:css/app.css'], { encoding: 'utf8' });
const stylesheetVersion = html => html.match(/href="css\/app\.css\?v=([^"]+)"/)?.[1];
assert.ok(stylesheetVersion(current), 'App stylesheet must be versioned');
if (css !== baselineCss) {
  assert.notEqual(stylesheetVersion(current), stylesheetVersion(baseline),
    'App CSS changed without updating its cache-busting URL (mobile Safari may retain stale styles)');
}


assert.equal((current.match(/css\/app\.css/g) || []).length, 1);
assert.ok(css.includes('.static-catalog'), 'CSS fallback rules must be preserved');
const offlineStyles = current.match(/<noscript><style id="offline-fallback-styles">[\s\S]*?<\/style><\/noscript>\n/);
assert.ok(offlineStyles, 'Standalone no-JS fallback styles must be present');
const baselineStyles = baseline.match(/<noscript><style id="offline-fallback-styles">[\s\S]*?<\/style><\/noscript>\n/);
assert.ok(baselineStyles, 'Main-branch standalone fallback is missing');
assert.equal(offlineStyles[0], baselineStyles[0], 'Standalone fallback styles changed');
const normalizeScripts = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>\s*/gi, '');
const normalizeUnchangedLayout = html => normalizeScripts(html)
  .replace(/css\/app\.css\?v=[^"]+/g, 'css/app.css?v=VERSION')
  // The new standalone analysis tab is deliberately outside this static catalog parity contract.
  .replace(/^  <button type="button" data-view-btn="analysis"[^\n]*\n/gm, '')
  .replace(/<section class="collection-page" id="analysisPage"[\s\S]*?<\/section>\n/, '')
  .replace(/deal-finder\/live\.css\?v=[^"]+/g, 'deal-finder/live.css?v=VERSION')
  // Currency chooser is an intentional user-menu addition, not a catalog layout change.
  .replace(/   <div class="account-currency"[^]*?   <\/div>\n   <div class="account-separator"><\/div>\n/, '')
  .replace(/<section class="collection-page" id="binderPage"[\s\S]*?<\/section>/,
    '<!-- intentionally updated binder controls and placement accordion -->')
  .replace(/<section class="collection-page" id="wishPage"[\s\S]*?<\/section>/,
    '<!-- intentionally updated wishlist search -->')
  .replace(/<div class="toolbar">[\s\S]*?(?=<div class="list-header">)/,
    '<!-- intentionally updated catalog filter toolbar -->\n  ');
assert.equal(normalizeUnchangedLayout(current), normalizeUnchangedLayout(baseline),
  'Non-binder HTML layout changed');

const tempFile = '.baseline-style-compare.html';
writeFileSync(tempFile, baseline);
const isolated = mkdtempSync(join(tmpdir(), 'pokemon-static-preview-'));
writeFileSync(join(isolated, 'index.html'), current);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{width: 390, height: 844}, {width: 1440, height: 900}]) {
    const context = await browser.newContext({ viewport, javaScriptEnabled: false, deviceScaleFactor: 1 });
    await context.route(/^https?:\/\//, route => route.abort());
    const baselinePage = await context.newPage();
    const changedPage = await context.newPage();
    const root = new URL('../', import.meta.url);
    const pageUrl = new URL('index.html', root).href;
    const baseUrl = new URL(tempFile, root).href;
    await baselinePage.goto(baseUrl, {waitUntil:'load'});
    await changedPage.goto(pageUrl, {waitUntil:'load'});
    // Compare the pre-existing no-JS catalog unobscured by the intentionally new navigation item.
    if (!baseline.includes('data-view-btn="analysis"')) {
      await changedPage.evaluate(() => document.querySelector('[data-view-btn="analysis"]')?.remove());
    }

    const status = await changedPage.evaluate(() => ({
      stylesheetLoaded: [...document.styleSheets].some(sheet => (sheet.href || '').includes('css/app.css')),
      background: getComputedStyle(document.body).backgroundColor,
      cards: document.querySelectorAll('.static-card').length,
    }));
    assert.ok(status.stylesheetLoaded, 'Stylesheet failed to load');
    assert.equal(status.background, 'rgb(245, 247, 251)', 'App CSS was not applied');
    assert.ok(status.cards > 200, 'JS-free catalog fallback missing');

    for (const scrollY of [0, 1100, 4700]) {
      await baselinePage.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
      await changedPage.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
      const a = await baselinePage.screenshot({animations:'disabled'});
      const b = await changedPage.screenshot({animations:'disabled'});
      assert.ok(a.equals(b), 'Visual regression: viewport '+viewport.width+' scroll '+scrollY);
    }
    // A standalone HTML file without the sibling css/ directory must still
    // present a usable, styled no-JavaScript catalog (iOS Files/Quick Look).
    const offlinePage = await context.newPage();
    await offlinePage.goto(pathToFileURL(join(isolated, 'index.html')).href, {waitUntil:'load'});
    const offline = await offlinePage.evaluate(() => ({
      cards: document.querySelectorAll('.static-card').length,
      background: getComputedStyle(document.body).backgroundColor,
      cardDisplay: getComputedStyle(document.querySelector('.static-card')).display,
      staticVisible: getComputedStyle(document.querySelector('.static-catalog')).display,
    }));
    assert.ok(offline.cards > 200, 'Standalone catalog entries absent');
    assert.equal(offline.background, 'rgb(245, 247, 251)');
    assert.equal(offline.cardDisplay, 'flex', 'Standalone catalog lost basic styling');
    assert.equal(offline.staticVisible, 'block', 'Standalone catalog is hidden');
    console.log('PASS viewport', viewport.width, 'cards', status.cards, 'standalone no-JS preview');
    await context.close();
  }
} finally {
  await browser.close();
  unlinkSync(tempFile);
  rmSync(isolated, { recursive: true, force: true });
}
