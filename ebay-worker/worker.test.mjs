import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const allowed='https://xfayne.github.io';
const env={ALLOWED_ORIGIN:allowed,EBAY_CLIENT_ID:'test-id',EBAY_CLIENT_SECRET:'test-secret'};
const request=(cards,origin=allowed)=>new Request('https://worker.example/api/search',{
 method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({cards})
});
const espeon={id:'neo2-1',name:'Espeon',setName:'Neo Discovery',number:'1/75',firstEdition:false};
const item=(changes={})=>({
 itemId:'v1|123|0',title:'2001 Pokemon Espeon 1/75 Neo Discovery Holo',
 itemWebUrl:'https://www.ebay.com/itm/123',
 image:{imageUrl:'https://i.ebayimg.com/test.jpg'},
 currentBidPrice:{value:'50',currency:'EUR'},
 shippingOptions:[{shippingCost:{value:'5.50',currency:'EUR'}}],
 seller:{username:'seller123',feedbackPercentage:'98.6'},bidCount:2,
 itemEndDate:'2026-11-18T20:00:00Z',buyingOptions:['AUCTION'],
 ...changes
});

test('health reports unconfigured credentials without exposing values',async()=>{
 const response=await worker.fetch(new Request('https://worker.example/health',{headers:{origin:allowed}}),{ALLOWED_ORIGIN:allowed});
 assert.equal(response.status,200);
 const value=await response.json();
 assert.equal(value.ready,false);
 assert.equal(JSON.stringify(value).includes('test-secret'),false);
});

test('refuses disallowed origins and invalid batch sizes',async()=>{
 const refused=await worker.fetch(request([espeon],'https://example.org'),env);
 assert.equal(refused.status,403);
 const tooMany=await worker.fetch(request(Array.from({length:5},()=>espeon)),env);
 assert.equal(tooMany.status,400);
});

test('fetches and deduplicates real-format eBay AUCTION items, including shipping to Israel',async()=>{
 const original=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url,options={})=>{
  const target=String(url);calls.push({target,options});
  if(target.includes('/oauth2/token'))return Response.json({access_token:'mock-bearer',expires_in:3600});
  if(target.includes('/item_summary/search'))return Response.json({itemSummaries:[item()]});
  throw new Error('Unexpected network request: '+target);
 };
 try{
  const response=await worker.fetch(request([espeon]),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.items.length,1); // identical listing was returned by US and DE
  assert.equal(data.items[0].currentBid.value,50);
  assert.equal(data.items[0].shipping.value,5.5);
  assert.equal(data.items[0].bidCount,2);
  assert.equal(data.items[0].matchConfidence,91);
  assert.equal(data.items[0].sellerFeedback,98.6);
  assert.equal(data.errors.length,0);
  const searches=calls.filter(x=>x.target.includes('/item_summary/search'));
  assert.equal(searches.length,2);
  for(const call of searches){
   assert.match(call.target,/deliveryCountry%3AIL/);
   assert.match(call.target,/AUCTION/);
   assert.match(call.options.headers.authorization,/mock-bearer/);
  }
 }finally{globalThis.fetch=original}
});

test('blocks explicit first-edition mismatches, replicas, graded cards and excludes fixed-price listings',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('oauth2/token'))return Response.json({access_token:'token-x',expires_in:3600});
  return Response.json({itemSummaries:[
    item({itemId:'1',title:'1st Edition Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'2',title:'Replica Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'3',title:'PSA 9 Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'4',buyingOptions:['FIXED_PRICE']}),
    item({itemId:'5',shippingOptions:[]})
  ]});
 };
 try{
  const data=await (await worker.fetch(request([espeon]),env)).json();
  assert.equal(data.items.length,1);
  assert.equal(data.items[0].shipping,null); // unknown not 0
 }finally{globalThis.fetch=original}
});
