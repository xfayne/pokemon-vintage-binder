(()=>{'use strict';
// The collection's single in-memory state and the cloud-edit/save bridge.
// Persistent storage remains exclusively in firebase-cloud.js / Firestore.
window.VintageCollectionState={create({$,normalizeOrders,renderAll,renderCollections,toast}){
const state={cards:[],owned:{},wish:{},pendingPurchase:{},removedWish:{},conditions:{},notes:{},purchasePrices:{},firstEdition:{},ownedAddedAt:{},shipments:[],analyticsSnapshots:[],binderExcluded:{},binderOrder:[],wishOrder:[],binderIncludeWish:true,binderPage:0,view:'catalog',active:'all',selectedSets:[],extras:false,holoOnly:false,pokemonOnly:true,status:'all',sort:'num',query:'',limit:96,ready:false,failures:[]};
function cleanPurchaseDate(raw){
 const value=typeof raw==='string'?raw:'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
 const d=new Date(value+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:'';
}
function normalizeShipment(raw){
 if(!raw||typeof raw!=='object')return null;
 const number=String(raw.number||'').trim().toUpperCase();
 if(number&&!/^[A-Z0-9-]{5,50}$/.test(number))return null;
 const id=String(raw.id||'').slice(0,70);
 if(!/^[a-z0-9_-]{8,70}$/i.test(id))return null;
 return {id,number,title:String(raw.title||'').slice(0,70),carrier:Number(raw.carrier)||0,cardIds:Array.isArray(raw.cardIds)?[...new Set(raw.cardIds.filter(x=>typeof x==='string'&&x.length<50))].slice(0,60):[],seenEventIds:Array.isArray(raw.seenEventIds)?[...new Set(raw.seenEventIds.filter(x=>typeof x==='string'&&x.length<100))].slice(0,200):[],initialized:raw.initialized===true,createdAt:Number(raw.createdAt)||0,...(cleanPurchaseDate(raw.purchaseDate)?{purchaseDate:cleanPurchaseDate(raw.purchaseDate)}:{}),...(typeof raw.note==='string'&&raw.note.trim()?{note:raw.note.slice(0,1000)}:{}),...(Number(raw.deliveredAt)>0?{deliveredAt:Number(raw.deliveredAt)}:{})};
}
function getProgress(){normalizeOrders();return {owned:{...state.owned},wish:{...state.wish},pendingPurchase:{...state.pendingPurchase},removedWish:{...state.removedWish},conditions:{...state.conditions},notes:{...state.notes},purchasePrices:{...state.purchasePrices},firstEdition:{...state.firstEdition},ownedAddedAt:{...state.ownedAddedAt},shipments:state.shipments.map(x=>({...x,cardIds:[...x.cardIds],seenEventIds:[...x.seenEventIds]})),analyticsSnapshots:window.VintageCollectionAnalytics.normalizeSnapshots(state.analyticsSnapshots),binderExcluded:{...state.binderExcluded},binderIncludeWish:state.binderIncludeWish,binderOrder:[...state.binderOrder],wishOrder:[...state.wishOrder]}}
function validPart(raw){return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}
function adoptProgress(value){for(const k of ['owned','wish','pendingPurchase','removedWish','conditions','notes','purchasePrices','firstEdition','ownedAddedAt','binderExcluded'])state[k]={...validPart(value?.[k])};for(const id of Object.keys(state.removedWish))delete state.wish[id];state.ownedAddedAt={...validPart(value?.ownedAddedAt)};state.analyticsSnapshots=window.VintageCollectionAnalytics.normalizeSnapshots(value?.analyticsSnapshots);state.shipments=Array.isArray(value?.shipments)?value.shipments.map(normalizeShipment).filter(Boolean).slice(0,80):[];state.binderIncludeWish=typeof value?.binderIncludeWish==='boolean'?value.binderIncludeWish:true;for(const k of ['binderOrder','wishOrder'])state[k]=Array.isArray(value?.[k])?[...value[k]]:[];normalizeOrders();renderAll();}
function ensureCloudEdit(){if(window.VintageCloud?.canEdit?.())return true;
 toast('כדי לשמור שינויים צריך להתחבר ל־Google ולהמתין לטעינת האוסף.');
 const dialog=$('cloudDialog');if(dialog&&!dialog.open)dialog.showModal();return false;}
function save(immediately=false){if(!ensureCloudEdit())return;window.VintageCloud.onChange({immediate:immediately});renderCollections({skipHidden:state.view==='catalog'});}
return {state,getProgress,adoptProgress,ensureCloudEdit,save,normalizeShipment};
}};
})();
