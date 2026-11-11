# Reusable AI card-condition analysis — implementation plan

_Status: implementation in PR #57 (2026-11-11); mocked CI tests required, real owner-account / Gemini end-to-end validation and deployed Firestore rules still pending. Created: 2026-11-11. This is the living design document for the feature._

## Objective
Estimate the physical condition of a vintage, raw Pokémon TCG card from a set of photos, with an explainable NM/LP/MP/HP/DMG grade, confidence percentages, and approximate on-image defect locations. **First consumer: the existing eBay Deals listing gallery**; future consumers may analyze photos of the user's own cards without changing the grading engine. Persist results in Firestore so revisiting the same source/photo set reuses the previous result without another inference call.

## Confirmed product decisions
1. **Manual inference only.** The existing "✨ ניתוח מצב (דמו)" button becomes the real AI analysis action. Opening a gallery, searching Deals, scrolling listings, or reloading the app must never initiate paid AI analysis.
2. **Always return a grade on a successful analysis.** When at least one relevant card image is available, the model must provide its best estimate in `NM | LP | MP | HP | DMG`, even when back/close-up views are missing. Accompany it with confidence percentage, five-grade distribution summing to 100%, evidence, and limitations. An actual technical failure or a listing with no usable card image is an error, **not a fabricated grade**.
3. **Persist results in Firestore.** One private analysis record per authenticated user and **source-specific identity** (eBay: marketplace + itemId; future owned card: stable card identifier + photo-set version). Wishlist and single-card Deals resolve to the same eBay record. Read cache before inference; future photo sources will use the same analysis schema and different source adapters.
4. **Store visual findings, not pictures.** Do not duplicate or permanently store eBay seller image bytes. Keep source identity, image count, photo-set fingerprint, referenced image indices, model/prompt versions, timestamps and normalized findings. Future user-owned photos may require a separate private upload/storage flow; it is outside the initial eBay scope.
5. **Do not silently reanalyze.** A changed image set, changed model/prompt version or manual "Analyze again" action may make results stale, but only an explicit user action triggers another paid run. Show cached/stale state visibly.
6. **Grade may inform future Deals comparisons**, with a visible "AI estimate" source and confidence. A user-selected comparison-grade override takes precedence; do not turn low-confidence AI or uncertain identity matches into a trustworthy bargain automatically.
7. **No automatic bidding/purchases; no implication of authenticity certification** or professional grading. AI percentages are subjective estimates, not calibrated probabilities.
8. **No grading example images.** The user decided to exclude all previously shared back-of-card charts/example images from the model's inputs, and no such images were committed to the repository. Use only the **target card's actual photos** (currently eBay listing images; later, user-provided images) and the versioned written grading rubric in [CARD_CONDITION_RUBRIC.md](CARD_CONDITION_RUBRIC.md).
9. **Defects must be located on listing photos.** Ask the vision model for the image index and normalized bounding box of each visibly supported defect so we can draw an interactive overlay on the original photo. Box coordinates are estimates; do not invent locations for unlocalizable flaws. Always provide the grade even if some boxes cannot be confidently provided.

## Architecture decision: source-agnostic grading core (2026-11-11)

**New requirement:** the same visual grading functionality must later accept photos of cards that the user owns, without depending on eBay identifiers, URLs, a listing, or the Deals UI. Implement this separation **now**, even though the first release only exposes it through eBay.

- **Shared grading engine** (for example `ebay-worker/card-condition/analyze.js`, name can change during implementation): a pure, testable function such as `analyzeCardCondition({photos, cardContext, rubricVersion}, {provider})`. It receives validated image bytes or bounded vetted image parts plus their media types and stable 1-based image indices; returns the normalized `{grade, confidencePercent, gradePercentages, observations, limitations, model, rubricVersion, ...}`. It **must not know** about eBay, Firestore document paths, user-account metadata, browser DOM, or Deals ranking. Provider-specific Gemini calls live behind a thin swappable interface; no LangChain dependency for a single provider call.
- **Source adapters** securely acquire photos and stable identities for a particular context. First adapter: `ebay-listing`, which fetches image URLs only through existing validated eBay Browse lookup and safely retrieves image parts. Future adapter: `owned-card`, which will accept authenticated, size-limited user photos via a controlled upload/reference mechanism. **Do not accept arbitrary client URLs or allow fetching arbitrary hosts**. Keep the future adapter unimplemented until the feature is requested.
- **Shared result schema and UI-ready defect coordinates**: each observation has an area, severity, textual finding, and optional `locations: [{photoIndex, box2d}]`, where `box2d` is normalized `[ymin,xmin,ymax,xmax]` (0–1000); the engine validates coordinates and maps provider-specific output to this canonical format. A separate UI overlay renderer can be reused by Deals and a future My Cards photo viewer.
- **Request/orchestration boundary:** external authenticated Worker endpoint `POST /api/analyze-condition` accepts a *source descriptor*, not raw arbitrary URLs: initially `{source:{type:"ebay-listing", marketplace, itemId}}`. Later, `{source:{type:"owned-card", cardId, photoSetId}}` once secure uploads are in place. The endpoint validates auth and authorization, selects a source adapter, calls the shared grader, and sends the schema. The first implementation can support only `ebay-listing` and explicitly reject other types; the core interface must be source-independent.
- **Storage/cache boundary:** use `users/{uid}/conditionAnalyses/{analysisKey}` from day one, storing `source.type`, validated source identity, photo fingerprint, analysis, and timestamps. Choose a stable document key derived from the **namespaced source type and identity**; for eBay use normalized marketplace + complete itemId so the same listing across both search modes hits one record. For future owned cards include owned-card identity and photo-set version/fingerprint so changing photos does not silently serve an outdated grade. Do **not** use one global cross-source key or expose private analyses through public binder shares.
- **Source-specific presentation:** the Deals gallery and bargain ranking own all eBay-only behavior; the engine does not compute prices, bids, seller conditions or listing-match scores. Future My Cards UI can call the same grader and render the same defects with different surrounding actions.
- **Photos/metadata:** grading must not be influenced by listing prices or seller condition claims. The neutral `cardContext` can include card name, set, holo flag and optional other validated physical characteristics; its absence must not break grading. Define the source-agnostic result as a reusable schema before implementing persistence or UI.

```text
Deals gallery ── eBay source adapter ────┐
                                        ├── shared card-condition analyzer ── Gemini adapter
My Cards photos (later) ── private photo source adapter (later) ─────┘
                                        └── shared result + defect geometry schema
                                                └── per-user conditionAnalyses cache
```

This separation should add only a few focused functions/modules, **not a framework, SDK abstraction layer, extra providers, R2 bucket or photo-upload feature** at this stage.

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
- Result: prominent best grade (e.g. LP), confidence (e.g. 65%), compact optional five-grade probability breakdown, observations for corners/edges/front/back/holo/surface/structural damage, limitations, seller-vs-AI discrepancy and linked photo indices. The model returns **per-defect bounding boxes** for supported visible findings; the gallery draws interactive annotations over each original image. Tapping an observation navigates to its image and highlights its box. Marks must account for responsive `object-fit: contain` and natural image dimensions (including iPhone Safari); optional show/hide marks toggle. Bounding boxes indicate possible flaws, not pixel-perfect segmentation. Only claim visual details supported by photos.
- A cached result is accessible by pressing the same button, without AI inference. Search result cards can indicate "AI: LP · 65%" and use this persisted result without opening the gallery. Manual "Analyze again" remains available when viewing a result and must make its cost implications clear.
- Preserve small-screen layout and photo viewer gestures. No Firestore writes for unrelated collection progress; public binder shares must not expose analyses.
- If Firestore is temporarily unavailable, do not present a new inference as if reliably cached. Explicitly show persistence failure and provide a safe retry-save path without a second AI call while the current result remains in memory.

## Proposed Firestore schema
Path: `users/{uid}/conditionAnalyses/{analysisKey}`.
Generate `analysisKey` deterministically from **source type plus source identity**. For eBay use validated marketplace and complete Browse itemId (e.g. hash/URL-safe encode `ebay-listing:EBAY_US:v1|123456789012|0`); do **not** key by card ID or listing title. A listing reused in both Deals modes maps to the same document. A future `owned-card` analysis may use a photo-set version or fingerprint in its identity. No migration is necessary: the AI collection does not exist yet.

Example shape (illustrative, not committed schema):
```json
{
  "schemaVersion": 1,
  "source": {"type": "ebay-listing", "marketplace": "EBAY_US", "itemId": "v1|123456789012|0"},
  "cardId": "base1-4",
  "grade": "LP",
  "confidencePercent": 65,
  "gradePercentages": {"NM": 8, "LP": 65, "MP": 25, "HP": 2, "DMG": 0},
  "observations": [
    {"area": "corners", "finding": "Visible whitening", "severity": "minor", "locations": [{"photoIndex": 1, "box2d": [20, 820, 180, 990]}]}
  ],
  "limitations": ["Back not shown clearly"],
  "imageCount": 4,
  "imageSetFingerprint": "sha256-of-normalized-image-url-list",
  "model": "configured-vision-model",
  "promptVersion": "v1",
  "rubricVersion": "tcg-text-v1",
  "analyzedAt": "server timestamp",
  "analysisSource": "vision-ai"
}
```
Actual `cardId` should use the app's existing stable card ID, if available; do not derive it from the example. Bounding boxes use **Gemini order `[ymin,xmin,ymax,xmax]`, scaled 0–1000**; `photoIndex` is 1-based and must correspond to the *actual input photo*, with an explicit mapping if selecting a subset. A `locations` array may be empty for a genuine finding that the model cannot localize; never fabricate a mark. Cap array and text lengths, validate `grade`, bound all percentages 0–100 and normalize to sum 100, and validate box ordering, image index, and range before rendering. Stored percentages are *estimated model confidence*, not calibrated probabilities. Never store eBay images or API secrets in Firestore.

**Security rules**: only authenticated `request.auth.uid == uid` can read/write the nested records, with reasonable shape/size checks; do not allow public/shared binder read access. Verify the actual deployed rules before implementation and document any required manual deployment.

## End-to-end flow
1. Search Deal results are rendered as today; optionally preload **only previously analyzed, visible** listings' metadata from Firestore in bounded batches, without any AI calls. Handle asynchronous scope changes safely.
2. User opens a listing gallery; the gallery loads the eBay image list on demand as today. Opening alone does not start AI.
3. User presses "✨ ניתוח מצב". If a matching versioned cached analysis exists for `marketplace + itemId`, show it immediately; do not contact the inference provider.
4. On cache miss and with usable imagery, the client obtains a Firebase ID token and calls `POST /api/analyze-condition` with `source:{type:'ebay-listing',marketplace,itemId}` and minimal card context. The Worker verifies Firebase token **and the configured AI owner allowlist**, restricts request size, rate/cost and concurrency, and passes the validated source to the eBay adapter, which retrieves its images (never arbitrary client-controlled fetch URLs).
5. The eBay source adapter selects up to a defined limit of **actual listing** front/back/close-up images (initial target ~10, preserving provenance). The shared grading engine calls **Gemini 3.8 Flash** with the **text-only** [versioned grading rubric](CARD_CONDITION_RUBRIC.md) and requests schema-constrained JSON, including per-defect coordinates. Do not obey text found in images or seller descriptions as instructions. Validate, sanitize and normalize model output; reject malformed responses or attempt a bounded corrective retry.
6. Return the source-neutral result to the client; save it with its source identity into a private `conditionAnalyses` Firestore document, separately from collection progress. Avoid overwriting an existing newer analysis (concurrent tabs). Rerender the item and gallery with the persisted result.
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

## Model and localization decision (2026-11-11)
- **Selected initial model: Google Gemini 3.8 Flash** (`gemini-3.8-flash`). This choice is **based on published capabilities, not an unperformed Pokémon-card accuracy benchmark**. Google's official image-understanding docs explicitly document detection output with bounding boxes and JSON, with coordinates normalized to 0–1000. Its model docs confirm image input and structured output; a stable GA version exists.
- This model is **not proven uniquely best at identifying scratches, card whitening or tiny holo imperfections**. Official documentation concerns object/region detection, not microscopic defects. Grades and marks need real user inspection after implementation; if performance is poor, switch provider or improve the image/crop strategy.
- Initial approach: one Gemini API request per *manual, uncached* analysis for condition, confidence, observed defects, `photoIndex` and `box2d` coordinates in one JSON. Do not add multiple automatic models, a 20–30 listing predeployment comparison, an extensive benchmark, or extra model cascades. Use high-resolution images where supported and measure costs on the first actual calls.
- Google's box coordinates use `[ymin,xmin,ymax,xmax]` in a normalized 0–1000 frame. The front end converts coordinates to overlays on the **original eBay image** and honors aspect-fit letterboxing. A model may return uncertainty or no box for an ambiguous flaw; *the best-effort grade remains mandatory* on a successful analysis.
- **Minimal infrastructure:** keep the existing vanilla JS/Cloudflare Worker, and put provider-specific request and response handling behind a small local `analyzeConditionWithProvider(...)` adapter or single module. LangChain.js supports Cloudflare Workers and provider swapping, but **do not introduce a new framework solely for one image-inference call**. Consider modern `@langchain/google` only if future provider switching actually needs it; older `@langchain/google-genai` had integration issues.
- Google's published **introductory paid-tier rate through December 31, 2026** for Gemini 3.8 Flash is $0.75 per 1M input tokens and $3.75 per 1M output/thinking tokens; pricing changes in 2027. No fixed per-listing price can be promised before seeing real image sizes and token usage.
- **Account setup later, before live calls:** user needs a Google Gemini Developer API key and an appropriately configured billing tier (consumer ChatGPT subscriptions are unrelated); store as Cloudflare Worker secret `GEMINI_API_KEY`, never in chat, browser or GitHub. Verify privacy and eBay image-transmission terms and deployed Firestore access rules.
- Model doc: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash ; localization: https://ai.google.dev/gemini-api/docs/image-understanding ; resolution: https://ai.google.dev/gemini-api/docs/media-resolution ; pricing: https://ai.google.dev/gemini-api/docs/pricing ; JSON schema: https://ai.google.dev/gemini-api/docs/structured-output .
- Implementation acceptance: returned marks correspond to the photo, remain aligned on touch zoom/responsive widths, can be toggled, and clearly warn when boxes are approximate. Never show arbitrary boxes for model errors.
- **Validation after implementation:** inspect a few representative real listings manually in the working UI, especially clean-looking front/worn back, whitening, scratches, crease/glare, and missing backside; adjust if observed quality is insufficient.


## Work plan and decisions workflow
- **Phase 0 (this PR)**: commit this design document; no functional change. Update this document before any future implementation PR so that requirements, provider, schema, security choices and acceptance tests reflect the agreed design.
- **Phase 1**: implement the selected Gemini 3.8 Flash adapter behind the Worker with mocks, after verifying image-input terms, cost controls and existing Worker auth. Confirm deployed Firestore rules before enabling live saves. Record resolved decisions here.
- **Phase 2**: implement an authenticated, cost-limited Worker endpoint and structured visual grading with isolated mock tests.
- **Phase 3**: implement Firestore cache bridge and UI/Deals integration with mobile regression coverage.
- **Phase 4**: test real results and on-image marks interactively **after implementation**, using a few representative listings chosen by the user, then refine conservatism, prompt and overlays as necessary. No large upfront benchmark.

**Implementation notes:** `ebay-worker/card-condition.js` contains the source-neutral grader with a Gemini REST adapter; the Worker eBay adapter permits only verified eBay CDN images, validates owner Firebase token and enforces per-item cooldown. `js/firebase-cloud.js` persists analyses under the `conditionAnalyses` collection. Gallery displays manual/cached results and overlay rectangles; image-set SHA-256 fingerprint allows stale notices without automatic reanalysis. See [Firestore rule addition](FIRESTORE_CONDITION_RULES.md). Mocked Worker and browser tests never access paid APIs or actual user Firestore. Verify production rules and live Gemini behavior after deployment.
