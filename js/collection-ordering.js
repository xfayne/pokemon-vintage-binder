(()=>{'use strict';
window.VintageCollectionOrdering={create({state,ensureCloudEdit,save}){
// Collection organization: separate binder positions and wishlist priorities.
function normalizeOrders(){
 // Historic collections lack timestamps. Key order is the best available approximation.
 const legacyIds=Object.keys(state.owned).filter(id=>state.owned[id]);
 legacyIds.forEach((id,i)=>{if(!Number.isFinite(Number(state.ownedAddedAt[id]))||Number(state.ownedAddedAt[id])<=0)state.ownedAddedAt[id]=i+1;});
 for(const id of Object.keys(state.ownedAddedAt))if(!state.owned[id])delete state.ownedAddedAt[id];
 for(const id of Object.keys(state.removedWish||{}))delete state.wish[id];
 // Normalize older cloud backups that previously allowed both states.
 for(const id of Object.keys(state.owned))if(state.owned[id])delete state.wish[id];
 const keys = new Set(state.cards.map(c=>c.id));
 const valid = (arr,predicate) => [...new Set((Array.isArray(arr)?arr:[]).filter(id=>keys.has(id)&&predicate(id)))];
 const bySet=state.cards.map(c=>c.id);
 const wish = id=>!!state.wish[id];const binder=id=>!!(state.owned[id]||state.wish[id])&&!state.binderExcluded[id];
 state.wishOrder=valid(state.wishOrder,wish);
 const wp=new Set(state.wishOrder);for(const id of bySet)if(wish(id)&&!wp.has(id)){state.wishOrder.push(id);wp.add(id);}
 state.binderOrder=valid(state.binderOrder,binder);
 const bp=new Set(state.binderOrder);for(const id of bySet)if(binder(id)&&!bp.has(id)){state.binderOrder.push(id);bp.add(id);}
}
function binderVisible(){normalizeOrders();return state.binderOrder.slice();}
function binderPageCount(){return Math.max(1,Math.ceil(binderVisible().length/9));}
function reorder(kind,from,to){if(!ensureCloudEdit())return;normalizeOrders();const arr=kind==='wishlist'?[...state.wishOrder]:binderVisible();if(from<0||to<0||from>=arr.length||to>=arr.length||from===to)return;
 const [moved]=arr.splice(from,1);arr.splice(to,0,moved);
 if(kind==='wishlist')state.wishOrder=arr;
 else{const movingSet=new Set(arr);let n=0;state.binderOrder=state.binderOrder.map(id=>movingSet.has(id)?arr[n++]:id);state.binderPage=Math.floor(to/9);}
 save();
}
return {normalizeOrders,binderVisible,binderPageCount,reorder};
}};
})();
