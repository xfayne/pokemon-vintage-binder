(()=>{'use strict';
window.VintageCardDetails={create({state,MAP,$,esc,cardNumber,rarityHtml,dealAuctionUrl,openDealsForCard,toggleOwned,toggleWish,ensureCloudEdit,openMovePicker,save,renderCards,updatePurchasePrice}){
// Keep the open dialog and card photo mounted while updating only ownership controls.
function syncModalActions(id){
 const owned=!!state.owned[id],wished=!!state.wish[id];
 const ownButton=$('modalOwned');
 if(!ownButton)return;
 ownButton.classList.toggle('primary',owned);
 ownButton.setAttribute('aria-pressed',String(owned));
 ownButton.textContent=owned?'✓ יש לי — הסר':'＋ יש לי';
 ownButton.onclick=()=>{toggleOwned(id);syncModalActions(id);};
 let wishButton=$('modalWish');
 if(owned){wishButton?.remove();}
 else{
  if(!wishButton){
   wishButton=document.createElement('button');
   wishButton.type='button';wishButton.className='btn';wishButton.id='modalWish';
   ownButton.after(wishButton);
  }
  wishButton.textContent=wished?'★ Wishlist':'☆ Wishlist';
  wishButton.onclick=()=>{toggleWish(id);syncModalActions(id);};
 }
 let moveButton=$('modalMove');
 if(!owned&&!wished){moveButton?.remove();}
 else{
  if(!moveButton){
   moveButton=document.createElement('button');
   moveButton.type='button';moveButton.className='btn';moveButton.id='modalMove';
   $('modalDeals').before(moveButton);
  }
  moveButton.textContent=state.binderOrder.includes(id)?'📍 העבר':'＋ לבינדר';
  moveButton.onclick=()=>{
   if(!ensureCloudEdit())return;
   $('modal').close();openMovePicker(id);
  };
 }
 const purchase=$('modalPurchaseBox');
 purchase.hidden=!owned;
 if(owned){
  $('modalPurchaseAmount').onchange=()=>updatePurchasePrice(id);
  $('modalPurchaseCurrency').onchange=()=>updatePurchasePrice(id);
 }
}
function showModal(id){const c=state.cards.find(c=>c.id===id);if(!c)return;const s=MAP.get(c.set);$('modalContent').innerHTML=`<div class="modal-main"><div class="modal-photo-column"><div class="modal-media"><img class="modal-img" src="${esc(c.large)}" alt="${esc(c.name)}" decoding="async" fetchpriority="high"><span class="modal-photo-fallback" aria-hidden="true">✦</span></div></div><div class="modal-data"><div class="modal-meta-row"><span class="modal-set-name">${esc(s.name)} · ${s.year}</span><span class="modal-card-number card-sub">#${esc(cardNumber(c))}</span>${rarityHtml(c)}</div>
<div class="modal-title-row"><h3>${esc(c.name)}</h3><div class="modal-collection-actions">
 <button type="button" class="btn ${state.owned[c.id]?'primary':''}" id="modalOwned" aria-pressed="${!!state.owned[c.id]}">${state.owned[c.id]?'✓ יש לי — הסר':'＋ יש לי'}</button>
 ${!state.owned[c.id]?`<button type="button" class="btn" id="modalWish">${state.wish[c.id]?'★ Wishlist':'☆ Wishlist'}</button>`:''}
</div></div><div class="modal-own-row">
 ${state.owned[c.id]||state.wish[c.id]?`<button type="button" class="btn" id="modalMove">${state.binderOrder.includes(c.id)?'📍 העבר':'＋ לבינדר'}</button>`:''}
 <button type="button" class="btn primary" id="modalDeals">🔎 מציאות</button>
 <a class="btn" href="${esc(dealAuctionUrl(c,true))}" target="_blank" rel="noopener noreferrer" title="חיפוש מכרזים ב־eBay">eBay ↗</a>
</div><div class="modal-actions compact-details">
 <div class="condition-box">
  <label class="condition-label" for="modalCondition">מצב הקלף</label>
  <div class="condition-controls">
   <select id="modalCondition" aria-label="מצב הקלף"><option value="">בחר מצב</option>${['NM','LP','MP','HP','DMG'].map(v=>`<option value="${v}" ${state.conditions[c.id]===v?'selected':''}>${v}</option>`).join('')}</select>
   <label class="first-edition-flag" title="1st Edition" aria-label="1st Edition"><input id="modalFirstEdition" type="checkbox" ${state.firstEdition[c.id]?'checked':''}><span>1st</span></label>
  </div>
 </div>
 <div class="compact-market" id="modalPricePanel" aria-live="polite"></div>
 <div class="purchase-field" id="modalPurchaseBox" ${state.owned[c.id]?'':'hidden'}>
  <label class="purchase-heading" for="modalPurchaseAmount">💰 כמה שילמתי?</label>
  <div class="purchase-controls">
   <input type="number" id="modalPurchaseAmount" inputmode="decimal" min="0" max="1000000000" step="0.01" placeholder="סכום" value="${state.purchasePrices[c.id]?.amount??''}" aria-label="מחיר הרכישה">
   <select id="modalPurchaseCurrency" aria-label="מטבע הרכישה">
    ${[['ILS','₪'],['EUR','€'],['USD','$']].map(([code,label])=>`<option value="${code}" ${(state.purchasePrices[c.id]?.currency||'ILS')===code?'selected':''}>${label}</option>`).join('')}
   </select>
  </div>
 </div>
</div></div></div>`;
 // Aspect-ratio reserves the exact media footprint before network/decode finishes.
 const photo=$('modalContent').querySelector('.modal-img'),frame=photo.parentElement;
 const reveal=()=>{frame.classList.add('is-ready');photo.classList.add('is-ready');};
 const failed=()=>frame.classList.add('has-error');
 photo.addEventListener('load',reveal,{once:true});
 photo.addEventListener('error',failed,{once:true});
 if(photo.complete){if(photo.naturalWidth>0)reveal();else failed();}
 syncModalActions(c.id);
 $('modalDeals').onclick=()=>{$('modal').close();openDealsForCard(c.id);};
 $('modalCondition').onchange=e=>{
  const v=e.target.value;
  if(window.VintageCloud?.canEdit?.()){
    if(v)state.conditions[c.id]=v;else delete state.conditions[c.id];
    save();renderCards();
  }
  window.VintageMarketPrices?.refresh();
 };
 $('modalFirstEdition').onchange=e=>{
  if(window.VintageCloud?.canEdit?.()){
    if(e.target.checked)state.firstEdition[c.id]=true;else delete state.firstEdition[c.id];
    save();
  }
  window.VintageMarketPrices?.refresh();
 };
 window.VintageMarketPrices?.show(c,s);
 if(!$('modal').open)$('modal').showModal();}

return {showModal};
}};
})();
