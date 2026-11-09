import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const current = readFileSync('index.html', 'utf8');
const css = readFileSync('css/app.css', 'utf8');
const baseline = execFileSync('git', ['show', 'origin/main:index.html'], { encoding: 'utf8' });
const link = '<link rel="stylesheet" href="css/app.css?v=20261109-refactor-1">';

assert.equal((current.match(/css\/app\.css/g) || []).length, 1);
assert.ok(css.includes('.static-catalog'), 'CSS fallback rules must be preserved');
assert.equal(current.replace(link, '<style>' + css + '</style>'), baseline,
  'Extracting styles should be the ONLY source difference from main');

const tempFile = '.baseline-style-compare.html';
writeFileSync(tempFile, baseline);
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

    const status = await changedPage.evaluate(() => ({
      rules: [...document.styleSheets].filter(sheet => (sheet.href || '').includes('css/app.css'))
        .map(sheet => sheet.cssRules.length),
      cards: document.querySelectorAll('.static-card').length,
    }));
    assert.ok(status.rules[0] > 0, 'Stylesheet failed to load');
    assert.ok(status.cards > 200, 'JS-free catalog fallback missing');

    for (const scrollY of [0, 1100, 4700]) {
      await baselinePage.evaluate(y => window.scrollTo(0, y), scrollY);
      await changedPage.evaluate(y => window.scrollTo(0, y), scrollY);
      const a = await baselinePage.screenshot({animations:'disabled'});
      const b = await changedPage.screenshot({animations:'disabled'});
      assert.ok(a.equals(b), 'Visual regression: viewport '+viewport.width+' scroll '+scrollY);
    }
    console.log('PASS viewport', viewport.width, 'CSS rules', status.rules[0], 'cards', status.cards);
    await context.close();
  }
} finally {
  await browser.close();
  unlinkSync(tempFile);
}
