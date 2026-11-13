/* Standalone, source-neutral condition grading. No upload bytes are persisted. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 if(!$('analysisPage'))return;
 const ENDPOINT='https://pokemon-vintage-ebay-deals.xfayne.workers.dev';
 const GRADES=['NM','LP','MP','HP','DMG'];
 const state={mode:'photos',images:[],blobs:[],source:null,listing:null,index:0,analysis:null,
  savingFailed:false,serial:0,busy:false,highlight:-1};
 const status=$('analysisStatus'),preview=$('analysisPreview'),result=$('analysisResult');
 const run=$('analysisRun'),main=$('analysisMainPhoto'),stage=$('analysisStage');
 const text=(node,value)=>{node.textContent=value;return node};
 const element=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!=null)el.textContent=content;
  return el;
 };
 function message(value,isError=false){
  status.textContent=value||'';
  status.classList.toggle('is-error',isError);
 }
 function errorText(code){
  return ({
   AI_AUTH_REQUIRED:'אין הרשאה לניתוח בחשבון הזה. התחבר עם Google לחשבון המורשה.',
   AI_NOT_CONFIGURED:'שירות הניתוח אינו מוגדר בשרת.',
   AI_INVALID_PHOTO_COUNT:'אפשר לנתח בין תמונה אחת לשמונה תמונות.',
   AI_IMAGE_TOO_LARGE:'אחת התמונות גדולה מדי. נסה תמונה קטנה יותר.',
   AI_UPLOAD_TOO_LARGE:'התמונות גדולות מדי לשליחה.',
   AI_UNSUPPORTED_IMAGE:'פורמט התמונה אינו נתמך.',
   AI_NO_USABLE_IMAGES:'לא נמצאו תמונות מתאימות לניתוח.',
   AI_INVALID_IMAGE:'אחת התמונות פגומה או אינה תמונה נתמכת.',
   AI_WAIT_BEFORE_RETRY:'נא להמתין מעט לפני ניתוח נוסף.',
   AI_PROVIDER_BUSY:'Gemini עמוס כרגע. אפשר לנסות שוב.',
   AI_PROVIDER_HTTP_503:'Gemini עמוס כרגע. אפשר לנסות שוב.',
   AI_PROVIDER_HTTP_524:'Gemini לא השיב לבקשה. אפשר לנסות שוב.',
   AI_PROVIDER_TIMEOUT:'הבקשה ל־Gemini הסתיימה ללא תשובה.',
   AI_RATE_LIMITED:'הגעת למכסת הבקשות של Gemini.',
   EBAY_LINK_UNSUPPORTED:'יש להדביק קישור HTTPS תקין למודעה ב־eBay.',
   EBAY_LINK_UNRESOLVED:'לא הצלחתי לפתוח את קישור השיתוף. נסה להעתיק את כתובת המודעה המלאה.',
   EBAY_ITEM_UNAVAILABLE:'המודעה אינה זמינה כרגע דרך eBay. בדוק את הקישור.'
  })[code]||code||'הבקשה נכשלה. נסה שוב.';
 }
 function clearImages(){
  state.images.filter(s=>s.startsWith('blob:')).forEach(url=>URL.revokeObjectURL(url));
  state.images=[];state.blobs=[];state.source=null;state.listing=null;state.analysis=null;
  state.index=0;state.highlight=-1;state.savingFailed=false;
  preview.hidden=true;result.hidden=true;result.replaceChildren();
  $('analysisThumbs').replaceChildren();$('analysisListing').replaceChildren();
  $('analysisListing').hidden=true;main.removeAttribute('src');
  state.serial++;
 }
 function setMode(mode){
  if(!['photos','ebay'].includes(mode)||state.busy||mode===state.mode)return;
  state.mode=mode;clearImages();message('');
  $('analysisUpload').hidden=mode!=='photos';$('analysisEbay').hidden=mode!=='ebay';
  document.querySelectorAll('[data-analysis-mode]').forEach(button=>{
   const selected=button.dataset.analysisMode===mode;
   button.classList.toggle('selected',selected);
   button.setAttribute('aria-pressed',String(selected));
  });
 }
 document.querySelectorAll('[data-analysis-mode]').forEach(button=>
  button.addEventListener('click',()=>setMode(button.dataset.analysisMode)));
 function validBox(box){
  return Array.isArray(box)&&box.length===4&&box.every(x=>Number.isInteger(x)&&x>=0&&x<=1000)&&
   box[0]<box[2]&&box[1]<box[3];
 }
 function drawBoxes(){
  const overlay=$('analysisOverlay');overlay.replaceChildren();
  if(!main.complete||!main.naturalWidth||!main.naturalHeight||!state.analysis)return;
  const observations=Array.isArray(state.analysis.observations)?state.analysis.observations:[];
  const width=stage.clientWidth,height=stage.clientHeight;
  const scale=Math.min(width/main.naturalWidth,height/main.naturalHeight);
  const dw=scale*main.naturalWidth,dh=scale*main.naturalHeight;
  const left=(width-dw)/2,top=(height-dh)/2;
  observations.slice(0,24).forEach((finding,i)=>{
   for(const loc of (Array.isArray(finding.locations)?finding.locations:[])){
    if(loc.photoIndex!==state.index+1||!validBox(loc.box2d))continue;
    const [ymin,xmin,ymax,xmax]=loc.box2d;
    const box=element('span','analysis-defect-box'+(i===state.highlight?' is-highlighted':''));
    box.style.left=left+xmin*dw/1000+'px';
    box.style.top=top+ymin*dh/1000+'px';
    box.style.width=(xmax-xmin)*dw/1000+'px';
    box.style.height=(ymax-ymin)*dh/1000+'px';
    box.title=String(finding.finding||'פגם אפשרי');
    overlay.appendChild(box);
   }
  });
 }
 main.addEventListener('load',drawBoxes);
 window.addEventListener('resize',drawBoxes);
 function showPhoto(){
  if(!state.images.length)return;
  main.src=state.images[state.index];
  main.alt='תמונה '+(state.index+1)+' מתוך '+state.images.length;
  $('analysisCounter').textContent=(state.index+1)+' / '+state.images.length;
  $('analysisPrev').disabled=state.images.length===1;
  $('analysisNext').disabled=state.images.length===1;
  $('analysisThumbs').querySelectorAll('button').forEach((b,i)=>{
   const active=i===state.index;b.classList.toggle('selected',active);
   b.setAttribute('aria-current',String(active));
  });
  drawBoxes();
 }
 function selectPhoto(index){
  if(index<0||index>=state.images.length)return;
  state.index=index;showPhoto();
 }
 $('analysisPrev').addEventListener('click',()=>selectPhoto((state.index+state.images.length-1)%state.images.length));
 $('analysisNext').addEventListener('click',()=>selectPhoto((state.index+1)%state.images.length));
 let swipeX=null;
 stage.addEventListener('touchstart',e=>{if(e.touches.length===1)swipeX=e.touches[0].clientX;},{passive:true});
 stage.addEventListener('touchend',e=>{
  if(swipeX==null||!e.changedTouches.length)return;
  const dx=e.changedTouches[0].clientX-swipeX;swipeX=null;
  if(Math.abs(dx)>45&&state.images.length>1)
   selectPhoto((state.index+(dx<0?1:-1)+state.images.length)%state.images.length);
 },{passive:true});
 function renderImages(){
  preview.hidden=!state.images.length;
  $('analysisThumbs').replaceChildren();
  state.images.forEach((url,i)=>{
   const button=element('button');
   button.type='button';button.setAttribute('aria-label','תמונה '+(i+1));
   const thumb=element('img');thumb.src=url;thumb.alt='';thumb.loading='lazy';
   button.appendChild(thumb);button.addEventListener('click',()=>selectPhoto(i));
   $('analysisThumbs').appendChild(button);
  });
  if(state.images.length)showPhoto();
  run.disabled=!state.images.length;
 }
 // iOS Safari supports a separate camera input; the ordinary picker supports albums and files.
 $('analysisCameraButton').addEventListener('click',()=>$('analysisCameraInput').click());
 $('analysisFilesButton').addEventListener('click',()=>$('analysisFilesInput').click());
 async function resizedJpeg(file){
  if(!String(file.type||'').startsWith('image/')||file.size>16000000)throw Error('יש לבחור תמונות עד 16MB בפורמט תמונה.');
  const raw=URL.createObjectURL(file);
  let img;
  try{
   img=await new Promise((resolve,reject)=>{
    const node=new Image();
    node.onload=()=>resolve(node);
    node.onerror=()=>reject(Error('לא ניתן לפתוח את התמונה. נסה קובץ JPG או PNG.'));
    node.src=raw;
   });
  }finally{URL.revokeObjectURL(raw)}
  if(!img.naturalWidth||!img.naturalHeight)throw Error('התמונה אינה תקינה.');
  let side=1800,blob;
  for(let attempt=0;attempt<4;attempt++){
   const scale=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const context=canvas.getContext('2d');
   if(!context)throw Error('הדפדפן אינו יכול לעבד את התמונה.');
   context.drawImage(img,0,0,canvas.width,canvas.height);
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',attempt<2?0.86:0.72));
   canvas.width=0;canvas.height=0;
   if(blob&&blob.size<=2100000&&blob.size>=100)return blob;
   side=Math.round(side*0.75);
  }
  throw Error('התמונה גדולה מדי גם לאחר צמצום.');
 }
 async function addFiles(fileList){
  if(state.busy)return;
  const incoming=Array.from(fileList||[]);
  if(!incoming.length)return;
  if(state.blobs.length+incoming.length>8){message('אפשר לבחור עד שמונה תמונות בסך הכול.',true);return;}
  const serial=state.serial;
  message('מכין תמונות לניתוח…');
  try{
   const blobs=[];
   for(const file of incoming)blobs.push(await resizedJpeg(file));
   if(serial!==state.serial||state.mode!=='photos')return;
   state.analysis=null;state.savingFailed=false;result.hidden=true;result.replaceChildren();
   state.blobs.push(...blobs);
   state.images.push(...blobs.map(blob=>URL.createObjectURL(blob)));
   renderImages();message('נבחרו '+state.images.length+' תמונות. הניתוח יתחיל רק בלחיצה על הכפתור.');
  }catch(e){if(serial===state.serial)message(String(e.message||e),true);}
 }
 for(const id of ['analysisCameraInput','analysisFilesInput']){
  $(id).addEventListener('change',e=>{void addFiles(e.target.files);e.target.value='';});
 }
 function cloudAccess(){
  const cloud=window.VintageCloud;
  if(!cloud?.canEdit?.())throw Error('יש להתחבר ל־Google כדי להשתמש בניתוח AI.');
  return cloud;
 }
 async function loadEbay(){
  if(state.busy)return;
  const url=$('analysisEbayUrl').value.trim();
  if(!url){message('הדבק קישור למודעת eBay.',true);return;}
  clearImages();
  const serial=state.serial;state.busy=true;
  const button=$('analysisLoadEbay');button.disabled=true;button.textContent='טוען…';status.classList.add('is-busy');
  message('מביא את תמונות המודעה מ־eBay…');
  try{
   const cloud=cloudAccess(),token=await cloud.getIdToken();
   const response=await fetch(ENDPOINT+'/api/resolve-ebay-link',{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+token},
    body:JSON.stringify({url})});
   const data=await response.json();
   if(!response.ok)throw Error(errorText(data.error));
   if(serial!==state.serial)return;
   if(!Array.isArray(data.images)||!data.images.length||!data.source)throw Error('לא נמצאו תמונות קלף במודעה.');
   state.images=data.images.filter(u=>{try{return new URL(u).hostname==='i.ebayimg.com'&&u.startsWith('https://')}catch{return false}});
   state.source=data.source;state.listing={title:data.title,url:data.url};
   if(!state.images.length)throw Error('לא נמצאו תמונות קלף במודעה.');
   const listing=$('analysisListing');listing.replaceChildren();
   listing.appendChild(element('strong',null,data.title||'מודעת eBay'));
   const anchor=element('a',null,'צפה במודעה ב־eBay ↗');
   anchor.href=data.url;anchor.target='_blank';anchor.rel='noopener noreferrer';
   listing.appendChild(anchor);listing.hidden=false;
   renderImages();message('התמונות נטענו. אפשר לדפדף בהן ולנתח את מצב הקלף.');
  }catch(e){if(serial===state.serial)message(String(e.message||e),true)}
  finally{state.busy=false;button.disabled=false;button.textContent='טען תמונות';status.classList.remove('is-busy')}
 }
 $('analysisLoadEbay').addEventListener('click',()=>void loadEbay());
 $('analysisEbayUrl').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void loadEbay();}});
 function showResult(cached=false){
  const data=state.analysis;if(!data)return;
  result.replaceChildren();
  const header=element('div','analysis-grade-head');
  header.appendChild(element('strong',null,'הערכת AI: '+data.grade));
  header.appendChild(element('span',null,Math.round(Number(data.confidencePercent)||0)+'% ביטחון'));
  result.appendChild(header);
  result.appendChild(element('p','analysis-disclaimer','הערכה לפי התמונות בלבד — אינה דירוג מקצועי או אימות מקוריות.'));
  if(cached)result.appendChild(element('p','analysis-cache','תוצאה שמורה — לא בוצעה בקשת AI נוספת.'));
  const dist=element('div','analysis-distribution');
  GRADES.forEach(g=>{
   const line=element('div','analysis-dist-row');
   line.appendChild(element('span',null,g));
   const track=element('div','analysis-dist-track');
   const fill=element('div','analysis-dist-fill');
   fill.style.width=Math.max(0,Math.min(100,Number(data.gradePercentages?.[g])||0))+'%';
   track.appendChild(fill);line.appendChild(track);
   line.appendChild(element('b',null,Math.round(Number(data.gradePercentages?.[g])||0)+'%'));
   dist.appendChild(line);
  });
  result.appendChild(dist);
  const observations=Array.isArray(data.observations)?data.observations.slice(0,24):[];
  if(observations.length){
   result.appendChild(element('h3',null,'ממצאים'));
   const findings=element('div','analysis-findings');
   observations.forEach((obs,i)=>{
    const btn=element('button','analysis-finding');
    btn.type='button';
    btn.appendChild(element('span',null,String(obs.area||'ממצא')));
    btn.appendChild(element('strong',null,String(obs.finding||'')));
    const loc=(Array.isArray(obs.locations)?obs.locations:[]).find(l=>
     Number.isInteger(l.photoIndex)&&l.photoIndex<=state.images.length&&l.photoIndex>=1&&validBox(l.box2d));
    btn.appendChild(element('small',null,loc?'תמונה '+loc.photoIndex+' · הצג סימון':'ללא מיקום מדויק'));
    if(loc)btn.addEventListener('click',()=>{
     state.highlight=i;selectPhoto(loc.photoIndex-1);
     stage.scrollIntoView({block:'nearest',behavior:'smooth'});drawBoxes();
    });
    findings.appendChild(btn);
   });
   result.appendChild(findings);
  }
  const limits=Array.isArray(data.limitations)?data.limitations.slice(0,8):[];
  if(limits.length){
   result.appendChild(element('h3',null,'מגבלות הניתוח'));
   const list=element('ul','analysis-limitations');
   limits.forEach(l=>list.appendChild(element('li',null,String(l))));
   result.appendChild(list);
  }
  if(state.savingFailed){
   result.appendChild(element('p','analysis-warning','לא הצלחתי לשמור את הניתוח ב־Firestore. התוצאה נשארה פתוחה.'));
   const save=element('button','btn','נסה לשמור בלי לנתח שוב');
   save.type='button';save.addEventListener('click',()=>void retrySave());result.appendChild(save);
  }
  const again=element('button','btn analysis-again','↻ נתח מחדש (בקשת AI נוספת)');
  again.type='button';again.addEventListener('click',()=>void analyze(true));
  result.appendChild(again);
  result.hidden=false;
  drawBoxes();
 }
 async function retrySave(){
  if(state.mode!=='ebay'||!state.source||!state.analysis)return;
  try{
   await cloudAccess().saveConditionAnalysis(state.source,state.analysis,
    state.images.slice(0,8).map((_,i)=>i+1));
   state.savingFailed=false;showResult(true);message('הניתוח נשמר.');
  }catch(e){message('השמירה נכשלה. אפשר לנסות שוב ללא ניתוח נוסף.',true);}
 }
 async function analyze(force=false){
  if(state.busy||!state.images.length)return;
  const serial=state.serial;state.busy=true;
  run.disabled=true;run.classList.add('is-loading');run.setAttribute('aria-busy','true');
  run.textContent='✨ מנתח תמונות…';status.classList.add('is-busy');message('בודק פינות, קצוות, משטחים ופגמים…');
  try{
   const cloud=cloudAccess();
   if(state.analysis&&!force){showResult(true);message('מוצגת התוצאה הקודמת ללא חיוב נוסף.');return;}
   if(state.mode==='ebay'&&!force){
    try{
     const saved=await cloud.getConditionAnalysis(state.source);
     if(saved?.analysis&&GRADES.includes(saved.analysis.grade)){
      if(serial!==state.serial)return;
      state.analysis=saved.analysis;showResult(true);message('נמצא ניתוח שמור.');
      return;
     }
    }catch(_){message('לא ניתן לבדוק ניתוחים שמורים; מנסה לנתח תמונות חדשות.');}
   }
   const token=await cloud.getIdToken();
   if(!token)throw Error('צריך להתחבר ל־Google כדי לנתח מצב.');
   let response;
   if(state.mode==='ebay'){
    response=await fetch(ENDPOINT+'/api/analyze-condition',{method:'POST',
     headers:{'content-type':'application/json',authorization:'Bearer '+token},
     body:JSON.stringify({source:state.source})});
   }else{
    const form=new FormData();
    state.blobs.forEach((blob,i)=>form.append('photos',blob,'card-'+(i+1)+'.jpg'));
    response=await fetch(ENDPOINT+'/api/analyze-upload',{method:'POST',
     headers:{authorization:'Bearer '+token},body:form});
   }
   const data=await response.json();
   if(!response.ok)throw Error(errorText(data.error));
   if(!GRADES.includes(data.analysis?.grade))throw Error('התקבלה תוצאת ניתוח לא תקינה.');
   if(serial!==state.serial)return;
   state.analysis={...data.analysis,imageCount:data.imageCount||state.images.length};
   state.savingFailed=false;showResult();message('הניתוח הושלם.');
   if(state.mode==='ebay'){
    try{await cloud.saveConditionAnalysis(state.source,state.analysis,data.analyzedPhotoIndices||[])}
    catch(_){if(serial===state.serial){state.savingFailed=true;showResult();}}
   }
  }catch(e){if(serial===state.serial)message(String(e.message||e),true);}
  finally{
   state.busy=false;run.disabled=!state.images.length;run.classList.remove('is-loading');
   run.removeAttribute('aria-busy');run.textContent='✨ נתח מצב ב־AI';status.classList.remove('is-busy');
  }
 }
 run.addEventListener('click',()=>void analyze());
})();
