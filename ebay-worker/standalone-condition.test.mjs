import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';
import {resolveEbayLinkApi,analyzeUploadApi} from './standalone-condition.js';

const HEADERS={origin:'https://xfayne.github.io'};
const env={ALLOWED_ORIGIN:'https://xfayne.github.io',GEMINI_API_KEY:'fixture-api-key',TRACK17_OWNER_EMAIL:'owner@example.com'};
const reply=(data,status=200)=>Response.json(data,{status});
const trusted=async()=>true;
const ebayImage=url=>{try{return new URL(url).hostname==='i.ebayimg.com'}catch{return false}};
const legacyDeps={reply,verifyFirebaseBearer:trusted,bearer:async()=> 'fixture-ebay-token',isEbayImage:ebayImage};
const uploadDeps={reply,verifyFirebaseBearer:trusted};
const valid={grade:'LP',gradePercentages:{NM:10,LP:60,MP:25,HP:4,DMG:1},
 observations:[{area:'corners',finding:'Whitening',severity:'minor',
  locations:[{photoIndex:1,box2d:[60,80,120,170]}]}],
 limitations:['Back missing'],visibleSides:['front']};
const formRequest=(files)=> {
 const data=new FormData();
 for(const file of files)data.append('photos',file,'front.jpg');
 return new Request('https://worker.example/api/analyze-upload',{method:'POST',headers:HEADERS,body:data});
};
const image=(size=400)=>{
 const bytes=new Uint8Array(size).fill(7);bytes.set([255,216,255],0);
 return new Blob([bytes],{type:'image/jpeg'});
};
test('standalone routes deny anonymous access and do not call the model',async()=>{
 for(const [path,body,headers] of [
  ['/api/resolve-ebay-link',JSON.stringify({url:'https://www.ebay.com/itm/123456789012'}),{'content-type':'application/json'}],
  ['/api/analyze-upload',new FormData(),{}]
 ]){
  const r=await worker.fetch(new Request('https://worker.example'+path,{method:'POST',
   headers:{...HEADERS,...headers},body}),env);
  assert.equal(r.status,403);
  assert.equal((await r.json()).error,'AI_AUTH_REQUIRED');
 }
});
test('eBay URL resolver rejects non-eBay and unsafe hosts before any outbound fetch',async(t)=>{
 let outbound=0;
 t.mock.method(globalThis,'fetch',async()=>{outbound++;throw Error('Unexpected fetch')});
 for(const url of ['http://www.ebay.com/itm/123456789012','https://www.ebay.com.evil.net/itm/123456789012',
   'https://127.0.0.1/itm/123456789012','https://www.ebay.com:8443/itm/123456789012']){
  const r=await resolveEbayLinkApi(new Request('https://worker.example/api/resolve-ebay-link',
   {method:'POST',body:JSON.stringify({url})}),env,{},legacyDeps);
  assert.equal(r.status,400);assert.equal((await r.json()).error,'EBAY_LINK_UNSUPPORTED');
 }
 assert.equal(outbound,0);
});
test('eBay short link safely resolves to legacy Browse ID without analysis',async(t)=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  const url=new URL(input);calls.push(url.href);
  if(url.hostname==='ebay.io')return new Response(null,{status:302,headers:{
   location:'https://www.ebay.com/itm/Charizard-Base-Set/123456789012?tracking=1'}});
  if(url.hostname==='api.ebay.com'){
   assert.match(url.href,/get_item_by_legacy_id\?legacy_item_id=123456789012/);
   assert.equal(options.headers['X-EBAY-C-MARKETPLACE-ID'],'EBAY_US');
   return Response.json({itemId:'v1|123456789012|0',title:'Charizard',
    image:{imageUrl:'https://i.ebayimg.com/front.jpg'},
    additionalImages:[{imageUrl:'https://i.ebayimg.com/back.jpg'},
     {imageUrl:'https://wrong.example/picture.jpg'}]});
  }
  assert.fail('Unexpected host '+url.hostname);
 });
 const response=await resolveEbayLinkApi(new Request('https://worker.example/api/resolve-ebay-link',{
  method:'POST',body:JSON.stringify({url:'https://ebay.io/m/eVUF2t'})}),env,{},legacyDeps);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.deepEqual(data.source,{type:'ebay-listing',marketplace:'EBAY_US',itemId:'v1|123456789012|0'});
 assert.deepEqual(data.images,['https://i.ebayimg.com/front.jpg','https://i.ebayimg.com/back.jpg']);
 assert.equal(calls.length,2,'only URL expansion and item metadata, never provider inference');
});
test('eBay short-link redirect cannot fetch an arbitrary domain',async(t)=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{
  location:'http://169.254.169.254/metadata'}})});
 const response=await resolveEbayLinkApi(new Request('https://worker.example/api/resolve-ebay-link',{
  method:'POST',body:JSON.stringify({url:'https://ebay.io/m/eVUF2t'})}),env,{},legacyDeps);
 assert.equal(response.status,400);
 assert.equal((await response.json()).error,'EBAY_LINK_UNSUPPORTED');
 assert.equal(calls,1);
});
test('upload validation rejects empty, unsupported and oversized files',async()=>{
 const empty=await analyzeUploadApi(formRequest([]),env,{},uploadDeps);
 assert.equal(empty.status,400);
 assert.equal((await empty.json()).error,'AI_INVALID_PHOTO_COUNT');
 const bad=new Blob([new Uint8Array(400).fill(1)],{type:'image/png'});
 const invalid=await analyzeUploadApi(formRequest([bad]),env,{},uploadDeps);
 assert.equal(invalid.status,400);
 assert.equal((await invalid.json()).error,'AI_INVALID_IMAGE');
 const huge=await analyzeUploadApi(formRequest([image(2200001)]),env,{},uploadDeps);
 assert.equal(huge.status,413);
 assert.equal((await huge.json()).error,'AI_IMAGE_TOO_LARGE');
});
test('upload endpoint reuses the existing Gemini core for user-supplied photos',async(t)=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');
  calls++;
  const parts=JSON.parse(options.body).contents[0].parts;
  assert.equal(parts.filter(p=>p.inline_data).length,2);
  assert.equal(parts.filter(p=>p.inline_data)[0].inline_data.mime_type,'image/jpeg');
  return Response.json({candidates:[{finishReason:'STOP',
   content:{parts:[{text:JSON.stringify(valid)}]}}]});
 });
 const response=await analyzeUploadApi(formRequest([image(),image()]),env,{},uploadDeps);
 const data=await response.json();
 assert.equal(response.status,200,JSON.stringify(data));
 assert.equal(calls,1);
 assert.equal(data.analysis.grade,'LP');
 assert.deepEqual(data.analyzedPhotoIndices,[1,2]);
 assert.deepEqual(data.analysis.observations[0].locations,[{photoIndex:1,box2d:[60,80,120,170]}]);
});
