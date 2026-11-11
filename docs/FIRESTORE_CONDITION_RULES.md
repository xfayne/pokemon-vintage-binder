# Firestore rules addition for card-condition analyses

The browser stores successful, per-user AI grading results in a **new** subcollection:

\`users/{uid}/conditionAnalyses/{analysisKey}\`

Do **not** replace the existing ruleset with the snippet below. Add only the nested \`match\` block inside the deployed \`match /databases/{database}/documents\` block, **preserving the existing owned-card, share and shipment rules**. This repository does not have access to the deployed Firebase Security Rules, so this change must be confirmed in Firebase Console (Firestore Database → Rules) before claiming that production analyses persist.

\`\`\`javascript
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
    && request.resource.data.clientAnalyzedAt is int
    && request.resource.size() < 300000;

  allow delete: if false;
}
\`\`\`

The rules permit each signed-in owner to read/write **only their own** analysis records. The public shared binder cannot read this collection. No rules grant access to uploaded card photographs; secure photo uploads will be a separate future feature.

## Prerequisites
- The existing Cloudflare Worker has \`GEMINI_API_KEY\` as a secret. Keep \`TRACK17_OWNER_EMAIL\` configured (it is used as the fallback allowlisted account for the AI endpoint until a separate \`AI_OWNER_EMAIL\` is supplied).
- No API key or raw seller images are persisted in Firestore.
- The Firebase client uses \`serverTimestamp()\` for \`analyzedAt\`, so the timestamp must match \`request.time\` in rules.
- All development tests use in-memory/mock Firestore; they **must not** modify real collection documents or create test records in the production project.

## Test checklist after rules deployment
1. Signed in as the owner, open a Deals gallery and manually run the analysis; verify the grade and defect rectangles, then refresh to confirm no new model call.
2. Confirm \`users/{uid}/conditionAnalyses/{analysisKey}\` contains the normalized analysis and \`users/{uid}.progress\` is unchanged.
3. Signed out, confirm no ability to write/see private results. A different user should not see this owner's analysis.
4. If writes fail with \`permission-denied\`, the UI keeps the analyzed result in memory and offers **Save again**; don't repeat the Gemini call to retry persistence.
