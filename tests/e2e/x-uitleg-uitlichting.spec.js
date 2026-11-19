// De rondleidingen op elk toestel (BESLISSINGEN 523 en 548): iPhone 390, 360, 320 en 430, een telefoon liggend, Android (Pixel 7), iPad staand en liggend,
// en twee schermen op een computer. Per stap, gemeten in de pagina (x-uitleg-meting.js):
//  - het gat valt om het ZICHTBARE onderdeel (± 2 px, met dezelfde afronding): een vlak precies op zijn rand, een groep met een gelijke
//    marge; een knop met een doorzichtige rand (tikvlak 48, zichtbaar 36 of 38) binnen die rand; de zwevende balk onderaan om haar vlak;
//  - het onderdeel staat in beeld en wordt niet bedekt door de vaste kop of de balk onderaan; de kaart staat volledig in beeld, niet over
//    het onderdeel en niet over de vaste kop (BESLISSING 750: onder 600 px zichtbare hoogte wel over de gedimde vaste kop, zoals over de balk onderaan; BESLISSING 752: onder 520 px mag een kaart in vier delen);
//  - op een telefoon (BESLISSING 548) is het onderdeel ALTIJD volledig omkaderd en staat het volledig tussen de vaste kop en de balk onderaan,
//    samen met de kaart, zonder dat iemand scrolt; een afgesneden onderdeel is een fout (liggend alleen nog als uitzondering in een open blad);
//  - alle knoppen van de kaart hebben het zachte vlak van een omrande knop van het scherm (BESLISSINGEN 528 en 544), vlak tegenover de kaart
//    >= 1,3 : 1 en tekst >= 4,5 : 1; ze staan
//    in één rij, gecentreerd en even breed, met een tikvlak van minstens 44 px; Volgende verspringt niet;
//  - de sluier is neutraal; de focus staat in de kaart, die een modale dialog met een naam is;
//  - de hele rondleiding is van stap 1 tot Klaar door te tikken (aanraking) of te klikken; Vorige werkt; na Klaar staat de pagina waar
//    ze stond en keert de focus terug naar het vraagteken.
// BESLISSINGEN 570, 590 en 591: het vak volgt niet meer het element zelf maar een AFGEROND BLOK (de kaart met haar kop, niets doorsneden, de
// marge gemeten vanaf de inhoud), en op een telefoon kan een stap in afgeronde delen verdeeld zijn. De vorm van het vak wordt daarom gemeten met de
// strenge meting (x-uitleg-meting.js, meetStreng): geen doorsneden element, vak en kaart in beeld zonder overlap, geen kop buiten het vak, niets
// half uitstekend vlak boven of onder het vak (telefoon), gelijke marge, afgeronde hoeken, een helder vak; en binnen één reeks nooit twee keer
// dezelfde titel of tekst (BESLISSING 563). De kaart draagt de stap als data-stap (ook bij een deel). Onderaan: dezelfde meting over de ZICHTBARE
// maten van echte telefoons (de hoogte zonder de balken van de browser), met aanraking en met een muis.
// Daarnaast per toestel: sluiten met Escape, de terugknop en Overslaan, het toetsenbord, het volgen bij scrollen, draaien en een grotere
// letter, en de welkomstrook. In Salie en Nacht: de kleuren van stap 1 op elk scherm. In de demo (tag @demo): met de demobalk bovenaan.
// Eén pagina per toestel (beforeAll) met gezaaide gegevens; elke test start op zijn eigen scherm.
import { test, expect, devices } from '@playwright/test';
import { ONDERWERPEN, STAPPEN, doelKeuzes, stappenVoor } from '../../src/uitleg/stappen.js';
import { TEKSTEN } from '../../src/teksten.js';
import { STAND_BESTAND } from '../stand.js';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';
import { meetMaten, meetStap, meetStreng, referentie, toetsStap, uitlegRust, zaaiUitleg } from './x-uitleg-meting.js';

const P7 = devices['Pixel 7'];
const aanraking = { hasTouch: true, isMobile: true };
const computer = { hasTouch: false, isMobile: false, deviceScaleFactor: 1 };
export const TOESTELLEN = [
  { naam: 'iPhone 390', opt: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, ...aanraking }, themas: true },
  { naam: 'iPhone 360', opt: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 3, ...aanraking } },
  // BESLISSING 548: ook de kleinste en de grootste telefoon.
  { naam: 'iPhone 320', opt: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: 'iPhone 430', opt: { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: 'telefoon liggend 844', opt: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: 'Pixel 7', opt: { viewport: P7.viewport, userAgent: P7.userAgent, deviceScaleFactor: P7.deviceScaleFactor, ...aanraking }, android: true },
  { naam: 'iPad 820', opt: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: 'iPad 1180', opt: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: 'computer 1280', opt: { viewport: { width: 1280, height: 800 }, ...computer }, themas: true },
  { naam: 'computer 1690', opt: { viewport: { width: 1690, height: 1230 }, ...computer } },
];
const ROUTES = ['vandaag', 'dagboek', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen', 'meer/instellingen', 'meer/gewicht', 'meer/vergrendeling', 'meer/meldingen', 'meer/profiel', 'meer/favorieten', 'meer/badges'];
const HANDELINGEN = Object.keys(STAPPEN).filter((k) => k.startsWith('h:'));
const sleutelVan = (route) => (route.startsWith('dagboek') ? 'dagboek' : route);
const schermVan = (route) => (route.startsWith('dagboek') ? 'dagboek' : route);
const DEMO = process.env.PW_RONDE === 'demo';
const BASIS = `http://localhost:${process.env.PW_POORT || '4173'}/`;

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]');
const stapLabel = (page) => kaart(page).locator('.uitleg__stap');

// De stap bij een titel, over de varianten van het toestel heen (Android heeft eigen teksten en stappen).
function stapOpTitel(sleutel, titel) {
  for (const o of [{}, { android: true, chrome: true }, { android: true, chrome: true, apk: true }, { android: true, chrome: false }]) {
    const s = stappenVoor(sleutel, { android: false, chrome: false, apk: false, ...o }).find((x) => x.titel === titel);
    if (s) return s;
  }
  return null;
}

// BESLISSING 548: het doel dat de rondleiding nu aanwijst (op een klein scherm soms een kleiner deel, stappen.js `klein`). De kaart draagt het
// (data-doel, data-ook); het moet een van de toegestane doelen van de stap zijn. Geeft de stap met dat doel.
async function stapUitKaart(page, sleutel, titel) {
  const id = await kaart(page).getAttribute('data-stap');
  for (const o of [{}, { android: true, chrome: true }, { android: true, chrome: true, apk: true }, { android: true, chrome: false }]) {
    const s = stappenVoor(sleutel, { android: false, chrome: false, apk: false, ...o }).find((x) => x.id === id);
    if (s) return s;
  }
  return stapOpTitel(sleutel, titel);
}

async function gekozenStap(page, stap, fouten, wie) {
  if (!stap || stap.midden) return stap;
  const g = await kaart(page).evaluate((k) => ({ doel: k.dataset.doel || null, ook: k.dataset.ook || null, deel: k.dataset.deel || null }));
  const vp = page.viewportSize();
  // Een afgerond deel (data-deel) draagt het doel van de stap zonder ook (rondleiding.js deelKeuze): het deel heeft zijn eigen rijen, het ook
  // van de stap (BESLISSING 563) hoort bij het hele blok. Bij een deel zonder ook vergelijken we dus alleen het doel.
  const zelfde = (x) => x.doel === g.doel && (g.deel && g.ook === null ? true : (x.ook ?? null) === g.ook);
  const k0 = doelKeuzes(stap, { breed: vp.width, hoog: vp.height }).find(zelfde);
  const k = k0 && g.deel ? { ...k0, ook: g.ook } : k0;
  if (!k) {
    fouten.push(`${wie}: de kaart wijst ${JSON.stringify({ doel: g.doel, ook: g.ook, ...(g.deel ? { deel: g.deel } : {}) })} aan, geen toegestaan doel van de stap`);
    return stap;
  }
  return { ...stap, ...k };
}

async function tik(page, loc, aanraak) {
  if (aanraak) await loc.tap();
  else await loc.click();
}

async function nieuwePagina(browser, opt) {
  const context = await browser.newContext({ ...opt, baseURL: BASIS, storageState: STAND_BESTAND, locale: 'nl-BE', timezoneId: 'Europe/Brussels' });
  const page = await context.newPage();
  await vasteKlok(page);
  await page.goto('./');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  if (!DEMO) {
    await zaaiUitleg(page);
    await page.reload();
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  }
  return { context, page };
}

async function openScherm(page, route) {
  await page.goto('./#/' + route);
  await schermKlaar(page, schermVan(route));
}

// Start de rondleiding van het scherm met het vraagteken in de kop, zoals een gebruiker.
async function startMetVraagteken(page, aanraak) {
  const knop = page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first();
  await tik(page, knop, aanraak);
  await expect(kaart(page)).toBeVisible();
}

// Loopt de lopende rondleiding af tot Klaar, met aanraking of de muis, en toetst elke stap. Geeft de fouten.
// BESLISSING 592: de vaste maten van de aanduiding (meetMaten, M1 tot M7) gelden al voor deze reeksen; een scherm komt erbij zodra het hersteld is.
// Daar vervangt meetMaten op een telefoon de oude toets op half uitstekende delen (die telde een rij met alleen een lijn erboven als een heel vlak).
// Wat de opmaak van de app zelf te dicht bij een blok zet (M5L), is geen fout van de aanduiding: dat staat in het rapport, niet bij de fouten.
const MATEN_592 = ['vandaag', 'h:maaltijd'];
async function loopAf(page, { sleutel, aanraak, naam }) {
  const fouten = [];
  const maten592 = MATEN_592.includes(sleutel) && page.viewportSize().width < 720;
  let eersteVolgende = null;
  const gezien = new Set(); // BESLISSING 563: titels en teksten van deze reeks
  const telefoonMaat = page.viewportSize().width < 720;
  for (let i = 1; i <= 40; i++) {
    await uitlegRust(page);
    const label = ((await stapLabel(page).textContent()) || '').trim();
    const totaal = Number(label.match(/van (\d+)/)?.[1]);
    if (label !== `Stap ${i} van ${totaal}`) fouten.push(`${naam}: stap ${i} toont "${label}"`);
    const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
    const basis = await stapUitKaart(page, sleutel, titel);
    let stap = await gekozenStap(page, basis, fouten, `${naam} stap ${i} (${titel})`);
    if (!stap) fouten.push(`${naam} stap ${i}: titel "${titel}" hoort bij geen stap`);
    // De kaart, de knoppen, de kleuren en de toegankelijkheid (toetsStap zonder stap); de vorm van het vak met de strenge meting.
    const m = await page.evaluate(meetStap, { doel: null, ook: null });
    for (const x of toetsStap(m, null).fouten) fouten.push(`${naam} stap ${i} (${titel}): ${x}`);
    const streng = await page.evaluate(meetStreng);
    const maten = maten592 ? await page.evaluate(meetMaten) : null;
    const vervangen = (x) => Boolean(maten) && (/^(half uitstekend|ongelijke marge|vak zonder afronding)/.test(x) || (maten.getallen?.vast === 'blad' && /^gat buiten de vrije zone/.test(x)));
    for (const x of streng.fouten ?? []) if ((telefoonMaat || !/^half uitstekend/.test(x)) && !vervangen(x)) fouten.push(`${naam} stap ${i} (${titel}): ${x}`);
    for (const x of maten?.fouten ?? []) fouten.push(`${naam} stap ${i} (${titel}): ${x}`);
    if (gezien.has('T' + streng.titel)) fouten.push(`${naam} stap ${i}: de titel "${streng.titel}" kwam al in deze reeks`);
    if (gezien.has('X' + streng.tekst)) fouten.push(`${naam} stap ${i} (${titel}): dezelfde tekst kwam al in deze reeks`);
    gezien.add('T' + streng.titel);
    gezien.add('X' + streng.tekst);
    // BESLISSING 549: Volgende (of Klaar) staat eerst: links in de rij, bovenaan als de knoppen onder elkaar staan. De volgorde in beeld is die van de DOM.
    const rij = m.knoppen.map((b) => b.tekst);
    const verwachtRij = [i === totaal ? TEKSTEN.uitleg.klaar : TEKSTEN.uitleg.volgende, ...(i > 1 ? [TEKSTEN.uitleg.vorige] : []), TEKSTEN.uitleg.overslaan];
    if (rij.join('|') !== verwachtRij.join('|')) fouten.push(`${naam} stap ${i}: knoppen ${rij.join(', ')} i.p.v. ${verwachtRij.join(', ')}`);
    const onderElkaar = m.knoppen.length > 1 && m.knoppen[1].t >= m.knoppen[0].b - 1;
    const zichtbaar = [...m.knoppen].sort((a, b) => (onderElkaar ? a.t - b.t : a.l - b.l)).map((b) => b.tekst);
    if (zichtbaar.join('|') !== rij.join('|')) fouten.push(`${naam} stap ${i}: de volgorde in beeld (${zichtbaar.join(', ')}) is niet die van de DOM`);
    // Volgende verspringt niet: zelfde linkerrand en hoogte; bij dezelfde schikking van de rij ook dezelfde afstand tot de onderkant van de kaart.
    const v = m.knoppen.find((b) => /uitleg__volgende/.test(b.klas));
    if (v) {
      const schikking = `${m.knoppen.length}-${onderElkaar}`;
      const plek = { links: Math.round(v.l - m.kaart.l), hoog: Math.round(v.h), onder: Math.round(m.kaart.b - v.b) };
      eersteVolgende ||= {};
      const eerder = eersteVolgende[schikking] || Object.values(eersteVolgende)[0];
      if (eerder && ['links', 'hoog', ...(eersteVolgende[schikking] ? ['onder'] : [])].some((s) => Math.abs(plek[s] - eerder[s]) > 1)) fouten.push(`${naam} stap ${i}: Volgende verspringt (${JSON.stringify(plek)} na ${JSON.stringify(eerder)})`);
      eersteVolgende[schikking] ||= plek;
    }
    if (i === 1 && (await kaart(page).getByRole('button', { name: TEKSTEN.uitleg.vorige }).count())) fouten.push(`${naam}: Vorige staat in stap 1`);
    // Het gat volgt: na wat scrollen (een onderdeel dat meeschuift) en, in de eerste en de laatste stap, na een andere venstermaat.
    const her = async (wat, naScrollen = false) => {
      await uitlegRust(page);
      stap = await gekozenStap(page, basis, fouten, `${naam} stap ${i} (${titel}) ${wat}`);
      const n = await page.evaluate(meetStap, { doel: null, ook: null });
      for (const x of toetsStap(n, null, { naScrollen }).fouten) fouten.push(`${naam} stap ${i} (${titel}) ${wat}: ${x}`);
      // na zelf scrollen hoeft het vak niet meer in beeld te staan (de kaart mag er dan over liggen en het afsnijden); wel: een helder, afgerond vak
      const n2 = await page.evaluate(meetStreng);
      for (const x of n2.fouten ?? []) if (!naScrollen ? telefoonMaat || !/^half uitstekend/.test(x) : /^(vak zonder afronding|gat niet helder)/.test(x)) fouten.push(`${naam} stap ${i} (${titel}) ${wat}: ${x}`);
    };
    if (stap && !stap.midden && !m.vast && !m.kwijt && (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 80))) {
      await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'instant' }));
      await her('na scrollen', true);
      await page.evaluate(() => window.scrollBy({ top: -40, behavior: 'instant' }));
      await uitlegRust(page);
    }
    // (zoals vroeger in c-uitleg: 64 x 48 kleiner; niet op de kleinste formaten zelf, 360 breed en liggend 390 hoog, waar dat een venster geeft
    // dat geen toestel heeft)
    const vp0 = page.viewportSize();
    if ((i === 1 || i === totaal) && vp0.width >= 390 && vp0.height >= 600) {
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.width - 64, height: vp.height - 48 });
      await her(`na ${vp.width - 64}x${vp.height - 48}`);
      await page.setViewportSize(vp);
      await her(`terug op ${vp.width}x${vp.height}`);
    }
    // Vorige in stap 2: terug naar stap 1 en weer verder.
    if (i === 2) {
      await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.vorige }), aanraak);
      await expect(stapLabel(page)).toHaveText(`Stap 1 van ${totaal}`);
      await uitlegRust(page); // de kaart is terug op haar plaats van stap 1 (een tik tijdens het schuiven valt op de sluier, zoals bij een gebruiker)
      await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
      await expect(stapLabel(page)).toHaveText(`Stap 2 van ${totaal}`);
      await uitlegRust(page);
    }
    if (i === totaal) {
      const klaar = kaart(page).getByRole('button', { name: TEKSTEN.uitleg.klaar });
      await expect(klaar).toBeVisible();
      await tik(page, klaar, aanraak);
      await expect(kaart(page)).toHaveCount(0);
      return fouten;
    }
    await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
    await expect(stapLabel(page)).toHaveText(`Stap ${i + 1} van ${totaal}`);
  }
  fouten.push(`${naam}: de rondleiding eindigt niet`);
  return fouten;
}

for (const toestel of TOESTELLEN) {
  const aanraak = Boolean(toestel.opt.hasTouch);
  test.describe(`uitleg op ${toestel.naam}`, DEMO ? { tag: '@demo' } : {}, () => {
    let context;
    let page;
    test.beforeAll(async ({ browser }) => {
      ({ context, page } = await nieuwePagina(browser, toestel.opt));
    });
    test.afterAll(async () => {
      await context?.close();
    });

    for (const route of ROUTES) {
      test(`${route}: elke stap licht het zichtbare onderdeel uit, de kaart staat vrij en in de kleur van het scherm, tot Klaar`, async () => {
        await openScherm(page, route);
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.evaluate(referentie);
        const beginY = await page.evaluate(() => window.scrollY);
        await startMetVraagteken(page, aanraak);
        await expect(page.locator('#app')).toHaveJSProperty('inert', true);
        const fouten = await loopAf(page, { sleutel: sleutelVan(route), aanraak, naam: route });
        expect(fouten, fouten.join('\n')).toEqual([]);
        // Na Klaar: de pagina staat waar ze stond, de app is weer bedienbaar en de focus staat op het vraagteken.
        await expect(page.locator('#app')).toHaveJSProperty('inert', false);
        await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(Math.round(beginY));
        await expect(page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first()).toBeFocused();
      });
    }

    if (!DEMO) {
      for (const sleutel of HANDELINGEN) {
        test(`${sleutel} ("Toon het me"): elke stap licht het zichtbare onderdeel uit, ook in een open blad, tot Klaar`, async () => {
          await openScherm(page, 'meer/uitleg');
          const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[sleutel.slice(2)]}` });
          await knop.scrollIntoViewIfNeeded();
          await tik(page, knop, aanraak);
          await expect(kaart(page)).toBeVisible({ timeout: 10000 });
          // Het scherm van de handeling is getekend; de referentie meten we daar (de rondleiding loopt al: de proefknop is onzichtbaar).
          await page.evaluate(referentie);
          const fouten = await loopAf(page, { sleutel, aanraak, naam: sleutel });
          expect(fouten, fouten.join('\n')).toEqual([]);
          await expect(page.locator('dialog[open]')).toHaveCount(0);
        });
      }
    }

    test('bediening: Escape, de terugknop en Overslaan sluiten; het toetsenbord loopt rond; het gat volgt scrollen, draaien en een grotere letter', async () => {
      const fouten = [];
      // Sluiten op drie manieren, vanaf stap 2, met de pagina wat gescrold: de route blijft, de stand en de focus keren terug.
      for (const manier of ['Escape', 'terugknop', 'Overslaan']) {
        await openScherm(page, 'drinken');
        await page.evaluate(() => window.scrollTo({ top: 120, behavior: 'instant' }));
        // Op een computer plakt de kop niet: het vraagteken komt eerst in beeld (zoals een gebruiker het ziet), pas dan telt de stand.
        await page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first().scrollIntoViewIfNeeded();
        const y0 = await page.evaluate(() => Math.round(window.scrollY));
        await startMetVraagteken(page, aanraak);
        // De kaart staat er al terwijl ze nog doorzichtig is en stap 1 nog niet toont: eerst stap 1 in beeld en rust, dan pas tikken (zoals een gebruiker).
        await expect(stapLabel(page)).toHaveText(/^Stap 1 van/);
        await uitlegRust(page);
        await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
        await expect(stapLabel(page)).toHaveText(/^Stap 2 van/);
        // Zelfde soort als hierboven: de kaart schuift nog naar stap 2; een tik op Overslaan tijdens het schuiven valt op de sluier (iPad 820).
        await uitlegRust(page);
        if (manier === 'Escape') await page.keyboard.press('Escape');
        else if (manier === 'terugknop') await page.goBack();
        else await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.overslaan }), aanraak);
        await expect(page.locator('.uitleg[data-uitleg-laag]'), manier).toHaveCount(0);
        await expect(page, manier).toHaveURL(/#\/drinken$/);
        await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), manier).toBe(y0);
        await expect(page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first(), manier).toBeFocused();
      }

      // Toetsenbord: Enter op het vraagteken, de focus staat op Volgende, Tab blijft in de kaart, Enter tot Klaar.
      await openScherm(page, 'drinken');
      await page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first().focus();
      await page.keyboard.press('Enter');
      await expect(kaart(page)).toBeVisible();
      // De kaart staat er al terwijl ze nog geen stap toont (de rondleiding start een tikje later): eerst "Stap 1 van" afwachten, dan pas het totaal lezen.
      await expect(stapLabel(page)).toHaveText(/^Stap 1 van \d+$/);
      const totaal = Number(((await stapLabel(page).textContent()) || '').match(/van (\d+)/)[1]);
      for (let i = 1; i <= totaal; i++) {
        await uitlegRust(page);
        const knopNaam = i === totaal ? TEKSTEN.uitleg.klaar : TEKSTEN.uitleg.volgende;
        await expect(kaart(page).getByRole('button', { name: knopNaam })).toBeFocused();
        if (i === 2) {
          for (let tab = 0; tab < 4; tab++) {
            await page.keyboard.press('Tab');
            expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.uitleg__kaart'))), 'Tab blijft in de kaart').toBe(true);
          }
          await kaart(page).getByRole('button', { name: knopNaam }).focus();
        }
        await page.keyboard.press('Enter');
        if (i < totaal) await expect(stapLabel(page)).toHaveText(`Stap ${i + 1} van ${totaal}`);
      }
      await expect(kaart(page)).toHaveCount(0);

      // Het gat volgt: scrollen, een andere venstermaat (draaien) en een grotere letter.
      await openScherm(page, 'vandaag');
      await page.evaluate(referentie);
      await startMetVraagteken(page, aanraak);
      await uitlegRust(page);
      await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
      await expect(stapLabel(page)).toHaveText(/^Stap 2 van/);
      await uitlegRust(page);
      await tik(page, kaart(page).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
      await expect(stapLabel(page)).toHaveText(/^Stap 3 van/);
      const basis = stappenVoor('vandaag')[2];
      const meet = async (wat, naScrollen = false) => {
        await uitlegRust(page);
        await gekozenStap(page, basis, fouten, wat);
        const m = await page.evaluate(meetStap, { doel: null, ook: null });
        for (const f of toetsStap(m, null, { naScrollen }).fouten) fouten.push(`${wat}: ${f}`);
        const n = await page.evaluate(meetStreng);
        for (const f of n.fouten ?? []) if (/^(vak zonder afronding|gat niet helder)/.test(f) || (!naScrollen && !/^half uitstekend/.test(f))) fouten.push(`${wat}: ${f}`);
      };
      await page.evaluate(() => window.scrollBy({ top: 40, behavior: 'instant' }));
      await meet('na scrollen', true);
      const vp = toestel.opt.viewport;
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await meet(`gedraaid ${vp.height}x${vp.width}`);
      await page.setViewportSize(vp);
      await meet('terug gedraaid');
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '125%'));
      await meet('grotere letter');
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
      await meet('gewone letter');
      await page.keyboard.press('Escape');
      await expect(kaart(page)).toHaveCount(0);
      expect(fouten, fouten.join('\n')).toEqual([]);
    });

    if (!DEMO && ['iPhone 390', 'Pixel 7', 'computer 1280'].includes(toestel.naam)) {
      test('meer/vergrendeling met het slot aan: de stap "Als je je code vergeet" licht de rij Herstelcode uit (BESLISSINGEN 531 en 541)', async ({ browser }) => {
        const eigen = await nieuwePagina(browser, toestel.opt);
        const p = eigen.page;
        try {
          await openScherm(p, 'meer/vergrendeling');
          await tik(p, p.getByRole('switch', { name: /^Bloei vergrendelen/ }), aanraak);
          for (const c of '123456123456') await tik(p, p.locator(`.cijferblok__toets[data-cijfer="${c}"]`), aanraak);
          const aanbod = p.locator('[data-toestelaanbod]');
          const herstel = p.locator('[data-herstelstap]');
          await expect(aanbod.or(herstel)).toBeVisible();
          if (await aanbod.isVisible()) await tik(p, p.getByRole('button', { name: 'Nee, dank je' }), aanraak);
          await tik(p, herstel.getByRole('checkbox', { name: 'Ik heb ze bewaard' }), aanraak);
          await tik(p, herstel.getByRole('button', { name: 'Verder' }), aanraak);
          await expect(p.locator('[data-uitleg="slot-herstel"]')).toBeVisible();
          await expect(p.locator('.strook')).toHaveCount(0, { timeout: 15000 }); // de melding "De vergrendeling staat aan." is weg
          await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await p.evaluate(referentie);
          await startMetVraagteken(p, aanraak);
          const fouten = await loopAf(p, { sleutel: 'meer/vergrendeling', aanraak, naam: 'meer/vergrendeling (slot aan)' });
          expect(fouten, fouten.join('\n')).toEqual([]);
          // De stap kwam en wees de rij Herstelcode aan.
          await startMetVraagteken(p, aanraak);
          const titel = stappenVoor('meer/vergrendeling', { android: Boolean(toestel.android), chrome: true, apk: false }).find((s) => s.id === 'herstel').titel;
          for (let i = 0; i < 10 && ((await kaart(p).locator('.uitleg__titel').textContent()) || '').trim() !== titel; i++) {
            await tik(p, kaart(p).getByRole('button', { name: TEKSTEN.uitleg.volgende }), aanraak);
            await uitlegRust(p);
          }
          await expect(kaart(p).locator('.uitleg__titel')).toHaveText(titel);
          const omvat = await p.evaluate(() => {
            const g = document.querySelector('.uitleg__gat').getBoundingClientRect();
            return [...document.querySelectorAll('[data-uitleg="slot-herstel"]')].map((e) => {
              const r = e.getBoundingClientRect();
              return r.left >= g.left - 1 && r.right <= g.right + 1 && r.top >= g.top - 1 && r.bottom <= g.bottom + 1;
            });
          });
          expect(omvat.length).toBeGreaterThanOrEqual(1);
          expect(omvat.every(Boolean), String(omvat)).toBe(true);
          await p.keyboard.press('Escape');
        } finally {
          await eigen.context.close();
        }
      });
    }

    test('de welkomstrook: in de kleur van het scherm, twee knoppen even breed en gecentreerd; Toon het me start de rondleiding', async () => {
      await page.evaluate((demo) => localStorage.setItem(demo ? 'bloei-demo-uitleg' : 'bloei-uitleg', JSON.stringify({ echt: true })), DEMO);
      await openScherm(page, 'gewicht');
      await page.evaluate(referentie);
      const welkom = page.locator('.uitleg--welkom .uitleg__kaart');
      await expect(welkom).toBeVisible({ timeout: 8000 });
      await uitlegRust(page);
      const m = await welkom.evaluate((k) => {
        const r = k.getBoundingClientRect();
        const s = getComputedStyle(k);
        const knoppen = [...k.querySelectorAll('.uitleg__acties > button')].map((b) => {
          const q = b.getBoundingClientRect();
          return { tekst: b.textContent.trim(), l: q.left, r: q.right, w: q.width, h: q.height, bg: getComputedStyle(b).backgroundColor, rand: getComputedStyle(b).borderTopColor };
        });
        return { kaart: { l: r.left, r: r.right, t: r.top, b: r.bottom }, pad: [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)], knoppen, ref: window.__uitlegRef, venster: [innerWidth, innerHeight] };
      });
      const ja = m.knoppen.find((b) => b.tekst === TEKSTEN.uitleg.welkomJa);
      const nee = m.knoppen.find((b) => b.tekst === TEKSTEN.uitleg.welkomNee);
      expect(ja.bg, 'Toon het me is het zachte vlak van het scherm, zoals Liever niet (BESLISSING 544)').toBe(m.ref.zacht.bg);
      expect(nee.bg, 'Liever niet is het zachte vlak van het scherm, niet wit op wit (BESLISSING 528)').toBe(m.ref.zacht.bg);
      expect(Math.abs(ja.h - nee.h), 'even hoog').toBeLessThanOrEqual(1);
      expect(Math.abs(ja.w - nee.w), 'even breed').toBeLessThanOrEqual(1);
      expect(Math.abs(nee.l - m.kaart.l - m.pad[0] - (m.kaart.r - m.pad[1] - ja.r)), 'gecentreerd').toBeLessThanOrEqual(1);
      for (const b of m.knoppen) expect(b.h, 'tikvlak').toBeGreaterThanOrEqual(44);
      expect(m.kaart.l >= 0 && m.kaart.r <= m.venster[0] && m.kaart.b <= m.venster[1], 'in beeld').toBe(true);
      await tik(page, page.locator('.uitleg--welkom').getByRole('button', { name: TEKSTEN.uitleg.welkomJa }), aanraak);
      await expect(kaart(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(kaart(page)).toHaveCount(0);
      await page.evaluate((demo) => localStorage.removeItem(demo ? 'bloei-demo-uitleg' : 'bloei-uitleg'), DEMO);
    });

    if (toestel.themas && !DEMO) {
      for (const thema of ['salie', 'nacht']) {
        test(`in ${thema}: stap 1 van elk scherm in de kleuren van dat scherm, met een neutrale sluier`, async () => {
          await page.evaluate(
            (keuze) =>
              new Promise((ok) => {
                const q = indexedDB.open('bloei-dagboek');
                q.onsuccess = () => {
                  const tx = q.result.transaction('instellingen', 'readwrite');
                  tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: keuze });
                  tx.oncomplete = () => {
                    q.result.close();
                    ok();
                  };
                };
              }),
            thema,
          );
          await page.reload();
          await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme || 'poeder')).toBe(thema);
          const fouten = [];
          try {
            for (const route of ROUTES) {
              await openScherm(page, route);
              await page.evaluate(referentie);
              await startMetVraagteken(page, aanraak);
              await uitlegRust(page);
              const titel = ((await kaart(page).locator('.uitleg__titel').textContent()) || '').trim();
              await gekozenStap(page, await stapUitKaart(page, sleutelVan(route), titel), fouten, `${thema} ${route}`);
              const m = await page.evaluate(meetStap, { doel: null, ook: null });
              for (const f of toetsStap(m, null).fouten) fouten.push(`${thema} ${route}: ${f}`);
              const n = await page.evaluate(meetStreng);
              for (const f of n.fouten ?? []) if (aanraak || !/^half uitstekend/.test(f)) fouten.push(`${thema} ${route}: ${f}`);
              await page.keyboard.press('Escape');
              await expect(kaart(page)).toHaveCount(0);
            }
          } finally {
            await page.evaluate(
              () =>
                new Promise((ok) => {
                  const q = indexedDB.open('bloei-dagboek');
                  q.onsuccess = () => {
                    const tx = q.result.transaction('instellingen', 'readwrite');
                    tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: 'poeder' });
                    tx.oncomplete = () => {
                      q.result.close();
                      ok();
                    };
                  };
                }),
            );
            await page.reload();
          }
          expect(fouten, fouten.join('\n')).toEqual([]);
        });
      }
    }
  });
}

// ============================================================ echte zichtbare maten (BESLISSINGEN 548, 570, 590 en 591)
// De hoogte die een telefoon zichtbaar heeft, zonder de balken van de browser: een uitgedunde reeks uit de volledige meting (breedtes 320 tot 470,
// hoogtes 440 tot 900), met aanraking en met een muis in een smal venster (zoals de eigenaar test). Per stap de strenge meting en geen herhaling.
// Geldt voor het hoofdscherm; een scherm komt erbij zodra het hersteld is.
const ECHTE_MATEN = [
  { naam: '320x480', opt: { viewport: { width: 320, height: 480 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: '360x560', opt: { viewport: { width: 360, height: 560 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: '375x550', opt: { viewport: { width: 375, height: 550 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: '390x660', opt: { viewport: { width: 390, height: 660 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: '412x700', opt: { viewport: { width: 412, height: 700 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: '430x740', opt: { viewport: { width: 430, height: 740 }, deviceScaleFactor: 3, ...aanraking } },
  { naam: '445x520', opt: { viewport: { width: 445, height: 520 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: '445x580', opt: { viewport: { width: 445, height: 580 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: '470x540', opt: { viewport: { width: 470, height: 540 }, deviceScaleFactor: 2, ...aanraking } },
  { naam: '455x600 muis', opt: { viewport: { width: 455, height: 600 }, ...computer } },
  { naam: '470x760 muis', opt: { viewport: { width: 470, height: 760 }, ...computer } },
  // BESLISSING 592: de maten van de foto's van de eigenaar (een smal venster met een muis)
  { naam: '445x520 muis', opt: { viewport: { width: 445, height: 520 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false } },
  { naam: '450x560 muis', opt: { viewport: { width: 450, height: 560 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false } },
  { naam: '478x590 muis', opt: { viewport: { width: 478, height: 590 }, deviceScaleFactor: 2, hasTouch: false, isMobile: false } },
];
const HERSTELD = ['vandaag'];
const HERSTELD_HANDELINGEN = ['h:maaltijd'];
if (!DEMO) {
  for (const maat of ECHTE_MATEN) {
    test.describe(`uitleg op de zichtbare maat ${maat.naam}`, () => {
      let context;
      let page;
      test.beforeAll(async ({ browser }) => {
        ({ context, page } = await nieuwePagina(browser, maat.opt));
      });
      test.afterAll(async () => {
        await context?.close();
      });
      for (const route of HERSTELD) {
        test(`${route}: elke stap een afgerond vak, vak en kaart in beeld, niets half, gelijke marge, afgerond, geen herhaling`, async () => {
          await openScherm(page, route);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.evaluate(referentie);
          const aanraak = Boolean(maat.opt.hasTouch);
          await startMetVraagteken(page, aanraak);
          const fouten = await loopAf(page, { sleutel: sleutelVan(route), aanraak, naam: `${route} ${maat.naam}` });
          expect(fouten, fouten.join('\n')).toEqual([]);
        });
      }
      for (const sleutel of HERSTELD_HANDELINGEN) {
        test(`${sleutel}: elke stap de vaste maten (BESLISSING 592), geen herhaling`, async () => {
          await openScherm(page, 'meer/uitleg');
          const aanraak = Boolean(maat.opt.hasTouch);
          const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[sleutel.slice(2)]}` });
          await knop.scrollIntoViewIfNeeded();
          await tik(page, knop, aanraak);
          await expect(kaart(page)).toBeVisible({ timeout: 10000 });
          await page.evaluate(referentie);
          const fouten = await loopAf(page, { sleutel, aanraak, naam: `${sleutel} ${maat.naam}` });
          expect(fouten, fouten.join('\n')).toEqual([]);
        });
      }
    });
  }
}

// ============================================================ de schermen van de uitleg tekenen (na een fout in scherm.js die niemand zag)
// Het scherm Uitleg tekent zijn rijen (één knop Toon het me per onderwerp), het hoofdscherm en een instelscherm hebben hun knop Uitleg, en de console
// blijft zonder fout. Een ontbrekende import in src/uitleg/** liet het scherm Uitleg leeg zonder dat npm test het zag.
test.describe('de uitleg tekent zonder fout', () => {
  for (const route of ['meer/uitleg', 'vandaag', 'meer/instellingen']) {
    test(`${route} tekent, en de console blijft zonder fout`, async ({ page }) => {
      const fouten = [];
      page.on('pageerror', (e) => fouten.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') fouten.push(m.text());
      });
      await vasteKlok(page);
      await openScherm(page, route);
      if (route === 'meer/uitleg') await expect(page.getByRole('button', { name: new RegExp('^' + TEKSTEN.uitleg.toonHet + ': ') })).toHaveCount(ONDERWERPEN.length);
      else await expect(page.getByRole('button', { name: TEKSTEN.uitleg.knop }).first()).toBeVisible();
      expect(fouten, fouten.join(' | ')).toEqual([]);
    });
  }
});
