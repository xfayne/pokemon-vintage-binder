(()=>{'use strict';
window.VintageCatalogUI={create({state,MAP,SETS,$,esc,nf,cardNumber,normalNum,renderCollections}){
function catalog(){return state.cards.filter(c=>state.extras||MAP.get(c.set)?.group!=='Extra')}
function relevantSetCards(ids=state.selectedSets){const selected=Array.isArray(ids)?ids:(ids==='all'?[]:[ids]);return catalog().filter(c=>!selected.length||selected.includes(c.set));}
function selectedSet(id){return state.selectedSets.includes(id);}
function showHolo(c){return ['holo','shining','reverse'].includes(c.finish)}
function searchKey(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/gyardos|gyrados|gyardos/g,'gyarados').trim();}
function searchText(c){return searchKey(c.name+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')+' '+c.id);}
function visible(){
 const q=searchKey(state.query);
 const arr=catalog().filter(c=>
  (!state.selectedSets.length||selectedSet(c.set))&&
  (!state.holoOnly||showHolo(c))&&(!state.pokemonOnly||c.kind==='Pokémon')&&
  (state.status==='all'||state.status==='owned'&&state.owned[c.id]||state.status==='missing'&&!state.owned[c.id]||state.status==='wish'&&state.wish[c.id])&&
  (!q||searchText(c).includes(q)));
 if(state.sort==='name')arr.sort((a,b)=>a.name.localeCompare(b.name)||normalNum(a)-normalNum(b));
 if(state.sort==='holo')arr.sort((a,b)=>Number(showHolo(b))-Number(showHolo(a))||SETS.findIndex(s=>s.id===a.set)-SETS.findIndex(s=>s.id===b.set)||normalNum(a)-normalNum(b));
 return arr;
}
function groups(){return [['Base','sideBase'],['Gym','sideGym'],['Neo','sideNeo'],['Extra','sideExtra']];}
function renderSide(){
 for(const [g,id] of groups()){
  const html=SETS.filter(s=>s.group===g).map(s=>{
   const own=state.cards.filter(c=>c.set===s.id&&state.owned[c.id]).length;
   const isSelected=selectedSet(s.id);
   return `<button class="set-btn ${isSelected?'active':''}" data-set="${s.id}" aria-pressed="${isSelected}" ${g==='Extra'&&!state.extras?'title="לחיצה תציג גם אוספים נוספים"':''}><span>${esc(s.name)}</span><small>${own}/${s.count}</small><span class="mini-track"><i style="width:${(own/s.count*100).toFixed(1)}%"></i></span></button>`;
  }).join('');
  // Keep the sidebar buttons mounted: replacing them during a Wishlist tap
  // makes their selected state and their surrounding content visibly flash.
  const buttons=Array.from($(id).querySelectorAll(':scope > .set-btn'));
  const series=SETS.filter(s=>s.group===g);
  if(buttons.length!==series.length||buttons.some((button,i)=>button.dataset.set!==series[i].id)){
   $(id).innerHTML=html;
  }else{
   series.forEach((set,i)=>{
    const button=buttons[i],own=state.cards.filter(c=>c.set===set.id&&state.owned[c.id]).length;
    const active=selectedSet(set.id);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
    button.querySelector('small').textContent=own+'/'+set.count;
    button.querySelector('.mini-track i').style.width=(own/set.count*100).toFixed(1)+'%';
    if(g==='Extra'&&!state.extras)button.title='לחיצה תציג גם אוספים נוספים';
    else button.removeAttribute('title');
   });
  }
 }
 const allSelected=!state.selectedSets.length;
 $('side').querySelector('[data-set="all"]').classList.toggle('active',allSelected);
 $('side').querySelector('[data-set="all"]').setAttribute('aria-pressed',String(allSelected));
 $('allMini').textContent=nf(catalog().filter(c=>state.owned[c.id]).length)+'/'+nf(catalog().length);
}
function renderStats(){/* Collection totals are shown only in the relevant tabs. */}
function rarityHtml(c){const t=c.finish==='holo'?'✨ Holo':c.finish==='shining'?'🌟 Shining':c.finish==='reverse'?'✨ Reverse Holo':c.finish==='unknown'?'? Promo (משתנה)':c.rarity==='Rare'?'◆ Rare':c.rarity==='Uncommon'?'◇ Uncommon':c.rarity==='Common'?'● Common':c.rarity==='Rare Secret'?'◆ Secret Rare':c.rarity||'רגיל';const cls=c.finish==='holo'||c.finish==='reverse'?'holo':c.finish==='shining'?'shining':c.finish==='unknown'?'unknown':'';return `<span class="rarity-tag ${cls}">${esc(t)}</span>`;}
function cardHTML(c){const set=MAP.get(c.set);const isOwned=!!state.owned[c.id];return `<article class="poke-card ${isOwned?'owned':''}" role="listitem" data-id="${esc(c.id)}">
 <div class="card-img-wrap" data-preview="${esc(c.id)}" title="תמונה ופרטים"><img class="card-img" loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="img-placeholder" hidden>✦</span></div>
 <div class="card-data"><div class="card-name" title="${esc(c.name)}">${esc(c.name)}</div><div class="card-sub">${esc(set.name)} · #${esc(cardNumber(c))}</div><div class="badges">${rarityHtml(c)}</div><div class="card-actions">${!isOwned?`<button class="wish-btn ${state.wish[c.id]?'on':''}" data-wish="${esc(c.id)}" aria-label="Wishlist" title="Wishlist">${state.wish[c.id]?'★':'☆'}</button>`:''}<button class="small-link" data-preview="${esc(c.id)}">פרטים</button><a class="small-link" href="${esc(c.image)}" target="_blank" rel="noopener">תמונה ↗</a>${state.conditions[c.id]?`<span class="info-pill">${esc(state.conditions[c.id])}</span>`:''}</div></div>
 <button class="own-btn ${isOwned?'on':''}" data-own="${esc(c.id)}" aria-label="${isOwned?'הסר מהאוסף':'יש לי קלף זה'}" title="${isOwned?'יש לי ✓':'סמן שיש לי'}">${isOwned?'✓':'+'}</button></article>`;}
// Update metadata without destroying a mounted image (including filtered views).
function patchCardNode(node,c){
 const id=c.id,owned=!!state.owned[id],wished=!!state.wish[id];
 node.classList.toggle('owned',owned);
 const ownButton=node.querySelector('[data-own]');
 if(ownButton){
  ownButton.classList.toggle('on',owned);
  ownButton.textContent=owned?'✓':'+';
  ownButton.setAttribute('aria-label',owned?'הסר מהאוסף':'יש לי קלף זה');
  ownButton.title=owned?'יש לי ✓':'סמן שיש לי';
 }
 const actions=node.querySelector('.card-actions');
 let wishButton=node.querySelector('[data-wish]');
 if(owned){wishButton?.remove();}
 else{
  if(!wishButton){
   wishButton=document.createElement('button');
   wishButton.className='wish-btn';wishButton.dataset.wish=id;
   wishButton.setAttribute('aria-label','Wishlist');wishButton.title='Wishlist';
   actions?.prepend(wishButton);
  }
  wishButton.classList.toggle('on',wished);
  wishButton.textContent=wished?'★':'☆';
 }
 let condition=actions?.querySelector('.info-pill');
 if(state.conditions[id]){
  if(!condition){condition=document.createElement('span');condition.className='info-pill';actions?.append(condition);}
  condition.textContent=state.conditions[id];
 }else condition?.remove();
}
function renderCards(){
 const arr=visible(),slice=arr.slice(0,state.limit),container=$('cards');
 if(!slice.length){
  container.innerHTML=`<div class="empty" style="grid-column:1/-1"><strong>${state.ready?'לא נמצאו קלפים מתאימים':'רשימת הקלפים נטענת...'}</strong>${state.ready?'נסה לשנות את הסינון או החיפוש.':'מעט סבלנות, הרשימה כוללת יותר מאלף קלפים.'}</div>`;
 }else{
  // Reuse keyed cards and their <img> nodes across filtering and sorting.
  // Moving existing DOM nodes also preserves decoded art and scroll context.
  const existing=new Map(Array.from(container.querySelectorAll(':scope > .poke-card')).map(node=>[node.dataset.id,node]));
  const nodes=slice.map(c=>{
   let node=existing.get(c.id);
   if(node){patchCardNode(node,c);return node;}
   const template=document.createElement('template');template.innerHTML=cardHTML(c).trim();
   return template.content.firstElementChild;
  });
  nodes.forEach((node,i)=>{if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);});
  while(container.children.length>nodes.length)container.lastElementChild.remove();
 }
 $('resultsCount').textContent=state.ready?`מציג ${nf(slice.length)} מתוך ${nf(arr.length)} קלפים`:'ממתין לנתונים';
 $('loadMore').hidden=arr.length<=state.limit;
}
function refreshCard(id){
 const c=state.cards.find(card=>card.id===id);
 if(!c)return;
 renderSide();
 const relevant=relevantSetCards();
 $('sectionSub').textContent=state.ready?`${nf(relevant.filter(card=>state.owned[card.id]).length)} מתוך ${nf(relevant.length)} קלפים ברשותך`:'רשימות קלפים מקוריות באנגלית';
 if(state.status!=='all'){renderCards();return;}
 const node=Array.from($('cards').querySelectorAll('.poke-card')).find(card=>card.dataset.id===id);
 if(!node)return;
 patchCardNode(node,c);
 node.classList.remove('card-updated');
 void node.offsetWidth;
 node.classList.add('card-updated');
}
function renderFilterSummary(){
 const selected=[];
 if(state.pokemonOnly)selected.push('פוקימון בלבד');
 if(state.holoOnly)selected.push('Holo / Shining');
 if(state.status!=='all')selected.push(({owned:'יש לי',missing:'חסר לי',wish:'Wishlist'})[state.status]||state.status);
 if(state.extras)selected.push('אוספים נוספים');
 if(state.sort!=='num')selected.push(state.sort==='name'?'מיון לפי שם':'Holo קודם');
 $('catalogFilterSummary').textContent=selected.join(' · ')||'ללא סינון נוסף';
}
function renderAll(skipHidden=false){
 renderSide();renderStats();renderCards();renderCollections(skipHidden?{skipHidden:true}:undefined);renderFilterSummary();
 const selected=state.selectedSets;
 $('sectionTitle').textContent=!selected.length?'כל הסדרות':selected.length===1?(MAP.get(selected[0])?.name||'כל הסדרות'):`${nf(selected.length)} סדרות נבחרו`;
 const arr=relevantSetCards();
 const owned=arr.filter(c=>state.owned[c.id]).length;
 $('sectionSub').textContent=state.ready?`${nf(owned)} מתוך ${nf(arr.length)} קלפים ברשותך`:'רשימות קלפים מקוריות באנגלית';
}

return {catalog,relevantSetCards,showHolo,searchKey,searchText,visible,groups,renderSide,renderStats,rarityHtml,cardHTML,renderCards,renderAll,refreshCard};
}};
})();
