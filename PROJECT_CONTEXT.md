# Pokémon Vintage Binder — Project Context

_Last reviewed: 2026-11-09. This document distinguishes repository-verified facts from conversation history and planned work._

## Purpose and collection preferences
Personal web app for collecting vintage Pokémon TCG cards (Base, Jungle, Fossil through Neo): catalog, owned cards, wishlist, visual binder, market values, deal discovery, and shipment tracking.
Collector preference: English vintage Unlimited, ungraded/raw cards; prioritize good value, reasonable shipping, authenticity, and enjoyable binder completion. 1st Edition remains an optional per-card setting.

## Repository and deployment
- Repository: https://github.com/xfayne/pokemon-vintage-binder
- GitHub Pages: https://xfayne.github.io/pokemon-vintage-binder/
- Main page: `index.html` (large single-page HTML markup and static no-JS catalog fallback).
- Styles: `css/app.css` (extracted 2026-11-09); `index.html` retains small inline no-JS fallback rules for standalone iOS Files/Quick Look previews.
- JavaScript: `js/catalog-data.js` (vintage SETS and OFFLINE_PACKS), `js/shipments.js` (shipment tracking and editor controller), `js/collection-views.js` (binder and wishlist HTML rendering with dependency injection), `js/collection-drag.js` (pointer and long-press touch reordering), `js/collection-ordering.js` (shared Wishlist/binder order normalization and movement), `js/owned-cards.js` (owned cards sorting, market value and list rendering), `js/binder.js` (remaining collection controller), `js/market-prices.js` (TCGTracking), `js/public-reader.js` (shared binder view), and `js/firebase-cloud.js` (Firebase Authentication/Firestore ES module). Data, shipment logic, and collection views have been extracted incrementally without intentional behavior changes.
- CI: `tests/style-parity.mjs` and `tests/js-extraction-parity.mjs` run Chromium mobile/desktop smoke/parity tests via `.github/workflows/`. Worker-specific tests exist separately. Current browser tests compare baseline-vs-branch behavior, including owned-card sorting, pricing totals and search, shipment editing, Wishlist move-to-top, binder reordering, long-press touch and pointer drag, legacy duplicate/unknown order normalization, and Wishlist overlay. They use an offline authorization stub and do **not** execute authenticated Firestore writes or live 17TRACK calls.
- `deal-finder/`: separate deal-discovery UI, styles, scoring and documentation. `scoring.js` and `dashboard-template.js` are documented as historical/not currently loaded.
- `ebay-worker/`: Cloudflare Worker backend, Wrangler config, tests, documentation.
- `assets/`: static assets including Ancient Mew image.
- Worker URL: https://pokemon-vintage-ebay-deals.xfayne.workers.dev
- Google sign-in via Firebase Authentication; Firestore is the intended single source of truth for user collection data (from project conversations). Confirm exact collection/schema in code before modifying.
- Never put API credentials in client code, documentation, GitHub, or chat. eBay secrets belong in Cloudflare Worker secrets.

## Product areas (from project history)
1. Catalog: vintage card coverage through Neo, external card art.
2. My Cards: owned collection, condition, paid price, market value, count/holo totals, sorting and Excel export.
3. My Binder: 3x3 pages, rearrangement, wishlist overlay, read-only share view, landscape two-page layout except cover.
4. Wishlist: reorder by dragging the whole row/card, move to top, add/remove, condition-specific price where known.
5. Card details: condition and market price, Unlimited default, compact 1st Edition toggle, paid amount, mutually exclusive owned/wishlist actions, remove/move actions.
6. Deals: eBay search with condition-aware comparisons and ranked opportunities.
7. Shipments: 17TRACK-backed shipment status and recent update/date, up to six associated cards per shipment, Cloudflare Worker/KV integration discussed in prior work.
8. User menu: Google sign-in, backup/import.

## Verified eBay deal-finder design (from deal-finder/README.md, 2026-11-09)
- Live eBay discovery against the signed-in user's Wishlist; sequential batches of four, progress, pause/resume, manual restart.
- Results reused for 30 minutes in the same open page; no scheduled background scanning.
- Auctions and Buy It Now; marketplace coverage and shipping data are subject to actual eBay API responses.
- Default recommended sort avoids promoting far-off auctions solely for low starting bids. Advanced filters include listing type, ending horizon, shipping, all-in price, discount and condition; 40 results rendered at a time.
- Condition comparison NM/LP/MP/HP/DMG; grades from eBay when available, otherwise labeled inference/fallback, with manual override.
- Three-layer identity checks: obvious junk rejected; strong matches vs needs-review; additional item-detail lookup for limited top candidates. Review-needed items are not shown as reliable discounts.
- Seller-provided listing text/aspects are untrusted. No image-based authentication or condition grading; no auto bidding/purchasing.
- Unknown shipping is not free. No fake sample auctions.
- Worker `GET /health` and `POST /api/search`; secrets `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.
- Tests: `node --test ebay-worker/worker.test.mjs`.

## UI decisions from prior conversations
- Clean, compact, mobile-friendly UI; avoid repetitive explanatory copy.
- Fixed main navigation; tabs wide enough to scroll horizontally instead of shrinking.
- Compact owned/wishlist rows, prices only for selected condition; preserve full-row wishlist drag-and-drop.
- Card details actions grouped consistently; don't offer 'add to wishlist' when already owned (and vice versa).
- Wishlist overlay on binder uses subdued appearance; share mode is read-only.
- Remove unused Value tab; show collection totals in My Cards.
- Deal discovery should aggressively reject junk listings (including keyring/keychain) without falsely treating uncertain matches as confirmed deals.

## Open questions / backlog
- The remaining `js/binder.js` IIFE (~34KB) still needs careful decomposition into feature modules, with explicit shared state/interfaces and tests first; moving the four scripts out of HTML is only phase 2A.

- Confirm deployed UI and actual live API/Worker behavior against main branch, especially whether eBay Production credentials are enabled.
- Confirm shipment unread-update indicator is implemented and persisted; prior discussion requested it.
- Historical price chart without storing long-term time-series in Firestore: design/data source not finalized.
- Review documentation drift: `ebay-worker/README.md` describes some older manual connection and auction-only flows, while `deal-finder/README.md` describes automatic Wishlist scanning and Buy It Now. Prefer current implementation over either document if they disagree.
- Validate Firestore data schema, security rules, sharing privacy, and 17TRACK Worker deployment before architectural changes.
- Keep a changelog or update this document after major changes.

## Development guidelines
- Read relevant current source before editing; avoid regressing drag-and-drop, binder ordering, Firestore sync, login, and mobile layout.
- Prefer small focused changes and tests, especially around eBay parsing/filtering.
- Distinguish listing price from all-in price, and tentative match from verified card identity.
- Never claim a feature is deployed solely because it was requested in chat.
