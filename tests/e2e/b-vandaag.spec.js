// Vandaag (stap H5, acceptatie van stap 10 uit PLAN.md §10 en browsertestscript E1).
import { test, expect } from '@playwright/test';
import { wachtTotWaar, wachtOpRust, wachtTotStil, BEWAAR_MAALTIJD, BEWAAR_MAALTIJD_TEKST, BEWAAR_MAALTIJD_SEL, maaltijdblad } from './r-wacht.js'; // wachtTotWaar: page.waitForFunction wacht niet op een Promise
import { vasteKlok } from './vaste-klok.js';


const maaltijd = (page, soort) => page.locator(`.maaltijd[data-soort="${soort}"]`);

test('E1: de begroeting volgt het moment van de dag', async ({ page }) => {
  for (const [uur, tekst] of [
    [9, 'Goeiemorgen, Testnaam'],
    [14, 'Goeiemiddag, Testnaam'],
    [20, 'Goeienavond, Testnaam'],
  ]) {
    await page.clock.setFixedTime(new Date(2026, 10, 13, uur, 0, 0));
    await page.goto('./#/vandaag');
    await page.reload();
    await expect(page.locator('.vandaag h1')).toHaveText(tekst);
  }
});

test('Zonder naam: een begroeting zonder aanspreking, een neutraal icoon in de cirkel en "Je verslag"', async ({ page }) => {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag h1')).toHaveText(/, Testnaam$/); // de teststand heeft een verzonnen naam
  await page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const tx = open.result.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').delete('profiel.naam'); // zonder rij geldt de standaardwaarde: geen naam
          tx.oncomplete = () => { open.result.close(); klaar(); };
        };
      }),
  );
  await page.reload();
  await expect(page.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond)$/); // geen komma, geen naam
  await page.goto('./#/meer');
  await expect(page.locator('.meer__profiel .profielfoto__icoon svg.icoon')).toBeVisible();
  await expect(page.locator('.meer__profiel .profielfoto__letter')).toHaveCount(0);
  await expect(page.locator('.meer__profieltekst .t-h2')).toHaveCount(0);
  await page.goto('./#/meer/profiel');
  await expect(page.locator('.profielvoorbeeld__groet')).toHaveText(/^Goeie(morgen|middag|navond)$/);
  await expect(page.locator('.profielvoorbeeld__foto .profielfoto__icoon')).toBeVisible();
  await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
  await expect(page.locator('.profielvoorbeeld__groet')).toHaveText(/^Goeie(morgen|middag|navond), Testnaam$/);
  await expect(page.locator('.profielvoorbeeld__foto .profielfoto__letter')).toHaveText('T');
  await page.getByRole('textbox', { name: 'Je naam' }).fill('');
  await expect(page.locator('.profielvoorbeeld__groet')).toHaveText(/^Goeie(morgen|middag|navond)$/);
});

test('E1: kan erbij, een maaltijd invullen, en alles blijft na herladen', async ({ page }) => {
  const fouten = [];
  page.on('console', (b) => b.type() === 'error' && fouten.push(b.text()));
  await page.goto('./#/vandaag');
  await expect(page.locator('.maaltijd')).toHaveCount(6);
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('0');

  // Het logo staat bovenaan en het scherm is er ook zonder invoer
  await expect(page.locator('.vandaag .logo')).toBeVisible();
  // Zonder invoer toont de voortgang een rustige zin en geen enkel onderdeel is gevuld
  await expect(page.locator('.voortgang__zin')).toBeVisible();
  await expect(page.locator('.voortgang__deel.is-vol')).toHaveCount(0);
  const beginZin = await page.locator('.voortgang__zin').textContent();

  // Kan erbij (800 ml): dezelfde stand als op Drinken; na vier kannen is het dagdoel van 2,5 l gehaald
  await page.locator('.drankknop[data-soort="water"]').click();
  await page.locator('.drankknop[data-soort="water"]').click();
  await page.locator('.drankknop[data-soort="water"]').click();
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('3,2');
  await expect(page.locator('.voortgang__deel[data-deel="glass-water"]')).toHaveClass(/is-vol/);
  await expect(page.locator('.voortgang__zin')).not.toHaveText(beginZin);

  // De eerstvolgende open maaltijd is aangeduid; invullen verplaatst de aanduiding
  const volgende = page.locator('.maaltijd.is-uitgelicht');
  await expect(volgende).toHaveCount(1);
  const eerste = await volgende.getAttribute('data-soort');
  await volgende.locator('> .rij').click();
  await maaltijdblad(page, eerste).locator('textarea').fill('yoghurt met noten');
  await maaltijdblad(page, eerste).getByRole('button', BEWAAR_MAALTIJD).click();
  await expect(maaltijdblad(page)).toHaveCount(0);
  await expect(maaltijd(page, eerste).locator('> .rij')).toContainText('yoghurt met noten');
  await expect(page.locator('.maaltijd.is-uitgelicht')).not.toHaveAttribute('data-soort', eerste);

  await page.reload();
  await expect(page.locator('.drinkkaart .cijfer-groot')).toContainText('3,2');
  await expect(maaltijd(page, eerste).locator('> .rij')).toContainText('yoghurt met noten');

  // Ook zichtbaar op de dag in het dagboek
  await page.goto('./#/dagboek');
  await expect(page.getByRole('region', { name: 'Drinken' })).toContainText('3,2 l van 2,5 l');

  expect(fouten).toEqual([]);
});

test('Vandaag: de link in de drinkkaart leidt naar Drinken', async ({ page }) => {
  await page.goto('./#/vandaag');
  await page.locator('.drinkkaart a.drinkkaart__label').click();
  await expect(page).toHaveURL(/#\/drinken$/);
});

// Er zijn op Vandaag geen uitklapkaarten meer: alles is een gewone, altijd open kaart.

async function voegSupplementToe(page, naam) {
  await page.goto('./#/supplementen');
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill(naam);
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}

const momentRij = (page, moment) => page.locator('.vandaag .momentrij[data-moment="' + moment + '"]');

test('Telefoon: alle kaarten zijn gewone, open kaarten', async ({ page }) => {
  await voegSupplementToe(page, 'Vitamine D');
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag .uitklap__kop')).toHaveCount(0);
  await expect(page.locator('.vandaag .maaltijd')).toHaveCount(6);
  // Supplementen: alleen een rij per moment, zonder namen van supplementen
  await expect(page.locator('.vc--supp .momentrij')).toHaveCount(1);
  await expect(page.locator('.vc--supp')).not.toContainText('Vitamine D');
  const hoogte = await momentRij(page, 'ochtend').evaluate((e) => e.getBoundingClientRect().height);
  expect(hoogte).toBeGreaterThanOrEqual(56);
});

test('Telefoon: een tik op het moment vinkt het af, blijft na herladen, en de stand telt momenten', async ({ page }) => {
  await voegSupplementToe(page, 'Vitamine D');
  await page.goto('./#/vandaag');
  await expect(page.locator('.vc--supp')).toContainText('0 van 1');
  await momentRij(page, 'ochtend').click();
  await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.vc--supp')).toContainText('1 van 1');
  await expect(page.locator('.voortgang__deel[data-deel="capsules"]')).toContainText('1 van 1');
  await page.getByRole('button', { name: 'Ongedaan maken' }).click();
  await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'false');
  await momentRij(page, 'ochtend').click();
  await wachtTotWaar(page, () => new Promise((klaar) => { const o = indexedDB.open('bloei-dagboek'); o.onsuccess = () => { const q = o.result.transaction('momentinnames').objectStore('momentinnames').getAll(); q.onsuccess = () => { o.result.close(); klaar(q.result.some((r) => r.moment === 'ochtend')); }; }; o.onerror = () => klaar(false); })); // het vinkje staat echt in de database
  await page.reload();
  await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'true');
  await page.goto('./#/supplementen');
  await expect(page.getByRole('checkbox')).toHaveCount(0); // op het tabblad vink je niets af
  await expect(page.locator('.momentkaart[data-moment="ochtend"] .momentkop__stand')).toContainText(/Genomen om \d{1,2}\.\d{2} uur/);
});

test('Telefoon: een tik op Vandaag vinkt het moment af; het tabblad Supplementen toont "Genomen om" in de kop van dat moment en niets afvinkbaars', async ({ page }) => {
  await voegSupplementToe(page, 'Vitamine D');
  await voegSupplementToe(page, 'Magnesium');
  await page.goto('./#/vandaag');
  await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'false');
  await expect(momentRij(page, 'ochtend')).toContainText('van 7 tot 12 uur');
  await momentRij(page, 'ochtend').click();
  await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'true');
  await wachtTotWaar(page, () => new Promise((klaar) => { const o = indexedDB.open('bloei-dagboek'); o.onsuccess = () => { const q = o.result.transaction('momentinnames').objectStore('momentinnames').getAll(); q.onsuccess = () => { o.result.close(); klaar(q.result.some((r) => r.moment === 'ochtend')); }; }; o.onerror = () => klaar(false); })); // het vinkje staat echt in de database
  await page.goto('./#/supplementen');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('.momentkaart[data-moment="ochtend"] .momentkop__stand')).toContainText('Genomen om');
});

for (const [naam, breedte, hoogte] of [['laptop', 1280, 800], ['groot scherm', 1720, 950]]) {
  test.describe(`Desktop ${naam} (${breedte}x${hoogte})`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: false, hasTouch: false });

    test('geen uitklapknoppen: alles staat open en is zichtbaar', async ({ page }) => {
      await voegSupplementToe(page, 'Vitamine D');
      await page.goto('./#/vandaag');
      await expect(page.locator('.vandaag .uitklap__kop:not(:disabled)')).toHaveCount(0);
      await expect(page.locator('.vandaag .uitklap__chevron')).toBeHidden();
      await expect(page.locator('.drinkkaart')).toBeVisible();
      await expect(page.locator('.vandaag .maaltijd')).toHaveCount(6);
      await expect(page.locator('.vandaag .maaltijd').first()).toBeVisible();
      await expect(momentRij(page, 'ochtend')).toBeVisible();
      // Het belangrijkste staat zonder scrollen in beeld (de weergave is 800 of 950 hoog)
      const onderkant = await page.locator('.voortgang').evaluate((e) => e.getBoundingClientRect().bottom + window.scrollY);
      expect(onderkant).toBeLessThan(hoogte);
      await momentRij(page, 'ochtend').click();
      await expect(momentRij(page, 'ochtend')).toHaveAttribute('aria-checked', 'true');
    });
  });
}

// BESLISSING 217: in de kaart Drinken zijn links (Vandaag) en rechts (Dranken) echt gelijk
const meetDrinkkaart = (page) =>
  page.evaluate(() => {
    const r = (s, e = document) => e.querySelector(s).getBoundingClientRect();
    const kaart = r('.drinkkaart');
    const pad = parseFloat(getComputedStyle(document.querySelector('.drinkkaart')).paddingLeft);
    const tegels = [...document.querySelectorAll('.drinkkaart .drankknop')].map((e) => e.getBoundingClientRect());
    return {
      kaart, pad,
      links: r('.drinkkaart__links'), andere: r('.drinkkaart__andere'),
      kopL: r('.drinkkaart__links > .label'), kopR: r('.drinkkaart__andere > .label'),
      glas: r('.drinkkaart .watervulling'), raster: r('.drinkkaart .drankrij'), stand: r('.drinkkaart__stand'),
      supp: (document.querySelector('.vc--supp') ?? document.body).getBoundingClientRect(),
      tegels,
      scrollbreed: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

for (const [breedte, hoogte] of [[1720, 950], [1440, 900], [1280, 800]]) {
  test.describe(`Drinken ${breedte}`, () => { test.use({ viewport: { width: breedte, height: hoogte }, isMobile: false, hasTouch: false });
  test(`Drinken op Vandaag ${breedte}: links en rechts zijn even breed, op één lijn en op dezelfde onderkant`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await voegSupplementToe(page, 'Vitamine D');
    await page.goto('./#/vandaag');
    await expect(page.locator('.drinkkaart .drankknop')).toHaveCount(6);
    await wachtOpRust(page);
    const m = await meetDrinkkaart(page);
    const midden = m.kaart.left + m.kaart.width / 2;
    const binnenL = m.kaart.left + m.pad;
    const binnenR = m.kaart.right - m.pad;
    expect(Math.abs(m.links.width - m.andere.width)).toBeLessThanOrEqual(1); // twee even brede helften
    expect(Math.abs(m.andere.left - midden)).toBeLessThanOrEqual(1); // de lijn staat in het midden
    // gelijke lucht links en rechts van de lijn: de inhoud links eindigt even ver van de lijn als die rechts begint
    expect(Math.abs(m.kopL.top - m.kopR.top)).toBeLessThanOrEqual(1); // de twee kopjes op dezelfde y
    expect(Math.abs(m.glas.left - binnenL)).toBeLessThanOrEqual(1); // buitenranden op de binnenranden van de kaart
    expect(Math.abs(Math.max(...m.tegels.map((t) => t.right)) - binnenR)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.min(...m.tegels.map((t) => t.left)) - m.raster.left)).toBeLessThanOrEqual(1);
    if (breedte >= 1440) {
      const luchtLinks = m.andere.left - m.stand.right;
      const luchtRechts = m.raster.left - m.andere.left;
      expect(Math.abs(luchtLinks - luchtRechts)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.glas.top - m.raster.top)).toBeLessThanOrEqual(1); // en de inhoud eronder begint even hoog
      expect(Math.abs(m.stand.bottom - m.raster.bottom)).toBeLessThanOrEqual(1); // dezelfde onderkant
      expect(Math.abs(m.glas.bottom - m.raster.bottom)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.stand.right - (m.andere.left - m.pad))).toBeLessThanOrEqual(1);
    } else {
      // BESLISSING 308 (960 tot 1439 px): glas en cijfers vormen één blok (de stand staat met display: contents in het raster van de kern),
      // de dranktegels beginnen direct onder het kopje en lopen tot de onderkant van de kolom.
      expect(m.tegels[0].top - m.kopR.bottom, 'eerste rij tegels direct onder het kopje').toBeLessThanOrEqual(24);
      expect(Math.abs(Math.max(...m.tegels.map((t) => t.bottom)) - m.links.bottom), 'tegels eindigen op de onderkant van de kolom').toBeLessThanOrEqual(1);
    }
    expect(Math.abs(m.kaart.height - m.supp.height)).toBeLessThanOrEqual(1); // de rij blijft even hoog
    expect(m.scrollbreed).toBeLessThanOrEqual(0);
  });
  });
}

for (const [breedte, hoogte] of [[390, 844], [360, 760]]) {
  test(`Drinken op Vandaag ${breedte}: de twee helften staan onder elkaar met dezelfde rand, breedte en kopje`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/vandaag');
    await expect(page.locator('.drinkkaart .drankknop')).toHaveCount(6);
    const m = await meetDrinkkaart(page);
    expect(Math.abs(m.links.left - m.andere.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.links.width - m.andere.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.kopL.left - m.kopR.left)).toBeLessThanOrEqual(1);
    expect(m.kopR.top).toBeGreaterThan(m.links.bottom - 1);
    expect(m.scrollbreed).toBeLessThanOrEqual(0);
  });
}

test('Delen: op Vandaag staat een knop Delen bij de begroeting die naar #/delen leidt', async ({ page }) => {
  await page.goto('./#/vandaag');
  const knop = page.locator('.vandaag__begroeting a.begroeting__delen'); // de uitlegknop van de rondleiding deelt de klasse
  await expect(knop).toBeVisible();
  await expect(knop).toHaveAccessibleName('Delen');
  await knop.click();
  await expect(page).toHaveURL(new RegExp("#/delen$"));
});

test('Telefoon: de groet breekt nooit midden in een woord', async ({ page }) => {
  await page.goto('./#/vandaag');
  const titel = page.locator('.begroeting__groet');
  await expect(titel).toBeVisible();
  const regels = await titel.evaluate((e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getClientRects().length; });
  expect(regels).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test.describe('Badges in de motivator op een desktop', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 800 } });
test('Badges in de motivator: alleen medailles zonder tekst ernaast, hover en focus tonen het kaartje, de hoogte blijft gelijk, een klik gaat naar het badgescherm', async ({ page }) => {
  await page.goto('./#/vandaag');
  const blok = page.locator('.badgeblok');
  await expect(blok).toBeVisible();
  await expect(blok).toHaveAttribute('data-uitleg', 'badges');
  await expect(blok.locator('.badgeblok__laatst')).toHaveCount(0);
  const volgende = blok.locator('.badgeblok__volgende').first();
  await expect(blok.locator('.badgeblok__volgende').first()).toBeVisible();
  // geen tekst of getal naast de medaille: het kaartje is verborgen tot hover of focus
  const tip = volgende.locator('.medaille-tip');
  await expect(tip).toHaveCSS('opacity', '0');
  await expect(blok.locator('.badgeblok__tekst')).toHaveCount(0);
  await expect(blok).not.toContainText(/te gaan|%/);
  // hover toont naam, uitleg en stand; weggaan verbergt het weer
  await volgende.hover();
  await expect(tip).toHaveCSS('opacity', '1');
  await expect(tip).toContainText('Eerste dag');
  await expect(tip).toContainText('Houd één dag iets bij.');
  await expect(tip).toContainText('0 van 1 dag');
  await expect(tip).toHaveAttribute('role', 'tooltip');
  await expect(volgende).toHaveAttribute('aria-describedby', await tip.getAttribute('id'));
  await page.mouse.move(5, 5);
  await expect(tip).toHaveCSS('opacity', '0');
  // focus met het toetsenbord toont het ook
  await volgende.focus();
  await expect(tip).toHaveCSS('opacity', '1');
  await volgende.evaluate((e) => e.blur());
  // na een glas staat ook de laatste er, en de hoogte van de motivator blijft gelijk
  const voor = await page.locator('.voortgang').evaluate((e) => e.getBoundingClientRect().height);
  await page.locator('.drankknop[data-soort="water"]').click();
  await expect(blok.locator('.badgeblok__laatst')).toHaveCount(1, { timeout: 8000 });
  await expect(blok.locator('.badgeblok__laatst')).toHaveAttribute('aria-label', /Eerste dag/);
  const na = await page.locator('.voortgang').evaluate((e) => e.getBoundingClientRect().height);
  expect(Math.abs(voor - na)).toBeLessThan(1);
  await blok.locator('.badgeblok__laatst').click();
  await expect(page).toHaveURL(new RegExp('#/meer/badges$'));
});
});

test.describe('Badges in de motivator op een telefoon', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('een tik toont het kaartje, nog een tik sluit het, en "Alle badges" gaat naar het badgescherm', async ({ page }) => {
    await page.goto('./#/vandaag');
    const volgende = page.locator('.badgeblok__volgende').first();
    const tip = volgende.locator('.medaille-tip');
    await expect(tip).toHaveCSS('opacity', '0');
    await volgende.tap();
    await expect(tip).toHaveCSS('opacity', '1');
    await expect(page).toHaveURL(new RegExp('#/vandaag$'));
    await volgende.tap();
    await expect(tip).toHaveCSS('opacity', '0');
    await volgende.tap();
    await tip.getByRole('link', { name: 'Alle badges' }).tap();
    await expect(page).toHaveURL(new RegExp('#/meer/badges$'));
  });
});

// BESLISSING 215: de onderste rij van de motivator: drie groepen, kopjes op één regel en links op één lijn met het eerste onderdeel, overal dezelfde
// tussenruimte tussen onderdelen, de overgebleven ruimte gelijk verdeeld over twee tussenruimtes met in het midden dezelfde lijn.
const RASTER_MATEN = [
  { b: 1720, h: 950, aanraking: false },
  { b: 1690, h: 950, aanraking: false },
  { b: 1440, h: 900, aanraking: false },
  { b: 1280, h: 800, aanraking: false },
  { b: 1024, h: 800, aanraking: false },
  { b: 390, h: 844, aanraking: true },
  { b: 360, h: 760, aanraking: true },
];
// Zet 0, 1 of 2 behaalde badges in de opslag (een rechtstreekse schrijfactie; de app leest ze bij het laden).
async function zetBadges(page, aantal) {
  await page.goto('./#/vandaag');
  await page.evaluate(
    (n) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const d = open.result;
          const tx = d.transaction('badges', 'readwrite');
          const st = tx.objectStore('badges');
          st.clear();
          ['drie-op-rij', 'week-op-rij'].slice(0, n).forEach((id, i) => st.put({ id, behaaldOp: Date.now() - i * 1000, gezien: true }));
          tx.oncomplete = () => { d.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
    aantal,
  );
  await page.reload();
}
for (const m of RASTER_MATEN) {
  test.describe(`Motivator-onderrij ${m.b}`, () => {
    if (!m.aanraking) test.use({ hasTouch: false, isMobile: false });
    for (const behaald of [0, 1, 2]) {
      test(`Motivator op ${m.b} px met ${behaald} behaalde badge(s): kopjes op één regel en links uitgelijnd, gelijke tussenruimtes, lijnen in het midden`, async ({ page }) => {
        await page.setViewportSize({ width: m.b, height: m.h });
        await zetBadges(page, behaald);
        await expect(page.locator('.voortgang .week__bol')).toHaveCount(7);
        await expect(page.locator('.badgeblok__laatst')).toHaveCount(behaald);
        // bewust vier: 1 + 4 past niet naast Deze week, beslissing 206 bijgestuurd
        await expect(page.locator('.voortgang .badgeblok .medaille')).toHaveCount(behaald === 1 ? 4 : 5);
        const r = await page.evaluate(() => {
          const k = document.querySelector('.voortgang');
          const kr = k.getBoundingClientRect();
          const cs = getComputedStyle(k);
          const bx = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height }; };
          const zicht = (e) => e.getBoundingClientRect().width > 0;
          const groep = (sel, itemSel) => {
            const g = k.querySelector(sel);
            if (!g) return null;
            const label = g.querySelector(':scope > .label');
            return { label: bx(label), labelRegels: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight)), items: [...g.querySelectorAll(itemSel)].map(bx) };
          };
          return {
            kaart: bx(k), binnenL: kr.left + parseFloat(cs.paddingLeft), binnenR: kr.right - parseFloat(cs.paddingRight),
            vakken: [...k.querySelectorAll('.motiv__vak')].map(bx), zin: bx(k.querySelector('.voortgang__zin')), lijn: bx(k.querySelector('.motiv__lijn')), onder: bx(k.querySelector('.motiv__onder')),
            a: groep('.badgeblok__groep--behaald', '.medaille'), b: groep('.badgeblok__groep--open', '.medaille'), c: groep('.motiv__weekvak', '.week__bol'),
            letters: [...k.querySelectorAll('.week__letter')].map(bx), lijnen: [...k.querySelectorAll('.badgeblok__scheiding, .motiv__scheiding')].filter(zicht).map(bx),
            scroll: document.documentElement.scrollWidth - innerWidth,
          };
        });
        expect(r.scroll).toBeLessThanOrEqual(0);
        // verticaal ritme: vakken, zin, lijn en onderste rij; boven en onder de binnenruimte
        expect(Math.abs((r.zin.t - r.vakken[0].b) - (r.lijn.t - r.zin.b))).toBeLessThanOrEqual(1);
        expect(Math.abs((r.lijn.t - r.zin.b) - (r.onder.t - r.lijn.b))).toBeLessThanOrEqual(1);
        expect(Math.abs(r.vakken[0].t - r.kaart.t - (r.kaart.b - Math.max(...r.letters.map((x) => x.b))))).toBeLessThanOrEqual(1);
        const stapV = r.vakken.slice(1).map((x, i) => x.cx - r.vakken[i].cx);
        for (const s of stapV) expect(Math.abs(s - stapV[0])).toBeLessThanOrEqual(1);
        const groepen = [r.a, r.b, r.c].filter(Boolean);
        for (const g of groepen) {
          expect(g.labelRegels).toBe(1); // (a) een kopje beslaat één regel
          expect(Math.abs(g.label.l - g.items[0].l)).toBeLessThanOrEqual(1); // (b) linkerrand kopje = linkerrand eerste onderdeel
        }
        // (c) dezelfde rand-tot-rand-afstand tussen onderdelen, in alle groepen
        // Smaller dan 600 px (Deze week op een eigen rij) vullen de rijen de breedte van binnenrand tot binnenrand: dan is de tussenruimte gelijk binnen een rij.
        const gestapeld = groepen.some((g) => Math.abs(g.label.b - groepen[0].label.b) >= 5);
        const gatenVan = (lijst) => lijst.flatMap((g) => g.items.slice(1).map((x, i) => x.l - g.items[i].r));
        for (const lijst of gestapeld ? groepen.map((g) => [g]) : [groepen]) {
          const gaten = gatenVan(lijst);
          for (const x of gaten) expect(Math.abs(x - gaten[0])).toBeLessThanOrEqual(1);
        }
        // groepen die naast elkaar staan: één basislijn voor de kopjes
        const naast = groepen.filter((g) => Math.abs(g.label.b - groepen[0].label.b) < 5);
        for (const g of naast) expect(Math.abs(g.label.b - naast[0].label.b)).toBeLessThanOrEqual(1);
        // (d) de tussenruimtes tussen de groepen: even breed, de lijn in het midden, minstens 16 px lucht (op een smalle kaart 8)
        const einde = (g) => Math.max(g.label.r, ...g.items.map((x) => x.r));
        const lucht = [];
        for (let i = 0; i < naast.length - 1; i++) {
          const links = einde(naast[i]);
          const rechts = naast[i + 1].label.l;
          const lijn = r.lijnen.find((l) => l.cx > links && l.cx < rechts);
          expect(lijn).toBeTruthy();
          expect(Math.abs(lijn.cx - links - (rechts - lijn.cx))).toBeLessThanOrEqual(1);
          lucht.push(rechts - links);
          expect(lijn.cx - links).toBeGreaterThanOrEqual(m.b >= 600 ? 16 : 8);
        }
        for (const x of lucht) expect(Math.abs(x - lucht[0])).toBeLessThanOrEqual(1);
        for (const l of r.lijnen) {
          expect(Math.abs(l.t - r.lijnen[0].t)).toBeLessThanOrEqual(1);
          expect(Math.abs(l.b - r.lijnen[0].b)).toBeLessThanOrEqual(1);
        }
        // (e) de eerste groep op de linker binnenrand; breed: de laatste weekstip op de rechter binnenrand
        expect(Math.abs(groepen[0].label.l - r.binnenL)).toBeLessThanOrEqual(1);
        const breed = naast.length === groepen.length;
        // gestapeld: de weekrij (en de medailles als er geen groep Laatst behaald is) eindigt op de rechter binnenrand
        if (!breed) expect(Math.abs(r.binnenR - r.c.items[6].r)).toBeLessThanOrEqual(1);
        if (!breed && !r.a) expect(Math.abs(r.binnenR - r.b.items.at(-1).r)).toBeLessThanOrEqual(1);
        if (breed) expect(Math.abs(r.binnenR - r.c.items[6].r)).toBeLessThanOrEqual(1);
        // (f) middens van de medailles en de weekstippen op één lijn (breed), de letters op één lijn
        const rij = breed ? [...(r.a?.items ?? []), ...(r.b?.items ?? []), ...r.c.items] : [...(r.a?.items ?? []), ...(r.b?.items ?? [])];
        for (const x of rij) expect(Math.abs(x.cy - rij[0].cy)).toBeLessThanOrEqual(1);
        for (const x of r.c.items) expect(Math.abs(x.cy - r.c.items[0].cy)).toBeLessThanOrEqual(1);
        for (const x of r.letters) expect(Math.abs(x.t - r.letters[0].t)).toBeLessThanOrEqual(1);
      });
    }
  });
}

// BESLISSING 222: Uitleg en Delen in de kop van Vandaag zijn identieke, gevulde knoppen; bij hover licht alleen het icoon op.
test.describe('Kop van Vandaag op een desktop', () => {
test.use({ viewport: { width: 1690, height: 900 }, hasTouch: false, isMobile: false });
test('Kop van Vandaag: Uitleg en Delen zijn gevulde knoppen in de tabbladkleur en bij hover licht alleen het icoon op', async ({ page }) => {
  await page.goto('./#/vandaag');
  const knoppen = page.locator('.vandaag__begroeting .begroeting__delen');
  await expect(knoppen).toHaveCount(2);
  const stijl = (k) => k.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, kleur: s.color, h: s.height, fs: s.fontSize, tf: s.transform, bs: s.boxShadow }; });
  const verwacht = await page.evaluate(() => {
    const p = document.createElement('span');
    p.style.backgroundColor = 'var(--knop-bg)';
    document.querySelector('.vandaag__begroeting').append(p);
    const c = getComputedStyle(p).backgroundColor;
    p.remove();
    return c;
  });
  const rust = [];
  for (const i of [0, 1]) rust.push(await stijl(knoppen.nth(i)));
  expect(rust[0].bg).toBe(verwacht);
  expect(rust[1].bg).toBe(verwacht);
  expect(rust[0].h).toBe(rust[1].h);
  expect(rust[0].fs).toBe(rust[1].fs);
  for (const i of [0, 1]) {
    const k = knoppen.nth(i);
    const icoon = k.locator('.icoon').first();
    const icoonVoor = await icoon.evaluate((el) => getComputedStyle(el).transform);
    await k.hover();
    await wachtOpRust(page);
    const hover = await stijl(k);
    expect(hover.tf).toBe(rust[i].tf);
    expect(hover.bs).toBe(rust[i].bs);
    expect(hover.bg).toBe(rust[i].bg);
    expect(hover.kleur).toBe(rust[i].kleur);
    expect(await icoon.evaluate((el) => getComputedStyle(el).transform)).not.toBe(icoonVoor);
    await page.mouse.move(0, 0);
  }
});
});

// BESLISSING 226: een knop Bewaren in de open maaltijdregel.
const leesMaaltijdRecords = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const db = open.result;
          const vraag = db.transaction('maaltijden').objectStore('maaltijden').getAll();
          vraag.onsuccess = () => {
            db.close();
            klaar(vraag.result);
          };
        };
      }),
  );

test('Maaltijd: Klaar is uit bij een leeg veld; Klaar bewaart, sluit het blad en blijft na herladen', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 13, 9, 0, 0));
  await page.goto('./#/vandaag');
  const regel = maaltijd(page, 'ontbijt');
  await expect(regel.locator('> .rij')).toHaveAttribute('aria-haspopup', 'dialog');
  await regel.locator('> .rij').click();
  const blad = maaltijdblad(page, 'ontbijt');
  await expect(blad).toBeVisible();
  await expect(page.locator('body > .blad.maaltijdblad[data-soort="ontbijt"]')).toHaveAttribute('data-familie', 'dagboek');
  await expect(blad).toHaveAccessibleName('Ontbijt');
  const bewaar = blad.locator('[data-uitleg="maaltijd-bewaren"]');
  await expect(bewaar).toBeDisabled();
  await expect(bewaar).toContainText(BEWAAR_MAALTIJD_TEKST);
  expect(await bewaar.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  // BESLISSING 417: Klaar links, Annuleren in het midden, Verwijderen rechts (alleen als er iets te verwijderen is)
  await expect(blad.locator('.maaltijd__acties .knop:visible')).toHaveText([BEWAAR_MAALTIJD_TEKST, 'Annuleren']);
  await blad.locator('textarea').fill('havermout met appel');
  await expect(bewaar).toBeEnabled();
  await expect(blad.locator('.maaltijd__acties .knop:visible')).toHaveText([BEWAAR_MAALTIJD_TEKST, 'Annuleren', 'Verwijderen']);
  await bewaar.click();
  await expect(blad).toHaveCount(0);
  await expect(regel.locator('> .rij')).toContainText('havermout met appel');
  const records = await leesMaaltijdRecords(page);
  const m = records.find((r) => r.soort === 'ontbijt');
  expect(m.tekst).toBe('havermout met appel');
  expect(m.datum).toBe('2026-11-13');
  await page.reload();
  await expect(maaltijd(page, 'ontbijt').locator('> .rij')).toContainText('havermout met appel');
});

test('Maaltijd: Enter maakt een nieuwe regel, ctrl+Enter bewaart, en de haken van het maaltijdblad staan er', async ({ page }) => {
  await page.goto('./#/vandaag');
  const regel = maaltijd(page, 'middagmaal');
  await regel.locator('> .rij').click();
  const blad = maaltijdblad(page, 'middagmaal');
  await blad.locator('textarea').fill('soep');
  for (const haak of ['maaltijd-bewaren', 'maaltijd-favoriet', 'maaltijd-verwijderen']) await expect(blad.locator(`[data-uitleg="${haak}"]`)).toHaveCount(1);
  // Enter zet een nieuwe regel in het vak en laat het blad openstaan
  await blad.locator('textarea').press('Enter');
  await blad.locator('textarea').pressSequentially('met brood');
  await expect(blad).toHaveCount(1);
  await expect(blad.locator('textarea')).toHaveValue('soep\nmet brood');
  // Bewaren en sluiten met het toetsenbord gaat met ctrl+Enter
  await blad.locator('textarea').press('Control+Enter');
  await expect(blad).toHaveCount(0);
  await expect(regel.locator('> .rij')).toContainText('soep');
  const records = await leesMaaltijdRecords(page);
  expect(records.find((r) => r.soort === 'middagmaal').tekst).toBe('soep\nmet brood');
});

for (const breedte of [390, 360]) {
  test(`Maaltijd: op ${breedte} px staan Klaar, Annuleren en Verwijderen netjes in het blad, zonder afbreken of zijwaartse scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 844 });
    await page.goto('./#/vandaag');
    const regel = maaltijd(page, 'avondmaal');
    await regel.locator('> .rij').click();
    const blad = maaltijdblad(page, 'avondmaal');
    await blad.locator('textarea').fill('pasta met groenten');
    const bewaar = blad.locator('[data-uitleg="maaltijd-bewaren"]');
    const annuleer = blad.locator('.maaltijd__annuleer');
    const wis = blad.locator('[data-uitleg="maaltijd-verwijderen"]');
    await expect(wis).toBeVisible();
    await wachtOpRust(page); // het blad is opgekomen
    const rand = await blad.evaluate((el) => el.getBoundingClientRect().right);
    for (const k of [bewaar, annuleer, wis]) {
      const r = await k.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const t = el.querySelector('.knop__tekst');
        return { h: b.height, tekstH: t.getBoundingClientRect().height, rechts: b.right };
      });
      expect(r.h).toBeLessThanOrEqual(52);
      expect(r.tekstH).toBeLessThan(30); // één regel
      expect(r.rechts).toBeLessThanOrEqual(Math.min(breedte, rand) + 0.5); // binnen het blad en binnen het scherm
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

// BESLISSING 238: de kaart Supplementen op Vandaag heeft geen leeg vlak; de rijen delen de hoogte gelijk
async function drieMomenten(page) {
  await page.goto('./#/supplementen');
  await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
  const blad = page.getByRole('dialog');
  await blad.getByRole('textbox', { name: 'Naam' }).fill('Kruidendruppels');
  for (const m of ['Middag', 'Avond']) await blad.getByRole('button', { name: m, exact: true }).click();
  await blad.getByRole('button', { name: 'Bewaren' }).click();
  await expect(blad).toBeHidden();
}

const meetSuppKaart = (page) =>
  page.evaluate(() => {
    const kaart = document.querySelector('.vc--supp').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector('.vc--supp')).paddingBottom);
    const rijen = [...document.querySelectorAll('.vc--supp .momentkant')].map((e) => e.getBoundingClientRect());
    const drink = document.querySelector('.drinkkaart')?.getBoundingClientRect();
    return {
      kaart, pad, rijen, drink,
      scrollbreed: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

for (const [breedte, hoogte] of [[1720, 950], [1690, 1230], [1440, 900], [1280, 800], [1024, 768]]) {
  test.describe(`Supplementen-kaart ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: false, hasTouch: false });
    test(`Supplementen op Vandaag ${breedte}: geen leeg vlak, gelijke rijhoogtes en even hoog als Drinken`, async ({ page }) => {
      await drieMomenten(page);
      await page.goto('./#/vandaag');
      await expect(page.locator('.vc--supp .momentrij').first()).toBeVisible();
      await wachtOpRust(page);
      const m = await meetSuppKaart(page);
      expect(m.rijen.length).toBeGreaterThan(0);
      const leeg = m.kaart.bottom - m.pad - m.rijen[m.rijen.length - 1].bottom;
      expect(leeg).toBeLessThanOrEqual(40);
      const hs = m.rijen.map((r) => r.height);
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(1);
      if (m.drink && Math.abs(m.drink.top - m.kaart.top) < 2) expect(Math.abs(m.drink.height - m.kaart.height)).toBeLessThanOrEqual(1);
      expect(m.scrollbreed).toBeLessThanOrEqual(0);
      // de rij met inhoud verticaal gecentreerd
      const gecentreerd = await page.evaluate(() => [...document.querySelectorAll('.vc--supp .momentkant')].every((k) => {
        const a = k.getBoundingClientRect(); const b = k.querySelector('.momentrij__tekst').getBoundingClientRect();
        return Math.abs((b.top - a.top) - (a.bottom - b.bottom)) <= 2;
      }));
      expect(gecentreerd, JSON.stringify(m)).toBe(true);
      // de rijen lopen van binnenrand tot binnenrand: de lijnen over de volle breedte, de vinkvakken rechts op de binnenrand en op dezelfde x
      const rand = await page.evaluate(() => {
        const k = document.querySelector('.vc--supp'); const kr = k.getBoundingClientRect(); const cs = getComputedStyle(k);
        const binnenL = kr.left + parseFloat(cs.paddingLeft), binnenR = kr.right - parseFloat(cs.paddingRight);
        return {
          rijen: [...k.querySelectorAll('.momentkant')].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left - binnenL, r: binnenR - r.right }; }),
          vinkvakken: [...k.querySelectorAll('.vinkvak__vak')].map((e) => binnenR - e.getBoundingClientRect().right),
        };
      });
      for (const r of rand.rijen) { expect(Math.abs(r.l), JSON.stringify(rand)).toBeLessThanOrEqual(2); expect(Math.abs(r.r), JSON.stringify(rand)).toBeLessThanOrEqual(2); }
      for (const v of rand.vinkvakken) { expect(Math.abs(v), JSON.stringify(rand)).toBeLessThanOrEqual(2); expect(Math.abs(v - rand.vinkvakken[0]), JSON.stringify(rand)).toBeLessThanOrEqual(1); }
      // afvinken blijft werken
      await page.locator('.vc--supp .momentrij').first().click();
      await expect(page.locator('.vc--supp .momentrij').first()).toHaveAttribute('aria-checked', 'true');
    });
  });
}

for (const [breedte, hoogte] of [[390, 844], [360, 760]]) {
  test(`Supplementen op Vandaag ${breedte}: geen leeg vlak en geen zijwaartse scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await drieMomenten(page);
    await page.goto('./#/vandaag');
    await expect(page.locator('.vc--supp .momentrij').first()).toBeVisible();
    const m = await meetSuppKaart(page);
    expect(m.kaart.bottom - m.pad - m.rijen[m.rijen.length - 1].bottom).toBeLessThanOrEqual(40);
    expect(m.scrollbreed).toBeLessThanOrEqual(0);
  });
}

// (R4-03/R4-04) Hier stond een test die alleen schermafbeeldingen maakte met SHOTDIR, zonder bewering; verwijderd (16 november).

// BESLISSING 245 (verving 239): Eten op Vandaag is op een desktop één kolom van zes compacte rijen (± 65 px) zonder leeg vlak; met 0, 2 en 6 ingevulde maaltijden.
test('Eten op Vandaag 1690x1230: zes compacte rijen in één kolom, geen leeg vlak, met 0, 2 en 6 ingevulde maaltijden', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/vandaag');
  const soorten = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
  const meet = () =>
    page.evaluate(() => {
      const kaart = document.querySelector('.etenkaart').getBoundingClientRect();
      const rijen = [...document.querySelectorAll('.etenkaart .maaltijd')].map((m) => m.getBoundingClientRect());
      return { kaart: kaart.height, hoogsteRij: Math.max(...rijen.map((r) => r.height)), links: new Set(rijen.map((r) => Math.round(r.left))).size, leeg: kaart.bottom - Math.max(...rijen.map((r) => r.bottom)) };
    });
  let n = 0;
  for (const doel of [0, 2, 6]) {
    while (n < doel) {
      const r = maaltijd(page, soorten[n]);
      await r.locator('> .rij').click();
      await maaltijdblad(page, soorten[n]).locator('textarea').fill('havermout met appel');
      await maaltijdblad(page, soorten[n]).locator(BEWAAR_MAALTIJD_SEL).click();
      await expect(maaltijdblad(page)).toHaveCount(0);
      n++;
    }
    await expect(page.locator('.etenkaart .maaltijd')).toHaveCount(6); // het scherm is getekend (zonder dit mat de test soms vóór de eerste tekening)
    await wachtOpRust(page);
    const m = await meet();
    expect(m.hoogsteRij, JSON.stringify(m)).toBeLessThanOrEqual(75);
    expect(m.links, JSON.stringify(m)).toBe(1);
    expect(m.leeg, JSON.stringify(m)).toBeLessThanOrEqual(25);
  }
});

// De rijen liggen op gelijke afstand en zijn even hoog: Middagmaal (laatste van de eerste kolom) was door een padding-reset ± 12 px korter.
// De rij die "Aan de beurt" is heeft een tweede regel en is hoger; welke rij dat is hangt af van het uur (eerstvolgendeOpen in
// src/ui/maaltijdregel.js). Daarom een vaste klok (do 12 november 2026, 12:00: Tussendoortje is aan de beurt) en worden alleen
// de rijen zonder ondertekst met elkaar vergeleken.
for (const breedte of [1135, 1510, 390]) {
  test(`Eten op Vandaag ${breedte} px: de rijen Tussendoortje tot Late snack liggen op gelijke afstand`, async ({ page }) => {
    await vasteKlok(page, { stil: true });
    await page.setViewportSize({ width: breedte, height: 900 });
    await page.goto('./#/vandaag');
    await expect(page.locator('.etenkaart .maaltijd')).toHaveCount(6);
    await expect(page.locator('.etenkaart .maaltijd[data-soort="tussendoortje"] .maaltijd__volgende')).toBeVisible();
    await expect(page.locator('.etenkaart .maaltijd__volgende')).toHaveCount(1);
    // wacht tot de rijen stilstaan (de kaarten komen zacht op)
    let vorige = '';
    const meet = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.etenkaart .maaltijd')].map((m) => {
          const r = m.getBoundingClientRect();
          return { soort: m.dataset.soort, top: r.top, bottom: r.bottom, hoogte: r.height, titel: m.querySelector('.rij__titel').getBoundingClientRect().top, sub: !!m.querySelector('.rij__sub') };
        }),
      );
    await expect.poll(async () => { const nu = JSON.stringify(await meet()); const stil = nu === vorige; vorige = nu; return stil; }).toBe(true);
    const rijen = await meet();
    // Afstand tussen de titels van twee opeenvolgende rijen, vanaf Tussendoortje (Ontbijt is de bovenste rij zonder bovenmarge),
    // alleen tussen rijen met één regel: de titel van een rij met ondertekst staat hoger in haar rij.
    const afstanden = [];
    for (let i = 1; i < rijen.length - 1; i++) if (!rijen[i].sub && !rijen[i + 1].sub) afstanden.push(rijen[i + 1].titel - rijen[i].titel);
    const midden = rijen.slice(1, -1).filter((r) => !r.sub).map((r) => r.hoogte); // de middelste rijen met één regel zijn even hoog
    const info = JSON.stringify({ afstanden, midden, rijen });
    expect(afstanden.length, info).toBe(3); // Middagmaal-Vieruurtje, Vieruurtje-Avondmaal, Avondmaal-Late snack
    expect(midden.length, info).toBe(3); // Middagmaal, Vieruurtje, Avondmaal
    expect(Math.max(...afstanden) - Math.min(...afstanden), info).toBeLessThanOrEqual(1.5);
    expect(Math.max(...midden) - Math.min(...midden), info).toBeLessThanOrEqual(1.5);
  });
}

for (const breedte of [390, 360]) {
  test(`Eten op Vandaag ${breedte} px: één kolom, geen leeg vlak onder de laatste rij, geen zijwaartse scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 844 });
    await page.goto('./#/vandaag');
    await expect(page.locator('.etenkaart .maaltijd')).toHaveCount(6);
    const m = await page.evaluate(() => {
      const kaart = document.querySelector('.etenkaart').getBoundingClientRect();
      const rijen = [...document.querySelectorAll('.etenkaart .maaltijd')].map((e) => e.getBoundingClientRect());
      return { leeg: kaart.bottom - rijen[5].bottom, links: new Set(rijen.map((r) => Math.round(r.left))).size, scroll: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(m.leeg).toBeLessThanOrEqual(40);
    expect(m.links).toBe(1);
    expect(m.scroll).toBe(true);
  });
}

// Alles verzonnen: een periodiek supplement dat om de 14 dagen valt, vanaf 14 november 2026.
const KAL_NU = new Date(2026, 10, 14, 12, 0, 0);

async function zaaiPeriodiek(page) {
  await page.evaluate(
    () =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          tx.objectStore('supplementen').add({ naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-14' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
  );
}

async function openVandaag(page) {
  await page.clock.setFixedTime(KAL_NU);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vc--kalender .kalender__dag').first()).toBeVisible();
  await wachtOpRust(page);
}

// BESLISSING 245 (aanscherping): geen extra witruimte. Eten behoudt zijn natuurlijke hoogte (rijen niet uitgerekt, geen lege band), de kalender vult de breedte en
// de hoogte van de kaart zonder leeg vlak, bij 0, 3 en 6 ingevulde maaltijden en bij maanden van zes, vijf en vier weken.
for (const [breedte, hoogte] of [[1720, 950], [1690, 1230], [1440, 900], [1280, 800]]) {
  test.describe(`Kalender ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: false, hasTouch: false });
    test(`Kalender op Vandaag ${breedte}: naast Eten, even hoog, zelfde lijnen, recht onder Supplementen, geen witruimte (0, 3 en 6 maaltijden; 6, 5 en 4 weken)`, async ({ page }) => {
      await page.clock.setFixedTime(KAL_NU);
      await drieMomenten(page);
      await openVandaag(page);
      const meet = () =>
        page.evaluate(() => {
          const r = (s) => document.querySelector(s).getBoundingClientRect();
          const eten = r('.vc--eten'), kal = r('.vc--kalender'), supp = r('.vc--supp');
          const onder = r('.vc--kalender .kalkaart__onder');
          const legenda = r('.vc--kalender .kalkaart__legenda');
          const raster = r('.vc--kalender .kalender');
          const maaltijden = [...document.querySelectorAll('.vc--eten .maaltijd')].map((x) => x.getBoundingClientRect());
          const dagen = [...document.querySelectorAll('.vc--kalender .kalender__dag')].map((x) => x.getBoundingClientRect());
          const kop = r('.vc--kalender .kalender__kop');
          const kaartKop = r('.vc--kalender .kaartkop');
          const padK = parseFloat(getComputedStyle(document.querySelector('.vc--kalender')).paddingBottom);
          const wekenEl = [...document.querySelectorAll('.vc--kalender .kalender__week:not(.kalender__kop)')].map((x) => x.getBoundingClientRect());
          const cel = dagen[0];
          // BESLISSING 245: elke cel is ruim genoeg: het teken ligt volledig binnen de cel met minstens 3 px marge, en tussen de onderrand van een cel en het cijfer van de volgende week is minstens 4 px
          const cellen = [...document.querySelectorAll('.vc--kalender .kalender__dag')];
          let margeMin = 99, afstandMin = 99, cijferMarge = 99;
          for (const c of cellen) {
            const cr = c.getBoundingClientRect();
            const nr = c.querySelector('.kalender__nr').getBoundingClientRect();
            cijferMarge = Math.min(cijferMarge, nr.top - cr.top);
            const tk = c.querySelector('.kalender__tekens');
            if (tk) { const tr = tk.getBoundingClientRect(); margeMin = Math.min(margeMin, tr.top - cr.top, cr.bottom - tr.bottom, tr.left - cr.left, cr.right - tr.right); }
            const onder = document.querySelector('.vc--kalender .kalender__dag[data-datum="' + (() => { const d = new Date(c.dataset.datum + 'T12:00:00'); d.setDate(d.getDate() + 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })() + '"]');
            if (onder) afstandMin = Math.min(afstandMin, onder.querySelector('.kalender__nr').getBoundingClientRect().top - cr.bottom);
          }
          const cijferTops = {};
          for (const c of cellen) { const t = Math.round(c.getBoundingClientRect().top); (cijferTops[t] ??= []).push(c.querySelector('.kalender__nr').getBoundingClientRect().top - t); }
          const cijferLijn = Math.max(...Object.values(cijferTops).map((l) => Math.max(...l) - Math.min(...l)));
          return {
            topVerschil: Math.abs(eten.top - kal.top), onderVerschil: Math.abs(eten.bottom - kal.bottom), naast: kal.left >= eten.right - 1,
            links: Math.abs(kal.left - supp.left), rechts: Math.abs(kal.right - supp.right),
            legeEten: eten.bottom - Math.max(...maaltijden.map((x) => x.bottom)), // tot de kaartrand, incl. de binnenruimte van 24 px
            rijMax: Math.max(...maaltijden.map((x) => x.height)),
            legeKal: kal.bottom - onder.bottom, gat: legenda.top - raster.bottom, legendaGat: onder.top - legenda.bottom, kopGat: kop.top - kaartKop.bottom,
            rasterBreedte: Math.abs(raster.width - (kal.width - 2 * padK)), laatsteWeek: raster.bottom - wekenEl.at(-1).bottom,
            wekenGelijk: Math.max(...wekenEl.map((x) => x.height)) - Math.min(...wekenEl.map((x) => x.height)),
            margeMin, afstandMin, cijferMarge, cijferLijn, minDag: Math.min(...dagen.map((d) => Math.min(d.width, d.height))), maxDagH: Math.max(...dagen.map((d) => d.height)), celB: cel.width,
            scroll: document.documentElement.scrollWidth - innerWidth, weken: wekenEl.length,
          };
        });
      const soorten = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
      let n = 0;
      for (const doel of [0, 3, 6]) {
        while (n < doel) {
          const rij = maaltijd(page, soorten[n]);
          await rij.locator('> .rij').click();
          await maaltijdblad(page, soorten[n]).locator('textarea').fill('havermout met appel');
          await maaltijdblad(page, soorten[n]).locator(BEWAAR_MAALTIJD_SEL).click();
          await expect(maaltijdblad(page)).toHaveCount(0);
          n++;
        }
        await wachtOpRust(page);
        for (const stap of [0, 1, 2, 3]) {
          if (stap > 0) { await page.getByRole('button', { name: 'Volgende maand' }).click(); await wachtOpRust(page); }
          const m = await meet();
          const tekst = JSON.stringify({ doel, stap, ...m });
          expect(m.naast, tekst).toBe(true);
          expect(m.topVerschil, tekst).toBeLessThanOrEqual(1);
          expect(m.onderVerschil, tekst).toBeLessThanOrEqual(1);
          expect(m.links, tekst).toBeLessThanOrEqual(1);
          expect(m.rechts, tekst).toBeLessThanOrEqual(1);
          expect(m.legeEten, tekst).toBeLessThanOrEqual(25); // Eten: geen lege band onder de laatste rij (alleen de binnenruimte van 24 px)
          expect(m.rijMax, tekst).toBeLessThanOrEqual(80); // en de rijen zijn compact (± 64 px, "Aan de beurt" ± 68 px) en hoogstens ± 8 px uitgerekt door een iets hogere kalender
          expect(m.legeKal, tekst).toBeLessThanOrEqual(25); // Kalender: de link staat op de binnenruimte van de kaart
          expect(m.gat, tekst).toBeLessThanOrEqual(12); // geen leeg stuk onder de laatste week
          expect(m.legendaGat, tekst).toBeLessThanOrEqual(12);
          expect(m.kopGat, tekst).toBeLessThanOrEqual(16); // en niet boven de weekdagen
          expect(m.laatsteWeek, tekst).toBeLessThanOrEqual(1);
          expect(m.rasterBreedte, tekst).toBeLessThanOrEqual(1);
          expect(m.wekenGelijk, tekst).toBeLessThanOrEqual(1);
          expect(m.margeMin, tekst).toBeGreaterThanOrEqual(3); // het teken ligt volledig in de cel, met minstens 3 px marge
          expect(m.afstandMin, tekst).toBeGreaterThanOrEqual(4); // en de cel raakt het cijfer van de volgende week niet
          expect(m.cijferMarge, tekst).toBeGreaterThanOrEqual(3);
          expect(m.cijferLijn, tekst).toBeLessThanOrEqual(1); // alle cijfers van een week staan op één lijn
          expect(m.maxDagH, tekst).toBeLessThanOrEqual({ 6: 46, 5: 56, 4: 72 }[m.weken]); // cel ≤ 46 px bij zes weken; bij vijf en vier weken verdelen de rijen dezelfde vaste hoogte (even hoge kaart)
          expect(m.minDag, tekst).toBeGreaterThanOrEqual(36); // smalle desktop: muisbediening, cel 37 px breed en 52 px hoog
          expect(m.scroll, tekst).toBeLessThanOrEqual(0);
        }
        await page.getByRole('button', { name: 'Deze maand' }).click();
      }
    });
  });
}

test.describe('Kalender gedrag op een desktop', () => {
  test.use({ viewport: { width: 1690, height: 1230 }, isMobile: false, hasTouch: false });

  test('vandaag is gemarkeerd, een geplande beurt toont het capsuletje, en een tik gaat naar het Dagboek', async ({ page }) => {
    await page.clock.setFixedTime(KAL_NU);
    await page.goto('./#/vandaag');
    await zaaiPeriodiek(page);
    await openVandaag(page);
    await page.reload();
    await expect(page.locator('.vc--kalender .kalender__dag').first()).toBeVisible();
    await expect(page.locator('.vc--kalender .kalkaart__maand')).toHaveText('november 2026');
    await expect(page.locator('.vc--kalender .kalender__dagnaam')).toHaveText(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']);
    const vandaagDag = page.locator('.vc--kalender .kalender__dag.is-vandaag');
    await expect(vandaagDag).toHaveCount(1);
    await expect(vandaagDag).toHaveAttribute('aria-label', /^zaterdag 14 november, vandaag/);
    await expect(page.locator('.vc--kalender')).toHaveAttribute('data-uitleg', 'vandaag-kalender');
    const gepland = page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-28"]');
    await expect(gepland.locator('.kalender__spuit.is-gepland')).toHaveCount(1);
    await expect(gepland).toHaveAttribute('aria-label', 'zaterdag 28 november, gepland: Testspuit');
    await expect(gepland.locator('.kalender__spuit svg')).toHaveCount(1);
    expect(await gepland.locator('.kalender__spuit svg').evaluate((e) => (e.outerHTML.match(/<path/g) || []).length)).toBe(1);
    await expect(page.locator('.vc--kalender .kalkaart__legenda')).toContainText('geplande spuit');
    await expect(page.locator('.vc--kalender .kalkaart__legenda .kalender__bol')).toHaveCount(0);
    await expect(vandaagDag).toHaveAttribute('aria-label', /^zaterdag 14 november, vandaag, gepland: Testspuit$/);
    await expect(page.locator('.vc--kalender .kalender__bol')).toHaveCount(0);
    // een dag in het verleden: naar die dag in het Dagboek
    await page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-10"]').click();
    await expect(page).toHaveURL(/#\/dagboek\/dag\/2026-11-10$/);
    // een toekomstige dag: de maand van het Dagboek met die dag gekozen
    await page.goto('./#/vandaag');
    await page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-28"]').click();
    await expect(page).toHaveURL(/#\/dagboek\/maand\/2026-11$/);
    await expect(page.locator('.mk__dag[data-datum="2026-11-28"]')).toHaveAttribute('aria-pressed', 'true');
    // de link onderaan
    await page.goto('./#/vandaag');
    await page.locator('.kalkaart__link').click();
    await expect(page).toHaveURL(/#\/dagboek\/maand\/2026-11$/);
  });

  test('bladeren: vooruit en terug, geplande beurten per maand, Deze maand keert terug, kop springt niet', async ({ page }) => {
    await page.clock.setFixedTime(KAL_NU);
    await page.goto('./#/vandaag');
    await zaaiPeriodiek(page);
    await openVandaag(page);
    await page.reload();
    const titel = page.locator('.vc--kalender .kalkaart__maand');
    const terug = page.locator('.vc--kalender .kalkaart__terug');
    await expect(titel).toHaveText('november 2026');
    await expect(terug).toBeHidden();
    const vorige = page.getByRole('button', { name: 'Vorige maand' });
    const volgende = page.getByRole('button', { name: 'Volgende maand' });
    const box = await volgende.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await volgende.click();
    await expect(titel).toHaveText('december 2026');
    await expect(terug).toBeVisible();
    await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-12-12"] .kalender__spuit')).toHaveCount(1);
    await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-12-26"] .kalender__spuit')).toHaveCount(1);
    await expect(page.locator('.vc--kalender .kalender__dag.is-vandaag')).toHaveCount(0);
    expect(await volgende.boundingBox()).toEqual(box);
    await vorige.click();
    await expect(titel).toHaveText('november 2026');
    await expect(terug).toBeHidden();
    await vorige.click();
    await expect(titel).toHaveText('oktober 2026');
    await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-10-31"] .kalender__spuit')).toHaveCount(0);
    await terug.click();
    await expect(titel).toHaveText('november 2026');
    await expect(page.locator('.vc--kalender .kalender__dag.is-vandaag')).toHaveCount(1);
    await volgende.click();
    await page.locator('.vc--kalender .kalender__dag[data-datum="2026-12-12"]').click();
    await expect(page).toHaveURL(/#\/dagboek\/maand\/2026-12$/);
    await expect(page.locator('.mk__dag[data-datum="2026-12-12"]')).toHaveAttribute('aria-pressed', 'true');
    // opnieuw openen van Vandaag: weer de maand van vandaag
    await page.goto('./#/vandaag');
    await expect(titel).toHaveText('november 2026');
  });

  test('met een verzette klok naar de volgende maand toont de kaart de nieuwe maand en markeert de nieuwe dag', async ({ page }) => {
    await openVandaag(page);
    await expect(page.locator('.vc--kalender .kalkaart__maand')).toHaveText('november 2026');
    await page.clock.setFixedTime(new Date(2026, 11, 1, 9, 0, 0));
    await page.reload();
    await expect(page.locator('.vc--kalender .kalkaart__maand')).toHaveText('december 2026');
    await expect(page.locator('.vc--kalender .kalender__dag.is-vandaag')).toHaveAttribute('aria-label', 'dinsdag 1 december, vandaag');
  });
});

// BESLISSINGEN 418 en 419: een maaltijd invullen gebeurt in een blad boven het scherm. Met het blad open zijn de kaarten Eten en Kalender, de kalkaart
// en elke kalendercel EXACT even hoog als met het blad dicht, bij zes (november 2026), vijf (december 2026) en vier weken (februari 2027); en de kaart
// Kalender is in de drie maanden even hoog en even hoog als Eten (als ze naast elkaar staan; op de telefoon staat Kalender onder Eten).
async function etenEnKalenderMetBlad(page) {
  await openVandaag(page);
  const meet = () => page.evaluate(() => ({
    kal: document.querySelector('.vc--kalender').getBoundingClientRect().height,
    eten: document.querySelector('.vc--eten').getBoundingClientRect().height,
    kalkaart: document.querySelector('.vc--kalender .kalkaart, .vc--kalender.kalkaart').getBoundingClientRect().height,
    cellen: [...document.querySelectorAll('.vc--kalender .kalender__dag')].map((c) => c.getBoundingClientRect().height),
    weken: document.querySelectorAll('.vc--kalender .kalender__week:not(.kalender__kop)').length,
    onder: document.querySelector('.vc--kalender').getBoundingClientRect().bottom + window.scrollY,
    naast: Math.abs(document.querySelector('.vc--kalender').getBoundingClientRect().top - document.querySelector('.vc--eten').getBoundingClientRect().top) < 2,
  }));
  const titel = page.locator('.vc--kalender .kalkaart__maand');
  const blad = maaltijdblad(page, 'ontbijt');
  const uitslag = [];
  for (const [maand, weken, stappen] of [['november 2026', 6, 0], ['december 2026', 5, 1], ['februari 2027', 4, 2]]) {
    for (let i = 0; i < stappen; i++) await page.getByRole('button', { name: 'Volgende maand' }).click();
    await expect(titel).toHaveText(maand);
    await wachtOpRust(page);
    const dicht = await wachtTotStil(page, meet);
    expect(dicht.weken, maand).toBe(weken);
    await maaltijd(page, 'ontbijt').locator('> .rij').click();
    await expect(blad).toBeVisible();
    await wachtOpRust(page); // het blad is helemaal opgekomen
    const open = await wachtTotStil(page, meet);
    expect(open, `${maand}: met het blad open (eerst) tegenover dicht`).toEqual(dicht);
    await blad.getByRole('button', { name: 'Annuleren', exact: true }).click(); // er is niets ingevuld: niets te bewaren
    await expect(blad).toHaveCount(0);
    await expect(titel).toHaveText(maand); // de kalender blijft op de gekozen maand
    uitslag.push(dicht);
  }
  const [nov] = uitslag;
  if (nov.naast) for (const x of uitslag) {
    expect(Math.abs(x.kal - nov.kal), JSON.stringify(uitslag)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(x.kal - x.eten), JSON.stringify(uitslag)).toBeLessThanOrEqual(1);
    expect(Math.abs(x.onder - nov.onder), JSON.stringify(uitslag)).toBeLessThanOrEqual(0.5);
  }
}
for (const [breedte, hoogte, telefoon] of [[1690, 1230, false], [1280, 800, false], [1024, 768, false], [390, 844, true]]) {
  test.describe(`Kalender en Eten met een open maaltijdblad ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: telefoon, hasTouch: telefoon });
    test(`${breedte}x${hoogte}: met een open maaltijdblad zijn Eten, Kalender en elke kalendercel exact even hoog als zonder, bij zes, vijf en vier weken`, async ({ page }) => {
      await etenEnKalenderMetBlad(page);
    });
  });
}

for (const [breedte, hoogte] of [[390, 844], [360, 760]]) {
  test(`Kalender op een telefoon ${breedte}: eigen kaart onder Eten, volle breedte, tikdoelen vanaf 40 px, geen zijwaartse scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await openVandaag(page);
    const m = await page.evaluate(() => {
      const eten = document.querySelector('.vc--eten').getBoundingClientRect();
      const kal = document.querySelector('.vc--kalender').getBoundingClientRect();
      const dagen = [...document.querySelectorAll('.vc--kalender .kalender__dag')].map((x) => x.getBoundingClientRect());
      let marge = 99, afstand = 99;
      for (const c of document.querySelectorAll('.vc--kalender .kalender__dag')) {
        const cr = c.getBoundingClientRect(); const tk = c.querySelector('.kalender__tekens');
        if (tk) { const tr = tk.getBoundingClientRect(); marge = Math.min(marge, tr.top - cr.top, cr.bottom - tr.bottom, tr.left - cr.left, cr.right - tr.right); }
        const d = new Date(c.dataset.datum + 'T12:00:00'); d.setDate(d.getDate() + 7);
        const sl = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const o = document.querySelector('.vc--kalender .kalender__dag[data-datum="' + sl + '"]');
        if (o) afstand = Math.min(afstand, o.querySelector('.kalender__nr').getBoundingClientRect().top - cr.bottom);
      }
      return { marge, afstand, onder: kal.top >= eten.bottom - 1, zelfdeBreedte: Math.abs(kal.width - eten.width) <= 1, minB: Math.min(...dagen.map((d) => d.width)), minH: Math.min(...dagen.map((d) => d.height)), scroll: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(m.onder, JSON.stringify(m)).toBe(true);
    expect(m.zelfdeBreedte).toBe(true);
    expect(m.marge, JSON.stringify(m)).toBeGreaterThanOrEqual(3);
    expect(m.afstand, JSON.stringify(m)).toBeGreaterThanOrEqual(4);
    expect(m.minB, JSON.stringify(m)).toBeGreaterThanOrEqual(40);
    expect(m.minH).toBeGreaterThanOrEqual(40);
    expect(m.scroll).toBe(true);
  });
}

// (R4-03/R4-04) Hier stond een test die alleen schermafbeeldingen maakte met SHOTDIR, zonder bewering; verwijderd (16 november).

test('BESLISSING 256: de datum onder de begroeting staat links uitgelijnd en met jaartal', async ({ page }) => {
  for (const breedte of [1690, 390, 360]) {
    await page.setViewportSize({ width: breedte, height: 900 });
    await page.goto('./#/vandaag');
    const datum = page.locator('.begroeting__datum');
    await expect(datum).toBeVisible();
    await expect(datum).toHaveText(/\d{4}$/);
    const eerste = await page.locator('.vandaag .kaart').first().boundingBox();
    const d = await datum.boundingBox();
    expect(Math.abs(d.x - eerste.x)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

// BESLISSING 265: de legenda en de link van de kaart Kalender beginnen op de linkerrand van "16" in de maandagkolom.
for (const [breedte, hoogte] of [[1690, 1230], [390, 844]]) {
  test(`Kalender ${breedte}: legenda en link beginnen gelijk met de cijfers van de maandagkolom`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await openVandaag(page);
    const m = await page.evaluate(() => {
      const nr = [...document.querySelectorAll('.vc--kalender .kalender__nr')].find((e) => e.textContent.trim() === '16');
      const tn = nr.firstChild; const rg = document.createRange(); rg.selectNodeContents(tn);
      const cijfer = rg.getBoundingClientRect().left;
      const eerste = document.querySelector('.vc--kalender .kalkaart__legenda .kalkaart__legendaitem').getBoundingClientRect().left;
      const link = document.querySelector('.vc--kalender .kalkaart__link').getBoundingClientRect().left;
      const namen = [...document.querySelectorAll('.vc--kalender .kalender__dagnaam')];
      const tekstRand = (el) => { const r = document.createRange(); r.selectNodeContents(el.firstChild); return r.getBoundingClientRect(); };
      const ma = tekstRand(namen[0]).left, zo = tekstRand(namen[6]).right;
      const glyph = document.querySelector('.vc--kalender .kaartkop .tegel svg');
      const tegel = Math.min(...[...glyph.querySelectorAll('path, rect, circle, line, polyline')].map((p) => p.getBoundingClientRect().left));
      const pijl = [...document.querySelectorAll('.vc--kalender .kalkaart__blader .icoon')].pop().getBoundingClientRect().right;
      return { ma, zo, cijfer, eerste, link, tegel, pijl };
    });
    const tekst = JSON.stringify(m);
    // Referentie: de tekst "MA" (links) en "ZO" (rechts); de tweecijferige getallen liggen er vlak bij
    expect(Math.abs(m.tegel - m.ma), tekst).toBeLessThanOrEqual(1.5); // het svg-icoon zelf (niet de tegel) sluit aan op "MA"
    expect(Math.abs(m.eerste - m.ma), tekst).toBeLessThanOrEqual(2);
    expect(Math.abs(m.link - m.ma), tekst).toBeLessThanOrEqual(2);
    expect(Math.abs(m.cijfer - m.ma), tekst).toBeLessThanOrEqual(2);
    expect(Math.abs(m.pijl - m.zo), tekst).toBeLessThanOrEqual(2);
  });
}

// Kaart Drinken, "Laatst gedronken": elke pil op één regel (icoon, uur en hoeveelheid), even hoog, even breed en links uitgelijnd met het kopje; ook met de langste soortnamen.
for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1280, 800], [390, 844]]) {
  test(`Laatst gedronken ${breedte}: pillen op één regel, even hoog en breed, links uitgelijnd met het kopje`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/vandaag');
    await expect(page.locator('.drinkkaart .drankknop')).toHaveCount(6);
    if (breedte >= 720) {
      for (const soort of ['water', 'frisdrank', 'anders']) {
        await page.locator(`.drinkkaart .drankknop[data-soort="${soort}"]`).click();
        await wachtOpRust(page);
      }
      await wachtOpRust(page);
      const m = await page.evaluate(() => {
        const kop = document.querySelector('.drinkkaart .laatst > .label').getBoundingClientRect();
        const links = document.querySelector('.drinkkaart__links').getBoundingClientRect();
        const chips = [...document.querySelectorAll('.drinkkaart .laatst__chip')].filter((c) => c.getBoundingClientRect().width > 0);
        const rects = chips.map((c) => c.getBoundingClientRect());
        return { kopLinks: kop.left, links: links.right, n: chips.length, rects: rects.map((r) => ({ l: r.left, r: r.right, h: r.height, w: r.width, t: r.top, b: r.bottom })), iconen: chips.map((c) => c.querySelector('.icoon').getBoundingClientRect().left), titels: chips.map((c) => c.title), labels: chips.map((c) => c.getAttribute('aria-label')), scroll: document.documentElement.scrollWidth - innerWidth };
      });
      const tekst = JSON.stringify(m);
      expect(m.n, tekst).toBeGreaterThanOrEqual(2);
      // BESLISSING 308: in een brede kaart (960 tot 1439 px, Drinken over de volle breedte) staan de pillen naast elkaar op één rij: dan beginnen ze op de top van de rij en is alleen de eerste links uitgelijnd.
      const naastElkaar = m.rects.length > 1 && Math.abs(m.rects[1].t - m.rects[0].t) <= 1;
      for (const [i, r] of m.rects.entries()) {
        expect(r.h, tekst).toBeLessThanOrEqual(32); // één regel
        expect(Math.abs(r.h - m.rects[0].h), tekst).toBeLessThanOrEqual(1);
        expect(Math.abs(r.w - m.rects[0].w), tekst).toBeLessThanOrEqual(1);
        if (!naastElkaar || i === 0) expect(Math.abs(r.l - m.kopLinks), tekst).toBeLessThanOrEqual(1);
        expect(r.r, tekst).toBeLessThanOrEqual(m.links + 1);
      }
      for (const x of m.iconen) if (!naastElkaar) expect(Math.abs(x - m.iconen[0]), tekst).toBeLessThanOrEqual(1);
      for (let i = 1; i < m.rects.length; i++) if (!naastElkaar) expect(Math.abs(m.rects[i].t - m.rects[i - 1].b - (m.rects[1].t - m.rects[0].b)), tekst).toBeLessThanOrEqual(1); // gelijke tussenruimte
      expect(m.titels.every(Boolean) && m.labels.every((l) => /\d/.test(l))).toBe(true); // de soort in de title en het aria-label
      expect(m.scroll).toBeLessThanOrEqual(0);
    }
  });
}

for (const [breedte, hoogte] of [[1690, 1230], [1280, 900]]) {
  test(`Koplijnen op Vandaag ${breedte}: tegel en lijn op dezelfde y, paren even hoog`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.clock.setFixedTime(KAL_NU);
    await page.goto('./#/vandaag');
    await page.evaluate(
      () =>
        new Promise((klaar, fout) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['supplementen'], 'readwrite');
            ['ochtend', 'middag', 'avond'].forEach((moment, i) => tx.objectStore('supplementen').add({ naam: 'Kop' + i, dosis: '', hoeveelheid: '1', aanwijzing: '', momenten: [moment], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
            tx.oncomplete = () => { idb.close(); klaar(); };
            tx.onerror = () => fout(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(page.locator('.suppkaart')).toBeVisible();
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const maat = (sel) => {
        const k = document.querySelector(sel);
        const kr = k.getBoundingClientRect();
        const kopEl = k.querySelector('.kaartkop');
        const kop = kopEl.getBoundingClientRect();
        // In een smalle Kalender is de lijn een ::before op de eerste regel (de pijlen staan eronder); anders is het de onderrand van de kop.
        const voor = getComputedStyle(kopEl, '::before');
        const lijn = voor.content !== 'none' && voor.position === 'absolute' ? kop.top + parseFloat(voor.top) + 1 : kop.bottom;
        return { tegel: k.querySelector('.kaartkop .tegel').getBoundingClientRect().top - kr.top, lijn: lijn - kr.top, h: kr.height, onder: kr.bottom };
      };
      return { drinken: maat('.vc--drinken'), supp: maat('.suppkaart'), eten: maat('.vc--eten'), kal: maat('.kalkaart') };
    });
    const tekst = JSON.stringify(m);
    for (const k of ['supp', 'eten', 'kal']) {
      expect(Math.abs(m[k].tegel - m.drinken.tegel), tekst).toBeLessThanOrEqual(1);
      expect(Math.abs(m[k].lijn - m.drinken.lijn), tekst).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(m.drinken.h - m.supp.h), tekst).toBeLessThanOrEqual(1);
    expect(Math.abs(m.eten.h - m.kal.h), tekst).toBeLessThanOrEqual(1);
  });
}

// BESLISSING 291: vandaag in de Kalender heeft geen kadertje meer, maar het cijfer in een gevulde ronde stip, op dezelfde plaats als de andere cijfers.
test.describe('Kalender vandaag als stip', () => {
test.use({ viewport: { width: 1690, height: 1230 }, isMobile: false, hasTouch: false });
test('Kalender: vandaag is een gevulde stip zonder kader, het cijfer verspringt niet en de kaart blijft even hoog als Eten', async ({ page }) => {
  await page.clock.setFixedTime(KAL_NU);
  await page.goto('./#/vandaag');
  await openVandaag(page);
  await page.reload();
  const vandaagDag = page.locator('.vc--kalender .kalender__dag.is-vandaag');
  await expect(vandaagDag).toHaveCount(1);
  await expect(vandaagDag).toHaveAttribute('aria-label', /vandaag/);
  const m = await page.evaluate(() => {
    const dag = document.querySelector('.vc--kalender .kalender__dag.is-vandaag');
    const s = getComputedStyle(dag);
    const nr = dag.querySelector('.kalender__nr');
    const stip = getComputedStyle(nr, '::before');
    const midden = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const buur = document.querySelector('.vc--kalender .kalender__dag[data-datum="2026-11-13"] .kalender__nr');
    const nu = midden(nr);
    const b = midden(buur);
    return {
      rand: s.boxShadow, rand2: s.borderTopWidth, bg: s.backgroundColor,
      stipB: parseFloat(stip.width), stipH: parseFloat(stip.height), stipBg: stip.backgroundColor,
      dx: Math.abs(nu.x - b.x), dy: Math.abs(nu.y - b.y), // buurdag: vrijdag 13 november, zelfde rij, andere kolom
      hKal: document.querySelector('.kalkaart').getBoundingClientRect().height, hEten: document.querySelector('.vc--eten').getBoundingClientRect().height,
    };
  });
  const tekst = JSON.stringify(m);
  expect(m.rand, tekst).toBe('none');
  expect(m.rand2, tekst).toBe('0px');
  expect(m.bg, tekst).toBe('rgba(0, 0, 0, 0)');
  expect(m.stipB, tekst).toBe(m.stipH);
  expect(m.stipB, tekst).toBe(26);
  expect(m.stipBg, tekst).not.toBe('rgba(0, 0, 0, 0)');
  expect(m.dy, tekst).toBeLessThanOrEqual(0.5); // zelfde y als het cijfer van de buurdag in dezelfde rij
  expect(m.dx, tekst).toBeGreaterThan(20); // andere kolom
  expect(Math.abs(m.hKal - m.hEten), tekst).toBeLessThanOrEqual(1);
  // Afstanden rond de stip (met een salie bolletje op vandaag): stip tot bolletje >= 2 px, stip tot het cijfer erboven >= 3 px.
  await zaaiMomenten(page, { '2026-11-14': ['ochtend', 'middag', 'avond'] }); // vandaag: alle momenten genomen, dus een salie bolletje onder de stip (BESLISSING 294)
  await page.reload();
  await expect(page.locator('.vc--kalender .kalender__dag.is-vandaag .kalender__klaar')).toHaveCount(1);
  for (const [b, h] of [[1690, 1230], [1280, 900], [390, 844]]) {
    await page.setViewportSize({ width: b, height: h });
    await wachtOpRust(page);
    const a = await page.evaluate(() => {
      const dag = document.querySelector('.vc--kalender .kalender__dag.is-vandaag');
      const nr = dag.querySelector('.kalender__nr');
      const r = nr.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const bol = dag.querySelector('.kalender__klaar').getBoundingClientRect();
      const boven = document.querySelector('.vc--kalender .kalender__dag[data-datum="2026-11-07"] .kalender__nr').getBoundingClientRect();
      const rg =document.createRange(); rg.selectNodeContents(nr.firstChild);
      const tk = rg.getBoundingClientRect(); const lucht = (r.left + r.width / 2 - 13) ; // linkerrand van de stip
      return { bol: bol.top - (mid + 13), boven: mid - 13 - boven.bottom, luchtL: tk.left - lucht, luchtR: lucht + 26 - tk.right };
    });
    expect(a.bol, `${b}: ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(2);
    expect(a.boven, `${b}: ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(3);
    expect(Math.min(a.luchtL, a.luchtR), `${b}: ${JSON.stringify(a)}`).toBeGreaterThanOrEqual(4);
    console.log('afstanden', b, JSON.stringify(a));
  }
});
});

// Verzonnen: een dagelijks supplement "Testdruppels" (ochtend, middag, avond) en de periodieke "Testspuit" (14 en 28 november).
async function zaaiMomenten(page, perDag) {
  await page.evaluate(
    (dagen) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').put({ id: 77, naam: 'Testdruppels', dosis: '', hoeveelheid: '1 pipetje', aanwijzing: '', momenten: ['ochtend', 'middag', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          for (const [datum, momenten] of Object.entries(dagen)) for (const moment of momenten) tx.objectStore('momentinnames').put({ datum, supplementId: 77, moment, tijdstip: 1, voorbeeld: false });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
    perDag,
  );
}

for (const [breedte, hoogte] of [[1690, 1230], [1280, 900], [390, 844]]) {
  test.describe(`Kalender op Vandaag ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: breedte < 720, hasTouch: breedte < 720 });
    test(`Kalender op Vandaag ${breedte}: een salie bolletje bij alle momenten, bolletje en spuitje op één lijn, Eten en Kalender even hoog`, async ({ page }) => {
      await page.clock.setFixedTime(KAL_NU);
      await page.goto('./#/vandaag');
      await zaaiPeriodiek(page);
      const alle = ['ochtend', 'middag', 'avond'];
      // 17 en 24 november liggen in de toekomst: daar staat nooit een bolletje, ook niet als er innames zouden zijn
      await zaaiMomenten(page, { '2026-11-01': alle, '2026-11-03': alle, '2026-11-10': alle, '2026-11-14': alle, '2026-11-17': alle, '2026-11-12': ['ochtend'], '2026-11-24': alle });
      await openVandaag(page);
      await page.reload();
      await expect(page.locator('.vc--kalender .kalender__dag').first()).toBeVisible();
      await wachtOpRust(page);
      // het salie bolletje precies op de volledige dagen (niet op de dag met één moment, niet op een dag zonder iets)
      const dagenMetBol = await page.locator('.vc--kalender .kalender__dag:has(.kalender__klaar)').evaluateAll((els) => els.map((e) => e.dataset.datum));
      expect(dagenMetBol).toEqual(['2026-11-01', '2026-11-03', '2026-11-10', '2026-11-14']);
      await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-12"] .kalender__klaar')).toHaveCount(0);
      await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-13"] .kalender__klaar')).toHaveCount(0);
      await expect(page.locator('.vc--kalender .kalender__dag[data-datum="2026-11-14"]')).toHaveAttribute('aria-label', /^zaterdag 14 november, vandaag, alle supplementen genomen/);
      await expect(page.locator('.vc--kalender .kalkaart__legenda')).toContainText('alle supplementen genomen');
      await expect(page.locator('.vc--kalender .kalkaart__legenda')).toContainText('geplande spuit');
      const m = await page.evaluate(() => {
        const rij = (d) => {
          const dag = document.querySelector(`.vc--kalender .kalender__dag[data-datum="${d}"]`);
          const nr = dag.querySelector('.kalender__nr').getBoundingClientRect();
          const k = dag.querySelector('.kalender__klaar')?.getBoundingClientRect();
          const s = dag.querySelector('.kalender__spuit')?.getBoundingClientRect();
          const mid = (r) => r.top + r.height / 2;
          const c = dag.getBoundingClientRect();
          const rg = document.createRange(); rg.selectNodeContents(dag.querySelector('.kalender__nr').firstChild);
          const tk = rg.getBoundingClientRect(); const cx = tk.left + tk.width / 2; // het midden van het cijfer zelf (ook onder de stip van vandaag)
          // de zichtbare tekening van het spuitje: de paden van het icoon, niet de box van de svg
          const delen = s ? [...dag.querySelectorAll('.kalender__spuit svg path')].map((p) => p.getBoundingClientRect()) : [];
          const tek = delen.length ? { l: Math.min(...delen.map((p) => p.left)), r: Math.max(...delen.map((p) => p.right)) } : null;
          const groepL = Math.min(k?.left ?? 1e9, s?.left ?? 1e9);
          const groepR = Math.max(k?.right ?? -1e9, s?.right ?? -1e9);
          return { klaar: k ? mid(k) - nr.bottom : null, spuit: s ? mid(s) - nr.bottom : null, bolDx: k && !s ? k.left + k.width / 2 - cx : null, spuitDx: tek && !k ? (tek.l + tek.r) / 2 - cx : null, capsuleDx: s && !k ? s.left + s.width / 2 - cx : null, groepDx: k && s ? (groepL + groepR) / 2 - cx : null, gap: k && s ? s.left - k.right : null, dy: k && s ? Math.abs(mid(k) - mid(s)) : null, dag: d };
        };
        const r = ['01', '03', '10', '14', '28'].map((d) => rij('2026-11-' + d));
        return { r, hKal: document.querySelector('.kalkaart').getBoundingClientRect().height, hEten: document.querySelector('.vc--eten').getBoundingClientRect().height, scroll: document.documentElement.scrollWidth - innerWidth, uit: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map((e) => `${e.tagName}.${e.className}`) };
      });
      const tekst = JSON.stringify(m);
      const klaar = m.r.map((x) => x.klaar).filter((x) => x !== null);
      const spuit = m.r.map((x) => x.spuit).filter((x) => x !== null);
      const spreid = (a) => Math.max(...a) - Math.min(...a);
      expect(klaar.length, tekst).toBe(4);
      expect(spuit.length, tekst).toBe(2);
      expect(spreid(klaar), `bolletjes op één lijn en gelijke afstand onder het cijfer: ${tekst}`).toBeLessThanOrEqual(1);
      expect(spreid(spuit), `spuitjes op één lijn: ${tekst}`).toBeLessThanOrEqual(1);
      // exact gecentreerd onder het cijfer (≤ 0,5 px): een bolletje (1, 3, 10), een spuitje alleen (28), het paar van vandaag (14, onder de paarse stip)
      const mid = (naam) => m.r.map((x) => x[naam]).filter((x) => x !== null);
      expect(mid('bolDx').length, tekst).toBe(3);
      expect(mid('spuitDx').length, tekst).toBe(1);
      expect(mid('groepDx').length, tekst).toBe(1);
      for (const x of [...mid('bolDx'), ...mid('spuitDx'), ...mid('capsuleDx'), ...mid('groepDx')]) expect(Math.abs(x), `gecentreerd onder het cijfer: ${tekst}`).toBeLessThanOrEqual(0.5);
      expect(m.r[3].dy, `bolletje en spuitje van de 14e op dezelfde y: ${tekst}`).toBeLessThanOrEqual(1);
      expect(m.r[3].gap, `geen overlap: ${tekst}`).toBeGreaterThanOrEqual(1);
      if (breedte >= 1024) expect(Math.abs(m.hKal - m.hEten), tekst).toBeLessThanOrEqual(1);
      expect(m.scroll, tekst).toBeLessThanOrEqual(0);
    });
  });
}

// BESLISSING 355 en 356: de kaart Drinken op Vandaag kleurt als het tabblad Drinken: geen accent (roze) en geen gezondheid (salie) in glas, balk, link en etiketten, in elk thema.
for (const thema of ['poeder', 'salie', 'nacht']) {
  test(`Vandaag in ${thema}: de drinkkaart gebruikt de kleuren van Drinken (geen accent, geen gezondheid), contrast minstens 4,5:1`, async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await page.goto('./#/vandaag');
    await page.waitForSelector('.drinkkaart');
    await wachtOpRust(page);
    await page.evaluate(
      () =>
        new Promise((klaar, mislukt) => {
          const t2 = (x) => String(x).padStart(2, '0');
          const nu = new Date();
          const v = indexedDB.open('bloei-dagboek');
          v.onerror = () => mislukt(v.error);
          v.onsuccess = () => {
            const db = v.result;
            const tx = db.transaction('dranken', 'readwrite');
            tx.objectStore('dranken').clear();
            for (let i = 0; i < 5; i++) tx.objectStore('dranken').add({ datum: `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`, tijdstip: nu.getTime() - i * 60000, soort: i % 2 ? 'thee' : 'water', ml: 500, voorbeeld: false });
            tx.oncomplete = () => { db.close(); klaar(); };
            tx.onerror = () => mislukt(tx.error);
          };
        }),
    );
    await page.reload();
    await page.waitForSelector('.drinkkaart .laatst__chip');
    await page.evaluate((t) => (t === 'poeder' ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', t)), thema);
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgb = (c) => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data].slice(0, 3).join(','); };
      const rij = (s) => s.split(',').map(Number);
      const probe = (token) => { const p = document.createElement('i'); p.style.color = `var(${token})`; document.body.append(p); const k = rgb(getComputedStyle(p).color); p.remove(); return k; };
      const lum = (s) => { const [r, g, b] = rij(s); const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const k = document.querySelector('.drinkkaart');
      const kaartBg = rgb(getComputedStyle(k).backgroundColor);
      const chip = k.querySelector('.laatst__chip');
      const weg = k.querySelector('.drinkkaart__acties .knop--tekst');
      const kleuren = {
        glas: rgb(getComputedStyle(k.querySelector('.watervulling__vlak')).fill),
        glasRand: rgb(getComputedStyle(k.querySelector('.watervulling__rand')).stroke),
        balk: rgb(getComputedStyle(k.querySelector('.drinkbaan__vulling')).backgroundColor),
        balkSpoor: rgb(getComputedStyle(k.querySelector('.drinkbaan')).backgroundColor),
        link: rgb(getComputedStyle(weg).color),
        chipVlak: rgb(getComputedStyle(chip).backgroundColor),
      };
      return {
        kleuren,
        verboden: ['--c-accent', '--c-accent-soft', '--c-accent-text', '--c-health', '--c-health-soft', '--c-health-text', '--tile-health-fg', '--tile-health-bg'].map((t) => [t, probe(t)]),
        tegelKleur: rgb(getComputedStyle(k.querySelector('.drankknop .tegel')).color),
        chipContrast: contrast(rgb(getComputedStyle(chip).color), kleuren.chipVlak),
        linkContrast: contrast(kleuren.link, kaartBg),
        zin: k.querySelector('.drinkkaart__gehaald')?.textContent ?? '',
      };
    });
    for (const [naam, kleur] of Object.entries(m.kleuren)) for (const [token, verbod] of m.verboden) expect(kleur, `${naam} is niet ${token}`).not.toBe(verbod);
    expect(m.kleuren.glas, 'glas bij gehaald doel = icoonkleur van een dranktegel').toBe(m.tegelKleur);
    expect(m.kleuren.balk, 'balk bij gehaald doel = icoonkleur van een dranktegel').toBe(m.tegelKleur);
    expect(m.zin).toContain('gehaald');
    expect(m.chipContrast, 'etiket').toBeGreaterThanOrEqual(4.5);
    expect(m.linkContrast, 'Laatste weghalen').toBeGreaterThanOrEqual(4.5);
  });
}
