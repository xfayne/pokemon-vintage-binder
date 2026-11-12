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


test('rejects foreign, digital, poster, wrong-number and card-choice keyword spam',async()=>{
 const original=globalThis.fetch;
 const jolteon={id:'base2-4',name:'Jolteon',setName:'Jungle',number:'4/64',firstEdition:false,finish:'holo'};
 const variants=[
  ['chinese','JOLTEON 0301/14 GEM PACK 2 CBB2C ENERGY HOLO CHINESE POKEMON CARD NM'],
  ['digital','pokemon pocket mobile game card genetic apex pikachu set jolteon Rare Trade DIGITAL CARD'],
  ['poster','Pokemon Jolteon Jungle 4/64 Vintage Poster Print'],
  ['keyring','Vintage Jolteon Jungle 4/64 Pokemon Keyring'],
  ['keychain','Jolteon Jungle 4/64 Pokemon Key Chain Collectible'],
  ['keyrings','Jolteon Jungle 4/64 Pokemon Keyrings'],
  ['germankeyring','Jolteon Jungle 4/64 Pokemon Schlüsselanhänger'],
  ['artcase','Jolteon Jungle 4/64 Vintage Art Case'],
  ['artcasejoined','Jolteon Jungle 4/64 Pokemon Artcase'],
  ['artcasehyphen','Jolteon Jungle 4/64 Pokemon ART-CASE'],
  ['artcaseplural','Jolteon Jungle 4/64 Pokemon art cases'],
  ['wrongNumber','Jolteon 20/64 Jungle Rare Non Holo'],
  ['choose','Choose your card Jolteon Jungle 4/64 Eevee Vaporeon'],
  ['strong','Jolteon 4/64 Jungle 1999 Rare Holo English'],
  ['needsReview','Jolteon Jungle 1999 original Pokemon card']
 ];
 globalThis.fetch=async url=>{
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test-x',expires_in:3600});
  return Response.json({itemSummaries:variants.map(([id,title])=>item({itemId:id,title}))});
 };
 try{
  const response=await worker.fetch(request([jolteon]),env);
  const data=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(new Set(data.items.map(x=>x.itemId)),new Set(['strong','needsReview']));
  assert.equal(data.items.find(x=>x.itemId==='strong').verificationStatus,'strong');
  assert.equal(data.items.find(x=>x.itemId==='needsReview').verificationStatus,'review');
  assert.ok(data.items.find(x=>x.itemId==='needsReview').verificationReasons.some(x=>x.includes('מספר הקלף')));
 }finally{globalThis.fetch=original}
});

test('mentions of a different Pokemon keep listings in review rather than implying a Lugia bargain',async()=>{
 const original=globalThis.fetch;
 const lugia={id:'neo1-9',name:'Lugia',setName:'Neo Genesis',number:'9/111',firstEdition:false,finish:'holo'};
 globalThis.fetch=async url=>{
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test-x',expires_in:3600});
  return Response.json({itemSummaries:[
   item({itemId:'keywordspam',title:'1st ed unli /111 LUGIA FERALIGATOR NEO GENESIS SET HOLO RARE NR MT POKEMON CARDS'}),
   item({itemId:'valid',title:'2000 Lugia 9/111 Neo Genesis Holo Rare English'})
  ]});
 };
 try{
  const data=await (await worker.fetch(request([lugia]),env)).json();
  assert.equal(data.items.find(x=>x.itemId==='keywordspam').verificationStatus,'review');
  assert.ok(data.items.find(x=>x.itemId==='keywordspam').verificationReasons.some(x=>x.includes('קלפים נוספים')));
  assert.equal(data.items.find(x=>x.itemId==='valid').verificationStatus,'strong');
 }finally{globalThis.fetch=original}
});

test('item details upgrade a review listing only with corroborating structured fields',async()=>{
 const original=globalThis.fetch;
 let aspects=[
  {name:'Card Number',value:'4/64'},
  {name:'Set',value:'Jungle'},
  {name:'Language',value:'English'}
 ];
 globalThis.fetch=async url=>{
  if(String(url).includes('/oauth2/token'))return Response.json({access_token:'test-x',expires_in:3600});
  return Response.json({title:'Jolteon Jungle Vintage Holo',condition:'Ungraded',localizedAspects:aspects});
 };
 try{
  const card={id:'base2-4',name:'Jolteon',setName:'Jungle',number:'4/64',firstEdition:false,finish:'holo'};
  async function inspect(){return (await worker.fetch(new Request('https://worker.example/api/item-condition',{
   method:'POST',headers:{origin:allowed,'content-type':'application/json'},
   body:JSON.stringify({itemId:'v1|123|0',marketplace:'EBAY_GB',card})
  }),env)).json();}
  assert.equal((await inspect()).verificationStatus,'strong');
  aspects=[{name:'Card Number',value:'20/64'},{name:'Set',value:'Jungle'}];
  assert.equal((await inspect()).verificationStatus,'rejected');
  aspects=[{name:'Language',value:'Chinese'}];
  assert.equal((await inspect()).verificationStatus,'rejected');
  aspects=[];
  assert.equal((await inspect()).verificationStatus,'review');
 }finally{globalThis.fetch=original}
});

test('gallery photos are fetched on demand from Browse item detail and validated',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async (url,options={})=>{
  const target=String(url);calls.push({target,headers:options.headers});
  if(target.includes('/oauth2/token'))return Response.json({access_token:'test-gallery',expires_in:3600});
  if(target.includes('/buy/browse/v1/item/')){
   return Response.json({
    image:{imageUrl:'https://i.ebayimg.com/images/g/abc/s-l1600.jpg'},
    additionalImages:[
     {imageUrl:'https://i.ebayimg.com/images/g/def/s-l1600.jpg'},
     {imageUrl:'https://i.ebayimg.com/images/g/abc/s-l1600.jpg'},
     {imageUrl:'javascript:alert(1)'},
     {imageUrl:'http://not-secure.example/img.jpg'},
     {imageUrl:null}
    ]
   });
  }
  throw Error('Unexpected eBay request '+target);
 };
 try{
  const response=await worker.fetch(new Request('https://worker.example/api/item-images',{
   method:'POST',headers:{origin:allowed,'content-type':'application/json'},
   body:JSON.stringify({itemId:'v1|123|0',marketplace:'EBAY_GB'})
  }),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).images,[
   'https://i.ebayimg.com/images/g/abc/s-l1600.jpg',
   'https://i.ebayimg.com/images/g/def/s-l1600.jpg'
  ]);
  const getItemCalls=calls.filter(x=>x.target.includes('/buy/browse/v1/item/'));
  assert.equal(getItemCalls.length,1);
  assert.equal(getItemCalls[0].headers['X-EBAY-C-MARKETPLACE-ID'],'EBAY_GB');
  assert.match(getItemCalls[0].headers.authorization,/^Bearer .+$/);
 }finally{globalThis.fetch=original}
});

test('item-images rejects invalid IDs, unsupported marketplaces and unauthorized origins',async()=>{
 const make=(itemId,marketplace,origin=allowed)=>worker.fetch(new Request('https://worker.example/api/item-images',{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({itemId,marketplace})
 }),env);
 assert.equal((await make('arbitrary url','EBAY_GB')).status,400);
 assert.equal((await make('v1|123|0','EBAY_JP')).status,400);
 assert.equal((await make('v1|123|0','EBAY_GB','https://untrusted.example')).status,403);
});

// Include standalone source adapter cases in the required worker test command.
await import('./standalone-condition.test.mjs');
