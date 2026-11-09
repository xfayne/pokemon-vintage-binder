(()=>{'use strict';
window.VintageCollectionDrag={attach({reorder,toast}){
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
}};
})();
