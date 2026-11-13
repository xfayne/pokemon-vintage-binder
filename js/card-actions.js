(()=>{'use strict';
window.VintageCardActions={create({state,$,ensureCloudEdit,normalizeOrders,save,refreshCard,toast,showModal}){
function toggleOwned(id){
 if(!ensureCloudEdit())return;
 if(state.owned[id]){
  delete state.owned[id];
  delete state.ownedAddedAt[id];
 }else{
  state.owned[id]=true;
  const max=Object.values(state.ownedAddedAt).reduce((n,t)=>Math.max(n,Number(t)||0),0);
  state.ownedAddedAt[id]=Math.max(Date.now(),max+1);
  // Owned and Wishlist are mutually exclusive. Persist the removal in the same cloud write.
  if(state.wish[id]||state.wishOrder.includes(id)){
   delete state.wish[id];
   state.wishOrder=state.wishOrder.filter(cardId=>cardId!==id);
   state.removedWish[id]=Date.now();
  }
 }
 normalizeOrders();save(true);refreshCard(id);
}
function removeWish(id){
 if(!ensureCloudEdit())return;
 if(!state.wish[id]&&!state.wishOrder.includes(id))return;
 delete state.wish[id];
 state.removedWish[id]=Date.now(); // Persist a tombstone to prevent stale snapshots resurrecting a deleted wishlist entry.
 state.wishOrder=state.wishOrder.filter(x=>x!==id);
 if(!state.owned[id])state.binderOrder=state.binderOrder.filter(x=>x!==id);
 normalizeOrders();save(true);refreshCard(id);toast('הקלף הוסר מרשימת המשאלות ונשלח למחיקה בענן.');
}
function toggleWish(id){
 if(!ensureCloudEdit())return;
 if(state.owned[id]){toast('הקלף כבר נמצא באוסף שלך');return;}
 if(state.wish[id]){removeWish(id);return;}
 state.wish[id]=true;delete state.removedWish[id];
 normalizeOrders();save(true);refreshCard(id);
}
function updatePurchasePrice(id){
 if(!ensureCloudEdit()){showModal(id);return;}
 const amountField=$('modalPurchaseAmount'), currencyField=$('modalPurchaseCurrency');
 const raw=String(amountField.value||'').trim().replace(',','.');
 if(raw===''){delete state.purchasePrices[id];save();return;}
 const amount=Number(raw);
 if(!Number.isFinite(amount)||amount<0||amount>1000000000){toast('הכנס סכום רכישה תקין');return;}
 const currency=['ILS','EUR','USD'].includes(currencyField.value)?currencyField.value:'ILS';
 state.purchasePrices[id]={amount:Math.round(amount*100)/100,currency};
 save();
}

return {toggleOwned,removeWish,toggleWish,updatePurchasePrice};
}};
})();
