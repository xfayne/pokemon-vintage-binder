
// Cloud-only catalog progress. The browser never stores or restores card progress.
// Legacy browser data is only deleted after the cloud collection loads successfully.
const $ = id => document.getElementById(id);
const status=$('cloudStatus'),detail=$('cloudDetail'),message=$('cloudMessage'),dialog=$('cloudDialog');
const bridge=()=>window.VintageBinder;
let sdk=null,app=null,auth=null,db=null,user=null,docRef=null,stopListening=null,stopAuth=null;
let ready=false,pending=false,writing=false,changeSeq=0,flushTimer=null,session=0,lastServerUpdate=0,serverRevision=0,lastWrittenRevision=0;
let shareId=null,shareEnabled=false,shareIncludeWish=false,shareLoaded=false,shareWriting=Promise.resolve(),shareUpdateFailed=false;
// One-button sharing: on a direct tap, open a new browser tab before awaiting Firebase.
function shareSettingsRef(){return user?sdk.doc(db,'users',user.uid,'sharing','settings'):null;}
function newShareId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function shareLink(){return shareId?location.origin+location.pathname+'?share='+encodeURIComponent(shareId):'';}
function renderShare(){const b=$('openReader');if(b){b.disabled=!(user&&ready&&shareLoaded);b.title=b.disabled?'יש להתחבר לחשבון Google ולהמתין לטעינת האוסף':'פתח בלשונית חדשה, עם כתובת שאפשר לשלוח לחברים';}}
function shareSnapshot(){const p=bridge()?.getProgress?.()||{};const order=Array.isArray(p.binderOrder)?p.binderOrder:[];const cards=order.map(id=>p.owned?.[id]?{id,kind:'owned'}:(shareIncludeWish&&p.wish?.[id])?{id,kind:'wish'}:null);
 return {ownerUid:user.uid,cards:cards.slice(0,1252),includeWish:shareIncludeWish,updatedAt:sdk.serverTimestamp()};}
function queueSharePublish(){
 if(!shareEnabled||!shareId||!user||!ready||!shareLoaded)return Promise.resolve();
 const currentId=shareId,uid=user.uid;
 shareWriting=shareWriting.catch(()=>{}).then(async()=>{
  if(!shareEnabled||shareId!==currentId||user?.uid!==uid)return;
  shareIncludeWish=bridge()?.getProgress?.()?.binderIncludeWish!==false;
  await sdk.setDoc(sdk.doc(db,'sharedBinders',currentId),shareSnapshot());
  shareUpdateFailed=false;renderShare();
 }).catch(e=>{shareUpdateFailed=true;renderShare();console.error('Public binder update failed',e);});
 return shareWriting;
}
async function loadSharing(token){
 shareLoaded=false;shareId=null;shareEnabled=false;shareIncludeWish=false;shareUpdateFailed=false;renderShare();
 try{const s=await sdk.getDocFromServer(shareSettingsRef());if(token!==session)return;
  const d=s.exists()?s.data():{};shareId=typeof d.shareId==='string'?d.shareId:null;shareEnabled=!!(d.enabled&&shareId);shareIncludeWish=d.includeWish===true;
 }catch(e){if(token!==session)return;shareUpdateFailed=true;console.warn('Unable to read sharing settings',e);}
 shareLoaded=true;renderShare();
}
function showOpeningTab(tab,msg){if(!tab||tab.closed)return;try{tab.document.title='Pokémon Binder';tab.document.documentElement.setAttribute('dir','rtl');tab.document.body.style='background:#101a2d;color:#ecf2fa;font-family:system-ui;text-align:center;padding:20vh 20px';tab.document.body.textContent=msg;}catch(_){}}
async function openPublicBinder(){
 if(!user||!ready||!shareLoaded){say('התחבר ל־Google והמתן עד שהאוסף נטען מהענן.');return;}
 // This must be called synchronously from the user interaction; Safari blocks async window.open.
 const tab=window.open('about:blank','_blank');
 if(!tab){say('הדפדפן חסם חלון חדש. אפשר פתיחת חלונות קופצים ב־Safari ונסה שוב.');return;}
 showOpeningTab(tab,'מכין את הבינדר לצפייה…');
 const button=$('openReader');button.disabled=true;
 const oldId=shareId,wasEnabled=shareEnabled;
 try{
  // Keep the visible 3x3 ordering; share only card IDs and pocket kinds, never private notes.
  shareIncludeWish=bridge()?.getProgress?.()?.binderIncludeWish!==false;
  if(!shareEnabled){shareId=newShareId();shareEnabled=true;}
  await queueSharePublish();
  if(shareUpdateFailed)throw Error('שמירת הבינדר הציבורי נכשלה. בדוק את כללי Firestore.');
  await sdk.setDoc(shareSettingsRef(),{shareId,enabled:true,includeWish:shareIncludeWish});
  if(tab.closed){say('קישור התצוגה הוכן, אבל הלשונית נסגרה. אפשר ללחוץ שוב.');return;}
  tab.location.replace(shareLink());
 }catch(e){
  if(!wasEnabled&&shareId!==oldId){const failedId=shareId;shareEnabled=false;shareId=oldId;try{await sdk.deleteDoc(sdk.doc(db,'sharedBinders',failedId));}catch(_){}}
  showOpeningTab(tab,'לא הצלחנו לפתוח את הבינדר. חזור ללשונית המקורית ונסה שוב.');
  say('⚠️ '+(e.code==='permission-denied'?'צריך לאשר קריאה ציבורית של sharedBinders בכללי Firestore.':e.message||e));
 }finally{renderShare();}
}
$('openReader').addEventListener('click',openPublicBinder);
const legacyPrefix='pokemon-vintage-binder-progress-v1';
const oldKeys=['pokemon-vintage-binder-cards-v1'];
function setStatus(a,b){status.textContent=a;detail.textContent=b||'';}
function say(m){message.textContent=m||'';}
function cleanOld(){try{const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&(k.startsWith(legacyPrefix)||k.startsWith('vintage-binder-firebase-')||oldKeys.includes(k)))keys.push(k);}for(const k of keys)localStorage.removeItem(k);}catch(e){console.warn('Could not purge old collection cache',e);}}
function clean(p){const out={};for(const k of ['owned','wish','removedWish','conditions','notes','purchasePrices','firstEdition','ownedAddedAt','binderExcluded']){const v=p?.[k];out[k]=v&&typeof v==='object'&&!Array.isArray(v)?{...v}:{}}for(const k of ['binderOrder','wishOrder'])out[k]=Array.isArray(p?.[k])?[...new Set(p[k].filter(v=>typeof v==='string'))]:[];out.binderIncludeWish=typeof p?.binderIncludeWish==='boolean'?p.binderIncludeWish:true;for(const id of Object.keys(out.removedWish))delete out.wish[id];for(const id of Object.keys(out.owned))if(out.owned[id])delete out.wish[id];out.wishOrder=out.wishOrder.filter(id=>!!out.wish[id]&&!out.removedWish[id]);out.shipments=Array.isArray(p?.shipments)?p.shipments.map(x=>({id:String(x.id||''),number:String(x.number||''),title:String(x.title||''),carrier:Number(x.carrier)||0,cardIds:Array.isArray(x.cardIds)?x.cardIds.filter(y=>typeof y==='string').slice(0,60):[],seenEventIds:Array.isArray(x.seenEventIds)?x.seenEventIds.filter(y=>typeof y==='string').slice(0,200):[],initialized:x.initialized===true,createdAt:Number(x.createdAt)||0})).filter(x=>/^[A-Z0-9-]{5,50}$/.test(x.number)&&/^[a-z0-9_-]{8,70}$/i.test(x.id)).slice(0,80):[];return out;}
function authError(e){switch(e?.code){case 'auth/unauthorized-domain':return 'צריך לאשר את '+location.hostname+' תחת Firebase Authentication → Settings → Authorized domains.';case 'auth/popup-blocked':return 'הדפדפן חסם את החלון. הפעל חלונות קופצים ב־Safari ונסה שוב.';case 'auth/popup-closed-by-user':return 'חלון ההתחברות נסגר לפני שהתחברת.';case 'permission-denied':return 'Firestore חסם את הגישה. בדוק את Security Rules תחת users/{uid}.';}return e?.message||String(e);}
function resetSession(){updateAccount(null);shareEnabled=false;shareId=null;shareLoaded=false;shareIncludeWish=false;shareUpdateFailed=false;renderShare();session++;if(stopListening){stopListening();stopListening=null;}clearTimeout(flushTimer);flushTimer=null;user=null;docRef=null;ready=false;pending=false;writing=false;changeSeq=0;lastServerUpdate=0;serverRevision=0;lastWrittenRevision=0;}
async function loadSdk(){if(sdk)return sdk;const ver='13.1.0';const [a,b,c]=await Promise.all([import('https://www.gstatic.com/firebasejs/'+ver+'/firebase-app.js'),import('https://www.gstatic.com/firebasejs/'+ver+'/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/'+ver+'/firebase-firestore.js')]);sdk={...a,...b,...c};return sdk;}
function stampOf(s){const t=s.data()?.updatedAt;return t&&typeof t.toMillis==='function'?t.toMillis():0;}
function acceptServer(s,token){
 if(token!==session||!ready||pending||writing||!s.exists()||s.metadata?.hasPendingWrites||s.metadata?.fromCache)return;
 const revision=Number(s.data()?.revision)||0;if(revision<lastWrittenRevision||revision<serverRevision)return;
 const stamp=stampOf(s);if(stamp&&stamp<lastServerUpdate)return;
 serverRevision=Math.max(serverRevision,revision);lastServerUpdate=Math.max(lastServerUpdate,stamp);
 const remote=clean(s.data()?.progress);
 // Ignore our own remote echoes. This also prevents re-running normalization unnecessarily.
 if(JSON.stringify(remote)!==JSON.stringify(bridge().getProgress()))bridge()?.adoptProgress(remote);
 setStatus('☁️ מסונכרן',user?.email||'Google');
}
async function flush(){
 if(!user||!ready||!docRef||writing)return;
 clearTimeout(flushTimer);flushTimer=null;
 const token=session,seen=changeSeq,owner=user;
 writing=true;setStatus('☁️ שומר בענן…',owner.email||'Google');
 try{
  // Only replace the progress field of this user's document, never merge old wishlist entries.
  const progress=clean(bridge().getProgress());
  const revision=Math.max(serverRevision,lastWrittenRevision)+1;
  await sdk.setDoc(docRef,{progress,revision,updatedAt:sdk.serverTimestamp(),clientTimestamp:Date.now()});
  if(token!==session)return;
  lastWrittenRevision=revision;serverRevision=Math.max(serverRevision,revision);
  // Publish only sanitized visible pocket references; never publish private notes/conditions.
  if(shareEnabled)queueSharePublish();
  if(seen===changeSeq){pending=false;setStatus('☁️ נשמר בענן',owner.email||'Google');say('השינויים נשמרו ב־Firestore.');}
 }catch(e){if(token!==session)return;pending=true;setStatus('⚠️ השמירה בענן נכשלה','אין גיבוי אוטומטי בדפדפן. נסה שוב לפני סגירת העמוד.');say(authError(e));}
 finally{if(token===session){writing=false;if(seen!==changeSeq)flushTimer=setTimeout(flush,200);}}
}
async function activate(u){
 resetSession();const token=session;user=u;updateAccount(u);
 $('cloudSignIn').hidden=true;$('cloudSignOut').hidden=false;
 setStatus('☁️ טוען מהענן…',u.email||'Google');
 try{
  docRef=sdk.doc(db,'users',u.uid);
  // Explicit server read; old browser data never overwrites an existing cloud document.
  const snap=await sdk.getDocFromServer(docRef);
  if(token!==session)return;
  if(snap.exists()){
   bridge()?.adoptProgress(clean(snap.data().progress));lastServerUpdate=stampOf(snap);
   serverRevision=Number(snap.data()?.revision)||0;lastWrittenRevision=serverRevision;
  }else{
   bridge()?.adoptProgress(clean({}));
  }
  // We never restore from browser storage; purge only this application's old keys.
  cleanOld();
  ready=true;$('cloudSyncNow').hidden=false;window.VintageBinder?.refreshShipments?.();
  loadSharing(token);
  setStatus('☁️ מחובר ל־'+(u.email||'Google'),'השינויים נשמרים ב־Firestore בלבד.');
  say('מחובר. Firestore הוא מקור הנתונים היחיד.');
  if(token!==session)return;
  stopListening=sdk.onSnapshot(docRef,s=>acceptServer(s,token),e=>{setStatus('⚠️ בעיית סנכרון',authError(e));say(authError(e));});
 }catch(e){if(token!==session)return;ready=false;bridge()?.adoptProgress({});setStatus('⚠️ לא ניתן לטעון את האוסף','העריכה נעולה עד שנצליח לקרוא את הנתונים בענן.');say(authError(e));}
}
async function init(config){
 setStatus('מכין חיבור ל־Firebase…','השמירה בדפדפן מבוטלת.');
 try{
  const f=await loadSdk();
  app=f.getApps().find(x=>x.name==='vintage-binder')||f.initializeApp(config,'vintage-binder');
  auth=f.getAuth(app);db=f.getFirestore(app);
  $('cloudSignIn').disabled=false;
  stopAuth=f.onAuthStateChanged(auth,u=>{
   if(!u){resetSession();bridge()?.adoptProgress({});$('cloudSignIn').hidden=false;$('cloudSignOut').hidden=true;$('cloudSyncNow').hidden=true;setStatus('🔐 התחבר כדי לשמור','ללא התחברות אפשר לעיין, אבל לא לשנות את האוסף.');say('התחבר עם Google כדי לטעון את האוסף מ־Firestore.');return;}
   activate(u);
  },e=>{setStatus('בעיה בהתחברות',authError(e));say(authError(e));});
 }catch(e){setStatus('⚠️ Firebase אינו זמין', 'לא נשמר מידע בדפדפן.');say(authError(e));}
}
// AI condition cache deliberately lives in a separate per-user subcollection,
// never in the progress document (which is replaced by the collection sync bridge).
const CONDITION_ANALYSIS_TTL_MS=10*24*60*60*1000;
function isConditionAnalysisFresh(record){
 if(!record)return false;
 const expiration=record.expiresAt instanceof Date
  ? record.expiresAt.getTime()
  : record.expiresAt?.toMillis?.()
    ?? ((record.analyzedAt?.toMillis?.()??record.clientAnalyzedAt)+CONDITION_ANALYSIS_TTL_MS);
 return Number.isFinite(expiration)&&expiration>Date.now();
}
function conditionAnalysisKey(source){
 if(source?.type==='ebay-listing'&&/^EBAY_(US|GB|DE)$/.test(source.marketplace)&&
    /^v\d\|\d{3,20}\|\d{1,6}$/.test(source.itemId))
  return 'ebay-listing__'+source.marketplace+'__'+source.itemId.replace(/\|/g,'_');
 return null; // owned-card adapters get their own stable namespaced key later.
}
function conditionRef(source){
 const key=conditionAnalysisKey(source);
 if(!user||!ready||!db||!sdk||!key)throw Error('יש להתחבר כדי לשמור ניתוח מצב.');
 return sdk.doc(db,'users',user.uid,'conditionAnalyses',key);
}
async function getConditionAnalysis(source){
 const ref=conditionRef(source);
 const uid=user.uid;
 const snapshot=await sdk.getDocFromServer(ref);
 if(uid!==user?.uid||!ready)throw Error('SESSION_CHANGED');
 const record=snapshot.exists()?snapshot.data():null;
 return isConditionAnalysisFresh(record)?record:null;
}
async function saveConditionAnalysis(source,analysis,photoIndices){
 const ref=conditionRef(source),uid=user.uid;
 if(!analysis||!['NM','LP','MP','HP','DMG'].includes(analysis.grade))throw Error('INVALID_CONDITION_ANALYSIS');
 const current=await sdk.getDocFromServer(ref);
 if(uid!==user?.uid||!ready)throw Error('SESSION_CHANGED');
 // Preserve a newer record if another tab has already analyzed this listing.
 const existing=current.exists()?current.data():null;
 const now=Date.now();
 if(isConditionAnalysisFresh(existing)&&existing.analyzedAt?.toMillis?.()>now-15000)
  return existing;
 const documentData={schemaVersion:1,source:{...source},analysis,photoIndices:Array.isArray(photoIndices)?photoIndices.slice(0,8):[],
  imageCount:Number(analysis.imageCount)||0,analyzedAt:sdk.serverTimestamp(),clientAnalyzedAt:now,
  expiresAt:new Date(now+CONDITION_ANALYSIS_TTL_MS)};
 await sdk.setDoc(ref,documentData);
 if(uid!==user?.uid||!ready)throw Error('SESSION_CHANGED');
 return documentData;
}
window.VintageCloud={getConditionAnalysis,saveConditionAnalysis,isConditionAnalysisFresh,conditionAnalysisKey,getUserUid:()=>user&&ready?user.uid:null,canEdit:()=>Boolean(user&&ready),getIdToken:async()=>user&&ready?await sdk.getIdToken(user):null,onChange:({immediate=false}={})=>{
 if(!user||!ready)return;
 changeSeq++;pending=true;setStatus('☁️ ממתין לשמירה…',user.email||'Google');
 clearTimeout(flushTimer);flushTimer=setTimeout(flush,immediate?0:350);
}};
const accountTrigger=$('accountTrigger'),accountMenu=$('accountMenu');
function hideAccountMenu(){accountMenu.hidden=true;accountTrigger.setAttribute('aria-expanded','false');}
function updateAccount(currentUser){
 const label=currentUser?(currentUser.displayName?.trim().split(/\s+/)[0]||currentUser.email?.split('@')[0]||'החשבון שלי'):'התחברות';
 $('accountName').textContent=label;
 $('accountAvatar').textContent=currentUser?(label.charAt(0).toUpperCase()||'✓'):'👤';
 accountTrigger.setAttribute('aria-label',currentUser?'תפריט חשבון '+(currentUser.email||''):'התחברות ל־Google');
 hideAccountMenu();
}
accountTrigger.onclick=()=>{
 if(!user){if(!dialog.open)dialog.showModal();return;}
 accountMenu.hidden=!accountMenu.hidden;
 accountTrigger.setAttribute('aria-expanded',String(!accountMenu.hidden));
};
$('accountSignOut').onclick=()=>{hideAccountMenu();$('cloudSignOut').click();};
for(const id of ['exportJSON','importJSON'])$(id).addEventListener('click',hideAccountMenu);
document.addEventListener('click',e=>{if(!e.target.closest('.account-area'))hideAccountMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideAccountMenu();});
updateAccount(null);
$('cloudClose').onclick=()=>dialog.close();
dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
$('cloudSignIn').onclick=()=>{if(!auth||!sdk){say('ספריות Firebase נטענות, נסה שוב.');return;}
 say('פותח כניסה עם Google…');sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider()).catch(e=>say(authError(e)));
};
$('cloudSignOut').onclick=async()=>{
 if(!auth)return;
 if(pending&&!confirm('יש שינויים שעדיין לא נשמרו ב־Firestore. הם יאבדו אם תתנתק כעת. להמשיך?'))return;
 try{await sdk.signOut(auth);}catch(e){say(authError(e));}
};
$('cloudSyncNow').onclick=async()=>{
 if(!user||!ready){dialog.showModal();return;}
 if(pending){flush();return;}
 const token=session;
 try{setStatus('☁️ בודק שינויים בענן…',user.email||'Google');const snap=await sdk.getDocFromServer(docRef);if(token!==session)return;acceptServer(snap,token);}catch(e){setStatus('⚠️ בעיית קריאה מהענן',authError(e));say(authError(e));}
};
window.addEventListener('online',()=>{if(user&&ready&&pending)flush();});
window.addEventListener('beforeunload',e=>{if(pending){e.preventDefault();e.returnValue='';}});
const firebaseConfig={
 apiKey:'AIzaSyAufn6rTzTrhICopUgEvOEA6JSiWD0EOxU',
 authDomain:'pokemon-vintage-binder.firebaseapp.com',
 projectId:'pokemon-vintage-binder',
 storageBucket:'pokemon-vintage-binder.firebasestorage.app',
 messagingSenderId:'670754232923',
 appId:'1:670754232923:web:b8953a0dfa910b0d1d3d7e',
 measurementId:'G-46CH42QVRX'
};

// Read the public link directly from the URL. The reader previously omitted
// its shareId getter, leaving the loading screen stuck indefinitely.
const publicShareId=new URLSearchParams(window.location.search).get('share');
if(publicShareId){
 (async()=>{
  if(!/^[a-f0-9-]{36}$/i.test(publicShareId)){window.VintageReader.error('קישור השיתוף אינו תקין.');return;}
  try{
   const f=await loadSdk();const a=f.getApps().find(x=>x.name==='vintage-binder')||f.initializeApp(firebaseConfig,'vintage-binder');
   const firestore=f.getFirestore(a);
   const result=await f.getDocFromServer(f.doc(firestore,'sharedBinders',publicShareId));
   if(!result.exists()){window.VintageReader.error('הבינדר אינו משותף כרגע, או שהקישור בוטל.');return;}
   const data=result.data();window.VintageReader.show(data.cards||[],{public:true});
  }catch(err){const reason=err?.code==='permission-denied'?'אין הרשאה לקרוא את הבינדר המשותף. צריך לפרסם את כללי השיתוף ב-Firestore.':err?.code==='unavailable'?'אין כרגע חיבור ל-Firestore. בדוק אינטרנט ונסה שוב.':'לא הצלחנו לטעון את הבינדר. נסה לרענן את הדף.';window.VintageReader.error(reason);console.error('Public binder load error',err);}
 })();
}else{init(firebaseConfig);}


