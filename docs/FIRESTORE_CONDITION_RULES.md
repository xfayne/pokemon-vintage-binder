# Firestore rules addition for card-condition analyses

The browser stores successful, per-user AI grading results in a **new** subcollection:

`users/{uid}/conditionAnalyses/{analysisKey}`

The production rules published on 2026-11-12 use the following blocks inside the existing `match /users/{userId}`. The previous recursive owner rule also matched analysis documents. Firestore grants access when any matching `allow` succeeds, so the recursive rule now excludes `conditionAnalyses`, with a separate rule preserving existing owner access to deeper descendants. The user document and shared binder rules were retained.

```javascript
match /{collection}/{document=**} {
  allow read, write: if collection != 'conditionAnalyses'
    && request.auth != null && request.auth.uid == userId;
}
match /conditionAnalyses/{analysisKey} {
  function validAnalysis(data) {
    return data.keys().hasOnly([
      'schemaVersion', 'source', 'analysis', 'photoIndices',
      'imageCount', 'analyzedAt', 'clientAnalyzedAt'
    ])
    && data.schemaVersion == 1
    && data.source is map
    && data.source.type == 'ebay-listing'
    && data.source.marketplace in ['EBAY_US', 'EBAY_GB', 'EBAY_DE']
    && data.source.itemId is string
    && data.source.itemId.size() <= 64
    && data.analysis is map
    && data.analysis.grade in ['NM', 'LP', 'MP', 'HP', 'DMG']
    && data.photoIndices is list
    && data.photoIndices.size() <= 8
    && data.imageCount is int
    && data.imageCount >= 0
    && data.imageCount <= 25
    && data.analyzedAt == request.time
    && data.clientAnalyzedAt is int;
  }
  allow get, list: if request.auth != null && request.auth.uid == userId;
  allow create, update: if request.auth != null && request.auth.uid == userId
    && validAnalysis(request.resource.data);
  allow delete: if false;

  match /{subcollection}/{document=**} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
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

The Worker returned HTTP 200 with `aiConfigured: true` from the app origin, and an unauthenticated analysis request returned HTTP 403 with `AI_AUTH_REQUIRED`. Firebase Console confirmed the rules are active in the default database. Rules Playground simulations using synthetic paths allowed owner reads and existing shared-binder reads, denied signed-out and other-user reads, denied owner deletes and malformed writes to analysis documents, and preserved owner access to other user descendants. The local Worker suite and mocked mobile gallery regression passed. Valid writes with a server timestamp and live Gemini output on real photos still need end-to-end verification. Follow [issue #53](https://github.com/xfayne/pokemon-vintage-binder/issues/53) for release status.
