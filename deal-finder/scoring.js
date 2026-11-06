/* Pure, dependency-free deal scoring for Pokémon vintage listings.
 * Prices must be in the same currency. Unknown shipping/condition never earns a "deal" badge.
 */
export const CONDITIONS = Object.freeze(["NM", "LP", "MP", "HP", "DMG"]);
export function scoreDeal(listing, referencePrices, { minimumDiscount = 0.3 } = {}) {
  const { price, shipping, condition } = listing;
  const reference = referencePrices?.[condition];
  if (![price, shipping, reference].every(v => Number.isFinite(v) && v >= 0) || reference === 0) {
    return { status: "review", reason: "Missing verified price, shipping or condition" };
  }
  if (!CONDITIONS.includes(condition)) return { status: "review", reason: "Unverified condition" };
  const total = price + shipping;
  const discount = (reference - total) / reference;
  return { status: discount >= minimumDiscount ? "candidate" : "not-deal", total, reference, discount,
    reason: "Indicative only: compare photos and sold listings before bidding" };
}
export function buildSearchTerms(card) {
  const name = String(card.name || "").trim();
  const set = String(card.set || "").trim();
  const number = String(card.number || "").trim();
  if (!name || !set) return null;
  return [name, set, number, "pokemon"].filter(Boolean).join(" ");
}
