/* eBay live results for the native Deals tab. Only trusts the configured Worker. */
(()=>{
 'use strict';
 const page=document.querySelector('#dealsPage .collection-panel');
 const bridge=()=>window.VintageDealBridge;
 if(!page || !page.querySelector('.deal-summary'))return;
 const key='pokemon-ebay-worker-endpoint-v1';
 const $=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>{if(!v || !Number.isFinite(Number(v.value)) || !/^[A-Z]{3}$/.test(String(v.currency)))return '—';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:v.currency,maximumFractionDigits:2}).format(Number(v.value));}catch(_){return String(v.value)+' '+String(v.currency)}};
 const state={endpoint:'',status:'setup',error:'',items:[],searched:0,done:false,loading:false,seen:new Set(),fetchedAt:null,errors:[]};
 try{state.endpoint=localStorage.getItem(key)||'';}catch(_){}

 const ui=document.createElement('section');
 ui.className='live-auctions';
 ui.setAttribute('aria-label','מכרזים חיים מ־eBay');
 ui.innerHTML='<div class="live-title"><div><h3>⚡ מכרזים חיים ב־eBay</h3><p>מכרזים שנשלפו מ־eBay על קלפים ב־Wishlist שלך, כולל הצעות ומחיר משלוח כשהם זמינים.</p></div><span id="liveBadge" class="live-badge">לא מחובר</span></div>'+
 '<div class="live-toolbar"><button type="button" id="liveReload" class="btn primary">↻ חפש מכרזים עכשיו</button>'+
 '<label for="liveSort">מיון <select id="liveSort"><option value="discount">הנחה משוערת</option><option value="closing">מסתיימים בקרוב</option><option value="bids">הכי מעט הצעות</option><option value="match">התאמת קלף</option></select></label>'+
 '<label class="live-only-shipping"><input type="checkbox" id="liveOnlyShipping"> רק משלוח ידוע</label></div>'+
 '<div id="liveStatus" class="live-status" role="status"></div><div id="liveListings" class="live-results" role="list"></div>'+
 '<div class="live-more"><button type="button" class="btn" id="liveMore" hidden>חפש את ארבעת הקלפים הבאים ↓</button></div>'+
 '<details class="live-settings" id="liveSettings"><summary>⚙ חיבור למקור הנתונים</summary>'+
 '<p>כדי לשלוף מכרזים אוטומטית, יש להזין כתובת של שרת eBay Worker עם פרטי גישה שמורים בשרת. אין להזין כאן סיסמה או מפתח API.</p>'+
 '<form id="liveConnectForm"><label for="liveEndpoint">כתובת ה־Worker</label><div class="live-connect-row"><input id="liveEndpoint" type="url" placeholder="https://your-worker.workers.dev" autocomplete="url" inputmode="url"><button type="submit" class="btn primary">חבר</button></div></form>'+
 '<p class="live-settings-hint">כתובת השרת נשמרת בדפדפן הזה. מפתחות eBay נשארים בשרת בלבד.</p></details>'+
 '<p class="live-disclaimer">הנחות מוצגות רק כחישוב מותנה במצב הקלף שנבחר ובמחיר השוק. התאמה, מצב, אותנטיות ומשלוח אינם מאומתים באמצעות התמונות. המחירים עשויים להשתנות.</p>';
 page.querySelector('.deal-summary').after(ui);
 $('liveEndpoint').value=state.endpoint;

 const list=()=>bridge()?.getWishlistCards?.()||[];
 const usd=(a)=>{if(!a||typeof a.value!=='number')return null;return window.VintageDealsDashboard?.convertToUSD?.(a.value,a.currency)??null};
 const marketFor=c=>{
  const grade=$('dealGrade')?.value||'MP';
  return bridge()?.getMarketPrice?.(c.id,grade);
 };
 const cardIndex=()=>new Map(list().map(c=>[c.id,c]));
 function evaluation(item,card){
  const market=card?marketFor(card):null;
  const current=usd(item.currentBid);
  const shipping=usd(item.shipping);
  const allIn=current!==null && shipping!==null?current+shipping:null;
  const rate=typeof market==='number'&&Number.isFinite(market)&&market>0;
  const discount=rate&&allIn!==null?(market-allIn)/market:null;
  const warnings=Array.isArray(item.warnings)?item.warnings.slice():[];
  if(item.shipping===null)warnings.push('מחיר משלוח לישראל לא ידוע');
  if(item.matchConfidence<70)warnings.push('התאמת קלף לא ודאית');
  if(item.sellerFeedback!==null && item.sellerFeedback<95)warnings.push('דירוג מוכר נמוך');
  warnings.push('מצב הקלף לא אומת; החישוב מניח '+($('dealGrade')?.value||'MP'));
  return {market,allIn,discount,warnings};
 }
 const timeLabel=d=>{
  const t=new Date(d||'').getTime();if(!Number.isFinite(t))return 'זמן סיום לא ידוע';
  const hours=Math.ceil((t-Date.now())/3600000);
  return hours<0?'מכרז הסתיים':hours===0?'מסתיים בקרוב':hours<=24?'נותרו '+hours+' שעות':'נותרו '+Math.ceil(hours/24)+' ימים';
 };
 function render(){
  const total=list().length;
  const badge=$('liveBadge');
  badge.textContent=state.status==='ready'?'eBay · API':state.status==='loading'?'מחפש…':state.status==='error'?'שגיאת חיבור':'טרם חובר';
  badge.className='live-badge'+(state.status==='ready'?' ready':'');
  $('liveReload').disabled=state.loading || !state.endpoint;
  $('liveMore').disabled=state.loading;
  $('liveMore').hidden=state.loading || state.done || state.status!=='ready' || state.searched>=total;
  $('liveSettings').open=!state.endpoint || state.status==='error';
  let status='';
  if(!state.endpoint)status='כדי לקבל מכרזים חיים צריך לחבר שרת eBay. התשתית קיימת; כרגע אין כתובת שרת מוגדרת.';
  else if(state.loading)status='בודקת מכרזים ומחירי משלוח עבור קלפים מרשימת הרצונות…';
  else if(state.error)status=state.error;
  else if(state.fetchedAt)status='מקור: eBay Browse API · נבדקו '+state.searched+' מתוך '+total+' קלפים · עודכן: '+new Date(state.fetchedAt).toLocaleString('he-IL')+(state.errors.length?' · היו '+state.errors.length+' שגיאות חלקיות':'');
  else if(state.status==='ready')status='מחובר ל־eBay. ניתן להתחיל חיפוש אוטומטי.';
  else status='בדיקת חיבור לשרת eBay…';
  $('liveStatus').textContent=status;
  const lookup=cardIndex(),sort=$('liveSort').value,shippingOnly=$('liveOnlyShipping').checked;
  const enriched=state.items.map(item=>{
   const card=lookup.get(item.cardId);
   return {item,card,score:evaluation(item,card)};
  }).filter(x=>!shippingOnly || x.item.shipping!==null);
  if(sort==='discount')enriched.sort((a,b)=>(b.score.discount??-999)-(a.score.discount??-999)||b.item.matchConfidence-a.item.matchConfidence);
  if(sort==='closing')enriched.sort((a,b)=>(new Date(a.item.endTime).getTime()||Infinity)-(new Date(b.item.endTime).getTime()||Infinity));
  if(sort==='bids')enriched.sort((a,b)=>(a.item.bidCount??Infinity)-(b.item.bidCount??Infinity));
  if(sort==='match')enriched.sort((a,b)=>b.item.matchConfidence-a.item.matchConfidence);
  $('liveListings').innerHTML=enriched.length ? enriched.map(({item,card,score})=>{
   const pct=score.discount!==null?Math.round(score.discount*100):null;
   const target=Number($('dealDiscount')?.value||35);
   const flag=pct!==null&&pct>=target&&item.matchConfidence>=70&&item.shipping!==null;
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
     '<span>כולל משלוח בדולר <b>'+amount+'</b></span>'+
     '<span>הנחה משוערת* <b class="'+(pct!==null&&pct>0?'positive':'')+'">'+(pct===null?'לא ניתן לחשב':pct+'%')+'</b></span></div>'+warnings+
     '<div class="live-footer"><span>התאמת כותרת: '+Math.round(item.matchConfidence)+'% (לא אימות מקוריות)</span>'+
     '<a href="'+escape(item.url)+'" target="_blank" rel="noopener noreferrer">למכרז ב־eBay ↗</a></div></article>';
  }).join('') : state.status==='ready'&&!state.loading?
   '<div class="live-empty">'+(state.searched?'לא נמצאו מכרזים תואמים בקלפים שנבדקו. אפשר להמשיך לקלפים הבאים.':'עוד לא בוצע חיפוש.')+'</div>':
   '';
 }

 function endpoint(raw){
  try{const url=new URL(raw.trim());if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
   return url.origin;
  }catch(_){return null}
 }
 async function connect(){
  if(!state.endpoint){state.status='setup';render();return false}
  state.status='loading';state.error='';render();
  try {
   const response=await fetch(state.endpoint+'/health',{cache:'no-store'});
   const json=await response.json();
   if(!response.ok||!json.ready)throw Error(json.ready===false?'שרת ה־eBay קיים, אבל מפתחות הגישה עדיין לא הוגדרו.':'שרת eBay לא זמין או מחזיר שגיאה.');
   state.status='ready';state.error='';render();return true;
  }catch(error){state.status='error';state.error='אי אפשר להתחבר לשרת: '+String(error.message||error);render();return false}
 }
 async function findMore(reset=false){
  if(state.loading || !state.endpoint)return;
  const wanted=list();
  if(reset){state.items=[];state.seen=new Set();state.searched=0;state.done=false;state.errors=[];state.fetchedAt=null}
  const selected=wanted.slice(state.searched,state.searched+4);
  if(!selected.length){state.done=true;render();return}
  state.loading=true;state.error='';state.status='loading';render();
  try{
   const response=await fetch(state.endpoint+'/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cards:selected.map(c=>({id:c.id,name:c.name,setName:c.setName,number:c.number,firstEdition:c.firstEdition}))})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'eBay returned HTTP '+response.status);
   if(!Array.isArray(data.items))throw Error('שרת eBay החזיר נתונים לא תקינים.');
   for(const item of data.items){
    if(!item||typeof item.itemId!=='string'||typeof item.url!=='string')continue;
    const k=item.itemId||item.url;if(state.seen.has(k))continue;state.seen.add(k);state.items.push(item);
   }
   state.searched+=selected.length;
   state.done=state.searched>=wanted.length;
   state.fetchedAt=data.fetchedAt||new Date().toISOString();
   if(Array.isArray(data.errors))state.errors.push(...data.errors);
   state.status='ready';
  }catch(e){state.status='error';state.error='חיפוש המכרזים נכשל: '+String(e.message||e)}
  finally{state.loading=false;render()}
 }

 $('liveConnectForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const input=endpoint($('liveEndpoint').value);
  if(!input){state.error='כתובת לא תקינה. דרושה כתובת HTTPS של Worker בלבד, ללא נתיב או מפתח.';state.status='error';render();return}
  state.endpoint=input;
  try{localStorage.setItem(key,input)}catch(_){}
  const connected=await connect();
  if(connected)await findMore(true);
 });
 $('liveReload').addEventListener('click',()=>findMore(true));
 $('liveMore').addEventListener('click',()=>findMore(false));
 $('liveSort').addEventListener('change',render);
 $('liveOnlyShipping').addEventListener('change',render);
 $('dealGrade').addEventListener('change',render);
 window.VintageEbayLive={
  open:async()=>{
   if(state.loading)return;
   if(!state.endpoint){render();return}
   if(state.status!=='ready'){if(!await connect())return}
   if(!state.fetchedAt || Date.now()-new Date(state.fetchedAt).getTime()>10*60*1000)await findMore(true);
  },
  refreshCards:()=>{if(state.items.length)render()}
 };
 render();
 if(state.endpoint)connect();
})();