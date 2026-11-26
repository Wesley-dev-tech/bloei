# Bloei

Bloei is a personal diary app. The user keeps track of meals, drinks, supplements and weight, and adds notes. The app turns a chosen period into a PDF report; the user decides what goes in it and whether and with whom it is shared. The supplement list can be exported to a file and imported again. Reminders (diary, meals, drinks and supplements, up to three times a day each) arrive as a notification at a chosen time. The app can be locked with a PIN code or with Face ID or a fingerprint.

Bloei is an installable web app (PWA). It runs on iPhone, iPad, Android and desktop. On a phone the navigation is a tab bar; from a width of 960 px it becomes a sidebar. The interface language is Dutch.

All diary data stays on the device. There is no account and no server for diary data. The only exception is the reminder service, see Reminders.

The app is built with plain JavaScript (no framework), Vite and Dexie.

## Running and testing locally

You need Node.js and npm. No Node version is pinned (no `engines` in `package.json`, no `.nvmrc`); the app was developed with Node 26.

```
npm install        # installs the packages from package.json
npm run dev        # Vite dev server (without Content-Security-Policy)
npm run build      # production build in dist/, with the Content-Security-Policy in the pages
npm run preview    # serves the built app locally
npm test           # Vitest: tests/logica, tests/ui, tests/pwa and tests/worker
npm run e2e        # Playwright: screen tests in tests/e2e, against the built app
npm run huisstijl  # copies fonts and Font Awesome icons from node_modules to fonts/ and src/iconen/ (only adds and updates; never deletes an icon)
```

### The demo version

The same code also produces a demo version: its own database (`bloei-demo`), sample data, a bar with "Opnieuw beginnen" (start over), no lock, no reminders and not a single request to a reminder service. The demo may be indexed by search engines; the real version may not (`noindex` and a `robots.txt` with `Disallow: /`). The demo is switched on with `VITE_DEMO=true`; without that variable everything is as described above.

```
npm run dev:demo      # demo dev server on http://localhost:5230 (reads .env.demo)
npm run build:demo    # demo build in dist-demo/
npm run preview:demo  # serves the demo build on http://localhost:4174
npm run og-beeld      # redraws the Open Graph image demo-publiek/og-bloei.png (1200x630)
```

The real version and the demo run side by side locally: `npm run dev -- --port 5220` and `npm run dev:demo` (5230). They live on different addresses and share nothing: no database, no cache, no settings. Even on the same address the demo would not touch real data: it uses its own database, its own cache names (`bloei-demo-...`) and its own `localStorage` keys (`bloei-demo-...`), and "Profiel verwijderen" (delete profile) only clears those. Everything that differs per version is in `src/kern/demo.js` (in the app) and in `vite.config.js` (title, meta tags, `robots.txt`, manifest and output folder at build time).

### Screen tests

Playwright builds the app itself and then starts a preview server. If a server is already running on that port, Playwright uses it (outside CI). `playwright.config.js` reads these environment variables:

- `PW_POORT`: the port of the preview server (default 4173).
- `PW_OUTDIR`: a separate build folder instead of `dist`, so two runs do not disturb each other.
- `PW_CHANNEL`: `chrome` uses the Chrome installed on your computer instead of Playwright's browser.
- `PW_RONDE`: the round to run: `gewoon` (the real build), `demo` (the demo build) or `push` (the real build with a fake reminder service).

Example in bash:

```
PW_POORT=4176 PW_OUTDIR=dist-test PW_CHANNEL=chrome npm run e2e
```

In PowerShell: `$env:PW_POORT="4176"; $env:PW_OUTDIR="dist-test"; $env:PW_CHANNEL="chrome"; npm run e2e`.

For the screen tests `tests/globaal-opstart.js` first prepares a saved state in which the welcome flow is already finished, so the tests do not start on the welcome screen. Tests of the welcome screen start from an empty state.

## Folder layout

- `index.html` and `stijl.html`: the app and the style guide page. The dev server shows both; `vite.config.js` only builds the style guide page in a test build (`BLOEI_STIJLPAGINA=1`, set by `playwright.config.js`), so it never goes online.
- `src/main.js`: the startup order (theme, database, lock, app, service worker). `src/app.js`: the hash router and the shell. `src/sw.js`: the service worker. `src/teksten.js`: all texts of the app.
- `src/schermen/`: the screens Vandaag (today), Dagboek (diary: day, week, month), Drinken (drinks), Gewicht (weight), Supplementen (supplements), Meer (more: profile, favourites, badges, weight, settings), Delen (share), Hulp (help) and Welkom (welcome).
- `src/data/`: storage with Dexie. `db.js` holds the schema and the migrations. The other files are per subject (days, meals, drinks, weigh-ins, supplements, favourites, photos, settings, statistics, report), plus `vangnet.js` (a safety net for text typed just before the page disappears) and `wissen.js` for "Alles wissen" (erase everything).
- `src/logica/`: rules without a screen, such as streaks, badges, tracked days, weight figures, the week overview, the supplements and the supplement list as a file.
- `src/kern/`: small helpers for dates, numbers, scrolling and input type, and `bus.js`, a simple message bus between parts.
- `src/ui/`: reusable parts, charts, calendars, icons, the supplement card and the PDF report (`verslag-model.js`, `verslag-vel.js`, `verslag-pdf.js`, `pdf-fonts.js`, `pdf-tokens.js`, `pdf-vector.js`).
- `src/vergrendeling/`: the lock with a PIN code (`pin.js`, `cijferblok.js`) and Face ID or fingerprint through a passkey (`passkey.js`), the lock logic (`slot.js`), the lock screen (`scherm.js`) and the temporary exemption for the share sheet (`vrijstelling.js`).
- `src/meldingen/`: the reminders. `config.js` and `scherm.js` for the screen, `push.js` for permission and subscription, `tekst.js` for the text of the notification, `stand.js` for reading the data in the service worker and `klik.js` for opening the app when a notification is tapped.
- `src/pwa/`: registering the service worker and announcing a new version (`registratie.js`), and the install hint for the home screen (`installatie.js`).
- `src/uitleg/`: the guided tours and the how-to guides.
- `src/thema/`: the themes and the "auto" setting.
- `src/stijl/`: the CSS per part (base, derived sizes, components, layout, the screens, the style guide page). The colours come from the tokens in `bloei-huisstijl/tokens.css`.
- `src/iconen/`: the Font Awesome icons as SVG, in `solid/` and `regular/`. They are copied with `npm run huisstijl`.
- `src/demo/`: the sample data and the demo bar (only loaded in the demo build). `demo-publiek/og-bloei.png`: the Open Graph image of the demo.
- `bloei-huisstijl/`: the house style: `HUISSTIJL.md`, `tokens.css`, logo, app icons and splash screens.
- `fonts/`: the bundled fonts (Cormorant Garamond and Jost). They are copied with `npm run huisstijl`.
- `public/`: the app icons, the splash screens (`icons/`, `splash/`) and `robots.txt`. They are produced with `node scripts/kopieer-pwa.mjs`, which needs a browser (Playwright) to redraw the icons.
- `scripts/`: `kopieer-huisstijl.mjs`, `kopieer-pwa.mjs`, `maak-og-beeld.mjs` (the Open Graph image of the demo) and `csp.mjs` (the Content-Security-Policy, one source for the meta tag in the built pages and the header in `vercel.json`).
- `tests/`: `logica`, `ui`, `pwa` and `worker` (Vitest), `e2e` (Playwright), and `globaal-opstart.js` with `stand.js`.
- `worker/`: the reminder service. See Reminders.
- `vercel.json`: how Vercel builds the app (`npm run build`, output `dist`) and which headers the site sends (security and caching). `.vercelignore`: what Vercel does not need to upload to build.
- `.env.example`: all variables with an explanation (`VITE_PUSH_URL` and `VITE_VAPID_PUBLIEK` for the reminder service, `VITE_DEMO` and `DEMO_ADRES` for the demo). Copy it to `.env`; that file never goes into git. `.env.demo` only sets `VITE_DEMO=true` for the demo scripts and is in the repository (no secret).

## Privacy

All diary data lives on the device, in IndexedDB, and never leaves it. The same goes for the optional date of birth: it is only used on the device, to celebrate the user's birthday, and can be cleared at any time. Only when reminders are switched on does something go to the reminder service: the push address with the keys of that device, and the chosen times. Nothing from the diary goes to that service. There is no backup: if the app is removed, the browser data is cleared or the device is lost, the data is gone. A report or a supplement list is only shared when the user does so, as a file.

The built pages carry a strict Content-Security-Policy, and the app makes no external requests except to the reminder service and the weather service. Fonts and icons are bundled locally.

## Weather

The Today screen has a weather card, and the Today screen is the only place where weather appears. It gives the current temperature and conditions with the feels-like temperature, the figures for today (minimum, maximum, chance and amount of rain or snow, wind force in Beaufort with direction, wind speed, UV index, sunrise, sunset and humidity) and a seven-day outlook. The ten figures always fill their grid: a list in two columns of five on a narrow card (label left, value right), five columns by two rows on a wide one, and one column on a 320 px phone. On phones the card is the last one on the screen; on wide screens it sits next to the day summary, at the same height. The code is in `src/logica/weer.js` (pure rules), `src/data/weer.js` (location, request and what is kept) and `src/ui/weerkaart.js` (the card).

The encouraging sentence in the day summary follows the weather too: `weerSoort` in `src/logica/weer.js` turns the current weather into one of seventeen kinds, and `kiesMotivatie` in `src/logica/motivatie.js` picks a sentence of that kind that fits her day (drinking towards the goal, noting the day, what she already noted, supplements, goal reached, her streak). Eleven kinds are ordinary weather (thunder, snow, heat from 27 degrees, frost, rain, fog, wind, a warm day from 25 degrees, sun, cold, grey). Six are extreme weather and come first: storm (wind from 62 km/h), thunder with hail, heavy snow (or 5 cm in a day), freezing rain, heavy rain (or 20 mm in a day) and a heat wave (five days from today at 25 degrees or more, three of them at 30 or more, read from the forecast). For heat and extreme weather the sentence also gives advice (drink enough water, find shade, keep cool, stay safe indoors, look after yourself) and returns at opening in every part of the day; ordinary weather comes once per kind per day and then rotates with the other sentences. A sentence never states a weather figure. Next to the Drinking tile the summary shows the day goal as a percentage.

Open-Meteo is the only external service for the weather. The app asks the device for its current position (high accuracy, no cached position) and sends the coordinates, exactly as the device reports them, in one request to `api.open-meteo.com`: current conditions, the hours of one week and fourteen days. No place name is shown and no second service is used: Open-Meteo picks the grid cell of its model for that point (for Belgium the 2 km KNMI HARMONIE model).

The weather is always there, and the card never shows a failure message or a note:

- No position (location switched off, a desktop without a location service, the permission prompt still open): the app uses a fallback place, the last position this device gave, and otherwise the capital of the device's time zone (Brussels by default). If nothing fresh is on screen after 1.5 seconds, the weather of the fallback place is shown while the app keeps listening for the real position.
- No answer from the service, or no network: the app shows the forecast this device received last, for the current hour, for today and for the six days after (`weerVoorNu`). That forecast lasts one week. Meanwhile the app retries after 3, 6, 12 and 24 seconds and then every minute.
- Only a device that has never received an answer from the service (or none for a week) has nothing to show: the card then looks as it does while loading (dashes, no text) until the first answer arrives.

The location and the weather are fetched again at every opening of the app (starting before the first screen is drawn, if the device already allows location for Bloei), every time the user returns to the app, and every ten minutes while the app is in view; at opening, the stored forecast is on screen at once until the new one arrives. The device keeps the last position, rounded to two decimals (about one kilometre), and the last forecast in `localStorage` under one key (`bloei-weer`, about 20 kB): never in the database, so never in an export or a report, and erased by "erase everything". The demo shows sample weather, asks for no location and connects to nothing. Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0, free for non-commercial use).

## Reminders

Reminders come through the reminder service, a small Cloudflare Worker in `worker/`. Per device it only stores the push address (with the keys of that device) and the chosen times, and sends an empty signal at that time. The app chooses the text of the notification itself, on the device. Without the service the app works as usual, only without reminders.

How to deploy the service: see `worker/README.md`.

## Publishing

The code lives in a private repository on GitHub. The built site is public; the source is not. `vercel.json` describes how Vercel builds the app and which headers the site gets. The reminder service runs separately on Cloudflare (see Reminders). The steps for publishing, deploying the reminder service and installing on iPhone and iPad are in `HANDLEIDING-PUBLICEREN.md` (in Dutch, written for the owner of the app).

Two Vercel projects come out of the same code: the real app (without `VITE_DEMO`) and the demo (with `VITE_DEMO=true`). Both use `vercel.json` as it is. The reminder service only accepts the address of the real project.

## Third-party licences

Versions and licences come from `node_modules/<package>/package.json` and the LICENSE files.

| Package | Version | Licence | Used for |
|---|---|---|---|
| Dexie | 4.4.7 | Apache-2.0 | database on top of IndexedDB |
| Bootstrap | 5.3.9 | MIT | only reboot, grid and utilities CSS |
| fflate | 0.8.3 | MIT | compression for the PDF report |
| Font Awesome Free | 6.7.2 | icons CC BY 4.0, fonts SIL OFL 1.1, code MIT | icons (SVG files in `src/iconen/`) |
| Cormorant Garamond (via `@fontsource/cormorant-garamond`) | 5.3.0 | SIL OFL 1.1 | titles and large figures |
| Jost (via `@fontsource-variable/jost`, `@fontsource/jost`) | 5.3.0 | SIL OFL 1.1 | all other text |
| vite-plugin-pwa | 2.0.0 | MIT | build time only (service worker, manifest) |

Attribution and terms:

- Font Awesome Free 6.7.2 by Fonticons, Inc. (https://fontawesome.com). The icons are licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The SVG files in `src/iconen/` carry the notice in their comment. Only the SVG icons are in the app; the Font Awesome fonts are not.
- Cormorant Garamond: Copyright 2015 The Cormorant Project Authors. Jost: Copyright 2020 The Jost Project Authors. Both under the SIL Open Font License 1.1 (https://openfontlicense.org).
- Dexie: Apache License 2.0. Bootstrap and fflate: MIT. The licence texts are in the LICENSE file of each package.

Development tools (Vite, Vitest, Playwright, fake-indexeddb) are not part of the built app and are therefore not in the table.

## Rights

© 2026 Wesley Bogaerts. All rights reserved.

The project is `UNLICENSED` (see `package.json`): it is not open source and nobody may use, copy or distribute it without permission from the owner. The licences of the libraries, fonts and icons above continue to apply to those parts.
