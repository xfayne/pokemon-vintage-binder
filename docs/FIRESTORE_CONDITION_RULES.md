# Firestore rules addition for card-condition analyses

The browser stores successful, per-user AI grading results in a **new** subcollection:

`users/{uid}/conditionAnalyses/{analysisKey}`

Do **not** replace the existing ruleset with the snippet below. Add only the nested `match` block inside the deployed `match /databases/{database}/documents` block, **preserving the existing owned-card, share and shipment rules**. Use the active rules in Firebase Console (Firestore Database → Rules) as the baseline. Review every overlapping `match`, including recursive wildcards. Firestore grants access when any matching `allow` evaluates to true, so an overlapping rule can grant access to another user or allow deletes. If a rule overlaps, review its existing consumers before publishing.

```javascript
match /users/{uid}/conditionAnalyses/{analysisKey} {
  allow get, list: if request.auth != null && request.auth.uid == uid;

  allow create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.data.keys().hasOnly([
      'schemaVersion', 'source', 'analysis', 'photoIndices',
      'imageCount', 'analyzedAt', 'clientAnalyzedAt'
    ])
    && request.resource.data.schemaVersion == 1
    && request.resource.data.source is map
    && request.resource.data.source.type == 'ebay-listing'
    && request.resource.data.source.marketplace in ['EBAY_US','EBAY_GB','EBAY_DE']
    && request.resource.data.source.itemId is string
    && request.resource.data.source.itemId.size() <= 64
    && request.resource.data.analysis is map
    && request.resource.data.analysis.grade in ['NM','LP','MP','HP','DMG']
    && request.resource.data.photoIndices is list
    && request.resource.data.photoIndices.size() <= 8
    && request.resource.data.imageCount is int
    && request.resource.data.imageCount >= 0
    && request.resource.data.imageCount <= 25
    && request.resource.data.analyzedAt == request.time
    && request.resource.data.clientAnalyzedAt is int;

  allow delete: if false;
}
```

The rules permit each signed-in owner to read/write **only their own** analysis records. The public shared binder cannot read this collection. No rules grant access to uploaded card photographs; secure photo uploads will be a separate future feature.

## Prerequisites
- The existing Cloudflare Worker has `GEMINI_API_KEY` as a secret. Keep `TRACK17_OWNER_EMAIL` configured (it is used as the fallback allowlisted account for the AI endpoint until a separate `AI_OWNER_EMAIL` is supplied).
- No API key or raw seller images are persisted in Firestore.
- The Firebase client uses `serverTimestamp()` for `analyzedAt`, so the timestamp must match `request.time` in rules.
- All development tests use in-memory/mock Firestore; they **must not** modify real collection documents or create test records in the production project.

## Verify with synthetic data

1. In a local emulator, load a copy of the active rules and add the new block. Check that the diff contains only the intended addition and that the existing collection, share, and shipment access still works.
2. Using a synthetic document with the app's seven fields and a server timestamp, verify that the owner can get, list, create, and update. Verify that signed-out requests and a different user's requests fail for each operation, owner deletes fail, and invalid payloads fail on create and update.
3. After publishing, reopen the live Rules tab and confirm that the intended ruleset is active. Keep test writes in the emulator.
4. The mocked Deals browser test covers defect boxes and cache reuse. A live signed-in gallery analysis automatically attempts to save its result, so use a test environment for end-to-end checks.
5. If a regular app session encounters `permission-denied`, the UI keeps the result in memory and offers **Save again**. Retrying the save reuses the analysis.

## Production verification (2026-11-12)

The Worker returned HTTP 200 with `aiConfigured: true` from the app origin, and an unauthenticated analysis request returned HTTP 403 with `AI_AUTH_REQUIRED`. The live Gemini response, alignment on real listing photos, and the active Firestore rules remain unverified. Follow [issue #53](https://github.com/xfayne/pokemon-vintage-binder/issues/53) for release status.
