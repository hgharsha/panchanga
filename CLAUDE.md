# CLAUDE.md — Panchanga App

Context file for Claude Code (or any future session) working on this repo.

## What this is

A mobile-first Progressive Web App (PWA) that computes and displays the daily
Chandramana Hindu Panchanga (lunar calendar almanac): vara, samvatsara, ayana,
ritu, masa, paksha, tithi, nakshatra, yoga, karana, and sunrise/sunset — all
computed live from astronomical formulas, not fetched from an API.

Live at: https://hgharsha.github.io/panchanga/
Hosting: GitHub Pages, static files only, no build step. **The repo is public**
— never commit personal data (location, birthdays, watchlists) to it.

## Repo layout

- `panchanga-pwa/` — the deployed app (this is what GitHub Pages serves).
  - `index.html` — markup, styles, and UI logic.
  - `astro.js` — the astronomical engine, shared by the page and the service
    worker. **Single source of truth** — see "Astronomical engine" below.
  - `idb.js` — tiny IndexedDB key-value helper, shared by the page and the
    service worker (a service worker cannot read `localStorage`).
  - `sw.js` — service worker: offline app-shell caching + push notification
    handling.
  - `manifest.json`, `icon-192.png`, `icon-512.png` — PWA manifest/icons.
- `push-worker/` — Cloudflare Worker that relays daily wake-up push
  notifications. See its `README.md` for deploy steps. Not part of the
  GitHub Pages deploy; lives in its own Cloudflare account/project.
- `v1/`, `v2/` — historical snapshots kept for reference only, not deployed.
  `v2` in particular contains a **rejected** notification design — see
  "Rejected design" below before reusing anything from it.

## Design system

- Palette: deep indigo background (`#12122a`), saffron/gold accent (`#e3a857`),
  warm parchment text (`#f5efe0`).
- Fonts (via Google Fonts import in `<style>`): Cormorant Garamond (display/serif),
  Manrope (body), Space Mono (times/data readouts).
- Signature visual: a radial "ring" showing tithi progress, echoed in the app icon.

## Astronomical engine (important — do not casually "simplify" this)

Lives in `panchanga-pwa/astro.js`, loaded by both `index.html`
(`<script src="astro.js">`) and `sw.js` (`importScripts('astro.js')`). **Do
not duplicate this logic anywhere else** — a duplicated copy is exactly what
went wrong in the rejected v2 design (see below): any future bug fix (like the
masa new-moon-direction bug fixed previously) has to be applied in every copy
or silently drifts out of sync.

- Sun/moon ecliptic longitude via standard low-precision series (Meeus-style).
- Lahiri ayanamsa via linear approximation.
- Tithi/nakshatra/yoga/karana derived from sun/moon longitude differences,
  evaluated **at sunrise** (traditional convention), with exact transition
  ("end") times found via bisection search.
- Masa (lunar month) determined by the sun's sidereal rashi **at the next new
  moon** (not the preceding one — this was a real bug that got fixed).
  Getting this backwards silently produces the wrong masa near solar-transit
  boundaries.
- Samvatsara (60-year cycle name) via Shaka-year + Ugadi-boundary heuristic.
- Sunrise/sunset via the standard NOAA solar position algorithm.

**Validated reference values** — use these to sanity-check any changes to the
astro math (matches a known-good reference app to within 1–2 minutes):

> July 20, 2026, Naperville, IL (41.7508, -88.1535, America/Chicago):
> Indu vara · Parabhava samvatsara · Dakshinayana · Greeshma · Ashadha masa ·
> Shukla Paksha · Saptami (ends ~17:35) · Hasta nakshatra (ends ~08:41) ·
> Shiva yoga (ends ~08:08) · Vanija karana (ends ~17:35) · Sunrise ~05:34

If you touch `astro.js`, recompute this case and confirm it still matches
before assuming correctness.

## Location handling

- On each app open, tries `navigator.geolocation` fresh (does **not** cache a
  stale location across sessions) — falls back to Naperville, IL on denial/failure.
- Exception: if the user manually picked a city/coordinates via the location
  sheet, that manual choice **is** persisted and used on every subsequent open
  (source: `'manual'` vs `'geo'`/`'default'` in the stored location object).
- Location is stored in **IndexedDB** (`panchanga-db` → `location` key), not
  `localStorage`, because `sw.js`'s push handler needs to read it and service
  workers cannot access `localStorage`.

## Mobile/PWA specifics

- `viewport-fit=cover` + `env(safe-area-inset-*)` padding is used throughout
  (top bar, footer, bottom sheets) to avoid content sliding under the iPhone
  notch/Dynamic Island or home-indicator area when installed as a home-screen app.
- `window.storage` is a `localStorage`-backed polyfill (this app started as a
  Claude.ai artifact, where `window.storage` is a built-in API; the polyfill
  lets the same code run standalone on GitHub Pages). Location and the
  reminders watchlist do **not** use it — they use IndexedDB (see above).

## Push notifications ("Reminders") — active design

Real phone notifications even when the app is fully closed, for: Ekadashi
(every occurrence) and personal days (fixed calendar date, or lunar
recurrence by nakshatra or tithi, optionally scoped to a specific masa for a
once-yearly reminder vs. every lunar month).

**Key constraint:** iOS Safari has no local "alarm" API — the only way to
wake a fully-closed PWA is a real Web Push notification, which requires a
server component of some kind.

**Design — on-device compute + dumb relay:**
- **Client** (`index.html` + `sw.js`, sharing `astro.js` and `idb.js`): all
  panchanga computation and watchlist matching happens **on-device**.
  Location and watchlist live in IndexedDB — neither ever leaves the device
  except as anonymous push-subscription metadata (endpoint + keys, no
  personal data) sent to the Worker on subscribe.
- **Server** (`push-worker/`, a Cloudflare Worker on the free tier): stores
  only anonymous push subscription endpoints (in Workers KV, keyed by
  endpoint — supports any number of independent subscribers) and, once daily
  via a Cron Trigger, sends every subscriber a content-free "wake up" push
  (empty body, VAPID-signed auth header only — nothing to encrypt since
  there's no payload).
- On receiving the wake push, `sw.js`'s `push` handler reads location +
  watchlist from IndexedDB, computes today's panchanga via `astro.js`, checks
  it against the watchlist, and shows a notification only on a match
  (otherwise shows-then-immediately-closes a silent notification, since
  browsers require *some* visible result from a push event).
- VAPID keys: private key stored only as a Cloudflare Worker secret (JWK
  format, signed via `crypto.subtle` — no `nodejs_compat` needed since there's
  no payload to encrypt); public key embedded client-side. See
  `push-worker/README.md` for the full setup/deploy steps.
- Watchlist entry schema: `{label, type: 'fixed'|'nakshatra'|'tithi', ...type-specific
  fields, masa?: string}`. `masa` is optional on the lunar types: present means
  "yearly" (recurs once per year in that masa — the birthday case), absent
  means "recurs every lunar month."

### Rejected design (v2, in `v2/panchanga-pwa/`) — do not resurrect

An attempt was made to build notifications using **GitHub Actions** (cron
workflow + a Node script) instead of a Cloudflare Worker. It was evaluated
and rejected for concrete reasons — don't re-suggest this approach without
addressing all of them:

1. **Personal data committed to a public repo.** It stored the user's
   coordinates and personal dates (birthdays/anniversaries) as plain JSON
   files (`push/location.json`, `push/watchlist.json`) inside the repo that
   also serves the public site.
2. **Duplicated astro engine.** `push/check-and-notify.js` reimplemented the
   sun/moon/tithi/nakshatra/masa math in a third place, independent of the
   page's engine — exactly the drift risk `astro.js` now exists to prevent.
3. **Single hardcoded subscriber.** One `subscription.json` file — no way for
   a second person/device to subscribe without overwriting it.
4. **Broken subscribe UX.** Required the user to copy a raw JSON blob and
   hand-commit it into the repo before notifications would work, with no
   path to recover if the browser ever rotated the subscription.
5. **Unreliable timing.** GitHub Actions `schedule:` cron is explicitly
   best-effort and can be delayed 10–30+ minutes or dropped at peak load —
   acceptable for CI, not for "did I miss Ekadashi today."

## Known limitations (accepted, not bugs)

- Adhika/kshaya (leap/skipped) lunar months are not specially detected —
  affects masa naming for a few weeks roughly 1 year in 3.
- Ayanamsa uses a linear approximation, not a full nutation model — fine for
  personal use, not for professional astrological precision.
- No live reverse-geocoding (no network calls at all by design, other than
  the anonymous push-subscribe/unsubscribe calls to `push-worker`) — the city
  picker is a curated static list plus manual lat/lon/timezone entry.
- The old 1am-CST auto-refresh timer (present in earlier versions) was
  dropped when reminders were added; the app still recomputes on every open
  and via the manual "Refresh now" button.
