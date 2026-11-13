/* Scoring remains in USD, display uses the shared user-selected currency. */
(()=>{
 'use strict';
 window.VintageDealsDashboard={
  render:()=>{},
  convertToUSD:(value,currency)=>window.VintageCurrency?.toUSD(value,currency)??null,
  getFxDate:()=>window.VintageCurrency?.getFxDate()??null
 };
})();
