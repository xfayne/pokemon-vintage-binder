# Pokémon Vintage Binder

A mobile-friendly web app for organizing a personal **vintage Pokémon TCG** collection, from Base Set through the Neo era.

**[Open the app](https://xfayne.github.io/pokemon-vintage-binder/)**

## Features

- **Catalog** — browse vintage sets and card artwork, including a static no-JavaScript fallback.
- **My Cards** — track owned cards, condition, paid prices, estimated market values, and export to CSV.
- **My Binder** — arrange cards in 3×3 binder pages and share a read-only binder view.
- **Wishlist** — prioritize and reorder wanted cards.
- **Deals** — discover eBay listings for wishlist cards, compare condition-specific prices, and filter suspicious or irrelevant listings.
- **AI condition analysis** — manually analyze a listing's front/back photos through Gemini, inspect approximate defect highlights, and reuse the result privately from Firestore (requires owner login and Firestore rules). The grading core is reusable for future owned-card photos.
- **Shipments** — track parcels and associate them with cards.
- **Google sign-in and backups** — collection data is stored in Firestore; JSON backup/import is available.

## Architecture

This is a lightweight vanilla JavaScript application, hosted on **GitHub Pages**, without a React build step.

| Area | Location |
| --- | --- |
| Editable page shell | `templates/index.template.html` |
| Offline catalog HTML | `templates/static-catalog.html` |
| Generated, deployed HTML | `index.html` |
| Styles | `css/app.css` |
| Collection, binder and wishlist modules | `js/` |
| eBay Deals UI | `deal-finder/` |
| Photo-condition grading core | `ebay-worker/card-condition.js` |
| Cloudflare Worker backend | `ebay-worker/` |
| Browser and regression tests | `tests/` |

Firebase Authentication handles Google sign-in, and **Firestore is the source of truth** for collection data. The eBay backend uses a Cloudflare Worker to keep API credentials off the client. Do not commit secrets or Firebase service-account keys. AI grading uses the separately configured Cloudflare Worker secret `GEMINI_API_KEY` and authenticated `POST /api/analyze-condition`; Firestore owner-only rules for `users/{uid}/conditionAnalyses` are described in [`docs/FIRESTORE_CONDITION_RULES.md`](docs/FIRESTORE_CONDITION_RULES.md).

## Development

You can serve the repository locally using a static HTTP server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Features that require Firebase sign-in or backend APIs also require the corresponding configured services.

**Do not edit the generated `index.html` directly.** Edit the template or catalog fragment and rebuild:

```sh
node scripts/build-index.mjs
node scripts/build-index.mjs --check
```

Commit the generated `index.html` together with its source. The build check enforces exact reproduction, preserving the standalone no-JavaScript catalog.

## Tests and contributions

Changes go through pull requests. GitHub Actions requires JavaScript behavior/regression and responsive style parity checks before merging to `main`.

```sh
node scripts/build-index.mjs --check
node --test ebay-worker/worker.test.mjs
```

Additional Playwright-based browser tests are run by the repository's GitHub Actions workflows. When changing client JavaScript, update its cache-busting version in the HTML template and regenerate `index.html`.

## Documentation

- **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — detailed architecture, product decisions, constraints, and development context.
- [HTML template workflow](templates/README.md)
- [Deals architecture](deal-finder/README.md)
- [Cloudflare Worker](ebay-worker/README.md)
- [Manual smoke-test checklist](tests/SMOKE_CHECKLIST.md)

The README is the public-facing project entry point; `PROJECT_CONTEXT.md` retains the deeper, evolving implementation notes rather than duplicating them here.
