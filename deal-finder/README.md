# 🔎 מציאות — Live eBay auction discovery

The Deals tab intentionally displays **only live eBay auction search** and its results.

## Visible UI

- While eBay Production keys are pending: a short connection-status message. No duplicate Wishlist table, bid-target slider or manual auction-input form.
- Once connected: automatically load auctions for the first four cards on the authenticated user's existing Firebase Wishlist. Search subsequent cards in four-card batches.
- Show live current bid, bid count, end time, shipping to Israel when known, seller feedback and the eBay listing link.
- Sort by estimated discount, closing soonest, fewest bids or title-match confidence. Compare against a selected **assumed** NM/LP/MP/HP/DMG condition. Unknown shipping or FX rates mean no reliable all-in estimate.
- The app's card-details modal retains a quick eBay auction-search link for one-off manual searches.

## Backend

The source for the Cloudflare Worker is at `../ebay-worker/`. Its public URL is configured directly in `live.js`:

`https://pokemon-vintage-ebay-deals.xfayne.workers.dev`

Credentials are **not** stored in the GitHub Pages source. Put approved eBay Production App ID / Client ID and Cert ID / Client Secret into Cloudflare Worker secrets:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`

The worker's `GET /health` reports whether those secrets are configured and `POST /api/search` searches live US and German eBay marketplaces for auction listings shipping to Israel.

## Accuracy and safety

- No fake or cached sample auctions are shown as real.
- Title matching does not prove edition, authenticity or card condition.
- Missing shipping is not treated as free.
- No automatic bids, purchases, scheduled alerts or image grading.
- The historical `scoring.js` and `dashboard-template.js` files are not currently loaded by the app.

## Test

- Open the live website with keys absent and verify only the waiting message appears.
- Add keys and confirm the first four Wishlist cards search; load more and verify matching and currency handling.
- Confirm Wishlist drag-and-drop, Firestore collection updates and all other tabs are unchanged.
- Worker integration tests: `node --test ebay-worker/worker.test.mjs`.
