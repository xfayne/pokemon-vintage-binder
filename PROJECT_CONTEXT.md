# Pokémon Vintage Binder — Project Context

_Last reviewed: 2026-11-11. This document distinguishes repository-verified facts from conversation history and planned work._

## Purpose and collection preferences
Personal web app for collecting vintage Pokémon TCG cards (Base, Jungle, Fossil through Neo): catalog, owned cards, wishlist, visual binder, market values, deal discovery, and shipment tracking.
Collector preference: English vintage Unlimited, ungraded/raw cards; prioritize good value, reasonable shipping, authenticity, and enjoyable binder completion. 1st Edition remains an optional per-card setting.

## Repository and deployment
- Repository: https://github.com/xfayne/pokemon-vintage-binder
- GitHub Pages: https://xfayne.github.io/pokemon-vintage-binder/
- Main page: `index.html` (large single-page HTML markup and static no-JS catalog fallback).
- Styles: `css/app.css` (extracted 2026-11-09); `index.html` retains small inline no-JS fallback rules for standalone iOS Files/Quick Look previews.
- JavaScript: `js/catalog-data.js` (vintage SETS and OFFLINE_PACKS), `js/catalog-loader.js` (offline 1,252-card decoder and bootstrapping), `js/catalog-ui.js` (catalog search, filters, sorting, set sidebar and rendering), `js/shipments.js` (shipment tracking and editor controller), `js/collection-views.js` (binder and wishlist HTML rendering with dependency injection), `js/collection-drag.js` (pointer and long-press touch reordering), `js/collection-ordering.js` (shared Wishlist/binder order normalization and movement), `js/collection-state.js` (shared collection state, hydration, cloud-edit guard and save bridge), `js/collection-backup.js` (JSON backup/import, owned CSV and Wishlist clipboard export), `js/owned-cards.js` (owned cards sorting, market value and list rendering), `js/card-actions.js` (owned and Wishlist mutations, tombstones and purchase prices), `js/card-details.js` (card details modal and condition/1st Edition controls), `js/binder.js` (remaining collection controller), `js/market-prices.js` (TCGTracking), `js/public-reader.js` (shared binder view), and `js/firebase-cloud.js` (Firebase Authentication/Firestore ES module). Data, shipment logic, and collection views have been extracted incrementally without intentional behavior changes.
- CI: `tests/style-parity.mjs` and `tests/js-extraction-parity.mjs` cover visual and behavior parity in Chromium mobile/desktop. `tests/cloud-data-regression.mjs` exercises the real cloud/binder controllers against a fake in-memory Firebase SDK (server-first hydration, no local data fallback, writes/retries, revision ordering, JSON backup, CSV export, legacy import and public reader); eBay Worker unit tests also run in required `javascript-parity`. Both jobs are mandatory in the `main` Ruleset. No test uses live Google OAuth, production Firestore, real eBay credentials or 17TRACK; see `tests/SMOKE_CHECKLIST.md` for manual test-account procedures and limitations.
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
4. Wishlist: reorder by dragging the whole row/card, move to top, add/remove, condition-specific price where known. Live RTL search by name/set/number; sorting by persistent user priority (default) or condition-specific market price (ascending/descending); drag and move disabled while price-sorted. No sort/search persistence to Firestore.
5. Card details: condition and market price, Unlimited default, compact 1st Edition toggle, paid amount, mutually exclusive owned/wishlist actions, remove/move actions.
6. Deals: eBay search with condition-aware comparisons and ranked opportunities. Tapping a listing thumbnail opens a gallery with on-demand eBay photos, large viewer, thumbnails, buttons, keyboard/touch swipe and eBay link. The gallery AI button displays **explicitly fake sample results only**; no AI calls, image interpretation or grading.
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
- Worker `GET /health`, `POST /api/search`, `POST /api/item-condition`, and `POST /api/item-images`; secrets `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`. The images endpoint validates the eBay item ID and marketplace, requests Browse `GET /item/{id}` only when the gallery is opened, returns primary + additional HTTPS photo URLs, and never adds photo arrays to search results. The browser caches per-listing image arrays only for the lifetime of the page; missing or failed galleries fall back to the known listing thumbnail without invented images.
- Tests: `node --test ebay-worker/worker.test.mjs`.

## UI decisions from prior conversations
- Clean, compact, mobile-friendly UI; avoid repetitive explanatory copy.
- Fixed main navigation; tabs wide enough to scroll horizontally instead of shrinking.
- Compact owned/wishlist rows, prices only for selected condition; preserve full-row wishlist drag-and-drop.
- Card details actions grouped consistently; don't offer 'add to wishlist' when already owned (and vice versa).
- Wishlist overlay on binder uses subdued appearance; share mode is read-only.
- Remove unused Value tab; show collection totals in My Cards.
- Deal discovery should aggressively reject junk listings (including keyring/keychain) without falsely treating uncertain matches as confirmed deals.

## Interaction responsiveness (2026-11-13)
- Collection ownership/Wishlist taps preserve the mounted catalog card where possible. `VintageCatalogUI.refreshCard(id)` updates its buttons, a small confirmation effect, sidebar totals and collection subtitle instead of recreating the visible grid; ownership-dependent filters still use a full `renderCards()` to keep filtered results accurate.
- `VintageCardActions` continues immediate Firestore save/tombstone semantics, but drops the redundant `renderAll()` call after `save()`; `save()` still refreshes collection lists once. `VintageCardDetails.syncModalActions` updates ownership/Wishlist/move/purchase controls without replacing the open card image/dialog.
- Tab changes have a short entrance and instantly reset long page scroll (instead of slowly animating thousands of pixels); buttons, dialogs and expanded panels have subtle feedback. eBay scan activity and AI analysis display in-progress motion without staging fake results or creating new backend calls.
- New motion respects `prefers-reduced-motion: reduce` and uses light opacity/transform effects rather than animating large lists. Browser parity includes node-identity checks for catalog ownership taps and open card details to prevent reintroducing full rerenders.

## Layout stability and disclosure animation (2026-11-13)
- Catalog filtering and sorting now reconcile keyed card nodes, preserving <img> elements for cards that remain visible. Sidebar series buttons also update in place. The fast path for catalog edits/search updates live navigation counts without rebuilding hidden binder, Wishlist, owned and shipment lists; each view still renders fully on entry. The cloud snapshot and initial data hydration continue through existing server-first paths.
- Card-details media reserves a portrait 63:88 box before the full-size artwork loads; decoded images fade over the reserved background and failed requests retain the same footprint.
- Native catalog advanced filters, Deals advanced filters and binder placement <details> use a measured-height Web Animations API disclosure, including programmatic placement opening; reduced-motion visitors retain native immediate details toggling. The binder body has its own padded wrapper so the summary never jumps horizontally when expanded.
- Browser parity tests assert catalog art node identity across searches, stable modal photo geometry without network imagery, and expanding/collapsing panels on mobile/desktop.

## Image-stable Wishlist and binder reordering (2026-11-13)
- The Wishlist and 3×3 binder previously replaced entire list HTML after every reorder, causing card art to blink. The collection view renderer now reconciles rows by stable card identity, moving existing DOM nodes with image elements intact.
- The reconciliation refreshes rank labels, drag and move indices, button states, condition-based prices, binder ownership badges and wishlist overlay styling without detaching unchanged images. New/removed cards and page navigation remain supported.
- Playwright regression coverage verifies image identity and action index consistency when reordering Wishlist and binder cards in mobile/desktop layouts. Firestore ordering and persistence contracts remain unchanged.

## Modal ownership and navigation state (2026-11-13)
- Card details “יש לי” is filled only for owned cards; its neutral state means unowned. Both initial markup and in-place updates agree and expose accurate `aria-pressed`.
- The app's sticky tab pills keep the same mounted buttons and a white base background while a dark pseudo-element fades in/out on selection. Touch presses no longer scale the nav pills; this avoids flash from competing paint and transform transitions on iOS. Reduced-motion keeps immediate switching. No-JavaScript fallback presentation remains unchanged.
- Mobile/desktop browser regression verifies ownership states before and after taps and checks an actual intermediate nav fill during tab transitions.

## Cross-screen flicker / flow audit (2026-11-13)
- Audited client-side repaint paths across catalog, binder placement search, My Cards, Wishlist, Shipments, Deals, photo analysis and read-only binder. A repeated cause of image flicker was replacing large `innerHTML` lists on minor state changes.
- Shared `js/image-stable-dom.js` keyed DOM reconciliation preserves already-mounted image nodes and interactive controls across live data refreshes and reorders. Applied to binder search suggestions, Owned cards, shipments, shipment card picker and eBay Deals search results. Initial image and genuinely new/removed item rendering is unchanged. The existing Wishlist/binder pocket keyed reconciliation remains intact.
- Binder placement selection only changes selected classes and `aria-selected` on existing suggestions, never regenerating their images. Shipment tracking expands a persistent timeline inside a grid-height disclosure, keeping parcel rows and card thumbnails mounted while status/read counters change. Reduced-motion respects user preference.
- Regression tests cover selected/remaining image-node identity in binder search, shipment refresh/details, editor picker, owned filtering and Deals recomputations. No Firestore schema/Worker changes or production user-data mutation.

## Binder page relocation and reserved empty pockets (2026-11-13)
- The owner-only 3×3 binder editor can move the entire displayed page to any other page number. Pages are reordered as nine-pocket blocks; a partially filled final page is padded with reserved empty pockets whenever it moves before another page.
- An explicit empty pocket is persisted as a unique `__binder_empty__:<uuid>` string in the existing `binderOrder` array. Older collections/backups without markers remain unchanged; Firestore data shape and security rules do not need a migration. Normalization keeps marker entries while filtering invalid card IDs; tab counts still count only actual cards.
- Page relocation retains its compact number dialog. Empty-pocket creation is an option in the existing binder card-placement accordion (select “כיס ריק”, then page and slot); a reserved pocket renders a one-tap “בטל רווח” button directly inside the binder. There is no separate empty-pocket management button/dialog. Reserving a pocket inserts a gap (shifting following cards); cancelling it closes the gap. Moving a card into a reserved pocket swaps the gap to its previous position.
- Share documents keep pocket positions: the existing share-snapshot mapper converts reserved markers into `null` slots for the read-only viewer. No live user Firestore records are changed in tests. Tests cover page relocation, incomplete last pages, gap persistence and mocked authenticated mobile flows.
- Cloudflare Worker and public-reader schema are unchanged.

## Open questions / backlog
- The remaining `js/binder.js` IIFE coordinates UI modules; state/hydration, cloud-save notification, JSON backup/import, CSV and clipboard export have moved into `js/collection-state.js` and `js/collection-backup.js`; Firestore schema, Google login and persistence continue to live in `js/firebase-cloud.js`. Further decomposition should keep these interfaces stable and remain test-driven.

- Check live eBay API data and images on specific listings under real eBay Production credentials when available; browser/Worker CI use deterministic fixtures without production eBay requests. Cloudflare Workers Builds successfully deployed main commit `c76f58d` on 2026-11-11; individual real listing photo availability remains dependent on eBay.
- Confirm shipment unread-update indicator is implemented and persisted; prior discussion requested it.
- Historical price chart without storing long-term time-series in Firestore: design/data source not finalized.
- Review documentation drift: `ebay-worker/README.md` describes some older manual connection and auction-only flows, while `deal-finder/README.md` describes automatic Wishlist scanning and Buy It Now. Prefer current implementation over either document if they disagree.
- Validate Firestore data schema, security rules, sharing privacy, and 17TRACK Worker deployment before architectural changes.
- Keep a changelog or update this document after major changes.

## Development guidelines
- Edit `templates/index.template.html` for the UI shell or asset query strings and `templates/static-catalog.html` for the no-JS catalog; run `node scripts/build-index.mjs` to regenerate and commit `index.html`. CI runs `node scripts/build-index.mjs --check` to enforce exact reproduction. See `templates/README.md`. Never delete the no-JS/iOS Files static catalog or replace it with runtime fetches.
- Bump the query-string asset version in `templates/index.template.html` whenever changing externally loaded JavaScript (particularly `js/binder.js`), then regenerate `index.html` and update browser-test asset references in sync.
- Read relevant current source before editing; avoid regressing drag-and-drop, binder ordering, Firestore sync, login, and mobile layout.
- Prefer small focused changes and tests, especially around eBay parsing/filtering.
- Distinguish listing price from all-in price, and tentative match from verified card identity.
- Never claim a feature is deployed solely because it was requested in chat.

## Scoped single-card Deals search (2026-11-11)
- Card details has a “מציאות” action for every catalog card, including cards absent from the Wishlist or owned cards. Set/number/rarity form one compact row and collection actions sit beside the card name.
- This opens the existing Deals tab in single-card mode, reusing the Worker search, eBay identity checks, shipping and condition-aware market comparisons, sorting, filters, and gallery. Only that card ID is submitted for scanning.
- The Deals tab has explicit actions to return to the originating card details or switch to the regular Wishlist scan. Standard Deals navigation still means Wishlist search.
- The client keeps separate in-memory scan snapshots per Wishlist/card so results and comparison grades do not mix; mode changes invalidate in-flight search and enrichment responses. Firestore and Worker endpoints are untouched.

## AI condition grading — implementation in PR #57 (2026-11-11)
- Design source of truth: [docs/AI_CONDITION_ANALYSIS_PLAN.md](docs/AI_CONDITION_ANALYSIS_PLAN.md). Update this plan **before any implementation PR** and document major architectural decisions here.
- **New portability requirement:** shared grading core takes validated photos + optional card metadata and returns condition, evidence and image-localized defects independent of eBay. Source adapter retrieves eBay photos today; future owned-card adapter accepts private user photos through a secure upload mechanism. Canonical Firestore records in `users/{uid}/conditionAnalyses/{analysisKey}` keyed by namespaced source identity; do not create separate `listingAnalyses` collection. Keep provider adapter lightweight, no LangChain by default.
- User-triggered only via existing gallery AI demo button; model returns a best-effort NM/LP/MP/HP/DMG grade plus percent confidence and a five-grade distribution whenever a usable card image is available. Missing views reduce certainty instead of suppressing the grade; true lack of imagery is a clear error.
- Cache analyses **per user and namespaced image source** at `users/{uid}/conditionAnalyses/{analysisKey}`, separate from collection progress. Reuse in future Wishlist/card-scoped Deals searches without automatic re-inference, preserving manual overrides and warnings for uncertain grades.
- Worker `/api/analyze-condition` verifies Firebase ID JWT and the owner email (`AI_OWNER_EMAIL`, falling back to `TRACK17_OWNER_EMAIL`). Retrieves image bytes from `i.ebayimg.com` only, bounds input size/photo count, and calls `gemini-3.8-flash` via `GEMINI_API_KEY` secret. Core `ebay-worker/card-condition.js` is independent of eBay and Firestore; grade/defect coordinates are normalized. Photo URL-set fingerprint flags stale saved analyses.
- Grading inputs are **listing photos only**, not the back-of-card example charts shared during planning. Written, versioned rubric: [docs/CARD_CONDITION_RUBRIC.md](docs/CARD_CONDITION_RUBRIC.md). Initial model choice: **Gemini 3.8 Flash**, based on official multimodal/grounding documentation rather than a card-specific benchmark. Show model-returned defect bounding boxes on the original eBay photos; best-effort grade remains mandatory even if a defect cannot be localized precisely. Skip the large upfront multi-provider benchmark; inspect a few real cases after implementation. Keep a small provider adapter; LangChain is optional.
- PR #57 replaces the demo in `deal-finder/live.js` with on-demand analysis, result persistence and clickable flaw overlays. `js/firebase-cloud.js` exposes private condition-analysis cache functions. Tests `ebay-worker/card-condition.test.mjs` and `tests/deals-ui-regression.mjs` mock provider/Firestore; no real user data is changed.
- **External release prerequisite:** the current deployed Firestore subcollection rules are not accessible through the GitHub/Cloudflare connections; [docs/FIRESTORE_CONDITION_RULES.md](docs/FIRESTORE_CONDITION_RULES.md) provides a safe append-only owner rule. Until rules are published and real owner flow tested, saved results may fail with `permission-denied` (UI keeps result and offers retry). The Cloudflare preview-build failure is tracked separately under #39; both mandatory GitHub parity checks control merge.

## Standalone AI condition analysis tab (implementation branch, 2026-11-12)
- Planned and implemented on a dedicated feature branch; do not imply production deployment until tests pass, PR is merged, and Worker auto-deploy is confirmed.
- The new `analysis` navigation view supports two image sources: smartphone camera / photo picker (up to eight resized JPEG files) and an HTTPS eBay listing URL, including supported `ebay.io` and `ebay.us` sharing links.
- `ebay-worker/standalone-condition.js` adds authenticated `POST /api/analyze-upload` (multipart image bytes only, bounded counts, sizes and magic-byte checks) and `POST /api/resolve-ebay-link` (strict eBay HTTPS hostname and redirect allowlist, then Browse get_item_by_legacy_id). Both use existing Firebase owner allowlist; resolution and photo selection must never call paid Gemini.
- Both paths share `ebay-worker/card-condition.js` and the configured `gemini-3.8-flash` model, evidence schema, normalized defect rectangles and explicit reanalysis UX. No alternate automatic provider/model fallback.
- eBay analyses still use the existing private Firestore `conditionAnalyses` keyed by marketplace/Browse item ID. Personal uploaded photo bytes and results are **not persisted** in this first version; results remain in current-page memory. This intentionally avoids any change to existing deployed Firestore Rules, public binder sharing, and user collection data.
- Main shell changes must be made in `templates/index.template.html` then rebuilt to `index.html`. Browser tests cover iOS-sized and desktop viewports, source switching, upload/cached eBay results, and retained catalog/navigation parity. Worker tests cover denied anonymous access, image validation, safe link resolution and explicit inference.


## Display currency (2026-11-13)
- Account menu allows ILS (default), USD or EUR display, persisted per device under `pokemon-vintage-display-currency`. This preference is presentation-only and is not written to Firestore. Card purchase-cost editing retains its explicitly selected transaction currency.
- `js/currency.js` is the sole FX client. It fetches the latest USD-based central-bank reference rates from Frankfurter on page load, shows the reference date, and needs no API key or Cloudflare Worker change. When a conversion is unavailable, the UI shows `—` rather than reverting silently to the listing currency or fabricating rates.
- eBay bid, international shipping, all-in amounts, market reference prices, and advanced filter limit labels display in the selected currency. Comparison, filters and sorting retain their existing USD numeric basis. Owned-card totals, card-details market prices, and Wishlist prices also follow the selected display currency; manual purchase entry stays in the currency recorded by the user.
- `tests/currency.test.mjs` validates rate calculations, local preference persistence and failure behavior. Display uses reference exchange rates, not guaranteed payment-provider rates.

## Recommended Deals sorting: unknown card condition (2026-11-13)
- Fixed a grouping bug confirmed by an actual user screenshot: an eBay listing with strong **identity** matching but unknown **condition** was compared using fallback MP and ranked in the provisional/unknown group (3) even when its all-in price was 593% **above** that MP benchmark. A seller-declared LP listing only 42% above its benchmark was in the overpriced group (4), so it incorrectly appeared lower.
- Recommended sorting now places all strong-identity listings with a known all-in, nonpositive discount (including assumed-MP comparisons) into the overpriced group (4), sorted by the actual percentage gap. Unknown-condition listings with a tentative positive gap remain in the provisional group (3), not trusted-discount groups. Identity-review listings still remain last.
- The one-render stability behavior for manual grade changes/AI remains unchanged: it protects the tapped row only for the immediate interaction and permits subsequent sorting.
- Regression fixture `tests/deals-ui-regression.mjs` reproduces the actual seller-LP +42% vs unknown-MP +593% comparison, including grade labels, in the browser. No changes to Worker, Firestore, or currency conversions.
