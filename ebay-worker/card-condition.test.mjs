import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCardCondition,normalizeConditionResult,CONDITION_MODEL,FALLBACK_CONDITION_MODEL} from './card-condition.js';
import worker from './index.js';

const valid={grade:'LP',gradePercentages:{NM:10,LP:60,MP:25,HP:4,DMG:1},
 observations:[{area:'corners',finding:'Small white spot',severity:'minor',
  locations:[{photoIndex:2,box2d:[60,80,120,170]}]}],
 limitations:['Back mostly hidden'],visibleSides:['front']};
test('normalizer preserves supported photo-specific defect coordinates',()=>{
 const result=normalizeConditionResult(valid,[1,2]);
 assert.equal(result.grade,'LP');
 assert.equal(result.confidencePercent,60);
 assert.equal(result.model,CONDITION_MODEL);
 assert.deepEqual(result.observations[0].locations,[{photoIndex:2,box2d:[60,80,120,170]}]);
});
test('normalizer drops wrong index and malformed boxes without inventing a defect',()=>{
 const r=normalizeConditionResult({...valid,observations:[{...valid.observations[0],
  locations:[{photoIndex:3,box2d:[0,0,100,100]},{photoIndex:2,box2d:[70,90,50,200]}]}]},[1,2]);
 assert.equal(r.observations.length,1);
 assert.deepEqual(r.observations[0].locations,[]);
});
test('normalizer rejects fabricated or contradictory probabilities',()=>{
 assert.throws(()=>normalizeConditionResult({...valid,gradePercentages:{...valid.gradePercentages,LP:99}},[1,2]),/AI_INVALID_PERCENTAGES/);
 assert.throws(()=>normalizeConditionResult({...valid,grade:'NM'},[1,2]),/AI_GRADE_MISMATCH/);
 assert.throws(()=>normalizeConditionResult({...valid,grade:'EX'},[1,2]),/AI_INVALID_GRADE/);
});
test('neutral grading adapter calls Gemini with only supplied images and schema',async()=>{
 const photo={index:2,mimeType:'image/jpeg',bytes:new Uint8Array(400).fill(7)};
 let payload,secret,endpoint;
 const fetchImpl=async(url,options)=>{
  endpoint=url;secret=options.headers['x-goog-api-key'];payload=JSON.parse(options.body);
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});
 };
 const r=await analyzeCardCondition({photos:[photo],cardContext:{name:'Snorlax'}},{apiKey:'fake-key',fetchImpl});
 assert.match(endpoint,/gemini-3\.8-flash:generateContent$/);
 assert.equal(secret,'fake-key');
 assert.equal(payload.contents[0].parts.filter(x=>x.inline_data).length,1);
 assert.equal(payload.contents[0].parts[2].inline_data.mime_type,'image/jpeg');
 assert.equal(payload.generationConfig.responseMimeType,'application/json');
 assert.equal(r.grade,'LP');
});
test('grading core refuses unsafe photo data before remote API',async()=>{
 await assert.rejects(analyzeCardCondition({photos:[{index:1,mimeType:'image/svg+xml',bytes:new Uint8Array(400)}]},{apiKey:'fake'}),/AI_INVALID_PHOTOS/);
 await assert.rejects(analyzeCardCondition({photos:[]},{apiKey:'fake'}),/AI_INVALID_PHOTOS/);
});
test('public route never reaches provider without Firebase authentication',async()=>{
 const req=new Request('https://worker.example/api/analyze-condition',{method:'POST',
  headers:{origin:'https://xfayne.github.io','content-type':'application/json'},
  body:JSON.stringify({source:{type:'ebay-listing',itemId:'v1|123|0',marketplace:'EBAY_US'}})});
 const res=await worker.fetch(req,{ALLOWED_ORIGIN:'https://xfayne.github.io',GEMINI_API_KEY:'secret',TRACK17_OWNER_EMAIL:'owner@example.com'});
 assert.equal(res.status,403);
 assert.equal((await res.json()).error,'AI_AUTH_REQUIRED');
});

test('authenticated analysis downloads eBay photos with Workers-compatible redirect handling',async(t)=>{
 const project='pokemon-vintage-binder',owner='owner@example.com',kid='fixture-signing-key';
 const keys=await crypto.subtle.generateKey({
  name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'
 },true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const claims={aud:project,iss:'https://securetoken.google.com/'+project,sub:'fixture-owner',
  exp:now+600,iat:now,auth_time:now,email:owner,email_verified:true};
 const unsigned=encode({alg:'RS256',kid})+'.'+encode(claims);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned));
 const token=unsigned+'.'+Buffer.from(signature).toString('base64url');
 const source={type:'ebay-listing',itemId:'v1|123456|0',marketplace:'EBAY_US'};
 let imageFetches=0,providerCalls=0;
 t.mock.method(globalThis,'fetch',async(input,options)=>{
  const url=new URL(input);
  if(url.hostname==='www.googleapis.com')return Response.json({keys:[jwk]});
  if(url.hostname==='api.ebay.com'&&url.pathname.endsWith('/token'))
   return Response.json({access_token:'fixture-ebay-token',expires_in:3600});
  if(url.hostname==='api.ebay.com'&&url.pathname.includes('/item/'))
   return Response.json({image:{imageUrl:'https://i.ebayimg.com/redirect.jpg'},
    additionalImages:[{imageUrl:'https://i.ebayimg.com/usable.jpg'}]});
  if(url.hostname==='i.ebayimg.com'){
   imageFetches++;
   // workerd throws when fetch is constructed with redirect: 'error'.
   assert.equal(options.redirect,'manual');
   if(url.pathname==='/redirect.jpg')return Response.redirect('https://example.invalid/other.jpg');
   return new Response(new Uint8Array(400).fill(7),{headers:{'content-type':'image/jpeg'}});
  }
  if(url.hostname==='generativelanguage.googleapis.com'){
   providerCalls++;
   const images=JSON.parse(options.body).contents[0].parts.filter(part=>part.inline_data);
   assert.equal(images.length,1);
   assert.equal(images[0].inline_data.mime_type,'image/jpeg');
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});
  }
  assert.fail('Unexpected outbound fetch: '+url.hostname);
 });
 const response=await worker.fetch(new Request('https://worker.example/api/analyze-condition',{method:'POST',
  headers:{origin:'https://xfayne.github.io','content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({source})}),{ALLOWED_ORIGIN:'https://xfayne.github.io',GEMINI_API_KEY:'fixture-key',
  TRACK17_OWNER_EMAIL:owner,EBAY_CLIENT_ID:'fixture-client',EBAY_CLIENT_SECRET:'fixture-secret'});
 const result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));
 assert.equal(imageFetches,2);
 assert.equal(providerCalls,1);
 assert.deepEqual(result.analyzedPhotoIndices,[2]);
 assert.deepEqual(result.analysis.observations[0].locations,valid.observations[0].locations);
});

test('Gemini overload uses one different model and records the actual provider model',async()=>{
 const photos=[{index:2,mimeType:'image/jpeg',bytes:new Uint8Array(400)}];
 const requests=[];
 const fetchImpl=async(url,options)=>{
  assert.equal(options.signal,undefined,'Do not impose a local provider deadline');
  requests.push({url,options});
  if(requests.length===1)return new Response('busy',{status:503});
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(valid)}]}}]});
 };
 const result=await analyzeCardCondition({photos},{apiKey:'fake-key',fetchImpl});
 assert.equal(result.grade,'LP');
 assert.equal(result.model,FALLBACK_CONDITION_MODEL,'Always persist the real model used');
 assert.equal(requests.length,2,'One primary and only one fallback');
 assert.match(requests[0].url,/gemini-3\.8-flash:generateContent$/);
 assert.match(requests[1].url,/gemini-3\.5-flash-lite:generateContent$/);
 assert.deepEqual(requests[0].options,requests[1].options,'Pass the same bounded photos and schema');
});
test('Gemini does not cascade indefinitely or substitute models on quota/auth/timeout failures',async()=>{
 const photos=[{index:2,mimeType:'image/jpeg',bytes:new Uint8Array(400)}];
 const requests=[];
 const run=fetchImpl=>analyzeCardCondition({photos},{apiKey:'fake-key',fetchImpl});
 await assert.rejects(run(async url=>{requests.push(url);return new Response('busy',{status:503});}),/AI_PROVIDER_BUSY/);
 assert.equal(requests.length,2);
 assert.match(requests[1],/gemini-3\.5-flash-lite:generateContent$/);
 for(const [status,error] of [[429,/AI_RATE_LIMITED/],[504,/AI_PROVIDER_TIMEOUT/],[403,/AI_PROVIDER_AUTH_FAILED/]]){
  const before=requests.length;
  await assert.rejects(run(async url=>{requests.push(url);return new Response('error',{status});}),error);
  assert.equal(requests.length,before+1,'Non-503 errors must not cause additional calls');
  assert.match(requests[requests.length-1],/gemini-3\.8-flash:generateContent$/);
 }
});
