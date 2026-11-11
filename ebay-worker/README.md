# eBay Live Search — secure Cloudflare Worker

This is the backend for the existing **🔎 מציאות** tab. It fetches live auctions and Buy It Now listings via the **official eBay Browse API**, not a third-party scraper. The `Client ID` and `Client Secret` remain private in the Worker.

## Setup (one time)

1. Sign in to [eBay Developers](https://developer.ebay.com/) and create **Production** API keys. eBay may require approval or additional account steps before it enables Browse API production access.
2. Create or sign in to [Cloudflare Workers](https://dash.cloudflare.com/). Use Node.js with `npx`.
3. From the repository root, deploy:
   ```sh
   cd ebay-worker
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put EBAY_CLIENT_ID
   npx wrangler secret put EBAY_CLIENT_SECRET
   ```
   Enter your **production** App ID for `EBAY_CLIENT_ID` and **production** Cert ID for `EBAY_CLIENT_SECRET` at the terminal prompts.
4. Copy the Worker URL printed by `wrangler deploy`, such as `https://pokemon-vintage-ebay-deals.<your-subdomain>.workers.dev`.
5. The current site uses the Worker URL configured in `deal-finder/live.js`. Open **🔎 מציאות**; it checks `/health` and scans the user's Wishlist in batches of four. Do not paste API keys into the browser.

**Do not paste keys into the public website, commit them to GitHub, or send them in chat.** Only enter credentials via Cloudflare secrets.

The Worker allows cross-origin requests only from `https://xfayne.github.io` by default. Edit `ALLOWED_ORIGIN` in `wrangler.toml` only if the deployed site's actual origin changes.

## API

- `GET /health` checks whether the eBay secrets are configured without revealing values.
- `POST /api/search` with `{"cards":[{"id":"neo2-1","name":"Espeon","setName":"Neo Discovery","number":"1/75","firstEdition":false}]}` returns live auctions and fixed-price offers, bid count when available, end time, seller feedback, price and shipping to Israel (when eBay returns it), primary image, link, title-matching confidence and warnings. A request covers 1–4 Wishlist cards across **US, UK and Germany**.
- `POST /api/item-condition` with `{"itemId":"v1|123456789|0","marketplace":"EBAY_US"}` asks Browse `getItem` for condition data and optional card-verification details.
- `POST /api/item-images` with `{"itemId":"v1|123456789|0","marketplace":"EBAY_US"}` asks Browse `getItem` for the listing's primary and additional image URLs **only when the user opens the gallery**. Returns `{ "images": ["https://…", …] }` with unique HTTPS URLs (maximum 25); empty sets are possible. Both endpoints validate IDs/marketplaces, enforce the configured allowed origin, and keep OAuth tokens private.
- Scanning does not fetch the full photo gallery. Gallery metadata is cached in the browser for an open page session, not persisted to Firestore or KV. No image recognition or card-grade inference is run.

## Data quality and limitations

- The backend rejects proxy/reprint/graded titles and explicit 1st-edition mismatches with Unlimited cards.
- Title matching is **not** image or authenticity verification, nor a condition grade. Do not buy a card based on a matching score alone.
- Missing shipping is **unknown**, never assumed free. The UI only calculates a dollar all-in price when both bid and shipping currency can be converted with dated exchange rates.
- Listings may be updated/withdrawn, and prices change until auctions finish.
- A public Worker endpoint can attract abuse. Before widespread deployment configure Cloudflare rate limits/WAF on `/api/search`. Strict per-request caps, a fixed allowed origin and token caching are already implemented; those do **not** replace proper server-side abuse protection.
- The UI does **not** store eBay credentials. The gallery's optional AI-analysis button is a clearly labeled static UI **demo**, not a real image analysis.

## Testing

You can run `node --test ebay-worker/worker.test.mjs` from the repository root (Node.js 20+).

Official API docs:
- [eBay Browse API search](https://developer.ebay.com/develop/api/buy/browse_api/item_summary/search)
- [Cloudflare Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
