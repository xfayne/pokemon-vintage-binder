(()=>{'use strict';
// Keep decoded card art and interactive DOM mounted when data is reordered or
// refreshed. Template elements are inert, so discarded markup never paints.
function compatible(a,b){
 if(a.nodeType!==b.nodeType)return false;
 if(a.nodeType!==1)return true;
 if(a.tagName!==b.tagName)return false;
 // Distinguish optional siblings with identical tags (e.g. shipment latest
 // status versus action row) so a new sibling never replaces existing art.
 const ca=a.classList[0]||'',cb=b.classList[0]||'';
 return ca===cb;
}
function attributes(current,next){
 for(const a of Array.from(current.attributes)){
  if(!next.hasAttribute(a.name)){
   // Preserve open shipping overflow menus during background status refresh.
   if(current.tagName==='DETAILS'&&a.name==='open')continue;
   if(current.tagName==='IMG'&&a.name==='style')continue;
   current.removeAttribute(a.name);
  }
 }
 for(const a of Array.from(next.attributes)){
  if(current.getAttribute(a.name)!==a.value)current.setAttribute(a.name,a.value);
 }
}
function update(current,next){
 if(!compatible(current,next)){current.replaceWith(next);return;}
 if(current.nodeType===3){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 if(current.nodeType!==1)return;
 attributes(current,next);
 if(current.tagName==='IMG')return;
 if(current.tagName==='INPUT'){
  if(current.type==='checkbox'||current.type==='radio')current.checked=next.checked;
  else if(document.activeElement!==current)current.value=next.value;
  return;
 }
 const wanted=Array.from(next.childNodes);
 const old=Array.from(current.childNodes);
 const used=new Set(),ordered=[];
 for(let i=0;i<wanted.length;i++){
  let node=old[i];
  if(!node||used.has(node)||!compatible(node,wanted[i])){
   node=old.find(candidate=>!used.has(candidate)&&compatible(candidate,wanted[i]));
  }
  if(node){used.add(node);update(node,wanted[i]);ordered.push(node);}
  else ordered.push(wanted[i]);
 }
 for(const node of old)if(!used.has(node))node.remove();
 let anchor=null;
 for(let i=ordered.length-1;i>=0;i--){
  const node=ordered[i];
  if(node.parentNode!==current||node.nextSibling!==anchor)current.insertBefore(node,anchor);
  anchor=node;
 }
 if(current.tagName==='SELECT'&&current.value!==next.value)current.value=next.value;
}
function reconcileHTML(container,html,keyAttribute){
 const template=document.createElement('template');template.innerHTML=html;
 const incoming=Array.from(template.content.children);
 const existing=new Map();
 for(const node of container.children){
  const key=node.getAttribute(keyAttribute);
  if(key!==null)existing.set(key,node);
 }
 const desired=incoming.map(next=>{
  const key=next.getAttribute(keyAttribute);
  const old=key===null?null:existing.get(key);
  if(old&&compatible(old,next)){update(old,next);return old;}
  return next;
 });
 const keep=new Set(desired);
 for(const old of Array.from(container.children))if(!keep.has(old))old.remove();
 let anchor=null;
 for(let i=desired.length-1;i>=0;i--){
  const node=desired[i];
  if(node.parentNode!==container||node.nextElementSibling!==anchor)
   container.insertBefore(node,anchor);
  anchor=node;
 }
}
window.VintageStableDOM={reconcileHTML};
})();
