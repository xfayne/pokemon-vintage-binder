# Pokémon Deals tab (work in progress)

The existing app is a single-file, static Hebrew binder in `index.html`, backed by Firebase. **Deals is the fifth tab in the existing navigation**, alongside Catalog, My Cards, Binder and Wishlist. This implementation intentionally does not create a second site or require separate login.

## What works now
- The Deals view is native to `index.html`. It reads `state.wishOrder`, `state.wish` and card catalog data that are already synchronized from Firebase into the existing app.
- Cards appear in the same priority order as Wishlist, and search filters by card name, set or collector number.
- Each row links to eBay auction searches: a precise query with collector number, and a broad query that can surface overlooked listings.
- Shows condition, Unlimited/1st Edition choice, and any condition-specific USD market reference already available in the binder.
- Deals is read-only and doesn't modify Firebase, drag-and-drop logic, or wishlist ranking.
- Prices are market references, **not verified prices of current eBay listings**. Unknown prices stay unknown.

## Not built yet
- Live eBay API listing retrieval and automatic result ranking.
- Combining live listing prices with Israel shipping, currency exchange and taxes.
- Automatic condition/printing verification from listing photos.
- Deal alerts and saved searches.

Live eBay API credentials must stay on a backend/serverless proxy, never in the public static page.
The existing `deal-finder/scoring.js` helper provides condition-aware discount math and will be used by the future listing integration.

## Manual smoke test before merging
1. On a branch deployment, sign in with Google and check that the existing Wishlist is populated.
2. Click the fifth navigation tab "🔎 מציאות", and verify the cards follow Wishlist order.
3. Search for a name or set; open both eBay links and verify auction search queries.
4. Change a wishlist position or mark a card as owned, then switch back to Deals; the list should update.
5. Drag a wishlist card by its whole rectangle on mobile and ensure the existing behavior works.
6. Confirm signed-out users see an empty state and that the Deals screen does not write to Firebase.
7. Verify navigation fit and sticky header on iPhone-width screens.

**Do not merge without browser smoke-testing** the large existing `index.html` on the branch deployment.
