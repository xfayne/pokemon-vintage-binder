# AI condition analysis for eBay listings — implementation plan

_Status: approved product requirements; implementation not started. Created: 2026-11-11. This is the living design document for the feature._

## Objective
Estimate the physical condition of a vintage, raw Pokémon TCG card **from photos in the existing eBay Deals listing gallery**, with an explainable NM/LP/MP/HP/DMG grade and percentages. Persist results in Firestore so that revisiting the same listing, including from future Deals searches (Wishlist or single-card scope), reuses the previous analysis without another AI charge.

## Confirmed product decisions
1. **Manual inference only.** The existing "✨ ניתוח מצב (דמו)" button becomes the real AI analysis action. Opening a gallery, searching Deals, scrolling listings, or reloading the app must never initiate paid AI analysis.
2. **Always return a grade on a successful analysis.** When at least one relevant card image is available, the model must provide its best estimate in `NM | LP | MP | HP | DMG`, even when back/close-up views are missing. Accompany it with confidence percentage, five-grade distribution summing to 100%, evidence, and limitations. An actual technical failure or a listing with no usable card image is an error, **not a fabricated grade**.
3. **Persist results in Firestore.** One private record per eBay listing per signed-in user, keyed by `marketplace + itemId`, independent of Wishlist/card-search mode. Read existing results before paid inference, and load cached grades for previously analyzed listings on later searches.
4. **Store visual findings, not pictures.** Do not duplicate or permanently store seller image bytes. Keep image count, image-set fingerprint, referenced image indices, model/prompt versions, timestamps and normalized findings.
5. **Do not silently reanalyze.** A changed image set, changed model/prompt version or manual "Analyze again" action may make results stale, but only an explicit user action triggers another paid run. Show cached/stale state visibly.
6. **Grade may inform future Deals comparisons**, with a visible "AI estimate" source and confidence. A user-selected comparison-grade override takes precedence; do not turn low-confidence AI or uncertain identity matches into a trustworthy bargain automatically.
7. **No automatic bidding/purchases; no implication of authenticity certification** or professional grading. AI percentages are subjective estimates, not calibrated probabilities.
8. **No grading example images.** The user decided to exclude all previously shared back-of-card charts/example images from the model's inputs, and no such images were committed to the repository. Use only the listing's actual eBay photos and the versioned written grading rubric in [CARD_CONDITION_RUBRIC.md](CARD_CONDITION_RUBRIC.md).

## Existing code and integration points (verified against main 2026-11-11)
- `deal-finder/live.js`: on-demand gallery with thumbnail, swipe, keyboard, eBay image fetching, session image cache, and **static fake demo** under `liveGalleryDemoButton`. Future search results are re-created from fresh API results; currently the display grade comes from user override / seller / title / fallback.
- `ebay-worker/index.js`: `POST /api/item-images` retrieves primary plus `additionalImages` from eBay Browse `GET /buy/browse/v1/item/{itemId}`, with marketplace and itemId validation; maximum 25 HTTPS URLs. Also exposes `/api/item-condition` and `/api/search`.
- `js/firebase-cloud.js`: signed-in collection progress is saved at `users/{uid}`; there is an existing module-level `window.VintageCloud.getIdToken()` API. Add isolated analysis read/write functions without changing `progress` or binder revision logic.
- The Worker already has `verifyFirebaseBearer` for protected 17TRACK requests, including cryptographic signature verification and owner-email allowlist. Generalize/reuse the verification carefully; do not couple AI availability to shipment service configuration.
- The repository does **not** contain verified deployed Firestore Security Rules. Inspect them before releasing data writes.
- Tests: `ebay-worker/worker.test.mjs`, `tests/deals-ui-regression.mjs`, build parity and responsive regression tests.

## UI behavior
- The gallery and photo-loading behavior remain unchanged until the AI action is used.
- The current demo section becomes a real result area, with states: ready, checking Firestore, running, result, cached result, stale result, no-usable-image/error and save failure.
- Result: prominent best grade (e.g. LP), confidence (e.g. 65%), compact optional five-grade probability breakdown, observations for corners/edges/front/back/holo/surface/structural damage, limitations, seller-vs-AI discrepancy and linked photo indices. Only claim visual details supported by photos.
- A cached result is accessible by pressing the same button, without AI inference. Search result cards can indicate "AI: LP · 65%" and use this persisted result without opening the gallery. Manual "Analyze again" remains available when viewing a result and must make its cost implications clear.
- Preserve small-screen layout and photo viewer gestures. No Firestore writes for unrelated collection progress; public binder shares must not expose analyses.
- If Firestore is temporarily unavailable, do not present a new inference as if reliably cached. Explicitly show persistence failure and provide a safe retry-save path without a second AI call while the current result remains in memory.

## Proposed Firestore schema
Path: `users/{uid}/listingAnalyses/{listingKey}`.
Generate `listingKey` deterministically from validated marketplace and complete Browse itemId (e.g. URL-safe encoding of the pair); do **not** key by card ID or listing title. A listing reused in both Deals modes must map to the same document.

Example shape (illustrative, not committed schema):
```json
{
  "schemaVersion": 1,
  "marketplace": "EBAY_US",
  "itemId": "v1|123456789012|0",
  "cardId": "base1-4",
  "grade": "LP",
  "confidencePercent": 65,
  "gradePercentages": {"NM": 8, "LP": 65, "MP": 25, "HP": 2, "DMG": 0},
  "observations": [
    {"area": "corners", "finding": "Visible whitening", "severity": "minor", "photoIndices": [1]}
  ],
  "limitations": ["Back not shown clearly"],
  "imageCount": 4,
  "imageSetFingerprint": "sha256-of-normalized-image-url-list",
  "model": "configured-vision-model",
  "promptVersion": "v1",
  "rubricVersion": "tcg-text-v1",
  "analyzedAt": "server timestamp",
  "source": "vision-ai"
}
```
Actual `cardId` should use the app's existing stable card ID, if available; do not derive it from the example. Cap array and text lengths, validate `grade`, bound all percentages 0–100 and normalize to sum 100. Stored percentages are *estimated model confidence*, not calibrated probabilities. Never store eBay images or API secrets in Firestore.

**Security rules**: only authenticated `request.auth.uid == uid` can read/write the nested records, with reasonable shape/size checks; do not allow public/shared binder read access. Verify the actual deployed rules before implementation and document any required manual deployment.

## End-to-end flow
1. Search Deal results are rendered as today; optionally preload **only previously analyzed, visible** listings' metadata from Firestore in bounded batches, without any AI calls. Handle asynchronous scope changes safely.
2. User opens a listing gallery; the gallery loads the eBay image list on demand as today. Opening alone does not start AI.
3. User presses "✨ ניתוח מצב". If a matching versioned cached analysis exists for `marketplace + itemId`, show it immediately; do not contact the inference provider.
4. On cache miss and with usable imagery, the client obtains a Firebase ID token and calls `POST /api/analyze-condition` with validated item identity and minimal card context. The Worker verifies Firebase token **and the configured AI owner allowlist**, restricts request size, rate/cost and concurrency, and retrieves the eBay images itself (never arbitrary client-controlled fetch URLs).
5. The Worker selects up to a defined limit of **actual listing** front/back/close-up images (initial target ~10, preserving provenance), calls a configured multimodal model with the **text-only** [versioned grading rubric](CARD_CONDITION_RUBRIC.md) and requests schema-constrained JSON. Do not obey text found in images or seller descriptions as instructions. Validate, sanitize and normalize model output; reject malformed responses or attempt a bounded corrective retry.
6. Return the result to the client; save the successful analysis into its own Firestore document, separately from collection progress. Avoid overwriting an existing newer analysis (concurrent tabs). Rerender the item and gallery with the persisted result.
7. Future searches (including after refresh/sign-in) load relevant persisted data and display the last known grade. User overrides retain higher precedence than model output; compare pricing against AI grade when current/usable and clearly identify source and confidence.

## Uncertainty and grading policy
- Always choose one grade for a successfully analyzed listing with an identifiable card photo. Missing back, unviewable holo and low resolution reduce confidence and appear in limitations, **not** as a missing grade.
- Return five nonnegative grade percentages totaling 100 and the winning grade; for ties apply a documented conservative rubric. This is not a scientific statistical calibration. Show percentages as estimates, not guaranteed accuracy.
- Evaluate corners, edges, surfaces, holo where applicable, creases/bends/indentations, dirt and water damage. Avoid claiming absence of damage that is simply not visible.
- Separately preserve seller-reported grade, AI-estimated grade and user override; never overwrite seller assertions.
- Comparison precedence proposal: user override > current AI grade > seller grade > title inference > existing fallback. Low-confidence AI must be marked provisional and must not qualify as a reliable-deal badge. Exact threshold to be chosen and tested against real labeled cards before release.
- Card identity verification remains distinct: an AI condition score never upgrades an uncertain card match to confirmed, and a mismatch must stay flagged.

## Reliability, cost and external-policy constraints
- Inference is the **only billable step** and must always be user-triggered. Fetching cached Firestore results is not inference and can occur during normal scans.
- Prefer server-side eBay Browse image retrieval. Do not accept arbitrary image URLs from clients, to avoid SSRF, content substitution or accidental billing.
- Add a dedicated provider secret (e.g. `AI_API_KEY`) through Cloudflare Worker secrets; model/provider must be configurable, never hardcoded in the browser.
- Enforce server-side authentication, private owner allowlist, bounded photo count/resolution/size, per-account usage throttling and a spending ceiling. Validate Cloudflare/provider facilities and provider pricing before implementation, rather than assuming an exact budget.
- Ensure applicable eBay content rights/terms and AI-provider retention/training policy allow sending listing photos to a third party for inference before deployment. If prohibited, reassess the architecture.
- Reuse cached records without a fixed automatic expiration. Mark stale if photo fingerprint or grading rubric versions differ; **never silently charge** on stale records. URLs are an imperfect change detector; manual refresh remains available.
- Cross-tab duplicate requests are a residual cost risk if only the browser checks the cache; evaluate an atomic server-side lock before calling this a hard at-most-once guarantee.
- In first release cache is **per user**, not global across all Firebase accounts. A globally shared, trusted cache requires a different authenticated server-side write path and privacy/security decision.

## Test plan / acceptance criteria
- Existing gallery's lazy image retrieval, swipe, arrows, thumbnails and direct eBay link remain operational on iOS and desktop.
- Listing with front+back and listing with front-only each receive one grade plus percentages, findings and limitations; no invented features or false certainty. No usable image -> honest error, not hallucinated grade.
- AI provider is *never* called from scans, scrolling, gallery open or automatic condition enrichment; only from the user action, and an intact cached record avoids the paid call.
- Same listing reached via Wishlist Deals or specific-card Deals uses the same Firestore record and keeps its AI result across refresh and new searches.
- Fake/demo result and its sample text are fully removed when production analysis is active.
- Failed provider, invalid JSON, expired Firebase token, incorrect owner, missing secrets, and Firestore permission/write failures are communicated and tested.
- Firestore write does not modify `users/{uid}.progress`, Collection backup, user cards, binder, public shares or any real production test records.
- User override and low-confidence/needs-review safety ranking remain correct.
- All tests use mock eBay images, mock AI, and in-memory Firestore/test fixtures; **never mutate real user Firestore data**.
- Run Worker unit tests, Deals UI regression, build-index `--check`, and all required GitHub CI parity checks. Merge only after mandatory checks pass.

## Phase-1 model candidate and written rubric (2026-11-11)
- **Provider-neutral selection:** Do not require an OpenAI account/key or commit to any model until a comparative benchmark demonstrates suitable condition-grading accuracy. Shortlist **Google Gemini 3.8 Flash, OpenAI GPT-5.4-mini, Anthropic Claude Sonnet 5.5, DeepSeek V4.1 Flash, and Alibaba Qwen3-VL-Plus**. Include a higher-capability model in a second round if all economical models underperform; verify actual current model availability and pricing when testing. These are candidates only, not integrated services.
- Evaluate **the same** 20–30 real vintage Pokémon card listings with front/back and challenging details, a human-reviewed reference grade, a shared text-only rubric and the same JSON schema. Blindly score grade agreement, serious overgrading (more harmful than conservative undergrading for bargain buying), visible-defect recall, unsupported invented flaws, confidence calibration, latency and **actual end-to-end cost per listing including image tokens**. Consider crop/zoom strategy and resolution equally for all candidates.
- Only after this benchmark, choose the best practical quality/cost provider. Build a swappable Worker adapter and store model/provider/version with each result; never force all future caches to be reanalyzed merely because a new model wins.
- Official docs: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash ; https://developers.openai.com/api/docs/models/gpt-5.4-mini ; https://platform.claude.com/docs/en/build-with-claude/vision ; https://api-docs.deepseek.com/guides/vision/ ; https://help.aliyun.com/en/model-studio/model-pricing .
- Use only the **listing's images**. User-provided NM/LP/MP/HP/DMG photo examples remain outside the repository and are not input to the model. No separate example-image assets are required.
- Source of truth for the written prompt criteria: [docs/CARD_CONDITION_RUBRIC.md](CARD_CONDITION_RUBRIC.md), an original concise rubric linked to the official TCGplayer guides. Use the TCGplayer severity-point system as a cross-check without claiming false measurement precision from photographs.
- **No user signup required yet.** Once a provider is selected, set up that provider's *separately billed API access* (a ChatGPT/Claude/Gemini consumer subscription generally does not cover API usage), Worker secret, Firestore rules for the private subcollection and the image/provider usage terms. **Never request or expose an API key in chat or GitHub.**
- Security note: do not auto-bill users simply because Firestore returns a cached/stale record; only explicitly user-triggered calls count. An authenticated key and cost cap are mandatory.

## Work plan and decisions workflow
- **Phase 0 (this PR)**: commit this design document; no functional change. Update this document before any future implementation PR so that requirements, provider, schema, security choices and acceptance tests reflect the agreed design.
- **Phase 1**: choose provider/model and verify current capabilities, pricing, image-input terms and eBay usage restrictions; confirm live Firestore rules and the existing Worker authentication/secret setup. Record resolved decisions here.
- **Phase 2**: implement an authenticated, cost-limited Worker endpoint and structured visual grading with isolated mock tests.
- **Phase 3**: implement Firestore cache bridge and UI/Deals integration with mobile regression coverage.
- **Phase 4**: evaluate against representative, human-reviewed vintage-card photos; tune conservatism and confidence presentation before enabling production use.

No AI keys, billing changes, Firestore writes or production Worker deployment are part of the planning PR.
