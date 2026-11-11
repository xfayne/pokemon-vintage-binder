# Vintage Pokémon card condition rubric (text-only reference)

_Status: first proposed grading rubric for evaluating eBay listing photographs. Version: `tcg-text-v1`. Reviewed: 2026-11-11. This is our own concise operational interpretation, not a reproduction of TCGplayer's complete standards._

## Purpose and reference policy
- Use **only the seller's actual listing photos** as images in an inference request. Do **not** upload the user-shared example pictures or fetch/reference third-party grading example images as in-context examples.
- The text rubric, condition labels, and photographic limitations below guide grading; use multiple photos of the same physical card wherever available. Do not mistake reflections or sleeves for physical damage.
- TCGplayer condition standards are the *target*; keep official source links instead of duplicating a PDF or embedding its figures:
  - [TCGplayer Card Conditioning Overview](https://help.tcgplayer.com/hc/en-us/articles/221430307-Card-Conditioning-Overview)
  - [TCGplayer Imperfections Comprehensive Guide](https://help.tcgplayer.com/hc/en-us/articles/26141121045143-Understanding-Card-Condition-Imperfections-A-Comprehensive-Guide)
  - [Official Card Conditioning Standards PDF (March 2025)](https://mktg-assets.tcgplayer.com/web/seller/guides/Card-Conditioning-Standards.pdf)
- This internal guide is *versioned*; on any ambiguity or changes in TCGplayer's public standards, review the latest official documentation and update this rubric and the prompt version. Some public TCGplayer guides differ in numeric measurement details; avoid silently combining conflicting dimensions.

## What to inspect on photos
1. **Front and back separately**: identify which angles are visible; flag a missing/blurred side. Backside corner and edge whitening matter; front face and foil/holo surfaces matter just as much.
2. **Corners, edges, border**: whitening/ink loss, fraying, peeling, rounded corners, deep wear.
3. **Surface**: individual scratches versus grouped scuffs, gloss loss, clouding, abrasion/visible cardstock, stains, grime.
4. **Holo (if present)**: scratches and marks that are visible under the photographed lighting. Do not claim a holo is flawless because no angled light photo is provided.
5. **Structural defects**: bends, creases, dents, indents, tears, splits, liquid damage, foreign substances and delamination. Any clear damage to structural integrity is a strong DMG indicator.
6. **Manufacturing variation**: distinguish suspected print defects/roller marks from wear when possible; uncertainty should be explicitly stated.

For every observed flaw, provide a short neutral description, qualitative severity, side/area and one or more **1-based photo indices**. If the flaw is ambiguous, label it as suspected rather than factual. Never infer the condition of a hidden side.

## Working grading guidance
The following tier labels are shorthand for **photographic** estimates of ungraded/raw cards.

| Grade | Visual interpretation | Key disqualifiers / caution |
| --- | --- | --- |
| **NM** | Almost unplayed appearance; sharp-looking corners, clean edges, at most a small amount of slight wear or light marks | Substantial scratches/scuffing, visible surface loss, grime, crease or bend point lower |
| **LP** | Light signs of handling: limited edgewear, minor scratches/scuffs, minor imperfections without compromised structure | Widespread wear, prominent creases, substantial surface abrasion point lower |
| **MP** | Noticeable, repeated wear: broader whitening or scratches/scuffs, or a moderate imperfection; still structurally sound | Major pervasive wear and severe defects point to HP; compromised integrity points to DMG |
| **HP** | Heavy wear and many defects, including pronounced edge/surface damage or creases; card remains structurally intact | Tears, significant layer separation, serious liquid damage, other structural integrity loss point to DMG |
| **DMG** | Major/structural damage or flaws exceeding other grades | Do not require every surface to look worn if a single clear structural issue warrants DMG |

**Imperfection points as a secondary cross-check:** the March 2025 TCGplayer standards use the escalating severity weights slight=1, minor=2, moderate=4, major=8 with overall limits NM=3, LP=6, MP=12 and HP=24; some **imperfection types have stricter per-grade exclusions**, and actual damage bypasses any point total. Do not treat a raw points sum as sufficient to choose a grade. These are published reference values, *not* evidence that photos allow accurate measurements. In particular, do not invent millimetres, square millimetres, percentages of edge area or exact counts where imagery cannot support them.

## Decision order for inference
1. Verify at least one usable image depicting the relevant physical card. If there are **no usable card images**, report a technical/no-evidence error instead of manufacturing a grade.
2. Describe supported positive observations and missing views. Classify suspected defects separately.
3. If a clear automatic downgrade criterion is seen (for instance structural damage), honor it even when the rest of the card appears clean.
4. Otherwise consider the most severe supported defect **and** accumulation of defects, using the five grades as upper bounds; choose **one best-effort grade** even with a partial photo set.
5. Return a distribution for NM/LP/MP/HP/DMG that sums to 100%, with the selected grade having the highest percentage. Report the selected grade's percentage as `confidencePercent` and explicitly describe photo-quality limitations. These are uncalibrated judgment estimates, not statistically validated probabilities.
6. Do not declare authenticity or certify professional grading. Avoid confident statements that a defect is *absent* if the seller never photographed that region. Distinguish condition from the separate catalog-identity match.
7. Grade selection must be based on evidence in pictures, not the seller's title, claimed condition, price or the supposed bargain percentage. Those may be presented **after** the grade as a comparison and should not contaminate the visual estimate.

## Model integration
- Initial model selected based on official documentation: **Google Gemini 3.8 Flash**. It supports input photos, structured JSON and model-generated normalized bounding boxes. Route through the existing authenticated Cloudflare Worker; keep provider/model swappable via a tiny adapter and save chosen model/provider/version with each analysis. No pre-implementation multi-provider image benchmark is required.
- Start by sending up to ~10 **listing-only** images at appropriate detail; use image selection that covers front, back and close-ups and remains within a measured cost budget. Do not assume every listing has ten photos.
- Ask for strict JSON including `grade`, `confidencePercent`, all five `gradePercentages`, `observations`, `limitations` and `visibleSides`. Each observed visible defect may include `locations: [{photoIndex, box2d}]`, with 1-based photo index and `box2d = [ymin,xmin,ymax,xmax]` normalized to 0–1000. The UI overlays boxes directly on the original listing photos. Validate indices, coordinates, ordering and output limits server-side; never invent a box when localization is unreliable. The grade is always returned when photos support a successful analysis.
- Store `rubricVersion: "tcg-text-v1"` and a separate `promptVersion` with every Firestore analysis. Never automatically re-infer upon changing either version; show a stale label and permit explicit reanalysis.
- Test with labeled vintage Pokémon examples: no back, no foil-angle photos, low resolution, sleeves, glare, strong crease, authentic whitening, misleading seller NM claims, clean front/worn back, and multiple cards in one eBay listing.

## Next validation
After a working implementation, visually inspect a few real card listings in the gallery, including defect highlights. Check approximate box placement and assess where LP/MP and HP/DMG differ from user/expert judgment; revise the rubric version if necessary. A large pre-implementation benchmark is not necessary. Avoid confident recommendations based on low-resolution shots.
