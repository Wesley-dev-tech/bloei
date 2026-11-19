# HUISSTIJL: Bloei

De huisstijl van de dagboek-app Bloei. Dit document en `tokens.css` zijn de bron van waarheid
voor alles wat visueel is. Bij een conflict met eerdere ontwerpbeslissingen in BESLISSINGEN.md
of PLAN.md wint dit document.

## 1. Concept
**Naam:** Bloei (werktitel, één woord, klein geschreven: `bloei`).
**Idee:** elke dag een beetje groeien. Zacht en vrouwelijk, maar strak en volwassen:
denk aan een verzorgingsmerk of een boetiekhotel, niet aan een kinderapp of een fitnesstracker.
**Sleutelwoorden:** elegant · rustig · verzorgd · licht · modern.

## 2. Logo
- **Beeldmerk** (`logo/bloei-mark.svg`): drie bloemblaadjes die uit één punt groeien:
  oudroze (eten), poederroze (het midden, de gebruiker) en salie (drinken/gezondheid).
- **Woordmerk:** `bloei` in Cormorant Garamond Italic 500, kleur aubergine, gezet als HTML-tekst
  naast het beeldmerk (beeldmerk = 1,1 x de hoogte van de tekst, tussenruimte = 0,4 x die hoogte).
- **App-icoon** (`logo/bloei-app-icon.svg`, PNG's in `icons/`): beeldmerk op aubergine. iOS rondt
  zelf af: géén eigen afgeronde hoeken of schaduw in het icoon.
- Vrije ruimte rond het logo ≥ de breedte van het middelste blaadje. Logo nooit vervormen,
  herkleuren, omlijnen of op een drukke foto zetten.
- Het logo verschijnt op: het openingsscherm (splash), bovenaan "Vandaag" (klein, 28px),
  de pincodevergrendeling en "Meer › Over".

## 3. Kleuren
Palet op coolors.co: https://coolors.co/3b2a3c-b5707c-eed9d6-8ea58c-9fbdbf-fbf7f4

| Naam | Hex | Rol |
|---|---|---|
| Aubergine | `#3B2A3C` | tekst, primaire knop, app-icoon |
| Oudroze | `#B5707C` | accent: iconen, actieve tab, grafieklijn (als tekst: `#9A5A66`) |
| Poederroze | `#EED9D6` | zachte vlakken, actieve achtergrond, voortgangsbaan |
| Salie | `#8EA58C` | gezondheid: doel gehaald, streak, positief |
| Mist | `#9FBDBF` | drinken en water |
| Pruim | `#8C5A92` | Vandaag |
| Abrikoos | `#DE9B76` | Dagboek (zacht `#FBEDE4`, icoon `#B87154`, tekst `#9D583C`; abrikoos sinds 15 november, BESLISSING 368; was kasjmier `#A28B78`) |
| Duifblauw | `#6F86AE` | Gewicht |
| Lavendel | `#7F7FC4` | Delen en verslag (zacht `#ECECF8`, lichter `#F5F5FB`, icoon en tekst `#5757A3`, gevulde tegel: lavendel met wit icoon; lavendel sinds 15 november, BESLISSING 369; was aubergine `#3B2A3C`, zacht `#E6E0E7`) |
| Porselein | `#FBF7F4` | achtergrond |

Verhouding per scherm: ±70% porselein/wit, ±20% aubergine-tekst, ±10% accenten.
Eén accentkleur per kaart. **Nooit rood**, nooit verlopen in regenboogkleuren, nooit neon.
Thema's: **Poeder** (standaard), **Salie** (pastel) en **Nacht** (donker), allemaal in `tokens.css`.

Bijgesteld voor contrast (BESLISSING 340; de merkkleuren hierboven blijven onaangeroerd, alleen de rolwaarden voor tekst en gevulde bediening):

| Token | Was | Nu | Waar |
|---|---|---|---|
| `--c-text-muted` | `#7A6A78` | `#756573` | Poeder en Salie |
| `--c-accent-text` | `#56705A` | `#546E58` | Salie |
| `--c-accent-text-op-soft` (nieuw) | - | `#8D4F5B` | Poeder (profielletter); Salie en Nacht volgen `--c-accent-text` |
| `--c-weight-text` (nieuw) | - | `#536A91` | Poeder en Salie (blauw als tekst); Nacht volgt `--c-weight` |
| `--c-health-text` (nieuw) | - | `#546F52` | Poeder en Salie (salie als tekst); Nacht volgt `--tile-health-fg` |
| `--c-health-gevuld` (nieuw) | - | `#7D937B` | Poeder en Salie (vinkvak, schakelaar aan); Nacht volgt `--c-health` |
| `--c-on-health` (nieuw) | - | `#3B2A3C` | tekst op het volle salievlak; Nacht volgt `--c-surface` |
| `--c-focus` (nieuw) | - | `#AD6874` | Poeder (focusring); Salie volgt `--c-accent-text`, Nacht `--c-accent` |
| `--shadow-float` | `0 12px 32px -12px rgba(59,42,60,.28)` | diepere zwarte schaduw plus lichte rand | alleen Nacht |

## 4. Typografie (Google Fonts, lokaal meegeleverd)
- **Cormorant Garamond** (500, 600, 500 italic): schermtitels, begroeting, grote cijfers
  (glazen, kilo's), het woordmerk. Nooit voor knoppen, labels of lopende tekst.
- **Jost** (300 - 600, variabel): alle UI-tekst, knoppen, labels, invoer, tabbalk.
- Labels: Jost 500, 12px, HOOFDLETTERS, letter-spacing 0,12em, kleur `--c-text-muted`.
- Cijfers in Jost met `font-variant-numeric: tabular-nums`.
- Invoervelden minstens 16px (anders zoomt iOS in).
- Download de woff2-bestanden via Google Fonts (of `@fontsource/cormorant-garamond` en
  `@fontsource-variable/jost`) en zet ze in `/fonts`. Geen link naar fonts.googleapis.com.

## 5. Iconen (Font Awesome Free 6, lokaal meegeleverd)
Gebruik alleen deze iconen, als inline SVG (sprite of losse SVG's uit `@fortawesome/fontawesome-free/svgs`).
Geen emoji in de interface. Iconen 20px in lijsten, 24px in de tabbalk, kleur `currentColor`.

| Waar | Icoon |
|---|---|
| Tab Vandaag | `solid/sun` |
| Tab Dagboek | `solid/book-open` |
| Tab Drinken | `solid/glass-water` |
| Tab Gewicht | `solid/weight-scale` |
| Tab Meer | `solid/ellipsis` |
| Ontbijt | `solid/mug-saucer` |
| Tussendoortje | `solid/apple-whole` |
| Middagmaal | `solid/bowl-food` |
| Vieruurtje | `solid/cookie-bite` |
| Avondmaal | `solid/utensils` |
| Late snack | `solid/moon` |
| Drank kan water / glas water / thee / koffie / sap / frisdrank | `glass-water` / `glass-water` / `mug-hot` / `mug-saucer` / `lemon` / `bottle-water` |
| Energie | eigen blaadjes, zie §5.3 (geen FA-icoon) |
| Streak | `solid/seedling` |
| Badge | `solid/award` |
| Foto | `solid/camera` |
| Notitie | `solid/pen` |
| Favoriet | `regular/heart` / `solid/heart` |
| Herinnering | `solid/bell` |
| Vorige / volgende dag | `solid/chevron-left` / `solid/chevron-right` |
| Ongedaan maken | `solid/rotate-left` |
| Instellingen | `solid/sliders` |
| Vergrendeling | `solid/lock` |

### 5.1 Hoe een icoon er in Bloei uitziet
Font Awesome levert de vorm, Bloei geeft de stijl. Een kaal, zwart FA-icoon komt nergens voor.
- **Icoontegel:** elk inhoudsicoon (maaltijd, drank, badge, instelling) staat in een tegel van
  40x40, radius 14 (`--tile-*`), icoon 18px, gecentreerd. Achtergrond en kleur per familie:
  - maaltijden → poederroze tegel, oudroze icoon (`--tile-meal-*`), voor álle zes momenten
    dezelfde kleur, geen regenboog;
  - dranken → mist-tegel, waterblauw-grijs icoon (`--tile-drink-*`);
  - streak, badges, doel gehaald → salie-tegel (`--tile-health-*`);
  - Vandaag → pruim-tegel (`--tile-day-*`); Dagboek → abrikoos-tegel (`--tile-book-*`); Gewicht → duifblauw-tegel (`--tile-weight-*`); Delen en verslag → lavendel-tegel (`--tile-share-*`);
  - instellingen en hulpfuncties → neutrale tegel (`--tile-neutral-*`).
- **Navigatie- en actie-iconen** (tabbalk, chevrons, ongedaan maken) staan zónder tegel, in
  `currentColor`: inactief `--c-text-muted`, actief `--c-accent`.
- Iconen nooit met schaduw, rand, verloop of kleur buiten de tokens. Lijndikte niet mengen:
  inhoud = `solid`, gevoel en favoriet/bel = `regular`.

### 5.2 Gevoelschaal (gezichtjes)
Vijf stappen, van links naar rechts, alleen Font Awesome `regular`:

| Stap | Label | Icoon | Kleur | Tegel |
|---|---|---|---|---|
| 1 | moe | `face-tired` | `--mood-1` lavendelgrijs (#8983A6; Nacht #9D98B5) | `--mood-1-soft` |
| 2 | gewoon | `face-meh` | `--mood-2` lila (#987EB5; Nacht #B7A5CB) | `--mood-2-soft` |
| 3 | goed | `face-smile` | `--mood-3` zandgoud (#A3844C; Nacht #B89B66) | `--mood-3-soft` |
| 4 | blij | `face-grin-beam` | `--mood-4` honing (#AD812F; Nacht #CFA24E) | `--mood-4-soft` |
| 5 | stralend | `face-grin-hearts` | `--mood-5` goud (#A77A27; Nacht #BC8A2C) | `--mood-5-soft` |

- BESLISSING 414: de stapkleuren zijn in Poeder en Salie donkerder gemaakt (zelfde tint) zodat het gezichtje minstens 3 : 1 haalt op zijn `-soft`-tegel en op wit; Nacht houdt de oude waarden. Ook `--schakel-uit` (de uit-stand van schakelaar en vinkvak) in Poeder: 75 % `--c-text-muted` op de kaart, #988C96 (3,2 : 1).
- Niet gekozen: icoon 26px in `--c-text-muted` op transparant, label eronder (Jost 12px).
- Gekozen: ronde tegel 48px in de `-soft`-kleur, icoon in de stapkleur, schaal 1 → 1,08,
  label in `--c-text`. Maar één tegelvorm is hier rond: zo valt de keuze op.
- Dezelfde kleuren vullen de bolletjes in de maandkalender (E2) en de stemming op "Vandaag".
- Geen rood, geen oranje, geen tranen: "moe" is de laagste stap, nooit "slecht".

### 5.3 Energieschaal (blaadjes)
Energie krijgt geen kaarsjes, batterijen, bliksems of emoji meer, maar een eigen merkelement:
**vijf blaadjes uit het Bloei-logo** (`energie/blad.svg`), naast elkaar, van klein naar groot.

| Stap | Woord | Gevulde blaadjes |
|---|---|---|
| 1 | laag | 1 |
| 2 | rustig | 2 |
| 3 | gewoon | 3 |
| 4 | goed | 4 |
| 5 | vol | 5 |

- Gevuld = `--energy-on` (oudroze), leeg = `--energy-off` (poederroze). Nacht-thema volgt vanzelf.
- Hoogte van de blaadjes 70 / 77,5 / 85 / 92,5 / 100% van `--energy-leaf-h`, onderaan uitgelijnd,
  tussenruimte `--energy-gap`. Kant-en-klare versies: `energie/energie-1.svg` t.e.m. `-5.svg`.
- **Energiekaart:** gewone kaart; links het label ENERGIE (label-stijl) met daaronder het woord in
  Cormorant Italic 32px, rechts de blaadjes. Voorbeeld: `energie/voorbeeld-energiekaart.png`
  (de echte kaart gebruikt Cormorant en Jost).
- **Kiezen:** elk blaadje is een tikvlak van minstens 44x48; tikken op blaadje 4 vult 1 t.e.m. 4,
  met een korte groei-animatie (schaal 0,8 → 1, 260ms) en `navigator.vibrate(8)`.
- **Maandkalender (E2):** de stemming blijft het gekleurde bolletje; energie verschijnt als één
  klein blaadje (8px) rechtsboven de dag, dekking 0,3 / 0,45 / 0,6 / 0,8 / 1 per stap.
- Lage energie is nooit negatief: geen grijs, geen leeg-batterij-gevoel, geen waarschuwing.

## 6. Beeld
- Geen illustraties, geen stockfoto's, geen 3D, geen mascottes, geen emoji.
- **Logo-varianten** (`logo/`): `bloei-mark.svg` (licht), `bloei-mark-nacht.svg` (donker thema),
  `bloei-mark-mono.svg` (één kleur via `currentColor`, voor kleine plekken en lege toestanden),
  `bloei-app-icon.svg` (bron voor de app-iconen).
- **Maaltijdfoto's van de gebruiker** krijgen overal dezelfde behandeling: `object-fit: cover`,
  radius `--photo-radius`, een haarlijn `--photo-ring`, verhouding 4:3 in de kaart en 1:1 als
  miniatuur (56px, radius 12). Staat er tekst op de foto, dan altijd over `--photo-tint`.
  Bij het opslaan: comprimeren naar max 1600px breed, JPEG 80%. Geen filters op de foto zelf.
- **Zonder foto:** de maaltijdtegel (poederroze, oudroze icoon) op dezelfde plek en in dezelfde
  maat als de miniatuur, zodat de lijst strak uitlijnt.
- **Lege toestanden:** `bloei-mark-mono.svg` 64px in `--c-accent-soft` + één zin in
  Cormorant Italic, bv. "Nog niets genoteerd vandaag." Geen tekening.
- **Profielfoto** (E8): rond, 40px, ring 2px `--c-bg` + 1px `--c-line`. Zonder foto: initiaal
  "C" in Cormorant 600 op poederroze. Geen emoji als avatar.
- **Badges** (E5): salie-tegel 56px met `seedling` of `award`; nog niet behaald = neutrale tegel
  met het icoon op 40% dekking, nooit grijs uitgevaagd met een slotje.
- **Opstartschermen iPhone** (`splash/`): beeldmerk op porselein (`splash-poeder-*`) of op
  nachtkleur (`splash-nacht-*`), voor alle gangbare iPhone-formaten, gekoppeld met
  `<link rel="apple-touch-startup-image" media="...">`.
- **Favicon:** `icons/favicon.svg`; app-iconen: `icons/apple-touch-icon.png` (180),
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.

## 7. Componenten
- **Kaart:** wit, radius 16, padding 20, `--shadow-card`, géén rand én schaduw tegelijk.
- **Primaire knop:** aubergine, tekst porselein, hoogte 52, radius pill, Jost 500 16px.
- **Secundaire knop:** transparant, 1px `--c-line`, tekst aubergine.
- **Chip / segment** (1M · 3M · 1J, dranksoort): `--c-surface-soft`, actief `--c-accent-soft`
  met tekst `--c-accent-text`.
- **Tabbalk (telefoon):** wit met 1px bovenlijn, 5 tabs, icoon + label 11px; actief = oudroze
  icoon en een stipje van 4px eronder. Hoogte 64 + safe-area onderaan.
- **Zijbalk (desktop ≥ 960px):** zelfde 5 items verticaal, logo bovenaan, breedte 248.
- **Watervulling:** afgeronde fles/glas als SVG-vorm, vulling `--c-water`, golflijn die zacht
  beweegt; doel gehaald → de vulling wordt salie en het beeldmerk "bloeit" (blaadjes schalen
  van 0,9 naar 1, 600ms). Geen confetti in regenboogkleuren: hooguit 12 blaadjes in de merkkleuren.
- **Gewichtsgrafiek:** dunne lijn oudroze 2px, punten 6px, streefgewicht als stippellijn salie,
  geen rasterlijnen behalve één baseline. Stijging en daling zien er identiek uit.
- **Begroeting:** "Goeiemorgen, Testnaam" in Cormorant 44px, daaronder datum als label.

## 8. Ritme en beweging
- Raster van 4px; schermmarge 20px; ruimte tussen kaarten 16px; tussen secties 32px.
- Overgangen 260ms `--ease`; tikken geeft schaal 0,97 + `navigator.vibrate(8)` waar mogelijk.
- `prefers-reduced-motion`: alle animaties uit.

## 9. Webapp én iPhone
- Eén codebase, responsive: telefoon (tabbalk onderaan), tablet (gecentreerd, max 560),
  desktop ≥ 960px (zijbalk links, inhoud max 720, twee kolommen op "Vandaag").
- PWA-installatie op iPhone via Safari › Deel › Zet op beginscherm:
  `manifest.webmanifest` (name "Bloei", short_name "Bloei", display "standalone",
  background_color `#FBF7F4`, theme_color `#FBF7F4`, iconen 192/512/maskable),
  `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
  `<meta name="apple-mobile-web-app-title" content="Bloei">`,
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  en padding met `env(safe-area-inset-*)` boven en onder.
- In Nacht-thema: `theme-color` `#1F1720`.

## 10. Niet doen (vibecoding-trekjes)
Paarse/blauwe verlopen, glassmorphism, emoji als icoon, Inter/Poppins/Roboto, gekleurde
linkerrand op kaarten, overal pill-badges, gecentreerde hero met drie feature-kaarten,
neon-accenten, grijze schaduwen op elke laag, willekeurige hexwaarden buiten `tokens.css`.
