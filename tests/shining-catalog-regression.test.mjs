import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('js/catalog-data.js', 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync('js/catalog-loader.js', 'utf8'), sandbox);
const { SETS, OFFLINE_PACKS } = sandbox.window.VintageCatalogData;
const state = { cards: [], ready: false };
const nodes = { fetchStatus: { hidden: false, classList: { add() {} } } };
const loader = sandbox.window.VintageCatalogLoader.create({ SETS, OFFLINE_PACKS, state, $: id => nodes[id], renderAll() {} });

test('Neo Shining secret cards are Pokémon under Pokémon-only filter', () => {
 loader.loadEmbeddedData();
 assert.equal(state.cards.length, 1252);
 for (const [set, first, last] of [['neo3', 65, 66], ['neo4', 106, 113]]) {
  for (let n = first; n <= last; n++) {
   const card = state.cards.find(c => c.id === set + '-' + n);
   assert.ok(card, set + '-' + n);
   assert.equal(card.kind, 'Pokémon', card.name);
   assert.equal(card.finish, 'shining', card.name);
  }
 }
});
