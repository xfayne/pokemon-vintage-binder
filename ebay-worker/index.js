import {analyzeCardCondition} from './card-condition.js';
import {analyzeUploadApi,resolveEbayLinkApi} from './standalone-condition.js';
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
 const c={id:clean(raw.id,40),name:clean(raw.name,80),setName:clean(raw.setName,80),number:clean(raw.number,15),firstEdition:raw.firstEdition===true,finish:['holo','normal','shining'].includes(raw.finish)?raw.finish:null};
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

/* Marketplace text is seller-authored and untrusted: every price comparison needs
 * strong evidence of the EXACT vintage card, not a keyword or a cheap lookalike. */
const VINTAGE_CARD_NAMES=["Here Comes Team Rocket!","Lt. Surge's Electabuzz","Rocket's Sneak Attack","Lt. Surge's Magnemite","Lt. Surge's Electrode","Lt. Surge's Magneton","Lt. Surge's Raticate","Giovanni's Nidoqueen","Giovanni's Nidoran ♀","Giovanni's Nidoran ♂","Team Rocket's Meowth","Rocket's Hitmonchan","Blaine's Kangaskhan","Lt. Surge's Spearow","Blaine's Charmander","Lt. Surge's Pikachu","Lt. Surge's Rattata","Lt. Surge's Voltorb","Giovanni's Gyarados","Giovanni's Nidoking","Lt. Surge's Jolteon","Blaine's Charmeleon","Giovanni's Nidorina","Giovanni's Nidorino","Giovanni's Magikarp","Lt. Surge's Fearow","Misty's Tentacruel","Erika's Victreebel","Lt. Surge's Raichu","Sabrina's Venomoth","Blaine's Growlithe","Erika's Weepinbell","Erika's Bellsprout","Sabrina's Mr. Mime","Sabrina's Slowpoke","Blaine's Charizard","Giovanni's Machamp","Giovanni's Persian","Sabrina's Alakazam","Blaine's Ninetales","Giovanni's Machoke","Erika's Jigglypuff","Erika's Dragonair","Erika's Vileplume","The Rocket's Trap","Brock's Sandslash","Misty's Poliwrath","Misty's Tentacool","Brock's Lickitung","Erika's Exeggcute","Erika's Exeggutor","Misty's Poliwhirl","Sabrina's Haunter","Sabrina's Slowbro","Brock's Sandshrew","Sabrina's Drowzee","Sabrina's Venonat","Blaine's Arcanine","Brock's Ninetales","Giovanni's Pinsir","Sabrina's Golduck","Blaine's Rapidash","Erika's Bulbasaur","Giovanni's Meowth","Lt. Surge's Eevee","Sabrina's Kadabra","Giovanni's Machop","Sabrina's Porygon","Sabrina's Psyduck","Blaine's Moltres","Erika's Clefable","Rocket's Moltres","Rocket's Scyther","Sabrina's Gengar","Erika's Clefairy","Misty's Cloyster","Rocket's Snorlax","Brock's Graveler","Misty's Shellder","Sabrina's Gastly","Erika's Venusaur","Misty's Gyarados","Koga's Pidgeotto","Brock's Primeape","Blaine's Rhyhorn","Misty's Magikarp","Light Wigglytuff","Dark Charmeleon","Brock's Rhyhorn","Misty's Goldeen","Blaine's Magmar","Brock's Geodude","Erika's Dratini","Misty's Psyduck","Misty's Seaking","Misty's Starmie","Blaine's Ponyta","Blaine's Tauros","Blaine's Vulpix","Erika's Tangela","Misty's Poliwag","Koga's Beedrill","Misty's Golduck","Rocket's Mewtwo","Rocket's Zapdos","Brock's Dugtrio","Blaine's Dodrio","Erika's Ivysaur","Misty's Dewgong","Sabrina's Hypno","Blaine's Mankey","Brock's Diglett","Dark Feraligatr","Dark Typhlosion","Light Azumarill","Light Dragonite","Light Dragonair","Light Piloswine","Dark Forretress","Dark Wigglytuff","Light Ninetales","_____'s Pikachu","Surfing Pikachu","Dark Blastoise","Dark Charizard","Dark Dragonite","Dark Vileplume","Rainbow Energy","Dark Dragonair","Dark Electrode","Dark Wartortle","Brock's Rhydon","Misty's Seadra","Brock's Golbat","Erika's Oddish","Sabrina's Jynx","Brock's Mankey","Brock's Vulpix","Misty's Horsea","Misty's Staryu","Sabrina's Abra","Koga's Koffing","Koga's Weezing","Blaine's Doduo","Koga's Tangela","Dark Tyranitar","Light Arcanine","Miracle Energy","Dark Exeggutor","Light Vaporeon","Light Venomoth","Dark Octillery","Light Sunflora","Computer Error","Flying Pikachu","Pokémon Center","Dark Alakazam","Dark Gyarados","Dark Magneton","Dark Primeape","Dark Rapidash","Dark Vaporeon","Dark Raticate","Brock's Golem","Brock's Zubat","Erika's Gloom","Koga's Golbat","Koga's Kakuna","Koga's Pidgey","Erika's Paras","Koga's Grimer","Koga's Weedle","Dark Ampharos","Dark Houndoom","Dark Porygon2","Light Togetic","Dark Magcargo","Dark Slowking","Dark Ursaring","Light Lanturn","Light Machamp","Dark Croconaw","Light Dewgong","Light Flareon","Light Golduck","Light Jolteon","Light Machoke","Light Slowbro","Lucky Stadium","Pokémon Tower","Dark Dugtrio","Dark Machamp","Dark Slowbro","Dark Weezing","Dark Flareon","Dark Golduck","Dark Jolteon","Dark Kadabra","Dark Machoke","Dark Persian","Brock's Onix","Misty's Seel","Koga's Ditto","Koga's Arbok","Koga's Ekans","Koga's Zubat","Metal Energy","Dark Donphan","Dark Ariados","Dark Omastar","Light Ledian","Dark Flaaffy","Dark Haunter","Dark Omanyte","Dark Pupitar","Dark Quilava","Cool Porygon","Feraligator","Dark Golbat","Dark Crobat","Dark Espeon","Dark Gengar","Dark Scizor","Dark Raichu","Hitmonchan","Electabuzz","Charmeleon","Farfetch'd","Charmander","Kangaskhan","Victreebel","Wigglytuff","Butterfree","Weepinbell","Bellsprout","Jigglypuff","Aerodactyl","Tentacruel","Dark Arbok","Dark Hypno","Dark Gloom","Koga's Muk","Feraligatr","Typhlosion","Forretress","Misdreavus","Blastoise","Charizard","Ninetales","Poliwrath","Dragonair","Electrode","Pidgeotto","Growlithe","Poliwhirl","Wartortle","Bulbasaur","Magnemite","Nidoran ♂","Sandshrew","Nidoqueen","Vileplume","Exeggutor","Lickitung","Exeggcute","Nidoran ♀","Dragonite","Hitmonlee","Sandslash","Tentacool","Lt. Surge","Azumarill","Bellossom","Heracross","Piloswine","Chikorita","Cyndaquil","Girafarig","Sudowoodo","Hitmontop","Tyranitar","Unown [A]","Wobbuffet","Igglybuff","Unown [D]","Unown [F]","Unown [M]","Unown [N]","Unown [U]","Dunsparce","Teddiursa","Unown [E]","Unown [I]","Unown [O]","Octillery","Unown [B]","Unown [Y]","Unown [K]","Unown [G]","Unown [H]","Unown [W]","Unown [X]","Unown [C]","Unown [P]","Unown [Q]","Unown [Z]","Unown [L]","Unown [S]","Unown [T]","Unown [V]","Unown [J]","Alakazam","Clefairy","Gyarados","Magneton","Nidoking","Venusaur","Beedrill","Arcanine","Magikarp","Nidorino","Raticate","Caterpie","Squirtle","Clefable","Mr. Mime","Vaporeon","Venomoth","Nidorina","Parasect","Primeape","Rapidash","Articuno","Kabutops","Cloyster","Graveler","Shellder","Slowpoke","Dark Muk","Giovanni","Ampharos","Jumpluff","Meganium","Skarmory","Slowking","Croconaw","Granbull","Quagsire","Skiploom","Sunflora","Chinchou","Hoothoot","Snubbull","Spinarak","Stantler","Totodile","Houndoom","Houndour","Politoed","Smeargle","Ursaring","Larvitar","Delibird","Porygon2","Magcargo","Qwilfish","Remoraid","Smoochum","Chansey","Machamp","Dugtrio","Dewgong","Dratini","Haunter","Ivysaur","Kadabra","Machoke","Porygon","Diglett","Drowzee","Koffing","Metapod","Pikachu","Poliwag","Rattata","Starmie","Tangela","Voltorb","Flareon","Jolteon","Pidgeot","Scyther","Snorlax","Marowak","Persian","Seaking","Goldeen","Rhyhorn","Spearow","Venonat","Moltres","Golduck","Kingler","Omastar","Slowbro","Weezing","Geodude","Omanyte","Psyduck","Sabrina","Kingdra","Steelix","Togetic","Donphan","Murkrow","Sneasel","Ariados","Bayleef","Flaaffy","Lanturn","Miltank","Noctowl","Quilava","Mantine","Sentret","Shuckle","Sunkern","Umbreon","Corsola","Pupitar","Tyrogue","Blissey","Suicune","Mewtwo","Raichu","Zapdos","Kakuna","Magmar","Gastly","Machop","Pidgey","Ponyta","Staryu","Vulpix","Weedle","Pinsir","Dodrio","Fearow","Rhydon","Tauros","Cubone","Mankey","Meowth","Oddish","Gengar","Lapras","Golbat","Seadra","Grimer","Horsea","Kabuto","Krabby","Blaine","Cleffa","Elekid","Furret","Ledian","Phanpy","Togepi","Gligar","Hoppip","Ledyba","Mareep","Marill","Swinub","Wooper","Espeon","Scizor","Pineco","Celebi","Crobat","Raikou","Slugma","Doduo","Gloom","Eevee","Paras","Ditto","Hypno","Arbok","Golem","Ekans","Zubat","Brock","Erika","Misty","Lugia","Pichu","Magby","Aipom","Yanma","Entei","Ho-oh","Jynx","Seel","Abra","Onix","Koga","Xatu","Natu","Muk","Mew"].map(normalized);
const KNOWN_SETS=["Base Set","Base Set 2","Jungle","Fossil","Team Rocket","Gym Heroes","Gym Challenge","Neo Genesis","Neo Discovery","Neo Revelation","Neo Destiny","Southern Islands","Legendary Collection","Wizards Black Star Promos","Gem Pack","Genetic Apex","Evolving Skies","Scarlet Violet","Sword Shield","Expedition","Aquapolis","Skyridge"].map(normalized);
const hasPhrase=(hay,needle)=>(' '+hay+' ').includes(' '+needle+' ');
const titleNumbers=s=>[...String(s||'').matchAll(/\b\d{1,4}\s*[\/／]\s*\d{1,4}\b/g)].map(x=>normalized(x[0]));
const isNonEnglish=text=>/[ぁ-ヿ一-鿿가-힣]/u.test(String(text||''))||
 /\b(?:japanese|japanisch|japonais|chinese|mandarin|simplified chinese|traditional chinese|korean|spanish|español|italian|italiano|french|français|german language|deutsch|portuguese|português|russian|russisch|thai|indonesian|indonesisch)\b/i.test(String(text||''));
const isWrongProduct=text=>/\b(?:tcg\s*pocket|pokemon\s*pocket|digital\s*(?:card|trade|only|code)?|virtual\s*(?:card|trade)?|not\s*(?:a\s*)?physical|non\s*physical|code\s*card|online\s*code|qr\s*code|download\s*code|proxy|orica|replica|reprint|counterfeit|facsimile|custom\s*(?:art|card|print)?|fan\s*art|poster|art\s*print|sticker|art[\s_-]*cases?|key[\s-]?(?:rings?|chains?|fobs?)|keyfobs?|schl[uü]sselanh[aä]nger|schluesselanhaenger|playmat|sleeves?|display\s*box|booster\s*pack|sealed\s*pack|gem\s*pack|pack\s*of\s*\d+|3d\s*printed|psa|cgc|bgs|graded|slab)\b/i.test(String(text||''))||
 /\b(?:choose\s*(?:your|a)\s*card|you\s*choose|pick\s*(?:your|a)\s*card|select\s*(?:a|your)\s*card|mystery\s*(?:card|pack))\b/i.test(String(text||''));
function otherCardNames(title,target){
 const t=normalized(title),targetName=normalized(target);
 const names=new Set();
 for(const name of VINTAGE_CARD_NAMES){
  if(name===targetName||hasPhrase(targetName,name)||hasPhrase(name,targetName))continue;
  if(hasPhrase(t,name))names.add(name);
 }
 return [...names];
}
function strictCardMatch(raw,card,aspects){
 const title=String(raw||''),t=normalized(title),name=normalized(card.name),set=normalized(card.setName);
 const num=normalized(card.number);
 if(!name||!hasPhrase(t,name)||isNonEnglish(title)||isWrongProduct(title))return null;
 if(!card.firstEdition&&/\b(?:1st|first)\s*edition\b/i.test(title))return null;
 const reasons=[];
 const titleNums=titleNumbers(title);
 if(num&&titleNums.length&&!titleNums.includes(num))return null;
 const hasNum=!!num&&titleNums.includes(num);
 if(titleNums.length>1)reasons.push('בכותרת מוזכרים כמה מספרי קלפים');
 const hasSet=hasPhrase(t,set);
 const otherSets=KNOWN_SETS.filter(other=>other!==set&&!hasPhrase(set,other)&&!hasPhrase(other,set)&&hasPhrase(t,other));
 if(!hasSet&&otherSets.length)return null;
 if(!hasSet)reasons.push('הסדרה המדויקת לא אומתה בכותרת');
 if(!hasNum)reasons.push('מספר הקלף לא אומת');
 const otherNames=otherCardNames(title,card.name);
 if(otherNames.length)reasons.push('הכותרת מזכירה קלפים נוספים');
 if(/\b(?:lot|bundle|mixed\s*cards|multiple\s*cards|various\s*cards|assorted|collection|set\s*of)\b/i.test(title))
  reasons.push('מודעה מרובת קלפים או וריאציות');
 if(card.firstEdition&&!/\b(?:1st|first)\s*edition\b/i.test(title))
  reasons.push('הדפסת First Edition לא אומתה');
 if(card.finish==='holo'&&/\b(?:non[\s-]?holo|regular\s*rare|reverse\s*holo)\b/i.test(title))
  reasons.push('קיימת סתירה לגבי גרסת Holo');
 if(card.finish==='normal'&&/\b(?:holographic|holo\s*rare)\b/i.test(title)&&!/\bnon[\s-]?holo\b/i.test(title))
  reasons.push('קיימת סתירה לגבי גרסת Holo');
 const aspectData=Array.isArray(aspects)?aspects:[];
 let evidence=0;
 for(const a of aspectData){
  const field=normalized(a?.name),rawValue=Array.isArray(a?.value)?a.value.join(' '):a?.value||a?.values?.join(' ')||'';
  const value=normalized(rawValue);
  if(!field||!value)continue;
  if(/\b(?:language|sprache|lingua|langue|idioma)\b/.test(field)){
   if(isNonEnglish(value))return null;
  }
  if(/\b(?:card number|card no|number)\b/.test(field)){
   const vals=titleNumbers(rawValue);
   if(num&&vals.length&&!vals.includes(num))return null;
   if(num&&vals.includes(num))evidence++;
  }
  if(/\b(?:set|expansion|series)\b/.test(field)){
   if(hasPhrase(value,set))evidence++;
   else if(KNOWN_SETS.some(x=>hasPhrase(value,x)))return null;
  }
  if(/\b(?:card name|character|pokemon name)\b/.test(field)){
   if(!hasPhrase(value,name)&&VINTAGE_CARD_NAMES.some(x=>hasPhrase(value,x)))return null;
   if(hasPhrase(value,name))evidence++;
  }
  if(/\b(?:finish|holo)\b/.test(field)){
   if(card.finish==='holo'&&/\bnon\s*holo\b/.test(value))reasons.push('ה־Holo אינו תואם לפרטי המוכר');
   if(card.finish==='normal'&&/\bholo(?:graphic)?\b/.test(value)&&!/\bnon\s*holo\b/.test(value))reasons.push('ה־Holo אינו תואם לפרטי המוכר');
  }
 }
 // Explicit card number + set + name is usually sufficient; ambiguous items
 // remain review-only unless their structured item aspects add corroboration.
 const strong=hasNum&&hasSet&&reasons.length===0||hasSet&&evidence>=2&&reasons.filter(x=>!['מספר הקלף לא אומת','הסדרה המדויקת לא אומתה בכותרת'].includes(x)).length===0;
 if(!strong&&!reasons.length)reasons.push('לא נמצאו די פרטי זיהוי עצמאיים');
 return {status:strong?'strong':'review',confidence:strong?Math.min(99,91+evidence*2):Math.min(68,43+evidence*7),reasons,
  evidence:{titleNumber:hasNum,titleSet:hasSet,aspects:evidence}};
}

function titleMatch(raw,card){
 const verified=strictCardMatch(raw,card);
 if(!verified)return null;
 const t=normalized(raw);
 const warnings=[...verified.reasons];
 if(!card.firstEdition)warnings.push('Unlimited לא אומתה');
 if(/\b(?:crease|creased|fold|bent|damaged|dmg|heavily played)\b/.test(t))warnings.push('תיאור מציין נזק פיזי');
 return {confidence:verified.confidence,warnings,verificationStatus:verified.status,
  verificationReasons:verified.reasons};
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
  marketplace:market,matchConfidence:match.confidence,warnings:match.warnings,
  verificationStatus:match.verificationStatus,verificationReasons:match.verificationReasons
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
async function getItemCondition(itemId,market,env,postalCode,card){
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
 const match=card&&item.title?strictCardMatch(item.title,card,item.localizedAspects):null;
 return {condition:cond,grade:desc?.grade||explicit||null,
  label:desc?.label||cond||null,
  source:desc||explicit?'seller':'unknown',verificationStatus:!card?'unknown':!item.title?'review':match?.status||'rejected',
  verificationReasons:match?.reasons||[],matchConfidence:match?.confidence||0};
}

/* Listing photos are retrieved from eBay only when a user opens a gallery.
 * Never add photo arrays to search results: that would cost requests and bandwidth
 * for listings the user never chooses to inspect. */
async function getItemImages(itemId,market,env){
 const token=await bearer(env);
 const response=await fetch(API+'/buy/browse/v1/item/'+encodeURIComponent(itemId),{headers:{
  authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':market,accept:'application/json'
 }});
 if(!response.ok)throw Error('eBay item images returned HTTP '+response.status);
 const item=await response.json();
 const photos=[item.image?.imageUrl,...(Array.isArray(item.additionalImages)?item.additionalImages.map(x=>x?.imageUrl):[])];
 const images=[...new Set(photos.filter(src=>{
  if(typeof src!=='string')return false;
  try{const url=new URL(src);return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}
 }))].slice(0,25);
 return {images};
}

/** Fetch only vetted first-party eBay CDN images and cap actual bytes. */
function isEbayImage(src){
 try{
  const url=new URL(src);
  return url.protocol==='https:'&&url.hostname==='i.ebayimg.com'&&!url.username&&!url.password;
 }catch{return false}
}
async function imageBytes(url){
 // Workers supports manual redirects. The status check rejects redirects before following them.
 const response=await fetch(url,{redirect:'manual',headers:{accept:'image/jpeg,image/png,image/webp'}});
 if(!response.ok)throw Error('AI_IMAGE_FETCH_FAILED');
 const contentType=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(contentType))throw Error('AI_UNSUPPORTED_IMAGE');
 if(Number(response.headers.get('content-length')||0)>2200000)throw Error('AI_IMAGE_TOO_LARGE');
 const chunks=[];let length=0;
 if(!response.body)throw Error('AI_IMAGE_FETCH_FAILED');
 const reader=response.body.getReader();
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   length+=value.length;
   if(length>2200000)throw Error('AI_IMAGE_TOO_LARGE');
   chunks.push(value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(length);
 let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 if(length<100)throw Error('AI_INVALID_IMAGE');
 return {mimeType:contentType,bytes};
}
const analysisCooldown=new Map();
/* Private inference endpoint; future photo sources can call analyzeCardCondition without eBay. */
async function analyzeConditionApi(request,env,headers){
 if(!env.GEMINI_API_KEY)return reply({error:'AI_NOT_CONFIGURED'},503,headers);
 if(Number(request.headers.get('content-length')||0)>1800)return reply({error:'Payload too large'},413,headers);
 const ownerEmail=env.AI_OWNER_EMAIL||env.TRACK17_OWNER_EMAIL;
 if(!(await verifyFirebaseBearer(request,env,ownerEmail)))return reply({error:'AI_AUTH_REQUIRED'},403,headers);
 let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,headers)}
 const source=body?.source;
 if(source?.type!=='ebay-listing')return reply({error:'AI_SOURCE_NOT_SUPPORTED'},400,headers);
 const itemId=String(source.itemId||''),marketplace=String(source.marketplace||'');
 if(!/^v\d\|\d{3,20}\|\d{1,6}$/.test(itemId)||!MARKETS.includes(marketplace))
  return reply({error:'Invalid item'},400,headers);
 const name=String(body?.cardContext?.name||'').slice(0,75);
 const setName=String(body?.cardContext?.setName||'').slice(0,75);
 const scope=marketplace+':'+itemId;
 const last=analysisCooldown.get(scope)||0;
 if(Date.now()-last<10000)return reply({error:'AI_WAIT_BEFORE_RETRY'},429,headers);
 analysisCooldown.set(scope,Date.now());
 if(analysisCooldown.size>200)for(const [k,when] of analysisCooldown){if(Date.now()-when>60000)analysisCooldown.delete(k)}
 try{
  const listing=await getItemImages(itemId,marketplace,env);
  const candidates=listing.images.map((url,i)=>({url,index:i+1})).filter(x=>isEbayImage(x.url)).slice(0,8);
  if(!candidates.length)return reply({error:'AI_NO_USABLE_IMAGES'},422,headers);
  // A failed photo should not hide the other usable photos.
  const fetched=await Promise.allSettled(candidates.map(async x=>({...await imageBytes(x.url),index:x.index})));
  const photos=fetched.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!photos.length)return reply({error:'AI_NO_USABLE_IMAGES'},422,headers);
  const analysis=await analyzeCardCondition({photos,cardContext:{name,setName}},{apiKey:env.GEMINI_API_KEY});
  // A URL-set fingerprint detects listing photo changes without persisting seller bytes.
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(listing.images.join('\n')));
  analysis.imageSetFingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return reply({analysis,source:{type:'ebay-listing',marketplace,itemId},imageCount:listing.images.length,analyzedPhotoIndices:photos.map(x=>x.index)},200,headers);
 }catch(e){
  const msg=String(e?.message||'AI_UNAVAILABLE');
  const status=msg==='AI_RATE_LIMITED'?429:msg==='AI_PROVIDER_TIMEOUT'?504:503;
  return reply({error:/^AI_[A-Z0-9_]+$/.test(msg)?msg:'AI_UNAVAILABLE'},status,headers);
 }
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
async function verifyFirebaseBearer(request,env,ownerEmail=env.TRACK17_OWNER_EMAIL){
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
 if(!ownerEmail||String(claims.email||'').toLowerCase()!==String(ownerEmail).trim().toLowerCase()||claims.email_verified!==true)return false;
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
  if(request.method==='POST'&&u.pathname==='/api/analyze-condition')return analyzeConditionApi(request,env,headers);
  if(request.method==='POST'&&u.pathname==='/api/analyze-upload')return analyzeUploadApi(request,env,headers,{reply,verifyFirebaseBearer});
  if(request.method==='POST'&&u.pathname==='/api/resolve-ebay-link')return resolveEbayLinkApi(request,env,headers,{reply,verifyFirebaseBearer,bearer,isEbayImage});
  if(request.method==='GET'&&u.pathname==='/health')return reply({ready:!!(env.EBAY_CLIENT_ID&&env.EBAY_CLIENT_SECRET),provider:'eBay Browse API',shippingDestinationConfigured:/^[0-9]{5,10}$/.test(String(env.EBAY_DELIVERY_POSTAL_CODE||'').trim()),aiConfigured:Boolean(env.GEMINI_API_KEY)},200,headers);
  if(request.method==='POST'&&u.pathname==='/api/item-images'){
   if(Number(request.headers.get('content-length')||0)>1200)return reply({error:'Payload too large'},413,headers);
   let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,headers)}
   const itemId=String(body?.itemId||''),marketplace=String(body?.marketplace||'');
   if(!/^v\d\|\d{3,20}\|\d{1,6}$/.test(itemId)||!MARKETS.includes(marketplace))
    return reply({error:'Invalid item'},400,headers);
   try{return reply(await getItemImages(itemId,marketplace,env),200,headers)}
   catch(e){return reply({error:String(e.message||'ITEM_IMAGES_UNAVAILABLE').slice(0,110)},502,headers)}
  }
  if(request.method==='POST'&&u.pathname==='/api/item-condition'){
   let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,headers)}
   const itemId=String(body?.itemId||'');
   const marketplace=String(body?.marketplace||'');
   if(!/^v\d\|\d{3,20}\|\d{1,6}$/.test(itemId)||!MARKETS.includes(marketplace))
    return reply({error:'Invalid item'},400,headers);
   try{return reply(await getItemCondition(itemId,marketplace,env,body.postalCode,body.card?cardInput(body.card):null),200,headers)}
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
