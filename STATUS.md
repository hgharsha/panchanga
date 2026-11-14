# Status

## 2026-11-14 — dates instead of "+" (v5)
- A time on a later day now reads `01:16 · Dec 22` (rows and the ring's "till"), instead of `01:16+`. Cache bumped to `panchanga-v5`.

## 2026-11-14 — limbs that change during the day (v4)
- Tithi, nakshatra, yoga and karana rows now show the limb that follows, e.g. `Saptami 17:35` then `Ashtami 18:50 · Jul 21`. a time on a later day carries its date (see v5).
- On today's date the limb in effect now is bold and finished ones are dimmed (evaluated when the page renders; reopen or Refresh to update).
- Engine: `followOn()` in `panchanga-pwa/astro.js`. UI: `limbValue()` / `endLabel()` in `index.html`. Service worker cache bumped to `panchanga-v4`; footer shows v4.
- Checked: 2026-07-20 Naperville reference values unchanged (Saptami ends 17:35, sunrise 05:34).
- Not yet verified on a phone. Installed copies pick up v4 on the second open after deploy.
