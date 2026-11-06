# Pokémon Deal Finder — first implementation slice

This repository currently serves a single large, static `index.html` with Firebase-backed collection and wishlist state; there is no Node/React build pipeline. The first slice deliberately leaves that file untouched to avoid breaking binder interactions.

## Implemented
- Dependency-free scoring module (`scoring.js`) for all five condition grades.
- Shipping is included in the total.
- Missing shipping, grade or reference price is flagged for review instead of producing a misleading discount.
- Search term construction for individual wishlist cards.

## Next integration steps
1. Identify the existing wishlist state shape in `index.html` and expose a read-only adapter.
2. Add a small Deals view in the existing navigation, initially with an explicit demo/empty state.
3. Add a serverless proxy for eBay OAuth client credentials and Browse API. Never put client secrets in `index.html`.
4. Search by name + set + collector number, include auction-only listings via `buyingOptions:{AUCTION}`, and set delivery country to IL where supported.
5. Normalize currencies using a dated exchange rate and shipping to Israel. Never treat unknown shipping as free.
6. Use existing market-price data where grade-specific prices exist. Mark grade guesses as unverified and avoid false deal claims.
7. Add tests for condition/edition mismatches, bundles, reprints, missing shipping, and bid updates.

## Notes
- eBay Browse API requires an application token and production access may require additional approval.
- Live listing discovery is **not connected yet**. No production credentials were provided.
- Sold comparables and photos are necessary for confidence, especially for creased/damaged cards.
- Do not auto-bid, purchase or modify wishlist entries.
