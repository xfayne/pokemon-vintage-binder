
(()=>{'use strict';
const ROOT='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/';
const {SETS,OFFLINE_PACKS}=window.VintageCatalogData;
const MAP=new Map(SETS.map(s=>[s.id,s]));const BASE_COUNT=SETS.filter(s=>s.group!=='Extra').reduce((n,s)=>n+s.count,0);
function embeddedCards(){
 const cards=[]; const rarityNames={H:'Rare Holo',S:'Rare Shining',R:'Rare',U:'Uncommon',C:'Common',E:'',P:'Promo'};
 for(const set of SETS){
  const pack=OFFLINE_PACKS[set.id];if(!pack)continue;
  const names=pack[0].split('|');let i=0;
  for(const spec of pack[1].split(';')){
   const [endString,type]=spec.split(':');const end=Number(endString);
   for(;i<end;i++){
    const number=i+1;let kind=number<=pack[2]?'Pokémon':pack[3]!==null&&number>=pack[3]?'Energy':'Trainer';
    if(set.id==='base5'&&[17,80,81,82].includes(number))kind='Energy';
    if(set.id==='base1'&&number===96)kind='Energy';
    if(set.id==='neo1'&&[19,104,105].includes(number))kind='Energy';
    if(set.id==='neo4'&&number===16)kind='Energy';
    if(set.id==='base6'&&[100,101].includes(number))kind='Energy';
    if(set.id==='basep'&&[16,40,41,42].includes(number))kind='Trainer';
    let finish=type==='H'?'holo':type==='S'?'shining':type==='P'?'unknown':'normal';
    if(set.id==='si1'&&[1,4,7,11,14,17].includes(number))finish='holo';
    const total=set.id==='basep'?null:set.id==='base5'?82:set.id==='neo3'?64:set.id==='neo4'?105:set.count;
    cards.push({id:set.id+'-'+number,set:set.id,name:names[i],number:String(number),total,rarity:set.id==='base5'&&number===83?'Rare Secret':rarityNames[type],finish,kind,image:'https://images.pokemontcg.io/'+set.id+'/'+number+'.png',large:'https://images.pokemontcg.io/'+set.id+'/'+number+'_hires.png'});
   }
  }
  if(names.length!==i)throw Error('Incomplete embedded set '+set.id);
 }
 cards.push({id:'movie2000-ancient-mew',set:'movie2000',name:'Ancient Mew',number:'ללא מספר',total:null,rarity:'Movie Promo Holo',finish:'holo',kind:'Pokémon',image:'assets/ancient-mew.jpg',large:'assets/ancient-mew.jpg'});
 return cards;
}

const $=id=>document.getElementById(id);
const state={cards:[],owned:{},wish:{},removedWish:{},conditions:{},notes:{},purchasePrices:{},firstEdition:{},ownedAddedAt:{},shipments:[],binderExcluded:{},binderOrder:[],wishOrder:[],binderIncludeWish:true,binderPage:0,view:'catalog',active:'all',extras:false,holoOnly:false,pokemonOnly:false,status:'all',sort:'num',query:'',limit:96,ready:false,failures:[]};
function normalizeShipment(raw){
 if(!raw||typeof raw!=='object')return null;
 const number=String(raw.number||'').trim().toUpperCase();
 if(!/^[A-Z0-9-]{5,50}$/.test(number))return null;
 const id=String(raw.id||'').slice(0,70);
 if(!/^[a-z0-9_-]{8,70}$/i.test(id))return null;
 return {id,number,title:String(raw.title||'').slice(0,70),carrier:Number(raw.carrier)||0,cardIds:Array.isArray(raw.cardIds)?[...new Set(raw.cardIds.filter(x=>typeof x==='string'&&x.length<50))].slice(0,60):[],seenEventIds:Array.isArray(raw.seenEventIds)?[...new Set(raw.seenEventIds.filter(x=>typeof x==='string'&&x.length<100))].slice(0,200):[],initialized:raw.initialized===true,createdAt:Number(raw.createdAt)||0};
}
function getProgress(){normalizeOrders();return {owned:{...state.owned},wish:{...state.wish},removedWish:{...state.removedWish},conditions:{...state.conditions},notes:{...state.notes},purchasePrices:{...state.purchasePrices},firstEdition:{...state.firstEdition},ownedAddedAt:{...state.ownedAddedAt},shipments:state.shipments.map(x=>({...x,cardIds:[...x.cardIds],seenEventIds:[...x.seenEventIds]})),binderExcluded:{...state.binderExcluded},binderIncludeWish:state.binderIncludeWish,binderOrder:[...state.binderOrder],wishOrder:[...state.wishOrder]}}
function validPart(raw){return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}}
function adoptProgress(value){for(const k of ['owned','wish','removedWish','conditions','notes','purchasePrices','firstEdition','ownedAddedAt','binderExcluded'])state[k]={...validPart(value?.[k])};for(const id of Object.keys(state.removedWish))delete state.wish[id];state.ownedAddedAt={...validPart(value?.ownedAddedAt)};state.shipments=Array.isArray(value?.shipments)?value.shipments.map(normalizeShipment).filter(Boolean).slice(0,80):[];state.binderIncludeWish=typeof value?.binderIncludeWish==='boolean'?value.binderIncludeWish:true;for(const k of ['binderOrder','wishOrder'])state[k]=Array.isArray(value?.[k])?[...value[k]]:[];normalizeOrders();renderAll();}
function ensureCloudEdit(){if(window.VintageCloud?.canEdit?.())return true;
 toast('כדי לשמור שינויים צריך להתחבר ל־Google ולהמתין לטעינת האוסף.');
 const dialog=$('cloudDialog');if(dialog&&!dialog.open)dialog.showModal();return false;}
function save(immediately=false){if(!ensureCloudEdit())return;window.VintageCloud.onChange({immediate:immediately});renderCollections();}
window.VintageBinder={getProgress,adoptProgress,getCardInfo:(id)=>{const c=state.cards.find(x=>x.id===id);return c?{id:c.id,name:c.name,image:c.image,setName:MAP.get(c.set)?.name||""}:null}};
window.VintageDealBridge={
 getWishlistCards:()=>{
  normalizeOrders();
  const lookup=new Map(state.cards.map(c=>[c.id,c]));
  return state.wishOrder.filter(id=>state.wish[id]&&!state.owned[id]).map((id,index)=>{
   const c=lookup.get(id);
   return c?{id,rank:index+1,name:c.name,number:cardNumber(c),setName:MAP.get(c.set)?.name||'',image:c.image,condition:state.conditions[id]||'',firstEdition:!!state.firstEdition[id],finish:c.finish||null}:null;
  }).filter(Boolean);
 },
 getMarketPrice:(id,grade)=>{
  const c=state.cards.find(c=>c.id===id);
  return c&&['NM','LP','MP','HP','DMG'].includes(grade)?window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',grade,!!state.firstEdition[id]):null;
 }
};
const text=String;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>new Intl.NumberFormat('he-IL').format(n);
function simplify(raw,set){const n=String(raw.number||'');const kind=raw.supertype||'';let rarity=raw.rarity||'';let finish='normal';if(/Shining/i.test(rarity)||/^Shining\s/i.test(raw.name||'')){finish='shining';}else if(/Holo/i.test(rarity)){finish='holo';}
 if(set.id==='base5'&&n==='83')finish='holo'; // Dark Raichu, secret holographic rare
 if(set.id==='si1'&&['1','4','7','11','14','17'].includes(n))finish='reverse';
 if(set.id==='basep')finish='unknown'; // print/foil variations not carried by generic rarity=Promo
 const cardid=set.id+'-'+n;
 return {id:cardid,set:set.id,name:raw.name||'',number:n,total:set.id==='basep'?null:set.id==='base5'?82:set.id==='neo3'?64:set.id==='neo4'?105:set.count,rarity:rarity||'—',finish,kind,image:raw.images?.small||`https://images.pokemontcg.io/${set.id}/${n}.png`,large:raw.images?.large||`https://images.pokemontcg.io/${set.id}/${n}_hires.png`};}
function cardNumber(c){return c.number+(c.total?'/'+c.total:'')}
function normalNum(x){const n=parseInt(x.number,10);return Number.isFinite(n)?n:9999;}
function loadEmbeddedData(){
 try{
  state.cards=embeddedCards();
  if(state.cards.length!==1252)throw Error('Unexpected card count: '+state.cards.length);
  state.failures=[];state.ready=true;
  $('fetchStatus').hidden=true;
  renderAll();
  document.documentElement.classList.add('js-ready');
 }catch(error){
  console.error('Could not initialize offline catalog',error);
  $('fetchStatus').hidden=false;$('fetchStatus').classList.add('error');
  $('fetchStatus').textContent='אירעה תקלה בטעינת הרשימה המובנית: '+error.message;
 }
}
function catalog(){return state.cards.filter(c=>state.extras||MAP.get(c.set)?.group!=='Extra')}
function relevantSetCards(id){return catalog().filter(c=>id==='all'||c.set===id)}
function showHolo(c){return ['holo','shining','reverse'].includes(c.finish)}
function searchKey(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/gyardos|gyrados|gyardos/g,'gyarados').trim();}
function searchText(c){return searchKey(c.name+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')+' '+c.id);}
function visible(){const q=searchKey(state.query);let arr=(q?state.cards:catalog()).filter(c=>
 (q||state.active==='all'||c.set===state.active)&&(!state.holoOnly||showHolo(c))&&(!state.pokemonOnly||c.kind==='Pokémon')&&
 (state.status==='all'||state.status==='owned'&&state.owned[c.id]||state.status==='missing'&&!state.owned[c.id]||state.status==='wish'&&state.wish[c.id])&&
 (!q||searchText(c).includes(q)));
 if(state.sort==='name')arr.sort((a,b)=>a.name.localeCompare(b.name)||normalNum(a)-normalNum(b));
 if(state.sort==='holo')arr.sort((a,b)=>Number(showHolo(b))-Number(showHolo(a))||SETS.findIndex(s=>s.id===a.set)-SETS.findIndex(s=>s.id===b.set)||normalNum(a)-normalNum(b));return arr;}
function groups(){return [['Base','sideBase'],['Gym','sideGym'],['Neo','sideNeo'],['Extra','sideExtra']];}
function renderSide(){for(const [g,id]of groups()){$(id).innerHTML=SETS.filter(s=>s.group===g).map(s=>{const own=state.cards.filter(c=>c.set===s.id&&state.owned[c.id]).length;const loaded=state.cards.some(c=>c.set===s.id);return `<button class="set-btn ${state.active===s.id?'active':''}" data-set="${s.id}" ${g==='Extra'&&!state.extras?'title="לחיצה תציג גם אוספים נוספים"':''}><span>${esc(s.name)}</span><small>${own}/${s.count}</small><span class="mini-track"><i style="width:${(own/s.count*100).toFixed(1)}%"></i></span></button>`}).join('')}
 $('side').querySelector('[data-set="all"]').classList.toggle('active',state.active==='all');$('allMini').textContent=nf(catalog().filter(c=>state.owned[c.id]).length)+'/'+nf(catalog().length);}
function renderStats(){/* Collection totals are shown only in the relevant tabs. */}
function rarityHtml(c){const t=c.finish==='holo'?'✨ Holo':c.finish==='shining'?'🌟 Shining':c.finish==='reverse'?'✨ Reverse Holo':c.finish==='unknown'?'? Promo (משתנה)':c.rarity==='Rare'?'◆ Rare':c.rarity==='Uncommon'?'◇ Uncommon':c.rarity==='Common'?'● Common':c.rarity==='Rare Secret'?'◆ Secret Rare':c.rarity||'רגיל';const cls=c.finish==='holo'||c.finish==='reverse'?'holo':c.finish==='shining'?'shining':c.finish==='unknown'?'unknown':'';return `<span class="rarity-tag ${cls}">${esc(t)}</span>`;}
function cardHTML(c){const set=MAP.get(c.set);const isOwned=!!state.owned[c.id];return `<article class="poke-card ${isOwned?'owned':''}" role="listitem" data-id="${esc(c.id)}">
 <div class="card-img-wrap" data-preview="${esc(c.id)}" title="תמונה ופרטים"><img class="card-img" loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="img-placeholder" hidden>✦</span></div>
 <div class="card-data"><div class="card-name" title="${esc(c.name)}">${esc(c.name)}</div><div class="card-sub">${esc(set.name)} · #${esc(cardNumber(c))}</div><div class="badges">${rarityHtml(c)}</div><div class="card-actions">${!isOwned?`<button class="wish-btn ${state.wish[c.id]?'on':''}" data-wish="${esc(c.id)}" aria-label="Wishlist" title="Wishlist">${state.wish[c.id]?'★':'☆'}</button>`:''}<button class="small-link" data-preview="${esc(c.id)}">פרטים</button><a class="small-link" href="${esc(c.image)}" target="_blank" rel="noopener">תמונה ↗</a>${state.conditions[c.id]?`<span class="info-pill">${esc(state.conditions[c.id])}</span>`:''}</div></div>
 <button class="own-btn ${isOwned?'on':''}" data-own="${esc(c.id)}" aria-label="${isOwned?'הסר מהאוסף':'יש לי קלף זה'}" title="${isOwned?'יש לי ✓':'סמן שיש לי'}">${isOwned?'✓':'+'}</button></article>`;}
function renderCards(){const arr=visible();const slice=arr.slice(0,state.limit);$('cards').innerHTML=slice.length?slice.map(cardHTML).join(''):`<div class="empty" style="grid-column:1/-1"><strong>${state.ready?'לא נמצאו קלפים מתאימים':'רשימת הקלפים נטענת...'}</strong>${state.ready?'נסה לשנות את הסינון או החיפוש.':'מעט סבלנות, הרשימה כוללת יותר מאלף קלפים.'}</div>`;
 $('resultsCount').textContent=state.ready?`מציג ${nf(slice.length)} מתוך ${nf(arr.length)} קלפים`:'ממתין לנתונים';$('loadMore').hidden=arr.length<=state.limit;}
function renderAll(){renderSide();renderStats();renderCards();renderCollections();$('sectionTitle').textContent=state.active==='all'?'כל הסדרות':MAP.get(state.active)?.name||'כל הסדרות';let arr=relevantSetCards(state.active);const owned=arr.filter(c=>state.owned[c.id]).length;$('sectionSub').textContent=state.ready?`${nf(owned)} מתוך ${nf(arr.length)} קלפים ברשותך`:'רשימות קלפים מקוריות באנגלית';}
function toast(msg){const e=$('toast');e.textContent=msg;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2800)}
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
 normalizeOrders();save(true);renderAll();
}
function removeWish(id){
 if(!ensureCloudEdit())return;
 if(!state.wish[id]&&!state.wishOrder.includes(id))return;
 delete state.wish[id];
 state.removedWish[id]=Date.now(); // Persist a tombstone to prevent stale snapshots resurrecting a deleted wishlist entry.
 state.wishOrder=state.wishOrder.filter(x=>x!==id);
 if(!state.owned[id])state.binderOrder=state.binderOrder.filter(x=>x!==id);
 normalizeOrders();save(true);renderAll();toast('הקלף הוסר מרשימת המשאלות ונשלח למחיקה בענן.');
}
function toggleWish(id){
 if(!ensureCloudEdit())return;
 if(state.owned[id]){toast('הקלף כבר נמצא באוסף שלך');return;}
 if(state.wish[id]){removeWish(id);return;}
 state.wish[id]=true;delete state.removedWish[id];
 normalizeOrders();save(true);renderAll();
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
async function importBackup(file){if(!file||!ensureCloudEdit())return;try{const data=JSON.parse(await file.text());if(data.app!=='pokemon-vintage-binder'||typeof data.owned!=='object'||!data.owned||Array.isArray(data.owned))throw Error('invalid file');if(!confirm('הייבוא יחליף את סימוני הקלפים שיש לך כרגע. להמשיך?'))return;for(const k of ['owned','wish','removedWish','conditions','notes','purchasePrices','firstEdition','ownedAddedAt','binderExcluded'])state[k]=(data[k]&&typeof data[k]==='object'&&!Array.isArray(data[k]))?data[k]:{};for(const k of ['binderOrder','wishOrder'])state[k]=Array.isArray(data[k])?[...data[k]]:[];if(typeof data.binderIncludeWish==='boolean')state.binderIncludeWish=data.binderIncludeWish;normalizeOrders();save();renderAll();toast('הגיבוי יובא בהצלחה!')}catch(e){toast('לא ניתן לייבא: הקובץ אינו גיבוי תקין של האוסף.')}}

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
let binderSelectedId=null;
function binderPageCount(){return Math.max(1,Math.ceil(binderVisible().length/9));}
function refreshPlacementTargets(){
 const pageEl=$('binderTargetPage'),slotEl=$('binderTargetSlot');
 const pageCurrent=Number(pageEl.value)||1, slotCurrent=Number(slotEl.value)||1;
 const pages=binderPageCount();
 pageEl.innerHTML=Array.from({length:pages},(_,i)=>`<option value="${i+1}">עמוד ${i+1}</option>`).join('');
 slotEl.innerHTML=Array.from({length:9},(_,i)=>`<option value="${i+1}">כיס ${i+1}</option>`).join('');
 pageEl.value=String(Math.max(1,Math.min(pages,pageCurrent)));slotEl.value=String(Math.max(1,Math.min(9,slotCurrent)));
}
function searchBinder(){
 const box=$('binderMatches');const query=$('binderFind').value.trim().toLowerCase();
 if(!query){box.innerHTML='';return;}
 const matching=state.binderOrder.map(id=>state.cards.find(c=>c.id===id)).filter(Boolean).filter(c=>
  (c.name+' '+c.id+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')).toLowerCase().includes(query));
 box.innerHTML=matching.length?matching.slice(0,12).map(c=>`<button type="button" class="binder-match ${c.id===binderSelectedId?'selected':''}" data-pick-binder="${esc(c.id)}" role="option" aria-selected="${c.id===binderSelectedId}"><img src="${esc(c.image)}" alt="" loading="lazy"><span class="binder-match-label"><b>${esc(c.name)}</b><small>${esc(MAP.get(c.set)?.name||'')} · #${esc(cardNumber(c))}${state.owned[c.id]?' · ✓ שלי':' · ☆ משאלה'}</small></span><span aria-hidden="true">בחר ←</span></button>`).join(''):`<span class="binder-place-hint">לא נמצא קלף באוסף או במשאלות. הוסף אותו קודם בקטלוג.</span>`;
}
function selectBinder(id){const c=state.cards.find(x=>x.id===id);if(!c||!state.binderOrder.includes(id))return;
 binderSelectedId=id;$('binderSelected').textContent='נבחר: '+c.name+' · '+(MAP.get(c.set)?.name||'');$('binderPlaceSelected').disabled=false;searchBinder();
}
function placeBinder(id,page,slot){
 if(!ensureCloudEdit())return;
 normalizeOrders();if(!state.binderOrder.includes(id))return;
 const list=binderVisible();const from=list.indexOf(id);if(from<0)return;
 const requested=Math.max(0,(page-1)*9+slot-1);const dest=Math.min(requested,list.length-1);
 reorder('binder',from,dest);
 state.binderPage=Math.floor(dest/9);renderCollections();
 toast('הקלף הועבר לעמוד '+(state.binderPage+1)+', כיס '+((dest%9)+1));
}

const {renderShipments,refreshShipments}=window.VintageShipments.create({state,MAP,cardNumber,esc,$,ensureCloudEdit,save,toast});
function showView(view,doScroll=true){if(!['catalog','owned','binder','wishlist','shipments','deals'].includes(view))return;state.view=view;
 $('catalogShell').hidden=view!=='catalog';$('ownedPage').hidden=view!=='owned';$('binderPage').hidden=view!=='binder';$('wishPage').hidden=view!=='wishlist';$('dealsPage').hidden=view!=='deals';$('shipmentsPage').hidden=view!=='shipments';
 document.querySelectorAll('[data-view-btn]').forEach(b=>{const a=b.dataset.viewBtn===view;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});
 if(view!=='catalog')renderCollections();if(view==='deals')window.VintageEbayLive?.open?.();if(view==='shipments')refreshShipments();if(doScroll)window.scrollTo({top:0,behavior:'smooth'});
}
const {sortedOwnedCards,refreshOwned,renderOwnedList}=window.VintageOwnedCards.create({state,MAP,$,SETS,showHolo,normalNum,searchKey,searchText,rarityHtml,esc,renderCollections:()=>renderCollections()});
function dealAuctionUrl(c,precise){
 const setName=MAP.get(c.set)?.name||'';
 const edition=state.firstEdition[c.id]?'1st edition':'';
 const query=[c.name,setName,precise?cardNumber(c):'',edition,'pokemon'].filter(Boolean).join(' ');
 return 'https://www.ebay.com/sch/i.html?'+new URLSearchParams({_nkw:query,LH_Auction:'1'});
}
function renderDeals(){ window.VintageDealsDashboard?.render?.(); window.VintageEbayLive?.refreshCards?.(); }
const {renderCollections}=window.VintageCollectionViews.create({state,MAP,$,esc,cardNumber,normalizeOrders,renderShipments,binderPageCount,refreshPlacementTargets,binderVisible,renderOwnedList,renderDeals});
function reorder(kind,from,to){if(!ensureCloudEdit())return;normalizeOrders();const arr=kind==='wishlist'?[...state.wishOrder]:binderVisible();if(from<0||to<0||from>=arr.length||to>=arr.length||from===to)return;
 const [moved]=arr.splice(from,1);arr.splice(to,0,moved);
 if(kind==='wishlist')state.wishOrder=arr;
 else{const movingSet=new Set(arr);let n=0;state.binderOrder=state.binderOrder.map(id=>movingSet.has(id)?arr[n++]:id);state.binderPage=Math.floor(to/9);}
 save();
}
function removeFromBinder(id){
 if(!ensureCloudEdit())return;
 if(!state.binderOrder.includes(id))return;
 state.binderExcluded[id]=true;state.binderOrder=state.binderOrder.filter(x=>x!==id);
 if(binderSelectedId===id){binderSelectedId=null;$('binderSelected').textContent='בחר קלף מהרשימה';$('binderPlaceSelected').disabled=true;}
 normalizeOrders();save();toast('הקלף הוסר רק מהבינדר. הוא עדיין נשאר באוסף / במשאלות.');
}
function addToBinder(id){
 if(!ensureCloudEdit())return;
 if(!state.owned[id]&&!state.wish[id])return;
 delete state.binderExcluded[id];
 normalizeOrders();save();toast('הקלף נוסף לבינדר');
}
function openMovePicker(id){
 if(!ensureCloudEdit())return;
 if(!state.owned[id]&&!state.wish[id])return;
 if(!state.binderOrder.includes(id))addToBinder(id);
 showView('binder',false);
 selectBinder(id);
 const c=state.cards.find(x=>x.id===id);
 $('binderFind').value=c?.name||'';searchBinder();
 refreshPlacementTargets();
 $('binderTargetPage').value='1';$('binderTargetSlot').value='1';
 const panel=document.querySelector('.binder-place');panel.classList.add('binder-place-attention');
 setTimeout(()=>panel.classList.remove('binder-place-attention'),1800);
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 toast('בחר עמוד וכיס ואז לחץ ״העבר למיקום שבחרתי״');
}
let wishMoveSelectedId=null;
function openWishMove(id){
 if(!ensureCloudEdit())return;
 normalizeOrders();
 const current=state.wishOrder.indexOf(id);
 if(current<0)return;
 const card=state.cards.find(c=>c.id===id);
 wishMoveSelectedId=id;
 $('wishMoveCurrent').textContent=(card?.name||'קלף')+' · מקום '+(current+1)+' מתוך '+state.wishOrder.length;
 const input=$('wishMovePosition');
 input.min='1';input.max=String(state.wishOrder.length);input.value=String(current+1);
 $('wishMoveTop').disabled=current===0;
 $('wishMoveDialog').showModal();
}
function applyWishMove(target){
 const id=wishMoveSelectedId;
 if(!id)return;
 const current=state.wishOrder.indexOf(id);
 if(current<0)return;
 const total=state.wishOrder.length;
 const position=Number(target);
 if(!Number.isInteger(position)||position<1||position>total){
  $('wishMovePosition').focus();
  $('wishMovePosition').reportValidity();
  return;
 }
 if(current!==position-1)reorder('wishlist',current,position-1);
 $('wishMoveDialog').close();
 wishMoveSelectedId=null;
 if(current!==position-1)toast('הקלף הועבר למקום '+position+' ברשימת המשאלות');
}
function attachCollections(){
 document.addEventListener('click',e=>{
  const view=e.target.closest('[data-view-btn]');if(view){showView(view.dataset.viewBtn);return;}
  const openCard=e.target.closest('[data-open-owned],[data-open-wish]');
  if(openCard&&!e.target.closest('button,a,input,select')){
   showModal(openCard.dataset.openOwned||openCard.dataset.openWish);
   return;
  }
  const pick=e.target.closest('[data-pick-binder]');if(pick){selectBinder(pick.dataset.pickBinder);return;}
  const moveBinder=e.target.closest('[data-binder-move]');if(moveBinder){openMovePicker(moveBinder.dataset.binderMove);return;}
  const removeBinder=e.target.closest('[data-binder-remove]');if(removeBinder){removeFromBinder(removeBinder.dataset.binderRemove);return;}
  const addBinder=e.target.closest('[data-owned-binder]');if(addBinder){openMovePicker(addBinder.dataset.ownedBinder);return;}
  const wishMove=e.target.closest('[data-wish-move]');if(wishMove){openWishMove(wishMove.dataset.wishMove);return;}
  const move=e.target.closest('[data-move-kind]');if(move){reorder(move.dataset.moveKind,Number(move.dataset.moveIndex),Number(move.dataset.moveIndex)+Number(move.dataset.moveDelta));return;}
 });
 $('wishMoveTop').onclick=()=>applyWishMove(1);
 $('wishMoveConfirm').onclick=()=>applyWishMove($('wishMovePosition').value);
 $('wishMoveCancel').onclick=()=>$('wishMoveDialog').close();
 $('wishMoveDialog').addEventListener('close',()=>{wishMoveSelectedId=null;});
 $('wishMovePosition').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyWishMove(e.target.value);}});
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open-owned],[data-open-wish]')){e.preventDefault();showModal(e.target.dataset.openOwned||e.target.dataset.openWish);}});
  $('binderFind').addEventListener('input',searchBinder);$('ownedFind').addEventListener('input',renderOwnedList);
  $('ownedSort').addEventListener('change',renderOwnedList);
  $('copyWishlist').addEventListener('click',copyWishlist);
 $('binderPlaceSelected').onclick=()=>{if(!binderSelectedId)return;placeBinder(binderSelectedId,Number($('binderTargetPage').value)||1,Number($('binderTargetSlot').value)||1);};
 $('binderIncludeWish').onchange=e=>{if(!ensureCloudEdit()){e.target.checked=state.binderIncludeWish;return;}state.binderIncludeWish=e.target.checked;save();};
 $('binderPrev').onclick=()=>{state.binderPage=Math.max(0,state.binderPage-1);renderCollections();};
 $('binderNext').onclick=()=>{state.binderPage++;renderCollections();};
 $('binderResetOrder').onclick=()=>{if(!ensureCloudEdit())return;if(!confirm('לסדר מחדש את הבינדר לפי סדרות ומספרי קלפים? סדר המשאלות יישמר.'))return;
 state.binderOrder=state.cards.filter(c=>(state.owned[c.id]||state.wish[c.id])&&!state.binderExcluded[c.id]).map(c=>c.id);state.binderPage=0;save();toast('הבינדר סודר לפי סדרות');};
 // Mouse/pen: drag from anywhere on a Wishlist card; existing binder handles still work.
 // Touch: long-press anywhere on a Wishlist card to drag; normal swipes scroll the page.
 let gesture=null,scrollFrame=0,preventNextClick=false;
 function clearDragVisual(){
  document.querySelectorAll('.drop-target,.drag-origin').forEach(x=>x.classList.remove('drop-target','drag-origin'));
  document.querySelector('.drag-ghost')?.remove();document.body.classList.remove('dragging-card');
  cancelAnimationFrame(scrollFrame);scrollFrame=0;
 }
 function findDrop(g){
  const target=document.elementFromPoint(g.x,g.y)?.closest(`[data-order-kind="${g.kind}"][data-order-index]`);
  document.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));
  if(target){g.to=Number(target.dataset.orderIndex);target.classList.add('drop-target');}
  else g.to=null;
 }
 function beginDrag(g){
  g.active=true;preventNextClick=true;
  document.body.classList.add('dragging-card');
  g.original.classList.add('drag-origin');
  const img=g.original.querySelector('img'),label=g.original.querySelector('.pocket-title,.wish-copy strong');
  const ghost=document.createElement('div');ghost.className='drag-ghost';
  const photo=document.createElement('img');photo.src=img?.src||'';photo.alt='';
  const word=document.createElement('span');word.textContent=label?.textContent||'קלף';
  const hint=document.createElement('small');hint.textContent='שחרר מעל קלף אחר';
  ghost.append(photo,word,hint);document.body.appendChild(ghost);
  ghost.style.left=g.x+'px';ghost.style.top=g.y+'px';
  scrollFrame=requestAnimationFrame(tickAutoScroll);
 }
 function tickAutoScroll(){
  const g=gesture?.active?gesture:touchGesture?.active?touchGesture:null;
  if(!g)return;
  const margin=94;
  let velocity=0;
  if(g.y<margin)velocity=-Math.max(5,(margin-g.y)*.22);
  else if(g.y>innerHeight-margin)velocity=Math.max(5,(g.y-(innerHeight-margin))*.22);
  if(velocity){window.scrollBy(0,velocity);findDrop(g);}
  scrollFrame=requestAnimationFrame(tickAutoScroll);
 }
 document.addEventListener('pointerdown',e=>{
  const wishRow=e.target.closest('[data-order-kind="wishlist"]');
  const directTouchHandle=e.target.closest('.wish-item>img[data-drag-kind],.wish-item>.wish-rank[data-drag-kind]');
  if(wishRow&&(e.target.closest('button,a,input,select')||(e.pointerType==='touch'&&!directTouchHandle)))return;
  const h=e.target.closest('[data-drag-kind]');if(!h||e.button!==0)return;
  if(gesture)clearDragVisual();
  const kind=h.dataset.dragKind,from=Number(h.dataset.dragIndex);
  const row=h.closest(`[data-order-kind="${kind}"][data-order-index]`);
  if(!row)return;
  gesture={pointer:e.pointerId,kind,from,to:null,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,active:false,original:row};
  try{h.setPointerCapture(e.pointerId);}catch(_){}
 },true);
 document.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;
  const g=gesture;g.x=e.clientX;g.y=e.clientY;
  if(!g.active){
   if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<7)return;
   beginDrag(g);
  }
  if(e.cancelable)e.preventDefault();
  const ghost=document.querySelector('.drag-ghost');if(ghost){ghost.style.left=g.x+'px';ghost.style.top=g.y+'px';}
  findDrop(g);
 },{passive:false});
 const finish=e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;
  const g=gesture;gesture=null;clearDragVisual();
  if(g.active&&g.to!==null){reorder(g.kind,g.from,g.to);toast('הסדר עודכן ונשמר');}
  if(g.active){setTimeout(()=>{preventNextClick=false},150);}
 };
 document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',e=>{if(gesture&&e.pointerId===gesture.pointer){gesture=null;clearDragVisual();}});
 // For touch, wait for a brief long-press before taking over: short swipes still scroll,
 // and short taps still open details. This avoids disabling vertical scrolling on long lists.
 let touchGesture=null;
 function cancelTouch(){
  if(!touchGesture)return;
  clearTimeout(touchGesture.timer);
  if(touchGesture.active)clearDragVisual();
  touchGesture=null;
 }
 function touchPoint(e,id){return Array.from(e.changedTouches).find(t=>t.identifier===id);}
 document.addEventListener('touchstart',e=>{
  const row=e.target.closest('[data-order-kind="wishlist"][data-order-index]');
  if(!row||e.target.closest('button,a,input,select')||e.target.closest('.wish-item>img[data-drag-kind],.wish-item>.wish-rank[data-drag-kind]')||e.touches.length!==1)return;
  cancelTouch();
  const touch=e.changedTouches[0];
  const pending={
   id:touch.identifier,kind:'wishlist',from:Number(row.dataset.orderIndex),
   to:null,x:touch.clientX,y:touch.clientY,startX:touch.clientX,startY:touch.clientY,
   original:row,active:false,timer:null
  };
  touchGesture=pending;
  pending.timer=setTimeout(()=>{
   if(touchGesture!==pending||!pending.original.isConnected)return;
   beginDrag(pending);
  },320);
 },{passive:true});
 document.addEventListener('touchmove',e=>{
  const g=touchGesture;if(!g)return;
  const touch=touchPoint(e,g.id);if(!touch)return;
  const distance=Math.hypot(touch.clientX-g.startX,touch.clientY-g.startY);
  if(!g.active){
   if(distance>9)cancelTouch(); // Native swipe: let the browser scroll freely.
   return;
  }
  if(e.cancelable)e.preventDefault();
  g.x=touch.clientX;g.y=touch.clientY;
  const ghost=document.querySelector('.drag-ghost');
  if(ghost){ghost.style.left=g.x+'px';ghost.style.top=g.y+'px';}
  findDrop(g);
 },{passive:false});
 document.addEventListener('touchend',e=>{
  const g=touchGesture;if(!g||!touchPoint(e,g.id))return;
  clearTimeout(g.timer);touchGesture=null;
  if(!g.active)return;
  if(e.cancelable)e.preventDefault();
  clearDragVisual();
  if(g.to!==null&&g.to!==g.from){reorder('wishlist',g.from,g.to);toast('הסדר עודכן ונשמר');}
  setTimeout(()=>{preventNextClick=false;},300);
 },{passive:false});
 document.addEventListener('touchcancel',e=>{
  if(touchGesture&&touchPoint(e,touchGesture.id))cancelTouch();
 });
 document.addEventListener('click',e=>{if(preventNextClick&&e.target.closest('[data-order-kind]')){e.preventDefault();e.stopImmediatePropagation();preventNextClick=false;}},true);
}

function attach(){document.addEventListener('click',e=>{const own=e.target.closest('[data-own]');if(own)return toggleOwned(own.dataset.own);const removeWishBtn=e.target.closest('[data-remove-wish]');if(removeWishBtn){removeWish(removeWishBtn.dataset.removeWish);return;}const wish=e.target.closest('[data-wish]');if(wish)return toggleWish(wish.dataset.wish);const preview=e.target.closest('[data-preview]');if(preview)return showModal(preview.dataset.preview);const set=e.target.closest('[data-set]');if(set){state.active=set.dataset.set;if(MAP.get(state.active)?.group==='Extra'){state.extras=true;$('extrasEnabled').checked=true;}state.limit=96;renderAll();const sticky=document.querySelector('.sticky-sitebar');const shell=document.querySelector('.shell');window.scrollTo({top:Math.max(0,shell.getBoundingClientRect().top+window.scrollY-(sticky?.offsetHeight||0)-12),behavior:'smooth'});}});
 $('search').addEventListener('input',e=>{state.query=e.target.value.trim();state.limit=96;if(state.query){state.active='all';state.status='all';state.holoOnly=false;state.pokemonOnly=false;$('statusSelect').value='all';$('holoOnly').checked=false;$('pokemonOnly').checked=false;}renderAll()});$('statusSelect').onchange=e=>{state.status=e.target.value;state.limit=96;renderCards()};$('sortSelect').onchange=e=>{state.sort=e.target.value;state.limit=96;renderCards()};$('holoOnly').onchange=e=>{state.holoOnly=e.target.checked;state.limit=96;renderCards()};$('pokemonOnly').onchange=e=>{state.pokemonOnly=e.target.checked;state.limit=96;renderCards()};$('extrasEnabled').onchange=e=>{state.extras=e.target.checked;if(!state.extras&&MAP.get(state.active)?.group==='Extra')state.active='all';state.limit=96;renderAll()};$('loadMore').onclick=()=>{state.limit+=96;renderCards()};$('showOwned').onclick=()=>{state.status='owned';$('statusSelect').value='owned';state.limit=96;renderCards()};$('showHolo').onclick=()=>{state.holoOnly=true;$('holoOnly').checked=true;state.limit=96;renderCards()};$('resetFilters').onclick=()=>{state.query='';state.status='all';state.sort='num';state.holoOnly=false;state.pokemonOnly=false;state.limit=96;$('search').value='';$('statusSelect').value='all';$('sortSelect').value='num';$('holoOnly').checked=false;$('pokemonOnly').checked=false;renderCards()};$('exportJSON').onclick=backup;$('exportCSV').onclick=exportCSV;$('importJSON').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{importBackup(e.target.files[0]);e.target.value=''};$('closeModal').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').close()});attachCollections();}

attach();loadEmbeddedData();
// Keep the desktop set sidebar below the sticky title/tabs, including when the header changes height.
const stickySitebar=document.querySelector('.sticky-sitebar');
if(stickySitebar){
 const syncStickyOffset=()=>document.documentElement.style.setProperty('--sticky-sitebar-height',Math.ceil(stickySitebar.getBoundingClientRect().height)+'px');
 syncStickyOffset();
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncStickyOffset).observe(stickySitebar);
 else window.addEventListener('resize',syncStickyOffset);
}
})();
