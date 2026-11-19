# Bloei, een persoonlijk dagboek als PWA

## Wat Bloei is

Bloei is een dagboek voor eten, drinken, supplementen, gewicht en stemming. Het is gemaakt voor één persoon per toestel die rustig wil bijhouden wat er gebeurt, zonder calorieën te tellen en zonder oordeel. Er staan geen rode kleuren en geen waarschuwingen in bij een stijgend gewicht. De teksten zijn in gewoon Vlaams Nederlands.

Alles blijft op het toestel. Er is geen account en er is geen server voor dagboekgegevens. Een verslag van een gekozen periode maakt de app als pdf, en de gebruiker beslist zelf of en met wie dat gedeeld wordt, bijvoorbeeld met een diëtist.

Er is ook een demoversie uit dezelfde code, met eigen voorbeeldgegevens, zonder vergrendeling en zonder meldingen. Alle afbeeldingen in dit document komen uit die demo.

![Vandaag op een telefoon, thema Poeder](schermen/vandaag-telefoon-poeder.png)

## De schermen

- **Vandaag**: begroeting volgens het moment van de dag, de waterstand, de maaltijden van vandaag, stemming en energie, en de reeks van bijgehouden dagen.
- **Dagboek**: per dag, week of maand. Per dag zes maaltijdmomenten met uur, vrije tekst en een gevoel erna, plus een notitie. De maand toont de stemming als gekleurde bolletjes.
- **Drinken**: één tik voor de kan water (800 ml), een instelbaar dagdoel, een weekoverzicht per soort drank en een weghaalknop voor een tik te veel.
- **Supplementen**: een afvinklijst per dag, met schema, begin- en einddatum en een eigen kaart per supplement.
- **Gewicht**: een weging per week op een instelbare weegdag, een grafiek en een optioneel streefgewicht. Het verschil met de vorige weging staat er als gewoon getal.
- **Algemeen**: profiel, favoriete maaltijden, badges, instellingen (drinken, gewicht, herinneringen, vergrendeling, thema), de kaarten Over en Privacy.
- **Badges**: medailles voor wat er bijgehouden is. Een gemiste dag kost niets.
- **Delen**: een verslag van gisteren, een week of een eigen periode, met alleen eten, drinken, gewicht en notities als keuze. Het verslag staat op het scherm en gaat als pdf naar het deelmenu, naar een bestand of naar de printer. De pdf wordt in de app zelf geschreven, met fflate voor compressie.
- **Uitleg**: een rondleiding die per scherm op de knoppen wijst.
- **Welkom**: een korte start met profiel, doelen en eventueel een pincode.

![Dagboek, weekweergave op desktop](schermen/dagboek-week-desktop.png)
![Delen met voorbeeld van het verslag](schermen/delen-telefoon.png)

## De techniek en waarom

- **Gewoon JavaScript, geen framework.** De app is klein genoeg om elk onderdeel te kunnen volgen, en er is geen frameworkversie om bij te houden. Een eenvoudige bus verbindt de onderdelen.
- **Vite** voor ontwikkelen en bouwen, met een service worker en manifest uit vite-plugin-pwa.
- **IndexedDB via Dexie.** Het schema en de migraties staan in `src/data/db.js`; de opslag is per onderwerp opgesplitst. Gegevens blijven na herladen staan.
- **Hash-router.** Een statische host hoeft geen routes te kennen en de app werkt ook in een submap.
- **PWA.** De app werkt offline en is te installeren op iPhone en iPad ("Zet op beginscherm"), op desktop, en op Android. Voor Android is een apk via een Trusted Web Activity (Bubblewrap) besloten als vervolg. Die is nog niet gebouwd.
- **Strikte Content Security Policy met Trusted Types.** De policy komt uit één bron (`scripts/csp.mjs`) en staat in de gebouwde pagina's en in de koppen van `vercel.json`. De app doet geen externe verzoeken, behalve naar de meldingsdienst. Lettertypes en iconen worden lokaal meegeleverd.
- **Eigen huisstijl.** Alle kleuren staan als tokens in `bloei-huisstijl/tokens.css`, met drie thema's (Poeder, Salie en Nacht) en een stand "auto" die het toestel volgt. Elk tabblad heeft een eigen kleur. Lettertypes zijn Cormorant Garamond en Jost, de iconen komen uit Font Awesome Free. Vanaf 960 px wordt de tabbalk een zijbalk.

![Vandaag in Salie op de telefoon](schermen/thema-salie-telefoon.png)
![Vandaag in Nacht op de telefoon](schermen/thema-nacht-telefoon.png)

## Privacy en beveiliging

Dagboekgegevens verlaten het toestel niet: geen analytics, geen account, geen server voor gegevens. Er is bewust geen back-up en geen import. Verwijder je de app of wis je de browsergegevens, dan zijn de gegevens weg.

De vergrendeling gebruikt een pincode van zes cijfers, bewaard als PBKDF2-SHA-256 met zout (210 000 rondes volgens het logboek), of Face ID of een vingerafdruk via een passkey van het toestel. Wie de pincode vergeet, heeft twee wegen: bevestigen met het toestel, of een herstelcode van twaalf tekens die de app één keer toont. Er zijn geen herstelvragen. "Alles wissen en opnieuw beginnen" blijft de laatste uitweg.

Wat het slot wel doet: het houdt meekijkers buiten en verbergt de inhoud zolang het dicht is. Wat het niet doet: het versleutelt de gegevens niet. Wie het schermslot van het toestel kent, kan een nieuwe pincode voor Bloei kiezen. De maker aanvaardde dat gevolg bewust. De app belooft nergens meer dan dit, en de README zegt het ook zo.

Meldingen komen via web push. De code staat er: `src/meldingen/` in de app en een kleine Cloudflare Worker in `worker/`. De dienst bewaart per toestel alleen het adres voor de melding met de sleutels van dat toestel en de gekozen uren, en stuurt op dat uur een leeg signaal. De tekst van de melding kiest de app zelf op het toestel. Er gaat niets uit het dagboek naar de dienst. De dienst aanvaardt één origin, en de demo doet nooit een verzoek naar haar. Zonder de dienst werkt de app volledig, alleen zonder herinneringen. Op iPhone werkt web push alleen als de app op het beginscherm staat. Of de dienst nu ergens draait, blijkt niet uit de bestanden.

## Toegankelijkheid

- Tikvlakken van minstens 44 px, met een bewuste uitzondering voor de zeven kleinste knoppen op telefoons van 320 tot 360 px breed. Die uitzondering is vastgelegd in een test.
- Contrast is gemeten op de tokens. Het logboek noemt een paar combinaties in de tokens die onder de gebruikelijke grens vielen, en die zijn aan de maker voorgelegd.
- Weekdagknoppen en andere icoonknoppen dragen een aria-label.
- Een schermlezer is niet getest. VoiceOver en TalkBack staan op de lijst voor een echt toestel.

## De werkwijze

De eigenaar beslist en keurt goed. Een AI-teamlead (Claude Fable 5.2) bouwt niet zelf, maar verdeelt het werk over een team van AI-agents (Sonnet 5.5 en Opus 5.5) en een tester. Elke bouwer werkt in de eigen bestanden van zijn spoor.

- `EISEN.md` bevat wat de app moet doen, inclusief een lijst van wat er niet in mag, zoals gradiënten, glaseffecten en standaardemoji.
- `BESLISSINGEN.md` nummert elke beslissing (tot en met 553), met wat de eigenaar zei en wat de teamlead zelf invulde.
- `PLAN.md` is de bron van waarheid: contracten, stappen en per hoofdstuk wat nog open staat.
- `LOGBOEK.md` krijgt een rij per stap en `ITERATIES.md` een rij per ronde feedback, met welk model het werk deed en of de eigenaar het goedkeurde.

Er is niets gecommit of gepubliceerd zonder akkoord van de eigenaar.

## Testen

- **Vitest** voor logica, onderdelen, de PWA-laag en de meldingsdienst: 73 testbestanden in `tests/logica`, `tests/ui`, `tests/pwa` en `tests/worker`. De stijlregels (tokens, teksten zonder verboden woorden en tekens, knopkleuren, hover) worden daar ook bewaakt.
- **Playwright** op de gebouwde app: 72 specbestanden in `tests/e2e`, op telefoonformaat (390 bij 844) en andere formaten, in alle drie de thema's.
- **Drie rondes**: gewoon (de echte bouw zonder meldingsdienst), demo (de demobouw) en push (een bouw met een nepdienst, nooit het echte adres). `npm run test:alles` laat de rondes na elkaar draaien en faalt bij één rode of één overgeslagen test.

De eindtests op de laatste stand lopen nog. Hier staat dus geen uitslag.

## Wat nog niet bewezen is

Alleen op een echt toestel te bewijzen, volgens PLAN.md: Face ID en vingerafdruk, het herstel met het toestel op iPhone, Android en Windows, schermafbeeldingen met het slot aan, het deelmenu, schermlezers, het opstartscherm en de veilige zones van de iPhone, en de apk. De app is niet gepubliceerd.

## Wat de maker eruit leerde

Alleen wat uit de projectbestanden blijkt:

- De eerste vormgeving was te kinderachtig. De eigenaar stuurde bij en koos daarna een eigen huisstijl, waarna de stijlpagina eerst werd goedgekeurd voordat de schermen kwamen.
- De rapporten van bouwers zijn geen bewijs. Een bouwer meldde zelf dat een test ook slaagde vóór de herstelling, en een tester keurde een stap af die de bouwer als klaar had gemeld. Daarom rekent het project met een aparte tester en met controle in de browser.
- Teamleden die in dezelfde bestanden werken, richten schade aan, zoals in het gedeelde stijlbestand op 14 november. Daarna werkte elk teamlid in eigen bestanden.
- Een uitslag haal je uit het rapport van de testtool en niet uit de tekst op het scherm. Daarom telt de rondeloper overgeslagen tests mee als fout.
- De eisen veranderden onderweg, bijvoorbeeld de back-up die verviel. Ze zijn bijgewerkt in plaats van losgelaten, met een verwijzing naar de beslissing.
