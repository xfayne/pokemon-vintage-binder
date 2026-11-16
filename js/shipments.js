(()=>{'use strict';
window.VintageShipments={create({state,MAP,cardNumber,esc,$,ensureCloudEdit,save,toast}){
/* Shipping events are fetched live from 17TRACK; Firestore stores only parcel
   metadata, linked card IDs and which remote event IDs were already read. */
const shipmentLive=new Map();
let shipmentEditingId=null,shipmentSelectedIds=new Set(),shipmentExpandedId=null,shipmentRefreshing=false,shipmentLastFetch=0,shipmentServiceError='';
const SHIPMENT_API='https://pokemon-vintage-ebay-deals.xfayne.workers.dev';
const SHIPMENT_STATUS={
 InfoReceived:'פרטי משלוח התקבלו',InTransit:'בדרך',AvailableForPickup:'ממתין לאיסוף',
 OutForDelivery:'יוצא למסירה',Delivered:'נמסר',DeliveryFailure:'בעיה במסירה',
 Exception:'חריגה במשלוח',Expired:'מעקב הסתיים',NotFound:'ממתין למידע',Unknown:'ממתין לעדכון'
};
function shipmentStatus(status){return SHIPMENT_STATUS[status]||status||'ממתין לעדכון';}
function shipmentEventTime(raw){
 if(!raw)return '';
 const d=new Date(raw);
 return Number.isFinite(d.getTime())?d.toLocaleString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(raw).slice(0,35);
}
function shipmentNewEvents(item){
 const live=shipmentLive.get(item.id);
 return item.initialized&&Array.isArray(live?.events)?live.events.filter(e=>!item.seenEventIds.includes(e.id)):[];
}
function shipmentCount(){
 return state.shipments.reduce((n,item)=>n+shipmentNewEvents(item).length,0);
}
// A card becomes purchased only when explicitly assigned to an active shipment.
// Remember Wishlist provenance so removing a shipment link is reversible.
function removeWishlist(id){
 if(!state.wish[id]&&!state.wishOrder.includes(id))return;
 delete state.wish[id];
 state.wishOrder=state.wishOrder.filter(x=>x!==id);
 state.binderOrder=state.binderOrder.filter(x=>x!==id);
 state.removedWish[id]=Date.now();
}
function markPending(id){
 if(state.owned[id])return;
 if(!state.pendingPurchase[id])state.pendingPurchase[id]={wasWish:!!state.wish[id]};
 removeWishlist(id);
}
function markOwned(id){
 const alreadyOwned=!!state.owned[id];
 state.owned[id]=true;
 delete state.pendingPurchase[id];
 removeWishlist(id);
 if(!alreadyOwned){
  const max=Object.values(state.ownedAddedAt).reduce((n,t)=>Math.max(n,Number(t)||0),0);
  state.ownedAddedAt[id]=Math.max(Date.now(),max+1);
 }
}
function restoreUnlinked(ids){
 const restored=[];
 for(const id of ids){
  const meta=state.pendingPurchase[id];
  if(!meta||state.owned[id]||state.shipments.some(s=>!s.deliveredAt&&s.cardIds.includes(id)))continue;
  delete state.pendingPurchase[id];
  if(meta.wasWish){state.wish[id]=true;delete state.removedWish[id];}
  restored.push(id);
 }
 return restored;
}
function refreshCards(ids){
 for(const id of new Set(ids))window.VintageBinder?.refreshCatalogCard?.(id);
}
function deliverShipment(id){
 const item=state.shipments.find(s=>s.id===id);
 if(!item||item.deliveredAt||!ensureCloudEdit())return;
 if(!confirm('לסמן את המשלוח כנמסר ולהעביר את כל הקלפים שבו ל״יש לי״?'))return;
 item.deliveredAt=Date.now();
 for(const cardId of item.cardIds)markOwned(cardId);
 save(true);refreshCards(item.cardIds);toast('המשלוח סומן כנמסר והקלפים הועברו לאוסף.');
}
function renderShipments(){
 const badge=$('shipmentUnreadTab');
 const count=shipmentCount();
 badge.hidden=!count;badge.textContent=count>99?'99+':String(count);
 const notice=$('shipmentNotice');
 notice.textContent=shipmentServiceError||'משלוחים עם מספר מעקב מתעדכנים מ־17TRACK; משלוחים בלי מספר מנוהלים כאן ידנית. הנתונים נשמרים בחשבון הפרטי.';
 if(state.view!=='shipments')return;
 $('shipmentRefresh').disabled=shipmentRefreshing;
 $('shipmentRefresh').textContent=shipmentRefreshing?'מעדכן…':'↻ עדכון';
 const lookup=new Map(state.cards.map(c=>[c.id,c]));
 const markup=state.shipments.length?state.shipments.map(item=>{
  const live=shipmentLive.get(item.id),unread=shipmentNewEvents(item).length,expanded=shipmentExpandedId===item.id;
  const cards=item.cardIds.map(id=>lookup.get(id)).filter(Boolean);
  const latestEvent=Array.isArray(live?.events)?live.events[0]:null;
  const status=item.deliveredAt?'✓ נמסר':!item.number?'ללא מעקב':live?.error?'אין עדכון':shipmentStatus(live?.status);
  const latestContent=latestEvent?.description?`<div class="shipment-latest"><span class="shipment-latest-icon" aria-hidden="true">🚚</span><div class="shipment-latest-body"><div class="shipment-latest-description">${esc(latestEvent.description)}</div>${latestEvent.time?`<time class="shipment-latest-date">${esc(shipmentEventTime(latestEvent.time))}</time>`:''}</div></div>`:'';
  const images=cards.slice(0,6).map(c=>`<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" title="${esc(c.name)}">`).join('');
  const events=live?.events||[];
  const timeline=`<div class="shipment-timeline-region ${expanded?'is-expanded':''}" aria-hidden="${!expanded}"><div class="shipment-timeline-collapse"><div class="shipment-timeline">${live?.error?`<p class="shipment-label">${esc(live.error.message||'אין עדיין נתוני מעקב')}</p>`:events.length?events.map(event=>`<div class="shipment-event"><span class="shipment-dot" aria-hidden="true"></span><div class="shipment-event-main"><strong>${esc(event.description||shipmentStatus(event.stage))}</strong><small>${esc([shipmentEventTime(event.time),event.location].filter(Boolean).join(' · '))}</small></div></div>`).join(''):'<p class="shipment-label">עדיין אין אירועי מעקב זמינים. נסה לרענן בהמשך.</p>'}</div></div></div>`;
  return `<article class="shipment-entry ${unread?'is-new':''}" data-shipment-id="${esc(item.id)}">
   <div class="shipment-entry-top"><div><h3 class="shipment-entry-title">${esc(item.title||'משלוח')}</h3><div class="shipment-tracking-number" ${item.number?'dir="ltr"':''}>${item.number?esc(item.number):"אין מספר מעקב"}</div><div class="shipment-label">${cards.length} קלפים משויכים</div></div><span class="shipment-status">${esc(status)}</span></div>
   ${latestContent}
   ${item.note?`<div class="shipment-private-note">📝 ${esc(item.note)}</div>`:""}
   <div class="shipment-actions-row">
    ${cards.length?`<div class="shipment-card-images">${images}${cards.length>6?`<span class="shipment-label">+${cards.length-6}</span>`:''}</div>`:'<span></span>'}
    <div class="shipment-actions">${!item.deliveredAt?`<button class="btn sm ship-deliver" type="button" data-ship-deliver="${esc(item.id)}">✓ סמן כנמסר</button>`:""}${item.number?`<button class="btn sm" type="button" data-ship-open="${esc(item.id)}" aria-expanded="${expanded}">${expanded?'⌃ סגור':'⌄ עדכונים'} ${unread?`<span class="shipment-new">${unread} חדשים</span>`:''}</button>`:""}
    <details class="shipment-menu"><summary aria-label="אפשרויות משלוח">⋯</summary><div class="shipment-menu-options">
     <button type="button" data-ship-edit="${esc(item.id)}">עריכה</button>
     ${live?.error?.code===-18019902?`<button type="button" data-ship-register="${esc(item.id)}">רישום מעקב</button>`:''}
     <button type="button" class="shipment-remove" data-ship-delete="${esc(item.id)}">מחיקה</button>
    </div></details></div>
   </div>
   ${timeline}
  </article>`;
 }).join(''):'<div class="shipment-empty">אין משלוחים עדיין. לחץ על ״+ משלוח״ כדי לנהל רכישה ולשייך אליה קלפים, גם בלי מספר מעקב.</div>';
 window.VintageStableDOM.reconcileHTML($('shipmentList'),markup,'data-shipment-id');
}
function openShipmentEditor(id=null){
 if(!ensureCloudEdit())return;
 shipmentEditingId=id;
 const shipment=state.shipments.find(x=>x.id===id);
 shipmentSelectedIds=new Set(shipment?.cardIds||[]);
 $('shipmentDialogTitle').textContent=shipment?'עריכת משלוח':'משלוח חדש';
 $('shipmentName').value=shipment?.title||'';
 $('shipmentNumber').value=shipment?.number||'';
 $('shipmentNote').value=shipment?.note||'';
 $('shipmentCardSearch').value='';
 renderShipmentPicker();
 $('shipmentDialog').showModal();
}
function renderShipmentPicker(){
 const picked=$('shipmentSelected'),query=$('shipmentCardSearch').value.toLowerCase().trim();
 const byId=new Map(state.cards.map(c=>[c.id,c]));
 picked.innerHTML=[...shipmentSelectedIds].map(id=>byId.get(id)).filter(Boolean).map(c=>`<button type="button" data-ship-unpick="${esc(c.id)}">${esc(c.name)} ×</button>`).join('');
 const matches=state.cards.filter(c=>{
  if(!query)return !!(state.wish[c.id]||state.owned[c.id]||state.pendingPurchase[c.id]);
  return (c.name+' '+c.id+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')).toLowerCase().includes(query);
 }).sort((a,b)=>(Number(!!state.wish[b.id])-Number(!!state.wish[a.id]))||(Number(!!state.pendingPurchase[b.id])-Number(!!state.pendingPurchase[a.id]))||(Number(!!state.owned[b.id])-Number(!!state.owned[a.id]))).slice(0,18);
 const choicesMarkup=matches.length?matches.map(c=>`<button type="button" class="shipment-card-choice ${shipmentSelectedIds.has(c.id)?'selected':''}" data-ship-pick="${esc(c.id)}"><img src="${esc(c.image)}" alt="" loading="lazy"><span>${esc(c.name)}<small>${esc(MAP.get(c.set)?.name||'')} · #${esc(cardNumber(c))}</small></span><strong>${shipmentSelectedIds.has(c.id)?'✓':'+'}</strong></button>`).join(''):'<p class="shipment-label">חפש קלף בקטלוג כדי לשייך אותו.</p>';
 window.VintageStableDOM.reconcileHTML($('shipmentCardResults'),choicesMarkup,'data-ship-pick');
}
function markShipmentRead(id){
 const item=state.shipments.find(x=>x.id===id),events=shipmentLive.get(id)?.events;
 if(!item||!Array.isArray(events)||!events.length||!ensureCloudEdit())return;
 const ids=[...new Set(events.map(e=>e.id))].slice(0,200);
 if(ids.every(k=>item.seenEventIds.includes(k))&&item.initialized)return;
 item.seenEventIds=ids;item.initialized=true;
 save();
}
function shipmentApiMessage(code){
 if(code==='TRACKING_NOT_CONFIGURED')return 'המעקב עוד לא פעיל: צריך להגדיר ב־Cloudflare את TRACK17_API_KEY ו־TRACK17_OWNER_EMAIL.';
 if(code==='TRACKING_AUTH_REQUIRED')return 'אין הרשאה לשירות המעקב. בדוק שמייל החשבון תואם ל־TRACK17_OWNER_EMAIL.';
 return 'לא ניתן למשוך עדכונים כרגע ('+String(code||'שגיאת חיבור')+').';
}
async function shipmentRequest(route,body){
 const token=await window.VintageCloud?.getIdToken?.();
 if(!token)throw Error('התחבר לחשבון Google כדי לעדכן משלוחים.');
 const response=await fetch(SHIPMENT_API+'/api/shipments/'+route,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store'});
 const data=await response.json().catch(()=>({error:'INVALID_RESPONSE'}));
 if(!response.ok)throw Error(shipmentApiMessage(data.error||response.status));
 return data;
}
async function registerShipment(item){
 if(!item?.number||!window.VintageCloud?.canEdit?.())return;
 try{
  const response=await shipmentRequest('register',{number:item.number,carrier:item.carrier||undefined});
  const result=response.shipments?.find(x=>x.number===item.number);
  if(result?.registered){
   const actual=state.shipments.find(x=>x.id===item.id&&x.number===item.number);
   if(actual&&result.carrier&&actual.carrier!==result.carrier){actual.carrier=result.carrier;save();}
   shipmentServiceError='';
   await refreshShipments(true);
  }else shipmentServiceError='לא ניתן לרשום את מספר המעקב: '+(result?.error?.message||'שגיאה בשירות');
 }catch(err){shipmentServiceError=err.message;}
 renderShipments();
}
async function refreshShipments(force=false){
 if(shipmentRefreshing||!window.VintageCloud?.canEdit?.()||!state.shipments.some(x=>x.number)){renderShipments();return;}
 if(!force&&Date.now()-shipmentLastFetch<120000){renderShipments();return;}
 shipmentRefreshing=true;shipmentServiceError='';renderShipments();
 const tracked=state.shipments.filter(x=>x.number).map(x=>({id:x.id,number:x.number,carrier:x.carrier||undefined}));
 let shouldSave=false,anySuccess=false;
 try{
  for(let offset=0;offset<tracked.length;offset+=12){
   const group=tracked.slice(offset,offset+12);
   const data=await shipmentRequest('track',{shipments:group.map(x=>({number:x.number,carrier:x.carrier}))});
   for(const result of (data.shipments||[])){
    const item=state.shipments.find(x=>x.number===result.number);
    if(!item||!group.some(x=>x.id===item.id))continue;
    if(result.error){shipmentLive.set(item.id,{error:result.error,status:'',events:[]});continue;}
    anySuccess=true;
    shipmentLive.set(item.id,result);
    if(result.carrier&&item.carrier!==result.carrier){item.carrier=result.carrier;shouldSave=true;}
    // Existing parcel history is a baseline, not a set of unread notifications.
    if(!item.initialized&&result.events?.length){
     item.seenEventIds=[...new Set(result.events.map(e=>e.id))].slice(0,200);
     item.initialized=true;shouldSave=true;
    }
   }
  }
  if(anySuccess)shipmentLastFetch=Date.now();
  if(shouldSave&&window.VintageCloud?.canEdit?.())save();
 }catch(error){shipmentServiceError=error.message;}
 finally{shipmentRefreshing=false;renderShipments();}
}
window.VintageBinder.refreshShipments=()=>refreshShipments();
$('shipmentAdd').addEventListener('click',()=>openShipmentEditor());
$('shipmentRefresh').addEventListener('click',()=>{shipmentLastFetch=0;refreshShipments(true);});
$('shipmentCancel').addEventListener('click',()=>$('shipmentDialog').close());
$('shipmentCancelTop').addEventListener('click',()=>$('shipmentDialog').close());
$('shipmentCardSearch').addEventListener('input',renderShipmentPicker);
$('shipmentCardResults').addEventListener('click',e=>{
 const target=e.target.closest('[data-ship-pick]');if(!target)return;
 const id=target.dataset.shipPick;
 if(shipmentSelectedIds.has(id))shipmentSelectedIds.delete(id);else shipmentSelectedIds.add(id);
 renderShipmentPicker();
});
$('shipmentSelected').addEventListener('click',e=>{
 const target=e.target.closest('[data-ship-unpick]');if(!target)return;
 shipmentSelectedIds.delete(target.dataset.shipUnpick);renderShipmentPicker();
});
$('shipmentForm').addEventListener('submit',e=>{
 e.preventDefault();if(!ensureCloudEdit())return;
 const number=$('shipmentNumber').value.trim().toUpperCase(),title=$('shipmentName').value.trim().slice(0,70),note=$('shipmentNote').value.trim().slice(0,1000);
 if(number&&!/^[A-Z0-9-]{5,50}$/.test(number)){toast('מספר המעקב אינו תקין');return;}
 if(!number&&!title){toast('למשלוח ללא מספר מעקב צריך לתת שם');return;}
 if(number&&state.shipments.some(x=>x.number===number&&x.id!==shipmentEditingId)){toast('המשלוח כבר קיים');return;}
 let item=state.shipments.find(x=>x.id===shipmentEditingId),fresh=!item;
 const numberChanged=!fresh&&item.number!==number;
 if(fresh){
  item={id:crypto.randomUUID().replace(/-/g,''),number,title,cardIds:[],seenEventIds:[],initialized:false,carrier:0,createdAt:Date.now()};
  state.shipments.unshift(item);
 }else if(numberChanged){
  item.number=number;item.carrier=0;item.seenEventIds=[];item.initialized=false;shipmentLive.delete(item.id);
 }
 const previousIds=[...item.cardIds];
 item.title=title;item.cardIds=[...shipmentSelectedIds].slice(0,60);
 if(note)item.note=note;else delete item.note;
 const changed=new Set([...previousIds,...item.cardIds]);
 for(const id of item.cardIds){
  if(item.deliveredAt)markOwned(id);
  else markPending(id);
 }
 restoreUnlinked(previousIds);
 $('shipmentDialog').close();save(true);refreshCards(changed);
 // Register the number only when first added (or explicitly changed).
 if(number&&!item.deliveredAt&&(fresh||numberChanged||!item.initialized&&!shipmentLive.has(item.id)))registerShipment(item);
});
$('shipmentList').addEventListener('click',e=>{
 const control=e.target.closest('[data-ship-open],[data-ship-edit],[data-ship-delete],[data-ship-register],[data-ship-deliver]');
 if(!control)return;const {shipOpen,shipEdit,shipDelete,shipRegister,shipDeliver}=control.dataset;
 if(shipDeliver){deliverShipment(shipDeliver);return;}
 if(shipEdit){openShipmentEditor(shipEdit);return;}
 if(shipRegister){const item=state.shipments.find(x=>x.id===shipRegister);if(item)registerShipment(item);return;}
 if(shipDelete){
  const item=state.shipments.find(x=>x.id===shipDelete);
  if(!item||!ensureCloudEdit()||!confirm('למחוק את המשלוח "'+(item.title||item.number)+'"?'))return;
  state.shipments=state.shipments.filter(x=>x.id!==shipDelete);shipmentLive.delete(shipDelete);
  restoreUnlinked(item.cardIds);
  if(shipmentExpandedId===shipDelete)shipmentExpandedId=null;save(true);refreshCards(item.cardIds);return;
 }
 if(shipOpen){shipmentExpandedId=shipmentExpandedId===shipOpen?null:shipOpen;if(shipmentExpandedId)markShipmentRead(shipOpen);renderShipments();}
});

return {renderShipments,refreshShipments};
}};
})();
