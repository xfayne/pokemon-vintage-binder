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
    for(const key of ['owned','wish','conditions','notes','purchasePrices','firstEdition',
      'ownedAddedAt','shipments','binderOrder','wishOrder','binderIncludeWish']) {
      assert.deepEqual(restored[key],beforeImport[key],'Backup roundtrip lost '+key);
    }
    await page.waitForFunction(()=>window.__cloudTest.writes.length===3);

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
    console.log('PASS cloud persistence, remote revisions, retry, backup/CSV/legacy import and re-login');
  } finally { await context.close(); }

  // Read failure: editing must be disabled; never silently fall back to cache.
  const failure=await openFixture({failInitialRead:true});
  try {
    assert.equal(await failure.page.evaluate(()=>window.VintageCloud.canEdit()),false);
    assert.deepEqual((await getState(failure.page)).owned,{});
    assert.equal(await failure.page.evaluate(()=>window.__cloudTest.writes.length),0);
    console.log('PASS cloud failure keeps editing locked and user data untouched');
  } finally { await failure.context.close(); }
} finally {
  await browser.close();
  await new Promise(resolve=>app.close(resolve));
}
