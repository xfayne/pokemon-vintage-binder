/**
 * Cloudflare Worker /api/search: trusted eBay API proxy.
 * Secrets: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET.
 * Env: ALLOWED_ORIGIN=https://xfayne.github.io
 */
const API = 'https://api.ebay.com';
const MARKETS = ['EBAY_US','EBAY_DE'];
let tokenCache = { value:null, expires:0 };
function reply(data,status,cors) {
 return new Response(JSON.stringify(data),{status:status||200,headers:Object.assign({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},cors)});
}
function allowedOrigin(origin,env) {
 return !!origin && origin.replace(/\/+$/,'')===String(env.ALLOWED_ORIGIN||'https://xfayne.github.io').replace(/\/+$/,'');
}
function cors(origin,env) {
 return {'access-control-allow-origin':allowedOrigin(origin,env)?origin:'null','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'600',vary:'origin'};
}
function clean(x,max) {return String(x==null?'':x).replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max||90)}
function cardInput(raw) {
 if (!raw || typeof raw!=='object') return null;
 const c={id:clean(raw.id,40),name:clean(raw.name,80),setName:clean(raw.setName,80),number:clean(raw.number,15),firstEdition:raw.firstEdition===true};
 return /^[a-z0-9-]{2,40}$/i.test(c.id)&&c.name.length>=2&&c.setName.length>=3?c:null;
}
async function bearer(env) {
 if (!env.EBAY_CLIENT_ID||!env.EBAY_CLIENT_SECRET) throw Error('CREDENTIALS_MISSING');
 if (tokenCache.value && tokenCache.expires>Date.now()+60000) return tokenCache.value;
 const r=await fetch(API+'/identity/v1/oauth2/token',{method:'POST',headers:{
  authorization:'Basic '+btoa(env.EBAY_CLIENT_ID+':'+env.EBAY_CLIENT_SECRET),
  'content-type':'application/x-www-form-urlencoded'
 },body:new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'})});
 if (!r.ok) throw Error('EBAY_AUTH_FAILED_'+r.status);
 const x=await r.json();if(!x.access_token) throw Error('EBAY_AUTH_NO_TOKEN');
 tokenCache={value:x.access_token,expires:Date.now()+Math.max(120,Number(x.expires_in)||7200)*1000};
 return tokenCache.value;
}
const normalized=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
function titleMatch(raw,card) {
 const t=normalized(raw),name=normalized(card.name),set=normalized(card.setName),num=normalized(card.number);
 if(!(' '+t+' ').includes(' '+name+' '))return null;
 if(/\b(proxy|reprint|replica|orica|fake|custom|facsimile|psa|bgs|cgc|graded|slab)\b/.test(t))return null;
 if(!card.firstEdition && /\b(1st|first) edition\b/.test(t))return null;
 const warnings=[];let confidence=45;
 if((' '+t+' ').includes(' '+set+' '))confidence+=28;else warnings.push('שם הסדרה אינו מופיע בכותרת');
 if(num && (' '+t+' ').includes(' '+num+' ')) confidence+=18;else warnings.push('מספר הקלף לא אומת');
 if(card.firstEdition) {
  if(/\b(1st|first) edition\b/.test(t))confidence+=9;else warnings.push('הדפסת 1st Edition לא אומתה');
 } else warnings.push('Unlimited לא אומתה');
 if(/\b(lot|bundle|set of|multiple cards)\b/.test(t)){warnings.push('ייתכן שמדובר באוסף ולא בקלף יחיד');confidence-=20}
 if(/\b(crease|creased|fold|bent|damaged|dmg|heavily played)\b/.test(t))warnings.push('תיאור מציין נזק פיזי');
 if(/\b(non holo|nonholo|reverse holo)\b/.test(t))warnings.push('בדוק התאמת סוג Holo');
 return {confidence:Math.max(0,Math.min(100,confidence)),warnings};
}
function cash(x) {const n=Number(x?.value);return x&&Number.isFinite(n)&&n>=0&&/^[A-Z]{3}$/.test(String(x.currency))?{value:n,currency:String(x.currency)}:null}
function mapItem(item,card,market) {
 if(!Array.isArray(item?.buyingOptions)||!item.buyingOptions.includes('AUCTION'))return null;
 const match=titleMatch(item.title,card);if(!match)return null;
 const price=cash(item.currentBidPrice)||cash(item.price);if(!price)return null;
 const url=String(item.itemWebUrl||'');if(!/^https:\/\/(www\.)?ebay\.[a-z.]+\/itm\//i.test(url))return null;
 const shipping=Array.isArray(item.shippingOptions)?item.shippingOptions.map(x=>cash(x.shippingCost)).find(Boolean)||null:null;
 const fb=Number(item.seller?.feedbackPercentage);
 const img=String(item.image?.imageUrl||'');
 return {
  cardId:card.id,itemId:clean(item.itemId,90),title:clean(item.title,200),
  url,image:/^https:\/\//.test(img)?img:null,
  currentBid:price,shipping,bidCount:Number.isInteger(item.bidCount)?item.bidCount:null,
  endTime:item.itemEndDate||null,sellerFeedback:Number.isFinite(fb)&&fb>=0&&fb<=100?fb:null,
  sellerName:clean(item.seller?.username,70),condition:clean(item.condition,60),
  marketplace:market,matchConfidence:match.confidence,warnings:match.warnings
 };
}
async function search(c,market,token){
 const u=new URL(API+'/buy/browse/v1/item_summary/search');
 u.search=new URLSearchParams({
  q:[c.name,c.setName,'pokemon'].join(' ').slice(0,100),limit:'30',
  filter:'buyingOptions:{AUCTION},deliveryCountry:IL',sort:'endingSoonest'
 }).toString();
 const r=await fetch(u,{headers:{authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':market,accept:'application/json'}});
 if(!r.ok)throw Error('eBay '+market+' returned HTTP '+r.status);
 const data=await r.json();
 return (Array.isArray(data.itemSummaries)?data.itemSummaries:[]).map(x=>mapItem(x,c,market)).filter(Boolean);
}
async function searchBatch(cards,env){
 const token=await bearer(env);const items=[];const errors=[];
 for(const c of cards){
  const outcomes=await Promise.allSettled(MARKETS.map(m=>search(c,m,token)));
  outcomes.forEach((result,i)=>{if(result.status==='fulfilled')items.push(...result.value);else errors.push({cardId:c.id,marketplace:MARKETS[i],error:String(result.reason?.message||'Unknown').slice(0,110)})});
 }
 const unique=new Set();
 return {source:'eBay Browse API',fetchedAt:new Date().toISOString(),searchedCards:cards.length,
  items:items.filter(x=>{const k=x.itemId||x.url;if(unique.has(k))return false;unique.add(k);return true}).sort((a,b)=>b.matchConfidence-a.matchConfidence).slice(0,120),errors};
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('origin')||'';const headers=cors(origin,env);const u=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!allowedOrigin(origin,env))return reply({error:'Origin not allowed'},403,headers);
  if(request.method==='GET'&&u.pathname==='/health')return reply({ready:!!(env.EBAY_CLIENT_ID&&env.EBAY_CLIENT_SECRET),provider:'eBay Browse API'},200,headers);
  if(request.method!=='POST'||u.pathname!=='/api/search')return reply({error:'Not found'},404,headers);
  if(Number(request.headers.get('content-length')||0)>6000)return reply({error:'Payload too large'},413,headers);
  let body;try{body=await request.json()}catch(_){return reply({error:'Invalid JSON'},400,headers)}
  if(!Array.isArray(body?.cards)||body.cards.length<1||body.cards.length>4)return reply({error:'Expected 1–4 cards'},400,headers);
  const cards=body.cards.map(cardInput);if(cards.some(c=>!c))return reply({error:'Invalid card'},400,headers);
  try{return reply(await searchBatch(cards,env),200,headers)}
  catch(err){return reply({error:String(err.message||'EBAY_SEARCH_FAILED').slice(0,120)},503,headers)}
 }
};
