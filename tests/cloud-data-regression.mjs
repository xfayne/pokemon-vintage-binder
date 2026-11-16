import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';

// Run the actual binder and cloud controllers in Chromium. Swap ONLY the Firebase
// SDK loader for an in-memory Firestore/Auth double. No account, network, or real
// Firestore collection is ever accessed by this test.
const originalCloud = readFileSync('js/firebase-cloud.js', 'utf8');
const loader = /async function loadSdk\(\)\{[^\n]*\}/;
assert.match(originalCloud, loader, 'Cloud SDK loader changed: update test seam');
const cloudWithFakeSdk = originalCloud.replace(loader,
  'async function loadSdk(){if(sdk)return sdk;sdk=window.__mockFirebase;return sdk;}');
const cwd = process.cwd();
const app = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    .replace(/^\/+/, '') || 'index.html';
  if (name.includes('..')) { response.writeHead(403); response.end(); return; }
  const absolute = resolve(cwd, name);
  if (!absolute.startsWith(cwd + '/') || name.startsWith('.')) {
    response.writeHead(403); response.end(); return;
  }
  try {
    const type = { '.html':'text/html', '.js':'text/javascript',
      '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png' };
    response.setHeader('Content-Type', (type[extname(name)] || 'application/octet-stream') + '; charset=utf-8');
    response.end(name === 'js/firebase-cloud.js' ? cloudWithFakeSdk : readFileSync(absolute));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + app.address().port;
const browser = await chromium.launch({headless:true});

const user = {uid:'fixture-user', email:'collector@example.invalid',displayName:'Test Collector'};
const shipment = {id:'parcel_test_01',number:'RR123456789IL',title:'Test cards',
  carrier:0,cardIds:['base1-1','base2-3'],seenEventIds:['event-1'],
  initialized:true,createdAt:42};
const initialProgress = {
  owned:{'base1-1':true}, wish:{'base2-3':true}, removedWish:{},
  conditions:{'base1-1':'LP','base2-3':'NM'},
  notes:{'base1-1':'Initial note'},
  purchasePrices:{'base1-1':{amount:42.5,currency:'EUR'}},
  firstEdition:{'base1-1':true},ownedAddedAt:{'base1-1':1700},
  shipments:[shipment],binderExcluded:{},binderIncludeWish:true,
  binderOrder:['base1-1','base2-3'],wishOrder:['base2-3']
};
const clone = value => JSON.parse(JSON.stringify(value));

function installFakeFirebase(options) {
  const copy = value => structuredClone(value);
  const docs = copy(options.docs);
  const writes = [];
  const subscribers = new Map();
  const authListeners = new Set();
  const test = {
    docs, writes, currentUser: copy(options.user), failNextWrite:false,
    failInitialRead:!!options.failInitialRead, readCount:0, signouts:0,
    setAuth(value) {
      this.currentUser = value ? copy(value) : null;
      for (const notify of authListeners) notify(this.currentUser);
    },
    emit(path, value, metadata={}) {
      const subs = subscribers.get(path) || [];
      for (const notify of subs) notify(snapshot(value, metadata));
    }
  };
  function snapshot(value, metadata={}) {
    // Simulate Firestore Timestamp without leaking methods into the stored docs.
    const saved = value == null ? null : copy(value);
    return {
      exists:()=>saved!==null,
      data:()=>saved===null?undefined:{...copy(saved),updatedAt:{
        toMillis:()=>Number(saved.updatedAt)||0
      }},
      metadata:{fromCache:false,hasPendingWrites:false,...metadata}
    };
  }
  window.__cloudTest = test;
  window.__mockFirebase = {
    getApps:()=>[],
    initializeApp:(_config,name)=>({name}),
    getAuth:()=>({}),
    getFirestore:()=>({}),
    GoogleAuthProvider:class {},
    onAuthStateChanged:(_auth,notify)=>{
      authListeners.add(notify);
      queueMicrotask(()=>notify(test.currentUser));
      return ()=>authListeners.delete(notify);
    },
    signInWithPopup:async()=>test.setAuth(options.user),
    signOut:async()=>{test.signouts++;test.setAuth(null);},
    getIdToken:async()=> 'fake-token',
    doc:(_db,...parts)=>({path:parts.join('/')}),
    getDocFromServer:async ref=>{
      test.readCount++;
      if(test.failInitialRead && ref.path.startsWith('users/')) {
        const error = Error('Fixture server unavailable');
        error.code = 'unavailable';
        throw error;
      }
      return snapshot(docs[ref.path] ?? null);
    },
    onSnapshot:(ref,notify)=>{
      const list = subscribers.get(ref.path)||[];
      list.push(notify);
      subscribers.set(ref.path,list);
      return ()=>subscribers.set(ref.path,list.filter(fn=>fn!==notify));
    },
    serverTimestamp:()=>({__serverTimestamp:true}),
    setDoc:async(ref,value)=>{
      if(test.failNextWrite) {
        test.failNextWrite=false;
        const error=Error('Injected write failure');error.code='unavailable';
        throw error;
      }
      const saved = copy(value);
      if(saved.updatedAt?.__serverTimestamp) saved.updatedAt=Date.now();
      docs[ref.path] = saved;
      writes.push({path:ref.path,value:copy(saved)});
      // Firestore may echo the write through onSnapshot.
      queueMicrotask(()=>test.emit(ref.path,saved,{hasPendingWrites:true}));
    },
    deleteDoc:async ref=>{delete docs[ref.path];}
  };
  localStorage.setItem('pokemon-vintage-binder-progress-v1-old','legacy-cache-must-not-win');
}

async function openFixture(options={}) {
  const context = await browser.newContext({
    viewport:{width:390,height:844},locale:'he-IL',serviceWorkers:'block',
    acceptDownloads:true
  });
  const seed={docs:{['users/'+user.uid]:{
    progress:clone(initialProgress),revision:2,updatedAt:1600
  }},user, ...options};
  await context.addInitScript(installFakeFirebase,seed);
  await context.route('**/*', route => route.request().url().startsWith(origin)
    ? route.continue() : route.abort());
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/',{waitUntil:'load'});
  await page.waitForFunction(()=>window.VintageCloud && window.__cloudTest);
  if (!options.failInitialRead) {
    await page.waitForFunction(()=>window.VintageCloud.canEdit() === true);
  } else {
    await page.waitForFunction(()=>document.querySelector('#cloudStatus')
      ?.textContent.includes('לא ניתן לטעון'));
  }
  return {context,page,errors};
}
const savedDoc=() => 'users/'+user.uid;
async function getState(page) {
  return page.evaluate(() => window.VintageBinder.getProgress());
}
async function upload(page, filename, raw) {
  const text=typeof raw==='string'?raw:JSON.stringify(raw);
  await page.locator('#fileInput').setInputFiles({
    name:filename,mimeType:'application/json',buffer:Buffer.from(text)
  });
}
async function clickDownload(page,buttonId) {
  const pending=page.waitForEvent('download');
  await page.evaluate(id=>document.getElementById(id).click(),buttonId);
  const download=await pending;
  return readFileSync(await download.path(),'utf8');
}

try {
  const {context,page,errors}=await openFixture();
  page.on('dialog',dialog=>dialog.accept());
  try {
    // Startup is server-first; stale browser data is purged, never loaded.
    const startup=await getState(page);
    assert.deepEqual(startup.owned,initialProgress.owned);
    assert.deepEqual(startup.wish,initialProgress.wish);
    assert.deepEqual(startup.shipments,[shipment]);
    assert.deepEqual(startup.purchasePrices,initialProgress.purchasePrices);
    assert.deepEqual(startup.binderOrder,initialProgress.binderOrder);
    const boot=await page.evaluate(()=>({
      writes:window.__cloudTest.writes.length,
      cache:localStorage.getItem('pokemon-vintage-binder-progress-v1-old')
    }));
    assert.equal(boot.writes,0,'Loading from cloud must not rewrite user data');
    assert.equal(boot.cache,null,'Old browser cache was not purged');

    // Wishlist clipboard uses the same prioritized card order as the UI.
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
        writeText:async text=>{window.__copiedWishlist=text;}
      }});
      document.querySelector('#copyWishlist').click();
    });
    await page.waitForFunction(()=>typeof window.__copiedWishlist==='string');
    assert.match(await page.evaluate(()=>window.__copiedWishlist),/Flareon/);


    // Exercise the real cloud save pipeline with mutual-exclusion and ordering.
    await page.evaluate(()=>{
      const p=window.VintageBinder.getProgress();
      p.owned['base1-16']=true;
      p.wish['base1-16']=true; // legacy conflict must be normalized
      p.wishOrder.unshift('base1-16');
      p.ownedAddedAt['base1-16']=1900;
      window.VintageBinder.adoptProgress(p);
      window.VintageCloud.onChange({immediate:true});
    });
    await page.waitForFunction(()=>window.__cloudTest.writes.length===1);
    await page.waitForFunction(()=>document.querySelector('#cloudStatus')
      .textContent.includes('נשמר בענן'));
    const saved=await page.evaluate(path=>window.__cloudTest.docs[path],savedDoc());
    assert.equal(saved.progress.owned['base1-16'],true);
    assert.equal(!!saved.progress.wish['base1-16'],false);
    assert.ok(!saved.progress.wishOrder.includes('base1-16'));
    assert.deepEqual(saved.progress.purchasePrices,initialProgress.purchasePrices);
    assert.deepEqual(saved.progress.shipments,[shipment]);
    assert.equal(saved.revision,3);

    // A newer server snapshot updates the binder, but older/cached echoes do not.
    const remote=clone(saved);
    remote.revision=9;remote.updatedAt=Date.now()+2000;
    remote.progress.notes['base1-1']='Remote update';
    await page.evaluate(({path,remote})=>{
      window.__cloudTest.emit(path,remote);
    },{path:savedDoc(),remote});
    await page.waitForFunction(()=>window.VintageBinder.getProgress().notes['base1-1']==='Remote update');
    const stale=clone(saved);
    stale.revision=4;stale.updatedAt=Date.now()+3000;
    stale.progress.notes['base1-1']='Stale echo';
    await page.evaluate(({path,stale})=>{
      window.__cloudTest.emit(path,stale);
      window.__cloudTest.emit(path,stale,{fromCache:true});
    },{path:savedDoc(),stale});
    assert.equal((await getState(page)).notes['base1-1'],'Remote update');

    // Failed writes are not falsely reported as saved; the online retry works.
    await page.evaluate(()=>{
      window.__cloudTest.failNextWrite=true;
      const p=window.VintageBinder.getProgress();
      p.notes['base1-1']='Pending retry';
      window.VintageBinder.adoptProgress(p);
      window.VintageCloud.onChange({immediate:true});
    });
    await page.waitForFunction(()=>document.querySelector('#cloudStatus')
      .textContent.includes('השמירה בענן נכשלה'));
    assert.equal((await getState(page)).notes['base1-1'],'Pending retry');
    const afterFail=await page.evaluate(()=>window.__cloudTest.writes.length);
    assert.equal(afterFail,1,'Failed write must not be counted as persisted');
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>window.__cloudTest.writes.length===2);
    await page.waitForFunction(()=>document.querySelector('#cloudStatus')
      .textContent.includes('נשמר בענן'));
    assert.equal((await page.evaluate(path=>window.__cloudTest.docs[path],savedDoc()))
      .progress.notes['base1-1'],'Pending retry');

    // Export round-trip must preserve card metadata AND shipments.
    const backupText=await clickDownload(page,'exportJSON');
    const backup=JSON.parse(backupText);
    assert.equal(backup.app,'pokemon-vintage-binder');
    assert.equal(backup.version,4);
    assert.deepEqual(backup.shipments,[shipment]);
    assert.deepEqual(backup.purchasePrices,initialProgress.purchasePrices);
    const beforeImport=await getState(page);
    await page.evaluate(()=>window.VintageBinder.adoptProgress({owned:{'base2-4':true},shipments:[]}));
    await upload(page,'roundtrip.json',backup);
    await page.waitForFunction(()=>window.VintageBinder.getProgress().owned['base1-1']===true);
    const restored=await getState(page);
    for(const key of ['owned','wish','pendingPurchase','conditions','notes','purchasePrices','firstEdition',
      'ownedAddedAt','shipments','binderOrder','wishOrder','binderIncludeWish']) {
      assert.deepEqual(restored[key],beforeImport[key],'Backup roundtrip lost '+key);
    }
    await page.waitForFunction(()=>window.__cloudTest.writes.length===3);

    // Cancelling import must not overwrite the collection or trigger a cloud save.
    const beforeCancelled=await getState(page);
    const writesBeforeCancelled=await page.evaluate(()=>window.__cloudTest.writes.length);
    await page.evaluate(()=>{
      window.__originalConfirm=window.confirm;
      window.confirm=()=>{window.__cancelledImport=true;return false;};
    });
    await upload(page,'declined.json',{app:'pokemon-vintage-binder',owned:{'base2-4':true}});
    await page.waitForFunction(()=>window.__cancelledImport===true);
    assert.deepEqual(await getState(page),beforeCancelled,'Declined import modified collection');
    assert.equal(await page.evaluate(()=>window.__cloudTest.writes.length),
      writesBeforeCancelled,'Declined import triggered a cloud write');
    await page.evaluate(()=>{window.confirm=window.__originalConfirm;});

    // Excel-compatible UTF-8 CSV includes the exact existing columns.
    const csv=await clickDownload(page,'exportCSV');
    assert.ok(csv.startsWith('\ufeff"Set","Number","Name","Type","Finish","Condition"'));
    assert.ok(csv.includes('"Purchase Currency"'));
    assert.ok(csv.includes('"EUR"'));

    // Older backups without newer fields still restore core collection data.
    const oldBackup={app:'pokemon-vintage-binder',version:1,
      owned:{'base1-17':true},wish:{'base2-4':true},
      conditions:{'base1-17':'MP'}};
    await upload(page,'legacy.json',oldBackup);
    await page.waitForFunction(()=>window.VintageBinder.getProgress().owned['base1-17']===true);
    const legacy=await getState(page);
    assert.deepEqual(legacy.owned,oldBackup.owned);
    assert.deepEqual(legacy.wish,oldBackup.wish);
    assert.deepEqual(legacy.conditions,oldBackup.conditions);
    assert.equal(legacy.ownedAddedAt['base1-17']>0,true);
    assert.deepEqual(legacy.shipments,[shipment],
      'Legacy backup with no shipments should not erase existing shipments');

    // Invalid JSON or unrelated files must leave the live collection unchanged.
    const beforeBad=await getState(page);
    await upload(page,'broken.json','{this-is-not-json}');
    await page.waitForFunction(()=>document.querySelector('#toast')
      .textContent.includes('אינו גיבוי תקין'));
    assert.deepEqual(await getState(page),beforeBad);
    await upload(page,'not-a-backup.json',{app:'other-app',owned:{}});
    assert.deepEqual(await getState(page),beforeBad);

    // Sign out and back into the same mocked account; the cloud doc wins.
    await page.waitForFunction(()=>document.querySelector('#cloudStatus')
      .textContent.includes('נשמר בענן'));
    await page.evaluate(()=>window.__cloudTest.setAuth(null));
    await page.waitForFunction(()=>window.VintageCloud.canEdit()===false);
    await page.evaluate(u=>window.__cloudTest.setAuth(u),user);
    await page.waitForFunction(()=>window.VintageCloud.canEdit()===true);
    assert.deepEqual((await getState(page)).owned,oldBackup.owned);
    assert.deepEqual((await getState(page)).shipments,[shipment]);
    assert.deepEqual(errors,[],'Uncaught page errors during cloud test');

    // Purchase state is created only by linking a card to an existing shipment.
    // The mocked Firebase SDK ensures this test never touches production data.
    await page.locator('[data-view-btn="shipments"]').click();
    await page.evaluate(()=>document.querySelector('[data-ship-edit="parcel_test_01"]').click());
    // Reproduce screenshot with many selected chips and result rows. The whole
    // form must scroll as ONE region; only Save/Cancel remains fixed.
    const originalViewport=page.viewportSize();
    await page.setViewportSize({width:390,height:844});
    await page.locator('#shipmentCardSearch').fill('a');
    await page.waitForFunction(()=>document.querySelectorAll('#shipmentCardResults [data-ship-pick]').length>=8);
    await page.evaluate(()=>{
      const selected=document.querySelector('#shipmentSelected');
      for(let i=0;i<7;i++){
        const chip=document.createElement('button');
        chip.type='button';chip.textContent='Selected card '+i+' ×';
        selected.appendChild(chip);
      }
    });
    const layout=()=>page.evaluate(()=>{
      const q=sel=>document.querySelector(sel),r=sel=>q(sel).getBoundingClientRect();
      const dlg=r('#shipmentDialog'),body=r('#shipmentFormBody'),
        head=r('.shipment-dialog-head'),save=r('#shipmentForm button[type="submit"]'),
        footer=r('.shipment-form-actions'),results=r('#shipmentCardResults');
      const cards=[...document.querySelectorAll('#shipmentCardResults [data-ship-pick]')].map(x=>x.getBoundingClientRect());
      return {dialog:dlg.toJSON(),body:body.toJSON(),head:head.toJSON(),
        footer:footer.toJSON(),save:save.toJSON(),results:results.toJSON(),
        visible:cards.filter(c=>c.top>=body.top-1&&c.bottom<=body.bottom+1&&c.bottom<=innerHeight).length,
        bodyTop:q('#shipmentFormBody').scrollTop,bodyHeight:q('#shipmentFormBody').scrollHeight,
        bodyClient:q('#shipmentFormBody').clientHeight,dialogTop:q('#shipmentDialog').scrollTop,
        bodyOverflow:getComputedStyle(q('#shipmentFormBody')).overflowY,
        resultOverflow:getComputedStyle(q('#shipmentCardResults')).overflowY,
        chipsOverflow:getComputedStyle(q('#shipmentSelected')).overflowY};
    });
    const initial=await layout();
    assert.equal(initial.bodyOverflow,'auto');
    assert.equal(initial.resultOverflow,'visible','Results must not have their own scroll');
    assert.equal(initial.chipsOverflow,'visible','Selected chips must not have their own scroll');
    assert.ok(initial.bodyHeight>initial.bodyClient,'The full editor must scroll');
    assert.ok(initial.save.bottom<=initial.dialog.bottom&&initial.footer.bottom<=initial.dialog.bottom+1,
      'Save/Cancel must stay in the visible dialog');
    await page.evaluate(()=>{
      const body=document.querySelector('#shipmentFormBody'),first=document.querySelector('#shipmentCardResults [data-ship-pick]');
      body.scrollTop+=first.getBoundingClientRect().top-body.getBoundingClientRect().top-8;
    });
    const atResults=await layout();
    assert.ok(atResults.visible>=4,
      'Scrolling to results should show four complete rows: '+JSON.stringify(atResults));
    assert.ok(atResults.head.bottom<initial.head.bottom-30,
      'Modal header should scroll with the content');
    assert.ok(Math.abs(atResults.footer.top-initial.footer.top)<1,'Footer must not scroll');
    assert.ok(atResults.bodyTop>0&&atResults.dialogTop===0);
    await page.locator('#shipmentFormBody').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    const atEnd=await layout();
    assert.ok(atEnd.bodyTop>atResults.bodyTop,'The single scroll must reach the final result');
    assert.ok(Math.abs(atEnd.save.top-initial.save.top)<1);
    await page.setViewportSize({width:390,height:540});
    const compact=await layout();
    assert.ok(compact.dialog.top>=0&&compact.dialog.bottom<=541&&compact.footer.bottom<=compact.dialog.bottom+1,
      'Save/Cancel should stay visible in the compact viewport');
    assert.equal(compact.resultOverflow,'visible');
    await page.setViewportSize(originalViewport);
    await page.locator('#shipmentFormBody').evaluate(el=>{el.scrollTop=0;});
    await page.locator('#shipmentCardSearch').fill('');
    assert.equal(await page.locator('#shipmentPurchaseDate').inputValue(),'',
      'Existing shipments with unknown purchase dates must not be assigned today');
    await page.locator('#shipmentNote').fill('Combined shipping confirmed');
    await page.locator('#shipmentCardSearch').fill('base2-4');
    await page.locator('[data-ship-pick="base2-4"]').click();
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>!!window.VintageBinder.getProgress().pendingPurchase['base2-4']);
    let purchased=await getState(page);
    assert.equal(!!purchased.wish['base2-4'],false,'A linked card must leave the Wishlist');
    assert.equal(!!purchased.owned['base2-4'],false,'Undelivered cards are not physically owned');
    assert.ok(!purchased.wishOrder.includes('base2-4'));
    assert.equal(purchased.pendingPurchase['base2-4'].wasWish,true);
    assert.equal(purchased.shipments[0].note,'Combined shipping confirmed');
    assert.equal(purchased.shipments[0].purchaseDate,undefined);
    assert.match(await page.locator('#shipmentList').innerText(),/Combined shipping confirmed/);
    // Purchased-but-not-arrived cards have their own read-only list. A card
    // merely linked to a legacy shipment but still on the Wishlist is excluded.
    const progressBeforeTransit=await getState(page);
    await page.locator('#shipmentCardsTab').click();
    assert.equal(await page.locator('#shipmentCardsTab').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#shipmentParcelsPanel').isVisible(),false);
    assert.equal(await page.locator('#shipmentHeadActions').isVisible(),false);
    assert.equal(await page.locator('#shipmentPendingCount').textContent(),'1');
    assert.deepEqual(await page.locator('#shipmentPendingList [data-open-owned]').evaluateAll(nodes=>nodes.map(node=>node.dataset.openOwned)),['base2-4']);
    assert.match(await page.locator('[data-open-owned="base2-4"]').innerText(),/תאריך רכישה לא ידוע/);
    await page.locator('#shipmentPendingSearch').fill('not-a-real-card');
    assert.equal(await page.locator('#shipmentPendingList [data-open-owned]').count(),0);
    await page.locator('#shipmentPendingSearch').fill('base2-4');
    assert.equal(await page.locator('#shipmentPendingList [data-open-owned]').count(),1);
    await page.locator('#shipmentPendingSearch').fill('');
    await page.locator('#shipmentPendingSort').selectOption('name');
    assert.equal(await page.locator('#shipmentPendingList [data-open-owned]').count(),1);
    assert.deepEqual(await getState(page),progressBeforeTransit,'Viewing, searching and sorting transit cards must not modify Firestore progress');
    await page.locator('#shipmentParcelsTab').click();
    assert.equal(await page.locator('#shipmentParcelsPanel').isVisible(),true);


    // Unlinking before delivery reverses Wishlist removal; linking again restores pending.
    await page.evaluate(()=>document.querySelector('[data-ship-edit="parcel_test_01"]').click());
    await page.locator('[data-ship-unpick="base2-4"]').click();
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.VintageBinder.getProgress().pendingPurchase['base2-4']);
    assert.equal((await getState(page)).wish['base2-4'],true);
    await page.evaluate(()=>document.querySelector('[data-ship-edit="parcel_test_01"]').click());
    await page.locator('#shipmentCardSearch').fill('base2-4');
    await page.locator('[data-ship-pick="base2-4"]').click();
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>!!window.VintageBinder.getProgress().pendingPurchase['base2-4']);

    // A passive label and the existing paid-amount field are shown, not another button.
    await page.locator('.main-nav [data-view-btn="catalog"]').click();
    await page.locator('#search').fill(await page.evaluate(()=>window.VintageBinder.getCardInfo('base2-4').name));
    await page.locator('[data-id="base2-4"] [data-preview]').first().click();
    assert.equal(await page.locator('#modalPendingBadge').isVisible(),true);
    assert.equal(await page.locator('#modalWish').count(),0);
    assert.equal(await page.locator('#modalPurchaseBox').isVisible(),true);
    await page.locator('#modalPurchaseAmount').fill('27.5');
    await page.locator('#modalPurchaseAmount').dispatchEvent('change');
    await page.locator('#closeModal').click();

    // Delivery is manual, not inferred from external 17TRACK status updates.
    await page.locator('[data-view-btn="shipments"]').click();
    await page.locator('[data-ship-deliver="parcel_test_01"]').click();
    await page.waitForFunction(()=>window.VintageBinder.getProgress().shipments[0].deliveredAt>0);
    const delivered=await getState(page);
    assert.equal(delivered.owned['base2-4'],true);
    assert.equal(!!delivered.wish['base2-4'],false);
    assert.equal(!!delivered.pendingPurchase['base2-4'],false);
    assert.ok(delivered.ownedAddedAt['base2-4']>0);
    assert.deepEqual(delivered.purchasePrices['base2-4'],{amount:27.5,currency:'ILS'});
    assert.equal(delivered.shipments[0].note,'Combined shipping confirmed');
    assert.equal(await page.locator('[data-ship-deliver="parcel_test_01"]').count(),0);
    await page.waitForFunction(()=>window.__cloudTest.docs['users/fixture-user']?.progress?.shipments?.[0]?.deliveredAt>0);
    const persisted=await page.evaluate(()=>window.__cloudTest.docs['users/fixture-user'].progress);
    assert.deepEqual(persisted.purchasePrices['base2-4'],{amount:27.5,currency:'ILS'});
    assert.equal(persisted.owned['base2-4'],true);
    assert.deepEqual(errors,[],'Purchase lifecycle introduced page errors');

    // A shipment must be a useful purchase container before a seller gives a
    // tracking number. Capture Worker calls without contacting 17TRACK.
    await page.evaluate(()=>{
      window.__shipmentCalls=[];
      const originalFetch=window.fetch.bind(window);
      window.fetch=(input,init)=>{
        const url=String(input);
        if(url.includes('/api/shipments/')){
          const body=JSON.parse(init.body);
          window.__shipmentCalls.push({url,body});
          if(url.endsWith('/register')){
            return Promise.resolve({ok:true,json:async()=>({shipments:[{number:body.number,registered:true}]})});
          }
          if(url.endsWith('/track')){
            return Promise.resolve({ok:true,json:async()=>({shipments:[]})});
          }
        }
        return originalFetch(input,init);
      };
      const progress=window.VintageBinder.getProgress();
      progress.wish['base2-5']=true;
      progress.wishOrder.unshift('base2-5');
      window.VintageBinder.adoptProgress(progress);
    });
    await page.locator('#shipmentAdd').click();
    await page.locator('#shipmentName').fill('Untracked cards from seller');
    const localToday=await page.evaluate(()=>{
      const d=new Date();
      return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    });
    assert.equal(await page.locator('#shipmentPurchaseDate').inputValue(),localToday,
      'New shipments must default to the local current day');
    assert.equal(await page.locator('#shipmentPurchaseDate').getAttribute('max'),localToday);
    assert.equal(await page.locator('#shipmentPurchaseDate').evaluate(el=>el.required),true);
    await page.locator('#shipmentPurchaseDate').fill('2099-12-31');
    assert.equal(await page.locator('#shipmentPurchaseDate').evaluate(el=>el.checkValidity()),false,
      'A purchase date in the future must not be accepted');
    await page.locator('#shipmentPurchaseDate').fill('2025-09-01');
    assert.equal(await page.locator('#shipmentNumber').evaluate(el=>el.required),false);
    await page.locator('#shipmentNote').fill('Tracking to follow in a week');
    await page.locator('#shipmentCardSearch').fill('base2-5');
    await page.locator('[data-ship-pick="base2-5"]').click();
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>window.VintageBinder.getProgress().shipments.some(x=>x.title==='Untracked cards from seller'));
    const manual=await getState(page);
    const untracked=manual.shipments.find(x=>x.title==='Untracked cards from seller');
    assert.equal(untracked.number,'');
    assert.equal(untracked.note,'Tracking to follow in a week');
    assert.equal(untracked.purchaseDate,'2025-09-01');
    // Date comes from the associated parcel, not from its createdAt.
    await page.locator('#shipmentCardsTab').click();
    await page.locator('#shipmentPendingSort').selectOption('purchase-desc');
    assert.match(await page.locator('[data-open-owned="base2-5"]').innerText(),/01\.09\.2025/);
    await page.locator('#shipmentPendingSort').selectOption('purchase-asc');
    assert.equal(await page.locator('[data-open-owned="base2-5"]').count(),1);
    await page.locator('#shipmentPendingSearch').fill('Untracked cards from seller');
    assert.deepEqual(await page.locator('#shipmentPendingList [data-open-owned]').evaluateAll(nodes=>nodes.map(node=>node.dataset.openOwned)),['base2-5']);
    await page.locator('#shipmentPendingSearch').fill('');
    await page.locator('#shipmentParcelsTab').click();

    assert.match(await page.locator('[data-shipment-id="'+untracked.id+'"]').innerText(),
      /תאריך קנייה: 01\.09\.2025/);
    assert.deepEqual(untracked.cardIds,['base2-5']);
    assert.equal(!!manual.wish['base2-5'],false);
    assert.equal(!!manual.owned['base2-5'],false);
    assert.equal(manual.pendingPurchase['base2-5'].wasWish,true);
    assert.equal(await page.locator('[data-shipment-id="'+untracked.id+'"] [data-ship-open]').count(),0);
    assert.match(await page.locator('[data-shipment-id="'+untracked.id+'"]').innerText(),/ללא מעקב/);
    assert.equal(await page.evaluate(()=>window.__shipmentCalls.length),0,
      'No numberless shipment may be sent to 17TRACK');

    // Multiple numberless purchases are distinct; they are identified by ID.
    await page.locator('#shipmentAdd').click();
    await page.locator('#shipmentName').fill('Second untracked purchase');
    assert.equal(await page.locator('#shipmentPurchaseDate').inputValue(),localToday);
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>window.VintageBinder.getProgress().shipments.length===3);
    assert.equal((await getState(page)).shipments.filter(x=>!x.number).length,2);
    assert.equal((await getState(page)).shipments.find(x=>x.title==='Second untracked purchase').purchaseDate,localToday);
    await page.locator('#shipmentRefresh').click();
    await page.waitForFunction(()=>!document.querySelector('#shipmentRefresh').disabled);
    const trackCalls=await page.evaluate(()=>window.__shipmentCalls.filter(x=>x.url.endsWith('/track')));
    assert.ok(trackCalls.every(x=>x.body.shipments.every(s=>!!s.number)),'An empty number reached the tracking API');

    // The same purchase can be edited to add tracking (and later remove it).
    await page.evaluate(id=>document.querySelector('[data-ship-edit="'+id+'"]').click(),untracked.id);
    assert.equal(await page.locator('#shipmentPurchaseDate').inputValue(),'2025-09-01');
    await page.locator('#shipmentPurchaseDate').fill('2025-08-25');
    await page.locator('#shipmentNumber').fill('RR987654321IL');
    await page.locator('#shipmentForm button[type="submit"]').click();
    await page.waitForFunction(()=>window.__shipmentCalls.some(x=>x.url.endsWith('/register')&&x.body.number==='RR987654321IL'));
    let manualWithNumber=(await getState(page)).shipments.find(x=>x.id===untracked.id);
    assert.equal(manualWithNumber.number,'RR987654321IL');
    assert.equal(manualWithNumber.purchaseDate,'2025-08-25');
    assert.deepEqual(manualWithNumber.cardIds,['base2-5']);
    await page.evaluate(id=>document.querySelector('[data-ship-edit="'+id+'"]').click(),untracked.id);
    await page.locator('#shipmentNumber').fill('');
    await page.locator('#shipmentForm button[type="submit"]').click();
    assert.equal((await getState(page)).shipments.find(x=>x.id===untracked.id).number,'');

    // JSON backup, cloud persistence, manual delivery and re-login all retain
    // empty-number shipments; no live Firestore data is ever accessed.
    const manualBackup=JSON.parse(await clickDownload(page,'exportJSON'));
    assert.equal(manualBackup.shipments.find(x=>x.id===untracked.id).number,'');
    assert.equal(manualBackup.shipments.find(x=>x.id===untracked.id).purchaseDate,'2025-08-25');
    await page.locator('[data-ship-deliver="'+untracked.id+'"]').click();
    await page.waitForFunction(id=>window.VintageBinder.getProgress().shipments.find(s=>s.id===id).deliveredAt>0,untracked.id);
    assert.equal((await getState(page)).owned['base2-5'],true);
    await page.waitForFunction(id=>window.__cloudTest.docs['users/fixture-user']?.progress?.shipments?.some(s=>s.id===id&&s.deliveredAt>0),untracked.id);
    await page.evaluate(()=>window.__cloudTest.setAuth(null));
    await page.waitForFunction(()=>window.VintageCloud.canEdit()===false);
    await page.evaluate(u=>window.__cloudTest.setAuth(u),user);
    await page.waitForFunction(()=>window.VintageCloud.canEdit()===true);
    const reloaded=await getState(page);
    assert.equal(reloaded.shipments.find(x=>x.id===untracked.id).number,'');
    assert.equal(reloaded.shipments.find(x=>x.id===untracked.id).purchaseDate,'2025-08-25');
    assert.ok(reloaded.shipments.find(x=>x.id===untracked.id).deliveredAt>0);
    assert.equal(reloaded.shipments.find(x=>x.title==='Second untracked purchase').number,'');
    assert.equal(reloaded.shipments.find(x=>x.title==='Second untracked purchase').purchaseDate,localToday);
    assert.equal(reloaded.owned['base2-5'],true);
    assert.deepEqual(errors,[],'Optional shipment tracking introduced page errors');
    console.log('PASS cloud persistence, remote revisions, retry, backup/CSV/legacy import, optional shipment tracking and re-login');
  } finally { await context.close(); }

  // Regression for issue: linking many Wishlist cards to a shipment destroyed
  // the user's binder page layout and persisted the shortened order in Firestore.
  const purchaseFixture=await openFixture();
  try{
    const {page:pp,errors:purchaseErrors}=purchaseFixture;
    pp.on('dialog',dialog=>dialog.accept());
    const originalOrder=[
      'base1-1','base1-3','__binder_empty__:reserved_keep','base1-4','base1-2',
      'base1-5','base1-6','base1-7','base1-8','base1-9','base1-10'
    ];
    const originalWishOrder=['base1-5','base1-3','base1-4'];
    await pp.evaluate(({order,wishOrder})=>{
      const p=window.VintageBinder.getProgress();
      p.owned=Object.fromEntries(['base1-1','base1-2','base1-6','base1-7','base1-8','base1-9','base1-10'].map(id=>[id,true]));
      p.wish=Object.fromEntries(['base1-3','base1-4','base1-5'].map(id=>[id,true]));
      p.pendingPurchase={};p.removedWish={};p.binderExcluded={};p.binderOrder=order;
      p.wishOrder=wishOrder;p.binderIncludeWish=false;
      p.shipments=[{id:'parcel_preserve01',number:'',title:'Purchased from seller',cardIds:[],seenEventIds:[],initialized:false,createdAt:1600}];
      window.VintageBinder.adoptProgress(p);
    },{order:originalOrder,wishOrder:originalWishOrder});
    const start=await getState(pp);
    assert.deepEqual(start.binderOrder,originalOrder);
    await pp.locator('[data-view-btn="shipments"]').click();
    await pp.evaluate(()=>document.querySelector('[data-ship-edit="parcel_preserve01"]').click());
    for(const id of ['base1-3','base1-5']){
      await pp.locator('#shipmentCardSearch').fill(id);
      await pp.locator('[data-ship-pick="'+id+'"]').click();
    }
    await pp.locator('#shipmentForm button[type="submit"]').click();
    await pp.waitForFunction(()=>!!window.VintageBinder.getProgress().pendingPurchase['base1-5']);
    const pending=await getState(pp);
    assert.deepEqual(pending.binderOrder,originalOrder,
      'Purchase linked cards must NEVER shift any binder positions or reserved pockets');
    assert.equal(!!pending.owned['base1-3'],false);
    assert.equal(!!pending.owned['base1-5'],false);
    assert.equal(!!pending.wish['base1-3'],false);
    assert.equal(!!pending.wish['base1-5'],false);
    assert.deepEqual(pending.wishOrder,['base1-4']);
    assert.equal(pending.pendingPurchase['base1-3'].binderIndex,1);
    assert.equal(pending.pendingPurchase['base1-5'].binderIndex,5);
    assert.equal(pending.pendingPurchase['base1-3'].wishIndex,1);
    assert.equal(pending.pendingPurchase['base1-5'].wishIndex,0);
    await pp.locator('[data-view-btn="binder"]').click();
    assert.equal(await pp.locator('#binderGrid [data-card-id="base1-3"] .pocket-badge.pending').count(),1,
      'Pending card should remain visible on binder even when Wishlist overlay is disabled');
    assert.equal(await pp.locator('#binderGrid [data-card-id="base1-5"] .pocket-badge.pending').count(),1);
    assert.equal(await pp.locator('#binderGrid .binder-pocket-reserved').count(),1);
    const pendingIndexes=await pp.locator('#binderGrid .binder-pocket[data-card-id]').evaluateAll(nodes=>
      nodes.filter(n=>['base1-3','base1-5'].includes(n.dataset.cardId)).map(n=>[n.dataset.cardId,n.dataset.orderIndex]));
    assert.deepEqual(pendingIndexes,[['base1-3','1'],['base1-5','5']]);
    await pp.waitForFunction(()=>window.__cloudTest.docs['users/fixture-user']?.progress?.pendingPurchase?.['base1-5']);
    assert.deepEqual((await pp.evaluate(()=>window.__cloudTest.docs['users/fixture-user'].progress.binderOrder)),originalOrder,
      'Cloud writes must keep all original binder pockets and positions');

    // Undo shipment association: restore both Wishlist priority AND binder positions.
    await pp.locator('[data-view-btn="shipments"]').click();
    await pp.evaluate(()=>document.querySelector('[data-ship-edit="parcel_preserve01"]').click());
    await pp.locator('[data-ship-unpick="base1-3"]').click();
    await pp.locator('[data-ship-unpick="base1-5"]').click();
    await pp.locator('#shipmentForm button[type="submit"]').click();
    const unlinked=await getState(pp);
    assert.deepEqual(unlinked.binderOrder,originalOrder);
    assert.deepEqual(unlinked.wishOrder,originalWishOrder,
      'Unlinking cards should restore wishlist priority, not append them randomly');
    assert.equal(unlinked.wish['base1-3'],true);
    assert.equal(unlinked.wish['base1-5'],true);

    // Then buy and receive: same binder positions, but now physically owned.
    await pp.evaluate(()=>document.querySelector('[data-ship-edit="parcel_preserve01"]').click());
    for(const id of ['base1-3','base1-5']){
      await pp.locator('#shipmentCardSearch').fill(id);
      await pp.locator('[data-ship-pick="'+id+'"]').click();
    }
    await pp.locator('#shipmentForm button[type="submit"]').click();
    await pp.locator('[data-ship-deliver="parcel_preserve01"]').click();
    const received=await getState(pp);
    assert.equal(received.owned['base1-3'],true);
    assert.equal(received.owned['base1-5'],true);
    assert.equal(!!received.pendingPurchase['base1-3'],false);
    assert.deepEqual(received.binderOrder,originalOrder);

    // Older broken data has no recorded binderIndex. Do not manufacture a
    // replacement location, especially at the end of a multi-page binder.
    await pp.evaluate(()=>{
      const p=window.VintageBinder.getProgress();
      p.owned={'base1-1':true,'base1-2':true};
      p.pendingPurchase={'base1-3':{wasWish:true},'base1-4':{wasWish:true}};
      p.wish={};p.wishOrder=[];
      p.binderOrder=['base1-1','base1-2','__binder_empty__:reserved_keep'];
      window.VintageBinder.adoptProgress(p);
    });
    assert.deepEqual((await getState(pp)).binderOrder,
      ['base1-1','base1-2','__binder_empty__:reserved_keep'],
      'Never invent positions for older damaged purchases without a binder snapshot');
    // Explicit manual recovery must find pending cards even when the old bug
    // dropped their binder positions. Searching and selecting are READ-ONLY.
    await pp.locator('[data-view-btn="binder"]').click();
    await pp.locator('.binder-place > summary').click();
    const beforeSearch=await getState(pp);
    const writesBeforeSearch=await pp.evaluate(()=>window.__cloudTest.writes.length);
    await pp.locator('#binderFind').fill('base1-3');
    const missingOption=pp.locator('[data-pick-binder="base1-3"]');
    assert.equal(await missingOption.count(),1,'Orphaned purchased card must be searchable');
    assert.match(await missingOption.textContent(),/בדרך/);
    assert.match(await missingOption.textContent(),/לא בבינדר/);
    await missingOption.click();
    assert.match(await pp.locator('#binderPlaceSelected').textContent(),/הוסף למיקום/);
    assert.deepEqual((await getState(pp)).binderOrder,beforeSearch.binderOrder,
      'Searching/selecting cannot mutate binder order');
    assert.equal(await pp.evaluate(()=>window.__cloudTest.writes.length),writesBeforeSearch,
      'Searching/selecting cannot trigger Firestore writes');
    await pp.locator('#binderTargetPage').selectOption('1');
    await pp.locator('#binderTargetSlot').selectOption('2');
    await pp.locator('#binderPlaceSelected').click();
    const afterInsert=await getState(pp);
    assert.deepEqual(afterInsert.binderOrder,
      ['base1-1','base1-3','base1-2','__binder_empty__:reserved_keep'],
      'Explicit insertion must preserve relative order of existing cards');
    assert.equal(afterInsert.pendingPurchase['base1-3'].wasWish,true,
      'Manual reinsertion must not change purchase status');
    assert.equal(!!afterInsert.wish['base1-3'],false);
    assert.match(await pp.locator('[data-pick-binder="base1-3"]').textContent(),/בדרך/);
    assert.doesNotMatch(await pp.locator('[data-pick-binder="base1-3"]').textContent(),/לא בבינדר/);
    await pp.waitForFunction(()=>window.__cloudTest.docs['users/fixture-user']?.progress?.binderOrder?.[1]==='base1-3');

    // A separate pending card should fill an explicitly reserved gap without
    // shifting any of the other card positions.
    await pp.locator('#binderFind').fill('base1-4');
    await pp.locator('[data-pick-binder="base1-4"]').click();
    await pp.locator('#binderTargetPage').selectOption('1');
    await pp.locator('#binderTargetSlot').selectOption('4');
    await pp.locator('#binderPlaceSelected').click();
    const afterGap=await getState(pp);
    assert.deepEqual(afterGap.binderOrder,['base1-1','base1-3','base1-2','base1-4']);
    assert.deepEqual(afterGap.shipments,beforeSearch.shipments,
      'Manual binder restoration must not edit shipments');
    assert.deepEqual(afterGap.purchasePrices,beforeSearch.purchasePrices,
      'Manual binder restoration must not edit purchases');
    assert.equal(!!afterGap.pendingPurchase['base1-4'],true);
    await pp.waitForFunction(()=>window.__cloudTest.docs['users/fixture-user']?.progress?.binderOrder?.[3]==='base1-4');
    assert.deepEqual(purchaseErrors,[],'Purchase preservation introduced browser errors');
    console.log('PASS shipment lifecycle preserves binder order and Wishlist priorities; old missing positions are not fabricated');
  }finally{await purchaseFixture.context.close();}

  // Disaster-recovery workflow: historical REST reads and JSON previews are
  // read-only; only an explicit owner confirmation writes binderOrder. Always
  // preserve shipment and purchase fields from the CURRENT cloud document.
  const recoveryFixture=await openFixture();
  try{
    const {page:rp,errors:recoveryErrors}=recoveryFixture;
    const oldOrder=['base1-1','base1-3','__binder_empty__:saved_gap','base1-2'];
    const badOrder=['base1-1','__binder_empty__:saved_gap','base1-2'];
    await rp.evaluate(({badOrder,oldOrder})=>{
      const p=window.VintageBinder.getProgress();
      p.owned={'base1-1':true};p.wish={'base1-2':true};p.wishOrder=['base1-2'];
      p.pendingPurchase={'base1-3':{wasWish:true}};
      p.binderOrder=badOrder;p.binderExcluded={};
      p.shipments=[{id:'parcel_rescue01',number:'',title:'Paid cards',cardIds:['base1-3'],
        seenEventIds:[],initialized:false,createdAt:100,note:'keep this note'}];
      p.purchasePrices={'base1-3':{amount:31,currency:'EUR'}};
      window.VintageBinder.adoptProgress(p);
      const originalFetch=window.fetch.bind(window);
      window.__binderRecoveryReads=[];
      window.fetch=(input,init)=>{
        const url=String(input);
        if(url.includes('firestore.googleapis.com/v1/projects/')){
          window.__binderRecoveryReads.push({url,authorization:init?.headers?.authorization});
          const vals=oldOrder.map(value=>({stringValue:value}));
          return Promise.resolve({ok:true,json:async()=>({fields:{progress:{mapValue:{fields:{
            binderOrder:{arrayValue:{values:vals}}
          }}}}})});
        }
        return originalFetch(input,init);
      };
    },{badOrder,oldOrder});
    const initialWrites=await rp.evaluate(()=>window.__cloudTest.writes.length);
    await rp.locator('#accountTrigger').click();
    await rp.locator('#openBinderRecovery').click();
    assert.equal(await rp.locator('#binderRecoveryApply').isDisabled(),true);
    await rp.locator('#binderRecoveryScan').click();
    await rp.waitForFunction(()=>document.querySelector('#binderRecoveryVersions').options.length>=2 &&
      !document.querySelector('#binderRecoveryScan').disabled);
    assert.equal(await rp.evaluate(()=>window.__binderRecoveryReads.length),11);
    assert.equal(await rp.evaluate(()=>window.__binderRecoveryReads.every(x=>
      x.authorization==='Bearer fake-token'&&x.url.includes('readTime=')&&
      x.url.includes('mask.fieldPaths=progress.binderOrder'))),true);
    assert.equal(await rp.evaluate(()=>window.__cloudTest.writes.length),initialWrites,
      'Looking up historical binder snapshots must NEVER write to Firestore');
    assert.deepEqual((await getState(rp)).binderOrder,badOrder);
    // A manual extra read-only scan looks beyond the one-hour window ONLY if
    // historical PITR data is available; Firestore requires whole-minute reads.
    await rp.locator('#binderRecoveryOlder').click();
    await rp.waitForFunction(()=>!document.querySelector('#binderRecoveryOlder').disabled);
    const recoveryReads=await rp.evaluate(()=>window.__binderRecoveryReads);
    assert.ok(recoveryReads.length>=16,'Extended recovery did not request older snapshots');
    assert.ok(recoveryReads.slice(11).every(r=>{
      const t=new Date(new URL(r.url).searchParams.get('readTime'));
      return t.getUTCSeconds()===0&&t.getUTCMilliseconds()===0;
    }), 'Past-hour PITR readTime must be rounded to whole minutes');
    assert.equal(await rp.evaluate(()=>window.__cloudTest.writes.length),initialWrites,
      'Even extended historical searches must be read-only');
    await rp.locator('#binderRecoveryVersions').selectOption('0');
    assert.match(await rp.locator('#binderRecoveryPreview').textContent(),/מיקומים משתנים/);
    assert.match(await rp.locator('#binderRecoveryPreview').textContent(),/1 קלפים חסרים נמצאו/);
    assert.equal(await rp.locator('#binderRecoveryApply').isEnabled(),true);
    rp.on('dialog',dialog=>dialog.accept());
    const downloadPromise=rp.waitForEvent('download');
    await rp.locator('#binderRecoveryApply').click();
    const safetyBackup=await downloadPromise;
    const downloaded=JSON.parse(readFileSync(await safetyBackup.path(),'utf8'));
    assert.deepEqual(downloaded.binderOrder,badOrder,'Recovery must first back up the broken/current state');
    await rp.waitForFunction(()=>window.__cloudTest.docs['users/fixture-user']?.progress?.binderOrder?.[1]==='base1-3');
    const recovered=await getState(rp);
    assert.deepEqual(recovered.binderOrder,oldOrder,'Only the chosen historic binder order should be restored');
    assert.equal(recovered.owned['base1-1'],true);
    assert.equal(recovered.pendingPurchase['base1-3'].wasWish,true);
    assert.equal(recovered.wish['base1-2'],true);
    assert.deepEqual(recovered.purchasePrices['base1-3'],{amount:31,currency:'EUR'});
    assert.equal(recovered.shipments[0].note,'keep this note');
    assert.equal(recovered.shipments[0].cardIds[0],'base1-3');
    assert.deepEqual(recoveryErrors,[],'Historical recovery generated browser errors');
    console.log('PASS history-only binder restore, safety backup, explicit confirmation and purchase data preservation');
  }finally{await recoveryFixture.context.close();}

  // Page management and reserved pockets run against disposable in-memory Firestore.
  const binderFixture=await openFixture();
  try {
    const {page:bp}=binderFixture;
    await bp.evaluate(()=>{
      const progress=window.VintageBinder.getProgress();
      progress.owned=Object.fromEntries(Array.from({length:20},(_,i)=>['base1-'+(i+1),true]));
      progress.wish={};progress.wishOrder=[];progress.binderExcluded={};
      progress.binderOrder=Array.from({length:20},(_,i)=>'base1-'+(i+1));
      window.VintageBinder.adoptProgress(progress);
      document.querySelector('[data-view-btn="binder"]').click();
    });
    await bp.waitForFunction(()=>document.querySelector('#binderPageLabel').textContent.includes('1 מתוך 3'));
    await bp.locator('#binderMovePage').click();
    assert.match(await bp.locator('#binderMovePageCurrent').textContent(),/עמוד 1 מתוך 3/);
    await bp.locator('#binderMovePageSource').fill('3');
    await bp.locator('#binderMovePagePosition').fill('1');
    await bp.locator('#binderMovePageConfirm').click();
    await bp.waitForFunction(()=>document.querySelector('#binderPageLabel').textContent.includes('1 מתוך 3'));
    const moved=await getState(bp);
    assert.deepEqual(moved.binderOrder.slice(0,2),['base1-19','base1-20']);
    assert.equal(moved.binderOrder.slice(2,9).every(id=>id.startsWith('__binder_empty__:')),true);
    assert.equal(await bp.locator('#binderGrid .binder-pocket-reserved').count(),7);
    // The existing placement accordion can now select an empty pocket.
    await bp.locator('.binder-place > summary').click();
    // Search and empty-pocket action share a row without horizontal overflow on phones.
    for(const width of [390,320]){
      await bp.setViewportSize({width,height:844});
      const layout=await bp.evaluate(()=>{
        const row=document.querySelector('.binder-place-search-row').getBoundingClientRect();
        const input=document.querySelector('#binderFind').getBoundingClientRect();
        const button=document.querySelector('#binderSelectEmpty').getBoundingClientRect();
        return {sameLine:Math.abs(input.top-button.top)<2,
          fits:input.left>=row.left-1&&button.right<=row.right+1,
          usableInput:input.width>=100};
      });
      assert.deepEqual(layout,{sameLine:true,fits:true,usableInput:true},
        'Binder search and empty-pocket button should fit side by side at '+width+'px');
    }
    await bp.setViewportSize({width:390,height:844});
    await bp.locator('#binderSelectEmpty').click();
    assert.equal(await bp.locator('#binderSelectEmpty').getAttribute('aria-pressed'),'true');
    assert.equal(await bp.locator('#binderPlaceSelected').textContent(),'השאר כיס ריק');
    await bp.locator('#binderTargetPage').selectOption('1');
    await bp.locator('#binderTargetSlot').selectOption('2');
    await bp.locator('#binderPlaceSelected').click();
    const reserved=await getState(bp);
    assert.ok(reserved.binderOrder[1].startsWith('__binder_empty__:'));
    assert.equal(await bp.locator('#binderGrid .binder-pocket-reserved').count(),7);
    assert.equal(await bp.locator('#binderManagePockets').count(),0);
    assert.equal(await bp.locator('#binderPocketDialog').count(),0);

    // One tap on the empty pocket cancels it, without opening another editor.
    await bp.locator('#binderGrid [data-binder-clear-empty="1"]').click();
    assert.equal((await getState(bp)).binderOrder[1],'base1-20');
    assert.equal(await bp.locator('#binderGrid .binder-pocket-reserved').count(),7);

    // Normal card placement still works after selecting the empty-pocket mode.
    await bp.locator('#binderFind').fill('base1-20');
    await bp.locator('[data-pick-binder="base1-20"]').click();
    assert.equal(await bp.locator('#binderSelectEmpty').getAttribute('aria-pressed'),'false');
    assert.match(await bp.locator('#binderPlaceSelected').textContent(),/העבר למיקום/);
    await bp.waitForFunction(()=>window.__cloudTest.writes.length>0);
    await bp.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('נשמר בענן'));
    assert.equal((await bp.evaluate(path=>window.__cloudTest.docs[path].progress.binderOrder,savedDoc()))[0],'base1-19');
    assert.deepEqual(binderFixture.errors,[],'Binder dialogs must not throw browser errors');
    console.log('PASS mobile binder page moves, persistent empty pockets and mocked cloud sync');
  } finally {await binderFixture.context.close();}

  // Read failure: editing must be disabled; never silently fall back to cache.
  const failure=await openFixture({failInitialRead:true});
  try {
    assert.equal(await failure.page.evaluate(()=>window.VintageCloud.canEdit()),false);
    assert.deepEqual((await getState(failure.page)).owned,{});
    assert.equal(await failure.page.evaluate(()=>window.__cloudTest.writes.length),0);
    console.log('PASS cloud failure keeps editing locked and user data untouched');
  } finally { await failure.context.close(); }

  // The public ?share= reader must read only the shared sanitized document,
  // render ordered pockets, and allow paging without signing in.
  const shareId='12345678-1234-4234-8234-123456789abc';
  const publicCards=Array.from({length:11},(_,i)=>({
    id:'base1-'+(i+1),kind:i===0?'wish':'owned'
  }));
  const publicContext=await browser.newContext({
    viewport:{width:390,height:844},serviceWorkers:'block'
  });
  await publicContext.addInitScript(installFakeFirebase,{
    docs:{['sharedBinders/'+shareId]:{cards:publicCards,includeWish:true,updatedAt:42}},
    user:null
  });
  await publicContext.route('**/*',route=>route.request().url().startsWith(origin)
    ? route.continue() : route.abort());
  try {
    const reader=await publicContext.newPage();
    const readerErrors=[];
    reader.on('pageerror',error=>readerErrors.push(error.message));
    await reader.goto(origin+'/?share='+shareId,{waitUntil:'load'});
    await reader.waitForFunction(()=>document.querySelectorAll('#readerSpread img').length===9);
    const first=await reader.evaluate(()=>({
      enabled:document.body.classList.contains('reader-open'),
      count:document.querySelectorAll('#readerSpread .reader-pocket').length,
      wish:document.querySelectorAll('#readerSpread .reader-pocket.wish').length,
      footer:document.querySelector('#readerFooter').textContent,
      nextDisabled:document.querySelector('#readerNext').disabled
    }));
    assert.equal(first.enabled,true);
    assert.equal(first.count,9);
    assert.equal(first.wish,1);
    assert.equal(first.nextDisabled,false);
    await reader.locator('#readerNext').click();
    assert.match(await reader.locator('#readerFooter').textContent(),/2\s*\/\s*2/);
    assert.equal(await reader.locator('#readerSpread img').count(),2);
    assert.deepEqual(readerErrors,[]);

    await reader.goto(origin+'/?share=invalid',{waitUntil:'load'});
    await reader.waitForFunction(()=>!!document.querySelector('#readerSpread .reader-error'));
    assert.match(await reader.locator('#readerSpread .reader-error').textContent(),/אינו תקין/);
    console.log('PASS public read-only share viewer and invalid-link handling');
  } finally { await publicContext.close(); }
} finally {
  await browser.close();
  await new Promise(resolve=>app.close(resolve));
}
