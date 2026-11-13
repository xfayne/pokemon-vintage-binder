
/* TCGTracking open market data (TCGplayer SKU-level prices, per condition/printing).
   No user data is sent to the price provider; only the chosen card set is queried. */
(()=>{
'use strict';
const BASE='https://openapi.tcgtracking.com/v1/3';
const CONDITIONS=[['NM','Near Mint'],['LP','Lightly Played'],['MP','Moderately Played'],['HP','Heavily Played'],['DMG','Damaged']];
const setPromise=new Map();
// Verified TCGTracking product IDs for cards filed under different TCGplayer groups.
const MARKET_OVERRIDES={
 'basep-3':{set:'WoTC Promo',productId:87414},
 'basep-5':{set:'WoTC Promo',productId:84909},
 'movie2000-ancient-mew':{set:'Miscellaneous Cards & Products',productId:108589},
 'base1-8':{set:'Deck Exclusives',productId:42425}
};
const ownedPriceCache=new Map(),ownedPricePending=new Set();
function getOwnedPrice(card,setName,condition,firstEdition=false){
 if(!card||!condition)return null;
 const key=card.id+'|'+condition+'|'+(firstEdition?'1st':'unlimited');
 if(ownedPriceCache.has(key))return ownedPriceCache.get(key);
 if(!ownedPricePending.has(key)){
  ownedPricePending.add(key);
  getSetData(setName,card).then(data=>{
   const market=makeMarket(card,data);
   const variant=market?bestVariant(card,market.variants.keys(),firstEdition):null;
   const row=variant?market.variants.get(variant)?.get(condition):null;
   const value=row?.mkt;
   ownedPriceCache.set(key,typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null);
  }).catch(error=>{
   console.warn('Owned-card market price temporarily unavailable:',error);
   ownedPriceCache.set(key,null);
  }).finally(()=>{ownedPricePending.delete(key);window.VintageBinder?.refreshOwned?.();});
 }
 return undefined;
}
let catalogPromise=null,requestId=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const nameKey=s=>String(s??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
const numKey=s=>String(s??'').replace(/^#/,'').split('/')[0].replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,'');
const usd=n=>window.VintageCurrency.format(n,'USD');
async function getJSON(path){
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),13000);
 try{const r=await fetch(path,{signal:ac.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
 finally{clearTimeout(timer);}
}
function sets(){if(!catalogPromise)catalogPromise=getJSON(BASE+'/sets').catch(e=>{catalogPromise=null;throw e});return catalogPromise;}
async function getSetData(setName,card){
 const catalog=await sets(),groups=Array.isArray(catalog.sets)?catalog.sets:[];
 const wanted=MARKET_OVERRIDES[card?.id]?.set||(setName==='Wizards Black Star Promos'?'WoTC Promo':setName);
 const group=groups.find(g=>nameKey(g.name)===nameKey(wanted) && !String(g.name).toLowerCase().includes('inactive'));
 if(!group)return null;
 if(!setPromise.has(group.id)){
  const promise=Promise.all([getJSON(BASE+'/sets/'+group.id+'/cards'),getJSON(BASE+'/sets/'+group.id+'/skus')])
   .then(([cards,skus])=>({cards:Array.isArray(cards.products)?cards.products:[],skus,group}))
   .catch(e=>{setPromise.delete(group.id);throw e});
  setPromise.set(group.id,promise);
 }
 return setPromise.get(group.id);
}
function bestVariant(card,names,firstEdition=false){
 const desired=(card.finish==='holo'||card.finish==='shining')?'holo':card.finish==='reverse'?'reverse':'normal';
 const rank=(raw)=>{
  const v=String(raw).toLowerCase();
  const isFirst=/1st|first edition/.test(v);
  // Regular starter-deck Machamp is stamped 1st Edition even outside the shadowless print.
  const effectiveFirst=card.id==='base1-8'?true:firstEdition;
  if(effectiveFirst!==isFirst)return -1;
  if(desired==='holo'){
   if(/reverse/.test(v))return -1;
   if(/holofoil/.test(v))return /unlimited/.test(v)?120:110;
   if(/holo/.test(v))return 100;
   if(effectiveFirst&&/1st edition$/.test(v))return 60;
   return -1;
  }
  if(desired==='reverse')return /reverse holo/.test(v)?120:-1;
  if(/holo|foil/.test(v)&&!/normal/.test(v))return -1;
  if(/normal/.test(v))return /unlimited/.test(v)?125:110;
  if(/unlimited/.test(v))return 100;
  if(effectiveFirst&&/1st edition/.test(v))return 90;
  return v==='normal'?90:-1;
 };
 const ranked=[...names].map(name=>({name,score:rank(name)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score);
 return ranked[0]?.name??null;
}
function makeMarket(card,setData){
 if(!setData)return null;
 const special=MARKET_OVERRIDES[card.id];
 // A verified ID prevents accidentally pricing a different printing or promo.
 const target=special
   ? (setData.group?.name===special.set?setData.cards.find(p=>p.id===special.productId):null)
   : setData.cards.find(p=>numKey(p.number)===numKey(card.number)&&
       nameKey(p.name.replace(/\s*\(\d{1,3}\)\s*$/,''))===nameKey(card.name));
 if(!target)return null;
 const productSku=setData.skus?.products?.[String(target.id)]||{};
 const variants=new Map();
 for(const row of Object.values(productSku)){
  if(!row || row.lng!=='EN'||!CONDITIONS.some(([code])=>code===row.cnd))continue;
  const variant=String(row.var||row.var_a||row.vid||'');
  if(!variant)continue;
  if(!variants.has(variant))variants.set(variant,new Map());
  const list=variants.get(variant);
  const old=list.get(row.cnd);
  const good=n=>typeof n==='number' && Number.isFinite(n) && n>=0;
  if(!old || (good(row.mkt)&&!good(old.mkt)) || (good(row.mkt)===good(old.mkt) && (row.cnt||0)>(old.cnt||0)))list.set(row.cnd,row);
 }
 return {product:target,variants,updated:setData.skus?.updated||setData.group?.skus_modified||null,preferred:bestVariant(card,variants.keys())};
}
function priceLink(card,market){
 const u=market?.product?.tcgplayer_url;
 if(typeof u==='string'&&/^https:\/\//.test(u))return u;
 return 'https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q='+encodeURIComponent(card.name+' '+card.number);
}
let currentMarket=null,currentCard=null;
function refresh(){
 if(!currentCard)return;
 const panel=document.getElementById('modalPricePanel');
 if(!panel)return;
 if(currentMarket)renderMarket(currentCard,currentMarket);
}
function renderMarket(card,market){
 const panel=document.getElementById('modalPricePanel');
 if(!panel)return;
 const selected=document.getElementById('modalCondition')?.value||'';
 const first=!!document.getElementById('modalFirstEdition')?.checked;
 if(!selected){panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">בחר מצב קלף</span>';return;}
 const variant=bestVariant(card,market.variants.keys(),first);
 if(!variant){
  panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">אין מחיר להדפסה זו</span>';return;
 }
 const row=market.variants.get(variant)?.get(selected);
 const valid=typeof row?.mkt==='number'&&Number.isFinite(row.mkt)&&row.mkt>=0;
 const date=market.updated?new Date(market.updated):null;
 const title='TCGplayer'+(date&&!Number.isNaN(date.getTime())?' · '+date.toLocaleDateString('he-IL'):'')+' · '+variant+' · '+selected;
 panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="'+(valid?'market-value':'market-status')+'"'+(valid?' title="'+esc(title)+'"':'')+'>'+(valid?usd(row.mkt):'אין מחיר למצב זה')+'</span>';
}
async function show(card,setInfo){
 const seq=++requestId,panel=document.getElementById('modalPricePanel');
 currentCard=card;currentMarket=null;
 if(!panel)return;
 panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">טוען…</span>';
 try{
  const data=await getSetData(setInfo?.name||'',card);
  if(seq!==requestId||!document.getElementById('modalPricePanel'))return;
  if(!data){panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">אין נתונים לסדרה</span>';return;}
  const market=makeMarket(card,data);
  if(!market){panel.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">לא נמצאה התאמה</span>';return;}
  currentMarket=market;renderMarket(card,market);
 }catch(e){
  if(seq!==requestId)return;
  console.warn('TCG market data unavailable:',e);
  const current=document.getElementById('modalPricePanel');if(current)current.innerHTML='<span class="market-label">מחיר שוק</span><span class="market-status">לא זמין כרגע</span><button type="button" class="market-retry" id="retryMarket" title="נסה שוב" aria-label="נסה לטעון שוב">↻</button>';
  document.getElementById('retryMarket')?.addEventListener('click',()=>show(card,setInfo));
 }
}
window.VintageMarketPrices={show,refresh,getOwnedPrice};
})();
