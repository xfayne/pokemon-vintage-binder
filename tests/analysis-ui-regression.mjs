/* Self-contained mobile/desktop regression: no real Firestore, Gemini or eBay requests. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const template=readFileSync('templates/index.template.html','utf8');
const section=template.match(/<section class="collection-page" id="analysisPage"[\s\S]*?<\/section>/)?.[0];
const visibleSection=section?.replace('id="analysisPage" hidden','id="analysisPage"');
assert.ok(section,'Standalone grading section missing');
const html='<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/css/app.css"></head><body>'+visibleSection+
 '<script defer src="/js/condition-analysis-page.js"></script></body></html>';
const script=readFileSync('js/condition-analysis-page.js');
const css=readFileSync('css/app.css');
const server=createServer((req,res)=>{
 if(req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
 if(req.url==='/js/condition-analysis-page.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(script);return;}
 if(req.url==='/css/app.css'){res.writeHead(200,{'content-type':'text/css'});res.end(css);return;}
 res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT0kAAAAASUVORK5CYII=','base64');
const analysis={grade:'LP',confidencePercent:68,gradePercentages:{NM:10,LP:68,MP:20,HP:2,DMG:0},
 observations:[{area:'corners',finding:'Visible whitening',severity:'minor',
 locations:[{photoIndex:1,box2d:[100,100,400,500]}]}],limitations:['Back not shown']};
const listing={source:{type:'ebay-listing',marketplace:'EBAY_US',itemId:'v1|123456789012|0'},
 title:'Charizard Base Set',url:'https://www.ebay.com/itm/123456789012',
 images:['https://i.ebayimg.com/front.jpg','https://i.ebayimg.com/back.jpg']};
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.addInitScript(()=>{
   window.fixtureSaved=null;window.fixtureSaveCount=0;
   window.VintageCloud={
    canEdit:()=>true,getIdToken:async()=> 'fixture-token',
    getConditionAnalysis:async()=>window.fixtureSaved,
    saveConditionAnalysis:async(source,record)=>{window.fixtureSaveCount++;window.fixtureSaved={source,analysis:record}}
   };
  });
  const page=await context.newPage();
  const calls={upload:0,ebay:0,resolve:0};
  await page.route('https://i.ebayimg.com/**',route=>route.fulfill({status:200,
   contentType:'image/png',body:png}));
  await page.route('https://pokemon-vintage-ebay-deals.xfayne.workers.dev/**',async route=>{
   const cors={'access-control-allow-origin':'http://127.0.0.1:'+port,
    'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
   const respond=json=>route.fulfill({json,headers:cors});
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/resolve-ebay-link'){calls.resolve++;await respond(listing);return;}
   if(path==='/api/analyze-upload'){calls.upload++;
    assert.match(route.request().headers()['content-type'],/^multipart\/form-data/);
    await respond({analysis,imageCount:1,analyzedPhotoIndices:[1]});return;}
   if(path==='/api/analyze-condition'){calls.ebay++;
    await respond({analysis,imageCount:2,analyzedPhotoIndices:[1,2]});return;}
   await route.abort();
  });
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
  assert.equal(await page.locator('[data-analysis-mode="photos"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#analysisPreview').isVisible(),false);
  assert.deepEqual(calls,{upload:0,ebay:0,resolve:0},'Opening page must not call inference');
  await page.locator('#analysisFilesInput').setInputFiles({name:'front.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelectorAll('#analysisThumbs button').length===1);
  assert.equal(calls.upload,0,'Selecting a photo must not call inference');
  await page.locator('#analysisRun').click();
  await page.waitForFunction(()=>document.querySelector('#analysisResult')?.textContent.includes('הערכת AI: LP'));
  assert.equal(calls.upload,1,'Manual upload analysis must call Gemini proxy exactly once');
  assert.match(await page.locator('#analysisResult').innerText(),/68% ביטחון/);
  assert.equal(await page.locator('#analysisThumbs button').count(),1);
  await page.waitForFunction(()=>document.querySelectorAll('#analysisOverlay .analysis-defect-box').length>0);
  await page.locator('#analysisRun').click();
  assert.equal(calls.upload,1,'Repeated normal action should reuse visible upload result');
  await page.waitForFunction(()=>!document.querySelector('#analysisRun')?.classList.contains('is-loading'));
  await page.locator('[data-analysis-mode="ebay"]').click();
  assert.equal(await page.locator('#analysisPreview').isVisible(),false);
  await page.locator('#analysisEbayUrl').fill('https://ebay.io/m/example');
  await page.locator('#analysisLoadEbay').click();
  await page.waitForFunction(()=>document.querySelectorAll('#analysisThumbs button').length===2);
  assert.equal(calls.resolve,1);
  assert.equal(calls.ebay,0,'Resolving listing and fetching photos must not call inference');
  await page.evaluate(a=>{window.fixtureSaved={source:{type:'ebay-listing',marketplace:'EBAY_US',itemId:'v1|123456789012|0'},analysis:a}},analysis);
  await page.locator('#analysisRun').click();
  await page.waitForFunction(()=>document.querySelector('#analysisResult')?.textContent.includes('תוצאה שמורה'));
  assert.equal(calls.ebay,0,'Stored eBay result must avoid duplicate inference');
  await page.locator('#analysisNext').click();
  assert.equal(await page.locator('#analysisCounter').textContent(),'2 / 2');
  await page.locator('#analysisResult .analysis-again').click();
  await page.waitForFunction(()=>window.fixtureSaveCount===1);
  assert.equal(calls.ebay,1,'Explicit reanalysis must call the existing eBay inference route');
  assert.deepEqual(errors,[],'Unexpected browser error in standalone analysis UI');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  assert.equal(overflow,false,'Standalone page overflows viewport '+viewport.width);
  console.log('PASS standalone AI analysis UI:',viewport.width,'px, photo upload, eBay link, cache, reanalysis');
  await context.close();
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
