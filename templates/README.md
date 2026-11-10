# HTML source and generated catalog

`index.html` is a generated, **checked-in** deployable file. GitHub Pages
serves it directly, and the same standalone HTML can be previewed in iOS
Files/Quick Look even when JavaScript is disabled or unavailable.

## Authoring sources

- `templates/index.template.html` — editable page shell, styling fallback,
  navigation, UI markup, and ordered script tags. It contains one
  `<!-- POKEMON_STATIC_CATALOG_BUILD_SLOT -->` token.
- `templates/static-catalog.html` — original, losslessly extracted offline
  card catalog: all 1,252 static cards and 15 expandable sections (14 set
  groups plus the Ancient Mew special entry), including image links, accessible
  names, and no-JavaScript checkbox markup.

## Commands

```sh
node scripts/build-index.mjs
node scripts/build-index.mjs --check
```

Edit the source template/fragment, then run the first command and commit the
generated `index.html` **together with the source changes**. The second
command compares the bytes exactly and is mandatory in GitHub Actions on every
PR. It does not rewrite files.

Do not edit `index.html` alone: CI will reject a non-reproducible result.

## Compatibility requirements

- Preserve the server-deployed `index.html` as ordinary complete HTML; **do
  not** load the offline catalog using runtime fetch/import/JavaScript.
- Keep iOS Files/Quick Look no-JS rendering, deep links to catalog sections,
  existing card names, images and rare/holo markers.
- Preserve the script load order, query-string cache versions, and the
  Firestore-only source of truth for saved collection progress.
- Browser parity checks compare actual mobile/desktop app behavior; style
  checks compare responsive screenshots and no-JavaScript fallback.

The initial extraction was byte-for-byte identical to the original deployed
HTML: no changes to page content, images, layout, or behavior.
