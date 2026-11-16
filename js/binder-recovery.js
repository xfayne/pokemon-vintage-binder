(()=>{'use strict';
// One-time, owner-initiated restoration of ONLY the binder positions.
// No app state is changed by historical reads or preview.
const $=id=>document.getElementById(id);
const dialog=$('binderRecoveryDialog');
if(!dialog)return;
const candidates=[],picker=$('binderRecoveryVersions'),apply=$('binderRecoveryApply'),status=$('binderRecoveryStatus'),preview=$('binderRecoveryPreview');
let scanning=false;
const cleanOrder=raw=>Array.isArray(raw)?[...new Set(raw.filter(id=>typeof id==='string'&&id.length>0&&id.length<100))].slice(0,1252):[];
const ownedNow=(p,id)=>!!(p.owned[id]||p.wish[id]||p.pendingPurchase[id]);
const available=(p,id)=>id.startsWith('__binder_empty__:')||(ownedNow(p,id)&&!p.binderExcluded[id]);
function mergeBinderOrder(historical,current){
 const seen=new Set(),order=[];
 for(const id of [...cleanOrder(historical),...cleanOrder(current.binderOrder)]){
  if(seen.has(id)||!available(current,id))continue;
  seen.add(id);order.push(id);
 }
 return order;
}
function setStatus(message){status.textContent=message;}
function selected(){return candidates[Number(picker.value)]||null;}
function describe(order){
 const cards=order.filter(id=>!id.startsWith('__binder_empty__:')).length;
 const pockets=order.length-cards;
 return cards+' קלפים · '+pockets+' כיסים שמורים כריקים';
}
function renderSelection(){
 const candidate=selected();apply.disabled=!candidate||!window.VintageCloud?.canEdit?.();
 if(!candidate){preview.textContent='בחר גרסה כדי לראות אילו מיקומים יוחזרו.';return;}
 const current=window.VintageBinder.getProgress(),merged=mergeBinderOrder(candidate.order,current);
 const differences=merged.reduce((count,id,i)=>count+(current.binderOrder[i]===id?0:1),0);
 const names=merged.slice(0,9).map(id=>{
  if(id.startsWith('__binder_empty__:'))return 'כיס ריק';
  return window.VintageBinder.getCardInfo(id)?.name||id;
 }).join(' · ');
 preview.textContent=candidate.label+' — '+describe(merged)+'. '+differences+
  ' מיקומים משתנים בהשוואה לסידור הנוכחי. תחילת הסידור: '+names+'.';
}
function updateOptions(){
 picker.replaceChildren(new Option('בחר גרסה לשחזור',''));
 candidates.forEach((c,i)=>picker.add(new Option(c.label+' — '+describe(c.order),String(i))));
 picker.value='';picker.disabled=!candidates.length;renderSelection();
}
function addCandidate(label,raw,source){
 const order=cleanOrder(raw);
 if(!order.length)return false;
 if(candidates.some(c=>JSON.stringify(c.order)===JSON.stringify(order)))return false;
 candidates.push({label,order,source});return true;
}
$('openBinderRecovery').addEventListener('click',()=>{
 $('accountMenu').hidden=true;$('accountTrigger').setAttribute('aria-expanded','false');
 if(!window.VintageCloud?.canEdit?.()){setStatus('יש להתחבר לחשבון Google לפני שחזור.');return;}
 setStatus('בחר גרסה היסטורית או גיבוי JSON. לא יבוצע שינוי עד שתאשר.');
 candidates.length=0;updateOptions();$('binderRecoveryFile').value='';dialog.showModal();
});
$('binderRecoveryClose').addEventListener('click',()=>dialog.close());
picker.addEventListener('change',renderSelection);
$('binderRecoveryScan').addEventListener('click',async()=>{
 if(scanning||!window.VintageCloud?.canEdit?.())return;
 scanning=true;$('binderRecoveryScan').disabled=true;
 const now=Date.now(),offsets=[5,10,15,20,25,30,35,40,45,50,55];
 let found=0,failed=0,lastError='';
 try{
  setStatus('בודק גרסאות קודמות של הבינדר, בקריאה בלבד…');
  const responses=await Promise.allSettled(offsets.map(async minutes=>{
   const at=new Date(now-minutes*60000).toISOString();
   const order=await window.VintageCloud.getHistoricalBinderOrder(at);
   return {minutes,order};
  }));
  for(let i=0;i<responses.length;i++){
   const r=responses[i];
   if(r.status==='fulfilled'){
    const {minutes,order}=r.value;
    if(addCandidate('לפני '+minutes+' דקות',order,'firestore'))found++;
   }else{failed++;lastError=String(r.reason?.message||r.reason);}
  }
  updateOptions();
  if(found)setStatus('נמצאו '+found+' גרסאות שונות. בחר את הגרסה שבה הסידור שלך עדיין היה תקין.');
  else setStatus('לא נמצאו גרסאות קודמות שונות. '+(lastError?
   'שגיאת Firestore: '+lastError.slice(0,190)+'; ':'')+
   'אפשר לנסות גיבוי JSON שנשמר לפני התקלה.');
 }catch(e){setStatus('החיפוש נכשל: '+String(e.message||e));}
 finally{scanning=false;$('binderRecoveryScan').disabled=false;}
});
$('binderRecoveryFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>8*1024*1024)throw Error('קובץ הגיבוי גדול מדי');
  const raw=JSON.parse(await file.text());
  const fields=raw?.fields?.progress?.mapValue?.fields?.binderOrder?.arrayValue?.values;
  const order=Array.isArray(raw.binderOrder)?raw.binderOrder:Array.isArray(fields)?fields.map(v=>v.stringValue):null;
  if(!Array.isArray(order)||!(raw.app==='pokemon-vintage-binder'||Array.isArray(fields)))throw Error('קובץ זה אינו גיבוי של הבינדר');
  if(addCandidate('גיבוי מקובץ '+file.name,order,'json')){
   updateOptions();picker.value=String(candidates.length-1);renderSelection();
   setStatus('הגיבוי נטען מקומית. בחר שחזור רק לאחר בדיקת התצוגה המקדימה.');
  }else setStatus('הקובץ כבר מופיע ברשימת הגרסאות, או שאינו מכיל סידור.');
 }catch(e){setStatus('לא ניתן לקרוא את הגיבוי: '+String(e.message||e));}
});
function downloadSafetyBackup(current){
 const data={app:'pokemon-vintage-binder',version:4,date:new Date().toISOString(),...current};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='pokemon-binder-before-recovery-'+new Date().toISOString().slice(0,10)+'.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),6000);
}
apply.addEventListener('click',()=>{
 const candidate=selected();if(!candidate||!window.VintageCloud?.canEdit?.())return;
 const current=window.VintageBinder.getProgress(),merged=mergeBinderOrder(candidate.order,current);
 if(!merged.length){setStatus('אין במקור כיסים שניתן לשחזר. לא בוצע שינוי.');return;}
 if(JSON.stringify(merged)===JSON.stringify(current.binderOrder)){
  setStatus('הסדר שנבחר זהה לסדר הנוכחי. אין צורך בשחזור.');return;
 }
 if(!confirm('לשחזר את סדר הבינדר לפי "'+candidate.label+'"?\n\n'+
  'רק מיקומי הבינדר ישתנו. משלוחים, רכישות, מחירים ו־Wishlist לא ישתנו. '+ 
  'גיבוי של המצב הנוכחי יורד לפני השינוי.'))return;
 try{
  downloadSafetyBackup(current);
  window.VintageBinder.adoptProgress({...current,binderOrder:merged});
  window.VintageCloud.onChange({immediate:true});
  setStatus('סדר הבינדר הוחזר ונשלח לשמירה בענן. יש לוודא שמופיע סטטוס ״נשמר בענן״.');
  dialog.close();
 }catch(e){setStatus('שחזור הסדר נכשל: '+String(e.message||e));}
});
})();