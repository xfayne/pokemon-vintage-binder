# 🔎 מציאות — Live eBay deal discovery

The Deals tab displays **live eBay auctions and Buy It Now listings**, without a fake/sample auction feed.

## Visible UI

- While eBay Production keys are pending: a short connection-status message. No duplicate Wishlist table, bid-target slider or manual auction-input form.
- Once connected: opening the Deals tab automatically scans the entire authenticated user's Firebase Wishlist in sequential 4-card batches, with a short pause between batches. A progress bar reports scanned/total cards, and results appear as each batch completes. The scan can be paused/resumed and restarted manually. Completed results are reused on revisits for 30 minutes while the page stays open; the scan is not a scheduled background job.
- Show auctions AND Buy It Now listings from US/UK/Germany, including bids, ending times, shipping to Israel when known, seller feedback, optional Best Offer, and the eBay listing link.
- Default sort is **recommended opportunities**: near-ending auctions and fixed-price discounts rank higher than distant auctions with very low opening bids. Manual sorts remain available. Advanced filters cover listing type, auction ending horizon, max shipping, all-in price, discount threshold, and condition; reset shows the complete set of collected results. Each listing uses one NM/LP/MP/HP/DMG price comparison, using an eBay-provided condition when available, otherwise a clearly labeled title guess or MP fallback. Users can override grade per listing. Top candidates receive a limited on-demand detailed-condition lookup. Unknown shipping is provisional, never free. Results render 40 at a time to keep mobile scrolling responsive.
- Tapping an actual listing photo opens a mobile gallery showing primary and additional images **only after opening**: thumbnails, previous/next buttons, keyboard arrows, swipe navigation, and a direct link to the original eBay listing. Opening the same item again reuses photo metadata in the current browser session. Unavailable photos do not trigger fabricated images.
- A clearly labeled **AI condition analysis (demo)** button expands static example findings only; it does not call an AI provider or evaluate the photos.
- The app's card-details modal retains a quick eBay auction-search link for one-off manual searches.

## Backend

The source for the Cloudflare Worker is at `../ebay-worker/`. Its public URL is configured directly in `live.js`:

`https://pokemon-vintage-ebay-deals.xfayne.workers.dev`

Credentials are **not** stored in the GitHub Pages source. Put approved eBay Production App ID / Client ID and Cert ID / Client Secret into Cloudflare Worker secrets:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`

The worker's `GET /health` reports whether those secrets are configured, `POST /api/search` returns live US/UK/German auctions and fixed-price listings, `POST /api/item-condition` checks detailed seller condition, and `POST /api/item-images` fetches listing photo URLs on demand from eBay Browse `getItem`. Gallery requests are separate from search/enrichment, so regular scans do not request additional images.

## Card-identity verification (three layers)

- The Worker immediately rejects clearly incompatible listings: digital/TCG Pocket items, posters, proxies, sealed packs, explicit non-English languages, contradictory card numbers, and card-choice listing formats. It uses the binder's vintage card-name catalog to flag titles mentioning other Pokémon.
- Listings with exact card name, matching set, and matching card number and no unresolved conflicts are labeled **strong match**. Listings missing necessary evidence, mentioning multiple cards, or showing conflicting Holo signals are **needs review** and remain visible below strong matches.
- Needs-review listings do not show market-value discounts or get recommended-deal badges, even if the current eBay price is low. Their raw listing price and shipping remain visible. The advanced-filter toggle can hide/show them; resetting filters shows all *retained relevant or reviewable* listings, not hard-rejected products.
- After scanning, the UI fetches full Browse item details for up to 18 candidate listings to inspect structured card number, set, language, and condition (when available). A listing is promoted only when those extra fields corroborate the target; conflicting fields can cause rejection. Manual per-item lookup remains available.
- Even a strong match is **not** proof that the photo, item condition or authenticity are correct. Seller-supplied text and eBay item aspects may be wrong, and no automated image recognition has been added.

## Accuracy and safety

- No fake or cached sample auctions are shown as real.
- Title matching does not prove edition, authenticity or card condition.
- Missing shipping is not treated as free.
- No automatic bids, purchases, scheduled alerts or image grading.
- The historical `scoring.js` and `dashboard-template.js` files are not currently loaded by the app.

## Test

- Open the live website with keys absent and verify only the waiting message appears.
- Add keys and confirm scanning proceeds automatically through all Wishlist cards (in four-card batches), updating progress, preserving earlier results, and allowing pause/resume, manual restart and 'show more' results. Test filters and resets, fixed vs auction types, seller-grade overrides and unknown shipping.
- Confirm Wishlist drag-and-drop, Firestore collection updates and all other tabs are unchanged.
- Worker integration tests: `node --test ebay-worker/worker.test.mjs`.
- Playwright Deals tests: `node tests/deals-ui-regression.mjs`; these mock eBay and verify gallery lazy loading, thumbnails, navigation, caching, and clearly fake AI demo.
