(()=>{'use strict';
// JSON backup/restore, owned-card CSV and Wishlist clipboard export.
// This module does not read/write Firestore directly: changes go through save().
window.VintageCollectionBackup={create({state,MAP,cardNumber,toast,getProgress,normalizeOrders,sortedOwnedCards,ensureCloudEdit,save,renderAll,normalizeShipment}){
function download(content,type,filename){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2500)}
function backup(){const data={app:'pokemon-vintage-binder',version:4,date:new Date().toISOString(),...getProgress()};download(JSON.stringify(data,null,2),'application/json;charset=utf-8','pokemon-vintage-my-collection.json');toast('נוצר גיבוי. שמור את הקובץ במקום בטוח.')}
async function copyWishlist(){
 normalizeOrders();
 if(!state.wishOrder.length){toast('רשימת המשאלות ריקה');return;}
 const lookup=new Map(state.cards.map(c=>[c.id,c]));
 const content=state.wishOrder.map(id=>{const card=lookup.get(id);return card?card.name+' — '+(MAP.get(card.set)?.name||'')+' #'+cardNumber(card):null;}).filter(Boolean).join('\n');
 try{await navigator.clipboard.writeText(content);toast('רשימת המשאלות הועתקה ללוח');}
 catch(error){const textarea=document.createElement('textarea');textarea.value=content;textarea.style.position='fixed';textarea.style.opacity='0';document.body.appendChild(textarea);textarea.select();const copied=document.execCommand('copy');textarea.remove();toast(copied?'רשימת המשאלות הועתקה ללוח':'לא ניתן להעתיק אוטומטית בדפדפן הזה');}
}
function exportCSV(){
 if(!state.ready){toast('חכה שהרשימה תיטען');return;}
 const cols=['Set','Number','Name','Type','Finish','Condition','1st Edition','Market Price USD','Purchase Price','Purchase Currency'];
 const rows=[cols,...sortedOwnedCards().map(c=>{
  const condition=state.conditions[c.id]||'';
  const market=condition?window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',condition,!!state.firstEdition[c.id]):null;
  return [MAP.get(c.set)?.name||'',cardNumber(c),c.name,c.kind,c.finish,condition,state.firstEdition[c.id]?'Yes':'No',typeof market==='number'?market:'',state.purchasePrices[c.id]?.amount??'',state.purchasePrices[c.id]?.currency||''];
 })];
 const csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 download(csv,'text/csv;charset=utf-8','pokemon-vintage-my-cards.csv');toast('קובץ הקלפים שלי נוצר.');
}
async function importBackup(file){if(!file||!ensureCloudEdit())return;try{const data=JSON.parse(await file.text());if(data.app!=='pokemon-vintage-binder'||typeof data.owned!=='object'||!data.owned||Array.isArray(data.owned))throw Error('invalid file');if(!confirm('הייבוא יחליף את סימוני הקלפים שיש לך כרגע. להמשיך?'))return;for(const k of ['owned','wish','removedWish','conditions','notes','purchasePrices','firstEdition','ownedAddedAt','binderExcluded'])state[k]=(data[k]&&typeof data[k]==='object'&&!Array.isArray(data[k]))?data[k]:{};for(const k of ['binderOrder','wishOrder'])state[k]=Array.isArray(data[k])?[...data[k]]:[];if(Array.isArray(data.shipments))state.shipments=data.shipments.map(normalizeShipment).filter(Boolean).slice(0,80);if(typeof data.binderIncludeWish==='boolean')state.binderIncludeWish=data.binderIncludeWish;normalizeOrders();save();renderAll();toast('הגיבוי יובא בהצלחה!')}catch(e){toast('לא ניתן לייבא: הקובץ אינו גיבוי תקין של האוסף.')}}

return {backup,copyWishlist,exportCSV,importBackup};
}};
})();
