
/* The public viewer only uses the static catalog and the sanitized shared binder document. */
(()=>{'use strict';
 const shell=document.getElementById('readerShell'),spread=document.getElementById('readerSpread'),foot=document.getElementById('readerFooter'),prevBtn=document.getElementById('readerPrev'),nextBtn=document.getElementById('readerNext');
 let items=[],page=0,swipeStart=null,animTimer=null,loadTimer=null;
 const fromLink=new URLSearchParams(location.search).get('share');
 const landscape=()=>matchMedia('(orientation:landscape) and (min-width:570px)').matches;
 const total=()=>Math.max(1,Math.ceil(items.length/9));
 const maxStart=()=>total()-1;
 const startPageFor=p=>!landscape()||p===0?Math.min(p,maxStart()):1+2*Math.floor((p-1)/2);
 const visiblePages=()=>landscape()&&page>0&&page+1<total()?[page,page+1]:[page];
 if(fromLink){
  document.body.classList.add('reader-open');
  spread.innerHTML='<div class="reader-loading">טוען את הבינדר המשותף…</div>';
  loadTimer=setTimeout(()=>error('טעינת הבינדר נמשכת יותר מדי זמן. בדוק את החיבור לאינטרנט ונסה לרענן את הדף.'),20000);
 }
 function makePage(idx){
  const book=document.createElement('div');book.className='reader-book';book.setAttribute('aria-label','עמוד '+(idx+1));
  const grid=document.createElement('div');grid.className='reader-grid';grid.setAttribute('role','list');
  for(let i=0;i<9;i++){
   const slot=items[idx*9+i],p=document.createElement('div');p.className='reader-pocket'+(slot?.kind==='wish'?' wish':'')+(slot?.muted?' wish-muted':'');p.setAttribute('role','listitem');
   if(slot?.id){const c=window.VintageBinder?.getCardInfo?.(slot.id);if(c){const img=document.createElement('img');img.src=c.image;img.alt=c.name+' · '+c.setName;img.loading='eager';img.decoding='async';img.draggable=false;p.append(img);p.title=c.name+' · '+c.setName;}}
   grid.append(p);
  }
  book.append(grid);return book;
 }
 function render(direction=''){
  page=startPageFor(Math.max(0,Math.min(maxStart(),page)));
  spread.replaceChildren(...visiblePages().map(makePage));
  if(animTimer){clearTimeout(animTimer);animTimer=null;}
  spread.className='reader-spread';
  if(direction){void spread.offsetWidth;spread.classList.add('turn-'+direction);animTimer=setTimeout(()=>{spread.className='reader-spread';},300);}
  const display=visiblePages().map(i=>i+1);foot.textContent='עמוד '+(display.join('–'))+' / '+total();
  prevBtn.disabled=page===0;nextBtn.disabled=page+(landscape()&&page>0?2:1)>=total();
 }
 function show(entries){
  if(loadTimer){clearTimeout(loadTimer);loadTimer=null;}
  items=Array.isArray(entries)?entries.map(c=>c&&typeof c.id==='string'?{id:c.id,kind:c.kind==='wish'?'wish':'owned',muted:!!c.muted}:null):[];
  page=0;document.body.classList.add('reader-open');render();
 }
 function next(){const jump=landscape()&&page>0?2:1;if(page+jump<total()){page+=jump;render('next');}}
 function previous(){if(page>0){page=landscape()?(page<=1?0:page-2):page-1;render('previous');}}
 function error(message){if(loadTimer){clearTimeout(loadTimer);loadTimer=null;}document.body.classList.add('reader-open');spread.replaceChildren();const el=document.createElement('div');el.className='reader-error';el.textContent=message;spread.append(el);foot.textContent='';prevBtn.disabled=true;nextBtn.disabled=true;}
 prevBtn.addEventListener('click',previous);nextBtn.addEventListener('click',next);
 window.addEventListener('keydown',e=>{if(!document.body.classList.contains('reader-open'))return;if(e.key==='ArrowLeft'){e.preventDefault();next();}else if(e.key==='ArrowRight'){e.preventDefault();previous();}});
 shell.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;const t=e.touches[0];swipeStart={x:t.clientX,y:t.clientY};},{passive:true});
 shell.addEventListener('touchend',e=>{if(!swipeStart||e.changedTouches.length!==1)return;const t=e.changedTouches[0],dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>=42&&Math.abs(dx)>Math.abs(dy)*1.2){if(dx<0)next();else previous();}},{passive:true});
 let pointerStart=null;
 shell.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')pointerStart={x:e.clientX,y:e.clientY};});
 shell.addEventListener('pointerup',e=>{if(!pointerStart||e.pointerType!=='mouse')return;const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;pointerStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))dx<0?next():previous();});
 window.addEventListener('resize',()=>{if(document.body.classList.contains('reader-open')&&items.length)render();});
 window.VintageReader={show,error,isPublic:()=>!!fromLink};
})();
