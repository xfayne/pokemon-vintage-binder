(()=>{'use strict';
const EMPTY_PREFIX='__binder_empty__:';
const isEmptyPocket=id=>typeof id==='string'&&id.startsWith(EMPTY_PREFIX);
const newEmptyPocket=()=>EMPTY_PREFIX+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
window.VintageCollectionOrdering={isEmptyPocket,create({state,ensureCloudEdit,save}){
// Collection organization: separate binder positions and wishlist priorities.
// A reserved empty pocket is a unique string in binderOrder. Existing Firestore,
// backups and shared-reader arrays already support ordered string IDs.
function normalizeOrders(){
 const legacyIds=Object.keys(state.owned).filter(id=>state.owned[id]);
 legacyIds.forEach((id,i)=>{if(!Number.isFinite(Number(state.ownedAddedAt[id]))||Number(state.ownedAddedAt[id])<=0)state.ownedAddedAt[id]=i+1;});
 for(const id of Object.keys(state.ownedAddedAt))if(!state.owned[id])delete state.ownedAddedAt[id];
 for(const id of Object.keys(state.removedWish||{}))delete state.wish[id];
 for(const id of Object.keys(state.owned))if(state.owned[id])delete state.wish[id];
 const keys=new Set(state.cards.map(c=>c.id));
 const valid=(arr,predicate)=>[...new Set((Array.isArray(arr)?arr:[]).filter(id=>predicate(id)))];
 const bySet=state.cards.map(c=>c.id);
 const wish=id=>keys.has(id)&&!!state.wish[id];
 const binder=id=>keys.has(id)&&!!(state.owned[id]||state.wish[id])&&!state.binderExcluded[id];
 state.wishOrder=valid(state.wishOrder,wish);
 const wp=new Set(state.wishOrder);for(const id of bySet)if(wish(id)&&!wp.has(id)){state.wishOrder.push(id);wp.add(id);}
 state.binderOrder=valid(state.binderOrder,id=>isEmptyPocket(id)||binder(id));
 const bp=new Set(state.binderOrder);for(const id of bySet)if(binder(id)&&!bp.has(id)){state.binderOrder.push(id);bp.add(id);}
}
function binderVisible(){normalizeOrders();return state.binderOrder.slice();}
function binderPageCount(){return Math.max(1,Math.ceil(binderVisible().length/9));}
function reorder(kind,from,to){
 if(!ensureCloudEdit())return false;
 normalizeOrders();
 const arr=kind==='wishlist'?[...state.wishOrder]:binderVisible();
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=arr.length||to>=arr.length||from===to||isEmptyPocket(arr[from]))return false;
 if(kind==='binder'&&isEmptyPocket(arr[to])){
  // Filling a reserved pocket keeps the total page layout intact: move its gap
  // into the old position instead of shifting unrelated cards.
  [arr[from],arr[to]]=[arr[to],arr[from]];
 }else{
  const [moved]=arr.splice(from,1);arr.splice(to,0,moved);
 }
 if(kind==='wishlist')state.wishOrder=arr;
 else{state.binderOrder=arr;state.binderPage=Math.floor(to/9);}
 save();return true;
}
function markEmptyPocket(index){
 if(!ensureCloudEdit())return false;
 const list=binderVisible(),max=binderPageCount()*9;
 if(!Number.isInteger(index)||index<0||index>=max||isEmptyPocket(list[index]))return false;
 // The last page can have implicit, not yet reserved, empty pockets. Make
 // preceding implicit positions explicit so the requested slot stays fixed.
 while(list.length<index)list.push(newEmptyPocket());
 list.splice(index,0,newEmptyPocket());
 state.binderOrder=list;save();return true;
}
function clearEmptyPocket(index){
 if(!ensureCloudEdit())return false;
 const list=binderVisible();
 if(!Number.isInteger(index)||!isEmptyPocket(list[index]))return false;
 list.splice(index,1);
 state.binderOrder=list;save();return true;
}
function movePage(from,to){
 if(!ensureCloudEdit())return false;
 const list=binderVisible(),count=binderPageCount();
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from>count||to>count||from===to)return false;
 const pages=Array.from({length:count},(_,i)=>list.slice(i*9,i*9+9));
 const [moved]=pages.splice(from-1,1);pages.splice(to-1,0,moved);
 // A partial last page can move into the middle. Its trailing holes must
 // become reserved, otherwise the following page would merge into it.
 for(let i=0;i<pages.length-1;i++)
  while(pages[i].length<9)pages[i].push(newEmptyPocket());
 state.binderOrder=pages.flat();
 state.binderPage=to-1;
 save();return true;
}
return {normalizeOrders,binderVisible,binderPageCount,reorder,markEmptyPocket,clearEmptyPocket,movePage};
}};
})();
