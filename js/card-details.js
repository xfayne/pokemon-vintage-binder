(()=>{'use strict';
window.VintageCardDetails={create({state,MAP,$,esc,cardNumber,rarityHtml,dealAuctionUrl,toggleOwned,toggleWish,ensureCloudEdit,openMovePicker,save,renderCards,updatePurchasePrice}){
function showModal(id){const c=state.cards.find(c=>c.id===id);if(!c)return;const s=MAP.get(c.set);$('modalContent').innerHTML=`<div class="modal-main"><div><img class="modal-img" src="${esc(c.large)}" alt="${esc(c.name)}"></div><div class="modal-data"><div class="eyebrow" style="color:#697997;letter-spacing:.5px">${esc(s.name)} · ${s.year}</div><h3>${esc(c.name)}</h3><div class="card-sub">#${esc(cardNumber(c))}</div><p class="modal-rarity-only">${rarityHtml(c)}</p><div class="modal-own-row">
  <button type="button" class="btn ${state.owned[c.id]?'':'primary'}" id="modalOwned">${state.owned[c.id]?'✓ יש לי — הסר':'✓ יש לי'}</button>
  ${!state.owned[c.id]?`<button type="button" class="btn" id="modalWish">${state.wish[c.id]?'★ Wishlist':'☆ Wishlist'}</button>`:''}
  ${state.owned[c.id]||state.wish[c.id]?`<button type="button" class="btn" id="modalMove">${state.binderOrder.includes(c.id)?'📍 העבר':'＋ לבינדר'}</button>`:''}
  <a class="btn" href="${esc(dealAuctionUrl(c,true))}" target="_blank" rel="noopener noreferrer" title="חיפוש מכרזים ב־eBay">🔎 eBay ↗</a> </div><div class="modal-actions compact-details">
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
 $('modalOwned').onclick=()=>{toggleOwned(c.id);showModal(c.id)};
 const wishAction=$('modalWish');
 if(wishAction)wishAction.onclick=()=>{toggleWish(c.id);showModal(c.id)};
 const moveAction=$('modalMove');
 if(moveAction)moveAction.onclick=()=>{
  if(!ensureCloudEdit())return;
  $('modal').close();
  openMovePicker(c.id);
 };
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
 if(state.owned[c.id]){
  $('modalPurchaseAmount').onchange=()=>updatePurchasePrice(c.id);
  $('modalPurchaseCurrency').onchange=()=>updatePurchasePrice(c.id);
 }
 window.VintageMarketPrices?.show(c,s);
 if(!$('modal').open)$('modal').showModal();}

return {showModal};
}};
})();
