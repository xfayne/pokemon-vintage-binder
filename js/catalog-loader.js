(()=>{'use strict';
window.VintageCatalogLoader={create({SETS,OFFLINE_PACKS,state,$,renderAll}){
function embeddedCards(){
 const cards=[]; const rarityNames={H:'Rare Holo',S:'Rare Shining',R:'Rare',U:'Uncommon',C:'Common',E:'',P:'Promo'};
 for(const set of SETS){
  const pack=OFFLINE_PACKS[set.id];if(!pack)continue;
  const names=pack[0].split('|');let i=0;
  for(const spec of pack[1].split(';')){
   const [endString,type]=spec.split(':');const end=Number(endString);
   for(;i<end;i++){
    const number=i+1;let kind=number<=pack[2]?'Pokémon':pack[3]!==null&&number>=pack[3]?'Energy':'Trainer';
    if(set.id==='base5'&&[17,80,81,82].includes(number))kind='Energy';
    if(set.id==='base1'&&number===96)kind='Energy';
    if(set.id==='neo1'&&[19,104,105].includes(number))kind='Energy';
    if(set.id==='neo4'&&number===16)kind='Energy';
    if(set.id==='base6'&&[100,101].includes(number))kind='Energy';
    // Secret Shining cards are Pokémon even though they follow the trainer/energy range.
    if((set.id==='neo3'&&[65,66].includes(number))||(set.id==='neo4'&&number>=106&&number<=113))kind='Pokémon';
    if(set.id==='basep'&&[16,40,41,42].includes(number))kind='Trainer';
    let finish=type==='H'?'holo':type==='S'?'shining':type==='P'?'unknown':'normal';
    if(set.id==='si1'&&[1,4,7,11,14,17].includes(number))finish='holo';
    const total=set.id==='basep'?null:set.id==='base5'?82:set.id==='neo3'?64:set.id==='neo4'?105:set.count;
    cards.push({id:set.id+'-'+number,set:set.id,name:names[i],number:String(number),total,rarity:set.id==='base5'&&number===83?'Rare Secret':rarityNames[type],finish,kind,image:'https://images.pokemontcg.io/'+set.id+'/'+number+'.png',large:'https://images.pokemontcg.io/'+set.id+'/'+number+'_hires.png'});
   }
  }
  if(names.length!==i)throw Error('Incomplete embedded set '+set.id);
 }
 cards.push({id:'movie2000-ancient-mew',set:'movie2000',name:'Ancient Mew',number:'ללא מספר',total:null,rarity:'Movie Promo Holo',finish:'holo',kind:'Pokémon',image:'assets/ancient-mew.jpg',large:'assets/ancient-mew.jpg'});
 return cards;
}

function loadEmbeddedData(){
 try{
  state.cards=embeddedCards();
  if(state.cards.length!==1252)throw Error('Unexpected card count: '+state.cards.length);
  state.failures=[];state.ready=true;
  $('fetchStatus').hidden=true;
  renderAll();
  document.documentElement.classList.add('js-ready');
 }catch(error){
  console.error('Could not initialize offline catalog',error);
  $('fetchStatus').hidden=false;$('fetchStatus').classList.add('error');
  $('fetchStatus').textContent='אירעה תקלה בטעינת הרשימה המובנית: '+error.message;
 }
}

return {loadEmbeddedData};
}};
})();
