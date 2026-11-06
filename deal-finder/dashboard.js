/* Lightweight market FX for eBay live auction comparisons. No duplicate wishlist or forms. */
(()=>{
 'use strict';
 const rates={USD:1};
 let fxDate=null;
 const convertToUSD=(value,currency)=>{
  const rate=rates[currency];
  return Number.isFinite(Number(value))&&Number(value)>=0&&Number.isFinite(rate)&&rate>0 ? Number(value)/rate : null;
 };
 window.VintageDealsDashboard={
  render:()=>{},
  convertToUSD,
  getFxDate:()=>fxDate
 };
 async function loadRates(){
  try{
   const r=await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,GBP,ILS',{cache:'no-store'});
   if(!r.ok)throw new Error('FX fetch failed');
   const quotes=await r.json();
   if(!Array.isArray(quotes))throw new Error('Unexpected FX data');
   for(const quote of quotes){
    if(['EUR','GBP','ILS'].includes(quote.quote)&&quote.base==='USD'&&Number(quote.rate)>0){
     rates[quote.quote]=Number(quote.rate);
     fxDate=quote.date||null;
    }
   }
   window.VintageEbayLive?.refreshCards?.();
  }catch(_){
   // Missing FX rates never become fabricated prices.
  }
 }
 loadRates();
})();