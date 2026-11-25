# Bloei publiceren en installeren op iPhone en iPad

Deze handleiding is voor de eigenaar van de app en voor wie dit voor het eerst doet. Ze brengt je van de code op je computer naar een werkende app met meldingen op de iPhone en de iPad.

Zo ziet het geheel eruit:

- **De code** staat in een **privérepo** op je GitHub-account (BESLISSING 338).
- **De app** bouwt en publiceert **Vercel** uit die repo, op een eigen adres: `https://<project>.vercel.app`, of later een eigen domein (BESLISSING 347).
- **De meldingsdienst** is een kleine Cloudflare Worker uit de map `worker/`. Hij staat niet op Vercel, omdat hij elk kwartier moet lopen en een geplande taak op het gratis Vercel-abonnement maar één keer per dag mag lopen.

Wat nagekeken is tegen de code, staat er gewoon. Wat niet na te gaan was zonder echt uit te rollen (instellingen en knoppen in de dashboards van GitHub, Vercel en Cloudflare), staat erbij als **na te kijken**. Achteraan staat een lijst met alles wat je in de dashboards zelf moet nakijken.

**Voorbeeldwaarden zijn verzonnen.** Vervang ze door je eigen waarden:

- `<jouw-gebruikersnaam>`: je gebruikersnaam op GitHub;
- `https://jouw-project.vercel.app`: het adres van de app op Vercel;
- `https://bloei-herinneringen.<jouw-subdomein>.workers.dev`: het adres van de meldingsdienst.

De commando's zijn voor PowerShell op Windows, uitgevoerd in de projectmap, tenzij er iets anders staat. Op een Mac werken ze ook, behalve waar een aparte Mac-versie staat.

## 0. Wat je nodig hebt

- Node.js en npm op je computer. Vite vraagt Node 20.19 of nieuwer (of 22.12 of nieuwer), de tests (Vitest) Node 22.12 of nieuwer. De app is ontwikkeld met Node 26. Controleer met `node -v`.
- Git. Controleer met `git --version`.
- Je GitHub-account, je Vercel-account (aan je GitHub-account gekoppeld) en je Cloudflare-account.
- De iPhone en de iPad, met **iOS of iPadOS 16.4 of nieuwer**. Eerder bestaan meldingen voor een app op het beginscherm niet. De app zelf werkt ook op oudere versies, maar dan zonder meldingen.
- Safari op die toestellen. Meldingen werken alleen als de app op het beginscherm staat, niet in een Safari-tabblad.

Voor Android komt er na de publicatie een extra deel: 6b (de apk maken met Bubblewrap). De volgorde is: (1) nakijken wat publiek wordt, (2) de privérepo, (3) de meldingsdienst, (4) de app op Vercel, (5) de dienst het adres van de app geven, (6) de toestellen. Stap 3 komt vóór stap 4 omdat de app bij het bouwen het adres van de dienst nodig heeft; stap 5 komt na stap 4 omdat je het adres van de app pas kent als Vercel het project heeft gemaakt.

## 1. Wat privé blijft en wat publiek wordt

**De repo is privé, de site is publiek.** Iedereen die het adres kent, kan de app openen en de gebouwde bestanden lezen: de html, de verkleinde JavaScript en CSS, het manifest, de iconen. Wat in de bron staat en in de app terechtkomt (teksten, voorbeeldnamen, commentaar dat de bouw niet weghaalt), is dus publiek. Daarom geldt BESLISSING 319 voor alles wat gebouwd wordt: **geen naam van een gebruiker en geen persoonsgegeven, ook geen voornaam.** In code, tests en testgegevens staan alleen neutrale namen zoals "Testnaam".

**Wat niet in de site komt.** De bouw (`npm run build`) zet alleen de app in de map `dist`: `index.html`, `sw.js`, `manifest.webmanifest`, `robots.txt`, de map `assets` (met een hash in elke bestandsnaam), `icons` en `splash`. Er komen geen bronkaarten (`.map`) in, geen tests, geen documenten en geen `.env`. Ook de stijlpagina (`stijl.html`) zit er niet in: die wordt alleen gebouwd voor de schermtests. Vercel publiceert alleen de map `dist` (`outputDirectory` in `vercel.json`).

**`.vercelignore` en het verschil tussen "niet uploaden" en "niet publiceren".** `.vercelignore` zegt welke bestanden Vercel niet naar zijn bouwmachine hoeft te halen (tests, de map `worker`, de projectdocumenten). Dat is een besparing en een extra slot, maar het bepaalt niet wat publiek wordt. Wat publiek wordt, is alleen wat de bouw in `dist` zet. Een bestand dat niet in `.vercelignore` staat, wordt dus niet daardoor publiek; een bestand in `dist` wordt publiek, ook als het in `.vercelignore` staat.

**Wat nooit ergens in komt, ook niet in de privérepo:** `.env`, `.env.local`, `worker/.dev.vars`, `.verboden-woorden.local` en de private VAPID-sleutel (`VAPID_PRIVE`). Ze staan in `.gitignore`.

**De controle op namen: `.verboden-woorden.local`.** De test `tests/logica/publiek.test.js` doorzoekt elk bestand dat in de repo zou komen op e-mailadressen, sleutels, tokens, paden met een gebruikersmap en metadata in afbeeldingen. Echte namen staan niet in de test zelf; die zet je in een eigen bestand:

1. Maak in de projectmap een tekstbestand `.verboden-woorden.local`.
2. Zet er één woord per regel in: de voornaam en de achternaam van de gebruiker, elk op een eigen regel, je eigen achternaam als je die niet in de repo wil, en namen uit haar supplementenlijst. Een regel die met `#` begint, is commentaar.
3. Bewaar het bestand. Het staat in `.gitignore` en komt nooit in git.
4. Draai de tests:

   ```
   npm test
   ```

   Zolang het bestand bestaat, faalt `npm test` als een van die woorden nog ergens staat. De uitvoer noemt alleen het bestand, de regel en het volgnummer van het woord, nooit het woord zelf. Een lijst buiten de projectmap kan ook: `$env:VERBODEN_WOORDEN_BESTAND="<pad naar je lijst>"; npm test`.

Publiceer niet zolang die test faalt.

## 2. De privérepo op GitHub

### Welke bestanden meegaan

Nu de repo privé is, mogen de projectdocumenten (`CLAUDE.md`, `EISEN.md`, `BESLISSINGEN.md`, `PLAN.md`, `LOGBOEK.md`, `ITERATIES.md`) technisch mee. De afweging:

- **Voor:** alles op één plek, met een back-up op GitHub.
- **Tegen:** privé is niet hetzelfde als geheim. Wie later toegang tot de repo krijgt (een medewerker, een koper van de app, iemand die je ooit uitnodigt) leest alles, ook de geschiedenis. Deze documenten bevatten de naam van de gebruiker en gegevens over haar gezondheid. Een repo verkopen of delen zonder die documenten kan achteraf alleen met een nieuwe repo.

**Aanbeveling: houd de zes documenten buiten de repo.** Ze blijven gewoon op je computer in de projectmap staan (de agents hebben ze nodig), maar git negeert ze. Dat staat al in `.gitignore`, samen met `skills-lock.json` en de mappen `.claude/` en `.agents/`. Beslis je anders, haal ze dan uit `.gitignore` en weet dat ze dan voorgoed in de geschiedenis van de repo staan.

Wat wel meegaat: de code (`src/`, `public/`, `fonts/`, `bloei-huisstijl/`, `scripts/`), het Open Graph-beeld van de demo (`demo-publiek/`), de tests (`tests/`), de meldingsdienst (`worker/`, zonder `.dev.vars`), `index.html`, `stijl.html`, `package.json`, `package-lock.json`, `vite.config.js`, `playwright.config.js`, `vercel.json`, `.vercelignore`, `.gitignore`, `.env.example`, `.env.demo` (alleen `VITE_DEMO=true`, geen geheim), `README.md` en deze handleiding.

Wat niet meegaat (staat in `.gitignore`): elke andere `.env`-variant (`.env`, `.env.local`, `.env.production`, ...), de bouwmappen (`dist/`, `dist-demo/` en elke andere `dist-...`), `node_modules/`, testuitvoer en tijdelijke schermtests (`tests/e2e/zz-tmp-*`).

### Waarom een verse repo

`.gitignore` werkt alleen voor bestanden die git nog niet volgt. In de huidige lokale repo volgt git de zes documenten, `skills-lock.json` en een deel van `.claude/` al, en de oude geschiedenis bevat ook oudere versies van code met namen van vóór de veegronde van BESLISSING 319. Een push van die repo zou dat allemaal meenemen. Uit een geschiedenis iets wissen kan, maar is foutgevoelig. **Het eenvoudigst is een verse repo met één eerste commit**, in dezelfde projectmap: je zet de oude geschiedenis opzij (buiten de projectmap, alleen op je computer) en begint opnieuw. Je bestanden en je werkmap blijven waar ze zijn.

### Stappen

Doe dit als niemand (ook geen agent) nog aan het werk is in de projectmap.

1. Kijk na dat de tests slagen, met je lijst verboden woorden (deel 1):

   ```
   npm test
   ```

2. Zet de oude geschiedenis opzij, buiten de projectmap. Dit verplaatst alleen de verborgen map `.git`; je bestanden blijven staan:

   ```
   Move-Item -Force .git ..\bloei-oude-geschiedenis.git
   ```

   Op een Mac: `mv .git ../bloei-oude-geschiedenis.git`. Die map zet je nooit op GitHub en je koppelt er geen remote aan. Wil je later iets in de oude geschiedenis opzoeken: `git --git-dir=..\bloei-oude-geschiedenis.git log --oneline`.

3. Maak een nieuwe, lege repo met `main` als hoofdtak:

   ```
   git init -b main
   ```

4. Zet alle bestanden klaar voor de eerste commit. `.gitignore` houdt de privébestanden erbuiten:

   ```
   git add .
   ```

5. **Kijk na wat meegaat.** Dit toont elk klaargezet bestand. Lees de lijst door:

   ```
   git ls-files
   ```

   Dit commando zoekt gericht naar wat er niet in mag. Het mag niets teruggeven:

   ```
   git ls-files | Select-String -Pattern 'CLAUDE\.md|EISEN\.md|BESLISSINGEN\.md|PLAN\.md|LOGBOEK\.md|ITERATIES\.md|skills-lock|^\.claude/|^\.agents/|\.env$|\.env\.local|\.env\.production|\.dev\.vars|verboden-woorden|^dist|screenshots/|zz-tmp-'
   ```

   Op een Mac: vervang `Select-String -Pattern` door `grep -E`.

6. Zoek in de klaargezette bestanden op de voornaam en op de achternaam van de gebruiker, elk apart. Vervang `VOORNAAM` en `ACHTERNAAM` door de echte namen. Geen van beide mag iets teruggeven:

   ```
   git grep -i -n --cached "VOORNAAM"
   git grep -i -n --cached "ACHTERNAAM"
   ```

   Doe hetzelfde voor een paar namen uit haar supplementenlijst. Een zoektocht op een naam vindt geen gegevens die in een andere vorm staan; blader daarom ook `tests/` en `README.md` door op persoonlijke voorbeelden.

7. Kijk na met welk e-mailadres je commit. Dat adres komt in elke commit en is te zien voor iedereen die toegang tot de repo krijgt:

   ```
   git config user.email
   ```

   Wil je dat niet, dan biedt GitHub een afgeschermd adres aan (op github.com: Settings, Emails, "Keep my email addresses private"; **na te kijken** in je instellingen). Zet dat adres dan met `git config user.email "<het adres dat GitHub toont>"`.

8. Maak de eerste commit:

   ```
   git commit -m "Eerste versie van Bloei"
   ```

   Controleer dat er maar één commit is. Dit moet één regel tonen:

   ```
   git log --oneline
   ```

9. Maak de repo op GitHub. Op github.com: rechtsboven **+**, dan **New repository**. Vul in:
   - Repository name: een neutrale naam, bijvoorbeeld `bloei`. Geen naam van een persoon.
   - Kies **Private**.
   - Voeg geen README, `.gitignore` of licentie toe.
   - Klik **Create repository**.

10. Koppel je lokale repo eraan en push:

    ```
    git remote add origin https://github.com/<jouw-gebruikersnaam>/bloei.git
    git push -u origin main
    ```

    Bij de eerste push vraagt Git om aan te melden bij GitHub; op Windows opent daarvoor een browservenster (**na te kijken**: hangt af van je Git-installatie).

11. Kijk op github.com na: naast de naam van de repo staat **Private**, en in de bestandenlijst staan de zes documenten niet.

Vanaf nu werk je gewoon verder in dezelfde projectmap.

## 3. De meldingsdienst op Cloudflare

De volledige uitleg staat in `worker/README.md`. Alle commando's in dit deel voer je uit in de map `worker`. Je Cloudflare-account heb je al.

1. Ga naar de map:

   ```
   cd worker
   ```

2. Installeer `wrangler`, het hulpmiddel van Cloudflare. De exacte versie staat vast in `worker/package-lock.json`. Daarna gebruik je het met `npx wrangler`:

   ```
   npm ci
   ```

3. Meld je aan. Er opent een browservenster waar je toestemming geeft:

   ```
   npx wrangler login
   ```

4. Maak de opslagplek voor de abonnementen. Je krijgt een `id` terug:

   ```
   npx wrangler kv namespace create ABONNEMENTEN
   ```

   Open `worker/wrangler.toml` en zet die `id` bij `[[kv_namespaces]]` (`id = "..."`). In dit project staat er al een id; maak je een nieuwe opslagplek, vervang het dan. Het id is geen geheim.

5. Maak het sleutelpaar. Dit gebeurt lokaal; er gaat niets naar buiten:

   ```
   node scripts/maak-vapid.mjs
   ```

   Je krijgt twee waarden:
   - `VAPID_PUBLIEK`: zet die in `wrangler.toml` bij `VAPID_PUBLIEK` (in dit project staat er al een sleutel; maak je een nieuw paar, vervang ze dan). Bewaar ze ook voor deel 4: ze gaat ook naar Vercel.
   - `VAPID_PRIVE`: **geheim.** Nergens in een bestand, niet in git, niet in een bericht, **nooit bij Vercel**. Bewaar ze in je wachtwoordbeheerder.

6. Laat in `wrangler.toml` voorlopig `TOEGELATEN_ORIGIN = "https://jouw-project.vercel.app"` staan: het echte adres van de app ken je pas na deel 4. Zet `VAPID_ONDERWERP` ook voorlopig op `https://jouw-project.vercel.app`. In deel 5 zet je beide op het echte adres. (Een `mailto:`-adres kan ook, maar dan komt er een e-mailadres in `wrangler.toml`; dat laat `npm test` falen en mag je niet committen.)

7. Zet de private sleutel als geheim bij Cloudflare. Wrangler vraagt erom; plak ze in het venster:

   ```
   npx wrangler secret put VAPID_PRIVE
   ```

   Zet daarna een tweede, apart geheim voor de rem op nieuwe aanmeldingen:

   ```
   npx wrangler secret put REM_ZOUT
   ```

   Plak een lange willekeurige waarde die je nergens anders gebruikt. Je maakt ze lokaal met `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` en bewaart ze nergens in een bestand. Waarom: de dienst bewaart van elk IP-adres alleen een versleutelde hash (HMAC) voor de rem. Zonder `REM_ZOUT` gebruikt hij daarvoor de private VAPID-sleutel (één sleutel voor twee doelen), en zonder beide een vaste tekst die in de broncode staat, waarmee de hash wel terug te rekenen is. Een nieuwe `REM_ZOUT` later zetten is veilig: alleen de rem van het lopende uur begint opnieuw.

8. Rol de dienst uit:

   ```
   npx wrangler deploy
   ```

   Je krijgt een adres terug, zoals `https://bloei-herinneringen.<jouw-subdomein>.workers.dev`. Noteer het. De timer van elke 15 minuten staat al in `wrangler.toml`. Heb je nog geen `workers.dev`-subdomein, dan vraagt Cloudflare er bij de eerste uitrol een te kiezen (**na te kijken**). Kies een neutrale naam, geen naam van een persoon.

9. Test dat de dienst draait en vreemde sites weigert. Dit mag `403` geven:

   ```
   curl.exe -i -X OPTIONS -H "Origin: https://iets-anders.example" https://bloei-herinneringen.<jouw-subdomein>.workers.dev/abonnement
   ```

   Op een Mac: `curl` in plaats van `curl.exe`.

10. Ga terug naar de projectmap:

    ```
    cd ..
    ```

## 4. De app op Vercel

`vercel.json` in de repo zegt Vercel hoe het moet bouwen (`npm ci`, `npm run build`), welke map het publiceert (`dist`) en welke koppen de site meestuurt. Dat hoef je in het dashboard dus niet in te vullen.

1. Ga naar vercel.com en meld je aan met je GitHub-account.
2. Klik **Add New...** en kies **Project**.
3. Bij **Import Git Repository** zie je je repo's. Staat de privérepo er niet bij, geef Vercel dan toegang tot precies die ene repo: kies de optie om de GitHub-app van Vercel aan te passen ("Adjust GitHub App Permissions" of gelijkaardig, **na te kijken**), kies op GitHub **Only select repositories**, selecteer de repo en bewaar.
4. Klik **Import** naast de repo.
5. Bij **Configure Project**:
   - **Project Name**: dit wordt het adres, `https://<project-name>.vercel.app`. Kies een neutrale naam, geen naam van een persoon. Is de naam al bezet, dan kiest Vercel een ander adres; je ziet het echte adres na de bouw.
   - **Framework Preset** en **Root Directory** laat je staan (`./`). `vercel.json` gaat voor.
   - **Environment Variables**: laat je hier nog leeg (zie stap 8).
6. Klik **Deploy** en wacht tot de bouw klaar is.
7. Zoek het adres van de app: in het project, bij **Settings**, **Domains**, staat het productieadres (`https://jouw-project.vercel.app`). Gebruik dat korte adres, niet de lange adressen met een code die bij elke bouw horen. Open het: de app start en toont het welkomscherm. Herinneringen staan nog op "niet beschikbaar"; dat klopt, de bouw kent de dienst nog niet.

   **Kies dit adres nu voor goed.** De browser bewaart het dagboek per adres. Verhuist de app later naar een ander adres (ook een eigen domein), dan begint ze daar met een leeg dagboek en is er geen weg om de gegevens over te zetten (er is geen back-up, BESLISSING 225). Wil je een eigen domein, zet het dan op voor de gebruiker begint.

8. Zet de twee bouwwaarden. In het project: **Settings**, **Environment Variables**. Voeg er twee toe, met precies deze namen:

   | Key | Value |
   |---|---|
   | `VITE_PUSH_URL` | het adres van de dienst uit deel 3, stap 8, zonder slash op het einde |
   | `VITE_VAPID_PUBLIEK` | de publieke sleutel uit deel 3, stap 5 |

   Vink bij elke variabele alleen de omgeving **Production** aan, niet Preview en niet Development. Zo bouwt Vercel previews zonder meldingen en doet een preview nooit een verzoek naar de dienst. Beide waarden zijn publiek: ze staan in de gebouwde app. **De private sleutel zet je hier nooit.**

9. Bouw opnieuw, want een variabele werkt pas bij de volgende bouw: **Deployments**, de bovenste bouw met het label Production, het menu **⋯**, **Redeploy**.

10. Kijk na dat het adres van de dienst in de app zit. Dit moet een regel met `connect-src 'self' https://bloei-herinneringen...` tonen:

    ```
    curl.exe -s https://jouw-project.vercel.app/ | Select-String "connect-src"
    ```

11. Zet de Node-versie van de bouw op 22 of nieuwer: **Settings**, bij de instellingen voor bouwen (**na te kijken**: de plaats en de standaardwaarde verschillen per versie van het dashboard), **Node.js Version**.

12. Previews afschermen. Vercel maakt bij elke push naar een andere tak dan `main` een preview op een eigen adres. De dienst laat die niet toe (deel 5) en ze bouwen zonder meldingen (stap 8), maar iedereen met het adres kan ze openen. Zet daarom **Vercel Authentication** aan voor previews: **Settings**, **Deployment Protection** (**na te kijken**: welke keuzes het gratis abonnement daar geeft en wat standaard aan staat). Let op: **het productieadres moet open blijven**, anders kan de iPhone de app niet openen.

Waarom er geen tests draaien op Vercel: `npm test` leest de lijst van bestanden uit git, en de bouwmachine van Vercel heeft geen volledige git-map (**na te kijken**). Draai `npm test` daarom altijd zelf vóór je pusht (deel 9).

## 4b. Het demoproject op Vercel (voor je portfolio)

Uit **dezelfde privérepo** maak je een tweede Vercel-project voor de demoversie (BESLISSING 364). De demo heeft een eigen database in de browser, voorbeeldgegevens met een verzonnen naam, een balk met "Opnieuw beginnen", geen vergrendeling en geen meldingen, en ze mag in een zoekmachine. De echte app blijft precies zoals ze is: met `noindex` in de pagina en `Disallow: /` in `robots.txt`.

Zo verschillen de twee projecten. Al de rest (repo, tak, `vercel.json`, koppen) is gelijk:

| | `bloei` (echt) | `bloei-demo` (demo) |
|---|---|---|
| Build Command | uit `vercel.json`: `npm run build` | uit `vercel.json`: `npm run build` |
| Output Directory | uit `vercel.json`: `dist` | uit `vercel.json`: `dist` |
| `VITE_DEMO` | **niet zetten** | `true` (Production **en** Preview) |
| `VITE_PUSH_URL`, `VITE_VAPID_PUBLIEK` | zoals in deel 4, stap 8 (alleen Production) | **niet zetten** (een demobouw negeert ze toch) |
| `DEMO_ADRES` | niet zetten | mag leeg blijven (zie hieronder) |
| Adres | het adres dat de gebruiker op haar toestellen gebruikt | een eigen adres, bv. `https://bloei-demo.vercel.app` |
| Meldingsdienst | `TOEGELATEN_ORIGIN` wijst hierheen (deel 5) | nooit in `TOEGELATEN_ORIGIN` |

**Waarom een variabele en geen ander build-commando.** `vercel.json` is gedeeld door beide projecten en zet zelf `buildCommand` en `outputDirectory`. Volgens de documentatie van Vercel gaat een waarde in `vercel.json` vóór de instelling in het dashboard (**na te kijken**: in het dashboard staat het veld dan grijs of met een melding dat `vercel.json` het overneemt). Een eigen build-commando (`npm run build:demo`, uitvoer `dist-demo`) in het dashboard van het demoproject zou dus genegeerd worden. Daarom zet het demoproject alleen `VITE_DEMO=true`: `vite.config.js` en de app lezen die variabele bij het bouwen en maken dan een demobouw, in dezelfde map `dist`. Lokaal is `npm run build:demo` er wel, met de uitvoer in `dist-demo` (zodat ze naast `dist` kan staan).

Stappen:

1. Op vercel.com: **Add New...**, **Project**, en importeer **dezelfde repo** nog eens (staat ze er niet bij, zie deel 4, stap 3).
2. **Project Name**: `bloei-demo` (of een andere neutrale naam, geen naam van een persoon). Framework Preset en Root Directory laat je staan.
3. **Environment Variables**: voeg `VITE_DEMO` toe met de waarde `true`. Vink **Production** en **Preview** aan (dan is ook elke preview van de demo een demo). Zet hier **geen** `VITE_PUSH_URL` of `VITE_VAPID_PUBLIEK`.
4. Klik **Deploy**. Zoek het adres bij **Settings**, **Domains** en open het. Je ziet bovenaan de demo-balk, de titel van het tabblad is "Bloei · demo", en de app staat vol voorbeeldgegevens.
5. Kijk na dat het echt de demo is en niets naar buiten gaat:

   ```
   curl.exe -s https://bloei-demo.vercel.app/ | Select-String "connect-src|robots|og:image"
   curl.exe -s https://bloei-demo.vercel.app/robots.txt
   ```

   Je moet zien: `connect-src 'self';` (zonder adres van een dienst), `<meta name="robots" content="index, follow" />`, een `og:image` en in `robots.txt` `Allow: /`. Doe hetzelfde voor het echte project: daar staat `noindex, nofollow` en `Disallow: /`.
6. **Het Open Graph-beeld.** Sociale netwerken willen een volledig adres voor het beeld. De bouw gebruikt daarvoor het productieadres dat Vercel bij het bouwen meegeeft (`VERCEL_PROJECT_PRODUCTION_URL`; **na te kijken**: dat Vercel deze systeemvariabele bij het bouwen doorgeeft, onder Settings, Environment Variables, "Automatically expose System Environment Variables"). Wil je een ander adres (een eigen domein voor de demo), zet dan bij het demoproject `DEMO_ADRES` op dat adres, bv. `https://demo.jouw-domein.example`, en bouw opnieuw. Controle: deel het adres in een berichtenapp of gebruik de "debugger" van een sociaal netwerk.
7. **Deployment Protection**: het productieadres van de demo moet open blijven (anders ziet niemand je portfolio). Previews mag je afschermen zoals in deel 4, stap 12.

**Geen `X-Robots-Tag`-kop.** `vercel.json` is gedeeld en kent het adres van de projecten niet; een kop `X-Robots-Tag: noindex` erin zou ook de demo uit de zoekmachines houden. De echte versie heeft daarom `noindex` als meta in de pagina en `Disallow: /` in `robots.txt`, beide alleen in haar eigen bouw. Dat volstaat voor de grote zoekmachines.

**Wat de demo nooit raakt.** De demo staat op een ander adres dan de echte app en deelt dus niets met haar in de browser. Ze opent ook alleen haar eigen database (`bloei-demo`), haar eigen caches en haar eigen sleutels, en ze verbindt met geen enkele dienst.

## 5. De dienst het adres van de app geven

1. Open `worker/wrangler.toml` en zet het adres van het **echte** project uit deel 4, stap 7 (nooit dat van het demoproject uit deel 4b):
   - `TOEGELATEN_ORIGIN = "https://jouw-project.vercel.app"`: alleen `https://` en de naam, **geen pad, geen slash op het einde**, kleine letters. De dienst vergelijkt dit letterlijk met de `Origin` die de browser meestuurt.
   - `VAPID_ONDERWERP`: hetzelfde adres (of een `mailto:`-adres dat je niet commit, zie deel 3, stap 6).
2. Rol de dienst opnieuw uit:

   ```
   cd worker
   npx wrangler deploy
   cd ..
   ```

3. Test dat de dienst de app nu toelaat. Dit moet `204` geven:

   ```
   curl.exe -i -X OPTIONS -H "Origin: https://jouw-project.vercel.app" https://bloei-herinneringen.<jouw-subdomein>.workers.dev/abonnement
   ```

4. Commit de gewijzigde `wrangler.toml` (zonder e-mailadres) en push:

   ```
   npm test
   git add worker/wrangler.toml
   git commit -m "Meldingsdienst: adres van de app"
   git push
   ```

**De demo en preview-adressen.** De dienst aanvaardt precies één origin: het productieadres van de echte app. De demo (deel 4b) staat er niet in en doet ook nooit een verzoek naar de dienst. Een preview van Vercel heeft een ander adres en kan zich dus nooit aanmelden voor meldingen. Dat is bewust zo. Zet er geen tweede adres bij.

## 6. Op de iPhone en de iPad

Doe dit **op elk toestel apart**. De gegevens staan per toestel en worden niet gesynchroniseerd. Ook de meldingen zijn per toestel: elk toestel meldt zich zelf aan bij de dienst en kiest zijn eigen herinneringen.

1. Open **Safari** op het toestel en ga naar `https://jouw-project.vercel.app`. Een andere browser volstaat niet voor deze stap.
2. Tik op de **Deel**-knop (het vierkantje met de pijl omhoog).
3. Kies **Zet op beginscherm** en tik **Voeg toe**.
4. Sluit Safari en **open Bloei vanaf het beginscherm**. Alleen zo kan het toestel meldingen geven.
5. Je ziet het welkomscherm. Doorloop het.
6. Tik op het tabblad **Algemeen**, kies **Herinneringen** en zet de hoofdschakelaar aan. Het toestel vraagt om toestemming voor meldingen: tik **Sta toe**.
7. Zet de soorten aan die de gebruiker wil (Dagboek, Supplementen, Drinken), elk met eigen uren, op het kwartier. Standaard staat alles uit.
8. **Proefmelding.** De app heeft geen knop voor een proefmelding; zet daarom een herinnering op het volgende kwartier (om 14:15 als het nu 14:07 is) en sluit de app volledig (veeg ze weg uit de lijst met geopende apps). Rond dat kwartier komt de melding. De dienst kijkt om de 15 minuten en rekent in Belgische tijd; een paar minuten vertraging kan. Tik op de melding: ze opent Bloei op het juiste scherm. Komt er na 15 minuten niets, zie deel 10.
9. Zet de vergrendeling aan (Algemeen, Vergrendeling) en laat opnieuw een melding komen. Er staat nu alleen een algemene tekst in, niets over eten, drinken of supplementen.
10. Wil je stoppen met meldingen: zet de hoofdschakelaar bij Herinneringen uit. De app meldt het toestel dan af bij de dienst.
11. Herhaal alles op het andere toestel.

## 6b. Android: de apk maken met Bubblewrap

Dit deel is voor Android (BESLISSING 515). Op de iPhone en de iPad verandert niets: daar blijft het "Zet op beginscherm" van deel 6.

**Wat is dit?** Een apk is het installatiebestand van een Android-app. Bloei is een webapp; Bubblewrap is een programma van Google dat van een webapp een apk maakt. Die apk bevat geen eigen code van Bloei: ze opent de gepubliceerde site schermvullend, zonder adresbalk (een "Trusted Web Activity"). Daarom werkt de inhoud van de app zichzelf bij via de site. De apk staat als download op de site van de app, en op een Android-toestel toont Vandaag een strook met de knop **Download de app**. Er is geen Play Store en geen installatiebalk van Chrome meer.

**Wat het op je computer zet.** Bubblewrap is zelf klein, maar het heeft twee grote hulpmiddelen nodig. Samen is het ongeveer 1 GB (**na te kijken** bij de installatie; de grootte hangt van de versies af):

- `@bubblewrap/cli`: een Node-pakket. Je installeert het zelf met `npm install -g @bubblewrap/cli`. Het komt in de globale pakkettenmap van npm.
- een JDK 17 (Java om de app te bouwen);
- de Android-bouwhulpen (de "Android SDK").

Bij de eerste keer dat je Bubblewrap draait, biedt het aan de JDK en de Android SDK zelf te downloaden en in een eigen map in je gebruikersmap te zetten (**na te kijken** met `bubblewrap help` en op het scherm; de exacte vragen en de map kunnen per versie verschillen). Accepteer dat, of wijs je eigen installaties aan. Ze komen nooit in de repo.

**Wat er in de repo al klaarstaat.** Je hoeft in de code niets aan te passen:

- de strook en de downloadknop (verschijnt alleen als `public/bloei.apk` bestaat bij het bouwen, nooit in de demo);
- de koppen voor `/bloei.apk` (een bijlage, nooit bewaard) en `/.well-known/assetlinks.json` in `vercel.json`;
- de service worker bewaart die twee niet offline;
- `docs/assetlinks.json.voorbeeld`: een sjabloon voor het bestand dat je in stap (e) invult (het staat buiten `public/`, zodat het niet op de site komt);
- `.gitignore` houdt de ondertekensleutel en de projectmap `android/` buiten git.

### De stappen

**(a) Publiceer eerst de app op Vercel.** Doe deel 4 (en deel 5). De apk onthoudt het adres van de site, dus het adres moet vaststaan (hetzelfde adres als in de waarschuwing van deel 4: later veranderen betekent een nieuwe apk en een leeg dagboek). Controleer dat `https://jouw-project.vercel.app/manifest.webmanifest` een bestand toont met `name`, `start_url`, `scope`, `display` en de iconen van 192 en 512 (ook de maskable).

**(b) Maak de projectmap en start Bubblewrap.** Maak in de projectmap een lege map `android` en ga erin staan. Bubblewrap zet alles wat het maakt in de map waarin je staat; zo blijft de rest van de repo schoon:

```
mkdir android
cd android
bubblewrap init --manifest https://jouw-project.vercel.app/manifest.webmanifest
```

Bubblewrap leest het manifest en stelt vragen. Wat je invult (de exacte vragen en de volgorde zijn **na te kijken** op het scherm; `bubblewrap help init` toont de opties):

- **Domein en start-pad**: het adres van de app en `/`. Bubblewrap neemt ze uit het manifest over.
- **Pakketnaam** (de unieke naam van de app voor Android): kies een naam zonder persoonsnaam, afgeleid van het adres, in omgekeerde volgorde. Voor `bloei-xyz.vercel.app` bijvoorbeeld `app.vercel.bloei_xyz`; Bubblewrap stelt zelf een naam voor op die manier. Letters, cijfers en underscores, geen streepjes. **Deze naam staat voor altijd vast**: verander je hem, dan is het een andere app.
- **Naam van de app**: `Bloei` (korte naam: `Bloei`).
- **Schermvullend**: kies de standaard (de app opent zonder adresbalk; "standalone" in het manifest). Kies niet "fullscreen" als Bubblewrap dat apart vraagt: dat verbergt ook de statusbalk van Android.
- **Kleuren en icoon**: neemt Bubblewrap uit het manifest (`#FBF7F4` en het icoon van 512 pixels, ook de maskable).
- **Meldingen ("enable notifications delegation")**: dit laat Android de meldingen van de site tonen alsof ze van de app zelf zijn, en laat de app de toestemming voor meldingen op de normale manier van Android vragen. Zet het **aan** als je de herinneringen (deel 3) op Android wilt gebruiken. Wat het precies doet met de bestaande aanmelding bij de dienst, kon niet worden nagegaan zonder echt toestel: **na te kijken** op een Android-toestel (zie (g)).
- **Ondertekensleutel**: zie (c).

**(c) De ondertekensleutel.** Een Android-app moet ondertekend zijn met een sleutel (een bestand, `android.keystore`, met een wachtwoord). Android herkent een nieuwe versie van de app aan die sleutel: alleen een apk met dezelfde sleutel mag de oude vervangen. Bubblewrap maakt de sleutel voor je aan en vraagt je twee wachtwoorden (voor het bestand en voor de sleutel); de exacte vragen zijn **na te kijken** op het scherm.

- **Kies het wachtwoord zelf en tik het zelf in.** Laat het door niemand anders en door geen programma voor je invullen of voorstellen. Bewaar het in een wachtwoordkluis.
- **De sleutel en het wachtwoord horen nooit in de repo, nooit in een gesprek (ook niet met een assistent), nooit in een mail of schermafbeelding.** `.gitignore` houdt `*.keystore`, `*.jks` en de map `android/` buiten git, maar controleer toch altijd met `git status` voor je commit.
- **Maak een reservekopie** van het bestand `android.keystore` en bewaar die op een tweede plek (een versleutelde usb-stick of een wachtwoordkluis die bestanden aankan), apart van het wachtwoord.
- **Raak je de sleutel of het wachtwoord kwijt**, dan kun je geen nieuwe versie van deze app meer uitgeven die Android als dezelfde app aanvaardt. Je maakt dan een nieuwe sleutel en een nieuwe apk; wie de oude apk had, moet die eerst verwijderen en de nieuwe installeren. Wat er dan met hun gegevens gebeurt, weten we niet zeker: de gegevens van Bloei staan in de opslag van Chrome voor het adres van de site, niet in de apk. Waarschijnlijk blijven ze dus staan als je de app verwijdert en een nieuwe apk met hetzelfde adres installeert, maar dat is niet bewezen (**na te kijken** op een toestel) en niets garandeert het. Er is geen back-up (BESLISSING 225). Het enige wat je vooraf kunt doen, is het verslag als pdf delen. Bewaar de sleutel dus goed.

**(d) Bouw de apk.** In dezelfde map `android`:

```
bubblewrap build
```

Bubblewrap vraagt de wachtwoorden en bouwt. Het levert onder andere een ondertekend bestand op, volgens de documentatie `app-release-signed.apk` (**na te kijken** in de map na de bouw; `bubblewrap help build` toont de opties). Het eerste bouwen duurt enkele minuten en downloadt de bouwhulpen.

**(e) Toon de vingerafdruk en maak assetlinks.json.** Android controleert dat de apk bij jouw site hoort. Daarvoor staat op de site een bestand met de SHA-256-vingerafdruk van je sleutel. De vingerafdruk is niet geheim (alleen de sleutel zelf is dat). Toon hem met:

```
bubblewrap fingerprint list
```

(**na te kijken** met `bubblewrap help`; werkt dat niet, dan met Java: `keytool -list -v -keystore android.keystore`, en lees de regel `SHA256:`; de naam van de sleutel (alias) staat in `twa-manifest.json`.) Het is een rij van 32 paren cijfers en letters, gescheiden door dubbele punten.

Maak de map `public/.well-known/` en kopieer `docs/assetlinks.json.voorbeeld` daarheen als `public/.well-known/assetlinks.json` en vul twee plaatsen in: `package_name` (de pakketnaam uit (b)) en `sha256_cert_fingerprints` (de vingerafdruk). Laat de rest staan. Het echte bestand `assetlinks.json` hoort wel in git en op de site: het bevat geen geheim.

**(f) Zet de apk op de site en publiceer opnieuw.**

1. Kopieer de apk (hoe ze ook heet) naar `public/bloei.apk`. De bouw zet dan zelf de downloadknop aan: je hoeft geen variabele in te stellen (`VITE_APK` in `.env.example` is alleen uitleg en blijft leeg). Deze apk **hoort wel in git**: Vercel bouwt uit de repo, en een apk bevat geen geheim. Het is een bestand van enkele MB; verandert het zelden, dan groeit de repo nauwelijks.
2. Controleer met `git status` dat je alleen `public/bloei.apk`, `public/.well-known/assetlinks.json` en eventueel `android/twa-manifest.json` erbij ziet, en geen sleutel.
3. `npm test`, daarna committen en pushen zoals in deel 9. Vercel publiceert opnieuw.

`android/twa-manifest.json` mag in git: het bevat de pakketnaam, het adres, de naam van de sleutel en de vingerafdruk, maar geen wachtwoord (**na te kijken** met een blik in het bestand voor je commit). `.gitignore` laat dit ene bestand uit de map `android/` door.

**(g) Controleer.**

- [ ] `https://jouw-project.vercel.app/.well-known/assetlinks.json` opent als gewone json (tekst op het scherm, geen bijlage en geen pagina van de app). Controleer: `curl.exe -sI https://jouw-project.vercel.app/.well-known/assetlinks.json` geeft `200` en `content-type: application/json`.
- [ ] `curl.exe -sI https://jouw-project.vercel.app/bloei.apk` geeft `200`, `content-type: application/vnd.android.package-archive` en `content-disposition: attachment; filename="bloei.apk"`.
- [ ] Op een Android-toestel, in Chrome op het adres van de app: Vandaag toont de strook **Download de app**. Tik erop. Android toont de download; tik op het bestand om het te openen.
- [ ] Android vraagt waarschijnlijk of je apps uit deze bron mag installeren ("onbekende bronnen toestaan"): dit is normaal voor een apk buiten de Play Store. Zet de keuze aan voor Chrome (of de app waarmee je downloadde), ga terug en tik op **Installeren**. Daarna mag je die keuze weer uitzetten.
- [ ] Play Protect kan een scherm tonen dat de app onbekend is ("App scannen"). Kies **Toch installeren** of **App scannen**: de app is niet in de Play Store gecontroleerd, maar het bestand is dat van jezelf. De exacte tekst verschilt per Android-versie (**na te kijken**).
- [ ] Open Bloei vanaf het nieuwe icoon op het beginscherm. De app opent **zonder adresbalk**. Staat er wel een balk met het adres bovenaan, dan klopt `assetlinks.json` niet (verkeerde pakketnaam, een andere vingerafdruk dan die van je sleutel, of een bestand dat niet bereikbaar is): kijk (e) na, publiceer opnieuw en sluit de app volledig voor je opnieuw opent (Android onthoudt de controle een tijd; verwijder de app en installeer opnieuw als het niet vanzelf verandert).
- [ ] In de apk zelf verschijnt de strook **Download de app** niet.
- [ ] Meldingen: zet een herinnering aan (Algemeen, Herinneringen) en kijk of de toestemming gevraagd wordt en of een melding aankomt (**na te kijken** op een echt toestel; de uitkomst hangt af van wat je bij "enable notifications delegation" koos).

### Later

- **Updates van de app**: de inhoud van Bloei werkt zichzelf bij via de site (deel 9). Je hoeft **geen nieuwe apk** te maken bij gewone wijzigingen.
- **Een nieuwe apk is alleen nodig** als de naam, het icoon, de kleuren of het adres van de app veranderen. Gebruik dan dezelfde sleutel, verhoog het versienummer van de app (`bubblewrap update`, **na te kijken** met `bubblewrap help`), bouw opnieuw (`bubblewrap build`) en vervang `public/bloei.apk`.
- **De demo krijgt geen apk.** Een demobouw toont nooit de downloadknop, ook niet als `public/bloei.apk` bestaat.
- **iPhone en iPad**: niets verandert. Het blijft Safari, Deel, **Zet op beginscherm** (deel 6).

## 7. Controle na publicatie

Doe dit na de eerste publicatie en na elke grote wijziging.

**De koppen.** Dit toont de koppen die de site meestuurt:

```
curl.exe -sI https://jouw-project.vercel.app/
```

- [ ] `content-security-policy` begint met `default-src 'self'` en eindigt met `frame-ancestors 'none'`; er staat geen `unsafe-inline` of `unsafe-eval` in.
- [ ] `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `x-frame-options: DENY`, `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin`, `strict-transport-security: max-age=...` en `permissions-policy: ...camera=()...` staan erbij.
- [ ] `cache-control: no-cache` op `/`. Doe hetzelfde voor `/sw.js` en `/manifest.webmanifest` (ook `no-cache`) en voor één bestand uit `/assets/` (`public, max-age=31536000, immutable`). De naam van zo'n bestand vind je in de bron van de pagina: `curl.exe -s https://jouw-project.vercel.app/ | Select-String "assets/"`.

**Wat er niet online staat.** Elk van deze adressen moet `404` geven (`vercel.json` heeft geen terugval naar `index.html`; **na te kijken** bij de eerste publicatie):

- [ ] `curl.exe -sI https://jouw-project.vercel.app/stijl.html`
- [ ] `curl.exe -sI https://jouw-project.vercel.app/README.md`
- [ ] `curl.exe -sI https://jouw-project.vercel.app/.env`

**Geen contact met een ander adres dan de dienst.** Open de app in Chrome op je computer, druk F12, kies het tabblad **Network** en herlaad. Elk verzoek gaat naar `jouw-project.vercel.app`. Alleen als je Herinneringen aan- of uitzet, komt er een verzoek naar de dienst bij. Het tabblad **Console** toont geen melding over de Content-Security-Policy.

**De service worker en offline.**

- [ ] In Chrome, F12, tabblad **Application**, **Service workers**: er staat een actieve `sw.js` met als bereik (scope) `https://jouw-project.vercel.app/`.
- [ ] Op het toestel: open de app één keer, zet de vliegtuigmodus aan, sluit de app volledig en open ze opnieuw vanaf het beginscherm. De schermen en de gegevens zijn er.

**Een update komt door.** Na je eerste update (deel 9): open de app op het toestel. De app toont "Er is een nieuwe versie." met de knop **Herladen**. Een tik daarop laadt de nieuwe versie; de gegevens blijven staan. Het kan zijn dat de strook pas bij het tweede openen verschijnt (**na te kijken** op het toestel).

## 8. Wat het kost en waar de grenzen liggen

- **GitHub.** Een privérepo op een persoonlijk account kost niets. Er draait geen workflow meer op GitHub.
- **Vercel.** Het gratis abonnement (Hobby) volstaat om de app te bouwen en te publiceren. Een geplande taak mag daar maar één keer per dag lopen; daarom staat de meldingsdienst op Cloudflare. **Of het gratis abonnement commercieel gebruik toelaat, kijk je zelf na in de voorwaarden van Vercel vóór je de app verkoopt.** De grenzen voor bandbreedte en aantal bouwbeurten staan op de prijspagina van Vercel (**na te kijken**). De app is klein (ongeveer 1,2 MB voor de offline cache, plus de opstartschermen), dus voor een handvol toestellen zijn die grenzen ver weg.
- **Cloudflare.** De dienst draait op het gratis Workers-abonnement met een KV-opslagplek. Hij loopt 96 keer per dag (elk kwartier) en doet per keer één lijstopvraging in KV plus één leesopdracht per toestel waarvan het kwartier past (en één voor de telling); schrijven gebeurt alleen bij het aan- of afmelden van een toestel of een wijziging van de uren, en als de telling niet meer klopt. Een aanmelding doet geen lijstopvraging, zodat niemand de 1000 lijstopvragingen per dag van het gratis abonnement kan opmaken (zie `worker/README.md`). Hoeveel dat gratis mag, staat op de prijspagina van Cloudflare voor Workers en KV (**na te kijken**). De dienst is bedoeld voor hoogstens `MAX_ABONNEMENTEN` toestellen (standaard 10).
- **Meldingen.** Het versturen via de pushdiensten van Apple en Google kost niets.
- **Grenzen van de opzet.** Er is geen back-up en geen synchronisatie tussen toestellen (deel 11). De dienst is voor een handvol toestellen, niet voor veel gebruikers.

## 9. Updates publiceren en terugdraaien

**Een nieuwe versie publiceren.** Elke push naar `main` is een nieuwe versie: Vercel bouwt en publiceert ze vanzelf.

1. Test lokaal. Beide moeten slagen:

   ```
   npm test
   npm run e2e
   ```

   `npm run e2e` bouwt de app zelf (met de stijlpagina erbij, die de schermtests nodig hebben) en start een eigen server. Wil je de geïnstalleerde Chrome gebruiken: `$env:PW_CHANNEL="chrome"; npm run e2e`.

2. Commit en push:

   ```
   git add .
   git status
   git commit -m "<wat er veranderde>"
   git push
   ```

   Kijk bij `git status` na dat er geen document of sleutelbestand bij staat.

3. Volg de bouw op vercel.com, in het project, bij **Deployments**. Faalt de bouw, dan blijft de vorige versie online.

4. Een geïnstalleerde app krijgt de nieuwe versie bij het volgende openen (deel 7, "Een update komt door"). Je moet de app niet opnieuw op het beginscherm zetten. De gegevens blijven staan: ze zitten in de opslag van de app, niet in de cache.

**Een push naar een andere tak** dan `main` maakt een preview, geen nieuwe versie voor de gebruiker.

**Terugdraaien.** Twee manieren:

- **Via git (aanbevolen, altijd hetzelfde):** maak de laatste commit ongedaan met een nieuwe commit en push. Vercel bouwt dan de vorige stand opnieuw:

  ```
  git revert HEAD
  git push
  ```

- **Via Vercel (sneller):** in het project, **Deployments**, kies een vorige bouw met het label Production, menu **⋯**, en zet die terug als productieversie ("Instant Rollback" of "Promote to Production"). **Na te kijken**: welke vorige versies het gratis abonnement toelaat, en of Vercel daarna nieuwe pushes vanzelf weer publiceert of dat je dat eerst weer moet aanzetten.

Na het terugdraaien toont een geïnstalleerde app de strook "Er is een nieuwe versie." net zoals bij een update.

**Verandert het adres van de app of van de dienst**, pas dan `TOEGELATEN_ORIGIN` (deel 5) en/of de variabelen bij Vercel (deel 4, stap 8) aan, rol de dienst opnieuw uit en bouw de app opnieuw. Onthoud dat een nieuw adres voor de app een leeg dagboek betekent (deel 4, stap 7).

## 10. Als het niet werkt

De zes meest waarschijnlijke oorzaken, met wat je nakijkt:

1. **De app is niet vanaf het beginscherm geopend.** Op iPhone en iPad geeft de app geen meldingen vanuit een Safari-tabblad. Het scherm Herinneringen toont dan "Zet Bloei eerst op je beginscherm". Sluit Safari, tik het pictogram op het beginscherm aan en probeer opnieuw. Controleer ook dat het toestel iOS of iPadOS 16.4 of nieuwer heeft.

2. **De toestemming is geweigerd.** De app toont dan "Je hebt meldingen geweigerd". Open Instellingen op het toestel, kies Meldingen, zoek Bloei en zet Meldingen toestaan aan. Kijk ook of een Focus- of Niet storen-stand de melding niet onderdrukt. Kom daarna terug naar de app.

3. **`TOEGELATEN_ORIGIN` klopt niet exact.** De dienst weigert elk verzoek met een andere `Origin` dan de waarde in `wrangler.toml`. Het moet precies het productieadres van Vercel zijn, zoals `https://jouw-project.vercel.app`: kleine letters, `https`, geen pad, geen slash op het einde, geen `www`. Een preview-adres van Vercel wordt nooit aanvaard; test meldingen dus altijd op het productieadres. Na een wijziging moet je `npx wrangler deploy` opnieuw uitvoeren in `worker/`. Test met het `curl.exe`-commando uit deel 5, stap 3.

4. **De VAPID-sleutels zijn verkeerd of horen niet bij elkaar.** De publieke sleutel in `wrangler.toml` (`VAPID_PUBLIEK`), de publieke sleutel in de app (`VITE_VAPID_PUBLIEK`) en de private sleutel in Cloudflare (`VAPID_PRIVE`) moeten **uit hetzelfde paar** komen. Heb je een tweede paar gemaakt, dan klopt er één niet meer. Zet in dat geval alle drie opnieuw: dienst, geheim en app. Toestellen die zich eerder aanmeldden met de oude sleutel moeten de herinneringen daarna uit- en weer aanzetten (na te kijken op het toestel).

5. **De app is gebouwd zonder de twee `VITE_`-waarden.** Dan staat Herinneringen op "niet beschikbaar" en doet de app geen verzoeken naar de dienst. Kijk op Vercel bij Settings, Environment Variables of beide variabelen bestaan, met precies die namen en met Production aangevinkt, en bouw daarna opnieuw (deel 4, stap 9): een variabele werkt pas bij de volgende bouw. Het adres moet met `https` beginnen; een ander adres telt als niet ingevuld. Controleer met het `curl.exe`-commando uit deel 4, stap 10.

6. **De timer of de opslag in Cloudflare.** In het Cloudflare-dashboard bij de Worker `bloei-herinneringen`: kijk bij Triggers of de cron `*/15 * * * *` actief is, bij Settings of de KV-binding `ABONNEMENTEN` verwijst naar de opslagplek die je maakte (het `id` in `wrangler.toml` moet kloppen), en bij Logs of er fouten staan. De dienst maakt zelf geen logregels met adressen (na te kijken in het dashboard).

## 11. Wat niet hersteld kan worden

Er is geen back-up (beslissing 225). Het dagboek staat alleen op het toestel, in de opslag van de app.

- Verwijder je de app van het beginscherm, dan is het dagboek op dat toestel weg.
- Wis je in Safari de sitegegevens van de app, dan is het dagboek weg.
- Raakt het toestel kwijt of stuk, dan zijn de gegevens weg.
- Wat je zelf verwijdert via Algemeen, Over (Alles wissen of Profiel verwijderen), is ook weg.
- Een andere installatie op een tweede toestel heeft een eigen, aparte dagboek. Er is geen synchronisatie.

- Verhuist de app naar een ander adres (een ander Vercel-project, een eigen domein), dan begint ze daar met een leeg dagboek. De browser bewaart de gegevens per adres.

Wat je wel kan doen: het verslag als pdf delen (zie de app) bewaart een uittreksel van wat je erin zette. Het is geen volledige back-up.

## Na te kijken in de dashboards

Dit kon niet worden nagekeken zonder echt uit te rollen:

- **GitHub:** de plaats van "Keep my email addresses private" (deel 2, stap 7) en hoe Git bij de eerste push aanmeldt (deel 2, stap 10).
- **Vercel:**
  - de knop om de GitHub-app van Vercel toegang tot de privérepo te geven (deel 4, stap 3);
  - de plaats en de standaardwaarde van **Node.js Version** (deel 4, stap 11);
  - de keuzes bij **Deployment Protection** op het gratis abonnement, en dat het productieadres open blijft (deel 4, stap 12);
  - of `.vercelignore` ook geldt bij een bouw vanuit GitHub (zo niet, dan haalt Vercel ook de tests en `worker/` binnen; dat verandert niets aan wat publiek wordt);
  - of de bouwmachine een git-map heeft (deel 4, laatste alinea);
  - of de koppen uit `vercel.json` echt meekomen, op elke bron (deel 7, `curl.exe -sI`), en welk inhoudstype Vercel aan `manifest.webmanifest` geeft (verwacht: `application/manifest+json`);
  - de knoppen en grenzen voor terugdraaien (deel 9);
  - de voorwaarden voor commercieel gebruik en de grenzen van het gratis abonnement (deel 8).
- **Cloudflare:** de vraag naar een `workers.dev`-subdomein bij de eerste uitrol (deel 3, stap 8) en de gratis grenzen voor Workers en KV (deel 8).
- **Android (deel 6b):** de exacte vragen, opties en bestandsnamen van Bubblewrap (`bubblewrap help`), de grootte van wat het installeert, wat "enable notifications delegation" doet met de herinneringen, wat er met de gegevens gebeurt bij een nieuwe apk, en de schermen van Android en Play Protect bij het installeren: alles op een echt Android-toestel.
- **Op het toestel:** dat de fotokiezer voor de profielfoto ook een foto laat nemen met de camera, ondanks `camera=()` in de kop `Permissions-Policy` (die kop geldt voor camera-toegang vanuit een pagina, niet voor de keuzelijst van het toestel; verwacht wordt dat het werkt), en dat Face ID werkt (`publickey-credentials-get` en `-create` staan op `self`).
