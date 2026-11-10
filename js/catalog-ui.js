(()=>{'use strict';
window.VintageCatalogUI={create({state,MAP,SETS,$,esc,nf,cardNumber,normalNum,renderCollections}){
function catalog(){return state.cards.filter(c=>state.extras||MAP.get(c.set)?.group!=='Extra')}
function relevantSetCards(id){return catalog().filter(c=>id==='all'||c.set===id)}
function showHolo(c){return ['holo','shining','reverse'].includes(c.finish)}
function searchKey(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/gyardos|gyrados|gyardos/g,'gyarados').trim();}
function searchText(c){return searchKey(c.name+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')+' '+c.id);}
function visible(){const q=searchKey(state.query);let arr=(q?state.cards:catalog()).filter(c=>
 (q||state.active==='all'||c.set===state.active)&&(!state.holoOnly||showHolo(c))&&(!state.pokemonOnly||c.kind==='Pokémon')&&
 (state.status==='all'||state.status==='owned'&&state.owned[c.id]||state.status==='missing'&&!state.owned[c.id]||state.status==='wish'&&state.wish[c.id])&&
 (!q||searchText(c).includes(q)));
 if(state.sort==='name')arr.sort((a,b)=>a.name.localeCompare(b.name)||normalNum(a)-normalNum(b));
 if(state.sort==='holo')arr.sort((a,b)=>Number(showHolo(b))-Number(showHolo(a))||SETS.findIndex(s=>s.id===a.set)-SETS.findIndex(s=>s.id===b.set)||normalNum(a)-normalNum(b));return arr;}
function groups(){return [['Base','sideBase'],['Gym','sideGym'],['Neo','sideNeo'],['Extra','sideExtra']];}
function renderSide(){for(const [g,id]of groups()){$(id).innerHTML=SETS.filter(s=>s.group===g).map(s=>{const own=state.cards.filter(c=>c.set===s.id&&state.owned[c.id]).length;const loaded=state.cards.some(c=>c.set===s.id);return `<button class="set-btn ${state.active===s.id?'active':''}" data-set="${s.id}" ${g==='Extra'&&!state.extras?'title="לחיצה תציג גם אוספים נוספים"':''}><span>${esc(s.name)}</span><small>${own}/${s.count}</small><span class="mini-track"><i style="width:${(own/s.count*100).toFixed(1)}%"></i></span></button>`}).join('')}
 $('side').querySelector('[data-set="all"]').classList.toggle('active',state.active==='all');$('allMini').textContent=nf(catalog().filter(c=>state.owned[c.id]).length)+'/'+nf(catalog().length);}
function renderStats(){/* Collection totals are shown only in the relevant tabs. */}
function rarityHtml(c){const t=c.finish==='holo'?'✨ Holo':c.finish==='shining'?'🌟 Shining':c.finish==='reverse'?'✨ Reverse Holo':c.finish==='unknown'?'? Promo (משתנה)':c.rarity==='Rare'?'◆ Rare':c.rarity==='Uncommon'?'◇ Uncommon':c.rarity==='Common'?'● Common':c.rarity==='Rare Secret'?'◆ Secret Rare':c.rarity||'רגיל';const cls=c.finish==='holo'||c.finish==='reverse'?'holo':c.finish==='shining'?'shining':c.finish==='unknown'?'unknown':'';return `<span class="rarity-tag ${cls}">${esc(t)}</span>`;}
function cardHTML(c){const set=MAP.get(c.set);const isOwned=!!state.owned[c.id];return `<article class="poke-card ${isOwned?'owned':''}" role="listitem" data-id="${esc(c.id)}">
 <div class="card-img-wrap" data-preview="${esc(c.id)}" title="תמונה ופרטים"><img class="card-img" loading="lazy" decoding="async" src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="img-placeholder" hidden>✦</span></div>
 <div class="card-data"><div class="card-name" title="${esc(c.name)}">${esc(c.name)}</div><div class="card-sub">${esc(set.name)} · #${esc(cardNumber(c))}</div><div class="badges">${rarityHtml(c)}</div><div class="card-actions">${!isOwned?`<button class="wish-btn ${state.wish[c.id]?'on':''}" data-wish="${esc(c.id)}" aria-label="Wishlist" title="Wishlist">${state.wish[c.id]?'★':'☆'}</button>`:''}<button class="small-link" data-preview="${esc(c.id)}">פרטים</button><a class="small-link" href="${esc(c.image)}" target="_blank" rel="noopener">תמונה ↗</a>${state.conditions[c.id]?`<span class="info-pill">${esc(state.conditions[c.id])}</span>`:''}</div></div>
 <button class="own-btn ${isOwned?'on':''}" data-own="${esc(c.id)}" aria-label="${isOwned?'הסר מהאוסף':'יש לי קלף זה'}" title="${isOwned?'יש לי ✓':'סמן שיש לי'}">${isOwned?'✓':'+'}</button></article>`;}
function renderCards(){const arr=visible();const slice=arr.slice(0,state.limit);$('cards').innerHTML=slice.length?slice.map(cardHTML).join(''):`<div class="empty" style="grid-column:1/-1"><strong>${state.ready?'לא נמצאו קלפים מתאימים':'רשימת הקלפים נטענת...'}</strong>${state.ready?'נסה לשנות את הסינון או החיפוש.':'מעט סבלנות, הרשימה כוללת יותר מאלף קלפים.'}</div>`;
 $('resultsCount').textContent=state.ready?`מציג ${nf(slice.length)} מתוך ${nf(arr.length)} קלפים`:'ממתין לנתונים';$('loadMore').hidden=arr.length<=state.limit;}
function renderAll(){renderSide();renderStats();renderCards();renderCollections();$('sectionTitle').textContent=state.active==='all'?'כל הסדרות':MAP.get(state.active)?.name||'כל הסדרות';let arr=relevantSetCards(state.active);const owned=arr.filter(c=>state.owned[c.id]).length;$('sectionSub').textContent=state.ready?`${nf(owned)} מתוך ${nf(arr.length)} קלפים ברשותך`:'רשימות קלפים מקוריות באנגלית';}

return {catalog,relevantSetCards,showHolo,searchKey,searchText,visible,groups,renderSide,renderStats,rarityHtml,cardHTML,renderCards,renderAll};
}};
})();
