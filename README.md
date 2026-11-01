# Panchanga

A mobile-first Progressive Web App that shows the daily **Chandramana Hindu
Panchanga** (lunar calendar almanac). Every value is computed live in the
browser from astronomical formulas. Nothing is fetched from an API.

**Live app:** https://hgharsha.github.io/panchanga/

## What it shows

For the selected date and place:

- **Vara** (weekday, with its Sanskrit name)
- **Samvatsara** (60-year cycle name), **Ayana**, **Ritu**
- **Masa** (lunar month) and **Paksha** (Shukla or Krishna)
- **Tithi**, **Nakshatra**, **Yoga** and **Karana**, each with the time it ends
- **Sunrise** and **sunset**
- An **Ekadashi countdown** and banner

## Using the app

- It asks for your location on open. If you deny it or it fails, it uses
  Naperville, IL.
- You can pick a city from the curated list, or enter latitude, longitude and
  time zone by hand. A manual choice is remembered on this device.
- It works offline after the first visit. Add it to your home screen to use it
  like an app.

## Reminders (optional)

You can subscribe to notifications for Ekadashi and for your own "personal
days". A personal day can be a fixed calendar date, or a lunar match by
nakshatra or tithi. It can recur every lunar month, or once a year in a given
masa (for example, a birthday).

How it works:

- The app computes the day's panchanga on your device. Your location and
  reminder list stay in the browser's IndexedDB.
- A small Cloudflare Worker ([`push-worker/`](push-worker/README.md)) sends
  every subscriber one content-free "wake up" push each morning. It stores only
  anonymous push-subscription endpoints.
- When the push arrives, the service worker checks today's panchanga against
  your list and shows a notification only on a match.

## Run it locally

The app is static files with no build step. Serve the `panchanga-pwa/`
folder with any static server:

```sh
cd panchanga-pwa
python3 -m http.server 8000
```

Then open http://localhost:8000. Push notifications need HTTPS, so test those on
the live site.

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which publishes the `panchanga-pwa/` folder to GitHub Pages. Nothing else in
the repo is served.

The Worker is deployed separately with Wrangler. See
[`push-worker/README.md`](push-worker/README.md) for the VAPID keys, secrets and
KV setup.

## Repository layout

| Path | What it is |
| --- | --- |
| `panchanga-pwa/` | The deployed app. |
| `panchanga-pwa/astro.js` | The astronomical engine. It is shared by the page and the service worker, so keep one copy. |
| `panchanga-pwa/idb.js` | A small IndexedDB helper, shared by the page and the service worker. |
| `panchanga-pwa/sw.js` | The service worker: offline caching and push handling. |
| `push-worker/` | The Cloudflare Worker that sends the daily wake-up push. Not part of the Pages deploy. |
| `v1/`, `v2/` | Earlier snapshots, kept for reference and not deployed. `v2` contains a rejected notification design. |
| `CLAUDE.md` | Design notes and rationale, written for AI coding sessions. |

## Accuracy and limits

- Values are checked against a reference almanac for one date (July 20, 2026,
  Naperville, IL). They match to within a minute or two.
- Adhika and kshaya (leap and skipped) lunar months are not detected. Masa names
  can be off for a few weeks about one year in three.
- The ayanamsa is a linear approximation (Lahiri), not a full nutation model.
  This is fine for personal use, but not for professional astrological work.
- The app makes no network calls except the anonymous subscribe and unsubscribe
  requests to the push Worker.

## Privacy

This repository is public. Do not commit personal data such as locations,
birthdays or watchlists. The app keeps all of that on the device.

## License

No license has been chosen yet. All rights are reserved by the author until one
is added.
