import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The checked-in index.html is the deployable artifact for GitHub Pages and
// standalone iOS Files/Quick Look. Rebuild it from these two source files;
// never fetch the catalog via JavaScript at runtime.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(resolve(root, name), 'utf8');
const marker = '<!-- POKEMON_STATIC_CATALOG_BUILD_SLOT -->';
const template = read('templates/index.template.html');
const catalog = read('templates/static-catalog.html');
const indexPath = resolve(root, 'index.html');

assert.equal(template.split(marker).length - 1, 1,
  'Expected exactly one catalog slot in the compact HTML source');
assert.ok(catalog.startsWith('<section id="staticCatalog" class="static-catalog"'),
  'Standalone catalog fragment must start with the original section');
assert.ok(catalog.endsWith('</section>'),
  'Standalone catalog fragment must end with the original section close');
assert.equal((catalog.match(/<article class="static-card">/g) || []).length, 1252,
  'The generated static catalog must include all 1,252 vintage card entries');
assert.equal((catalog.match(/<details[^>]*class="static-set"/g) || []).length, 15,
  'Expected the original 14 static sets and the Ancient Mew extra entry');

const generated = template.replace(marker, catalog);
if (process.argv.includes('--check')) {
  assert.equal(read('index.html'), generated,
    'index.html differs from its templates. Run: node scripts/build-index.mjs');
  console.log('PASS index.html is exactly reproducible (1,252 offline cards)');
} else if (process.argv.length === 2) {
  writeFileSync(indexPath, generated, 'utf8');
  console.log('Generated index.html from templates (1,252 offline cards)');
} else {
  throw Error('Usage: node scripts/build-index.mjs [--check]');
}
