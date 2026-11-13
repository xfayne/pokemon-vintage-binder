
(()=>{'use strict';
const ROOT='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/';
const {SETS,OFFLINE_PACKS}=window.VintageCatalogData;
const MAP=new Map(SETS.map(s=>[s.id,s]));const BASE_COUNT=SETS.filter(s=>s.group!=='Extra').reduce((n,s)=>n+s.count,0);
const $=id=>document.getElementById(id);
const {state,getProgress,adoptProgress,ensureCloudEdit,save,normalizeShipment}=window.VintageCollectionState.create({$: $,normalizeOrders:()=>normalizeOrders(),renderAll:()=>renderAll(),renderCollections:()=>renderCollections(),toast:msg=>toast(msg)});
window.VintageBinder={getProgress,adoptProgress,getCardInfo:(id)=>{const c=state.cards.find(x=>x.id===id);return c?{id:c.id,name:c.name,image:c.image,setName:MAP.get(c.set)?.name||""}:null}};
let cardDealsOrigin=null;
window.VintageDealBridge={
 getCardForDeals:(id)=>{
  const c=state.cards.find(card=>card.id===id);
  return c?{id:c.id,rank:1,name:c.name,number:cardNumber(c),setName:MAP.get(c.set)?.name||'',image:c.image,condition:state.conditions[id]||'',firstEdition:!!state.firstEdition[id],finish:c.finish||null}:null;
 },
 returnToCardDetails:(id)=>{
  if(!cardDealsOrigin)return;
  const origin=cardDealsOrigin;
  cardDealsOrigin=null;
  showView(origin.view,false);
  window.scrollTo({top:origin.scrollY,behavior:'instant'});
  showModal(id);
 },
 getWishlistCards:()=>{
  normalizeOrders();
  const lookup=new Map(state.cards.map(c=>[c.id,c]));
  return state.wishOrder.filter(id=>state.wish[id]&&!state.owned[id]).map((id,index)=>{
   const c=lookup.get(id);
   return c?{id,rank:index+1,name:c.name,number:cardNumber(c),setName:MAP.get(c.set)?.name||'',image:c.image,condition:state.conditions[id]||'',firstEdition:!!state.firstEdition[id],finish:c.finish||null}:null;
  }).filter(Boolean);
 },
 getMarketPrice:(id,grade)=>{
  const c=state.cards.find(c=>c.id===id);
  return c&&['NM','LP','MP','HP','DMG'].includes(grade)?window.VintageMarketPrices?.getOwnedPrice?.(c,MAP.get(c.set)?.name||'',grade,!!state.firstEdition[id]):null;
 }
};
const text=String;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>new Intl.NumberFormat('he-IL').format(n);
function simplify(raw,set){const n=String(raw.number||'');const kind=raw.supertype||'';let rarity=raw.rarity||'';let finish='normal';if(/Shining/i.test(rarity)||/^Shining\s/i.test(raw.name||'')){finish='shining';}else if(/Holo/i.test(rarity)){finish='holo';}
 if(set.id==='base5'&&n==='83')finish='holo'; // Dark Raichu, secret holographic rare
 if(set.id==='si1'&&['1','4','7','11','14','17'].includes(n))finish='reverse';
 if(set.id==='basep')finish='unknown'; // print/foil variations not carried by generic rarity=Promo
 const cardid=set.id+'-'+n;
 return {id:cardid,set:set.id,name:raw.name||'',number:n,total:set.id==='basep'?null:set.id==='base5'?82:set.id==='neo3'?64:set.id==='neo4'?105:set.count,rarity:rarity||'—',finish,kind,image:raw.images?.small||`https://images.pokemontcg.io/${set.id}/${n}.png`,large:raw.images?.large||`https://images.pokemontcg.io/${set.id}/${n}_hires.png`};}
function cardNumber(c){return c.number+(c.total?'/'+c.total:'')}
function normalNum(x){const n=parseInt(x.number,10);return Number.isFinite(n)?n:9999;}
const {loadEmbeddedData}=window.VintageCatalogLoader.create({SETS,OFFLINE_PACKS,state,$,renderAll:()=>renderAll()});
const {catalog,relevantSetCards,showHolo,searchKey,searchText,visible,groups,renderSide,renderStats,rarityHtml,cardHTML,renderCards,renderAll,refreshCard}=window.VintageCatalogUI.create({state,MAP,SETS,$,esc,nf,cardNumber,normalNum,renderCollections:()=>renderCollections()});
function toast(msg){const e=$('toast');e.textContent=msg;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2800)}
const {toggleOwned,removeWish,toggleWish,updatePurchasePrice}=window.VintageCardActions.create({state,$,ensureCloudEdit,normalizeOrders:()=>normalizeOrders(),save,refreshCard,toast,showModal:id=>showModal(id)});
const {showModal}=window.VintageCardDetails.create({state,MAP,$,esc,cardNumber,rarityHtml,dealAuctionUrl,openDealsForCard,toggleOwned,toggleWish,ensureCloudEdit,openMovePicker,save,renderCards,updatePurchasePrice});
const {backup,copyWishlist,exportCSV,importBackup}=window.VintageCollectionBackup.create({state,MAP,cardNumber,toast,getProgress,normalizeOrders:()=>normalizeOrders(),sortedOwnedCards:()=>sortedOwnedCards(),ensureCloudEdit,save,renderAll,normalizeShipment});
const orderingController=window.VintageCollectionOrdering.create({state,ensureCloudEdit,save});
const {normalizeOrders,binderVisible,binderPageCount,reorder,markEmptyPocket,clearEmptyPocket,movePage}=orderingController;
let binderSelectedId=null;

function refreshPlacementTargets(){
 const pageEl=$('binderTargetPage'),slotEl=$('binderTargetSlot');
 const pageCurrent=Number(pageEl.value)||1, slotCurrent=Number(slotEl.value)||1;
 const pages=binderPageCount();
 pageEl.innerHTML=Array.from({length:pages},(_,i)=>`<option value="${i+1}">עמוד ${i+1}</option>`).join('');
 slotEl.innerHTML=Array.from({length:9},(_,i)=>`<option value="${i+1}">כיס ${i+1}</option>`).join('');
 pageEl.value=String(Math.max(1,Math.min(pages,pageCurrent)));slotEl.value=String(Math.max(1,Math.min(9,slotCurrent)));
}
function searchBinder(){
 const box=$('binderMatches');const query=$('binderFind').value.trim().toLowerCase();
 if(!query){box.innerHTML='';return;}
 const matching=state.binderOrder.map(id=>state.cards.find(c=>c.id===id)).filter(Boolean).filter(c=>
  (c.name+' '+c.id+' '+cardNumber(c)+' '+(MAP.get(c.set)?.name||'')).toLowerCase().includes(query));
 const markup=matching.length?matching.slice(0,12).map(c=>`<button type="button" class="binder-match ${c.id===binderSelectedId?'selected':''}" data-pick-binder="${esc(c.id)}" role="option" aria-selected="${c.id===binderSelectedId}"><img src="${esc(c.image)}" alt="" loading="lazy"><span class="binder-match-label"><b>${esc(c.name)}</b><small>${esc(MAP.get(c.set)?.name||'')} · #${esc(cardNumber(c))}${state.owned[c.id]?' · ✓ שלי':' · ☆ משאלה'}</small></span><span aria-hidden="true">בחר ←</span></button>`).join(''):`<span class="binder-place-hint">לא נמצא קלף באוסף או במשאלות. הוסף אותו קודם בקטלוג.</span>`;
 window.VintageStableDOM.reconcileHTML(box,markup,'data-pick-binder');
}
function selectBinder(id){const c=state.cards.find(x=>x.id===id);if(!c||!state.binderOrder.includes(id))return;
 binderSelectedId=id;$('binderSelected').textContent='נבחר: '+c.name+' · '+(MAP.get(c.set)?.name||'');$('binderPlaceSelected').disabled=false;
 for(const option of $('binderMatches').querySelectorAll('[data-pick-binder]')){
  const active=option.dataset.pickBinder===id;
  option.classList.toggle('selected',active);
  option.setAttribute('aria-selected',String(active));
 }
}
function placeBinder(id,page,slot){
 if(!ensureCloudEdit())return;
 normalizeOrders();if(!state.binderOrder.includes(id))return;
 const list=binderVisible();const from=list.indexOf(id);if(from<0)return;
 const requested=Math.max(0,(page-1)*9+slot-1);const dest=Math.min(requested,list.length-1);
 reorder('binder',from,dest);
 state.binderPage=Math.floor(dest/9);renderCollections();
 toast('הקלף הועבר לעמוד '+(state.binderPage+1)+', כיס '+((dest%9)+1));
}

function openPageMoveDialog(){
 if(!ensureCloudEdit())return;
 const count=binderPageCount();if(count<2)return;
 $('binderMovePageCurrent').textContent='עמוד '+(state.binderPage+1)+' מתוך '+count;
 for(const name of ['binderMovePageSource','binderMovePagePosition']){
  const input=$(name);input.min='1';input.max=String(count);input.value=String(state.binderPage+1);
 }
 $('binderMovePageDialog').showModal();
}
function applyPageMove(){
 const source=$('binderMovePageSource'),input=$('binderMovePagePosition');
 const from=Number(source.value),target=Number(input.value),count=binderPageCount();
 for(const [el,value] of [[source,from],[input,target]]){
  if(!el.value||!Number.isInteger(value)||value<1||value>count){
   el.reportValidity();el.focus();return;
  }
 }
 const changed=movePage(from,target);
 $('binderMovePageDialog').close();
 if(changed)toast('עמוד '+from+' הועבר למקום '+target+' בבינדר');
}
function updatePocketDialog(){
 const index=state.binderPage*9+Number($('binderPocketPosition').value)-1;
 const slot=binderVisible()[index],reserved=window.VintageCollectionOrdering.isEmptyPocket(slot);
 const card=state.cards.find(c=>c.id===slot),position=Number($('binderPocketPosition').value);
 $('binderPocketStatus').textContent=reserved
  ?'כיס '+position+' שמור כריק. אפשר לבטל את הרווח.'
  :card
  ?'בכיס '+position+' נמצא '+card.name+'. פינוי הכיס יזיז אותו ואת הקלפים שאחריו.'
  :'כיס '+position+' פנוי כרגע. שמירתו כריק תשמור עליו גם כשיתווספו קלפים.';
 $('binderPocketMark').disabled=reserved;
 $('binderPocketClear').disabled=!reserved;
}
function openPocketDialog(){
 if(!ensureCloudEdit())return;
 $('binderPocketPage').textContent='עמוד '+(state.binderPage+1);
 $('binderPocketPosition').value='1';
 updatePocketDialog();
 $('binderPocketDialog').showModal();
}
function applyPocketChange(clear){
 const index=state.binderPage*9+Number($('binderPocketPosition').value)-1;
 const changed=clear?clearEmptyPocket(index):markEmptyPocket(index);
 if(!changed)return;
 $('binderPocketDialog').close();
 toast(clear?'הרווח בוטל והקלפים התקרבו':'הכיס נשמר כריק והקלפים הבאים זזו');
}
const {renderShipments,refreshShipments}=window.VintageShipments.create({state,MAP,cardNumber,esc,$,ensureCloudEdit,save,toast});
function showView(view,doScroll=true,dealsCardId=null){if(!['catalog','owned','binder','wishlist','shipments','deals','analysis'].includes(view))return;
 const previousView=state.view;state.view=view;
 $('catalogShell').hidden=view!=='catalog';$('ownedPage').hidden=view!=='owned';$('binderPage').hidden=view!=='binder';$('wishPage').hidden=view!=='wishlist';$('dealsPage').hidden=view!=='deals';$('shipmentsPage').hidden=view!=='shipments';$('analysisPage').hidden=view!=='analysis';
 document.querySelectorAll('[data-view-btn]').forEach(b=>{const a=b.dataset.viewBtn===view;b.classList.toggle('active',a);b.setAttribute('aria-pressed',String(a));});
 if(previousView!==view){
  document.querySelectorAll('.view-enter').forEach(page=>page.classList.remove('view-enter'));
  const nextPage=view==='catalog'?$('catalogShell'):$({owned:'ownedPage',binder:'binderPage',wishlist:'wishPage',shipments:'shipmentsPage',deals:'dealsPage',analysis:'analysisPage'}[view]);
  nextPage?.classList.add('view-enter');
 }
 if(view!=='catalog')renderCollections();if(view==='deals'){if(dealsCardId)window.VintageEbayLive?.openCard?.(dealsCardId);else window.VintageEbayLive?.open?.();}if(view==='shipments')refreshShipments();if(doScroll&&previousView!==view)window.scrollTo({top:0,behavior:'instant'});
}
function openDealsForCard(id){
 if(!state.cards.some(card=>card.id===id))return;
 cardDealsOrigin={view:state.view,scrollY:window.scrollY};
 showView('deals',true,id);
}
const {sortedOwnedCards,refreshOwned,renderOwnedList}=window.VintageOwnedCards.create({state,MAP,$,SETS,showHolo,normalNum,searchKey,searchText,rarityHtml,esc,cardNumber,renderCollections:()=>renderCollections()});
function dealAuctionUrl(c,precise){
 const setName=MAP.get(c.set)?.name||'';
 const edition=state.firstEdition[c.id]?'1st edition':'';
 const query=[c.name,setName,precise?cardNumber(c):'',edition,'pokemon'].filter(Boolean).join(' ');
 return 'https://www.ebay.com/sch/i.html?'+new URLSearchParams({_nkw:query,LH_Auction:'1'});
}
function renderDeals(){ window.VintageDealsDashboard?.render?.(); window.VintageEbayLive?.refreshCards?.(); }
const {renderCollections}=window.VintageCollectionViews.create({state,MAP,$,esc,cardNumber,normalizeOrders,renderShipments,binderPageCount,refreshPlacementTargets,binderVisible,renderOwnedList,renderDeals});

function removeFromBinder(id){
 if(!ensureCloudEdit())return;
 if(!state.binderOrder.includes(id))return;
 state.binderExcluded[id]=true;state.binderOrder=state.binderOrder.filter(x=>x!==id);
 if(binderSelectedId===id){binderSelectedId=null;$('binderSelected').textContent='';$('binderPlaceSelected').disabled=true;}
 normalizeOrders();save();toast('הקלף הוסר רק מהבינדר. הוא עדיין נשאר באוסף / במשאלות.');
}
function addToBinder(id){
 if(!ensureCloudEdit())return;
 if(!state.owned[id]&&!state.wish[id])return;
 delete state.binderExcluded[id];
 normalizeOrders();save();toast('הקלף נוסף לבינדר');
}
function openMovePicker(id){
 if(!ensureCloudEdit())return;
 if(!state.owned[id]&&!state.wish[id])return;
 if(!state.binderOrder.includes(id))addToBinder(id);
 showView('binder',false);
 selectBinder(id);
 const c=state.cards.find(x=>x.id===id);
 $('binderFind').value=c?.name||'';searchBinder();
 refreshPlacementTargets();
 $('binderTargetPage').value='1';$('binderTargetSlot').value='1';
 const panel=document.querySelector('.binder-place');
 if(window.VintageSmoothDetails)window.VintageSmoothDetails.setOpen(panel,true);
 else panel.open=true;
 panel.classList.add('binder-place-attention');
 setTimeout(()=>panel.classList.remove('binder-place-attention'),1800);
 panel.scrollIntoView({behavior:'smooth',block:'start'});
 toast('בחר עמוד וכיס ואז לחץ ״העבר למיקום שבחרתי״');
}
let wishMoveSelectedId=null;
function openWishMove(id){
 if(!ensureCloudEdit())return;
 normalizeOrders();
 const current=state.wishOrder.indexOf(id);
 if(current<0)return;
 const card=state.cards.find(c=>c.id===id);
 wishMoveSelectedId=id;
 $('wishMoveCurrent').textContent=(card?.name||'קלף')+' · מקום '+(current+1)+' מתוך '+state.wishOrder.length;
 const input=$('wishMovePosition');
 input.min='1';input.max=String(state.wishOrder.length);input.value=String(current+1);
 $('wishMoveTop').disabled=current===0;
 $('wishMoveDialog').showModal();
}
function applyWishMove(target){
 const id=wishMoveSelectedId;
 if(!id)return;
 const current=state.wishOrder.indexOf(id);
 if(current<0)return;
 const total=state.wishOrder.length;
 const position=Number(target);
 if(!Number.isInteger(position)||position<1||position>total){
  $('wishMovePosition').focus();
  $('wishMovePosition').reportValidity();
  return;
 }
 if(current!==position-1)reorder('wishlist',current,position-1);
 $('wishMoveDialog').close();
 wishMoveSelectedId=null;
 if(current!==position-1)toast('הקלף הועבר למקום '+position+' ברשימת המשאלות');
}
function attachCollections(){
 document.addEventListener('click',e=>{
  const view=e.target.closest('[data-view-btn]');if(view){showView(view.dataset.viewBtn);return;}
  const openCard=e.target.closest('[data-open-owned],[data-open-wish]');
  if(openCard&&!e.target.closest('button,a,input,select')){
   showModal(openCard.dataset.openOwned||openCard.dataset.openWish);
   return;
  }
  const pick=e.target.closest('[data-pick-binder]');if(pick){selectBinder(pick.dataset.pickBinder);return;}
  const moveBinder=e.target.closest('[data-binder-move]');if(moveBinder){openMovePicker(moveBinder.dataset.binderMove);return;}
  const removeBinder=e.target.closest('[data-binder-remove]');if(removeBinder){removeFromBinder(removeBinder.dataset.binderRemove);return;}
  const addBinder=e.target.closest('[data-owned-binder]');if(addBinder){openMovePicker(addBinder.dataset.ownedBinder);return;}
  const wishMove=e.target.closest('[data-wish-move]');if(wishMove){openWishMove(wishMove.dataset.wishMove);return;}
  const move=e.target.closest('[data-move-kind]');if(move){reorder(move.dataset.moveKind,Number(move.dataset.moveIndex),Number(move.dataset.moveIndex)+Number(move.dataset.moveDelta));return;}
 });
 $('wishMoveTop').onclick=()=>applyWishMove(1);
 $('wishMoveConfirm').onclick=()=>applyWishMove($('wishMovePosition').value);
 $('wishMoveCancel').onclick=()=>$('wishMoveDialog').close();
 $('wishMoveDialog').addEventListener('close',()=>{wishMoveSelectedId=null;});
 $('wishMovePosition').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyWishMove(e.target.value);}});
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-open-owned],[data-open-wish]')){e.preventDefault();showModal(e.target.dataset.openOwned||e.target.dataset.openWish);}});
  $('binderFind').addEventListener('input',searchBinder);$('ownedFind').addEventListener('input',renderOwnedList);
  $('wishFind').addEventListener('input',renderCollections);
  $('wishSort').addEventListener('change',renderCollections);
  $('ownedSort').addEventListener('change',renderOwnedList);
  $('copyWishlist').addEventListener('click',copyWishlist);
 $('binderPlaceSelected').onclick=()=>{if(!binderSelectedId)return;placeBinder(binderSelectedId,Number($('binderTargetPage').value)||1,Number($('binderTargetSlot').value)||1);};
 $('binderIncludeWish').onchange=e=>{if(!ensureCloudEdit()){e.target.checked=state.binderIncludeWish;return;}state.binderIncludeWish=e.target.checked;save();};
 $('binderPrev').onclick=()=>{state.binderPage=Math.max(0,state.binderPage-1);renderCollections();};
 $('binderNext').onclick=()=>{state.binderPage++;renderCollections();};
 $('binderMovePage').onclick=openPageMoveDialog;
 $('binderMovePageConfirm').onclick=applyPageMove;
 $('binderMovePageCancel').onclick=()=>$('binderMovePageDialog').close();
 for(const name of ['binderMovePageSource','binderMovePagePosition'])
  $(name).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyPageMove();}});
 $('binderManagePockets').onclick=openPocketDialog;
 $('binderPocketPosition').addEventListener('change',updatePocketDialog);
 $('binderPocketMark').onclick=()=>applyPocketChange(false);
 $('binderPocketClear').onclick=()=>applyPocketChange(true);
 $('binderPocketCancel').onclick=()=>$('binderPocketDialog').close();
 window.VintageCollectionDrag.attach({reorder,toast});
}

function attach(){document.addEventListener('click',e=>{const own=e.target.closest('[data-own]');if(own)return toggleOwned(own.dataset.own);const removeWishBtn=e.target.closest('[data-remove-wish]');if(removeWishBtn){removeWish(removeWishBtn.dataset.removeWish);return;}const wish=e.target.closest('[data-wish]');if(wish)return toggleWish(wish.dataset.wish);const preview=e.target.closest('[data-preview]');if(preview)return showModal(preview.dataset.preview);const set=e.target.closest('[data-set]');if(set){const id=set.dataset.set;if(id==='all'){state.selectedSets=[];}else if(state.selectedSets.includes(id)){state.selectedSets=state.selectedSets.filter(s=>s!==id);}else{state.selectedSets=[...state.selectedSets,id];}state.active=state.selectedSets.length===1?state.selectedSets[0]:'all';if(MAP.get(id)?.group==='Extra'&&state.selectedSets.includes(id)){state.extras=true;$('extrasEnabled').checked=true;}state.limit=96;renderAll(true);const sticky=document.querySelector('.sticky-sitebar');const shell=document.querySelector('.shell');window.scrollTo({top:Math.max(0,shell.getBoundingClientRect().top+window.scrollY-(sticky?.offsetHeight||0)-12),behavior:'smooth'});}});
 $('search').addEventListener('input',e=>{state.query=e.target.value.trim();state.limit=96;renderAll(true)});$('statusSelect').onchange=e=>{state.status=e.target.value;state.limit=96;renderAll(true)};$('sortSelect').onchange=e=>{state.sort=e.target.value;state.limit=96;renderAll(true)};$('holoOnly').onchange=e=>{state.holoOnly=e.target.checked;state.limit=96;renderAll(true)};$('pokemonOnly').onchange=e=>{state.pokemonOnly=e.target.checked;state.limit=96;renderAll(true)};$('extrasEnabled').onchange=e=>{state.extras=e.target.checked;if(!state.extras){state.selectedSets=state.selectedSets.filter(id=>MAP.get(id)?.group!=='Extra');state.active=state.selectedSets.length===1?state.selectedSets[0]:'all';}state.limit=96;renderAll(true)};$('loadMore').onclick=()=>{state.limit+=96;renderCards()};$('showOwned').onclick=()=>{state.status='owned';$('statusSelect').value='owned';state.limit=96;renderAll(true)};$('showHolo').onclick=()=>{state.holoOnly=true;$('holoOnly').checked=true;state.limit=96;renderAll(true)};$('resetFilters').onclick=()=>{state.query='';state.status='all';state.sort='num';state.holoOnly=false;state.pokemonOnly=true;state.selectedSets=[];state.active='all';state.extras=false;state.limit=96;$('search').value='';$('statusSelect').value='all';$('sortSelect').value='num';$('holoOnly').checked=false;$('pokemonOnly').checked=true;$('extrasEnabled').checked=false;renderAll(true)};$('exportJSON').onclick=backup;$('exportCSV').onclick=exportCSV;$('importJSON').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{importBackup(e.target.files[0]);e.target.value=''};$('closeModal').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').close()});attachCollections();}

attach();loadEmbeddedData();
// Keep the desktop set sidebar below the sticky title/tabs, including when the header changes height.
const stickySitebar=document.querySelector('.sticky-sitebar');
if(stickySitebar){
 const syncStickyOffset=()=>document.documentElement.style.setProperty('--sticky-sitebar-height',Math.ceil(stickySitebar.getBoundingClientRect().height)+'px');
 syncStickyOffset();
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncStickyOffset).observe(stickySitebar);
 else window.addEventListener('resize',syncStickyOffset);
}
})();
