import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

// This exercises the real Deals UI, including its rerenders, in a mobile browser.
// eBay network calls are replaced with deterministic item fixtures, never real bids.
const fixtureHtml = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head><body>'+
  '<section id="dealsPage"><div class="collection-panel"><div class="collection-heading"><div><h2>🔎 מציאות</h2><div class="subtle">Wishlist deals</div></div></div></div></section>'+
  '<script src="/js/currency.js"></script><script src="/js/image-stable-dom.js"></script><script src="/deal-finder/live.js"></script></body></html>';
const liveScript=readFileSync('deal-finder/live.js','utf8');
const stableDomScript=readFileSync('js/image-stable-dom.js','utf8');
const currencyScript=readFileSync('js/currency.js','utf8');
const server=createServer((request,response)=>{
  if(request.url==='/'){
    response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    response.end(fixtureHtml);
  }else if(request.url==='/js/currency.js'){
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(currencyScript);
  }else if(request.url==='/js/image-stable-dom.js'){
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(stableDomScript);
  }else if(request.url==='/deal-finder/live.js'){
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(liveScript);
  }else{response.writeHead(404);response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true});

const single=(id,title,price)=>({
  cardId:'neo1-14',itemId:id,url:'https://www.ebay.com/itm/'+encodeURIComponent(id),
  title,format:'FIXED_PRICE',marketplace:'EBAY_US',
  currentBid:{value:price,currency:'USD'},shipping:{value:0,currency:'USD'},
  matchConfidence:96,verificationStatus:'strong',verificationReasons:[],
  conditionSource:'seller',conditionGrade:'NM',sellerName:'fixture-seller',
  sellerFeedback:100,bestOffer:false,bidCount:null,
  image:id==='item-0'?'https://i.ebayimg.com/fixture-primary.jpg':null
});
const cards=Array.from({length:52},(_,i)=>single('item-'+i,
  'Slowking 14/111 Neo Genesis Holo Unlimited Pokemon Card '+i,
  i===0?3:10+i/10));
// Two verified, overpriced offers: +593% must never outrank +42% by accident.
cards[50].currentBid={value:693,currency:'USD'};
cards[51].currentBid={value:142,currency:'USD'};
const accessories=[
  single('case-space','Slowking 14/111 Neo Genesis Pokemon Art Case',2),
  single('case-hyphen','Slowking 14/111 Neo Genesis Pokemon Art-Case',2),
  single('case-joined','Slowking 14/111 Neo Genesis Pokemon Artcase',2),
  single('case-plural','Slowking 14/111 Neo Genesis Pokemon ART CASES',2)
];

try{
  const context=await browser.newContext({viewport:{width:390,height:844},
    locale:'he-IL',serviceWorkers:'block'});
  await context.addInitScript(()=>{
    // Existing fixture assertions use USD; this also verifies persistence on load.
    localStorage.setItem('pokemon-vintage-display-currency','USD');
    window.VintageDealBridge={
      getWishlistCards:()=>[{id:'neo1-14',name:'Slowking',setName:'Neo Genesis',
        number:'14/111',finish:'holo',firstEdition:false}],
      getCardForDeals:id=>id==='base1-3'?{id,name:'Chansey',setName:'Base Set',number:'3/102',finish:'holo',firstEdition:false}:null,
      returnToCardDetails:id=>{window.__returnedToCard=id;},
      getMarketPrice:(_id,grade)=>({NM:100,LP:60,MP:30,HP:15,DMG:5})[grade]
    };
    window.VintageDealsDashboard={
      convertToUSD:(amount,currency)=>currency==='USD'?amount:null
    };
    const saved=new Map();
    window.VintageCloud={
      canEdit:()=>true,getUserUid:()=> 'test-fixture-user',
      conditionAnalysisKey:source=>'ebay-listing__'+source.marketplace+'__'+source.itemId,
      getIdToken:async()=> 'fake-auth-test',
      getConditionAnalysis:async source=>saved.get(source.marketplace+':'+source.itemId)||null,
      saveConditionAnalysis:async (source,analysis,photoIndices)=>{
       const value={analysis,photoIndices,source,clientAnalyzedAt:Date.now()};
       saved.set(source.marketplace+':'+source.itemId,value);
       return value;
      }
    };
  });
  await context.route('https://api.frankfurter.dev/v2/rates?base=USD',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify([
      {base:'USD',quote:'EUR',rate:0.9,date:'2026-11-12'},
      {base:'USD',quote:'ILS',rate:3.5,date:'2026-11-12'}
    ])
  }));
  let galleryCalls=0,analysisCalls=0;
  const requestedCardIds=[];
  const galleryPhotos=['https://i.ebayimg.com/fixture-primary.jpg',
    'https://i.ebayimg.com/fixture-back.jpg','https://i.ebayimg.com/fixture-corner.jpg'];
  await context.route('https://i.ebayimg.com/**',route=>route.fulfill({
    status:200,contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"></svg>'
  }));
  await context.route('https://pokemon-vintage-ebay-deals.xfayne.workers.dev/**',async route=>{
    const requestUrl=route.request().url();
    if(requestUrl.endsWith('/api/analyze-condition')){
      analysisCalls++;
      await new Promise(resolve=>setTimeout(resolve,300)); // Hold fixture response to inspect loading UI.
      const requestBody=JSON.parse(route.request().postData()||'{}');
      assert.equal(requestBody.source.type,'ebay-listing');
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        source:requestBody.source,imageCount:3,analyzedPhotoIndices:[1,2,3],
        analysis:{
          grade:'LP',confidencePercent:72,model:'gemini-3.8-flash',
          gradePercentages:{NM:10,LP:72,MP:15,HP:3,DMG:0},
          observations:[{area:'corners',finding:'White mark on back corner',severity:'minor',
            locations:[{photoIndex:2,box2d:[100,100,280,310]}]}],
          limitations:['Holo surface not shown at an angle']
        }
      })});
    }
    if(requestUrl.endsWith('/api/item-images')){
      galleryCalls++;
      const body=JSON.parse(route.request().postData()||'{}');
      assert.equal(body.itemId,'item-0');
      assert.equal(body.marketplace,'EBAY_US');
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({images:galleryPhotos})});
    }
    const requestBody=requestUrl.endsWith('/api/search')?JSON.parse(route.request().postData()||'{}'):null;
    if(requestBody)requestedCardIds.push(requestBody.cards?.map(card=>card.id)||[]);
    const forChansey=requestBody?.cards?.[0]?.id==='base1-3';
    const response=requestUrl.endsWith('/health')
      ?{ready:true}:requestUrl.endsWith('/api/search')
        ?{items:forChansey?[{...single('chansey-deal','Chansey 3/102 Base Set Holo Unlimited Pokemon Card',12),cardId:'base1-3'}]:[...cards,...accessories],fetchedAt:new Date().toISOString(),errors:[]}
        :{error:'Unexpected fixture endpoint'};
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(response)});
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#liveBadge')?.classList.contains('ready'));
  await page.evaluate(()=>window.VintageEbayLive.open());
  await page.waitForFunction(()=>document.querySelectorAll('select.live-item-grade').length===40);

  const keys=()=>page.locator('#liveListings select.live-item-grade')
    .evaluateAll(selects=>selects.map(select=>select.dataset.itemKey));
  const initial=await keys();
  await page.evaluate(()=>{
    window.__stableListingArticle=document.querySelector('[data-listing-key="item-0"]');
    window.__stableListingPhoto=window.__stableListingArticle.querySelector('img');
  });
  assert.equal(initial.length,40,'Expected first page of 40 deals');
  assert.equal(initial[0],'item-0','Cheapest listing should rank first in recommended view');
  assert.ok(!initial.some(key=>key.startsWith('case-')));
  assert.match(await page.locator('#liveCount').textContent(),/מתוך 52 מודעות/,
    'Accessories must be excluded from the full candidate count');
  await page.waitForFunction(()=>window.VintageCurrency?.getFxDate()==='2026-11-12');
  await page.evaluate(()=>window.VintageCurrency.setCurrency('ILS'));
  const shekelRow=await page.locator('[data-listing-key="item-0"] .live-item-numbers').innerText();
  assert.match(shekelRow,/₪/,'Bid, shipping and total must follow ILS');
  assert.doesNotMatch(shekelRow,/\$[0-9]/,'Mixed USD prices must not leak into ILS');
  const shekelMarket=await page.locator('[data-listing-key="item-0"] .live-single-price').innerText();
  assert.match(shekelMarket,/₪/,'Market price must follow the selected currency');
  await page.evaluate(()=>window.VintageCurrency.setCurrency('USD'));

  assert.equal(galleryCalls,0,'Gallery photos were fetched during search');
  assert.equal(await page.locator('#liveGallery').evaluate(el=>el.open),false);
  await page.locator('.live-image-open[data-image-key="item-0"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#liveGalleryThumbs button').length===3);
  assert.equal(galleryCalls,1,'Gallery should fetch detail only on open');
  assert.equal(await page.locator('#liveGallery').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'1 / 3');
  await page.locator('#liveGalleryNext').click();
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'2 / 3');
  await page.locator('#liveGalleryThumbs [data-gallery-index="2"]').click();
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'3 / 3');
  await page.locator('#liveGallery').press('ArrowRight');
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'1 / 3',
    'Keyboard navigation must wrap from last to first');
  await page.evaluate(()=>{
    const stage=document.querySelector('#liveGalleryStage');
    const start=new Event('touchstart');
    Object.defineProperty(start,'touches',{value:[{clientX:300,clientY:200}]});
    stage.dispatchEvent(start);
    const end=new Event('touchend');
    Object.defineProperty(end,'changedTouches',{value:[{clientX:100,clientY:210}]});
    stage.dispatchEvent(end);
  });
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'2 / 3',
    'Swipe left must navigate to next gallery photo');
  assert.equal(await page.locator('#liveGalleryDemo').isVisible(),false);
  assert.equal(analysisCalls,0,'Opening a listing must not analyze images');
  await page.locator('#liveGalleryDemoButton').click();
  await page.waitForFunction(()=>document.querySelector('#liveGalleryDemoButton')?.classList.contains('is-loading'));
  assert.equal(await page.locator('#liveGalleryDemoButton').isDisabled(),true);
  assert.equal(await page.locator('#liveGalleryDemoButton').getAttribute('aria-busy'),'true');
  assert.match(await page.locator('#liveGalleryDemoButton').textContent(),/מנתח תמונות/);
  await page.waitForFunction(()=>document.querySelector('#liveGalleryDemo')?.textContent.includes('הערכת AI: LP'));
  assert.equal(await page.locator('#liveGalleryDemoButton').evaluate(el=>el.classList.contains('is-loading')),false,'Loading pulse must stop after completion');
  assert.equal(await page.locator('#liveGalleryDemoButton').getAttribute('aria-busy'),null);
  assert.equal(analysisCalls,1,'AI is called only after manual tap');
  assert.match(await page.locator('#liveGalleryDemo').innerText(),/72% ביטחון/);
  await page.locator('[data-ai-finding="0"]').click();
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'2 / 3');
  await page.waitForFunction(()=>document.querySelectorAll('#liveGalleryOverlay .live-gallery-defect-box').length>0);
  assert.equal(await page.locator('#liveGalleryOverlay .live-gallery-defect-box').count(),1);
  assert.equal(await page.locator('#liveListings article:has(select.live-item-grade[data-item-key="item-0"]) .live-single-grade').innerText().then(s=>s.includes('AI')),true);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-listing-key="item-0"]')===window.__stableListingArticle &&
    document.querySelector('[data-listing-key="item-0"] img')===window.__stableListingPhoto),
    true,'AI/price refresh remounted a listing card photo');
  await page.locator('#liveGalleryClose').click();
  assert.equal(await page.locator('#liveGallery').evaluate(el=>el.open),false);
  await page.locator('.live-image-open[data-image-key="item-0"]').click();
  assert.equal(await page.locator('#liveGalleryCounter').textContent(),'1 / 3');
  assert.equal(galleryCalls,1,'Reopening the same listing should use cached gallery metadata');
  await page.waitForFunction(()=>document.querySelector('#liveGalleryDemo')?.textContent.includes('הערכת AI: LP'));
  assert.equal(analysisCalls,1,'Reopening cached analysis must not call Gemini again');
  await page.locator('#liveGalleryClose').click();

  const first=page.locator('#liveListings select.live-item-grade').first();
  await first.selectOption('DMG');
  const after=await keys();
  assert.deepEqual(after,initial,
    'Changing a grade must not reorder or hide the current listing');
  assert.equal(await page.locator('#liveListings select.live-item-grade').first().inputValue(),'DMG');
  assert.equal(await page.evaluate(()=>document.querySelector('[data-listing-key="item-0"]')===window.__stableListingArticle &&
    document.querySelector('[data-listing-key="item-0"] img')===window.__stableListingPhoto),
    true,'Changing comparison condition remounted a listing photo');
  const cardText=await page.locator('#liveListings > article').first().innerText();
  assert.match(cardText,/מחירון DMG/,'Price comparison grade should update');
  assert.match(cardText,/\$5(?:\.00)?/,'Market price should use the selected grade');
  assert.match(cardText,/40%/,'Savings should be recalculated for selected grade');

  // A second grade change is also stable; an explicit sort then reorders.
  await page.locator('#liveListings select.live-item-grade').first().selectOption('LP');
  assert.deepEqual(await keys(),initial);
  await page.locator('#liveListings select.live-item-grade').first().selectOption('DMG');
  assert.deepEqual(await keys(),initial);
  await page.locator('#liveSort').selectOption('discount');
  const reordered=await keys();
  assert.equal(reordered.length,40);
  assert.ok(!reordered.includes('item-0'),
    'Explicit re-sort should allow repricing to move a listing beyond the first 40');
  await page.locator('#liveShowMore').click();
  assert.equal(await page.locator('#liveListings select[data-item-key="item-0"]').inputValue(),'DMG',
    'Manual comparison grade should survive a deliberate sort and show more');

  // A card outside the Wishlist uses the same Worker pipeline, filters, and ranking.
  await page.evaluate(()=>window.VintageEbayLive.openCard('base1-3'));
  await page.waitForFunction(()=>document.querySelectorAll('#liveListings article').length===1);
  assert.equal(await page.locator('#liveListings article .live-card-text small').textContent(),'Chansey · Base Set');
  assert.match(await page.locator('.collection-heading h2').textContent(),/Chansey/);
  assert.ok(requestedCardIds.some(ids=>ids.length===1&&ids[0]==='base1-3'),
    'Scoped search must request only the selected catalog card');
  assert.equal(await page.locator('#liveReload').textContent(),'↻ סרוק מחדש את הקלף');
  await page.locator('#liveAllWishlist').click();
  await page.waitForFunction(()=>document.querySelectorAll('#liveListings article').length===52);
  assert.equal(await page.locator('#liveScopeActions').isVisible(),false);
  assert.equal(await page.locator('#liveListings select.live-item-grade').count(),52,
    'Returning to Wishlist must restore the previously expanded result set without scoped listings');
  // Recommended sorting: +42% is more attractive than +593% for the same
  // verified card. A grade edit may freeze order for one interaction only.
  await page.locator('#liveSort').selectOption('recommended');
  await page.locator('#liveShowMore').click();
  const overpriceOrder=await keys();
  assert.ok(overpriceOrder.indexOf('item-51')<overpriceOrder.indexOf('item-50'),
    'A +42% overpayment must rank before a +593% overpayment');
  await page.locator('select.live-item-grade[data-item-key="item-51"]').selectOption('DMG');
  const gradeOrder=await keys();
  assert.ok(gradeOrder.indexOf('item-51')<gradeOrder.indexOf('item-50'),
    'The listing must not jump while changing its comparison grade');
  await page.evaluate(()=>window.VintageCurrency.setCurrency('ILS'));
  const reRanked=await keys();
  assert.ok(reRanked.indexOf('item-50')<reRanked.indexOf('item-51'),
    'A later currency refresh must release the frozen order and re-rank the now much worse grade');
  await page.evaluate(()=>window.VintageCurrency.setCurrency('USD'));
  await page.evaluate(()=>window.VintageEbayLive.openCard('base1-3'));
  await page.waitForFunction(()=>document.querySelectorAll('#liveListings article').length===1);
  await page.locator('#liveBackToCard').click();
  assert.equal(await page.evaluate(()=>window.__returnedToCard),'base1-3',
    'Scoped Deals must offer return to original card details');

  assert.deepEqual(pageErrors,[],'No uncaught browser errors expected');
  console.log('PASS Deals mobile gallery fetches photos only on open, navigates by buttons, thumbnails, keyboard and touch, analyzes only on demand and reuses persisted results, and preserves grade sorting');
  await context.close();
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
