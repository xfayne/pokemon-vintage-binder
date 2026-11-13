(()=>{'use strict';
window.VintageOwnedCards={create({state,MAP,$,SETS,showHolo,normalNum,searchKey,searchText,rarityHtml,esc,cardNumber,renderCollections}){
function sortedOwnedCards(){
 const own=state.cards.filter(c=>state.owned[c.id]), mode=$('ownedSort').value;
 const setIndex=c=>SETS.findIndex(s=>s.id===c.set);
 const added=(a,b)=>(Number(state.ownedAddedAt[b.id])||0)-(Number(state.ownedAddedAt[a.id])||0);
 const price=c=>{
  const condition=state.conditions[c.id];if(!condition)return -1;
  const value=window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',condition,!!state.firstEdition[c.id]);
  return typeof value==='number'?value:-1;
 };
 if(mode==='holo')own.sort((a,b)=>Number(showHolo(b))-Number(showHolo(a))||added(a,b));
 else if(mode==='set')own.sort((a,b)=>setIndex(a)-setIndex(b)||normalNum(a)-normalNum(b));
 else if(mode==='price')own.sort((a,b)=>price(b)-price(a)||added(a,b));
 else own.sort(added);
 return own;
}
let ownedRenderTimer=null;
function refreshOwned(){
 // Market data is shared by My Cards and Wishlist; either list must update when prices arrive.
 if(!['owned','wishlist','deals'].includes(state.view)||ownedRenderTimer)return;
 ownedRenderTimer=setTimeout(()=>{
  ownedRenderTimer=null;
  if(state.view==='owned')renderOwnedList();
  else if(state.view==='wishlist'||state.view==='deals')renderCollections();
 },120);
}
window.VintageBinder.refreshOwned=refreshOwned;
function renderOwnedTotalValue(cards){
 const label=$('ownedTotalValue');
 let total=0,priced=0,pending=0;
 for(const card of cards){
  const condition=state.conditions[card.id];
  if(!condition)continue;
  const price=window.VintageMarketPrices?.getOwnedPrice?.(card,MAP.get(card.set)?.name||'',condition,!!state.firstEdition[card.id]);
  if(typeof price==='number'&&Number.isFinite(price)){total+=price;priced++;}
  else if(price===undefined)pending++;
 }
 const all=cards.length;
 const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(total);
 label.textContent=all===0?usd:priced===0&&pending?'טוען מחירים…':priced===0?'—':usd;
 label.title='שווי שוק משוער של '+priced+' מתוך '+all+' קלפים לפי מצב והדפסה'+(pending?' · '+pending+' מחירים בטעינה':'')+'.';
}
function renderOwnedList(){
 const own=sortedOwnedCards();
 renderOwnedTotalValue(own);
 $('ownedCountTab').textContent=own.length;
 $('ownedCount').textContent=own.length+' קלפים · '+own.filter(showHolo).length+' Holo / Shining';
 const q=searchKey($('ownedFind').value);
 const matched=own.filter(c=>!q||searchText(c).includes(q));
 const markup=matched.length?matched.map(c=>{
  const inBinder=state.binderOrder.includes(c.id),condition=state.conditions[c.id]||'';
  const market=condition?window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',condition,!!state.firstEdition[c.id]):null;
  const amount=typeof market==='number'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(market):'';
  return `<article class="owned-item" role="listitem" tabindex="0" data-open-owned="${esc(c.id)}" aria-label="פרטים על ${esc(c.name)}">
   <img loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}">
   <div class="owned-copy"><strong>${esc(c.name)}</strong><small>${esc(MAP.get(c.set)?.name||'')} · #${esc(cardNumber(c))}</small><div class="badges">${rarityHtml(c)}</div></div>
   ${condition?`<div class="owned-meta" aria-label="מצב הקלף ומחיר השוק">
      ${amount?`<span class="owned-price">${esc(amount)}</span>`:market===undefined?'<span class="owned-price pending">טוען מחיר…</span>':''}
      <span class="owned-condition">${esc(condition)}${state.firstEdition[c.id]?' · 1st':''}</span>
    </div>`:''}
  </article>`}).join(''):`<div class="no-cards">${own.length?'לא נמצאו קלפים מתאימים לחיפוש.':'עוד אין קלפים ברשימה. אפשר לסמן ״יש לי״ בקטלוג.'}</div>`;
 window.VintageStableDOM.reconcileHTML($('ownedItems'),markup,'data-open-owned');
}

return {sortedOwnedCards,refreshOwned,renderOwnedList};
}};
})();
