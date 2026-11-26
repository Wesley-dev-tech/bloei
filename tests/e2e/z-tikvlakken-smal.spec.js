// BESLISSING 426: ook op de smalste telefoons (320 tot 360 px breed) heeft elk tikbaar element een tikvlak van minstens 44 x 44 px,
// twee tikvlakken overlappen elkaar niet, niets valt horizontaal buiten het scherm en niets wordt afgekapt.
// z-toegankelijkheid.spec.js meet hetzelfde op 390 px (en meet het element zelf); deze spec meet het echte TIKVLAK (tikvlak-meting.js:
// het element met zijn vergrotende pseudo-element, doorzichtige rand of label, gemeten met elementFromPoint) op elk scherm en in elke
// toestand: de gewone app met gezaaide gegevens (r-gegevens.js), de pop-ups, de melding met "Ongedaan maken", de installatiestrook,
// het welkomscherm, het slot en de rondleiding. Gewone knoppen op 360 px zijn dus ook gemeten.
//
// Meetmodus voor het opsporen van tekorten: TIKVLAK_RAPPORT=pad.jsonl schrijft per toestand alles wat onder 44 px blijft
// (ook de uitzonderingen) naar dat bestand en laat de test niet falen; TIKVLAK_BREEDTES=320x568,340x640,360x740 kiest de breedtes.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { meetTikvlakken, sorteer } from './tikvlak-meting.js';
import { authenticator } from './slot-hulp.js';

const BREEDTES = (process.env.TIKVLAK_BREEDTES || '320x568,360x740').split(',').map((s) => s.split('x').map(Number));
const RAPPORT = process.env.TIKVLAK_RAPPORT || '';
const LEEG = { cookies: [], origins: [] };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

// Terechte uitzonderingen BOVEN op de inline-link (een a[href] midden in een zin, WCAG 2.5.8; in tikvlak-meting.js). Elke uitzondering
// heeft een reden. De lijst is bewust leeg en kort: een tikvlak onder 44 px is een tekortkoming tenzij hier staat waarom niet.
const UITZONDERINGEN = [
  // Een label dat alleen de focus naar een invoerveld stuurt: het veld zelf (minstens 44 px hoog) is het tikvlak, het label is de tekst erboven.
  { regel: 'label boven een invoerveld (het veld is het tikvlak)', past: (it) => /^label..*herstel__label/.test(it.klasse) },
  // De drie icoonknoppen in de compacte schermkop (Rondleiding, Delen, huisje) zijn sinds 0.3.8 met opzet 40 x 40 px, zodat de titel en de
  // knoppen op één regel staan. Eigenaar, 26 november 2026: de app blijft zo, de test laat 40 px toe voor deze knoppen.
  { regel: 'icoonknop in de compacte schermkop: 40 x 40 px (eigenaar)', past: (it) => /icoonknop.*schermkop__(uitleg|delen|home)/.test(it.klasse) && it.vlak.w >= 39.5 && it.vlak.h >= 39.5 },
];

// BESLISSING 524 (eigenaar): "Zo laten op de smalste telefoons". Zeven vlakken naast elkaar (de week-stippen en de kalender op Vandaag, de maandkalender van het Dagboek, de
// weekstaven op Drinken) vragen 308 px; onder 370 px breed is een kaart 240 tot 318 px. Het tikvlak is daar zo breed als zijn kolom (minstens 32 px) en minstens 43,5 px
// hoog. Dit is een blijvende, benoemde uitzondering, alleen voor deze vier soorten en alleen onder 370 px; alles daarbuiten blijft streng op 44 px. Overlap blijft overal
// verboden: het tikvlak van een buur stopt bij de grens van zijn kolom.
const ZEVEN_NAAST_ELKAAR = /^(a.week__link|button.kalender__dag|button.mk__dag|a.weekstaaf)(.|$)/;
const uitzonderingZeven = (breedte) => [{ regel: 'BESLISSING 524: zeven naast elkaar onder 370 px', past: (it) => breedte < 370 && ZEVEN_NAAST_ELKAAR.test(it.klasse) && it.vlak.w >= 32 && it.vlak.h >= 43.5 }];

// Per test: de fouten verzamelen en aan het eind in één keer tonen, met scherm, toestand, element en maat.
function meter(page, breedte, scherm) {
  const fouten = [];
  const meet = async (toestand, opties = {}) => {
    const m = await meetTikvlakken(page, opties);
    const { klein, uitgezonderd } = sorteer(m, [...UITZONDERINGEN, ...uitzonderingZeven(breedte)]);
    const kop = `${breedte}px | ${scherm} | ${toestand}`;
    const regels = [];
    for (const k of klein) regels.push(`${kop} | tikvlak ${k.bedekt ? 'bedekt' : `${k.vlak.w} x ${k.vlak.h}`} (element ${k.eigen.w} x ${k.eigen.h}): ${k.rol} "${k.naam}" [${k.klasse}]`);
    for (const o of m.overlappen) regels.push(`${kop} | overlap ${o.w} x ${o.h}: "${o.a}" met "${o.b}"`);
    for (const o of m.overloop) regels.push(`${kop} | valt buiten het scherm (${o.links} tot ${o.rechts} bij ${o.vw}): "${o.naam}" [${o.klasse}]`);
    for (const o of m.afgekapt) regels.push(`${kop} | afgekapt (${o.scrollWidth} > ${o.clientWidth}): "${o.naam}" [${o.klasse}]`);
    if (m.paginaOverloop > 1) regels.push(`${kop} | de pagina loopt ${m.paginaOverloop} px horizontaal over`);
    if (m.schermOverloop > 1) regels.push(`${kop} | #scherm loopt ${m.schermOverloop} px horizontaal over`);
    if (!m.items.length) regels.push(`${kop} | niets gemeten (leeg scherm?)`);
    fouten.push(...regels);
    if (RAPPORT) {
      fs.appendFileSync(RAPPORT, JSON.stringify({ breedte, scherm, toestand, n: m.items.length, klein, uitgezonderd, overlappen: m.overlappen, overloop: m.overloop, afgekapt: m.afgekapt, paginaOverloop: m.paginaOverloop, schermOverloop: m.schermOverloop }) + '\n');
    }
  };
  const klaar = () => (RAPPORT ? expect(true).toBe(true) : expect(fouten, 'tikvlakken, overlap, overloop en afkapping').toEqual([]));
  return { meet, klaar };
}

async function start(page, soort = 'vol', route = 'vandaag') {
  await vasteKlok(page);
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await vulGegevens(page, soort);
  await naar(page, route);
}

async function naar(page, route) {
  await page.evaluate((r) => (location.hash = '#/' + r), route);
  await schermKlaar(page, route);
}

// Sluit alle pop-ups: Escape; blijft het venster staan (een blad met wijzigingen), dan de knop Sluiten of Annuleren van het bovenste venster.
async function sluitPopups(page) {
  for (let i = 0; i < 10 && (await page.locator('dialog[open]').count()); i++) {
    const venster = page.locator('dialog[open]').last();
    const voor = await page.locator('dialog[open]').count();
    const niet = venster.getByRole('button', { name: /^Niet bewaren/ });
    if (await niet.count()) await niet.evaluate((el) => el.click());
    else await page.keyboard.press('Escape');
    await animatiesKlaar(page);
    if ((await page.locator('dialog[open]').count()) === voor && !(await niet.count())) {
      const sluit = venster.getByRole('button', { name: /^(Sluiten|Annuleren|Nee|Laten staan)/ }).first();
      if (await sluit.count()) await sluit.evaluate((el) => el.click());
      await animatiesKlaar(page);
    }
  }
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

async function zaaiFavorieten(page, n) {
  await page.evaluate(
    (n) =>
      new Promise((klaar, mislukt) => {
        const o = indexedDB.open('bloei-dagboek');
        o.onerror = () => mislukt(o.error);
        o.onsuccess = () => {
          const db = o.result;
          const tx = db.transaction(['favorieten'], 'readwrite');
          tx.objectStore('favorieten').clear();
          const teksten = ['Havermout met fruit', 'Yoghurt met noten en honing', 'Brood met kaas', 'Soep met een boterham en een extra lange omschrijving erbij', 'Rijst met groenten', 'Pasta met tomatensaus'];
          for (let i = 0; i < n; i++) tx.objectStore('favorieten').add({ tekst: teksten[i % 6], sleutel: teksten[i % 6].toLowerCase(), laatstGebruikt: Date.now() - i * 1000 });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    n,
  );
  await page.reload();
}

// Elke keuze in de open pop-up aantikken (het supplementblad heeft er meerdere groepen) en na elke keuze meten.
async function doorloopKeuzes(page, meet, naam) {
  const n = await page.locator('dialog[open] [role=radio]:visible').count();
  for (let i = 0; i < n; i++) {
    const keuze = page.locator('dialog[open] [role=radio]:visible').nth(i);
    if ((await keuze.getAttribute('aria-checked')) === 'true' || (await keuze.isDisabled())) continue;
    await keuze.click();
    await animatiesKlaar(page);
    await meet(`${naam}, keuze ${i + 1} gekozen`);
  }
}

for (const [breedte, hoogte] of BREEDTES) {
  test.describe(`tikvlakken op ${breedte} x ${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: true, hasTouch: true });

    test('Vandaag: scherm, drankknoppen, melding, maaltijdblad', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Vandaag');
      await start(page, 'vol', 'vandaag');
      await meet('scherm met tabbalk en vaste kop');
      await page.locator('.vandaag .maaltijd[data-soort="ontbijt"] > .rij').click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('maaltijdblad met tekst (Klaar, Annuleren, Verwijderen)');
      await sluitPopups(page);
      await page.locator('.drankknop[data-soort="water"]').click();
      await expect(page.locator('.strook')).toBeVisible();
      await meet('melding met Ongedaan maken', { wortel: '.strook' });
      await klaar();
    });

    test('Vandaag: favorietenstrook en leeg maaltijdblad met favorieten', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Vandaag');
      await start(page, 'gewoon', 'vandaag');
      await zaaiFavorieten(page, 6);
      await schermKlaar(page, 'vandaag');
      await expect(page.locator('.eten__favorieten')).toBeVisible();
      await meet('favorietenstrook en lege maaltijd');
      await page.locator('.vandaag .maaltijd[data-soort="middagmaal"] > .rij').click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('leeg maaltijdblad met favorieten');
      await sluitPopups(page);
      await klaar();
    });

    test.describe('met de installatiestrook', () => {
      test.use({ userAgent: IPHONE_UA });
      test('Vandaag: installatiestrook (Safari)', async ({ page }) => {
        const { meet, klaar } = meter(page, breedte, 'Vandaag');
        await start(page, 'vol', 'vandaag');
        await expect(page.locator('.installatiestrook')).toBeVisible();
        await meet('installatiestrook');
        await klaar();
      });
    });

    test('Dagboek: dag, week en maand', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Dagboek');
      await start(page, 'vol', 'dagboek/dag');
      await meet('dag, met bladerkop en knoppen Dag/Week/Maand');
      await page.getByRole('button', { name: 'Vorige', exact: true }).click();
      await animatiesKlaar(page);
      await meet('dag, een dag terug');
      await page.getByRole('button', { name: 'Volgende', exact: true }).click();
      await animatiesKlaar(page);
      await page.locator('.dag .rij--knop').first().click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('dag, maaltijdblad');
      await sluitPopups(page);
      await naar(page, 'dagboek/week');
      await meet('week, met bladerkop');
      await naar(page, 'dagboek/maand');
      await meet('maand');
      await page.locator('.mk__dag:not(.is-toekomst)').nth(2).click();
      await animatiesKlaar(page);
      await meet('maand, een geopende dag');
      await klaar();
    });

    test('Drinken: weekkaart, dagblad, melding', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Drinken');
      await start(page, 'vol', 'drinken');
      await meet('scherm met weekkaart en pijltjes');
      await page.getByRole('button', { name: 'Vorige week' }).click();
      await animatiesKlaar(page);
      await meet('een week terug');
      await page.getByRole('button', { name: 'Volgende week' }).click();
      await animatiesKlaar(page);
      await page.locator('.drankknop[data-soort="thee"]').click();
      await expect(page.locator('.strook')).toBeVisible();
      await meet('melding met Ongedaan maken', { wortel: '.strook' });
      await expect(page.locator('.strook')).toHaveCount(0); // de melding verdwijnt na een paar seconden; zolang ze er is, bedekt ze de onderkant
      await naar(page, 'drinken/2026-11-10');
      await meet('dagblad van een andere dag');
      await klaar();
    });

    test('Supplementen: lijst, supplementblad, weekkaart', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Supplementen');
      await start(page, 'vol', 'supplementen');
      await meet('lijst met weekkaart');
      await page.getByRole('button', { name: /^Supplement toevoegen$/ }).first().click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('supplementblad, nieuw');
      await doorloopKeuzes(page, meet, 'supplementblad, nieuw');
      await sluitPopups(page);
      await page.locator('.supplementrij').first().click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('supplementblad, bestaand supplement');
      await doorloopKeuzes(page, meet, 'supplementblad, bestaand');
      await sluitPopups(page);
      await klaar();
    });

    test('Gewicht: kaarten, pop-ups, grafiek en lijst', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Gewicht');
      await start(page, 'vol', 'gewicht');
      await meet('drie kaarten, grafiek en lijst');
      for (const naam of ['3 maanden', 'Jaar']) {
        await page.getByRole('radio', { name: naam }).click();
        await animatiesKlaar(page);
        await meet(`grafiek, segment ${naam}`);
      }
      for (const [knop, toestand] of [
        ['Weging noteren', 'pop-up Weging noteren'],
        ['Streefgewicht zetten', 'pop-up Streefgewicht'],
        ['Weegdag aanpassen', 'pop-up Weegdag'],
      ]) {
        await page.getByRole('button', { name: knop }).first().click();
        await expect(page.locator('dialog[open]')).toBeVisible();
        await animatiesKlaar(page);
        await meet(toestand);
        await sluitPopups(page);
      }
      await klaar();
    });

    test('Algemeen en de instelschermen', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Algemeen');
      await start(page, 'vol', 'meer');
      await meet('Algemeen');
      await page.getByRole('button', { name: 'Profiel verwijderen' }).click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('Algemeen, Profiel verwijderen');
      await sluitPopups(page);
      await zaaiFavorieten(page, 4);
      for (const [route, naam] of [
        ['meer/profiel', 'Naam en foto'],
        ['meer/instellingen', 'Drinken'],
        ['meer/gewicht', 'Gewicht'],
        ['meer/meldingen', 'Herinneringen'],
        ['meer/vergrendeling', 'Vergrendeling'],
        ['meer/uitleg', 'Rondleiding'],
        ['meer/favorieten', 'Favorieten'],
        ['meer/badges', 'Badges'],
      ]) {
        await naar(page, route);
        await meet(naam);
      }
      // Vergrendeling: de schakelaar aan toont het cijferblok om een code te kiezen
      await naar(page, 'meer/vergrendeling');
      await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
      await expect(page.locator('.cijferblok')).toBeVisible();
      await animatiesKlaar(page);
      await meet('Vergrendeling, cijferblok om een code te kiezen');
      // Badges: een geopende medaille
      await naar(page, 'meer/badges');
      await page.locator('.medaillekaart').first().click();
      await animatiesKlaar(page);
      await meet('Badges, geopende medaille');
      await sluitPopups(page);
      await klaar();
    });

    test('Delen: perioden, aangepast, vinkjes en knoppen', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Delen');
      await start(page, 'vol', 'delen');
      await meet('zeven periodeknoppen, vinkjes, Versturen, Bewaren, Afdrukken');
      await page.getByRole('button', { name: 'Aangepast' }).click();
      await animatiesKlaar(page);
      await meet('Aangepast met de datumvelden');
      await page.getByRole('checkbox', { name: 'Notities' }).click();
      await animatiesKlaar(page);
      await meet('een vinkje omgezet');
      await klaar();
    });

    test('Rondleiding: de kaart met haar knoppen', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Rondleiding');
      await start(page, 'vol', 'vandaag');
      await page.getByRole('button', { name: 'Rondleiding van dit scherm' }).first().click();
      const kaart = page.locator('.uitleg__kaart[role="dialog"]');
      await expect(kaart).toBeVisible();
      await animatiesKlaar(page);
      await meet('eerste stap', { wortel: '.uitleg__kaart' });
      await kaart.getByRole('button', { name: 'Volgende' }).evaluate((el) => el.click());
      await animatiesKlaar(page);
      await meet('tweede stap', { wortel: '.uitleg__kaart' });
      await klaar();
    });

    test('Vergrendeling instellen, slot en herstel (BESLISSING 518)', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Slot');
      // Een nagebootste platformauthenticator (zoals c-slot.spec.js en x-welkom-slot.spec.js): het toestel kan bevestigen, dus de weg met het toestel staat
      // bij "Je code niet meer weten" en de zin bij Vergrendeling noemt het toestel (BESLISSING 541). Hier wordt alleen gemeten, er wordt niet mee bevestigd.
      await authenticator(page, 'ok'); // echte WebAuthn-antwoorden uit slot-hulp.js (BESLISSING 518): de app weigert een te simpele nabootsing
      await start(page, 'vol', 'meer/vergrendeling');
      await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
      await expect(page.locator('.cijferblok')).toBeVisible();
      for (let ronde = 0; ronde < 2; ronde++) for (const c of '123456') await page.locator(`.cijferblok__toets[data-cijfer="${c}"]`).click();
      // na de code meteen de herstelcode (vinkje en Verder), dan staat het slot aan (BESLISSING 541: geen aanbod om het toestel te koppelen)
      const herstel = page.locator('[data-herstelstap]');
      await expect(herstel).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap met de herstelcode (Kopieren, Bewaren als bestand, vinkje, Verder, Annuleren)');
      await herstel.getByRole('checkbox').evaluate((el) => el.click());
      await herstel.getByRole('button', { name: /^Verder/ }).evaluate((el) => el.click());
      const schakelaar = page.getByRole('switch', { name: /^Bloei vergrendelen/ });
      await expect(schakelaar).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('.strook')).toHaveCount(0); // de melding "De vergrendeling staat aan." bedekt de onderkant zolang ze er is
      await animatiesKlaar(page);
      await meet('Algemeen, Vergrendeling met de rijen Pincode en Herstelcode en de zin over een vergeten code');
      await page.reload();
      await expect(page.locator('#slot')).toBeVisible();
      await expect(page.locator('.cijferblok')).toBeVisible();
      await animatiesKlaar(page);
      await meet('slot dicht', { wortel: '#slot' });
      await page.locator('#slot').getByRole('button', { name: 'Ik ken mijn code niet meer' }).evaluate((el) => el.click());
      await expect(page.locator('#slot .slot__kwijt')).toBeVisible();
      await animatiesKlaar(page);
      await meet('Je code niet meer weten', { wortel: '#slot' });
      await page.locator('#slot').getByRole('button', { name: 'Gebruik je herstelcode' }).evaluate((el) => el.click());
      await animatiesKlaar(page);
      await meet('invoer van de herstelcode', { wortel: '#slot' });
      await klaar();
    });
  });

  test.describe(`welkomscherm op ${breedte} x ${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: true, hasTouch: true, storageState: LEEG });

    test('Welkom: vier stappen en het cijferblok', async ({ page }) => {
      const { meet, klaar } = meter(page, breedte, 'Welkom');
      await vasteKlok(page);
      await page.goto('./');
      await expect(page.locator('[data-scherm="welkom"]')).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap 1, naam');
      const verder = page.locator('.welkom__knoppen .knop--primair');
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      await verder.click();
      await expect(page.getByText('Stap 2 van 5')).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap 2, geboortedatum');
      await verder.click();
      await expect(page.getByText('Stap 3 van 5')).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap 3, hoeveel drinken');
      await verder.click();
      await expect(page.getByText('Stap 4 van 5')).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap 4, weegdag');
      await verder.click();
      await expect(page.getByText('Stap 5 van 5')).toBeVisible();
      await animatiesKlaar(page);
      await meet('stap 5, vergrendelen');
      await page.getByRole('button', { name: 'Vergrendeling instellen' }).click();
      await expect(page.locator('.cijferblok')).toBeVisible();
      await animatiesKlaar(page);
      await meet('cijferblok na Vergrendeling instellen');
      await klaar();
    });
  });
}
