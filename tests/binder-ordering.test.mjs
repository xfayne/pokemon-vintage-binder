import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

// Pure ordering tests: no live user data, Firestore, network or DOM required.
const browser={window:{}};
vm.runInNewContext(readFileSync('js/collection-ordering.js','utf8'),browser,{filename:'collection-ordering.js'});
const ordering=browser.window.VintageCollectionOrdering;

function fixture(n,{canEdit=true}={}){
 const ids=Array.from({length:n},(_,i)=>'base1-'+(i+1));
 const state={
  cards:ids.map(id=>({id})),owned:Object.fromEntries(ids.map(id=>[id,true])),
  wish:{},removedWish:{},ownedAddedAt:{},binderExcluded:{},wishOrder:[],
  binderOrder:[...ids],binderPage:0
 };
 let writes=0;
 const controller=ordering.create({state,ensureCloudEdit:()=>canEdit,save:()=>{writes++;}});
 const flat=()=>JSON.parse(JSON.stringify(state.binderOrder));
 const cards=()=>flat().filter(id=>!ordering.isEmptyPocket(id));
 return {state,ids,controller,flat,cards,writes:()=>writes};
}

test('move a full page 18 to position 3 without altering any pocket order',()=>{
 const f=fixture(18*9);
 assert.equal(f.controller.movePage(18,3),true);
 assert.deepEqual(f.flat().slice(18,27),f.ids.slice(17*9));
 assert.deepEqual(f.flat().slice(27,36),f.ids.slice(2*9,3*9));
 assert.deepEqual(f.cards().sort(),[...f.ids].sort());
 assert.equal(f.state.binderPage,2);
 assert.equal(f.writes(),1);
});

test('a partial final page moved earlier keeps the seven trailing pockets empty',()=>{
 const f=fixture(17*9+2);
 assert.equal(f.controller.movePage(18,3),true);
 assert.deepEqual(f.flat().slice(18,20),f.ids.slice(17*9));
 assert.equal(f.flat().slice(20,27).every(ordering.isEmptyPocket),true);
 assert.deepEqual(f.flat().slice(27,36),f.ids.slice(18,27));
 assert.deepEqual(f.cards().sort(),[...f.ids].sort());
 assert.equal(f.controller.binderPageCount(),18);
});

test('moving an early page after a partial page pads the partial page instead of merging cards',()=>{
 const f=fixture(17*9+2);
 assert.equal(f.controller.movePage(3,18),true);
 assert.deepEqual(f.flat().slice(16*9,16*9+2),f.ids.slice(17*9));
 assert.equal(f.flat().slice(16*9+2,17*9).every(ordering.isEmptyPocket),true);
 assert.deepEqual(f.flat().slice(17*9,18*9),f.ids.slice(18,27));
 assert.deepEqual(f.cards().sort(),[...f.ids].sort());
 assert.equal(f.controller.binderPageCount(),18);
});

test('reserve a pocket, fill it by moving a card, and remove the gap',()=>{
 const f=fixture(11);
 assert.equal(f.controller.markEmptyPocket(2),true);
 assert.ok(ordering.isEmptyPocket(f.flat()[2]));
 assert.equal(f.flat()[3],f.ids[2]);
 assert.equal(f.cards().length,11);
 assert.equal(f.controller.reorder('binder',8,2),true);
 assert.equal(f.flat()[2],f.ids[7]);
 assert.ok(ordering.isEmptyPocket(f.flat()[8]));
 assert.equal(f.controller.clearEmptyPocket(8),true);
 assert.equal(f.flat().length,11);
 assert.deepEqual(f.cards().sort(),[...f.ids].sort());
 assert.equal(f.writes(),3);
});

test('reserve an implicit hole near the end of a partial page and keep it on normalization',()=>{
 const f=fixture(2);
 assert.equal(f.controller.markEmptyPocket(8),true);
 assert.equal(f.flat().slice(2).length,7);
 assert.equal(f.flat().slice(2).every(ordering.isEmptyPocket),true);
 f.state.cards.push({id:'base2-3'});f.state.owned['base2-3']=true;
 f.controller.normalizeOrders();
 assert.equal(f.flat()[9],'base2-3');
 assert.equal(f.controller.binderPageCount(),2);
 assert.equal(f.flat().slice(2,9).every(ordering.isEmptyPocket),true);
});

test('no-op or disallowed operations never change collection or write to cloud',()=>{
 const f=fixture(10);
 const before=f.flat();
 assert.equal(f.controller.movePage(1,1),false);
 assert.equal(f.controller.movePage(0,2),false);
 assert.equal(f.controller.movePage(1,9),false);
 assert.equal(f.controller.clearEmptyPocket(3),false);
 assert.equal(f.controller.markEmptyPocket(-1),false);
 assert.deepEqual(f.flat(),before);
 assert.equal(f.writes(),0);
 const locked=fixture(10,{canEdit:false});
 assert.equal(locked.controller.movePage(1,2),false);
 assert.equal(locked.controller.markEmptyPocket(1),false);
 assert.equal(locked.controller.reorder('binder',0,1),false);
 assert.deepEqual(locked.flat(),locked.ids);
 assert.equal(locked.writes(),0);
});
