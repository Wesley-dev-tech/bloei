# HERSTYLING: huisstijl Bloei

De eigenaar vindt de lay-out tot nu toe niet goed. De app krijgt een nieuwe huisstijl:
vrouwelijk, aantrekkelijk (gezondheid), elegant, strak en modern. De map `bloei-huisstijl/`
in de projectroot bevat alles: HUISSTIJL.md, tokens.css, logo/, icons/, splash/ en energie/.

Lees eerst CLAUDE.md, EISEN.md, BESLISSINGEN.md, PLAN.md en daarna `bloei-huisstijl/HUISSTIJL.md`
volledig. Voor alles wat visueel is, wint HUISSTIJL.md. Werk PLAN.md (design tokens en visuele
identiteit) en BESLISSINGEN.md (sectie "Visuele identiteit") bij zodat ze ernaar verwijzen.

Vaste keuzes van de eigenaar:
- Kleuren uit coolors.co: https://coolors.co/3b2a3c-b5707c-eed9d6-8ea58c-9fbdbf-fbf7f4
- Iconen: Font Awesome Free 6, lokaal als inline SVG (exacte lijst in HUISSTIJL.md §5).
- Lettertypes: Google Fonts Cormorant Garamond + Jost, lokaal als woff2 in /fonts.
- Geen illustraties. Wel het logo en de app-iconen uit `bloei-huisstijl/`.
- Webapplicatie én installeerbaar op de iPhone van de gebruiker (PWA, HUISSTIJL.md §9).

Start het team opnieuw op (strategie C, teamwerk):
- **Spoor A - fundament:** tokens.css overnemen als enige bron, fonts en Font Awesome lokaal
  installeren (npm, daarna alleen de nodige bestanden kopiëren), basiscomponenten (kaart,
  knoppen, chips, tabbalk, zijbalk, invoer) en een stijlpagina `/stijl.html`.
  **Stop daarna en laat de eigenaar de stijlpagina goedkeuren.**
- **Spoor B - schermen, iconen en beeld:** Vandaag, Dagboek, Drinken, Gewicht en Meer herbouwen
  op de nieuwe componenten, met het logo bovenaan Vandaag. Pas **elk** icoon, gezichtje en beeld
  aan de huisstijl aan:
  - alle iconen volgens HUISSTIJL.md §5 en §5.1 (icoontegels per familie, kleuren uit de tokens);
  - de gevoelschaal volgens §5.2 (vijf Font Awesome-gezichtjes met `--mood-1` t.e.m. `--mood-5`),
    dezelfde kleuren in de maandkalender (E2) en de stemming op Vandaag;
  - de energiekaartjes en energie-kaarsjes volledig vervangen door de energieschaal met
    blaadjes volgens §5.3 (energiekaart, kiezer, en het kleine blaadje in de maandkalender);
  - maaltijdfoto's, miniaturen, profielfoto, badges en lege toestanden volgens §6;
  - alle emoji, oude zelfgetekende gezichtjes, illustraties en losse SVG's/afbeeldingen die niet
    uit `bloei-huisstijl/` komen, verwijderen.
  Bestaande data en het datamodel blijven ongewijzigd; oude stemmingswaarden mappen 1-op-1 op
  de vijf nieuwe stappen (geen migratie van opgeslagen data).
- **Spoor C - PWA en layout:** manifest, favicon, app-iconen en apple-touch-icon uit `icons/`,
  de opstartschermen uit `splash/` (licht en Nacht, met de juiste `media`-queries per iPhone),
  logo-varianten uit `logo/` (Nacht-thema gebruikt `bloei-mark-nacht.svg`), meta-tags, safe-areas,
  thema's Poeder/Salie/Nacht en de responsive layout (tabbalk → zijbalk vanaf 960px).
- **Tester:** na elke stap screenshots in 390x844 en 1280x800, licht en Nacht, en elk scherm
  naast HUISSTIJL.md §5, §6 en §10 "Niet doen" leggen. Zoek expliciet naar overgebleven emoji, kaarsjes,
  kale zwarte iconen, kleuren buiten tokens.css en afbeeldingen die niet uit `bloei-huisstijl/` komen.

Start de lokale server opnieuw en open de app in de Chrome van de eigenaar om te testen.
Voeg per stap een rij toe aan LOGBOEK.md en een rij voor deze herstyling aan ITERATIES.md.
Niet committen zonder akkoord van de eigenaar.
