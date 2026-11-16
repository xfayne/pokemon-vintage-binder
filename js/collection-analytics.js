/* Read-only collection analytics with compact, owner-only aggregate snapshots.
   Collection history shares the existing Firestore progress document and save bridge:
   no new permissions, no writes to binderOrder, and never a separate stale write. */
(()=>{'use strict';
const MAX_DAYS=180;
const money=(value)=>Number.isFinite(value)?(window.VintageCurrency?.format(value,'USD')||'—'):'—';
const pct=value=>Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(2)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isValid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const round=n=>Math.round(n*100)/100;
function normalizeSnapshots(raw){
 if(!Array.isArray(raw))return [];
 const unique=new Map();
 for(const row of raw.slice(-MAX_DAYS*2)){
  if(!row||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(row.date||''))continue;
  const data={date:row.date};
  for(const key of ['totalValue','purchasedValue','paidCost','matchedCost','matchedValue','pricedCount','priceableCount','purchasedCount','ownedCount','pendingCount','index']){
   const v=Number(row[key]);
   if(Number.isFinite(v)&&v>=0)data[key]=v;
  }
  if(!isValid(data.index)||!isValid(data.totalValue))continue;
  if(row.prices&&typeof row.prices==='object'&&!Array.isArray(row.prices)){
   const prices={};
   for(const [id,price] of Object.entries(row.prices).slice(0,1300)){
    if(id.length>100||!isValid(Number(price)))continue;
    prices[id]=round(Number(price));
   }
   data.prices=prices;
  }
  unique.set(data.date,data);
 }
 const sorted=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-MAX_DAYS);
 // Only the last two snapshots retain per-card prices for computing future market-only changes.
 for(const row of sorted.slice(0,-2))delete row.prices;
 return sorted;
}
function summarize({cards,owned,pendingPurchase,purchasePrices,conditions,firstEdition,priceFor,toUSD}){
 let totalValue=0,purchasedValue=0,paidCost=0,matchedCost=0,matchedValue=0;
 let pricedCount=0,priceableCount=0,purchasedCount=0,missingPaidFx=0,unpricedPurchased=0,pendingPrices=0;
 const prices={},rows=[];
 let ownedCount=0,pendingCount=0;
 for(const card of cards||[]){
  const id=card.id,isOwned=!!owned[id],isPending=!isOwned&&!!pendingPurchase[id];
  if(!isOwned&&!isPending)continue;
  if(isOwned)ownedCount++;else pendingCount++;
  const purchase=purchasePrices[id];
  const hasPaid=purchase&&isValid(Number(purchase.amount))&&purchase.amount!==''&&purchase.amount!==null;
  const paid=hasPaid?toUSD(Number(purchase.amount),purchase.currency||'ILS'):null;
  if(hasPaid){purchasedCount++;if(isValid(paid))paidCost+=paid;else missingPaidFx++;}
  const grade=conditions[id],first=!!firstEdition[id];
  let price=null;
  if(grade){
   priceableCount++;
   price=priceFor(card,grade,first);
   if(price===undefined)pendingPrices++;
   if(isValid(price)){
    totalValue+=price;pricedCount++;
    prices[id+'|'+grade+'|'+(first?'1':'0')]=round(price);
    if(hasPaid){purchasedValue+=price;if(isValid(paid)){matchedValue+=price;matchedCost+=paid;}}
   }else if(hasPaid)unpricedPurchased++;
  }else if(hasPaid)unpricedPurchased++;
  rows.push({card,owned:isOwned,paid,hasPaid,price:isValid(price)?price:null,grade:grade||''});
 }
 return {totalValue,purchasedValue,paidCost,matchedCost,matchedValue,pricedCount,priceableCount,purchasedCount,ownedCount,pendingCount,missingPaidFx,unpricedPurchased,pendingPrices,prices,rows};
}
function createSnapshot(summary,date,previous){
 const snapshot={date,totalValue:round(summary.totalValue),purchasedValue:round(summary.purchasedValue),
  paidCost:round(summary.paidCost),matchedCost:round(summary.matchedCost),matchedValue:round(summary.matchedValue),
  pricedCount:summary.pricedCount,priceableCount:summary.priceableCount,purchasedCount:summary.purchasedCount,
  ownedCount:summary.ownedCount,pendingCount:summary.pendingCount,prices:{...summary.prices},index:100};
 if(previous&&isValid(previous.index)){
  const prevPrices=previous.prices||{};
  let old=0,current=0;
  for(const [key,price] of Object.entries(summary.prices)){
   const past=prevPrices[key];
   if(isValid(past)&&past>0){old+=past;current+=price;}
  }
  snapshot.index=round((old>0?previous.index*current/old:previous.index));
 }
 return snapshot;
}
function latestDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function create({state,MAP,$,save}){
 const page=$('ownedPage'),panel=page?.querySelector('.collection-panel');
 if(!panel)return {render:()=>{}};
 const meta=panel.querySelector('.owned-meta-row'),search=$('ownedFind'),items=$('ownedItems');
 if(!meta||!search||!items)return {render:()=>{}};
 const tabs=document.createElement('div');tabs.className='owned-analytics-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','תצוגת הקלפים שלי');
 tabs.innerHTML='<button type="button" role="tab" data-owned-pane="cards" aria-selected="true">קלפים</button><button type="button" role="tab" data-owned-pane="summary" aria-selected="false">סיכום</button>';
 const list=document.createElement('div');list.className='owned-analytics-list';list.id='ownedAnalyticsList';
 const summaryPane=document.createElement('section');summaryPane.className='owned-analytics-summary';summaryPane.id='ownedAnalyticsSummary';summaryPane.hidden=true;summaryPane.setAttribute('role','tabpanel');
 panel.insertBefore(tabs,meta);panel.insertBefore(list,meta);list.append(meta,search,items);panel.insertBefore(summaryPane,list.nextSibling);
 let pane='cards',period='all',metric='return',details=false,lastSignature='',timer=null;
 const priceFor=(card,condition,first)=>window.VintageMarketPrices?.getOwnedPrice?.(card,MAP.get(card.set)?.name||'',condition,first);
 const toUSD=(amount,currency)=>window.VintageCurrency?.toUSD?.(amount,currency);
 const current=()=>summarize({...state,priceFor,toUSD});
 function showPane(next){
  pane=next==='summary'?'summary':'cards';
  list.hidden=pane!=='cards';summaryPane.hidden=pane!=='summary';
  tabs.querySelectorAll('[data-owned-pane]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.ownedPane===pane)));
  render();
 }
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-owned-pane]');if(b)showPane(b.dataset.ownedPane);});
 const periodLabels={week:'7 ימים',month:'חודש',quarter:'3 חודשים',all:'הכול'};
 const periodMs={week:7*864e5,month:30*864e5,quarter:90*864e5};
 function history(){
  const all=normalizeSnapshots(state.analyticsSnapshots);
  if(period==='all')return all;
  const after=Date.now()-periodMs[period];
  return all.filter(s=>new Date(s.date+'T00:00:00').getTime()>=after);
 }
 function formatValue(value){return metric==='return'?pct(value):money(value);}
 function chartMarkup(series){
  if(series.length<2)return '<div class="analytics-no-history">התרשים יופיע לאחר שיצטברו לפחות שתי מדידות בימים שונים. אנחנו לא ממציאים תשואות היסטוריות.</div>';
  const first=series[0],last=series[series.length-1],baseline=metric==='return'?first.index:first.matchedValue-first.matchedCost;
  const values=series.map(s=>metric==='return'?(first.index>0?(s.index/first.index-1)*100:0):s.matchedValue-s.matchedCost);
  const low=Math.min(0,...values),high=Math.max(0,...values),range=Math.max(1,high-low);
  const W=680,H=220,left=20,right=660,top=18,bottom=184;
  const points=values.map((v,i)=>({x:left+(series.length===1?0:i/(series.length-1))*(right-left),y:bottom-(v-low)/range*(bottom-top),v}));
  const line=points.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
  const area=line+' L'+points[points.length-1].x.toFixed(1)+' '+bottom+' L'+left+' '+bottom+' Z';
  const stroke=values.at(-1)>=0?'#14856a':'#b75261';
  const zeroY=bottom-(0-low)/range*(bottom-top);
  const labels='<text x="20" y="212">'+esc(first.date.slice(5).split('-').reverse().join('.'))+'</text><text x="660" y="212" text-anchor="end">'+esc(last.date.slice(5).split('-').reverse().join('.'))+'</text>';
  return '<svg class="analytics-chart" role="img" aria-label="תרשים התפתחות התשואה לתקופה" viewBox="0 0 680 220" preserveAspectRatio="none">'+
   '<line x1="20" x2="660" y1="'+zeroY+'" y2="'+zeroY+'" stroke="#d9e1ec" stroke-dasharray="4 4"/>'+
   '<path d="'+area+'" fill="'+stroke+'" opacity=".09"/>'+
   '<path d="'+line+'" fill="none" stroke="'+stroke+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'+
   '<circle cx="'+points.at(-1).x+'" cy="'+points.at(-1).y+'" r="4" fill="'+stroke+'"/>'+
   '<g fill="currentColor" font-size="13" opacity=".66">'+labels+'</g>'+
   '<rect x="20" y="10" width="640" height="180" fill="transparent" data-analytics-chart-hit="1"/></svg>'+
   '<div class="analytics-chart-focus" id="analyticsChartFocus" aria-live="polite">העבר את האצבע על הגרף כדי לראות מדידה</div>';
 }
 function render(){
  if(state.view!=='owned'||pane!=='summary')return;
  const s=current(),hist=history(),first=hist[0],last=hist.at(-1);
  const change=hist.length>=2?(first.index>0?(last.index/first.index-1)*100:null):null;
  const roi=s.matchedCost>0?(s.matchedValue/s.matchedCost-1)*100:null;
  const balance=s.matchedValue-s.matchedCost;
  const seriesChange=metric==='return'?change:(last?last.matchedValue-last.matchedCost:null);
  const changedColor=Number.isFinite(seriesChange)?(seriesChange>=0?'is-positive':'is-negative'):'';
  const gapClass=balance>=0?'is-positive':'is-negative';
  const valueText=metric==='return'?(change===null?'—':pct(change)):(last?money(last.matchedValue-last.matchedCost):'—');
  const content=details?renderDetails(s):'<div class="analytics-intro"><h3>הסיכום הכספי שלי</h3><p>קלפים באוסף וקלפים שנרכשו ועדיין בדרך</p></div>'+
   '<div class="analytics-stats">'+
    stat('סך רכישות מתועדות',s.missingPaidFx?'—':money(s.paidCost),s.purchasedCount+' קלפים')+
    stat('שווי הרכישות',money(s.purchasedValue),s.unpricedPurchased+' קלפים ללא מחיר שוק')+
    stat('פער על הנייר',s.missingPaidFx?'—':money(balance),roi===null?'לרכישות עם מחיר שוק ועלות':pct(roi)+' על עלות מתועדת',gapClass)+
    stat('שווי האוסף הכולל',money(s.totalValue),s.pricedCount+' קלפים עם מחירון')+
   '</div>'+
   '<div class="analytics-chart-panel"><div class="analytics-chart-header"><h3>ביצועי האוסף</h3><span class="analytics-muted">נתונים אמיתיים בלבד</span></div>'+
    '<div class="analytics-segments" role="group" aria-label="סוג מדד">'+
     segment('return','תשואה (%)',metric)+segment('gap','פער מול עלות',metric)+'</div>'+
    '<div class="analytics-big '+changedColor+'">'+valueText+'</div>'+
    '<div class="analytics-muted">'+(metric==='return'?'שינוי מחירי הקלפים המשותפים בין המדידות, ללא השפעת רכישות חדשות':'פער היסטורי בין שווי הרכישות המתומחרות לעלותן')+'</div>'+
    chartMarkup(hist)+
    '<div class="analytics-segments analytics-periods" role="group" aria-label="תקופה">'+Object.keys(periodLabels).map(p=>segment(p,periodLabels[p],period)).join('')+'</div>'+
    '<div class="analytics-disclaimer">התשואה משוערת ואינה TWR רשמית: קלפים שהתווספו, הוסרו או שינו מצב בין מדידות אינם נכללים בהשוואת המחירים. המחירים משוערים ואינם מחירי מכירה מובטחים.</div>'+
   '</div>'+
   '<div class="analytics-footnote">'+
    '<b>כיסוי נתונים:</b> '+s.pricedCount+' מתוך '+s.priceableCount+' קלפים עם מצב שנקבע ומחירון; '+s.purchasedCount+' עם מחיר רכישה.'+
    (s.pendingPrices?' '+s.pendingPrices+' מחירים עדיין בטעינה.':'')+
    (s.missingPaidFx?' שערי מטבע לחלק מהרכישות עדיין לא זמינים.':'')+
    '<br>עלות משלוח לא נשמרת עדיין באפליקציה, ולכן אינה כלולה בנתון ההוצאה.'+
    '<br>קלפים מהילדות ללא מחיר קנייה נכללים בשווי הכולל, אך לא בתשואה על עלות הרכישות.'+
    '<br>נשמרת מדידה לכל יום שבו פותחים את ״הקלפים שלי״ עם מחירים זמינים; אין כרגע איסוף בימים שבהם לא נכנסים לאפליקציה.'+
   '</div>'+
   '<button type="button" class="btn analytics-details-btn" data-analytics-details="1">פירוט הרכישות ←</button>';
  summaryPane.innerHTML=content;
  const hit=summaryPane.querySelector('[data-analytics-chart-hit]');
  if(hit){hit.addEventListener('pointermove',event=>{
    const rect=hit.getBoundingClientRect(),x=(event.clientX-rect.left)/Math.max(rect.width,1);
    const index=Math.max(0,Math.min(hist.length-1,Math.round(x*(hist.length-1))));
    const entry=hist[index],first=hist[0];
    const shown=metric==='return'?(first.index>0?(entry.index/first.index-1)*100:0):(entry.matchedValue-entry.matchedCost);
    const target=summaryPane.querySelector('#analyticsChartFocus');
    if(target)target.textContent=entry.date.split('-').reverse().join('.')+' · '+formatValue(shown);
   });}
  maybeSnapshot(s);
 }
 function stat(label,value,sub,cls=''){return '<div class="analytics-stat"><span>'+esc(label)+'</span><strong class="'+cls+'">'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>';}
 function segment(value,label,selected){return '<button type="button" class="'+(value===selected?'selected':'')+'" aria-pressed="'+(value===selected)+'" data-analytics-segment="'+esc(value)+'">'+esc(label)+'</button>';}
 function renderDetails(s){
  const rows=s.rows.filter(r=>r.hasPaid).sort((a,b)=>(b.paid||0)-(a.paid||0));
  return '<div class="analytics-details-heading"><button type="button" class="btn sm" data-analytics-details="0">→ חזרה לסיכום</button><h3>פירוט רכישות</h3></div>'+
   '<div class="analytics-muted">המחירים אינם כוללים משלוח. קלפים בדרך מסומנים בנפרד.</div>'+
   '<div class="analytics-purchase-list">'+(rows.length?rows.map(r=>'<article class="analytics-purchase-row" data-open-owned="'+esc(r.card.id)+'" role="button" tabindex="0">'+
    '<div><strong>'+esc(r.card.name)+'</strong><small>'+esc(MAP.get(r.card.set)?.name||'')+' · '+esc(r.grade||'מצב לא ידוע')+(r.owned?'':' · בדרך')+'</small></div>'+
    '<div class="analytics-purchase-amount"><strong>'+esc(money(r.paid))+'</strong><small>שווי: '+esc(money(r.price))+'</small></div></article>').join(''):'<div class="analytics-no-history">עדיין לא הזנת מחירי רכישה.</div>')+'</div>';
 }
 summaryPane.addEventListener('click',e=>{
  const seg=e.target.closest('[data-analytics-segment]');
  if(seg){const key=seg.dataset.analyticsSegment;if(['return','gap'].includes(key))metric=key;if(Object.hasOwn(periodLabels,key))period=key;render();return;}
  const toggle=e.target.closest('[data-analytics-details]');if(toggle){details=toggle.dataset.analyticsDetails==='1';render();}
 });
 function maybeSnapshot(s){
  if(!state.ready||!window.VintageCloud?.canEdit?.())return;
  if(!s.priceableCount||s.pendingPrices||s.pricedCount!==s.priceableCount||s.missingPaidFx)return;
  const today=latestDate();
  const rows=normalizeSnapshots(state.analyticsSnapshots);
  const prior=rows.filter(row=>row.date<today).at(-1);
  const fresh=createSnapshot(s,today,prior);
  const existing=rows.find(row=>row.date===today);
  // Do not rewrite Firestore unless the measurement meaningfully changed.
  const signature=JSON.stringify([fresh.date,fresh.totalValue,fresh.paidCost,fresh.pricedCount,fresh.ownedCount,fresh.pendingCount,fresh.index,fresh.prices]);
  if(existing&&JSON.stringify([existing.date,existing.totalValue,existing.paidCost,existing.pricedCount,existing.ownedCount,existing.pendingCount,existing.index,existing.prices])===signature)return;
  if(lastSignature===signature||timer)return;
  timer=setTimeout(()=>{
   timer=null;
   if(!window.VintageCloud?.canEdit?.()||state.view!=='owned')return;
   const newer=normalizeSnapshots(state.analyticsSnapshots);
   const previous=newer.filter(row=>row.date<today).at(-1);
   const next=createSnapshot(current(),today,previous);
   const nextSummary=current();
   if(nextSummary.pendingPrices||nextSummary.pricedCount!==nextSummary.priceableCount||nextSummary.missingPaidFx)return;
   const updated=normalizeSnapshots([...newer.filter(row=>row.date!==today),next]);
   const old=JSON.stringify(state.analyticsSnapshots||[]);
   const now=JSON.stringify(updated);
   if(old===now)return;
   state.analyticsSnapshots=updated;
   lastSignature=signature;
   save();
  },500);
 }
 return {render,showPane};
}
window.VintageCollectionAnalytics={create,summarize,createSnapshot,normalizeSnapshots};
})();