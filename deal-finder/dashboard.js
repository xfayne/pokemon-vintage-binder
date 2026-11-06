/* Pokémon Deals dashboard. Scores manually tracked listings; NEVER claims live eBay data. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('dealsPage') || !$('dealWatchForm')) return;

  const STORAGE_KEY = 'pokemon-vintage-deal-watch-v2';
  const GRADES = ['NM', 'LP', 'MP', 'HP', 'DMG'];
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS'];
  let tracked = [];
  const fx = { USD: 1 };
  let fxDate = null, fxError = false, lastCardsSignature = '';
  let discountPct = 35, shippingBudget = 10;
  const money = amount => '$' + Number(amount).toFixed(2);
  const bridge = () => window.VintageDealBridge;
  const h = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const safeNumber = value => value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const cards = () => bridge()?.getWishlistCards?.() || [];
  const refPrice = (id, grade) => GRADES.includes(grade) ? bridge()?.getMarketPrice?.(id, grade) : null;
  const getRate = currency => currency === 'USD' ? 1 : fx[currency] ? 1 / fx[currency] : null;
  const eBayUrl = (raw) => {
    try {
      const url = new URL(String(raw).trim());
      const name = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || !/(^|\.)ebay\.(com|co\.uk|de|fr|it|es|nl|ca|com\.au|us)$/.test(name)) return null;
      return url.toString();
    } catch (_) { return null; }
  };
  const queryUrl = (c, broad) => {
    const terms = [c.name, c.setName, broad ? '' : c.number, c.firstEdition ? '1st edition' : '', 'pokemon'].filter(Boolean).join(' ');
    return 'https://www.ebay.com/sch/i.html?' + new URLSearchParams({_nkw:terms, LH_Auction:'1'}).toString();
  };

  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(data)) tracked = data.filter(v => v && typeof v === 'object' && typeof v.cardId === 'string' && typeof v.url === 'string' && eBayUrl(v.url)).slice(0, 200);
  } catch (_) { /* Browser storage may be disabled or malformed. */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked)); } catch (_) { $('dealStatus').textContent = 'לא ניתן לשמור מעקב בדפדפן הזה.'; } };

  async function loadRates() {
    const label = $('dealFxStatus');
    label.textContent = 'מעדכן שערי מטבע…';
    try {
      const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,GBP,ILS', {cache:'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const values = await response.json();
      if (!Array.isArray(values)) throw new Error('Unexpected exchange rate response');
      for (const item of values) {
        if (CURRENCIES.includes(item.quote) && item.base === 'USD' && Number(item.rate) > 0) {
          fx[item.quote] = Number(item.rate);
          fxDate = item.date;
        }
      }
      if (!fx.EUR || !fx.GBP || !fx.ILS) throw new Error('Missing quote currencies');
      fxError = false;
      label.textContent = 'שערי המרה לאמצע שוק, מעודכנים ל־' + fxDate + ' · Frankfurter';
    } catch (_) {
      fxError = true;
      label.textContent = 'לא ניתן לטעון שערי מטבע כרגע. עסקאות שאינן בדולר דורשות בדיקה ידנית.';
    }
    render();
  }

  function score(entry) {
    const listing = tracked.includes(entry) ? entry : null;
    if (!listing) return {status:'review', reason:'פרטי מודעה חסרים'};
    const grade = listing.grade;
    const market = refPrice(listing.cardId, grade);
    const rate = getRate(listing.currency);
    const price = safeNumber(listing.price), shipping = safeNumber(listing.shipping);
    const title = String(listing.title || '').toLowerCase();
    const blocked = /\b(reprint|proxy|replica|orica|fake|counterfeit|custom card|not authentic)\b/.test(title);
    const concerns = /\b(crease|creased|fold|bent|heavy damage|lot|bundle|psa|bgs|cgc)\b/.test(title);
    if (blocked) return {status:'review',reason:'בכותרת מופיעה אזהרה על מקוריות הקלף'};
    if (!GRADES.includes(grade)) return {status:'review',reason:'יש לבחור מצב קלף משוער'};
    if (price === null || shipping === null) return {status:'review',reason:'חסר מחיר או משלוח מאומת לישראל'};
    if (!rate) return {status:'review',reason:'אין שער המרה זמין למטבע הזה'};
    if (market === undefined) return {status:'loading',reason:'טוען מחיר שוק'};
    if (typeof market !== 'number' || !Number.isFinite(market) || market <= 0) return {status:'review',reason:'לא נמצא מחיר שוק למצב ולהדפסה הזו'};
    const total = (price + shipping) * rate;
    const discount = (market - total) / market;
    const bidLimit = Math.max(0, market * (1 - discountPct / 100) / rate - shipping);
    const caution = concerns || (listing.rating !== '' && safeNumber(listing.rating) !== null && Number(listing.rating) < 95);
    const good = discount >= discountPct / 100;
    return {status:caution?'review':good?'candidate':'not-deal',reason:caution?'נמצאו סימני סיכון בכותרת או בדירוג המוכר':'המצב והמקוריות דורשים אימות בתמונות',market,total,discount,bidLimit};
  }

  const listingItem = (v) => {
    const selectedCard = cards().find(c => c.id === v.cardId);
    const result = score(v);
    const name = selectedCard ? selectedCard.name + ' · ' + selectedCard.setName : 'קלף שאינו נמצא כעת ב־Wishlist';
    const labels = {candidate:'נראה מבטיח', 'not-deal':'לא עומד ביעד', review:'צריך בדיקה', loading:'טוען מחיר'};
    const cls = result.status === 'candidate' ? 'good' : result.status === 'not-deal' ? 'neutral' : 'review';
    const left = v.endsAt && Number.isFinite(new Date(v.endsAt).getTime()) ?
      Math.round((new Date(v.endsAt).getTime() - Date.now()) / 3600000) : null;
    const endLabel = left == null ? '' : left < 0 ? ' · המועד שהוזן עבר' : left <= 24 ? ' · מסתיים בתוך ' + left + ' שעות' : ' · מסתיים בעוד ' + Math.ceil(left / 24) + ' ימים';
    return '<article class="deal-track-item">' +
      '<div class="deal-track-head"><strong>' + h(name) + '</strong><span class="deal-signal ' + cls + '">' + labels[result.status] + '</span></div>' +
      '<div class="deal-track-meta">' + h(v.grade || 'מצב לא ידוע') + ' · ' + h(v.currency) + ' ' + h(v.price) + ' + משלוח ' + h(v.shipping === '' ? '?' : v.shipping) + endLabel + '</div>' +
      (result.market ? '<div class="deal-track-numbers"><b>מחיר כולל ' + money(result.total) + '</b><span>שווי ייחוס ' + money(result.market) + '</span><b class="' + (result.discount >= 0 ? 'positive' : 'negative') + '">' + Math.round(result.discount * 100) + '% ' + (result.discount >= 0 ? 'מתחת' : 'מעל') + ' לשוק</b><span>תקרת הצעה ליעד: ' + h(v.currency) + ' ' + result.bidLimit.toFixed(2) + '</span></div>' : '<div class="deal-track-explain">' + h(result.reason) + '</div>') +
      '<div class="deal-track-actions"><a href="' + h(v.url) + '" target="_blank" rel="noopener noreferrer">פתח מכרז ב־eBay ↗</a><button type="button" data-deal-remove="' + h(v.id) + '">הסר מהמעקב</button></div>' +
      '<small>המחירים והמצב שהוזנו אינם מאומתים מול eBay. יש לבדוק תמונות, אותנטיות, הדפסה ומשלוח לפני הצעת מחיר.</small>' +
      '</article>';
  };

  function updateCardSelection(list) {
    const select = $('dealItemCard');
    const signature = list.map(c => c.id).join('|');
    if (signature === lastCardsSignature) return;
    lastCardsSignature = signature;
    const old = select.value;
    select.replaceChildren();
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name + ' · ' + c.setName + ' #' + c.number;
      select.appendChild(opt);
    }
    if (list.some(c => c.id === old)) select.value = old;
    $('dealSave').disabled = !list.length;
  }

  function renderCards(list) {
    const q = $('dealsFind').value.trim().toLowerCase();
    const gradeFilter = $('dealGrade').value;
    let results = list.filter(c => (c.name + ' ' + c.setName + ' ' + c.number).toLowerCase().includes(q));
    if ($('dealSort').value === 'value') {
      results = results.slice().sort((a,b) => (Number(refPrice(b.id, gradeFilter) || 0) - Number(refPrice(a.id, gradeFilter) || 0)) || a.rank - b.rank);
    }
    $('dealsCount').textContent = results.length + ' מתוך ' + list.length;
    $('dealsItems').innerHTML = results.length ? results.map(c => {
      const grade = c.condition || gradeFilter;
      const market = refPrice(c.id, grade);
      const available = typeof market === 'number' && Number.isFinite(market) && market > 0;
      const maxAllIn = available ? market * (1 - discountPct / 100) : null;
      const maxBid = available ? Math.max(0, maxAllIn - shippingBudget) : null;
      return '<article class="deal-item" role="listitem">' +
        '<span class="deal-rank">' + c.rank + '</span>' +
        '<img class="deal-image" src="' + h(c.image) + '" alt="' + h(c.name) + '" loading="lazy">' +
        '<div class="deal-body"><strong>' + h(c.name) + '</strong><small>' + h(c.setName + ' · #' + c.number + ' · ' + (c.firstEdition ? '1st Edition' : 'Unlimited')) + '</small>' +
        '<div class="deal-card-values"><span>שווי ' + h(grade) + ': <b>' + (available ? money(market) : market === undefined ? 'טוען…' : '—') + '</b></span>' +
        '<span>מחיר יעד כולל: <b>' + (maxAllIn !== null ? money(maxAllIn) : '—') + '</b></span>' +
        '<span>מקס׳ הצעה אחרי משלוח מוערך: <b>' + (maxBid !== null ? money(maxBid) : '—') + '</b></span></div>' +
        '<div class="deal-actions"><button type="button" data-deal-watch="' + h(c.id) + '">＋ עקוב אחר מכרז</button><a href="' + h(queryUrl(c, false)) + '" target="_blank" rel="noopener noreferrer">חפש מכרזים ↗</a><a class="deal-wide" href="' + h(queryUrl(c, true)) + '" target="_blank" rel="noopener noreferrer">חיפוש רחב</a></div></div></article>';
    }).join('') : '<div class="no-cards">' + (list.length ? 'לא נמצאו קלפים שמתאימים לחיפוש.' : 'רשימת הרצונות שלך ריקה. הוסף קלפים מהקטלוג כדי להתחיל.') + '</div>';
  }

  function render() {
    const list = cards();
    updateCardSelection(list);
    $('dealWishlistStat').textContent = list.length;
    $('dealTrackedStat').textContent = tracked.length;
    $('dealPromisingStat').textContent = tracked.filter(v => score(v).status === 'candidate').length;
    $('dealDiscountLabel').textContent = discountPct + '%';
    renderCards(list);
    const sorted = tracked.slice().sort((a,b) => {
      const as = score(a), bs = score(b);
      const scoreValue = s => s.status === 'candidate' ? 100 + s.discount : s.status === 'not-deal' ? s.discount : -100;
      return scoreValue(bs) - scoreValue(as);
    });
    $('dealWatchList').innerHTML = sorted.length ? sorted.map(listingItem).join('') :
      '<div class="deal-empty-watch">כאן יופיעו מכרזים שתוסיף למעקב, עם חישוב הנחה אמיתי ביחס למחיר השוק לפי מצב הקלף.</div>';
  }

  $('dealsFind').addEventListener('input', render);
  $('dealGrade').addEventListener('change', render);
  $('dealSort').addEventListener('change', render);
  $('dealDiscount').addEventListener('input', e => { discountPct = Number(e.target.value); render(); });
  $('dealShippingBudget').addEventListener('input', e => { shippingBudget = Math.max(0, Number(e.target.value) || 0); render(); });
  $('dealsItems').addEventListener('click', e => {
    const button = e.target.closest('[data-deal-watch]');
    if (!button) return;
    const c = cards().find(x => x.id === button.dataset.dealWatch);
    if (!c) return;
    $('dealItemCard').value = c.id;
    $('dealListingGrade').value = c.condition || $('dealGrade').value;
    $('dealWatchForm').scrollIntoView({block:'center',behavior:'smooth'});
    $('dealListingUrl').focus();
  });
  $('dealWatchList').addEventListener('click', e => {
    const button = e.target.closest('[data-deal-remove]');
    if (!button) return;
    tracked = tracked.filter(v => v.id !== button.dataset.dealRemove);
    save();render();
  });
  $('dealWatchForm').addEventListener('submit', e => {
    e.preventDefault();
    const status = $('dealStatus');
    status.textContent = '';
    const url = eBayUrl($('dealListingUrl').value);
    if (!url) { status.textContent = 'יש להזין קישור HTTPS תקין של eBay.'; return; }
    const price = safeNumber($('dealListingPrice').value);
    if (price === null) { status.textContent = 'יש להזין מחיר מכרז תקין.'; return; }
    const shipping = $('dealListingShipping').value.trim();
    if (shipping !== '' && safeNumber(shipping) === null) { status.textContent = 'הזן עלות משלוח תקינה, או השאר ריק אם לא ידועה.'; return; }
    const id = $('dealItemCard').value;
    if (!cards().some(c => c.id === id)) { status.textContent = 'יש לבחור קלף מרשימת הרצונות.'; return; }
    const record = {
      id: (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      cardId:id, url, grade:$('dealListingGrade').value,
      currency:$('dealListingCurrency').value,
      price, shipping:shipping === '' ? '' : Number(shipping),
      title:$('dealListingTitle').value.trim().slice(0,180),
      endsAt:$('dealListingEnds').value,
      rating:$('dealSellerRating').value.trim(),
      savedAt:Date.now()
    };
    tracked.unshift(record);
    tracked = tracked.slice(0, 200);
    save(); e.target.reset();
    status.textContent = 'המכרז נוסף למעקב בדפדפן הזה.';
    render();
  });
  $('dealRefreshRates').addEventListener('click', loadRates);
  window.VintageDealsDashboard = {render, convertToUSD:(value,currency)=>{const rate=getRate(currency);return rate!==null && Number.isFinite(Number(value))?Number(value)*rate:null;}, getFxDate:()=>fxDate};
  render();
  loadRates();
})();