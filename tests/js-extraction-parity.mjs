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
  // Read the deployed query version from HTML so cache-busting a script
  // does not invalidate behavioral regression tests.
  const prefix = '<script' + (i === 3 ? ' type="module"' : '') +
    ' src="' + file + '?v=';
  const start = restored.indexOf(prefix);
  const end = restored.indexOf('</script>', start);
  assert.ok(start >= 0 && end > start, file + ' is not included in index');
  const tag = restored.slice(start, end + '</script>'.length);
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
  const data = readFileSync('js/catalog-data.js', 'utf8');
  if (setsStart >= 0 && packsStart >= 0 && packsEnd > packsStart) {
    // First catalog extraction compared the previously inline data.
    const sets = oldBinder.slice(setsStart, setsEnd);
    const packs = oldBinder.slice(packsStart, packsEnd);
    assert.ok(data.includes(sets) && data.includes(packs), 'Catalog data was modified');
    const rebuilt = newBinder.replace('const {SETS,OFFLINE_PACKS}=window.VintageCatalogData;', () => sets)
      .replace('\nfunction embeddedCards(){', () => '\n' + packs + '\nfunction embeddedCards(){');
    assert.equal(rebuilt, oldBinder, 'Catalog extraction changed binder code beyond the dependency');
  } else {
    // Later refactors compare against the already-extracted main-branch data.
    assert.equal(data, execFileSync('git', ['show','origin/main:js/catalog-data.js'], {encoding:'utf8'}),
      'Previously extracted catalog metadata unexpectedly changed');
  }
}
// Verify the shipment controller was moved unchanged, and loaded before binder.
if (updated.includes('js/shipments.js')) {
  const oldBinder = execFileSync('git', ['show','origin/main:js/binder.js'], {encoding:'utf8'});
  const newBinder = readFileSync('js/binder.js','utf8');
  const source = readFileSync('js/shipments.js','utf8');
  const call = 'const {renderShipments,refreshShipments}=window.VintageShipments.create({state,MAP,cardNumber,esc,$,ensureCloudEdit,save,toast});';
  const start = "window.VintageShipments={create({state,MAP,cardNumber,esc,$,ensureCloudEdit,save,toast}){\n";
  const end = "\nreturn {renderShipments,refreshShipments};\n}};";
  const i = source.indexOf(start), j = source.indexOf(end,i);
  assert.ok(i >= 0 && j > i, 'Shipment factory boundaries missing');
  const extracted = source.slice(i+start.length,j);
  if (oldBinder.includes(call)) {
    // Already extracted in main: compare standalone module against the baseline.
    if (!updated.includes('js/collection-views.js')) {
      assert.equal(newBinder, oldBinder, 'Binder controller unexpectedly changed');
    }
    assert.equal(source, execFileSync('git',['show','origin/main:js/shipments.js'], {encoding:'utf8'}),
      'Shipment controller unexpectedly changed');
  } else {
    // The original shipment extraction PR must reconstruct the old inlined code.
    assert.equal(newBinder.replace(call, () => extracted), oldBinder,
      'Shipment extraction changed any other binder behavior');
  }
  const shipmentsTag = '<script src="js/shipments.js?v=20261109-ship1"></script>';
  const binderTag = '<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(shipmentsTag) > 0 && updated.indexOf(shipmentsTag) < updated.indexOf(binderTag),
    'Shipment controller must be loaded before binder.js');
}
// Protect the binder + Wishlist view rendering extraction at the source level.
if (updated.includes('js/collection-views.js')) {
  const oldBinder = execFileSync('git', ['show','origin/main:js/binder.js'], {encoding:'utf8'});
  const newBinder = readFileSync('js/binder.js','utf8');
  const views = readFileSync('js/collection-views.js','utf8');
  const call = 'const {renderCollections}=window.VintageCollectionViews.create({state,MAP,$,esc,cardNumber,normalizeOrders,renderShipments,binderPageCount,refreshPlacementTargets,binderVisible,renderOwnedList,renderDeals});';
  const start = 'window.VintageCollectionViews={create({state,MAP,$,esc,cardNumber,normalizeOrders,renderShipments,binderPageCount,refreshPlacementTargets,binderVisible,renderOwnedList,renderDeals}){\n';
  const end = '\nreturn {renderCollections};\n}};';
  const i=views.indexOf(start), j=views.indexOf(end,i);
  assert.ok(i >= 0 && j > i,'Collection renderer factory has unexpected boundaries');
  const extracted=views.slice(i+start.length,j);
  if (oldBinder.includes(call)) {
    if (!updated.includes('js/owned-cards.js')) {
      assert.equal(newBinder,oldBinder,'Binder code changed outside collection views');
    }
    const previousViews=execFileSync('git',['show','origin/main:js/collection-views.js'],{encoding:'utf8'});
    const beforeWishlist=" $('wishlistItems').innerHTML=";
    const searchStart=" const wishQuery=";
    const afterWishlist=" renderOwnedList();";
    assert.ok(views.includes(searchStart), 'Wishlist search logic missing');
    assert.equal(views.slice(0,views.indexOf(searchStart)),
      previousViews.slice(0,previousViews.indexOf(searchStart)),
      'Binder rendering changed outside the Wishlist search feature');
    assert.equal(views.slice(views.indexOf(afterWishlist)),
      previousViews.slice(previousViews.indexOf(afterWishlist)),
      'Post-Wishlist collection behavior changed unexpectedly');
  } else {
    assert.equal(newBinder.replace(call,()=>extracted),oldBinder,
      'The extracted collection renderer differs from old binder code');
  }
  const viewScript='<script src="js/collection-views.js?v=20261111-wishsort1"></script>';
  const binderScript='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(viewScript)>0 && updated.indexOf(viewScript)<updated.indexOf(binderScript),
    'View renderer script must load before binder');
}
// Verify the owned-cards controller was extracted exactly from main.
if (updated.includes('js/owned-cards.js')) {
  const before=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const after=readFileSync('js/binder.js','utf8');
  const module=readFileSync('js/owned-cards.js','utf8');
  const call='const {sortedOwnedCards,refreshOwned,renderOwnedList}=window.VintageOwnedCards.create({state,MAP,$,SETS,showHolo,normalNum,searchKey,searchText,rarityHtml,esc,cardNumber,renderCollections:()=>renderCollections()});';
  const begin='window.VintageOwnedCards={create({state,MAP,$,SETS,showHolo,normalNum,searchKey,searchText,rarityHtml,esc,cardNumber,renderCollections}){\n';
  const end='\nreturn {sortedOwnedCards,refreshOwned,renderOwnedList};\n}};';
  const i=module.indexOf(begin),j=module.indexOf(end,i);
  assert.ok(i>=0&&j>i,'Owned-cards factory has unexpected boundaries');
  if (before.includes(call)) {
    // In later refactors the owned controller already exists in main.
    assert.equal(module, execFileSync('git',['show','origin/main:js/owned-cards.js'],{encoding:'utf8'}),
      'Previously extracted owned-cards controller changed');
  } else {
    assert.equal(after.replace(call,()=>module.slice(i+begin.length,j)),before,
      'Owned-cards extraction changed binder logic beyond this exact block');
  }
  const ownedTag='<script src="js/owned-cards.js?v=20261109-owned1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(ownedTag)>0&&updated.indexOf(ownedTag)<updated.indexOf(binderTag),
    'Owned cards controller must load before binder');
}
// Exact, lossless extraction of pointer and long-press touch reordering.
if (updated.includes('js/collection-drag.js')) {
  const mainBinder=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const branchBinder=readFileSync('js/binder.js','utf8');
  const dragModule=readFileSync('js/collection-drag.js','utf8');
  const call=' window.VintageCollectionDrag.attach({reorder,toast});';
  const open='window.VintageCollectionDrag={attach({reorder,toast}){\n';
  const close='\n}};';
  const i=dragModule.indexOf(open), j=dragModule.indexOf(close,i);
  assert.ok(i>=0&&j>i,'Collection drag module source boundaries missing');
  const extracted=dragModule.slice(i+open.length,j);
  if (mainBinder.includes(call)) {
    assert.equal(dragModule,execFileSync('git',['show','origin/main:js/collection-drag.js'],{encoding:'utf8'}),
      'Previously extracted drag module changed unexpectedly');
  } else {
    assert.equal(branchBinder.replace(call,()=>extracted),mainBinder,
      'Drag extraction modified unrelated collection logic or listeners');
  }
  const dragTag='<script src="js/collection-drag.js?v=20261109-drag1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(dragTag)>0&&updated.indexOf(dragTag)<updated.indexOf(binderTag),
    'Drag module must be available before the binder controller');
}
// The entire collection ordering controller must be moved without changing its logic.
if (updated.includes('js/collection-ordering.js')) {
  const before=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const after=readFileSync('js/binder.js','utf8');
  const ordering=readFileSync('js/collection-ordering.js','utf8');
  const call='const {normalizeOrders,binderVisible,binderPageCount,reorder}=window.VintageCollectionOrdering.create({state,ensureCloudEdit,save});\n';
  assert.ok(after.includes(call),'Collection ordering factory was removed from binder');
  if (before.includes(call)) {
    // The migration is already on main. Compare the standalone module itself,
    // while allowing unrelated binder refactors in subsequent PRs.
    assert.equal(ordering,execFileSync('git',['show','origin/main:js/collection-ordering.js'],
      {encoding:'utf8'}),'Previously extracted collection ordering controller changed');
  } else {
    // Only the migration PR should validate the precise source relocation.
    const i1=before.indexOf('// Collection organization:');
    const j1=before.indexOf('let binderSelectedId=null;',i1);
    const i2=before.indexOf('function binderPageCount(){');
    const j2=before.indexOf('\nfunction refreshPlacementTargets(',i2);
    const i3=before.indexOf('function reorder(kind,from,to){');
    const j3=before.indexOf('\nfunction removeFromBinder(',i3);
    assert.ok([i1,j1,i2,j2,i3,j3].every(x=>x>=0),'Ordering source anchors missing');
    const first=before.slice(i1,j1),pageCount=before.slice(i2,j2),reorder=before.slice(i3,j3);
    const expected=before.replace(first,()=>call).replace(pageCount,'').replace(reorder,'');
    assert.equal(after,expected,'Collection ordering extraction changed other binder code');
    const module="(()=>{'use strict';\nwindow.VintageCollectionOrdering={create({state,ensureCloudEdit,save}){\n"+
      first+pageCount+'\n'+reorder+
      '\nreturn {normalizeOrders,binderVisible,binderPageCount,reorder};\n}};\n})();\n';
    assert.equal(ordering,module,'Collection order implementation was changed during extraction');
  }
  const tag='<script src="js/collection-ordering.js?v=20261109-order1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(tag)>0&&updated.indexOf(tag)<updated.indexOf(binderTag),
    'Collection order module must load before binder');
}
// Exact migration of owned/wishlist mutation actions (including cloud tombstones).
if(updated.includes('js/card-actions.js')){
  const baseline=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const current=readFileSync('js/binder.js','utf8');
  const actions=readFileSync('js/card-actions.js','utf8');
  const first=baseline.indexOf('function toggleOwned(id){');
  const last=baseline.indexOf('function showModal(id){',first);
  const call='const {toggleOwned,removeWish,toggleWish,updatePurchasePrice}=window.VintageCardActions.create({state,$,ensureCloudEdit,normalizeOrders:()=>normalizeOrders(),save,renderAll,toast,showModal:id=>showModal(id)});\n';
  if (baseline.includes(call)) {
    // This module is already on main, so later refactors may legitimately
    // modify binder.js without changing its extracted card actions.
    assert.equal(actions,execFileSync('git',['show','origin/main:js/card-actions.js'],
      {encoding:'utf8'}),'Previously extracted card actions module changed');
  } else {
    assert.ok(first>=0&&last>first,'Card actions source anchors missing');
    const moved=baseline.slice(first,last);
    assert.equal(current,baseline.slice(0,first)+call+baseline.slice(last),
      'Card actions extraction modified unrelated binder code');
    assert.equal(actions,"(()=>{'use strict';\n"+
      'window.VintageCardActions={create({state,$,ensureCloudEdit,normalizeOrders,save,renderAll,toast,showModal}){\n'+
      moved+'\nreturn {toggleOwned,removeWish,toggleWish,updatePurchasePrice};\n}};\n})();\n',
      'Extracted card action function bodies changed unexpectedly');
  }
  const actionTag='<script src="js/card-actions.js?v=20261110-actions1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(actionTag)>0&&updated.indexOf(actionTag)<updated.indexOf(binderTag),
    'Card actions script must load before binder');
}
// Exact relocation of the complete card details template and its event handlers.
if(updated.includes('js/card-details.js')){
  const originalBinder=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const candidate=readFileSync('js/binder.js','utf8');
  const modal=readFileSync('js/card-details.js','utf8');
  const start=originalBinder.indexOf('function showModal(id){');
  const end=originalBinder.indexOf('function download(content',start);
  const call='const {showModal}=window.VintageCardDetails.create({state,MAP,$,esc,cardNumber,rarityHtml,dealAuctionUrl,toggleOwned,toggleWish,ensureCloudEdit,openMovePicker,save,renderCards,updatePurchasePrice});\n';
  if(originalBinder.includes(call)){
    assert.ok(modal.includes('id="modalDeals"')&&modal.includes('openDealsForCard(c.id)'),
      'Card details must expose scoped Deals navigation');
  }else{
    assert.ok(start>=0&&end>start,'Card details source boundaries missing');
    const code=originalBinder.slice(start,end);
    assert.equal(candidate,originalBinder.slice(0,start)+call+originalBinder.slice(end),
      'Details extraction unexpectedly modified binder code');
    const expected="(()=>{'use strict';\n"+
      'window.VintageCardDetails={create({state,MAP,$,esc,cardNumber,rarityHtml,dealAuctionUrl,toggleOwned,toggleWish,ensureCloudEdit,openMovePicker,save,renderCards,updatePurchasePrice}){\n'+
      code+'\nreturn {showModal};\n}};\n})();\n';
    assert.equal(modal,expected,'Card details dialog markup or handlers changed');
  }
  const modalTag='<script src="js/card-details.js?v=20261111-carddeals1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(modalTag)>0&&updated.indexOf(modalTag)<updated.indexOf(binderTag),
    'Details module must load before binder');
}
// Catalog filtering, rendering and progress counters are extracted byte-for-byte.
if(updated.includes('js/catalog-ui.js')){
  const originalBinder=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const candidate=readFileSync('js/binder.js','utf8');
  const movedModule=readFileSync('js/catalog-ui.js','utf8');
  const start=originalBinder.indexOf('function catalog(){');
  const end=originalBinder.indexOf('function toast(msg)',start);
  const call="const {catalog,relevantSetCards,showHolo,searchKey,searchText,visible,groups,renderSide,renderStats,rarityHtml,cardHTML,renderCards,renderAll}=window.VintageCatalogUI.create({state,MAP,SETS,$,esc,nf,cardNumber,normalNum,renderCollections:()=>renderCollections()});\n";
  if(originalBinder.includes(call)){
    // The catalog UI extraction has already landed on main.
    assert.equal(movedModule,execFileSync('git',['show','origin/main:js/catalog-ui.js'],
      {encoding:'utf8'}),'Previously extracted catalog UI changed');
  }else{
    assert.ok(start>=0&&end>start,'Catalog UI source boundaries missing');
    const block=originalBinder.slice(start,end);
    assert.equal(candidate,originalBinder.slice(0,start)+call+originalBinder.slice(end),
      'Catalog extraction unexpectedly changed other app code');
    const expected="(()=>{'use strict';\n"+
      'window.VintageCatalogUI={create({state,MAP,SETS,$,esc,nf,cardNumber,normalNum,renderCollections}){\n'+
      block+'\nreturn {catalog,relevantSetCards,showHolo,searchKey,searchText,visible,groups,renderSide,renderStats,rarityHtml,cardHTML,renderCards,renderAll};\n}};\n})();\n';
    assert.equal(movedModule,expected,'Catalog UI function bodies changed');
  }
  const uiTag='<script src="js/catalog-ui.js?v=20261110-catui1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(uiTag)>0&&updated.indexOf(uiTag)<updated.indexOf(binderTag),
    'Catalog UI must load before binder app');
}
// The offline set decoder and bootstrap are moved exactly, without editing data.
if(updated.includes('js/catalog-loader.js')){
  const before=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const after=readFileSync('js/binder.js','utf8');
  const loader=readFileSync('js/catalog-loader.js','utf8');
  const call='const {loadEmbeddedData}=window.VintageCatalogLoader.create({SETS,OFFLINE_PACKS,state,$,renderAll:()=>renderAll()});\n';
  assert.ok(after.includes(call),'Catalog loader is no longer initialized by binder');
  if(before.includes(call)){
    // Already in main: compare the module itself so later binder refactors
    // need not reconstruct functions that were previously extracted.
    assert.equal(loader,execFileSync('git',['show','origin/main:js/catalog-loader.js'],
      {encoding:'utf8'}),'Previously extracted catalog loader changed unexpectedly');
  }else{
    const a=before.indexOf('function embeddedCards(){');
    const b=before.indexOf('const $=id',a);
    const d=before.indexOf('function loadEmbeddedData(){');
    const e=before.indexOf('const {catalog',d);
    assert.ok(a>=0&&b>a&&d>b&&e>d,'Offline catalog loader boundaries missing');
    const embedded=before.slice(a,b),load=before.slice(d,e);
    const expected=before.slice(0,a)+before.slice(b,d)+call+before.slice(e);
    assert.equal(after,expected,'Loader extraction changed unrelated binder code');
    const expectedModule="(()=>{'use strict';\n"+
      'window.VintageCatalogLoader={create({SETS,OFFLINE_PACKS,state,$,renderAll}){\n'+
      embedded+load+'\nreturn {loadEmbeddedData};\n}};\n})();\n';
    assert.equal(loader,expectedModule,'Offline dataset decoder or bootstrap logic changed');
  }
  const loaderTag='<script src="js/catalog-loader.js?v=20261110-loader1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(loaderTag)>0&&updated.indexOf(loaderTag)<updated.indexOf(binderTag),
    'Catalog loader must load before binder entrypoint');
}
// Verify that the state/persistence coordinator is loaded before binder.
if(updated.includes('js/collection-state.js')){
  const module=readFileSync('js/collection-state.js','utf8');
  assert.ok(module.includes('window.VintageCollectionState={create('),'Missing collection-state factory');
  const stateTag='<script src="js/collection-state.js?v=20261110-state1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(stateTag)>0 && updated.indexOf(stateTag)<updated.indexOf(binderTag),
    'Collection state must load before binder');
  assert.ok(readFileSync('js/binder.js','utf8').includes('window.VintageCollectionState.create('),
    'Binder no longer wires the collection state factory');
  const baseBinder=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const currentBinder=readFileSync('js/binder.js','utf8');
  const call='const {state,getProgress,adoptProgress,ensureCloudEdit,save,normalizeShipment}=window.VintageCollectionState.create({$: $,normalizeOrders:()=>normalizeOrders(),renderAll:()=>renderAll(),renderCollections:()=>renderCollections(),toast:msg=>toast(msg)});\n';
  const oldStart=baseBinder.indexOf('const state={cards:[]');
  if(oldStart>=0){
    const oldEnd=baseBinder.indexOf('window.VintageBinder={',oldStart);
    assert.ok(oldEnd>oldStart,'State extraction boundary missing');
    const oldSource=baseBinder.slice(oldStart,oldEnd);
    const expectedModule="(()=>{'use strict';\n"+
      '// The collection\'s single in-memory state and the cloud-edit/save bridge.\n'+
      '// Persistent storage remains exclusively in firebase-cloud.js / Firestore.\n'+
      'window.VintageCollectionState={create({$,normalizeOrders,renderAll,renderCollections,toast}){\n'+
      oldSource+'return {state,getProgress,adoptProgress,ensureCloudEdit,save,normalizeShipment};\n}};\n})();\n';
    assert.equal(module,expectedModule,'Collection state implementation changed during extraction');
    assert.equal(currentBinder,baseBinder.slice(0,oldStart)+call+baseBinder.slice(oldEnd),
      'Collection state extraction altered unrelated binder logic');
  } else {
    // On subsequent refactors, the state module already exists in main.
    assert.equal(module,execFileSync('git',['show','origin/main:js/collection-state.js'],
      {encoding:'utf8'}),'Extracted collection state unexpectedly changed');
  }
}
// Preserve the exact backup/CSV/import behavior when moving it into a module.
if(updated.includes('js/collection-backup.js')){
  const module=readFileSync('js/collection-backup.js','utf8');
  const before=execFileSync('git',['show','origin/main:js/binder.js'],{encoding:'utf8'});
  const after=readFileSync('js/binder.js','utf8');
  const factory='const {backup,copyWishlist,exportCSV,importBackup}=window.VintageCollectionBackup.create({state,MAP,cardNumber,toast,getProgress,normalizeOrders:()=>normalizeOrders(),sortedOwnedCards:()=>sortedOwnedCards(),ensureCloudEdit,save,renderAll,normalizeShipment});\n';
  const start=before.indexOf('function download(content,type,filename){');
  const backupTag='<script src="js/collection-backup.js?v=20261110-backup1"></script>';
  const binderTag='<script src="js/binder.js?v=20261111-carddeals1"></script>';
  assert.ok(updated.indexOf(backupTag)>0&&updated.indexOf(backupTag)<updated.indexOf(binderTag),
    'Backup controller must be loaded before binder');
  assert.ok(after.includes(factory),'Binder backup factory is not wired');
  if(start>=0){
    const end=before.indexOf('const {normalizeOrders,binderVisible,binderPageCount,reorder}',start);
    assert.ok(end>start,'Backup extraction boundary missing');
    const block=before.slice(start,end);
    const expected="(()=>{'use strict';\n"+
      '// JSON backup/restore, owned-card CSV and Wishlist clipboard export.\n'+
      '// This module does not read/write Firestore directly: changes go through save().\n'+
      'window.VintageCollectionBackup={create({state,MAP,cardNumber,toast,getProgress,normalizeOrders,sortedOwnedCards,ensureCloudEdit,save,renderAll,normalizeShipment}){\n'+
      block+'return {backup,copyWishlist,exportCSV,importBackup};\n}};\n})();\n';
    assert.equal(module,expected,'Backup functions changed during extraction');
    assert.equal(after,before.slice(0,start)+factory+before.slice(end),
      'Backup extraction altered unrelated binder logic');
  } else {
    assert.equal(module,execFileSync('git',['show','origin/main:js/collection-backup.js'],
      {encoding:'utf8'}),'Previously extracted backup controller unexpectedly changed');
  }
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
  if (version === 'updated') {
    const initialPlacementClosed = await page.evaluate(() =>
      !document.querySelector('.binder-place').open);
    assert.equal(initialPlacementClosed, true, 'Placement must be closed on first load');
  }
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
  // Verify the generated catalog still exposes the same named cards, including
  // the special Ancient Mew image, in both the baseline and candidate app.
  const catalogSamples=await page.evaluate(()=>{
    const ids=['base1-1','base2-3','neo4-105','movie2000-ancient-mew'];
    return ids.map(id=>window.VintageBinder.getCardInfo(id));
  });
  assert.ok(catalogSamples.every(Boolean),'Some known vintage catalog entries are missing');
  if(version==='updated'&&updated.includes('js/catalog-loader.js')){
    assert.ok(fetched.some(x=>x.file==='catalog-loader.js'&&x.status===200),
      'Catalog loader script did not load');
    const boot=await page.evaluate(()=>{
      const data=window.VintageCatalogData;
      const local={cards:[],failures:['stale'],ready:false};
      let rendered=0;
      const el={hidden:false,classList:{add(){}},textContent:''};
      const factory=window.VintageCatalogLoader.create({
        SETS:data.SETS,OFFLINE_PACKS:data.OFFLINE_PACKS,state:local,
        $:()=>el,renderAll:()=>{rendered++}
      });
      factory.loadEmbeddedData();
      const ancient=local.cards.find(c=>c.id==='movie2000-ancient-mew');
      return {
        count:local.cards.length,unique:new Set(local.cards.map(c=>c.id)).size,
        ready:local.ready,rendered,ancient:ancient?.image,failures:local.failures.length
      };
    });
    assert.deepEqual(boot,{
      count:1252,unique:1252,ready:true,rendered:1,
      ancient:'assets/ancient-mew.jpg',failures:0
    },'Isolated embedded catalog decoding or bootstrap regressed');
  }
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
  // Exercise the real pointer event listeners, not the reorder buttons.
  // document.elementFromPoint is overridden only to make the drop target
  // deterministic under both 390px and 1440px viewports.
  const dragState = await page.evaluate(async () => {
    function seed() {
      window.VintageBinder.adoptProgress({
        owned:{'base1-1':true},
        wish:{'base2-3':true,'base2-4':true},
        wishOrder:['base2-3','base2-4'],
        binderOrder:['base1-1','base2-3','base2-4']
      });
      window.VintageCloud={canEdit:()=>true,onChange:()=>{}};
      document.querySelector('[data-view-btn="wishlist"]').click();
    }
    const orders=()=>window.VintageBinder.getProgress().wishOrder;
    seed();
    const dragFrom=document.querySelector('.wish-item[data-order-index="0"]');
    const dropTo=document.querySelector('.wish-item[data-order-index="1"]');
    const original=document.elementFromPoint.bind(document);
    document.elementFromPoint=()=>dropTo;
    try {
      dragFrom.dispatchEvent(new PointerEvent('pointerdown',{
        bubbles:true,pointerId:301,pointerType:'mouse',button:0,clientX:40,clientY:120
      }));
      document.dispatchEvent(new PointerEvent('pointermove',{
        bubbles:true,pointerId:301,pointerType:'mouse',button:0,clientX:90,clientY:190
      }));
      document.dispatchEvent(new PointerEvent('pointerup',{
        bubbles:true,pointerId:301,pointerType:'mouse',button:0,clientX:90,clientY:190
      }));
    } finally {
      document.elementFromPoint=original;
    }
    const afterPointer=orders();
    const noGhostAfterPointer=!document.querySelector('.drag-ghost,.drag-origin');
    seed();
    const touchFrom=document.querySelector('.wish-item[data-order-index="0"]');
    const touchTo=document.querySelector('.wish-item[data-order-index="1"]');
    const originalTouch=document.elementFromPoint.bind(document);
    document.elementFromPoint=()=>touchTo;
    const touch=(target,x,y)=>new Touch({
      identifier:402,target,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y
    });
    const begin=touch(touchFrom,40,160),move=touch(touchFrom,90,210);
    try {
      touchFrom.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,
        touches:[begin],targetTouches:[begin],changedTouches:[begin]}));
      // Wait for the long-press gesture itself, not a fixed time interval.
      // Chromium and CI hosts may schedule the 320ms timer later under load.
      const start=performance.now();
      while(!document.querySelector('.drag-ghost') && performance.now()-start<2500){
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      if(!document.querySelector('.drag-ghost'))throw Error('Long-press gesture never activated; target connected='+touchFrom.isConnected);
      document.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,
        touches:[move],targetTouches:[move],changedTouches:[move]}));
      document.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,
        touches:[],targetTouches:[],changedTouches:[move]}));
    } finally {
      document.elementFromPoint=originalTouch;
    }
    const afterTouch=orders();
    const noGhostAfterTouch=!document.querySelector('.drag-ghost,.drag-origin');
    window.VintageCloud={canEdit:()=>false,onChange:()=>{}};
    return {afterPointer,noGhostAfterPointer,afterTouch,noGhostAfterTouch};
  });
  assert.deepEqual(dragState.afterPointer,['base2-4','base2-3'],'Pointer reorder failed');
  assert.deepEqual(dragState.afterTouch,['base2-4','base2-3'],'Touch long-press reorder failed');
  assert.equal(dragState.noGhostAfterPointer,true,'Pointer drag ghost left in DOM');
  assert.equal(dragState.noGhostAfterTouch,true,'Touch drag ghost left in DOM');
  if(version==='updated'&&updated.includes('js/collection-drag.js')){
    assert.ok(fetched.some(e=>e.file==='collection-drag.js'&&e.status===200),
      'Collection drag script did not load with HTTP 200');
  }
  // Intentional click suppression lasts 300ms after touch drag so users do
  // not accidentally open/move a card when releasing it. Let it expire
  // before testing ordinary wishlist clicks and card details in this page.
  await page.waitForTimeout(400);
  // Catalog behavior: set selection, ownership/Wishlist status, finish/type
  // filters, name/holo ordering and normalized text search.
  const catalogState=await page.evaluate(()=>{
    const $=id=>document.getElementById(id);
    const cards=()=>[...document.querySelectorAll('#cards .poke-card')].map(n=>n.dataset.id);
    const update=(id,value,type='change')=>{
      const el=$(id);
      if(!el)throw Error('Catalog control missing '+id);
      if(el.type==='checkbox')el.checked=Boolean(value);else el.value=value;
      el.dispatchEvent(new Event(type,{bubbles:true}));
    };
    window.VintageBinder.adoptProgress({
      owned:{'base1-1':true},
      wish:{'base1-2':true},
      wishOrder:['base1-2']
    });
    document.querySelector('[data-view-btn="catalog"]').click();
    update('search','','input');
    const initial={
      cards:cards().slice(0,5),
      count:$('resultsCount').textContent,
      sideGroups:[...document.querySelectorAll('#sideBase [data-set]')].map(n=>n.dataset.set).slice(0,5)
    };
    const baseButton=document.querySelector('#side [data-set="base1"]');
    if(!baseButton)throw Error('Base set button missing');
    baseButton.click();
    const base={cards:cards().slice(0,5),section:$('sectionTitle').textContent};
    update('statusSelect','owned');
    const owned=cards();
    update('statusSelect','wish');
    const wish=cards();
    update('statusSelect','all');
    update('holoOnly',true);
    const holo=cards().slice(0,20);
    update('holoOnly',false);
    update('pokemonOnly',true);
    const pokemon=cards();
    update('pokemonOnly',false);
    update('sortSelect','name');
    const byName=cards().slice(0,8);
    update('sortSelect','holo');
    const holoFirst=cards().slice(0,8);
    update('sortSelect','num');
    update('search','Gyrados','input');
    const fuzzy={cards:cards(),count:$('resultsCount').textContent};
    update('search','','input');
    return {initial,base,owned,wish,holo,pokemon,byName,holoFirst,fuzzy};
  });
  assert.ok(catalogState.base.cards.includes('base1-1'),'Base set filtering omitted expected card');
  assert.deepEqual(catalogState.owned,['base1-1'],'Owned filter missing selected card');
  assert.deepEqual(catalogState.wish,['base1-2'],'Wishlist filter missing selected card');
  assert.ok(catalogState.holo.includes('base1-1'),'Holographic filter did not show a holo card');
  assert.ok(!catalogState.pokemon.includes('base1-96'),'Pokémon-only filter included Energy');
  assert.ok(catalogState.fuzzy.cards.length>=1,'Normalized Gyarados spelling search failed');
  if(version==='updated'&&updated.includes('js/catalog-ui.js')){
    assert.ok(fetched.some(x=>x.file==='catalog-ui.js'&&x.status===200),
      'Catalog UI module did not load');
  }
  // Actual collection-card clicks (no real Google session). Verify bidirectional
  // exclusivity, tombstone persistence, purchase amount and currency editing.
  const cardActionState=await page.evaluate(()=>{
    const saved=[];
    window.VintageCloud={canEdit:()=>true,onChange:args=>saved.push(!!args?.immediate)};
    window.VintageBinder.adoptProgress({
      owned:{},
      wish:{'base1-1':true},
      wishOrder:['base1-1']
    });
    document.querySelector('[data-view-btn="catalog"]').click();
    document.querySelector('#search').value='';
    document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));
    const click=selector=>{
      const node=document.querySelector(selector);
      if(!node)throw Error('Missing card action '+selector);
      node.click();
    };
    click('[data-own="base1-1"]');
    const afterOwned=window.VintageBinder.getProgress();
    click('[data-own="base1-1"]');
    const afterRemove=window.VintageBinder.getProgress();
    click('[data-wish="base1-1"]');
    const afterWish=window.VintageBinder.getProgress();
    click('[data-wish="base1-1"]');
    const afterWishRemove=window.VintageBinder.getProgress();
    click('[data-own="base1-1"]');
    click('#cards [data-preview="base1-1"]');
    const modalOpen=document.querySelector('#modal').open;
    document.querySelector('#modalPurchaseAmount').value='12.50';
    document.querySelector('#modalPurchaseCurrency').value='EUR';
    document.querySelector('#modalPurchaseAmount').dispatchEvent(new Event('change',{bubbles:true}));
    const afterPurchase=window.VintageBinder.getProgress();
    document.querySelector('#modalPurchaseAmount').value='';
    document.querySelector('#modalPurchaseAmount').dispatchEvent(new Event('change',{bubbles:true}));
    const afterPurchaseClear=window.VintageBinder.getProgress();
    document.querySelector('#modal').close();
    window.VintageCloud={canEdit:()=>false,onChange:()=>{}};
    return {
      afterOwned:{owned:!!afterOwned.owned['base1-1'],wish:!!afterOwned.wish['base1-1'],
        tombstone:!!afterOwned.removedWish['base1-1'],
        wishOrder:afterOwned.wishOrder,addedAt:afterOwned.ownedAddedAt['base1-1']>0},
      afterRemove:{owned:!!afterRemove.owned['base1-1'],
        ownedAddedAt:afterRemove.ownedAddedAt['base1-1']??null},
      afterWish:{wish:!!afterWish.wish['base1-1'],owned:!!afterWish.owned['base1-1'],
        wishOrder:afterWish.wishOrder,tombstone:!!afterWish.removedWish['base1-1']},
      afterWishRemove:{wish:!!afterWishRemove.wish['base1-1'],
        tombstone:!!afterWishRemove.removedWish['base1-1'],wishOrder:afterWishRemove.wishOrder},
      modalOpen,paid:afterPurchase.purchasePrices['base1-1'],
      cleared:afterPurchaseClear.purchasePrices['base1-1']??null,
      immediateSaves:saved.filter(Boolean).length
    };
  });
  assert.equal(cardActionState.afterOwned.owned,true,'Add-to-owned failed');
  assert.equal(cardActionState.afterOwned.wish,false,'Owned/Wishlist exclusivity failed');
  assert.equal(cardActionState.afterOwned.tombstone,true,'Wishlist removal tombstone missing');
  assert.equal(cardActionState.afterOwned.addedAt,true,'Owned added timestamp missing');
  assert.equal(cardActionState.afterRemove.owned,false,'Remove owned failed');
  assert.equal(cardActionState.afterRemove.ownedAddedAt,null,'Owned added timestamp not cleared');
  assert.deepEqual(cardActionState.afterWish.wishOrder,['base1-1'],'Wishlist add failed');
  assert.equal(cardActionState.afterWish.tombstone,false,'Re-added wishlist tombstone not cleared');
  assert.equal(cardActionState.afterWishRemove.tombstone,true,'Wishlist delete tombstone missing');
  assert.deepEqual(cardActionState.afterWishRemove.wishOrder,[],'Deleted wish still in order');
  assert.equal(cardActionState.modalOpen,true,'Owned card details did not open');
  assert.deepEqual(cardActionState.paid,{amount:12.5,currency:'EUR'},
    'Owned card purchase cost or currency changed');
  assert.equal(cardActionState.cleared,null,'Clearing purchase cost failed');
  assert.ok(cardActionState.immediateSaves>=4,'Expected cloud change notifications missing');
  if(version==='updated'&&updated.includes('js/card-actions.js')){
    assert.ok(fetched.some(x=>x.file==='card-actions.js'&&x.status===200),
      'Card actions script did not load');
  }
  // Exercise card details interactions with real DOM handlers and in-memory
  // cloud authorization: condition, 1st edition, owned->wishlist and move to binder.
  const detailState=await page.evaluate(()=>{
    window.VintageCloud={canEdit:()=>true,onChange:()=>{}};
    window.VintageBinder.adoptProgress({owned:{'base1-1':true}});
    document.querySelector('[data-view-btn="catalog"]').click();
    document.querySelector('#search').value='';
    document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));
    const card=document.querySelector('#cards [data-preview="base1-1"]');
    if(!card)throw Error('Card details preview entry not found');
    card.click();
    const modal=document.querySelector('#modal');
    const details=document.querySelector('#modalContent');
    const opening={
      open:modal.open,
      title:details.querySelector('h3')?.textContent,
      ownedButton:!!details.querySelector('#modalOwned'),
      dealsButton:!!details.querySelector('#modalDeals'),
      wishButton:!!details.querySelector('#modalWish'),
      purchaseFieldVisible:!details.querySelector('#modalPurchaseBox')?.hidden,
      cardNumber:details.querySelector('.card-sub')?.textContent||''
    };
    const condition=details.querySelector('#modalCondition');
    condition.value='LP';
    condition.dispatchEvent(new Event('change',{bubbles:true}));
    const edition=details.querySelector('#modalFirstEdition');
    edition.checked=true;
    edition.dispatchEvent(new Event('change',{bubbles:true}));
    const afterMeta=window.VintageBinder.getProgress();
    document.querySelector('#modalOwned').click();
    const afterOwnedOff={
      owned:!!window.VintageBinder.getProgress().owned['base1-1'],
      wishActionVisible:!!document.querySelector('#modalWish'),
      purchaseFieldVisible:!document.querySelector('#modalPurchaseBox')?.hidden
    };
    document.querySelector('#modalWish').click();
    const afterWish={
      wished:!!window.VintageBinder.getProgress().wish['base1-1'],
      owned:!!window.VintageBinder.getProgress().owned['base1-1'],
      canMove:!!document.querySelector('#modalMove')
    };
    document.querySelector('#modalMove').click();
    const afterMove={
      detailsClosed:!modal.open,
      binderVisible:!document.querySelector('#binderPage').hidden,
      targetName:document.querySelector('#binderSelected').textContent
    };
    window.VintageCloud={canEdit:()=>false,onChange:()=>{}};
    return {
      opening,
      condition:afterMeta.conditions['base1-1'],
      firstEdition:!!afterMeta.firstEdition['base1-1'],
      afterOwnedOff,afterWish,afterMove
    };
  });
  assert.equal(detailState.opening.open,true,'Details modal failed to open');
  assert.equal(detailState.opening.dealsButton,true,'Card details must offer scoped Deals search');
  assert.equal(detailState.opening.purchaseFieldVisible,true,'Owned purchase input hidden');
  assert.equal(detailState.condition,'LP','Condition edit did not persist');
  assert.equal(detailState.firstEdition,true,'First Edition flag did not persist');
  assert.equal(detailState.afterOwnedOff.owned,false,'Modal remove-owned failed');
  assert.equal(detailState.afterOwnedOff.wishActionVisible,true,'Wishlist action missing');
  assert.equal(detailState.afterOwnedOff.purchaseFieldVisible,false,'Purchase input remained visible');
  assert.equal(detailState.afterWish.wished,true,'Modal add-wishlist failed');
  assert.equal(detailState.afterWish.owned,false,'Modal Wishlist/owned exclusivity failed');
  assert.equal(detailState.afterMove.detailsClosed,true,'Move-to-binder did not close details');
  assert.equal(detailState.afterMove.binderVisible,true,'Move-to-binder did not navigate');
  if(version==='updated'&&updated.includes('js/card-details.js')){
    assert.ok(fetched.some(x=>x.file==='card-details.js'&&x.status===200),
      'Card details module failed to load');
  }
  // Owned collection regression: sorting, filter, holo counts and price totals.
  // Use a deterministic local price stub; never touch live Firestore or price API.
  const ownedState = await page.evaluate(() => {
    window.VintageMarketPrices.getOwnedPrice=card=>({
      'base1-1':45,'base1-16':70,'base1-17':2,'base2-3':25
    })[card.id] ?? null;
    window.VintageBinder.adoptProgress({
      owned:{'base1-1':true,'base1-16':true,'base1-17':true,'base2-3':true},
      conditions:{'base1-1':'LP','base1-16':'LP','base1-17':'LP','base2-3':'LP'},
      ownedAddedAt:{'base1-1':100,'base1-16':200,'base1-17':300,'base2-3':400}
    });
    document.querySelector('[data-view-btn="owned"]').click();
    const items=()=>[...document.querySelectorAll('#ownedItems .owned-item')]
      .map(el=>({id:el.dataset.openOwned,condition:el.querySelector('.owned-condition')?.textContent||'',
        price:el.querySelector('.owned-price')?.textContent||''}));
    const select=document.querySelector('#ownedSort');
    const sorted={};
    for(const mode of ['added','holo','set','price']){
      select.value=mode;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      sorted[mode]=items();
    }
    const summary={
      count:document.querySelector('#ownedCount').textContent,
      holo:document.querySelector('#ownedCount').textContent,
      value:document.querySelector('#ownedTotalValue').textContent,
      valueTitle:document.querySelector('#ownedTotalValue').title
    };
    const input=document.querySelector('#ownedFind');
    input.value='Flareon';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    const filtered=items();
    input.value='';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    return {sorted,summary,filtered};
  });
  assert.equal(ownedState.sorted.added.length,4,'Owned card fixtures missing');
  assert.deepEqual(ownedState.sorted.added.map(x=>x.id),
    ['base2-3','base1-17','base1-16','base1-1'],'Added-time sorting failed');
  assert.equal(ownedState.sorted.price[0].id,'base1-16','Price sorting failed');
  assert.equal(ownedState.summary.value,'$142.00','Owned valuation total incorrect');
  assert.deepEqual(ownedState.filtered.map(x=>x.id),['base2-3'],'Owned search incorrect');
  if (version === 'updated' && updated.includes('js/owned-cards.js')) {
    assert.ok(fetched.some(x=>x.file==='owned-cards.js'&&x.status===200),
      'Owned-cards module did not load');
  }
  // Collection interaction regression: wishlist move-to-top, independent binder
  // order, and visibility of wishlist-only pockets. No Firestore writes.
  const collectionState = await page.evaluate(() => {
    window.VintageBinder.adoptProgress({
      owned:{'base1-1':true,'base1-2':true},
      wish:{'base2-3':true,'base2-4':true},
      wishOrder:['base2-3','base2-4'],
      binderOrder:['base1-1','base2-3','base1-2','base2-4'],
      binderIncludeWish:true
    });
    window.VintageCloud = {canEdit:()=>true,onChange:()=>{}};
    document.querySelector('[data-view-btn="wishlist"]').click();
    const beforeWishlist = [...document.querySelectorAll('.wish-item')].map(row => ({
      id:row.dataset.openWish,order:Number(row.dataset.orderIndex),
      draggable:row.dataset.dragKind
    }));
    document.querySelector('[data-wish-move="base2-4"]').click();
    const moveDialogOpened = document.querySelector('#wishMoveDialog').open;
    document.querySelector('#wishMoveTop').click();
    const afterWishlist = [...document.querySelectorAll('.wish-item')].map(row=>row.dataset.openWish);
    const afterWishOrder = window.VintageBinder.getProgress().wishOrder;
    document.querySelector('[data-view-btn="binder"]').click();
    const beforeBinder = [...document.querySelectorAll('.binder-pocket[data-card-id]')]
      .map(row=>({id:row.dataset.cardId,wishOnly:row.classList.contains('wish')}));
    document.querySelector('[data-move-kind="binder"][data-move-index="0"][data-move-delta="1"]').click();
    const afterBinderOrder = window.VintageBinder.getProgress().binderOrder;
    const afterBinder = [...document.querySelectorAll('.binder-pocket[data-card-id]')]
      .map(row=>row.dataset.cardId);
    const checkbox = document.querySelector('#binderIncludeWish');
    checkbox.click();
    const overlayHidden = {
      setting:window.VintageBinder.getProgress().binderIncludeWish,
      mutedCards:document.querySelectorAll('.binder-pocket.wish-muted').length
    };
    // Reset auth to read-only so shipment tab navigation cannot start network calls.
    window.VintageCloud = {canEdit:()=>false,onChange:()=>{}};
    return {
      beforeWishlist,moveDialogOpened,afterWishlist,afterWishOrder,
      beforeBinder,afterBinderOrder,afterBinder,overlayHidden
    };
  });
  assert.equal(collectionState.beforeWishlist.length, 2, 'Wishlist fixtures missing');
  assert.equal(collectionState.moveDialogOpened, true, 'Wishlist move dialog did not open');
  assert.deepEqual(collectionState.afterWishOrder, ['base2-4','base2-3'], 'Move-to-top failed');
  assert.deepEqual(collectionState.afterBinderOrder,
    ['base2-3','base1-1','base1-2','base2-4'], 'Binder reorder failed');
  assert.equal(collectionState.overlayHidden.setting, false, 'Wishlist overlay toggle failed');
  assert.equal(collectionState.overlayHidden.mutedCards, 2, 'Wishlist-only pockets not muted');
  // Wishlist search is view-only: original global priority indices and drag targets
  // must remain intact, including when a filtered card is moved to the top.
  if(version==='updated'){
    const wishlistSearch=await page.evaluate(()=>{
      window.VintageBinder.adoptProgress({
        owned:{},
        wish:{'base2-3':true,'base2-4':true},
        wishOrder:['base2-4','base2-3']
      });
      window.VintageCloud={canEdit:()=>true,onChange:()=>{}};
      document.querySelector('[data-view-btn="wishlist"]').click();
      const input=document.querySelector('#wishFind');
      input.focus();
      const show=()=>[...document.querySelectorAll('#wishlistItems .wish-item')].map(el=>({
        id:el.dataset.openWish,
        position:Number(el.dataset.orderIndex),
        dragIndex:Number(el.dataset.dragIndex),
        rank:el.querySelector('.wish-rank')?.textContent.trim()
      }));
      const type=value=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
      const initial=show();
      type('FLAREON');
      const byName=show(),focused=document.activeElement===input;
      const count=document.querySelector('#wishCount').textContent;
      const savedOrder=window.VintageBinder.getProgress().wishOrder;
      type('Jungle');
      const bySet=show();
      type('4/64');
      const byNumber=show();
      type('card-that-does-not-exist');
      const noMatches=show().length===0 &&
        document.querySelector('#wishlistItems').textContent.includes('לא נמצאו קלפים');
      type('Flareon');
      document.querySelector('[data-wish-move="base2-3"]').click();
      document.querySelector('#wishMoveTop').click();
      const afterMove=show();
      const reordered=window.VintageBinder.getProgress().wishOrder;
      type('');
      const restored=show();
      document.querySelector('[data-view-btn="binder"]').click();
      window.VintageCloud={canEdit:()=>false,onChange:()=>{}};
      return {initial,byName,bySet,byNumber,focused,count,savedOrder,
        noMatches,afterMove,reordered,restored};
    });
    const ids=rows=>rows.map(r=>r.id);
    assert.deepEqual(ids(wishlistSearch.initial),['base2-4','base2-3']);
    assert.deepEqual(ids(wishlistSearch.byName),['base2-3'],'Wishlist name filter failed');
    assert.equal(wishlistSearch.byName[0].position,1,'Filtered card lost its original index');
    assert.equal(wishlistSearch.byName[0].dragIndex,1,'Filtered drag index is incorrect');
    assert.equal(wishlistSearch.byName[0].rank,'2','Filtered card priority was renumbered');
    assert.deepEqual(ids(wishlistSearch.bySet),['base2-4','base2-3'],'Wishlist set filter failed');
    assert.deepEqual(ids(wishlistSearch.byNumber),['base2-4'],'Wishlist number filter failed');
    assert.equal(wishlistSearch.focused,true,'Typing into Wishlist search lost focus');
    assert.equal(wishlistSearch.count,'2 משאלות','Search changed the full Wishlist count');
    assert.deepEqual(wishlistSearch.savedOrder,['base2-4','base2-3'],'Search mutated saved order');
    assert.equal(wishlistSearch.noMatches,true,'No-results message missing');
    assert.deepEqual(wishlistSearch.reordered,['base2-3','base2-4'],'Move-to-top under filter failed');
    assert.equal(wishlistSearch.afterMove[0].rank,'1','Priority did not update after move');
    assert.deepEqual(ids(wishlistSearch.restored),['base2-3','base2-4'],'Clearing search did not restore order');
  }
  // Normalize legacy, duplicated or inconsistent order arrays deterministically.
  const normalized = await page.evaluate(() => {
    window.VintageBinder.adoptProgress({
      owned:{'base1-1':true,'base1-2':true},
      wish:{'base1-1':true,'base2-3':true},
      binderOrder:['base2-3','base1-1','base2-3','missing-card'],
      wishOrder:['missing-card','base2-3','base2-3']
    });
    const progress=window.VintageBinder.getProgress();
    return {
      owned:progress.owned,
      wish:progress.wish,
      wishOrder:progress.wishOrder,
      binderOrder:progress.binderOrder
    };
  });
  assert.deepEqual(normalized.wishOrder,['base2-3'],'Wishlist normalization broke');
  assert.deepEqual(normalized.binderOrder,['base2-3','base1-1','base1-2'],
    'Binder deduplication or append behavior changed');
  assert.equal(!!normalized.wish['base1-1'],false,'Owned and wishlist overlap');
  if(version==='updated'&&updated.includes('js/collection-ordering.js')){
    assert.ok(fetched.some(e=>e.file==='collection-ordering.js'&&e.status===200),
      'Collection ordering script failed to load');
  }
  // Intentional binder UI change: the placement form is collapsed until requested,
  // both viewing controls remain on a single row, and card actions open the panel.
  if (version === 'updated') {
    const binderUi = await page.evaluate(() => {
      const panel = document.querySelector('.binder-place');
      const summary = panel.querySelector('summary');
      const search = document.querySelector('#binderFind');
      const wish = document.querySelector('.binder-controls .switch-line').getBoundingClientRect();
      const reader = document.querySelector('#openReader').getBoundingClientRect();
      const openedFromDetailsEarlier = panel.open;
      panel.open = false;
      const collapsedBeforeToggle = !panel.open && search.getClientRects().length === 0;
      const sameRow = Math.abs((wish.top + wish.height / 2) - (reader.top + reader.height / 2)) < 4;
      const title = summary.textContent.trim();
      const resetRemoved = !document.querySelector('#binderResetOrder');
      summary.click();
      const expanded = panel.open && search.getClientRects().length > 0;
      summary.click();
      const collapsedAgain = !panel.open && search.getClientRects().length === 0;
      window.VintageCloud = {canEdit:()=>true,onChange:()=>{}};
      const moveButton = document.querySelector('[data-binder-move]');
      moveButton.click();
      const openedFromCard = panel.open && search.getClientRects().length > 0 &&
        !document.querySelector('#binderPlaceSelected').disabled;
      window.VintageCloud = {canEdit:()=>false,onChange:()=>{}};
      const bookGap = document.querySelector('#binderBook').getBoundingClientRect().top - panel.getBoundingClientRect().bottom;
      return {openedFromDetailsEarlier,collapsedBeforeToggle,sameRow,title,resetRemoved,expanded,collapsedAgain,openedFromCard,bookGap};
    });
    assert.equal(binderUi.openedFromDetailsEarlier, true, 'Card details move must expand placement');
    assert.equal(binderUi.collapsedBeforeToggle, true, 'Placement does not collapse');
    assert.equal(binderUi.sameRow, true, 'Binder viewing controls must stay on one row');
    assert.equal(binderUi.title, '📖 העברת קלף למיקום בבינדר');
    assert.equal(binderUi.resetRemoved, true, 'Unused binder sort button is still present');
    assert.equal(binderUi.expanded, true, 'Placement details do not expand');
    assert.equal(binderUi.collapsedAgain, true, 'Placement details do not collapse');
    assert.equal(binderUi.openedFromCard, true, 'Move action must open the placement panel');
    assert.ok(binderUi.bookGap < 50, 'Unexpected blank area before binder book');
  }
  // Shipment controller: ownership rendering and edit form must remain identical.
  const shipmentState = await page.evaluate(() => {
    window.VintageBinder.adoptProgress({shipments: [
      {id:'shipment_demo_01', number:'RR123456789IL', title:'בדיקת משלוח',
       cardIds:['base1-1','base2-3'], seenEventIds:[], initialized:true, carrier:0},
      {id:'shipment_demo_02', number:'LX998877665US', title:'משלוח נוסף',
       cardIds:[], seenEventIds:[], initialized:true, carrier:0}
    ]});
    document.querySelector('[data-view-btn="shipments"]').click();
    const before = {
      shipments: document.querySelectorAll('.shipment-entry').length,
      list: document.querySelector('#shipmentList').innerHTML,
      unread: document.querySelector('#shipmentUnreadTab').textContent,
      badgeHidden: document.querySelector('#shipmentUnreadTab').hidden,
      items: window.VintageBinder.getProgress().shipments.map(x=>({id:x.id,number:x.number,cardIds:x.cardIds}))
    };
    // Stub ONLY the edit authorization; no real account or network calls.
    window.VintageCloud = {canEdit:()=>true, onChange:()=>{}};
    document.querySelector('[data-ship-edit="shipment_demo_01"]').click();
    const editor = {
      open: document.querySelector('#shipmentDialog').open,
      number: document.querySelector('#shipmentNumber').value,
      name: document.querySelector('#shipmentName').value,
      selected: document.querySelector('#shipmentSelected').textContent.trim()
    };
    document.querySelector('#shipmentName').value = 'שם מעודכן';
    document.querySelector('#shipmentForm').requestSubmit();
    return {
      before, editor,
      afterName: window.VintageBinder.getProgress().shipments.find(x=>x.id==='shipment_demo_01')?.title,
      afterEntries: document.querySelectorAll('.shipment-entry').length
    };
  });
  if (version === 'updated' && updated.includes('js/shipments.js')) {
    assert.ok(fetched.some(item => item.file === 'shipments.js' && item.status === 200),
      'Shipment controller did not load');
  }
  // A separately loaded catalog metadata file must initialize before binder.js.
  if (version === 'updated' && updated.includes('js/catalog-data.js')) {
    assert.ok(fetched.some(item => item.file === 'catalog-data.js' && item.status === 200),
      'Catalog data script did not load successfully');
    const dataReady = await page.evaluate(() => window.VintageCatalogData?.SETS?.length >= 14
      && Object.keys(window.VintageCatalogData.OFFLINE_PACKS || {}).length >= 14);
    assert.ok(dataReady, 'Catalog metadata missing at runtime');
  }
  if (version === 'updated' && updated.includes('js/collection-views.js')) {
    assert.ok(fetched.some(item=>item.file==='collection-views.js' && item.status===200),
      'Collection views renderer did not load');
  }
  // Explicitly verify the refactored browser can fetch and parse all four extracted scripts.
  if (version === 'updated') {
    for (const file of paths) {
      assert.ok(fetched.some(item => item.file === file.split('/').at(-1) && item.status === 200),
        'Script did not load with 200: '+file);
    }
  }
  // Wishlist price sorting is presentation-only. Keep Firestore order intact and
  // completely remove drag affordances outside custom priority mode.
  if(version==='updated'){
    const wishSortState=await page.evaluate(()=>{
      window.VintageCloud={canEdit:()=>true,onChange:()=>{}};
      window.VintageBinder.adoptProgress({
        owned:{},
        wish:{'base1-1':true,'base2-3':true,'base2-4':true},
        wishOrder:['base1-1','base2-3','base2-4'],
        conditions:{'base1-1':'NM','base2-3':'LP'}
      });
      window.VintageMarketPrices.getOwnedPrice=c=>({'base1-1':130,'base2-3':25})[c.id]??null;
      document.querySelector('[data-view-btn="wishlist"]').click();
      const find=document.querySelector('#wishFind');
      find.value='';find.dispatchEvent(new Event('input',{bubbles:true}));
      const sorter=document.querySelector('#wishSort'),list=document.querySelector('#wishlistItems');
      const rows=()=>[...list.querySelectorAll('.wish-item')].map(el=>({
        id:el.dataset.openWish,rank:Number(el.querySelector('.wish-rank').textContent),
        drag:el.hasAttribute('data-drag-kind'),
        kind:el.hasAttribute('data-order-kind'),
        imageDrag:el.querySelector('img').hasAttribute('data-drag-kind'),
        moveDisabled:el.querySelector('.wish-move-action').disabled
      }));
      const initial=rows();
      const set=value=>{sorter.value=value;sorter.dispatchEvent(new Event('change',{bubbles:true}));};
      const computed=getComputedStyle(find),alignment={direction:computed.direction,textAlign:computed.textAlign};
      set('price-asc');const ascending=rows(),ascendingMode=list.dataset.sortMode;
      document.querySelector('.wish-move-action').click();
      const immutable=window.VintageBinder.getProgress().wishOrder;
      set('price-desc');const descending=rows();
      find.value='1/102';find.dispatchEvent(new Event('input',{bubbles:true}));
      const filtered=rows();find.value='';find.dispatchEvent(new Event('input',{bubbles:true}));
      set('priority');const restored=rows();
      window.VintageCloud={canEdit:()=>false,onChange:()=>{}};
      return {initial,ascending,ascendingMode,descending,filtered,immutable,restored,alignment};
    });
    const ids=arr=>arr.map(row=>row.id);
    assert.deepEqual(ids(wishSortState.initial),['base1-1','base2-3','base2-4']);
    assert.equal(wishSortState.alignment.direction,'rtl','Wishlist search must use RTL text direction');
    assert.equal(wishSortState.alignment.textAlign,'right','Wishlist search placeholder not right-aligned');
    assert.deepEqual(ids(wishSortState.ascending),['base2-3','base1-1','base2-4']);
    assert.deepEqual(ids(wishSortState.descending),['base1-1','base2-3','base2-4']);
    assert.equal(wishSortState.ascendingMode,'price-asc','Sort mode not propagated');
    assert.ok(wishSortState.ascending.every(x=>!x.drag&&!x.kind&&!x.imageDrag&&x.moveDisabled),
      'Reordering must be disabled while sorting by price');
    assert.deepEqual(ids(wishSortState.filtered),['base1-1'],'Search+sort regression');
    assert.deepEqual(wishSortState.immutable,['base1-1','base2-3','base2-4'],
      'Price sort changed saved wishlist priority');
    assert.deepEqual(ids(wishSortState.restored),['base1-1','base2-3','base2-4']);
    assert.ok(wishSortState.restored.every(x=>x.drag&&x.kind&&x.imageDrag&&!x.moveDisabled),
      'Priority sort must restore drag and move interactions');
  }
  await context.close();
  return {initial,catalogSamples,states,filtered,catalogState,cardActionState,detailState,ownedState,collectionState,dragState,normalized,shipmentState,errors};
}
try {
  for (const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    const a = await exercise('original', viewport);
    const b = await exercise('updated', viewport);
    assert.deepEqual(b.initial, a.initial, 'Bootstrap output changed at '+viewport.width);
    assert.deepEqual(b.catalogSamples, a.catalogSamples, 'Generated vintage card metadata changed at '+viewport.width);
    assert.deepEqual(b.states, a.states, 'Navigation changed at '+viewport.width);
    assert.deepEqual(b.filtered, a.filtered, 'Catalog search changed at '+viewport.width);
    assert.deepEqual(b.catalogState, a.catalogState, 'Catalog filters, group navigation or sorting changed at '+viewport.width);
    assert.deepEqual(b.cardActionState, a.cardActionState, 'Owned/Wishlist actions changed at '+viewport.width);
    assert.deepEqual(b.detailState, a.detailState, 'Card details conditions or modal controls changed at '+viewport.width);
    assert.deepEqual(b.ownedState, a.ownedState, 'Owned cards sort/filter/value changed at '+viewport.width);
    assert.deepEqual(b.collectionState, a.collectionState, 'Binder/Wishlist interaction changed at '+viewport.width);
    assert.deepEqual(b.dragState, a.dragState, 'Pointer/touch drag behavior differs at '+viewport.width);
    assert.deepEqual(b.normalized, a.normalized, 'Order normalization changed at '+viewport.width);
    assert.deepEqual(b.shipmentState, a.shipmentState, 'Shipment UI/editor state changed at '+viewport.width);
    assert.equal(b.shipmentState.editor.open, true, 'Shipment edit dialog did not open');
    assert.equal(b.shipmentState.afterName, 'שם מעודכן', 'Shipment edit did not persist');
    assert.deepEqual(b.errors, a.errors, 'Unexpected browser error difference at '+viewport.width);
    console.log('PASS JS browser parity:', viewport.width, 'px, cards', b.initial.cards);
  }
} finally {
  await browser.close();
  await new Promise(resolve => app.close(resolve));
}
