import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const allowed='https://xfayne.github.io';
const env={ALLOWED_ORIGIN:allowed,EBAY_CLIENT_ID:'test-id',EBAY_CLIENT_SECRET:'test-secret',EBAY_DELIVERY_POSTAL_CODE:'1234567'};
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
  assert.equal(searches.length,6);
  for(const call of searches){
   assert.match(call.target,/deliveryCountry%3AIL/);
   assert.match(call.target,/deliveryPostalCode%3A1234567/);
   assert.equal(call.options.headers['X-EBAY-C-ENDUSERCTX'],'contextualLocation=country%3DIL%2Czip%3D1234567');
   assert.match(call.target,/AUCTION|FIXED_PRICE/);
   assert.match(call.options.headers.authorization,/mock-bearer/);
  }
 }finally{globalThis.fetch=original}
});

test('request postal code overrides configured postal without leaking credentials',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options={})=>{
  calls.push({url:String(url),headers:options.headers});
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test',expires_in:3600});
  return Response.json({itemSummaries:[]});
 };
 try{
  const req=new Request('https://worker.example/api/search',{
   method:'POST',headers:{origin:allowed,'content-type':'application/json'},
   body:JSON.stringify({cards:[espeon],postalCode:'7654321'})
  });
  const response=await worker.fetch(req,env);
  assert.equal(response.status,200);
  const searches=calls.filter(x=>x.url.includes('/item_summary/search'));
  assert.equal(searches.length,6);
  searches.forEach(call=>{
   assert.match(call.url,/deliveryPostalCode%3A7654321/);
   assert.equal(call.headers['X-EBAY-C-ENDUSERCTX'],'contextualLocation=country%3DIL%2Czip%3D7654321');
  });
  const invalid=new Request('https://worker.example/api/search',{
   method:'POST',headers:{origin:allowed,'content-type':'application/json'},
   body:JSON.stringify({cards:[espeon],postalCode:'not-a-postal-code'})
  });
  assert.equal((await worker.fetch(invalid,env)).status,400);
 }finally{globalThis.fetch=original}
});

test('blocks explicit first-edition mismatches, replicas and graded cards but includes fixed-price listings',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('oauth2/token'))return Response.json({access_token:'token-x',expires_in:3600});
  return Response.json({itemSummaries:[
    item({itemId:'1',title:'1st Edition Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'2',title:'Replica Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'3',title:'PSA 9 Espeon 1/75 Neo Discovery Pokemon'}),
    item({itemId:'4',buyingOptions:['FIXED_PRICE'],price:{value:'50',currency:'EUR'}}),
    item({itemId:'5',shippingOptions:[]})
  ]});
 };
 try{
  const data=await (await worker.fetch(request([espeon]),env)).json();
  assert.equal(data.items.length,2); // one Buy It Now and one auction with unknown shipping
  assert.ok(data.items.some(x=>x.format==='FIXED_PRICE'));
  assert.equal(data.items.find(x=>x.itemId==='5').shipping,null); // unknown not 0
 }finally{globalThis.fetch=original}
});

test('seller grade and listing format are returned; mismatched card number is excluded',async()=>{
 const orig=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test',expires_in:3600});
  return Response.json({itemSummaries:[
   item({itemId:'fixed001',title:'Espeon 1/75 Neo Discovery Near Mint',buyingOptions:['FIXED_PRICE','BEST_OFFER'],price:{value:'52',currency:'EUR'},condition:'Ungraded',currentBidPrice:null}),
   item({itemId:'wrong001',title:'Espeon 12/75 Neo Discovery Near Mint'})
  ]});
 };
 try{
  const data=await (await worker.fetch(request([espeon]),env)).json();
  assert.equal(data.items.length,1);
  assert.equal(data.items[0].itemId,'fixed001');
  assert.equal(data.items[0].format,'FIXED_PRICE');
  assert.equal(data.items[0].bestOffer,true);
  assert.equal(data.items[0].conditionGrade,'NM');
  assert.equal(data.items[0].conditionSource,'title');
 }finally{globalThis.fetch=orig}
});

test('reads seller-declared card condition on request through eBay item detail',async()=>{
 const orig=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test',expires_in:3600});
  return Response.json({condition:'Ungraded',conditionDescriptors:[{name:'Card Condition',values:[{content:'Lightly played'}]}]});
 };
 try{
  const response=await worker.fetch(new Request('https://worker.example/api/item-condition',{
   method:'POST',headers:{origin:allowed,'content-type':'application/json'},
   body:JSON.stringify({itemId:'v1|123|0',marketplace:'EBAY_GB'})
  }),env);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.grade,'LP');
  assert.equal(data.source,'seller');
 }finally{globalThis.fetch=orig}
});
