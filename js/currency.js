/* Shared display currency. Market comparisons remain denominated in USD.
   Missing reference rates never silently become original-currency prices. */
(()=>{
 'use strict';
 const KEY='pokemon-vintage-display-currency';
 const allowed=new Set(['ILS','USD','EUR']);
 const rates={USD:1};
 let currency='ILS',fxDate=null,status='loading';
 try{const saved=localStorage.getItem(KEY);if(allowed.has(saved))currency=saved;}catch(_){}
 const getCurrency=()=>currency;
 const toUSD=(amount,from)=>{
  if(amount===null||amount===undefined||amount==='')return null;
  const value=Number(amount),rate=rates[String(from||'').toUpperCase()];
  return Number.isFinite(value)&&value>=0&&Number.isFinite(rate)&&rate>0?value/rate:null;
 };
 const convert=(amount,from='USD',to=currency)=>{
  const usd=toUSD(amount,from),rate=rates[to];
  return usd!==null&&Number.isFinite(rate)&&rate>0?usd*rate:null;
 };
 const format=(amount,from='USD')=>{
  const result=convert(amount,from);
  if(result===null)return '—';
  return new Intl.NumberFormat(currency==='ILS'?'he-IL':'en-US',{
   style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2
  }).format(result);
 };
 const getFxDate=()=>fxDate;
 const getRateStatus=()=>status==='ready'
  ?'שערי המרה ל־'+fxDate+' · מקור: Frankfurter'
  :status==='loading'?'טוען שערי המרה עדכניים…'
  :'שערי המרה לא זמינים כרגע · מחירים שלא ניתן להמיר מוצגים כ־—';
 function updateMenu(){
  document.querySelectorAll('[data-currency-choice]').forEach(button=>{
   const active=button.dataset.currencyChoice===currency;
   button.classList.toggle('selected',active);
   button.setAttribute('aria-pressed',String(active));
  });
  const note=document.getElementById('currencyRateStatus');
  if(note)note.textContent=getRateStatus();
 }
 function notify(){
  updateMenu();
  window.dispatchEvent(new Event('vintage-currency-change'));
 }
 function setCurrency(next){
  if(!allowed.has(next))return false;
  if(next===currency){updateMenu();return true;}
  currency=next;
  try{localStorage.setItem(KEY,next);}catch(_){}
  notify();
  return true;
 }
 window.VintageCurrency={getCurrency,toUSD,convert,format,getFxDate,getRateStatus,setCurrency,ready:null};
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-currency-choice]');
  if(button)setCurrency(button.dataset.currencyChoice);
 });
 window.addEventListener('vintage-currency-change',()=>{
  window.VintageEbayLive?.refreshCards?.();
  window.VintageBinder?.refreshOwned?.();
  window.VintageMarketPrices?.refresh?.();
 });
 updateMenu();
 async function loadRates(){
  try{
   const response=await fetch('https://api.frankfurter.dev/v2/rates?base=USD',{cache:'no-store'});
   if(!response.ok)throw Error('FX HTTP '+response.status);
   const rows=await response.json();
   if(!Array.isArray(rows))throw Error('Invalid FX payload');
   const next={USD:1},dates={};
   for(const row of rows){
    if(row.base!=='USD'||!/^[A-Z]{3}$/.test(String(row.quote)))continue;
    if(!Number.isFinite(Number(row.rate))||Number(row.rate)<=0)continue;
    next[row.quote]=Number(row.rate);
    dates[row.quote]=row.date;
   }
   if(!next.EUR||!next.ILS||!dates.EUR||!dates.ILS)throw Error('Missing required FX rates');
   Object.assign(rates,next);
   fxDate=[dates.EUR,dates.ILS].sort()[0];
   status='ready';
  }catch(error){
   status='unavailable';
   console.warn('Currency reference rates unavailable:',error);
  }
  notify();
 }
 window.VintageCurrency.ready=loadRates();
})();