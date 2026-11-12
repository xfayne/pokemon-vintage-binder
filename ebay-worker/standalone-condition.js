/* Standalone condition-analysis source adapters. The shared grader has no eBay dependency. */
import {analyzeCardCondition} from './card-condition.js';

const EBAY_HOSTS=new Set(['ebay.com','www.ebay.com','m.ebay.com',
 'ebay.co.uk','www.ebay.co.uk','ebay.de','www.ebay.de',
 'ebay.io','www.ebay.io','ebay.us','www.ebay.us']);
const SHORT_HOSTS=new Set(['ebay.io','www.ebay.io','ebay.us','www.ebay.us']);
const MAX_FILE=2200000;
let lastUpload=0;

function validMime(type,bytes){
 if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
  String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}
function errorResponse(e,reply,headers){
 const code=String(e?.message||'AI_UNAVAILABLE');
 const status=code==='AI_RATE_LIMITED'?429:code==='AI_PROVIDER_TIMEOUT'?504:503;
 return reply({error:/^AI_[A-Z0-9_]+$/.test(code)?code:'AI_UNAVAILABLE'},status,headers);
}

export async function analyzeUploadApi(request,env,headers,{reply,verifyFirebaseBearer}){
 if(!env.GEMINI_API_KEY)return reply({error:'AI_NOT_CONFIGURED'},503,headers);
 if(!/^multipart\/form-data;\s*boundary=/i.test(request.headers.get('content-type')||''))
  return reply({error:'AI_INVALID_UPLOAD'},400,headers);
 if(Number(request.headers.get('content-length')||0)>19000000)
  return reply({error:'AI_UPLOAD_TOO_LARGE'},413,headers);
 if(!(await verifyFirebaseBearer(request,env,env.AI_OWNER_EMAIL||env.TRACK17_OWNER_EMAIL)))
  return reply({error:'AI_AUTH_REQUIRED'},403,headers);
 let form;try{form=await request.formData()}catch{return reply({error:'AI_INVALID_UPLOAD'},400,headers)}
 const files=form.getAll('photos');
 if(!files.length||files.length>8)return reply({error:'AI_INVALID_PHOTO_COUNT'},400,headers);
 const photos=[];let total=0;
 for(const file of files){
  if(!file||typeof file.arrayBuffer!=='function'||!Number.isInteger(file.size)||
   file.size<100||file.size>MAX_FILE)return reply({error:'AI_IMAGE_TOO_LARGE'},413,headers);
  total+=file.size;if(total>17600000)return reply({error:'AI_UPLOAD_TOO_LARGE'},413,headers);
  const mimeType=String(file.type||'').toLowerCase();
  if(!['image/jpeg','image/png','image/webp'].includes(mimeType))
   return reply({error:'AI_UNSUPPORTED_IMAGE'},415,headers);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!validMime(mimeType,bytes))return reply({error:'AI_INVALID_IMAGE'},400,headers);
  photos.push({index:photos.length+1,mimeType,bytes});
 }
 if(Date.now()-lastUpload<10000)return reply({error:'AI_WAIT_BEFORE_RETRY'},429,headers);
 lastUpload=Date.now();
 try{
  const analysis=await analyzeCardCondition({photos,cardContext:{}},{apiKey:env.GEMINI_API_KEY});
  return reply({analysis,imageCount:photos.length,analyzedPhotoIndices:photos.map(p=>p.index)},200,headers);
 }catch(e){return errorResponse(e,reply,headers)}
}

function vettedUrl(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
   !EBAY_HOSTS.has(url.hostname.toLowerCase()))return null;
  return url;
 }catch{return null}
}
function legacyId(url){
 const path=url.pathname.match(/\/(?:itm|ulk\/itm)\/(?:[^/?#]+\/)?(\d{9,20})(?:\/|$)/i);
 const id=path?.[1]||url.searchParams.get('item')||url.searchParams.get('itemid')||url.searchParams.get('itm');
 return /^\d{9,20}$/.test(id||'')?id:null;
}
async function expandLink(start){
 let current=start;
 for(let i=0;i<5;i++){
  const id=legacyId(current);if(id)return {id,url:current};
  if(!SHORT_HOSTS.has(current.hostname.toLowerCase()))break;
  const response=await fetch(current.toString(),{method:'GET',redirect:'manual',headers:{accept:'text/html'}});
  if(response.body)await response.body.cancel().catch(()=>{});
  if(![301,302,303,307,308].includes(response.status))break;
  const location=response.headers.get('location');
  const next=location?vettedUrl(new URL(location,current).toString()):null;
  if(!next)throw Error('EBAY_LINK_UNSUPPORTED');
  current=next;
 }
 throw Error('EBAY_LINK_UNRESOLVED');
}
export async function resolveEbayLinkApi(request,env,headers,{reply,verifyFirebaseBearer,bearer,isEbayImage}){
 if(Number(request.headers.get('content-length')||0)>1500)
  return reply({error:'Payload too large'},413,headers);
 if(!(await verifyFirebaseBearer(request,env,env.AI_OWNER_EMAIL||env.TRACK17_OWNER_EMAIL)))
  return reply({error:'AI_AUTH_REQUIRED'},403,headers);
 let body;try{body=await request.json()}catch{return reply({error:'Invalid JSON'},400,headers)}
 const raw=String(body?.url||'').trim();
 const url=raw.length<=750?vettedUrl(raw):null;
 if(!url)return reply({error:'EBAY_LINK_UNSUPPORTED'},400,headers);
 try{
  const {id,url:finalUrl}=await expandLink(url);
  const marketplace=finalUrl.hostname.endsWith('.de')?'EBAY_DE':
   finalUrl.hostname.endsWith('.co.uk')?'EBAY_GB':'EBAY_US';
  const token=await bearer(env);
  const qs=new URLSearchParams({legacy_item_id:id});
  const response=await fetch('https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?'+qs,{
   headers:{authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':marketplace,accept:'application/json'}});
  if(!response.ok)throw Error('EBAY_ITEM_UNAVAILABLE');
  const item=await response.json();
  if(!/^v\d\|\d{3,20}\|\d{1,6}$/.test(String(item.itemId||'')))throw Error('EBAY_ITEM_UNAVAILABLE');
  const images=[...new Set([item.image?.imageUrl,
   ...(Array.isArray(item.additionalImages)?item.additionalImages.map(x=>x?.imageUrl):[])]
   .filter(x=>typeof x==='string'&&isEbayImage(x)))].slice(0,25);
  if(!images.length)throw Error('AI_NO_USABLE_IMAGES');
  const domain=marketplace==='EBAY_GB'?'ebay.co.uk':marketplace==='EBAY_DE'?'ebay.de':'ebay.com';
  return reply({source:{type:'ebay-listing',marketplace,itemId:item.itemId},
   title:String(item.title||'').slice(0,160),url:'https://www.'+domain+'/itm/'+id,images},200,headers);
 }catch(e){
  const code=String(e?.message||'EBAY_ITEM_UNAVAILABLE');
  const known=['EBAY_LINK_UNRESOLVED','EBAY_LINK_UNSUPPORTED','EBAY_ITEM_UNAVAILABLE','AI_NO_USABLE_IMAGES'];
  const error=known.includes(code)?code:'EBAY_ITEM_UNAVAILABLE';
  return reply({error},error==='EBAY_LINK_UNSUPPORTED'?400:error==='EBAY_LINK_UNRESOLVED'?422:502,headers);
 }
}
