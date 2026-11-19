// BESLISSING 308: de responsive weergave van Vandaag en het Dagboek (dag, week en maand) op iPhone en iPad, met aanraking.
// Per scherm en breedte: geen horizontale scroll, niets buiten het venster, geen afgebroken of afgekapte tekst, tikdoelen van minstens 44 px,
// de laatste kaart boven de tabbalk, geen leeg vlak boven 32 px, kaarten in één rij die gelijk eindigen en geen te brede telefoonrij.
// Verzonnen gegevens (r-gegevens.js): leeg, een gewone dag en een volle dag met een volle maand.
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { buitenVenster, afbrekingen, ongelijkeLabels, tikdoelen, laatsteKaartZichtbaar, ongelijkeRijen, teBreedRij, horizontaleScroll } from './r-meting.js';
import { meetKaarten } from './leeg-vlak.js';
import { wachtOpRust, wachtTotStil, maaltijdblad } from './r-wacht.js';
import { vasteKlok } from './vaste-klok.js';

// [breedte, hoogte, naam]: iPhone (staand en liggend), iPad (alle formaten, staand en liggend), gesplitste weergave op de iPad.
const MATEN = [
  [360, 740, 'iPhone klein'], [390, 844, 'iPhone'], [430, 932, 'iPhone Max'], [844, 390, 'iPhone liggend'],
  [744, 1133, 'iPad mini'], [768, 1024, 'iPad'], [810, 1080, 'iPad 10,2'], [820, 1180, 'iPad Air'], [834, 1194, 'iPad Pro 11'], [1024, 1366, 'iPad Pro 12,9'],
  [1133, 744, 'iPad mini liggend'], [1024, 768, 'iPad liggend'], [1080, 810, 'iPad 10,2 liggend'], [1180, 820, 'iPad Air liggend'], [1194, 834, 'iPad Pro 11 liggend'], [1366, 1024, 'iPad Pro 12,9 liggend'],
  [507, 1024, 'iPad gesplitst 507'], [678, 1024, 'iPad gesplitst 678'], [320, 1024, 'iPad slide-over'],
  // 10 px onder en boven de breekpunten
  [710, 900, '710'], [730, 900, '730'], [950, 800, '950'], [970, 800, '970'], [1090, 800, '1090'], [1110, 800, '1110'], [1270, 900, '1270'], [1290, 900, '1290'],
];
const SCHERMEN = [
  ['vandaag', 'vandaag'],
  ['dagboek', 'dagboek dag'],
  ['dagboek/week', 'dagboek week'],
  ['dagboek/maand', 'dagboek maand'],
];

async function begin(page, route, soort) {
  await vasteKlok(page); // do 12 november 2026, 12:00: de volle maand uit r-gegevens.js (dagen 1 tot 11) en de weken hangen niet van de rundag af
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await vulGegevens(page, soort);
  await page.goto('./#/' + route);
  await expect(page.locator('#scherm h1').first()).toBeVisible();
  await wachtOpRust(page); // de kaarten komen zacht op
  await page.locator('.dag__raster.is-meet').waitFor({ state: 'detached' }).catch(() => {});
}

for (const [breedte, hoogte, naam] of MATEN) {
  test.describe(`${naam} ${breedte}x${hoogte}`, () => {
    // Aanraking zonder hover; een telefoon is "mobile", een iPad niet (Safari op de iPad geeft een bureaubladpagina).
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: breedte < 600 || hoogte < 500 });

    for (const [route, schermNaam] of SCHERMEN) {
      for (const soort of ['vol', 'leeg', 'gewoon']) {
        // leeg en gewoon alleen op de belangrijkste formaten, anders duurt de reeks te lang
        if (soort !== 'vol' && ![390, 744, 1024, 1180, 1366].includes(breedte)) continue;
        test(`${schermNaam} (${soort})`, async ({ page }) => {
          await begin(page, route, soort);
          const geheel = { scroll: await horizontaleScroll(page), buiten: await buitenVenster(page), afbrekingen: await afbrekingen(page), labels: await ongelijkeLabels(page) };
          expect(geheel, 'scroll, buiten het venster, afbrekingen, labels').toEqual({ scroll: [], buiten: [], afbrekingen: [], labels: [] });
          expect(await tikdoelen(page, { wortel: '#scherm' }), 'tikdoelen').toEqual([]);
          expect(await ongelijkeRijen(page).then((l) => l.filter((x) => !/dag__/.test(x))), 'kaarten in één rij eindigen gelijk').toEqual([]);
          expect(await teBreedRij(page), 'te brede telefoonrij').toEqual([]);
          // geen leeg vlak boven 32 px in een kaart (de Notitie met haar vaste hoogte en het paneel van de maand scrollen of tonen een leeg tekstvak: uitgezonderd)
          const kaarten = await meetKaarten(page, '#scherm');
          // Uitzonderingen: de Notitie (vaste hoogte), het paneel van de maand (scrolt) en het weekschema (rijen van 68 px op een vaste hoogte).
          // Stemming en energie op Vandaag telt mee (BESLISSING 308: tussen 1024 en 1439 px krijgen de keuzes een grotere maat). 34 px = 32 px plus 2 px meetafwijking.
          // BESLISSING 666 en 680: de kalenderkaart van de maand houdt onderaan plaats vrij voor de regels van de legenda (op 320 px drie regels); die vrije regels zijn geen leeg vlak
          const legVrij = route === 'dagboek/maand' ? await page.evaluate(() => { const leg = document.querySelector('.maand__legenda'); return leg ? leg.getBoundingClientRect().bottom - Math.max(...[...leg.children].map((li) => li.getBoundingClientRect().bottom)) : 0; }) : 0;
          const leeg = kaarten.filter((k) => k.gat - (k.naam === 'maand__kalkaart' ? legVrij : 0) > 34 && !/notitie|maand__paneel|wk__schemakaart/.test(k.naam) && soort !== 'leeg').map((k) => `${k.naam}: ${Math.round(k.gat)} px`);
          expect(leeg, 'leeg vlak in een kaart').toEqual([]);
          expect(await laatsteKaartZichtbaar(page), 'laatste kaart boven de tabbalk').toEqual([]);
        });
      }
    }

    // BESLISSING 419: een maaltijd opent als blad boven het scherm (een modale <dialog> in de bovenste laag, boven de tabbalk). Liggend op een
    // telefoon (390 px hoog) is het venster lager dan het blad: de knoppen zijn dan binnen het blad te bereiken door te schuiven. Bewering
    // in beide gevallen: elke knop van het blad (Klaar, Annuleren; Verwijderen is verborgen bij een nieuwe maaltijd) ligt, eventueel na
    // schuiven, volledig in het venster en wordt door niets bedekt.
    test('Vandaag: een maaltijd openen, elke knop van het maaltijdblad ligt (na schuiven) in het venster en vrij', async ({ page }) => {
      await begin(page, 'vandaag', 'gewoon');
      await page.locator('.vandaag .maaltijden .maaltijd > .rij').nth(2).tap();
      const blad = maaltijdblad(page);
      const knoppen = blad.locator('.maaltijd__acties button:visible');
      await expect(knoppen.first()).toBeVisible();
      await wachtOpRust(page);
      const aantal = await knoppen.count();
      expect(aantal).toBeGreaterThanOrEqual(2); // Klaar en Annuleren, en Verwijderen bij een ingevulde maaltijd
      for (let i = 0; i < aantal; i++) {
        const knop = knoppen.nth(i);
        await knop.evaluate((e) => e.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
        await wachtTotStil(page, () => knop.boundingBox()); // het blad kan zacht schuiven: wacht tot de knop stilstaat
        const m = await knop.evaluate((e) => {
          const r = e.getBoundingClientRect();
          const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { vrij: x === e || e.contains(x), boven: r.top, onder: r.bottom, links: r.left, rechts: r.right, w: innerWidth, h: innerHeight };
        });
        const naam = `knop ${i} (${await knop.innerText()})`;
        expect(m.vrij, `${naam} ligt vrij`).toBe(true);
        expect(m.boven, `${naam} begint binnen het venster`).toBeGreaterThanOrEqual(-0.5);
        expect(m.onder, `${naam} eindigt binnen het venster`).toBeLessThanOrEqual(m.h + 0.5);
        expect(m.links, naam).toBeGreaterThanOrEqual(-0.5);
        expect(m.rechts, naam).toBeLessThanOrEqual(m.w + 0.5);
      }
    });
  });
}

// iPad liggend en smalle laptop (960 tot 1439 px), volle dag: de kaart Drinken (etiketten, glas, dranktegels), geen leeg vlak boven 32 px en paren even hoog.
for (const [breedte, hoogte, naam] of [[1024, 768, 'iPad liggend'], [1180, 820, 'iPad Air liggend'], [1366, 1024, 'iPad Pro 12,9 liggend'], [1439, 900, 'smalle laptop']]) {
  test.describe(`Vandaag iPad liggend ${naam} ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: false });

    test('Drinken en Stemming en energie zijn gevuld, niets afgekapt, paren even hoog', async ({ page }) => {
      await begin(page, 'vandaag', 'vol');
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const etiketten = [...document.querySelectorAll('.drinkkaart .laatst__chip')].filter((e) => e.getBoundingClientRect().width > 0);
        const afgekapt = etiketten.flatMap((e) => [e, ...e.querySelectorAll('*')]).filter((e) => e.scrollWidth > e.clientWidth + 0.5).length;
        const glas = r('.drinkkaart .watervulling');
        const cijfer = r('.drinkkaart .cijfer-groot');
        const gehaald = r('.drinkkaart__gehaald');
        const klein = r('.drinkkaart .cijfer-groot + .t-klein');
        const blokTop = cijfer.top;
        const blokOnder = (gehaald ?? klein).bottom;
        const kop = r('.drinkkaart__andere > .label');
        const eerste = r('.drinkkaart .drankknop');
        const naamBreedte = [...document.querySelectorAll('.drinkkaart .drankknop__naam')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).length;
        return {
          etiketten: etiketten.length,
          afgekapt,
          glasHoogte: glas.height,
          glasMidden: (glas.top + glas.bottom) / 2,
          blokMidden: (blokTop + blokOnder) / 2,
          tegelOnderKop: eerste.top - kop.bottom,
          naamBreedte,
          paarDrinken: Math.abs(r('.drinkkaart').height - r('.vc--supp').height),
          paarRij1: Math.abs(r('.voortgang').height - r('.vc--stemming').height),
          paarRij3: Math.abs(r('.vc--eten').height - r('.vc--kalender').height),
        };
      });
      expect(m.etiketten, 'de etiketten van Laatst gedronken').toBeGreaterThan(0);
      expect(m.afgekapt, 'afgekapt etiket').toBe(0);
      expect(m.glasHoogte, 'glas minstens 100 px hoog').toBeGreaterThanOrEqual(100);
      expect(Math.abs(m.glasMidden - m.blokMidden), 'glas verticaal op het cijferblok gecentreerd').toBeLessThanOrEqual(8);
      expect(m.tegelOnderKop, 'de eerste rij dranktegels begint direct onder het kopje Dranken').toBeLessThanOrEqual(24);
      expect(m.naamBreedte, 'afgekapte naam in een dranktegel').toBe(0);
      // Drinken en Supplementen staan pas vanaf 1100 px naast elkaar (daaronder onder elkaar over de volle breedte)
      if (breedte >= 1100) expect(m.paarDrinken, 'Drinken en Supplementen even hoog').toBeLessThanOrEqual(1);
      expect(m.paarRij1, 'motivator en Stemming even hoog').toBeLessThanOrEqual(1);
      expect(m.paarRij3, 'Eten en Kalender even hoog').toBeLessThanOrEqual(1);
      // geen leeg vlak boven 32 px (34 px = 32 px plus 2 px meetafwijking), ook niet in Stemming en energie; alleen de Notitie en het maandpaneel zijn hier niet aanwezig
      const kaarten = await meetKaarten(page, '#scherm');
      const leeg = kaarten.filter((k) => k.gat > 34).map((k) => `${k.naam}: ${Math.round(k.gat)} px`);
      expect(leeg, 'leeg vlak in een kaart').toEqual([]);
    });

    // Een gebruiker zonder supplementen: Drinken staat over de volle breedte (geen Supplementen ernaast). Met doel gehaald (veel dranken) en met niets gedronken.
    for (const [aantal, toestand] of [[14, 'doel gehaald'], [0, 'niets gedronken'], [1, 'één drank'], [2, 'twee dranken']]) {
      test(`Drinken over de volle breedte zonder supplementen (${toestand}): één aaneengesloten tegelraster, beide helften gevuld`, async ({ page }) => {
        await begin(page, 'vandaag', 'leeg');
        await page.evaluate(
          (n) =>
            new Promise((klaar, mislukt) => {
              const open = indexedDB.open('bloei-dagboek');
              open.onerror = () => mislukt(open.error);
              open.onsuccess = () => {
                const idb = open.result;
                const tx = idb.transaction(['dranken'], 'readwrite');
                const t2 = (x) => String(x).padStart(2, '0');
                const nu = new Date();
                const datum = `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`;
                const soorten = ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'];
                for (let i = 0; i < n; i++) tx.objectStore('dranken').add({ datum, tijdstip: nu.getTime() - (n - i) * 60000, soort: soorten[i % 6], ml: 250, voorbeeld: false });
                tx.oncomplete = () => {
                  idb.close();
                  klaar();
                };
                tx.onerror = () => mislukt(tx.error);
              };
            }),
          aantal,
        );
        await page.reload();
        await expect(page.locator('.drinkkaart .drankknop')).toHaveCount(6);
        await wachtOpRust(page);
        await expect(page.locator('.vc--supp')).toHaveCount(0);
        const m = await page.evaluate(() => {
          const r = (e) => e.getBoundingClientRect();
          const kaart = document.querySelector('.drinkkaart');
          const tegels = [...kaart.querySelectorAll('.drankknop')].map(r);
          const rijen = [...new Set(tegels.map((t) => Math.round(t.top)))];
          let grootsteTussenruimte = 0;
          for (const top of rijen) {
            const rij = tegels.filter((t) => Math.round(t.top) === top).sort((a, b) => a.left - b.left);
            for (let i = 1; i < rij.length; i++) grootsteTussenruimte = Math.max(grootsteTussenruimte, rij[i].left - rij[i - 1].right);
          }
          const kop = r(kaart.querySelector('.drinkkaart__andere > .label'));
          const raster = r(kaart.querySelector('.drankrij'));
          const andere = r(kaart.querySelector('.drinkkaart__andere'));
          const onderTegels = Math.max(...tegels.map((t) => t.bottom));
          // de onderkant van de inhoud links: balk, etiketten, tekst en knop
          const links = [...kaart.querySelectorAll('.drinkkaart__links .drinkbaan, .drinkkaart__links .laatst__chip, .drinkkaart__links .laatst__leeg, .drinkkaart__links .knop')].filter((e) => r(e).width > 0).map((e) => r(e).bottom);
          const glas = r(kaart.querySelector('.watervulling'));
          const glasKop = r(kaart.querySelector('.drinkkaart__links > .label'));
          const afgekapt = [...kaart.querySelectorAll('.laatst__chip, .laatst__chip *, .drankknop__naam, .drankknop__ml')].filter((e) => e.scrollWidth > e.clientWidth + 0.5 && r(e).width > 0).length;
          return {
            rijen: rijen.length,
            tegels: tegels.length,
            grootsteTussenruimte,
            tegelOnderKop: tegels[0].top - kop.bottom,
            rasterBreedte: raster.width,
            rasterLinks: raster.left - andere.left,
            onderTegels,
            onderLinks: Math.max(...links),
            glasOnderKop: glas.top - glasKop.bottom,
            afgekapt,
          };
        });
        expect(m.tegels, 'zes tegels').toBe(6);
        expect(m.rijen, 'twee rijen van drie').toBe(2);
        expect(m.grootsteTussenruimte, 'horizontale tussenruimte tussen buren').toBeLessThanOrEqual(24);
        expect(m.tegelOnderKop, 'de eerste rij tegels begint direct onder het kopje Dranken').toBeLessThanOrEqual(24);
        expect(m.rasterBreedte, 'het raster heeft de breedte van zijn inhoud').toBeLessThanOrEqual(400);
        expect(Math.abs(m.onderTegels - m.onderLinks), 'beide helften eindigen op dezelfde lijn').toBeLessThanOrEqual(12);
        expect(m.glasOnderKop, 'het glas begint onder het kopje Vandaag zonder vlak boven 32 px').toBeLessThanOrEqual(32);
        expect(m.afgekapt, 'niets afgekapt').toBe(0);
        const kaarten = await meetKaarten(page, '#scherm');
        // Eten is op een dag zonder gegevens een lege staat (buiten dit spoor): alleen Drinken en Stemming en energie tellen mee
        const leeg = kaarten.filter((k) => k.gat > 34 && /drinkkaart|stemming/.test(k.naam)).map((k) => `${k.naam}: ${Math.round(k.gat)} px`);
        expect(leeg, 'leeg vlak in Drinken of Stemming en energie').toEqual([]);
      });
    }
  });
}

// De begroeting tussen 960 en 1439 px: altijd op één regel (ook "Goeienavond" met een naam van 20 tekens), niets afgekapt, geen overlap met de knoppen Uitleg en Delen,
// met een lettermaat die met de breedte meegroeit (één clamp) en een koprij die tussen 1280 en 1366 px hoogstens 12 px verschilt.
const NAMEN = ['Testn', 'Testnaamabcd', 'Testnaamabcdefghijkl']; // 5, 12 en 20 tekens
const DAGDELEN = [[9, 'ochtend'], [14, 'middag'], [20, 'avond']];

async function zetNaamEnDagdeel(page, naam, uur) {
  await page.clock.setFixedTime(new Date(2026, 10, 15, uur, 0, 0));
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await page.evaluate(
    (nm) =>
      new Promise((klaar, mislukt) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: nm });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    naam,
  );
  await page.reload();
  await expect(page.locator('.vandaag__begroeting .begroeting__titel')).toBeVisible();
  await wachtOpRust(page);
}

const meetBegroeting = (page) =>
  page.evaluate(() => {
    const t = document.querySelector('.vandaag__begroeting .begroeting__titel');
    const r = t.getBoundingClientRect();
    const knoppen = [...document.querySelectorAll('.vandaag__begroeting .begroeting__uitleg, .vandaag__begroeting .begroeting__delen')].map((e) => e.getBoundingClientRect());
    const tekstRechts = Math.max(...[...t.children].map((c) => c.getBoundingClientRect().right));
    return {
      regels: Math.round(r.height / parseFloat(getComputedStyle(t).lineHeight)),
      lettermaat: parseFloat(getComputedStyle(t).fontSize),
      afgekapt: t.scrollWidth > t.clientWidth + 1,
      ruimteTotKnoppen: Math.min(...knoppen.map((k) => k.left)) - tekstRechts,
      kop: document.querySelector('.vandaag__begroeting').getBoundingClientRect().height,
    };
  });

for (const [breedte, hoogte] of [[960, 800], [1024, 768], [1180, 820], [1280, 800], [1366, 1024], [1439, 900]]) {
  test.describe(`Begroeting ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: true, isMobile: false });
    test(`één regel, niets afgekapt en geen overlap met de knoppen (3 dagdelen, namen van 5, 12 en 20 tekens)`, async ({ page }) => {
      await page.goto('./#/vandaag');
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      let vorige = 0;
      for (const [uur, dagdeel] of DAGDELEN) {
        for (const naam of NAMEN) {
          await zetNaamEnDagdeel(page, naam, uur);
          const m = await meetBegroeting(page);
          const tekst = `${dagdeel} ${naam.length} tekens: ${JSON.stringify(m)}`;
          expect(m.regels, tekst).toBe(1);
          expect(m.afgekapt, tekst).toBe(false);
          expect(m.ruimteTotKnoppen, tekst).toBeGreaterThanOrEqual(8);
          // BESLISSING 594 tot 596: de knoppen Rondleiding en Delen zijn elk 8rem breed; op 960 tot 1099 px blijft daardoor 19 px over voor de begroeting (was 21)
          expect(m.lettermaat, tekst).toBeGreaterThanOrEqual(breedte < 1100 ? 19 : 21);
          expect(m.lettermaat, tekst).toBeLessThanOrEqual(44.5);
          if (vorige) expect(Math.abs(m.lettermaat - vorige), 'de lettermaat hangt niet van de naam af').toBeLessThanOrEqual(0.5);
          vorige = m.lettermaat;
        }
      }
    });
  });
}

test('Begroeting: de koprij is op 1280 en 1366 px even hoog (hoogstens 12 px verschil) en de lettermaat groeit vloeiend', async ({ page }) => {
  const maten = [];
  for (const [breedte, hoogte] of [[960, 800], [1024, 768], [1080, 810], [1133, 744], [1180, 820], [1280, 800], [1366, 1024], [1439, 900]]) {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await zetNaamEnDagdeel(page, 'Testnaamabcd', 14);
    maten.push([breedte, await meetBegroeting(page)]);
  }
  const kop = (b) => maten.find(([x]) => x === b)[1].kop;
  expect(Math.abs(kop(1280) - kop(1366)), 'koprij 1280 / 1366').toBeLessThanOrEqual(12);
  for (let i = 1; i < maten.length; i++) {
    expect(maten[i][1].lettermaat - maten[i - 1][1].lettermaat, `lettermaat ${maten[i - 1][0]} naar ${maten[i][0]}`).toBeGreaterThanOrEqual(-0.5);
    expect(maten[i][1].lettermaat - maten[i - 1][1].lettermaat, `lettermaat ${maten[i - 1][0]} naar ${maten[i][0]}`).toBeLessThanOrEqual(8);
  }
});

// BESLISSING 341: ook op 1440 px en breder staat de begroeting op één regel. De grote maat van nu blijft waar ze past (op 1690 x 1230 met een korte naam 94,05 px, gemeten vóór de wijziging),
// en krimpt vloeiend bij een langere naam, de langste begroeting van de dag of een smaller venster. Ook zonder naam (alleen "Goeiemorgen", zonder komma).
test.describe('Begroeting vanaf 1440 px: altijd één regel', () => {
  test.use({ hasTouch: false, isMobile: false });
  for (const [breedte, hoogte] of [[1440, 900], [1440, 1100], [1536, 864], [1690, 1230], [1920, 1080], [2200, 1300]]) {
    test(`${breedte}x${hoogte}: één regel, niets afgekapt, ≥ 8 px tot de knoppen (3 dagdelen, namen van 5, 12 en 20 tekens, en zonder naam)`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      let vorigeKort = 0;
      for (const naam of [...NAMEN, '']) {
        for (const [uur, dagdeel] of DAGDELEN) {
          await zetNaamEnDagdeel(page, naam, uur);
          const m = await meetBegroeting(page);
          const tekst = `${dagdeel}, ${naam.length} tekens: ${JSON.stringify(m)}`;
          expect(m.regels, tekst).toBe(1);
          expect(m.afgekapt, tekst).toBe(false);
          expect(m.ruimteTotKnoppen, tekst).toBeGreaterThanOrEqual(8);
          expect(m.lettermaat, tekst).toBeGreaterThanOrEqual(24);
          if (naam === 'Testn') {
            expect(m.lettermaat, 'een korte naam krijgt nooit een kleinere maat dan een langere').toBeGreaterThanOrEqual(vorigeKort - 0.5);
            vorigeKort = m.lettermaat;
          }
        }
      }
    });
  }

  test('1690x1230 met een naam van 8 tekens: dezelfde lettermaat, plaats en hoogte als vóór de wijziging (94,05 px, y 32, 98,7 px hoog)', async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await zetNaamEnDagdeel(page, 'Testnaam', 9);
    const m = await page.evaluate(() => {
      const r = document.querySelector('.vandaag__begroeting .begroeting__titel').getBoundingClientRect();
      return { maat: parseFloat(getComputedStyle(document.querySelector('.vandaag__begroeting .begroeting__titel')).fontSize), y: r.top, hoogte: r.height };
    });
    expect(Math.abs(m.maat - 94.05), JSON.stringify(m)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.y - 32), JSON.stringify(m)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.hoogte - 98.7), JSON.stringify(m)).toBeLessThanOrEqual(0.5);
  });

  test('op een laag venster (1440x800) blijft de kleinere maat gelden als die op één regel past', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await zetNaamEnDagdeel(page, 'Testn', 14);
    const m = await meetBegroeting(page);
    expect(m.lettermaat).toBeLessThanOrEqual(36);
    expect(m.regels).toBe(1);
  });
});
