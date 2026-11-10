# Pokémon Vintage Binder — regression and release checklist

The checks below are deliberately separated into CI-safe automated tests and
optional **manual** end-to-end checks. Never test imports, edits or deletions on
the owner's real Firestore collection.

## Automated checks (run on every pull request)

- **javascript-parity** (required): source/module wiring and Chromium behavior
  compared with the baseline on 390px mobile and 1440px desktop; catalog,
  search, owned cards, modal metadata, Wishlist/binder drag and ordering,
  shipment editor, and public UI initialization.
- **cloud-data-regression** (inside javascript-parity, required): actual
  \`firebase-cloud.js\`/binder controllers with a fake in-memory Firebase SDK.
  Tests server-first loading, cloud saves, revision guards against stale
  snapshots, failed-write retry, sign-out/sign-in, malformed and legacy backup
  imports, JSON round trips (including shipments), CSV export, read failure
  lockout, and public read-only share-link rendering/navigation.
- **eBay Worker tests** (inside javascript-parity, required): Node tests using
  mocked upstream eBay APIs; origin controls, auction/Buy It Now parsing,
  shipping, deduplication, card-number/edition/condition matching, spam and
  replica filtering, and seller metadata. No live eBay credentials required.
- **style-parity** (required): Chromium visual comparison on mobile and
  desktop, plus the no-JavaScript/offline catalog fallback.

Both required GitHub Actions checks are named \`javascript-parity\` and
\`style-parity\`. The main branch ruleset requires both to pass and requires
the PR to be up-to-date before merging.

## Manual smoke checks before a significant release (test account only)

Use a **disposable Firebase test user/collection** with no real card data.
The production user collection must not be touched.

1. On mobile Safari, sign in with Google. Add a card, condition, paid amount and
   edition. Refresh/reopen and verify they are still saved.
2. Add two Wishlist cards and two owned cards; drag Wishlist cards using the
   whole row and reorder binder slots. Reopen on a second device (or new session)
   and compare the order. Owned and Wishlist must remain mutually exclusive.
3. Download a JSON backup in the test account. Import it back only into the
   disposable collection. Check conditions, prices, sort order, linked shipments
   and wishlist/tombstones; export CSV and inspect it in Excel or Numbers.
4. Open the public binder sharing link in a private browser session (signed
   out). Confirm card order and wish overlays; verify that private notes and
   purchase amounts are not visible. Swipe/next/previous on mobile and turn
   pages in landscape.
5. In Deals, run a search against the configured Worker: verify a live listing
   opens the expected eBay destination, shipping/condition handling and filters,
   and the disconnected/error UI. This requires working external credentials.
6. In Shipments, inspect last status/date, an existing tracking event and the
   unread counter; check expected behavior if 17TRACK is unavailable.
7. Verify main navigation sticks on a long mobile page, catalog scrolls, and
   all scripts load after a GitHub Pages deployment (cache-busted URLs).

## Limitations / non-claims

- Automated cloud coverage uses a mock, **not** a real Google OAuth popup,
  Firestore network, security rules, transaction races across devices, or a
  Firebase Emulator instance. These require their own integration environment.
- Automated eBay coverage mocks upstream responses. It does not prove the
  seller listing/Worker credential service or 17TRACK is available today.
- Production user data and credentials are not used in CI.
- The manual checks above are documented procedures, **not** a claim that a
  real test-account run was performed. If a release changes cloud permissions,
  upstream APIs or authentication, these checks should be executed before
  shipping.

Related: #14, #31, #32 and #33.
