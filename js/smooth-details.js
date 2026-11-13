(()=>{'use strict';
// Animate the actual measured height of native <details>, not just its content.
// The <summary> remains a real keyboard-accessible disclosure control.
const selector='details.catalog-advanced,details.binder-place';
const active=new WeakMap();
function setOpen(details,targetOpen){
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(reduced||typeof details.animate!=='function'){
  active.get(details)?.animation.cancel();active.delete(details);
  details.classList.remove('is-closing');details.style.height='';details.style.overflow='';
  details.open=targetOpen;return;
 }
 const previous=active.get(details);
 if(!previous&&details.open===targetOpen)return;
 const from=details.getBoundingClientRect().height;
 if(previous){active.delete(details);previous.animation.cancel();details.style.height='';}
 details.style.overflow='hidden';
 // Measure both states without a paint between them (including native details
 // content visibility and any expanded padding). Keep content present during exit.
 details.open=true;
 const expanded=details.getBoundingClientRect().height;
 details.open=false;
 const collapsed=details.getBoundingClientRect().height;
 details.open=true;
 const to=targetOpen?expanded:collapsed;
 details.classList.toggle('is-closing',!targetOpen);
 if(Math.abs(to-from)<1){
  details.open=targetOpen;details.style.overflow='';details.classList.remove('is-closing');return;
 }
 details.style.height=from+'px';
 const animation=details.animate([{height:from+'px'},{height:to+'px'}],
  {duration:260,easing:'cubic-bezier(.22,1,.36,1)'});
 const current={animation,targetOpen};active.set(details,current);
 animation.onfinish=()=>{
  if(active.get(details)!==current)return;
  details.open=targetOpen;details.style.height='';details.style.overflow='';
  details.classList.remove('is-closing');active.delete(details);
 };
}
document.addEventListener('click',event=>{
 const summary=event.target.closest('summary');
 const details=summary?.parentElement;
 if(!details?.matches(selector)||event.defaultPrevented||event.button!==0)return;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 event.preventDefault();
 setOpen(details,!(active.get(details)?.targetOpen??details.open));
},true);
window.VintageSmoothDetails={setOpen};
})();
