import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const window={};
vm.runInNewContext(readFileSync('js/collection-analytics.js','utf8'),{window,Date,Math,Number,Map,Object,Array,String,RegExp,JSON,setTimeout,clearTimeout});
const {summarize,createSnapshot,normalizeSnapshots}=window.VintageCollectionAnalytics;
const cards=[{id:'base1-1',name:'Alakazam',set:'base1'},{id:'fossil-5',name:'Gengar',set:'fossil'},{id:'jungle-11',name:'Snorlax',set:'jungle'}];
const prices={'base1-1':35,'fossil-5':80,'jungle-11':55};
function sample(){
 return summarize({cards,owned:{'base1-1':true,'fossil-5':true},pendingPurchase:{'jungle-11':true},
 purchasePrices:{'fossil-5':{amount:60,currency:'USD'},'jungle-11':{amount:40,currency:'USD'}},
 conditions:{'base1-1':'LP','fossil-5':'MP','jungle-11':'LP'},firstEdition:{},
 priceFor:c=>prices[c.id],toUSD:(n,c)=>c==='USD'?n:null});
}
test('purchase totals include pending cards, but childhood cards do not add zero-cost profit',()=>{
 const s=sample();
 assert.equal(s.ownedCount,2);assert.equal(s.pendingCount,1);assert.equal(s.purchasedCount,2);
 assert.equal(s.totalValue,170);assert.equal(s.paidCost,100);
 assert.equal(s.purchasedValue,135);
 assert.equal(s.matchedCost,100);assert.equal(s.matchedValue,135);
 assert.equal(s.pricedCount,3);
});
test('historical market-only return excludes new purchases, retaining previous value at entry',()=>{
 const before=sample(),day1=createSnapshot(before,'2026-11-16',null);
 const after={...before,prices:{...before.prices,'base1-1|LP|0':42,'fossil-5|MP|0':88,'jungle-11|LP|0':55,'rocket-3|NM|0':1000}};
 const day2=createSnapshot(after,'2026-11-17',day1);
 assert.equal(day1.index,100);
 // Existing holdings: 42+88+55, prior: 35+80+55; new 1000 excluded
 assert.equal(day2.index,108.82);
 assert.equal(day2.prices['rocket-3|NM|0'],1000);
});
test('incomplete market quotes are not treated as cash values',()=>{
 const s=summarize({cards,owned:{'base1-1':true},pendingPurchase:{},
 purchasePrices:{'base1-1':{amount:30,currency:'GBP'}},
 conditions:{'base1-1':'LP'},firstEdition:{},
 priceFor:()=>undefined,toUSD:()=>null});
 assert.equal(s.missingPaidFx,1);assert.equal(s.pendingPrices,1);
 assert.equal(s.totalValue,0);assert.equal(s.pricedCount,0);
});
test('snapshots keep only two latest price maps, with older aggregates intact',()=>{
 const rows=normalizeSnapshots([
  {date:'2026-11-15',index:100,totalValue:100,prices:{a:1}},
  {date:'2026-11-16',index:103,totalValue:103,prices:{a:2}},
  {date:'2026-11-17',index:105,totalValue:105,prices:{a:3}},
 ]);
 assert.equal(rows.length,3);
 assert.equal(rows[0].prices,undefined);
 assert.equal(rows[1].prices.a,2);assert.equal(rows[2].prices.a,3);
});
