# Pokémon Deal Finder

This feature is now part of the existing binder under **🔎 מציאות**.

## What works today

- **Firebase Wishlist integration (read-only)**: list cards in their saved priority order, including print edition and per-card condition where present. The existing drag & drop, collection and Firestore documents remain untouched.
- **Grade-specific market references**: reuse the site's existing TCGTracking/TCGplayer data (USD) for NM, LP, MP, HP and DMG; reference prices are indicative and can be unavailable.
- **Bid targets**: choose a target discount (default 35%) and an estimated shipping budget in USD. Display the maximum all-in card cost and the bid ceiling after assumed shipping.
- **Tracked auctions**: paste an eBay listing URL and manually enter bid, shipping to Israel, estimated grade, currency, optional title, seller feedback and closing time. The dashboard ranks tracked candidates by calculated discount and flags suspicious titles, unknown shipping and missing price references.
- **Exchange rates**: Frankfurter public mid-market USD-base quotes for EUR, GBP and ILS with displayed rate date. If FX is unavailable, no FX-dependent recommendation is made.
- **eBay shortcuts**: narrow and broad auction-search links per Wishlist card, plus an auction-search link in the existing card-details modal.
- **Storage**: manual auction tracking is **browser-only localStorage** (not shared with Firestore or across devices).

## What is **not** implemented

The dashboard does **not** retrieve current eBay listings, shipping quotes or bid counts automatically. The manually entered listing metadata is not verified against eBay, and the image / condition / authenticity are not AI-inspected. No auto-bidding, purchasing, scheduled checks or alerts are implemented. It does not include duties, currency conversion fees or sold-comparable verification.

Do not label an auction as guaranteed under market, because grade and edition can be misidentified, and eBay bids can change before close.

## How to enable actual live eBay discovery later

1. Create an eBay Developers **Production** application keyset and verify that Browse API production access is enabled.
2. Add a secure serverless backend (Cloudflare Worker / Firebase Function) that acquires an application OAuth token using the **client credentials grant** and calls `GET /buy/browse/v1/item_summary/search` using `filter=buyingOptions:{AUCTION}`.
3. Keep `client_secret` **only** in the backend secret manager, never in the public GitHub Pages source or a web form.
4. Request delivery context for Israel, and mark shipping as unknown if the result is incomplete; only rank listings whose exact set, edition and condition are sufficiently verified.
5. Add pagination/caching/rate controls and source freshness metadata. Surfaced results should show bid count and closing time; ranking must clearly distinguish high-confidence vs unverified listings.

Official docs: https://developer.ebay.com/develop/api/buy/browse_api

## Architecture

- `../index.html` — native navigation, read-only `VintageDealBridge` and card-detail shortcut.
- `dashboard-template.js` — native Deals tab content.
- `dashboard.js` — client-side analytics, eBay links, manually tracked auctions and mid-market FX.
- `dashboard.css` — responsive styling that does not modify the existing Wishlist drag behavior.
- `scoring.js` — reusable minimal pure scoring utility from the initial prototype.

## QA checklist

1. Login → compare Wishlist count and order in Deals with Wishlist.
2. Change a Wishlist card's grade / first-edition setting, revisit Deals, and confirm pricing appropriately updates.
3. Check an LP listing priced in EUR against an LP reference; shipping must be included and USD conversion dated.
4. Leave shipping blank: the item should be flagged **needs review**, not treated as free shipping.
5. Enter suspicious title `proxy` / `creased`, or low seller rating: review flags must appear.
6. Reorder cards with iOS long-press in Wishlist, refresh, confirm order and Firebase persistence remain intact.
7. Reload app: manually tracked auctions should persist in the **same browser** only.
8. Check small viewport and iPad that the new controls do not overflow the card container.
