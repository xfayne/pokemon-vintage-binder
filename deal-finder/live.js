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
 const state={endpoint:DEFAULT_WORKER_URL,status:'setup',error:'',items:[],searched:0,done:false,paused:false,loading:false,seen:new Set(),fetchedAt:null,errors:[],visibleCount:40,scanTotal:0,lastScanAt:0,gradeOverrides:new Map(),conditionDetails:new Map(),conditionLoading:new Set(),lastRenderedOrder:[],preserveGradeOrder:false};
 const BATCH_SIZE=4;
 const BATCH_DELAY_MS=500;
 const SCAN_TTL_MS=30*60*1000;
 const PAGE_SIZE=40;
 let scanCards=[];
 let scanSerial=0;
 let activeRequest=null;
 let conditionEnrichmentRunning=false;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 // The public endpoint is fixed in code, not a per-device setup step.

 const ui=document.createElement('section');
 ui.className='live-auctions';
 ui.setAttribute('aria-label','מכרזים חיים מ־eBay');
 ui.innerHTML="<div class=\"live-title\"><span id=\"liveBadge\" class=\"live-badge\">בודק חיבור…</span></div>\n<div id=\"liveStatus\" class=\"live-status\" role=\"status\"></div>\n<div id=\"liveControls\" class=\"live-toolbar\" hidden>\n <button type=\"button\" id=\"liveReload\" class=\"btn primary\">↻ סרוק מחדש את כל הקלפים</button>\n <label for=\"liveType\">סוג מודעה <select id=\"liveType\"><option value=\"all\">הכול</option><option value=\"AUCTION\">מכרזים</option><option value=\"FIXED_PRICE\">Buy It Now</option></select></label>\n <label for=\"liveSort\">מיון <select id=\"liveSort\"><option value=\"recommended\">הזדמנויות מומלצות</option><option value=\"discount\">פער מול מחירון</option><option value=\"closing\">מסתיימים בקרוב</option><option value=\"bids\">מעט הצעות</option><option value=\"match\">התאמת קלף</option><option value=\"shipping\">משלוח: מהזול ליקר</option><option value=\"shippingDesc\">משלוח: מהיקר לזול</option></select></label>\n <label class=\"live-only-shipping\"><input type=\"checkbox\" id=\"liveOnlyShipping\"> רק משלוח ידוע</label>\n <label for=\"livePostal\" class=\"live-postal-label\">מיקוד למשלוח <input id=\"livePostal\" type=\"text\" inputmode=\"numeric\" autocomplete=\"postal-code\" maxlength=\"7\" placeholder=\"7 ספרות\" aria-label=\"מיקוד ישראלי לחישוב משלוח\"></label>\n</div>\n<details id=\"liveAdvanced\" class=\"live-advanced\"><summary>⚙ סינון מתקדם <span id=\"liveFilterCount\"></span></summary><div class=\"live-filter-grid\">\n<label>מכרז מסתיים בתוך<select id=\"liveEndLimit\"><option value=\"all\">ללא הגבלה</option><option value=\"1\">שעה</option><option value=\"6\">6 שעות</option><option value=\"24\">24 שעות</option><option value=\"72\">3 ימים</option><option value=\"168\">7 ימים</option></select></label>\n<label>משלוח מקסימלי<select id=\"liveShipMax\"><option value=\"all\">ללא הגבלה</option><option value=\"0\">$0 — חינם</option><option value=\"5\">$5</option><option value=\"10\">$10</option><option value=\"15\">$15</option><option value=\"25\">$25</option><option value=\"50\">$50</option></select></label>\n<label>מחיר כולל משלוח<select id=\"liveTotalMax\"><option value=\"all\">ללא הגבלה</option><option value=\"25\">$25</option><option value=\"50\">$50</option><option value=\"100\">$100</option><option value=\"200\">$200</option><option value=\"500\">$500</option></select></label>\n<label>פער מינימלי מהמחירון<select id=\"liveDiscountMin\"><option value=\"all\">ללא הגבלה</option><option value=\"10\">10%</option><option value=\"20\">20%</option><option value=\"30\">30%</option><option value=\"40\">40%</option><option value=\"50\">50%</option></select></label>\n<label>מצב לפי המודעה<select id=\"liveConditionMin\"><option value=\"all\">כל המצבים</option><option value=\"NM\">NM בלבד</option><option value=\"LP\">LP ומעלה</option><option value=\"MP\">MP ומעלה</option><option value=\"HP\">HP ומעלה</option><option value=\"DMG\">DMG ומעלה</option></select></label>\n</div><label class=\"live-unknown-label\"><input type=\"checkbox\" id=\"liveIncludeUnknown\" checked>כלול מודעות עם מחיר משלוח לא ידוע</label><label class=\"live-unknown-label\"><input type=\"checkbox\" id=\"liveShowReview\" checked>הצג גם מודעות שדורשות אימות (בתחתית הרשימה)</label><button type=\"button\" class=\"btn\" id=\"liveResetFilters\">אפס סינון</button><p class=\"live-filter-note\">הסינון חל על המודעות שכבר נאספו; הוא לא מוחק תוצאות.</p></details>\n<div id=\"liveCount\" class=\"live-count\" aria-live=\"polite\"></div>\n<div id=\"liveProgress\" class=\"live-progress\" hidden role=\"progressbar\" aria-label=\"התקדמות סריקת קלפי ה־Wishlist\" aria-valuemin=\"0\" aria-valuenow=\"0\" aria-valuemax=\"100\"><div class=\"live-progress-fill\" id=\"liveProgressFill\"></div></div>\n<div class=\"live-scan-actions\"><button type=\"button\" class=\"btn\" id=\"liveMore\" hidden>השהה סריקה</button></div>\n<div id=\"liveListings\" class=\"live-results\" role=\"list\"></div>\n<div class=\"live-more\"><button type=\"button\" class=\"btn\" id=\"liveShowMore\" hidden>הצג עוד מכרזים</button></div>\n<p class=\"live-disclaimer\" id=\"liveDisclaimer\" hidden>המצב להשוואה מבוסס על מידע המוכר כשזמין, אחרת על הכותרת או ברירת מחדל. התאמה ומצב אינם אימות מקצועי. כל המחירים משתנים בזמן אמת. סינון יפנית נעשה לפי כותרת בלבד.</p>";

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
 const gradeRank={NM:0,LP:1,MP:2,HP:3,DMG:4};
 const isArtCase=title=>/\bart[\s_-]*cases?\b/i.test(String(title||''));
 const japaneseTitle=title=>/[\u3040-\u30ff\u3400-\u9fff]/u.test(String(title||''))||/\b(?:japanese|japanisch\w*|jpn|jap|japonais\w*|japon[eé]s\w*|japan\s+(?:edition|version|print|language|import|card))\b/i.test(String(title||''));
 const usdMoney=value=>typeof value==='number'&&Number.isFinite(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value):'—';
 page.querySelector('.collection-heading').after(ui);

 const list=()=>bridge()?.getWishlistCards?.()||[];
 const usd=(a)=>{if(!a||typeof a.value!=='number')return null;return window.VintageDealsDashboard?.convertToUSD?.(a.value,a.currency)??null};
 const marketFor=(c,grade)=>bridge()?.getMarketPrice?.(c.id,grade);
 const cardIndex=()=>new Map(list().map(c=>[c.id,c]));
 const keyFor=item=>item.itemId||item.url;
 const verificationFor=item=>{
  const detail=state.conditionDetails.get(keyFor(item));
  const status=detail?.verificationStatus||item.verificationStatus||'review';
  const reasons=detail?.verificationReasons||item.verificationReasons||['התאמת הקלף לא אומתה'];
  return {status,reasons,confidence:typeof detail?.matchConfidence==='number'&&detail.verificationStatus?detail.matchConfidence:item.matchConfidence};
 };
 const resolvedGrade=item=>{
  const key=keyFor(item),detail=state.conditionDetails.get(key);
  const declared=(detail&&detail.source==='seller'&&detail.grade)?detail.grade:null;
  const grade=state.gradeOverrides.get(key)||declared||item.conditionGrade||'MP';
  const source=declared?'seller':item.conditionSource||'unknown';
  const label=detail?.label||item.conditionLabel||item.condition||'';
  return {grade,source,label,overridden:state.gradeOverrides.has(key)};
 };
 function evaluation(item,card){
  const gradeInfo=resolvedGrade(item);
  const verification=verificationFor(item);
  const raw=card?marketFor(card,gradeInfo.grade):null;
  const market=typeof raw==='number'&&Number.isFinite(raw)&&raw>0?raw:null;
  const current=usd(item.currentBid),shipping=usd(item.shipping);
  const allIn=current!==null&&shipping!==null?current+shipping:null;
  const comparable=allIn!==null?allIn:current;
  const provisional=allIn===null&&current!==null;
  const difference=market!==null&&comparable!==null?(market-comparable)/market:null;
  const discount=allIn!==null&&verification.status==='strong'?difference:null;
  const hours=item.format==='AUCTION'?(new Date(item.endTime).getTime()-Date.now())/3600000:null;
  const reliable=verification.status==='strong'&&discount!==null&&verification.confidence>=70&&gradeInfo.source!=='unknown'&&!/\\b(?:damaged|creased|folded|poor condition)\\b/i.test(item.title||'')&&!/\\b(?:lot|bundle)\\b/i.test(item.title||'');
  let group=4;
  if(reliable&&discount>=0.20&&((item.format==='FIXED_PRICE')||(hours!==null&&hours>=0&&hours<=6)))group=0;
  else if(reliable&&discount>=0.15&&((item.format==='FIXED_PRICE')||(hours!==null&&hours>=0&&hours<=24)))group=1;
  else if(discount!==null&&discount>0)group=2;
  else if(verification.status!=='strong')group=5;
  else if(provisional||gradeInfo.source==='unknown'||discount===null)group=3;
  const score=(discount??-1)*100+(item.format==='FIXED_PRICE'?20:hours!==null&&hours<=6?18:hours!==null&&hours<=24?9:0)+verification.confidence/20;
  const warnings=Array.isArray(item.warnings)?item.warnings.slice():[];
  if(item.shipping===null)warnings.push('מחיר משלוח לא ידוע — ההשוואה היא להצעה או למחיר הפריט בלבד');
  if(verification.confidence<70)warnings.push('התאמת קלף לא ודאית');
  if(item.sellerFeedback!==null&&item.sellerFeedback<95)warnings.push('דירוג מוכר נמוך');
  return {gradeInfo,market,allIn,discount,difference,provisional,hours,group,score,warnings,verification};
 }
 const timeLabel=d=>{
  const t=new Date(d||'').getTime();if(!Number.isFinite(t))return 'זמן סיום לא ידוע';
  const hours=Math.ceil((t-Date.now())/3600000);
  return hours<0?'מכרז הסתיים':hours===0?'מסתיים בקרוב':hours<=24?'נותרו '+hours+' שעות':'נותרו '+Math.ceil(hours/24)+' ימים';
 };
 function render(){
  const total=state.scanTotal||list().length;
  const badge=$('liveBadge');
  badge.textContent=state.status==='awaiting-keys'?'ממתין למפתחות eBay':state.status==='error'?'שגיאת חיבור':state.loading&&state.status==='ready'?'סורק מודעות…':state.status==='ready'?'eBay · API':state.status==='loading'?'מתחבר…':'טרם חובר';
  badge.className='live-badge'+(state.status==='ready'?' ready':'');
  $('liveReload').disabled=state.loading||!state.endpoint||state.status==='awaiting-keys';
  $('liveMore').hidden=!(state.loading||state.paused&&!state.done);
  $('liveMore').textContent=state.loading?'השהה סריקה':'המשך סריקה';
  $('liveControls').hidden=state.status!=='ready';
  $('liveDisclaimer').hidden=state.status!=='ready';
  $('liveAdvanced').hidden=state.status!=='ready';
  const progress=$('liveProgress');
  progress.hidden=state.status!=='ready'||!total;
  const pct=total?Math.min(100,Math.round(state.searched/total*100)):0;
  progress.setAttribute('aria-valuenow',String(pct));
  progress.setAttribute('aria-valuetext',state.searched+' מתוך '+total+' קלפים');
  $('liveProgressFill').style.width=pct+'%';
  let status='';
  if(!state.endpoint)status='כדי לקבל מודעות חיות צריך לחבר שרת eBay.';
  else if(state.status==='awaiting-keys')status='ממתינים להגדרת מפתחות eBay.';
  else if(state.status==='error')status=state.error||'אי אפשר להתחבר ל־eBay';
  else if(state.status==='loading')status='מתחברים ל־eBay…';
  else if(state.loading)status='סורקים: '+state.searched+' מתוך '+total+' קלפים · נאספו '+state.items.length+' מודעות'+(state.errors.length?' · '+state.errors.length+' שגיאות חלקיות':'');
  else if(state.paused)status=(state.error?state.error+' · ':'הסריקה מושהית · ')+'נבדקו '+state.searched+' מתוך '+total+' קלפים';
  else if(state.done)status='הסריקה הושלמה: '+state.searched+' מתוך '+total+' קלפים · נאספו '+state.items.length+' מודעות'+(state.errors.length?' · '+state.errors.length+' שגיאות חלקיות':'')+(state.lastScanAt?' · עודכן: '+new Date(state.lastScanAt).toLocaleTimeString('he-IL'):'');
  else status='מחובר ל־eBay. פתיחת הלשונית תתחיל סריקה אוטומטית.';
  if(state.status==='ready'&&!/^[0-9]{7}$/.test($('livePostal').value))status+=' · מומלץ להזין מיקוד לחישוב משלוח';
  $('liveStatus').textContent=status;
  const lookup=cardIndex(),sort=$('liveSort').value,shippingOnly=$('liveOnlyShipping').checked;
  const type=$('liveType').value, end=$('liveEndLimit').value, shipMax=$('liveShipMax').value;
  const totalMax=$('liveTotalMax').value,minDiscount=$('liveDiscountMin').value,minCondition=$('liveConditionMin').value;
  const includeUnknown=$('liveIncludeUnknown').checked;
  const showReview=$('liveShowReview').checked;
  const activeFilters=[type!=='all',end!=='all',shipMax!=='all',totalMax!=='all',minDiscount!=='all',minCondition!=='all',!includeUnknown,shippingOnly,!showReview].filter(Boolean).length;
  $('liveFilterCount').textContent=activeFilters?'('+activeFilters+' פעילים)':'';
  let enriched=state.items.map(item=>({item,card:lookup.get(item.cardId),score:evaluation(item,lookup.get(item.cardId))}))
   .filter(({item,score})=>{
    if(japaneseTitle(item.title)||isArtCase(item.title))return false;
    if(score.verification.status==='rejected')return false;
    if(!showReview&&score.verification.status!=='strong')return false;
    if(type!=='all'&&type!==(item.format||'AUCTION'))return false;
    if(end!=='all'&&item.format==='AUCTION'&&(!Number.isFinite(score.hours)||score.hours<0||score.hours>Number(end)))return false;
    const sh=usd(item.shipping);
    if((shippingOnly||!includeUnknown)&&sh===null)return false;
    if(shipMax!=='all'&&(sh===null?!includeUnknown:sh>Number(shipMax)))return false;
    if(totalMax!=='all'&&(score.allIn===null||score.allIn>Number(totalMax)))return false;
    if(minDiscount!=='all'&&(score.discount===null||score.discount*100<Number(minDiscount)))return false;
    if(minCondition!=='all'){
     const detail=state.conditionDetails.get(keyFor(item));
     const sellerGrade=detail?.source==='seller'&&detail.grade?detail.grade:item.conditionGrade;
     if(!sellerGrade||gradeRank[sellerGrade]===undefined)return false;
     if(gradeRank[sellerGrade]>gradeRank[minCondition])return false;
    }
    return true;
   });
  const trustFirst=(a,b)=>(a.score.verification.status==='strong'?0:1)-(b.score.verification.status==='strong'?0:1);
  if(sort==='recommended')enriched.sort((a,b)=>trustFirst(a,b)||a.score.group-b.score.group||b.score.score-a.score.score||b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='discount')enriched.sort((a,b)=>trustFirst(a,b)||(b.score.discount??-999)-(a.score.discount??-999)||b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='closing')enriched.sort((a,b)=>{
   const at=a.item.format==='AUCTION'?new Date(a.item.endTime).getTime():Infinity;
   const bt=b.item.format==='AUCTION'?new Date(b.item.endTime).getTime():Infinity;
   return trustFirst(a,b)||at-bt||b.item.matchConfidence-a.item.matchConfidence;
  });
  if(sort==='bids')enriched.sort((a,b)=>trustFirst(a,b)||(a.item.bidCount??Infinity)-(b.item.bidCount??Infinity));
  if(sort==='match')enriched.sort((a,b)=>trustFirst(a,b)||b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='shipping'||sort==='shippingDesc')enriched.sort((a,b)=>{
   if(trustFirst(a,b))return trustFirst(a,b);
   const x=usd(a.item.shipping),y=usd(b.item.shipping);
   if(x===null)return y===null?0:1;
   if(y===null)return -1;
   return (sort==='shipping'?x-y:y-x)||b.item.matchConfidence-a.item.matchConfidence;
  });
  // Changing the comparison grade is not a request to reorder the results.
  // Retain the listing's position even if the new discount would put it past page 1.
  if(state.preserveGradeOrder){
   const positions=new Map(state.lastRenderedOrder.map((key,index)=>[key,index]));
   enriched.sort((a,b)=>(positions.get(keyFor(a.item))??Infinity)-(positions.get(keyFor(b.item))??Infinity)||0);
  }
  state.lastRenderedOrder=enriched.map(({item})=>keyFor(item));
  const strongCount=enriched.filter(x=>x.score.verification.status==='strong').length;
  const reviewCount=enriched.length-strongCount;
  $('liveCount').textContent='מציג '+Math.min(state.visibleCount,enriched.length)+' מתוך '+enriched.length+' מודעות · '+strongCount+' התאמות חזקות · '+reviewCount+' דורשות אימות'+(activeFilters?' · סינון פעיל':'');
  $('liveShowMore').hidden=enriched.length<=state.visibleCount;
  $('liveShowMore').textContent='הצג עוד מודעות ('+Math.min(PAGE_SIZE,enriched.length-state.visibleCount)+' מתוך '+(enriched.length-state.visibleCount)+')';
  $('liveListings').innerHTML=enriched.length?enriched.slice(0,state.visibleCount).map(({item,card,score})=>{
   const verified=score.verification.status==='strong';
   const grade=score.gradeInfo.grade, pct=!verified||score.difference===null?null:Math.round(Math.abs(score.difference)*100);
   const discountText=!verified?'לא מוצגת הנחה עד לאימות הקלף':pct===null?'מחירון לא זמין':
    score.provisional?(score.difference>=0?'המחיר לפני משלוח נמוך ב־':'המחיר לפני משלוח גבוה ב־')+pct+'%':
    score.difference>=0?(item.format==='AUCTION'?'ההצעה כרגע נמוכה ב־':'זול ב־')+pct+'%':(item.format==='AUCTION'?'ההצעה כרגע גבוהה ב־':'יקר ב־')+pct+'%';
   const tone=!verified?'unknown':score.provisional?'provisional':score.discount===null?'unknown':score.discount>=0?'cheaper':'pricier';
   const key=keyFor(item);
   const conditionText=score.gradeInfo.source==='seller'?'על פי eBay':score.gradeInfo.source==='title'?'מזוהה בכותרת':'לא ידוע (MP כברירת מחדל)';
   const selectedLabel=score.gradeInfo.overridden?' · שינית ידנית':'';
   const detail=state.conditionDetails.get(key);
   const showFetch=(!verified||score.gradeInfo.source!=='seller')&&!detail;
   const amount=score.allIn===null?'—':'$'+score.allIn.toFixed(2);
   const isFixed=item.format==='FIXED_PRICE';
   const endLabel=isFixed?'קנייה מיידית':timeLabel(item.endTime);
   const sourceLabel=isFixed?'קנייה מיידית':'מכרז';
   const offer=item.bestOffer?'<span class="live-offer">אפשר להציע מחיר</span>':'';
   const tier=!verified?'<span class="live-verify-badge">דורש אימות</span>':
    score.group===0?'<span class="live-candidate">כדאי לבדוק עכשיו</span>':
    score.group===1?'<span class="live-watch">מעניין בקרוב</span>':
    '<span class="live-strong-badge">התאמה חזקה</span>';
   const warnings=score.warnings.length?'<div class="live-flags">'+score.warnings.slice(0,3).map(x=>'<span>'+escape(x)+'</span>').join('')+'</div>':'';
     const image=item.image?'<button type="button" class="live-image-open" data-image-key="'+escape(key)+'" title="פתח את תמונות המודעה" aria-label="פתח גלריית תמונות עבור '+escape(item.title)+'"><img src="'+escape(item.image)+'" alt="" loading="lazy" decoding="async"></button>':'<div class="live-no-image">✦</div>';
   const name=card?card.name+' · '+card.setName:'קלף לא מזוהה';
   return '<article class="live-item" role="listitem"><div class="live-card-main">'+image+
    '<div class="live-card-text"><small>'+escape(name)+'</small><strong>'+escape(item.title)+'</strong>'+
    '<span>'+escape(sourceLabel)+' · '+escape(item.marketplace)+' · '+(isFixed?'מחיר קבוע':(item.bidCount===null?'מספר הצעות לא זמין':item.bidCount+' הצעות'))+' · '+escape(endLabel)+'</span>'+
    '<span>מוכר: '+escape(item.sellerName||'לא ידוע')+(item.sellerFeedback!==null?' · '+escape(item.sellerFeedback)+'% חיובי':'')+'</span>'+offer+'</div>'+tier+'</div>'+
    '<div class="live-item-numbers"><span>'+(isFixed?'מחיר קנייה מיידית':'הצעה נוכחית')+' <b>'+escape(money(item.currentBid))+'</b></span>'+
    '<span>משלוח לישראל <b>'+escape(item.shipping?money(item.shipping):'לא ידוע')+'</b></span>'+
    '<span>כולל משלוח בדולר <b>'+amount+'</b></span></div>'+
    '<div class="live-single-grade"><div class="live-grade-control"><div><strong>מצב להשוואה: '+escape(grade)+'</strong><small>'+escape(conditionText+selectedLabel)+'</small></div>'+
    '<select class="live-item-grade" data-item-key="'+escape(key)+'" aria-label="מצב קלף להשוואה">'+GRADES.map(g=>'<option value="'+g+'"'+(g===grade?' selected':'')+'>'+g+'</option>').join('')+'</select></div>'+
    '<div class="live-single-price"><span>מחירון '+grade+': <b>'+(verified?usdMoney(score.market):'לא מוצג ללא אימות')+'</b></span>'+
    '<strong class="'+tone+'">'+discountText+'</strong></div>'+
    (showFetch?'<button class="live-condition-fetch" type="button" data-item-key="'+escape(key)+'">'+(state.conditionLoading.has(key)?'בודק מול eBay…':verified?'בדוק מצב שהמוכר הגדיר':'בדוק התאמת קלף מול eBay')+'</button>':
     (detail?.source==='unknown'?'<span class="live-condition-note">eBay לא סיפקה מצב מפורט למודעה הזאת</span>':''))+
    (!verified?'<p class="live-match-review-note">נדרשת בדיקה: '+escape(score.verification.reasons.join(' · ')||'אין מספיק פרטי זיהוי')+'. המחירון והפער הוסתרו כדי לא להציג מציאה שגויה.</p>':'' )+
    (verified&&score.provisional?'<p class="live-pricebook-note">ההשוואה היא לפני משלוח. אין עדיין מחיר כולל אמין.</p>':'')+
    '</div>'+warnings+
    '<div class="live-footer"><span>התאמת פרטי המודעה: '+Math.round(score.verification.confidence)+'% (לא אימות מקוריות)</span>'+
    '<a href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">למודעה ב־eBay ↗</a></div></article>';
  }).join(''):state.status==='ready'&&!state.loading?
   '<div class="live-empty">'+(state.items.length?'אין מודעות שתואמות לפילטרים. לחץ על איפוס סינון.':state.done?'לא נמצאו מודעות תואמות בקלפים שנבדקו. נסה לסרוק מחדש.':'עדיין לא נמצאו מודעות תואמות.')+'</div>':'';
 }


 // Gallery fetch is intentionally separate from search and condition enrichment.
 // Only a direct tap on a listing thumbnail asks eBay for the complete photo set.
 const gallery=document.createElement('dialog');
 gallery.id='liveGallery';gallery.className='live-gallery-dialog';
 gallery.setAttribute('aria-label','גלריית תמונות של מודעת eBay');
 gallery.innerHTML='<div class="live-gallery-shell" dir="rtl">'+
  '<header class="live-gallery-head"><button type="button" id="liveGalleryClose" class="live-gallery-close" aria-label="סגור גלריה">✕</button>'+
  '<div class="live-gallery-heading"><strong id="liveGalleryTitle"></strong><small id="liveGalleryMeta"></small></div></header>'+
  '<div id="liveGalleryStage" class="live-gallery-stage">'+
  '<img id="liveGalleryImage" alt="" hidden>'+
  '<div id="liveGalleryEmpty" class="live-gallery-empty" hidden>אין תמונה זמינה</div>'+
  '<span id="liveGalleryCounter" class="live-gallery-counter" dir="ltr"></span>'+
  '<button id="liveGalleryPrevious" type="button" class="live-gallery-arrow previous" aria-label="תמונה קודמת">❮</button>'+
  '<button id="liveGalleryNext" type="button" class="live-gallery-arrow next" aria-label="תמונה הבאה">❯</button></div>'+
  '<div id="liveGalleryStatus" class="live-gallery-status" aria-live="polite"></div>'+
  '<div id="liveGalleryThumbs" class="live-gallery-thumbs" aria-label="תמונות המודעה"></div>'+
  '<div class="live-gallery-actions"><button id="liveGalleryDemoButton" type="button" class="live-gallery-demo-button" aria-expanded="false">✨ ניתוח מצב (דמו)</button>'+
  '<a id="liveGalleryEbay" href="#" target="_blank" rel="noopener noreferrer">למודעה ב־eBay ↗</a></div>'+
  '<section id="liveGalleryDemo" class="live-gallery-demo" hidden aria-label="הדגמת ניתוח מצב">'+
  '<strong>LP — תוצאת הדגמה בלבד</strong>'+
  '<p>זוהי תצוגת דמה של פיצ׳ר עתידי. התמונות לא נותחו, ואין כאן הערכת מצב אמיתית.</p>'+
  '<div><span>פינות</span><b>שחיקה קלה (דוגמה)</b></div>'+
  '<div><span>קצוות</span><b>סימנים קלים (דוגמה)</b></div>'+
  '<div><span>משטח הקלף</span><b>נראה תקין (דוגמה)</b></div></section></div>';
 document.body.appendChild(gallery);
 const galleryCache=new Map();
 let galleryImages=[],galleryIndex=0,galleryItem=null,gallerySerial=0,galleryAbort=null;
 const galleryStatus=$('liveGalleryStatus');
 const imageUrl=src=>{try{return typeof src==='string'&&new URL(src).protocol==='https:'}catch{return false}};
 function showGalleryImage(){
  const img=$('liveGalleryImage'),count=galleryImages.length;
  img.hidden=!count;$('liveGalleryEmpty').hidden=!!count;
  if(count){img.src=galleryImages[galleryIndex];img.alt='תמונה '+(galleryIndex+1)+' מתוך '+count+' של '+(galleryItem?.title||'מודעת eBay');}
  else img.removeAttribute('src');
  $('liveGalleryCounter').textContent=count?(galleryIndex+1)+' / '+count:'';
  $('liveGalleryPrevious').disabled=count<=1;$('liveGalleryNext').disabled=count<=1;
  gallery.querySelectorAll('[data-gallery-index]').forEach(btn=>{
   const active=Number(btn.dataset.galleryIndex)===galleryIndex;
   btn.classList.toggle('selected',active);btn.setAttribute('aria-current',active?'true':'false');
   if(active)btn.scrollIntoView({block:'nearest',inline:'nearest'});
  });
 }
 function setGalleryPhotos(images){
  galleryImages=images;galleryIndex=0;
  $('liveGalleryThumbs').innerHTML=images.map((url,i)=>'<button type="button" data-gallery-index="'+i+
   '" aria-label="הצג תמונה '+(i+1)+'"><img src="'+escape(url)+'" alt="" loading="lazy" decoding="async"></button>').join('');
  showGalleryImage();
 }
 function changeGalleryImage(step){
  if(galleryImages.length<2)return;
  galleryIndex=(galleryIndex+step+galleryImages.length)%galleryImages.length;
  showGalleryImage();
 }
 async function openGallery(item){
  if(!item)return;
  if(gallery.open)gallery.close();
  const serial=++gallerySerial,key=keyFor(item);
  galleryItem=item;
  $('liveGalleryTitle').textContent=item.title||'מודעה ב־eBay';
  $('liveGalleryMeta').textContent=[item.marketplace,item.format==='AUCTION'?'מכרז':'קנייה מיידית'].filter(Boolean).join(' · ');
  $('liveGalleryEbay').href=item.url;
  $('liveGalleryDemo').hidden=true;
  $('liveGalleryDemoButton').setAttribute('aria-expanded','false');
  setGalleryPhotos(item.image&&imageUrl(item.image)?[item.image]:[]);
  galleryStatus.textContent='טוען את תמונות המודעה מ־eBay…';
  gallery.showModal();
  const cached=galleryCache.get(key);
  if(cached){setGalleryPhotos(cached);galleryStatus.textContent='';return;}
  const controller=new AbortController();galleryAbort=controller;
  try{
   const response=await fetch(state.endpoint+'/api/item-images',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({itemId:item.itemId,marketplace:item.marketplace}),
    signal:controller.signal
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'תמונות המודעה אינן זמינות');
   if(serial!==gallerySerial||!gallery.open)return;
   const images=[...new Set((Array.isArray(data.images)?data.images:[]).filter(imageUrl))].slice(0,25);
   const resolved=images.length?images:galleryImages;
   galleryCache.set(key,resolved);
   setGalleryPhotos(resolved);
   galleryStatus.textContent=images.length?'':'לא התקבלו תמונות נוספות מ־eBay.';
  }catch(error){
   if(serial!==gallerySerial||!gallery.open)return;
   galleryStatus.textContent='לא ניתן לטעון תמונות נוספות כעת. ניתן לפתוח את המודעה ב־eBay.';
  }finally{if(galleryAbort===controller)galleryAbort=null;}
 }
 gallery.addEventListener('close',()=>{
  gallerySerial++;galleryAbort?.abort();galleryAbort=null;
  galleryItem=null;galleryImages=[];$('liveGalleryDemo').hidden=true;
 });
 gallery.addEventListener('click',e=>{
  if(e.target===gallery){gallery.close();return;}
  if(e.target.closest('#liveGalleryClose')){gallery.close();return;}
  if(e.target.closest('#liveGalleryPrevious')){changeGalleryImage(-1);return;}
  if(e.target.closest('#liveGalleryNext')){changeGalleryImage(1);return;}
  const thumb=e.target.closest('[data-gallery-index]');
  if(thumb){galleryIndex=Number(thumb.dataset.galleryIndex);showGalleryImage();return;}
  if(e.target.closest('#liveGalleryDemoButton')){
   const demo=$('liveGalleryDemo');demo.hidden=!demo.hidden;
   $('liveGalleryDemoButton').setAttribute('aria-expanded',String(!demo.hidden));
  }
 });
 gallery.addEventListener('keydown',e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   e.preventDefault();changeGalleryImage(e.key==='ArrowLeft'?1:-1);
  }
 });
 let touchStart=null;
 const galleryStage=$('liveGalleryStage');
 galleryStage.addEventListener('touchstart',e=>{
  if(e.touches.length!==1){touchStart=null;return;}
  touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};
 },{passive:true});
 galleryStage.addEventListener('touchend',e=>{
  if(!touchStart||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-touchStart.x;
  const dy=e.changedTouches[0].clientY-touchStart.y;
  touchStart=null;
  if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)changeGalleryImage(dx<0?1:-1);
 },{passive:true});

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
 async function enrichTopSellerConditions(){
  if(conditionEnrichmentRunning||state.status!=='ready'||!state.done)return;
  conditionEnrichmentRunning=true;
  try{
   const index=cardIndex();
   const candidates=state.items.filter(item=>!japaneseTitle(item.title)&&!state.conditionDetails.has(keyFor(item))&&(item.verificationStatus==='review'||item.conditionSource!=='seller'))
    .map(item=>({item,score:evaluation(item,index.get(item.cardId))}))
    .sort((a,b)=>(a.item.verificationStatus==='review'?0:1)-(b.item.verificationStatus==='review'?0:1)||a.score.group-b.score.group||b.score.score-a.score.score)
    .slice(0,18);
   for(const {item} of candidates){
    if(state.loading||state.status!=='ready')break;
    const key=keyFor(item);
    if(state.conditionDetails.has(key))continue;
    state.conditionLoading.add(key);
    try{
     const postalCode=$('livePostal').value.trim();
     const response=await fetch(state.endpoint+'/api/item-condition',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({itemId:item.itemId,marketplace:item.marketplace,card:(cardIndex().get(item.cardId)||null),...(postalCode?{postalCode}:{})})
     });
     const data=await response.json();
     state.conditionDetails.set(key,response.ok?data:{source:'unknown',grade:null,label:''});
    }catch(e){state.conditionDetails.set(key,{source:'unknown',grade:null,label:''})}
    finally{state.conditionLoading.delete(key);render()}
   }
  }finally{conditionEnrichmentRunning=false}
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
   // Keep manual grade selections and fetched seller data across refreshes of the same listings.
   state.preserveGradeOrder=false;
   state.lastRenderedOrder=[];
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
      body:JSON.stringify({cards:selected.map(c=>({id:c.id,name:c.name,setName:c.setName,number:c.number,firstEdition:c.firstEdition,finish:c.finish})),...(postalCode?{postalCode}:{})}),
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
    if(state.done)void enrichTopSellerConditions();
   }
  }
 }

 $('liveReload').addEventListener('click',()=>scanAll(true));
 $('liveMore').addEventListener('click',()=>state.loading?pauseScan():scanAll(false));
 $('liveShowMore').addEventListener('click',()=>{state.visibleCount+=PAGE_SIZE;render()});
 $('liveSort').addEventListener('change',()=>{state.preserveGradeOrder=false;state.visibleCount=PAGE_SIZE;render()});
 $('liveOnlyShipping').addEventListener('change',()=>{state.preserveGradeOrder=false;state.visibleCount=PAGE_SIZE;render()});
 $('livePostal').addEventListener('change',()=>{
  const value=$('livePostal').value.trim();
  if(value&&!/^[0-9]{7}$/.test(value)){state.error='נא להזין מיקוד ישראלי בן 7 ספרות';state.paused=true;render();return}
  try{if(value)localStorage.setItem(POSTAL_STORAGE_KEY,value);else localStorage.removeItem(POSTAL_STORAGE_KEY)}catch(_){}
  if(state.loading)pauseScan();
  if(state.status==='ready')scanAll(true);
 });
 function filtersChanged(){
  state.preserveGradeOrder=false;
  state.visibleCount=PAGE_SIZE;
  render();
 }
 ['liveType','liveEndLimit','liveShipMax','liveTotalMax','liveDiscountMin','liveConditionMin','liveIncludeUnknown','liveShowReview'].forEach(id=>{
  $(id).addEventListener('change',filtersChanged);
 });
 $('liveResetFilters').addEventListener('click',()=>{
  ['liveType','liveEndLimit','liveShipMax','liveTotalMax','liveDiscountMin','liveConditionMin'].forEach(id=>$(id).value='all');
  $('liveIncludeUnknown').checked=true;
  $('liveShowReview').checked=true;
  $('liveOnlyShipping').checked=false;
  state.preserveGradeOrder=false;
  state.visibleCount=PAGE_SIZE;
  render();
 });
 $('liveListings').addEventListener('change',e=>{
  const select=e.target.closest('select.live-item-grade');
  if(!select)return;
  const key=select.dataset.itemKey;
  if(!GRADES.includes(select.value))return;
  state.preserveGradeOrder=true;
  state.gradeOverrides.set(key,select.value);
  render();
 });
 $('liveListings').addEventListener('click',async e=>{
  const photo=e.target.closest('button.live-image-open');
  if(photo){const item=state.items.find(x=>keyFor(x)===photo.dataset.imageKey);openGallery(item);return;}
  const button=e.target.closest('button.live-condition-fetch');
  if(!button)return;
  const key=button.dataset.itemKey,item=state.items.find(x=>keyFor(x)===key);
  if(!item||state.conditionLoading.has(key)||state.conditionDetails.has(key))return;
  state.conditionLoading.add(key);
  render();
  try{
   const postalCode=$('livePostal').value.trim();
   const response=await fetch(state.endpoint+'/api/item-condition',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({itemId:item.itemId,marketplace:item.marketplace,card:(cardIndex().get(item.cardId)||null),...(postalCode?{postalCode}:{})})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Item condition unavailable');
   state.conditionDetails.set(key,data);
  }catch(error){
   state.conditionDetails.set(key,{grade:null,source:'unknown',label:'מידע לא זמין'});
  }finally{
   state.conditionLoading.delete(key);
   render();
  }
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