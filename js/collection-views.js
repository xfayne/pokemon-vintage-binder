(()=>{'use strict';
window.VintageCollectionViews={create({state,MAP,$,esc,cardNumber,normalizeOrders,renderShipments,binderPageCount,refreshPlacementTargets,binderVisible,renderOwnedList,renderDeals}){
function renderCollections(){if(!state.ready)return;normalizeOrders();renderShipments();
 $('binderCountTab').textContent=state.binderOrder.length+' קלפים';$('wishCountTab').textContent=state.wishOrder.length;
 $('binderCount').textContent=state.binderOrder.filter(id=>state.owned[id]).length+' באוסף · '+state.binderOrder.filter(id=>!state.owned[id]&&state.wish[id]).length+' משאלות';
 $('wishCount').textContent=state.wishOrder.length+' משאלות';
 $('binderIncludeWish').checked=state.binderIncludeWish;
 if($('binderTargetPage').options.length!==binderPageCount()||!$('binderTargetSlot').options.length)refreshPlacementTargets();
 const list=binderVisible();const pageCount=Math.max(1,Math.ceil(list.length/9));state.binderPage=Math.min(Math.max(0,state.binderPage),pageCount-1);
 const cardLookup=new Map(state.cards.map(c=>[c.id,c]));
 $('binderGrid').innerHTML=Array.from({length:9},(_,slot)=>{const idx=state.binderPage*9+slot,id=list[idx];if(!id)return `<div class="binder-pocket empty" aria-label="כיס ריק"></div>`;
 const c=cardLookup.get(id);if(!c)return '<div class="binder-pocket empty"></div>';
 const owned=!!state.owned[id],muted=!owned&&!state.binderIncludeWish;
 return `<article class="binder-pocket ${owned?'':'wish'} ${muted?'wish-muted':''}" role="listitem" data-order-kind="binder" data-order-index="${idx}" data-card-id="${esc(id)}">
 <span class="pocket-badge ${owned?'owned':''}">${owned?'✓ שלי':muted?'☆ משאלה מוסתרת':'☆ משאלה'}</span>
 <img loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}" data-preview="${esc(id)}" onerror="this.style.opacity='.3'">
 <div class="pocket-title">${esc(c.name)}</div><div class="pocket-sub">${esc(MAP.get(c.set)?.name||'')} #${esc(cardNumber(c))}</div>
 <div class="pocket-actions"><button type="button" data-binder-move="${esc(id)}" aria-label="בחר מיקום חדש עבור ${esc(c.name)}">↗ העבר</button><button type="button" class="binder-remove" data-binder-remove="${esc(id)}" aria-label="הסר את ${esc(c.name)} מהבינדר בלבד">✕ הסר</button></div>
 <div class="reorder-row"><button type="button" aria-label="מקום קודם" data-move-kind="binder" data-move-index="${idx}" data-move-delta="-1" ${idx===0?'disabled':''}>↑</button><button type="button" class="drag-handle" data-drag-kind="binder" data-drag-index="${idx}" aria-label="גרור לשינוי הסדר">⋮⋮</button><button type="button" aria-label="מקום הבא" data-move-kind="binder" data-move-index="${idx}" data-move-delta="1" ${idx===list.length-1?'disabled':''}>↓</button></div></article>`}).join('');
 $('binderBook').hidden=list.length===0;$('binderPager').hidden=list.length===0;$('binderEmpty').hidden=list.length!==0;
 $('binderPageLabel').textContent='עמוד '+(state.binderPage+1)+' מתוך '+pageCount;
 $('binderPrev').disabled=state.binderPage===0;$('binderNext').disabled=state.binderPage>=pageCount-1;
 $('wishlistItems').innerHTML=state.wishOrder.length?state.wishOrder.map((id,i)=>{
  const c=cardLookup.get(id);if(!c)return '';
  const condition=state.conditions[id]||'';
  const market=condition?window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',condition,!!state.firstEdition[id]):null;
  const amount=typeof market==='number'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(market):'';
  return `<article class="wish-item" role="listitem" data-order-kind="wishlist" data-order-index="${i}" data-drag-kind="wishlist" data-drag-index="${i}" data-open-wish="${esc(id)}" tabindex="0" aria-label="פרטים על ${esc(c.name)}">
   <span class="wish-rank" data-drag-kind="wishlist" data-drag-index="${i}" title="גרור כדי לשנות את הסדר" aria-label="גרור כדי לשנות את הסדר">${i+1}</span>
   <img loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}" data-drag-kind="wishlist" data-drag-index="${i}" title="גרור לשינוי הסדר · הקש לפתיחת פרטים" draggable="false">
   <div class="wish-copy"><strong>${esc(c.name)}</strong><small>${esc(MAP.get(c.set)?.name||'')} · #${esc(cardNumber(c))}</small></div>
   <div class="wish-side">
    ${condition?`<div class="wish-market">
     ${amount?`<span class="owned-price">${esc(amount)}</span>`:market===undefined?'<span class="owned-price pending">טוען…</span>':''}
     <span class="owned-condition">${esc(condition)}${state.firstEdition[id]?' · 1st':''}</span>
    </div>`:''}
    <button type="button" class="btn sm wish-move-action" data-wish-move="${esc(id)}" aria-label="שנה מיקום של ${esc(c.name)} ב־Wishlist">↗ העבר</button>
   </div>
  </article>`;
 }).join(''):
 `<div class="no-cards">Wishlist עדיין ריקה. סמן ☆ ליד קלף בקטלוג כדי להוסיף אותו. <button type="button" class="btn sm primary" data-view-btn="catalog">לקטלוג</button></div>`;
 renderOwnedList();
 if(state.view==='deals')renderDeals();
}
return {renderCollections};
}};
})();
