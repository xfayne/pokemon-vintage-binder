/* eBay live results for the native Deals tab. Only trusts the configured Worker. */
(()=>{
 'use strict';
 const page=document.querySelector('#dealsPage .collection-panel');
 const bridge=()=>window.VintageDealBridge;
 if(!page || !page.querySelector('.collection-heading'))return;
 const DEFAULT_WORKER_URL='https://pokemon-vintage-ebay-deals.xfayne.workers.dev';
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>{if(!v || !Number.isFinite(Number(v.value)) || !/^[A-Z]{3}$/.test(String(v.currency)))return '—';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:v.currency,maximumFractionDigits:2}).format(Number(v.value));}catch(_){return String(v.value)+' '+String(v.currency)}};
 const state={endpoint:DEFAULT_WORKER_URL,status:'setup',error:'',items:[],searched:0,done:false,paused:false,loading:false,seen:new Set(),fetchedAt:null,errors:[],visibleCount:40,scanTotal:0,lastScanAt:0};
 const BATCH_SIZE=4;
 const BATCH_DELAY_MS=500;
 const SCAN_TTL_MS=30*60*1000;
 const PAGE_SIZE=40;
 let scanCards=[];
 let scanSerial=0;
 let activeRequest=null;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 // The public endpoint is fixed in code, not a per-device setup step.

 const ui=document.createElement('section');
 ui.className='live-auctions';
 ui.setAttribute('aria-label','מכרזים חיים מ־eBay');
 ui.innerHTML="<div class=\"live-title\"><span id=\"liveBadge\" class=\"live-badge\">בודק חיבור…</span></div>\n<div id=\"liveStatus\" class=\"live-status\" role=\"status\"></div>\n<div id=\"liveControls\" class=\"live-toolbar\" hidden>\n <button type=\"button\" id=\"liveReload\" class=\"btn primary\">↻ סרוק מחדש את כל הקלפים</button>\n <label for=\"dealGrade\">מצב להערכת מחיר <select id=\"dealGrade\"><option>NM</option><option>LP</option><option selected>MP</option><option>HP</option><option>DMG</option></select></label>\n <label for=\"liveSort\">מיון <select id=\"liveSort\"><option value=\"discount\">פער שמרני מול מחירון</option><option value=\"closing\">מסתיימים בקרוב</option><option value=\"bids\">מעט הצעות</option><option value=\"match\">התאמת קלף</option><option value=\"shipping\">משלוח: מהזול ליקר</option><option value=\"shippingDesc\">משלוח: מהיקר לזול</option></select></label>\n <label class=\"live-only-shipping\"><input type=\"checkbox\" id=\"liveOnlyShipping\"> רק משלוח ידוע</label>\n <label for=\"livePostal\" class=\"live-postal-label\">מיקוד למשלוח <input id=\"livePostal\" type=\"text\" inputmode=\"numeric\" autocomplete=\"postal-code\" maxlength=\"7\" placeholder=\"7 ספרות\" aria-label=\"מיקוד ישראלי לחישוב משלוח\"></label>\n</div>\n<div id=\"liveProgress\" class=\"live-progress\" hidden role=\"progressbar\" aria-label=\"התקדמות סריקת קלפי ה־Wishlist\" aria-valuemin=\"0\" aria-valuenow=\"0\" aria-valuemax=\"100\"><div class=\"live-progress-fill\" id=\"liveProgressFill\"></div></div>\n<div class=\"live-scan-actions\"><button type=\"button\" class=\"btn\" id=\"liveMore\" hidden>השהה סריקה</button></div>\n<div id=\"liveListings\" class=\"live-results\" role=\"list\"></div>\n<div class=\"live-more\"><button type=\"button\" class=\"btn\" id=\"liveShowMore\" hidden>הצג עוד מכרזים</button></div>\n<p class=\"live-disclaimer\" id=\"liveDisclaimer\" hidden>ההשוואה מבוססת על מצבי הקלף שסימנת, לא על בדיקת מצב המכרז. הסינון מסיר כותרות המזוהות כיפניות, אך אינו מאמת שפה מתמונות. מחירים ומכרזים עשויים להשתנות.</p>";

 const POSTAL_STORAGE_KEY='pokemon-ebay-delivery-postal';
 try{
  const hash=location.hash.replace(/^#/,'');
  const imported=hash.startsWith('deliveryPostal=')?new URLSearchParams(hash).get('deliveryPostal'):null;
  const stored=localStorage.getItem(POSTAL_STORAGE_KEY);
  const postal=/^[0-9]{7}$/.test(imported||'')?imported:stored;
  if(postal&&/^[0-9]{7}$/.test(postal)){
   ui.querySelector('#livePostal').value=postal;
   if(postal===imported){
    localStorage.setItem(POSTAL_STORAGE_KEY,postal);
    history.replaceState(null,'',location.pathname+location.search);
   }
  }
 }catch(_){}
 const GRADES=['NM','LP','MP','HP','DMG'];
 const selectedGrades=new Set(['LP','MP','HP']);
 const gradeSelector=document.createElement('div');
 gradeSelector.className='live-grade-filter';
 gradeSelector.setAttribute('role','group');
 gradeSelector.setAttribute('aria-label','מצבי קלף להשוואה');
 gradeSelector.innerHTML='<span class="live-grade-title">מצבים להשוואה</span><div class="live-grade-options">'+GRADES.map(g=>'<button type="button" class="live-grade-choice'+(selectedGrades.has(g)?' selected':'')+'" data-grade="'+g+'" aria-pressed="'+selectedGrades.has(g)+'">'+g+'</button>').join('')+'</div>';
 ui.querySelector('label[for="dealGrade"]').replaceWith(gradeSelector);
 const refreshGradeButtons=()=>gradeSelector.querySelectorAll('[data-grade]').forEach(btn=>{
  const active=selectedGrades.has(btn.dataset.grade);
  btn.classList.toggle('selected',active);
  btn.setAttribute('aria-pressed',String(active));
 });
 const japaneseTitle=title=>/[\u3040-\u30ff\u3400-\u9fff]/u.test(String(title||''))||/\b(?:japanese|japanisch\w*|jpn|jap|japonais\w*|japon[eé]s\w*|japan\s+(?:edition|version|print|language|import|card))\b/i.test(String(title||''));
 const usdMoney=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value):'—';
 page.querySelector('.collection-heading').after(ui);

 const list=()=>bridge()?.getWishlistCards?.()||[];
 const usd=(a)=>{if(!a||typeof a.value!=='number')return null;return window.VintageDealsDashboard?.convertToUSD?.(a.value,a.currency)??null};
 const marketFor=(c,grade)=>bridge()?.getMarketPrice?.(c.id,grade);
 const cardIndex=()=>new Map(list().map(c=>[c.id,c]));
 function evaluation(item,card){
  const current=usd(item.currentBid);
  const shipping=usd(item.shipping);
  const allIn=current!==null&&shipping!==null?current+shipping:null;
  // When shipping is unknown, a bid-only comparison is informative but cannot prove a deal.
  const comparable=allIn!==null?allIn:current;
  const provisional=allIn===null&&current!==null;
  const comparisons=GRADES.filter(g=>selectedGrades.has(g)).map(grade=>{
   const raw=card?marketFor(card,grade):null;
   const market=typeof raw==='number'&&Number.isFinite(raw)&&raw>0?raw:null;
   return {grade,market,discount:market!==null&&comparable!==null?(market-comparable)/market:null};
  });
  // Conservative sort: a listing must be inexpensive against EVERY selected, priced grade.
  const complete=comparisons.length>0&&comparisons.every(x=>x.discount!==null);
  const discount=complete&&!provisional?Math.min(...comparisons.map(x=>x.discount)):null;
  const warnings=Array.isArray(item.warnings)?item.warnings.slice():[];
  if(item.shipping===null)warnings.push('מחיר משלוח לישראל לא ידוע');
  if(item.matchConfidence<70)warnings.push('התאמת קלף לא ודאית');
  if(item.sellerFeedback!==null&&item.sellerFeedback<95)warnings.push('דירוג מוכר נמוך');
  return {allIn,comparisons,discount,warnings,provisional};
 }
 const timeLabel=d=>{
  const t=new Date(d||'').getTime();if(!Number.isFinite(t))return 'זמן סיום לא ידוע';
  const hours=Math.ceil((t-Date.now())/3600000);
  return hours<0?'מכרז הסתיים':hours===0?'מסתיים בקרוב':hours<=24?'נותרו '+hours+' שעות':'נותרו '+Math.ceil(hours/24)+' ימים';
 };
 function render(){
  const total=state.scanTotal||list().length;
  const badge=$('liveBadge');
  badge.textContent=state.status==='awaiting-keys'?'ממתין למפתחות eBay':state.status==='error'?'שגיאת חיבור':state.loading&&state.status==='ready'?'סורק מכרזים…':state.status==='ready'?'eBay · API':state.status==='loading'?'מתחבר…':'טרם חובר';
  badge.className='live-badge'+(state.status==='ready'?' ready':'');
  $('liveReload').disabled=state.loading||!state.endpoint||state.status==='awaiting-keys';
  $('liveMore').hidden=!(state.loading||state.paused&&!state.done);
  $('liveMore').textContent=state.loading?'השהה סריקה':'המשך סריקה';
  $('liveMore').disabled=false;
  $('liveControls').hidden=state.status!=='ready';
  $('liveDisclaimer').hidden=state.status!=='ready';
  const progress=$('liveProgress');
  progress.hidden=state.status!=='ready'||!total;
  const pct=total?Math.min(100,Math.round(state.searched/total*100)):0;
  progress.setAttribute('aria-valuenow',String(pct));
  progress.setAttribute('aria-valuetext',state.searched+' מתוך '+total+' קלפים');
  $('liveProgressFill').style.width=pct+'%';
  let status='';
  if(!state.endpoint)status='כדי לקבל מכרזים חיים צריך לחבר שרת eBay.';
  else if(state.status==='awaiting-keys')status='ממתינים לאישור והגדרת מפתחות eBay כדי להתחיל בסריקה.';
  else if(state.status==='error')status=state.error||'אי אפשר להתחבר ל־eBay';
  else if(state.status==='loading')status='מתחברים ל־eBay…';
  else if(state.loading)status='סורקים אוטומטית: '+state.searched+' מתוך '+total+' קלפים · נאספו '+state.items.length+' מכרזים'+(state.errors.length?' · '+state.errors.length+' שגיאות חלקיות':'');
  else if(state.paused)status=(state.error?state.error+' · ':'סריקה מושהית · ')+'נבדקו '+state.searched+' מתוך '+total+' קלפים. אפשר להמשיך מהמקום שבו נעצרנו.';
  else if(state.done)status='הסריקה הושלמה: '+state.searched+' מתוך '+total+' קלפים · נאספו '+state.items.length+' מכרזים'+(state.errors.length?' · '+state.errors.length+' שגיאות חלקיות':'')+(state.lastScanAt?' · עודכן: '+new Date(state.lastScanAt).toLocaleTimeString('he-IL'):'');
  else if(state.status==='ready')status='מחובר ל־eBay. פתיחת לשונית מציאות תתחיל סריקה אוטומטית.';
  else status='בודקים את החיבור ל־eBay…';
  if(state.status==='ready'&&!/^[0-9]{7}$/.test($('livePostal').value))status+=' · מומלץ להזין מיקוד לחישוב משלוח';
  $('liveStatus').textContent=status;
  const lookup=cardIndex(),sort=$('liveSort').value,shippingOnly=$('liveOnlyShipping').checked;
  const enriched=state.items.map(item=>{
   const card=lookup.get(item.cardId);
   return {item,card,score:evaluation(item,card)};
  }).filter(x=>!japaneseTitle(x.item.title)&&(!shippingOnly || x.item.shipping!==null));
  if(sort==='discount')enriched.sort((a,b)=>(b.score.discount??-999)-(a.score.discount??-999)||b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='closing')enriched.sort((a,b)=>(new Date(a.item.endTime).getTime()||Infinity)-(new Date(b.item.endTime).getTime()||Infinity));
  if(sort==='bids')enriched.sort((a,b)=>(a.item.bidCount??Infinity)-(b.item.bidCount??Infinity));
  if(sort==='match')enriched.sort((a,b)=>b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='shipping'||sort==='shippingDesc')enriched.sort((a,b)=>{
   const x=usd(a.item.shipping),y=usd(b.item.shipping);
   // Shipping without a reliable conversion is UNKNOWN; never treat it as zero.
   if(x===null)return y===null?0:1;
   if(y===null)return -1;
   return (sort==='shipping'?x-y:y-x)||b.item.matchConfidence-a.item.matchConfidence;
  });
  $('liveShowMore').hidden=enriched.length<=state.visibleCount;
  $('liveShowMore').textContent='הצג עוד מכרזים ('+Math.min(PAGE_SIZE,enriched.length-state.visibleCount)+' מתוך '+(enriched.length-state.visibleCount)+')';
  $('liveListings').innerHTML=enriched.length ? enriched.slice(0,state.visibleCount).map(({item,card,score})=>{
   const flag=score.discount!==null&&score.discount>=0.35&&item.matchConfidence>=70&&item.shipping!==null&&!/\b(damaged?|creased?|poor|heavy played)\b/i.test(item.title);
   const dt=Number.isFinite(new Date(item.endTime).getTime())?timeLabel(item.endTime):'זמן סיום לא ידוע';
   const amount=score.allIn===null?'—':'$'+score.allIn.toFixed(2);
   const name=card?card.name+' · '+card.setName:'קלף לא מזוהה';
   const image=item.image?'<img src="'+escape(item.image)+'" alt="" loading="lazy" decoding="async">':'<div class="live-no-image">✦</div>';
   const warnings=score.warnings.length?'<div class="live-flags">'+score.warnings.slice(0,3).map(x=>'<span>'+escape(x)+'</span>').join('')+'</div>':'';
   return '<article class="live-item" role="listitem"><div class="live-card-main">'+image+
     '<div class="live-card-text"><small>'+escape(name)+'</small><strong>'+escape(item.title)+'</strong>'+
     '<span>'+escape(item.marketplace)+' · '+(item.bidCount===null?'מספר הצעות לא זמין':item.bidCount+' הצעות')+' · '+escape(dt)+'</span>'+
     '<span>מוכר: '+escape(item.sellerName||'לא ידוע')+(item.sellerFeedback!==null?' · '+escape(item.sellerFeedback)+'% חיובי':'')+'</span></div>'+
     (flag?'<span class="live-candidate">מחיר נמוך*</span>':'')+'</div>'+
     '<div class="live-item-numbers"><span>הצעה נוכחית <b>'+escape(money(item.currentBid))+'</b></span>'+
     '<span>משלוח לישראל <b>'+escape(item.shipping?money(item.shipping):'לא ידוע')+'</b></span>'+
     '<span>כולל משלוח בדולר <b>'+amount+'</b></span></div>'+
     '<div class="live-pricebook"><div class="live-pricebook-heading">מחירון לפי מצב <small>'+(score.provisional?'השוואה להצעה הנוכחית בלבד · לפני משלוח':'לעומת המחיר כולל משלוח')+'</small></div>'+
     score.comparisons.map(row=>{
      const difference=row.discount===null?'לא ניתן לחשב':Math.abs(row.discount)<0.005?'כמו במחירון':score.provisional
       ?(row.discount>0?'מתחת למחירון ב־':'מעל למחירון ב־')+Math.round(Math.abs(row.discount)*100)+'%'+(row.discount<0?' לפחות':'*')
       :(row.discount>0?'זול ב־':'יקר ב־')+Math.round(Math.abs(row.discount)*100)+'%';
      const tone=row.discount===null?'unknown':row.discount>0.005?(score.provisional?'provisional':'cheaper'):row.discount< -0.005?'pricier':'equal';
      return '<div class="live-pricebook-row"><strong>'+row.grade+'</strong><span>מחירון: <b>'+usdMoney(row.market)+'</b></span><span class="live-pricebook-difference '+tone+'">'+difference+'</span></div>';
     }).join('')+(score.provisional?'<p class="live-pricebook-note">* משלוח לישראל לא ידוע. ההשוואה היא לפני משלוח, והמחיר עשוי לעלות במהלך המכרז.</p>':'')+'</div>'+warnings+
     '<div class="live-footer"><span>התאמת כותרת: '+Math.round(item.matchConfidence)+'% (לא אימות מקוריות)</span>'+
     '<a href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">למכרז ב־eBay ↗</a></div></article>';
  }).join('') : state.status==='ready'&&!state.loading?
   '<div class="live-empty">'+(state.done?'לא נמצאו מכרזים תואמים בקלפים שנבדקו. אפשר לנסות לסרוק מחדש.':state.paused?'לא נמצאו עדיין מכרזים תואמים. אפשר להמשיך את הסריקה.':'עדיין לא נמצאו מכרזים תואמים.')+'</div>':
   '';
 }

 async function connect(){
  if(!state.endpoint){state.status='setup';render();return false}
  state.status='loading';state.error='';render();
  try {
   const response=await fetch(state.endpoint+'/health',{cache:'no-store'});
   const json=await response.json();
   if(!response.ok)throw Error('שרת eBay לא זמין או מחזיר שגיאה.');
   if(!json.ready){state.status='awaiting-keys';state.error='';render();return false;}
   state.status='ready';state.error='';render();return true;
  }catch(error){state.status='error';state.error='אי אפשר להתחבר לשרת: '+String(error.message||error);render();return false}
 }
 function pauseScan(){
  if(!state.loading)return;
  scanSerial++;
  activeRequest?.abort();
  activeRequest=null;
  state.loading=false;
  state.paused=true;
  render();
 }
 async function scanAll(reset=false){
  if(state.loading||state.status!=='ready'||!state.endpoint)return;
  if(reset||!scanCards.length){
   scanCards=list().slice();
   state.scanTotal=scanCards.length;
   state.items=[];
   state.seen=new Set();
   state.searched=0;
   state.done=false;
   state.paused=false;
   state.errors=[];
   state.error='';
   state.fetchedAt=null;
   state.lastScanAt=0;
   state.visibleCount=PAGE_SIZE;
  }
  if(!scanCards.length){
   state.done=true;
   state.paused=false;
   state.lastScanAt=Date.now();
   render();
   return;
  }
  const serial=++scanSerial;
  state.loading=true;
  state.paused=false;
  state.error='';
  render();
  try{
   while(serial===scanSerial&&state.searched<scanCards.length){
    const selected=scanCards.slice(state.searched,state.searched+BATCH_SIZE);
    const postalCode=$('livePostal').value.trim();
    const controller=new AbortController();
    activeRequest=controller;
    let data;
    try{
     const response=await fetch(state.endpoint+'/api/search',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({cards:selected.map(c=>({id:c.id,name:c.name,setName:c.setName,number:c.number,firstEdition:c.firstEdition})),...(postalCode?{postalCode}:{})}),
      signal:controller.signal
     });
     data=await response.json();
     if(!response.ok)throw Error(data.error||'eBay returned HTTP '+response.status);
     if(!Array.isArray(data.items))throw Error('שרת eBay החזיר נתונים לא תקינים.');
    }finally{
     if(activeRequest===controller)activeRequest=null;
    }
    if(serial!==scanSerial)return;
    for(const item of data.items){
     if(!item||typeof item.itemId!=='string'||typeof item.url!=='string')continue;
     const key=item.itemId||item.url;
     if(state.seen.has(key))continue;
     state.seen.add(key);
     state.items.push(item);
    }
    state.searched+=selected.length;
    state.fetchedAt=data.fetchedAt||new Date().toISOString();
    if(Array.isArray(data.errors))state.errors.push(...data.errors);
    render();
    // Stop on throttling rather than exhausting the eBay application quota.
    if(Array.isArray(data.errors)&&data.errors.some(x=>/\b(?:429|rate.limit|quota.exceeded)\b/i.test(String(x.error||'')))){
     state.error='eBay הגבילה זמנית את קצב הבקשות';
     state.paused=true;
     break;
    }
    if(state.searched<scanCards.length)await delay(BATCH_DELAY_MS);
   }
  }catch(e){
   if(serial!==scanSerial)return;
   state.error='הסריקה נעצרה: '+String(e.message||e);
   state.paused=true;
  }finally{
   if(serial===scanSerial){
    state.loading=false;
    activeRequest=null;
    if(state.searched>=scanCards.length){
     state.done=true;
     state.paused=false;
     state.lastScanAt=Date.now();
    }else if(!state.done)state.paused=true;
    render();
   }
  }
 }

 $('liveReload').addEventListener('click',()=>scanAll(true));
 $('liveMore').addEventListener('click',()=>state.loading?pauseScan():scanAll(false));
 $('liveShowMore').addEventListener('click',()=>{state.visibleCount+=PAGE_SIZE;render()});
 $('liveSort').addEventListener('change',()=>{state.visibleCount=PAGE_SIZE;render()});
 $('liveOnlyShipping').addEventListener('change',()=>{state.visibleCount=PAGE_SIZE;render()});
 $('livePostal').addEventListener('change',()=>{
  const value=$('livePostal').value.trim();
  if(value&&!/^[0-9]{7}$/.test(value)){state.error='נא להזין מיקוד ישראלי בן 7 ספרות';state.paused=true;render();return}
  try{if(value)localStorage.setItem(POSTAL_STORAGE_KEY,value);else localStorage.removeItem(POSTAL_STORAGE_KEY)}catch(_){}
  if(state.loading)pauseScan();
  if(state.status==='ready')scanAll(true);
 });
 gradeSelector.addEventListener('click',e=>{
  const button=e.target.closest('button[data-grade]');
  if(!button||!gradeSelector.contains(button))return;
  const grade=button.dataset.grade;
  if(selectedGrades.has(grade)){if(selectedGrades.size===1)return;selectedGrades.delete(grade)}
  else selectedGrades.add(grade);
  refreshGradeButtons();
  render();
 });
 window.VintageEbayLive={
  open:async()=>{
   if(state.loading)return;
   if(!state.endpoint){render();return}
   if(state.status!=='ready'){if(!await connect())return}
   if(state.paused){render();return}
   const currentCards=list();
   const wishlistChanged=currentCards.length!==scanCards.length||currentCards.some((card,i)=>card.id!==scanCards[i]?.id||card.firstEdition!==scanCards[i]?.firstEdition);
   if(wishlistChanged||!state.done||!state.lastScanAt||Date.now()-state.lastScanAt>SCAN_TTL_MS)await scanAll(true);
   else render();
  },
  refreshCards:()=>{if(state.items.length||state.loading||state.done)render()}
 };
 render();
 if(state.endpoint)connect();
})();