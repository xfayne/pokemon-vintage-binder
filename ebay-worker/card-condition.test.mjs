import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCardCondition,normalizeConditionResult,CONDITION_MODEL} from './card-condition.js';
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
