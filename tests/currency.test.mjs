import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../js/currency.js',import.meta.url),'utf8');
const rates=[
 {base:'USD',quote:'EUR',rate:0.9,date:'2026-11-12'},
 {base:'USD',quote:'ILS',rate:3.5,date:'2026-11-12'},
 {base:'USD',quote:'GBP',rate:0.8,date:'2026-11-12'}
];
function app(saved,reply=rates){
 const storage=new Map(saved?[['pokemon-vintage-display-currency',saved]]:[]);
 const events=[];
 const window={addEventListener(){},dispatchEvent(event){events.push(event.type);}};
 const document={querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}};
 const fetch=async()=>reply===null?{ok:false,status:503}:{ok:true,json:async()=>reply};
 runInNewContext(source,{window,document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch,Event:class{constructor(type){this.type=type;}},console:{warn(){}}});
 return {fx:window.VintageCurrency,storage,events};
}
test('default ILS and consistent conversion of a EUR bid, GBP shipping and USD market price',async()=>{
 const {fx}=app();
 await fx.ready;
 assert.equal(fx.getCurrency(),'ILS');
 assert.ok(Math.abs(fx.convert(42.51,'EUR')-(42.51/0.9*3.5))<1e-9);
 assert.ok(Math.abs(fx.convert(7.49,'GBP')-(7.49/0.8*3.5))<1e-9);
 assert.ok(Math.abs(fx.convert(69.12,'USD')-69.12*3.5)<1e-9);
 assert.ok(fx.format(42.51,'EUR').includes('165'));
 assert.equal(fx.getFxDate(),'2026-11-12');
 assert.match(fx.getRateStatus(),/Frankfurter/);
});
test('currency changes preserve USD scoring, notify UI and persist device setting',async()=>{
 const {fx,storage,events}=app('USD');
 await fx.ready;
 assert.equal(fx.getCurrency(),'USD');
 assert.ok(Math.abs(fx.toUSD(42.51,'EUR')-42.51/0.9)<1e-9);
 assert.equal(fx.convert(42.51,'EUR'),fx.toUSD(42.51,'EUR'));
 assert.equal(fx.setCurrency('EUR'),true);
 assert.equal(fx.getCurrency(),'EUR');
 assert.equal(storage.get('pokemon-vintage-display-currency'),'EUR');
 assert.ok(fx.format(10,'USD').includes('€'));
 assert.equal(fx.setCurrency('GBP'),false);
 assert.equal(fx.getCurrency(),'EUR');
 assert.ok(events.length>=2);
});
test('unavailable or unrecognized FX never displays mixed or invented currencies',async()=>{
 const {fx}=app('ILS',null);
 await fx.ready;
 assert.equal(fx.getFxDate(),null);
 assert.equal(fx.format(100,'USD'),'—');
 assert.equal(fx.format(100,'CAD'),'—');
 assert.match(fx.getRateStatus(),/לא זמינים/);
 fx.setCurrency('USD');
 assert.ok(fx.format(100,'USD').includes('$'));
 assert.equal(fx.format(100,'EUR'),'—');
});
test('invalid source and bad rate payload cannot produce fabricated amounts',async()=>{
 const {fx}=app('EUR',[{base:'USD',quote:'EUR',rate:0,date:'2026-11-12'}]);
 await fx.ready;
 assert.equal(fx.format(10,'USD'),'—');
 assert.equal(fx.toUSD(-5,'USD'),null);
 assert.equal(fx.toUSD(null,'USD'),null);
});
