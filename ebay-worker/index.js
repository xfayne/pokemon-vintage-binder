/**
 * Cloudflare Worker /api/search: trusted eBay API proxy.
 * Secrets: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET.
 * Env: ALLOWED_ORIGIN=https://xfayne.github.io
 */
const API = 'https://api.ebay.com';
const MARKETS = ['EBAY_US','EBAY_GB','EBAY_DE'];
let tokenCache = { value:null, expires:0 };
function reply(data,status,cors) {
 return new Response(JSON.stringify(data),{status:status||200,headers:Object.assign({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},cors)});
}
function allowedOrigin(origin,env) {
 return !!origin && origin.replace(/\/+$/,'')===String(env.ALLOWED_ORIGIN||'https://xfayne.github.io').replace(/\/+$/,'');
}
function cors(origin,env) {
 return {'access-control-allow-origin':allowedOrigin(origin,env)?origin:'null','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'600',vary:'origin'};
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
 const statedNumbers=t.match(/\b\d{1,3}\s*\/\s*\d{2,3}\b/g)||[];
 if(num && statedNumbers.length && !statedNumbers.some(n=>normalized(n)===num))return null;
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
// Grade inference is explicitly separated from eBay's structured condition.
// An "Ungraded" summary is not evidence of an NM/LP/MP/HP/DMG grade.
function gradeFromText(value){
 const t=String(value||'').toLowerCase();
 if(/\b(damaged?|dmg|poor|creased?|folded|bent)\b/.test(t))return 'DMG';
 if(/\b(heavy played|heavily played|heavy play|hp\b|good condition)\b/.test(t))return 'HP';
 if(/\b(moderately played|moderate play|mod(?:erate)? played|mp\b|very good)\b/.test(t))return 'MP';
 if(/\b(lightly played|light play|lp\b|excellent)\b/.test(t))return 'LP';
 if(/\b(near mint|nm\b|mint condition|like new)\b/.test(t))return 'NM';
 return null;
}
function gradeFromDescriptors(descriptors){
 if(!Array.isArray(descriptors))return null;
 for(const descriptor of descriptors){
  if(!/card condition/i.test(String(descriptor?.name||'')))continue;
  for(const value of descriptor.values||[]){
   const grade=gradeFromText(value?.content);
   if(grade)return {grade,label:clean(value.content,80)};
  }
 }
 return null;
}
function mapItem(item,card,market){
 if(!Array.isArray(item?.buyingOptions))return null;
 const auction=item.buyingOptions.includes('AUCTION');
 const fixed=item.buyingOptions.includes('FIXED_PRICE');
 if(!auction&&!fixed)return null;
 const match=titleMatch(item.title,card);if(!match)return null;
 const price=auction?(cash(item.currentBidPrice)||cash(item.price)):cash(item.price);
 if(!price)return null;
 const url=String(item.itemWebUrl||'');
 if(!/^https:\/\/(www\.)?ebay\.[a-z.]+\/itm\//i.test(url))return null;
 const shipping=Array.isArray(item.shippingOptions)?item.shippingOptions.map(x=>cash(x.shippingCost)).find(Boolean)||null:null;
 const fb=Number(item.seller?.feedbackPercentage);
 const img=String(item.image?.imageUrl||'');
 const rawCondition=clean(item.condition,80);
 const structured=gradeFromDescriptors(item.conditionDescriptors);
 const explicit=gradeFromText(rawCondition);
 const guessed=gradeFromText(item.title);
 const conditionGrade=structured?.grade||explicit||guessed||null;
 const conditionSource=structured?'seller':explicit?'seller':guessed?'title':'unknown';
 return {
  cardId:card.id,itemId:clean(item.itemId,90),title:clean(item.title,200),
  url,image:/^https:\/\//.test(img)?img:null,
  currentBid:price,shipping,bidCount:auction&&Number.isInteger(item.bidCount)?item.bidCount:null,
  endTime:auction?item.itemEndDate||null:null,
  sellerFeedback:Number.isFinite(fb)&&fb>=0&&fb<=100?fb:null,
  sellerName:clean(item.seller?.username,70),condition:rawCondition,
  conditionGrade,conditionSource,conditionLabel:structured?.label||rawCondition,
  format:auction?'AUCTION':'FIXED_PRICE',
  bestOffer:item.buyingOptions.includes('BEST_OFFER'),
  marketplace:market,matchConfidence:match.confidence,warnings:match.warnings
 };
}
async function search(c,market,token,env,postalCode,format){
 const postal=String(postalCode||env.EBAY_DELIVERY_POSTAL_CODE||'').trim();
 const zip=/^[0-9]{5,10}$/.test(postal)?postal:null;
 const deliveryFilter='buyingOptions:{'+format+'},deliveryCountry:IL'+(zip?',deliveryPostalCode:'+zip:'');
 const destination='country=IL'+(zip?',zip='+zip:'');
 const u=new URL(API+'/buy/browse/v1/item_summary/search');
 u.search=new URLSearchParams({
  // A shorter query finds items without the set name; titleMatch verifies each result.
  q:[c.name,c.setName].join(' ').slice(0,100),limit:'45',
  filter:deliveryFilter,sort:format==='AUCTION'?'endingSoonest':'price'
 }).toString();
 const r=await fetch(u,{headers:{
  authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':market,
  'X-EBAY-C-ENDUSERCTX':'contextualLocation='+encodeURIComponent(destination),accept:'application/json'
 }});
 if(!r.ok)throw Error('eBay '+market+' '+format+' returned HTTP '+r.status);
 const data=await r.json();
 return (Array.isArray(data.itemSummaries)?data.itemSummaries:[]).map(x=>mapItem(x,c,market)).filter(Boolean);
}
async function searchBatch(cards,env,postalCode){
 const token=await bearer(env);const items=[];const errors=[];
 for(const c of cards){
  const tasks=MARKETS.flatMap(market=>['AUCTION','FIXED_PRICE'].map(format=>({market,format})));
  const outcomes=await Promise.allSettled(tasks.map(t=>search(c,t.market,token,env,postalCode,t.format)));
  outcomes.forEach((result,i)=>{
   if(result.status==='fulfilled')items.push(...result.value);
   else errors.push({cardId:c.id,marketplace:tasks[i].market,format:tasks[i].format,error:String(result.reason?.message||'Unknown').slice(0,110)});
  });
 }
 const unique=new Set();
 return {source:'eBay Browse API',fetchedAt:new Date().toISOString(),searchedCards:cards.length,
  items:items.filter(x=>{const k=x.itemId||x.url;if(unique.has(k))return false;unique.add(k);return true})
   .sort((a,b)=>b.matchConfidence-a.matchConfidence).slice(0,240),errors};
}
async function getItemCondition(itemId,market,env,postalCode){
 const token=await bearer(env);
 const postal=String(postalCode||env.EBAY_DELIVERY_POSTAL_CODE||'').trim();
 const zip=/^[0-9]{5,10}$/.test(postal)?postal:null;
 const destination='country=IL'+(zip?',zip='+zip:'');
 const url=API+'/buy/browse/v1/item/'+encodeURIComponent(itemId);
 const response=await fetch(url,{headers:{
  authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':market,
  'X-EBAY-C-ENDUSERCTX':'contextualLocation='+encodeURIComponent(destination),accept:'application/json'
 }});
 if(!response.ok)throw Error('eBay item detail returned HTTP '+response.status);
 const item=await response.json();
 const desc=gradeFromDescriptors(item.conditionDescriptors);
 const cond=clean(item.condition,80);
 const explicit=gradeFromText(cond);
 return {condition:cond,grade:desc?.grade||explicit||null,
  label:desc?.label||cond||null,
  source:desc||explicit?'seller':'unknown'};
}

/* SHIPMENT_API: 17TRACK V2.4 integration.
   Keep the 17TRACK key server-side. Verify Firebase ID tokens (not just Origin)
   and restrict the account email so public sign-ups cannot exhaust credits. */
const TRACK_BASE='https://api.17track.net/track/v2.4';
const FIREBASE_PROJECT='pokemon-vintage-binder';
const FIREBASE_JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let firebaseKeys=null, firebaseKeysUntil=0;
function base64urlBytes(str){
 const pad=str.replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(pad+'='.repeat((4-pad.length%4)%4));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function decodeJwtPart(str){return JSON.parse(new TextDecoder().decode(base64urlBytes(str)));}
async function verifyFirebaseBearer(request,env){
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9_.-]+$/.test(auth))return false;
 const parts=auth.slice(7).split('.');
 if(parts.length!==3)return false;
 let header,claims;
 try{header=decodeJwtPart(parts[0]);claims=decodeJwtPart(parts[1]);}catch{return false;}
 const now=Math.floor(Date.now()/1000);
 if(header.alg!=='RS256'||!header.kid||claims.aud!==FIREBASE_PROJECT||
    claims.iss!=='https://securetoken.google.com/'+FIREBASE_PROJECT||
    !claims.sub||claims.sub.length>128||claims.exp<=now||claims.iat>now+60||
    claims.auth_time>now+60)return false;
 // 17TRACK credits are private. A public Firebase project permits new Google sign-ins,
 // so enforce a configured owner-email allowlist in addition to the signed token.
 if(!env.TRACK17_OWNER_EMAIL||String(claims.email||'').toLowerCase()!==String(env.TRACK17_OWNER_EMAIL).trim().toLowerCase()||claims.email_verified!==true)return false;
 if(!firebaseKeys||Date.now()>firebaseKeysUntil){
  const r=await fetch(FIREBASE_JWKS);
  if(!r.ok)throw Error('FIREBASE_KEYS_UNAVAILABLE');
  firebaseKeys=await r.json();
  firebaseKeysUntil=Date.now()+Math.min(3600,Number((r.headers.get('cache-control')||'').match(/max-age=(\d+)/)?.[1]||1800))*1000;
 }
 const key=firebaseKeys.keys?.find(k=>k.kid===header.kid);
 if(!key)return false;
 const cryptoKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('RSASSA-PKCS1-v1_5',cryptoKey,base64urlBytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
}
function trackItem(raw){
 const number=String(raw?.number||'').trim().toUpperCase();
 if(!/^[A-Z0-9-]{5,50}$/.test(number))return null;
 const carrier=Number(raw?.carrier)||0;
 if(carrier&&(carrier<1||!Number.isInteger(carrier)))return null;
 return carrier?{number,carrier}:{number};
}
function trackError(row){
 return {code:Number(row?.error?.code)||0,message:clean(row?.error?.message||'Tracking information unavailable',160)};
}
async function call17track(route,items,env){
 const r=await fetch(TRACK_BASE+'/'+route,{method:'POST',headers:{'content-type':'application/json','17token':env.TRACK17_API_KEY},body:JSON.stringify(items)});
 if(!r.ok)throw Error('17TRACK_HTTP_'+r.status);
 const j=await r.json();
 if(j.code!==0||!j.data||!Array.isArray(j.data.accepted))throw Error('17TRACK_API_'+String(j.code||'ERROR'));
 return j.data;
}
function trackEvent(raw,provider){
 const time=String(raw.time_utc||raw.time_iso||raw.time_raw?.date||'').slice(0,40);
 const description=clean(raw.description_translation?.description||raw.description||raw.stage||'',240);
 const location=clean(raw.location||raw.address?.city||'',90);
 const stage=clean(raw.stage||raw.sub_status||'',60);
 // Stable event identity; it is only used for a read marker, never treated as a price/history cache.
 const stable=[time,description,location,provider].join('|');
 let hash=2166136261;for(const char of stable){hash=Math.imul(hash^char.charCodeAt(0),16777619);}
 return {id:(hash>>>0).toString(36),time,description,location,stage};
}
function trackSummary(row){
 const info=row?.track_info||{},tracking=info.tracking||{};
 const providers=Array.isArray(tracking.providers)?tracking.providers:[];
 const dedup=new Map();
 for(const p of providers){
  const carrier=String(p?.provider?.key||p?.provider?.name||'');
  for(const item of (Array.isArray(p.events)?p.events:[])){
   const e=trackEvent(item,carrier);
   if(e.description&&!dedup.has(e.id))dedup.set(e.id,e);
  }
 }
 const latest=info.latest_event;
 if(latest&&!dedup.size){const e=trackEvent(latest,String(row.carrier||''));if(e.description)dedup.set(e.id,e);}
 const events=[...dedup.values()].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,150);
 return {number:row.number,carrier:row.carrier||null,
  status:clean(info.latest_status?.status||'NotFound',40),
  lastUpdated:events[0]?.time||null,events};
}
async function shipmentsApi(request,env,corsHeaders,u){
 if(request.method==='GET'&&u.pathname==='/api/shipments/health'){
  return reply({provider:'17TRACK',configured:Boolean(env.TRACK17_API_KEY&&env.TRACK17_OWNER_EMAIL)},200,corsHeaders);
 }
 if(request.method!=='POST'||!['/api/shipments/register','/api/shipments/track'].includes(u.pathname))return reply({error:'Not found'},404,corsHeaders);
 if(!env.TRACK17_API_KEY||!env.TRACK17_OWNER_EMAIL)return reply({error:'TRACKING_NOT_CONFIGURED'},503,corsHeaders);
 if(!(await verifyFirebaseBearer(request,env)))return reply({error:'TRACKING_AUTH_REQUIRED'},403,corsHeaders);
 if(Number(request.headers.get('content-length')||0)>5000)return reply({error:'Payload too large'},413,corsHeaders);
 let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,corsHeaders)}
 const isRegister=u.pathname.endsWith('/register');
 const source=isRegister?[body]:body?.shipments;
 if(!Array.isArray(source)||!source.length||source.length>(isRegister?1:12))return reply({error:'Expected 1–12 shipment numbers'},400,corsHeaders);
 const list=source.map(trackItem);
 if(list.some(x=>!x)||new Set(list.map(x=>x.number)).size!==list.length)return reply({error:'Invalid or duplicate tracking number'},400,corsHeaders);
 try{
  const data=await call17track(isRegister?'register':'gettrackinfo',isRegister?list.map(x=>({...x,lang:'en'})):list,env);
  const accepted=(data.accepted||[]).map(x=>isRegister?{number:x.number,carrier:x.carrier||null,registered:true}:trackSummary(x));
  const rejected=(data.rejected||[]).map(x=>({number:x.number,carrier:x.carrier||null,registered:isRegister&&Number(x.error?.code)===-18019901,error:trackError(x)}));
  return reply({source:'17TRACK',fetchedAt:new Date().toISOString(),shipments:[...accepted,...rejected]},200,corsHeaders);
 }catch(e){return reply({error:String(e.message||'TRACKING_UNAVAILABLE').slice(0,110)},503,corsHeaders)}
}

export default {
 async fetch(request,env){
  const origin=request.headers.get('origin')||'';const headers=cors(origin,env);const u=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!allowedOrigin(origin,env))return reply({error:'Origin not allowed'},403,headers);
  if(u.pathname.startsWith('/api/shipments/'))return shipmentsApi(request,env,headers,u);
  if(request.method==='GET'&&u.pathname==='/health')return reply({ready:!!(env.EBAY_CLIENT_ID&&env.EBAY_CLIENT_SECRET),provider:'eBay Browse API',shippingDestinationConfigured:/^[0-9]{5,10}$/.test(String(env.EBAY_DELIVERY_POSTAL_CODE||'').trim())},200,headers);
  if(request.method==='POST'&&u.pathname==='/api/item-condition'){
   let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,headers)}
   const itemId=String(body?.itemId||'');
   const marketplace=String(body?.marketplace||'');
   if(!/^v\d\|\d{3,20}\|\d{1,6}$/.test(itemId)||!MARKETS.includes(marketplace))
    return reply({error:'Invalid item'},400,headers);
   try{return reply(await getItemCondition(itemId,marketplace,env,body.postalCode),200,headers)}
   catch(e){return reply({error:String(e.message||'ITEM_CONDITION_UNAVAILABLE')},502,headers)}
  }
  if(request.method!=='POST'||u.pathname!=='/api/search')return reply({error:'Not found'},404,headers);
  if(Number(request.headers.get('content-length')||0)>6000)return reply({error:'Payload too large'},413,headers);
  let body;try{body=await request.json()}catch(_){return reply({error:'Invalid JSON'},400,headers)}
  if(body?.postalCode!==undefined&&!/^[0-9]{7}$/.test(String(body.postalCode)))return reply({error:'Invalid Israeli postal code'},400,headers);
  if(!Array.isArray(body?.cards)||body.cards.length<1||body.cards.length>4)return reply({error:'Expected 1–4 cards'},400,headers);
  const cards=body.cards.map(cardInput);if(cards.some(c=>!c))return reply({error:'Invalid card'},400,headers);
  try{return reply(await searchBatch(cards,env,body.postalCode),200,headers)}
  catch(err){return reply({error:String(err.message||'EBAY_SEARCH_FAILED').slice(0,120)},503,headers)}
 }
};
