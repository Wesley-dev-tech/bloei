// BESLISSING 522: knoppen die bij elkaar horen, staan gecentreerd en zijn onderling even breed, niet over de volle breedte uitgesmeerd. Hier voor het slot:
// "Je code niet meer weten", de bevestigingsvragen, de herstelcode ingeven, de herstelcode bewaren en het
// instellen van de code, op 360, 390, 820 en 1280 px. (BESLISSING 541: "Je toestel als hulp" bestaat niet meer; de weg met het toestel staat bij "Je code niet meer weten".) Daarnaast houdt het welkomscherm zijn kaarthoogte (door de eigenaar goedgekeurd).
// Schermafbeeldingen alleen op verzoek: SHOTDIR (map buiten de bouwmap), SHOTNAAM (voor of na).
import { test, expect, devices } from '@playwright/test';
import { animatiesKlaar, schermKlaar } from './wacht.js';
import { vasteKlok } from './vaste-klok.js';
import { authenticator, rondAf, stap, tik } from './slot-hulp.js';

const PIXEL = devices['Pixel 7'];
const ANDROID = { userAgent: PIXEL.userAgent, viewport: PIXEL.viewport, deviceScaleFactor: PIXEL.deviceScaleFactor, isMobile: true, hasTouch: true };
const LEEG = { cookies: [], origins: [] };
const CODE = '123456';
const MATEN = [
  [360, 740],
  [390, 844],
  [820, 1180],
  [1280, 800],
];
// BESLISSING 669 (overal 16 px binnen een stap) laat de kaart even hoog: de drie tussenruimtes zijn samen 48 px, voor (8 + 16 + 24) en na (16 + 16 + 16).
// BESLISSING 668: op Android (412x915) staat "Vingerafdruk" op een regel; de kaart is er even hoog als op een iPhone (545 in plaats van 557).
const KAART = { '360x740': 545, '390x844': 545, '412x915': 545, '820x1180': 616, '1280x800': 663 };

const SLOT = (page) => page.getByRole('switch', { name: /^Bloei vergrendelen/ });

// Meet de zichtbare knoppen in een houder en toets ze aan de regel. soort: 'paar' (twee knoppen), 'kolom' (drie of meer onder elkaar), 'enkel' (een hoofdknop).
// Een tekstknop (.knop--tekst) hoort er gecentreerd onder, zonder gelijke breedte.
async function meet(page, wortel, soort, naam) {
  const m = await page.locator(wortel).first().evaluate((w) => {
    const ref = (w.matches('.slot__binnen, .slot__instel') ? w : w.closest('.slot__binnen, .slot__instel') || w).getBoundingClientRect();
    const knoppen = [...w.querySelectorAll('button.knop')]
      .filter((k) => !k.closest('.herstel__knoppen') && k.getBoundingClientRect().width > 0)
      .map((k) => {
        const b = k.getBoundingClientRect();
        const t = k.querySelector('.knop__tekst') || k;
        return { tekst: k.textContent.trim(), tekstknop: k.classList.contains('knop--tekst'), x: b.x, y: b.y, w: b.width, h: b.height, afgekapt: k.scrollWidth > k.clientWidth + 1 || t.scrollWidth > t.clientWidth + 1 || k.scrollHeight > k.clientHeight + 1 };
      });
    return { ref: { x: ref.x, w: ref.width }, knoppen, vw: window.innerWidth, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
  });
  const midden = m.ref.x + m.ref.w / 2;
  const hoofd = m.knoppen.filter((k) => !k.tekstknop);
  const tekst = m.knoppen.filter((k) => k.tekstknop);
  const wat = (s) => `${naam}: ${s}`;
  expect.soft(hoofd.length, wat('aantal knoppen')).toBe(soort === 'paar' ? 2 : soort === 'enkel' ? 1 : hoofd.length);
  if (!hoofd.length) return;
  for (const k of m.knoppen) {
    expect.soft(k.h, wat(`tikvlak ${k.tekst}`)).toBeGreaterThanOrEqual(43.5);
    expect.soft(k.afgekapt, wat(`afgekapt ${k.tekst}`)).toBe(false);
  }
  for (const k of hoofd) expect.soft(Math.abs(k.w - hoofd[0].w), wat(`even breed ${k.tekst}`)).toBeLessThanOrEqual(1);
  const links = Math.min(...hoofd.map((k) => k.x));
  const rechts = Math.max(...hoofd.map((k) => k.x + k.w));
  expect.soft(Math.abs((links + rechts) / 2 - midden), wat('hoofdknoppen gecentreerd')).toBeLessThanOrEqual(1);
  for (const k of tekst) expect.soft(Math.abs(k.x + k.w / 2 - midden), wat(`tekstknop ${k.tekst} gecentreerd`)).toBeLessThanOrEqual(1);
  if (soort === 'paar' && m.vw >= 390) expect.soft(Math.abs(hoofd[0].y - hoofd[1].y), wat('naast elkaar')).toBeLessThanOrEqual(1);
  if (soort === 'kolom') for (const k of hoofd) expect.soft(k === hoofd[0] || Math.abs(k.y - hoofd[0].y) > 20, wat('onder elkaar')).toBe(true);
  // BESLISSING 676: op de staande telefoon (tot 480 px breed) is de knopbreedte 20,25rem (324 px), onder de 330 px van 522; tablet en desktop 21rem.
  // BESLISSING 660 tot 664: in het slot (#slot) heeft elke brede knop, alleen of in een groep, een knopbreedte per weergave: 21rem, hoogstens de houder.
  // Buiten het slot (Algemeen, het welkomscherm) blijft een enkele hoofdknop de gewone knopbreedte (13rem).
  if (soort === 'enkel' && wortel.startsWith('#slot')) expect.soft(Math.abs(hoofd[0].w - Math.min((m.vw <= 480 ? 20.25 : 21) * m.rem, m.ref.w)), wat('knopbreedte van het slot')).toBeLessThanOrEqual(1);
  else if (soort === 'enkel') expect.soft(hoofd[0].w, wat('gewone knopbreedte')).toBeLessThanOrEqual(13 * m.rem + 1);
  if (m.vw >= 820) expect.soft(rechts - links, wat('niet van rand tot rand')).toBeLessThan(m.ref.w - 8);
}

async function foto(page, naam, [b]) {
  if (!process.env.SHOTDIR || (b !== 390 && b !== 1280 && b !== 412)) return;
  await animatiesKlaar(page);
  await page.screenshot({ path: `${process.env.SHOTDIR}/${process.env.SHOTNAAM || 'na'}-${naam}-${b}.png`, fullPage: true });
}

// Algemeen > Vergrendeling: het slot aanzetten.
async function metSlot(page) {
  await authenticator(page, 'ok');
  await page.goto('./#/meer/vergrendeling');
  await schermKlaar(page, '#/meer/vergrendeling');
  await SLOT(page).click();
  await tik(page, CODE);
  await tik(page, CODE);
  await rondAf(page);
  await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
}

for (const maat of MATEN) {
  const [breed, hoog] = maat;
  test.describe(`slot ${breed}x${hoog}`, () => {
    test.use({ viewport: { width: breed, height: hoog } });
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('de herstelcode bewaren in Algemeen', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./#/meer/vergrendeling');
      await schermKlaar(page, '#/meer/vergrendeling');
      await SLOT(page).click();
      await expect(page.locator('.cijferblok')).toBeVisible();
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(stap(page)).toBeVisible(); // meteen de herstelcode: er is geen aanbod meer om het toestel te koppelen (BESLISSING 541)
      await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
      await foto(page, 'herstelcode', maat);
      await meet(page, '[data-herstelstap]', 'enkel', 'herstelcode bewaren');
    });

    test('Algemeen: de code kiezen (cijferblok met Annuleren)', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./#/meer/vergrendeling');
      await schermKlaar(page, '#/meer/vergrendeling');
      await SLOT(page).click();
      await expect(page.locator('.cijferblok')).toBeVisible();
      await animatiesKlaar(page);
      await foto(page, 'instel', maat);
      const m = await page.locator('.slot__instel').evaluate((e) => {
        const r = e.getBoundingClientRect();
        const k = e.querySelector('button.knop--tekst').getBoundingClientRect();
        return { c: r.x + r.width / 2, k: k.x + k.width / 2, h: k.height };
      });
      expect.soft(Math.abs(m.c - m.k), 'Annuleren gecentreerd').toBeLessThanOrEqual(1);
      expect.soft(m.h).toBeGreaterThanOrEqual(43.5);
    });

    test('Je code niet meer weten, de herstelcode ingeven en de bevestigingsvragen', async ({ page }) => {
      await metSlot(page);
      await page.reload();
      await expect(page.locator('#slot .cijferblok')).toBeVisible();
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await expect(page.getByRole('button', { name: 'Gebruik je herstelcode' })).toBeVisible();
      await foto(page, 'kwijt', maat);
      await meet(page, '#slot .slot__kwijt', 'kolom', 'Je code niet meer weten');
      await page.getByRole('button', { name: 'Gebruik je herstelcode' }).click();
      await expect(page.locator('.herstel__veld')).toBeVisible();
      await foto(page, 'invoer', maat);
      await meet(page, '#slot .slot__kwijt', 'enkel', 'herstelcode ingeven');
      await page.getByRole('button', { name: 'Terug' }).click();
      await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
      await expect(page.getByRole('button', { name: 'Doorgaan' })).toBeVisible();
      await foto(page, 'wis1', maat);
      await meet(page, '#slot .slot__kwijt', 'enkel', 'wissen, eerste vraag');
      await page.getByRole('button', { name: 'Doorgaan' }).click();
      await expect(page.getByRole('button', { name: 'Laten staan' })).toBeVisible();
      await foto(page, 'wis2', maat);
      await meet(page, '#slot .slot__kwijt', 'enkel', 'wissen, laatste vraag');
    });

    // BESLISSING 631: op een toestel dat niet kan bevestigen, zegt de knop dat wissen hier niet kan; Terug staat er alleen, gevuld en gecentreerd.
    test('Alles wissen kan hier niet (een toestel zonder Face ID, vingerafdruk of schermslot)', async ({ page }) => {
      await authenticator(page, 'geen');
      await page.goto('./#/meer/vergrendeling');
      await schermKlaar(page, '#/meer/vergrendeling');
      await SLOT(page).click();
      await tik(page, CODE);
      await tik(page, CODE);
      await rondAf(page);
      await expect(SLOT(page)).toHaveAttribute('aria-checked', 'true');
      await page.reload();
      await expect(page.locator('#slot .cijferblok')).toBeVisible();
      await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
      await page.getByRole('button', { name: 'Alles wissen en opnieuw beginnen' }).click();
      await expect(page.getByRole('heading', { name: 'Alles wissen kan hier niet' })).toBeVisible();
      await foto(page, 'wis-kan-niet', maat);
      await meet(page, '#slot .slot__kwijt', 'enkel', 'wissen kan hier niet');
    });
  });
}

// De kaarthoogte van het welkomscherm (stap 4), ook met het cijferblok en de herstelcode open.
for (const maat of [...MATEN, [412, 915]]) {
  const [breed, hoog] = maat;
  test.describe(`welkom ${breed}x${hoog}`, () => {
    test.use({ storageState: LEEG, ...(breed === 412 ? ANDROID : { viewport: { width: breed, height: hoog } }) });
    test.beforeEach(async ({ page }) => vasteKlok(page));

    test('de kaarthoogte, ook met het cijferblok en de herstelcode open', async ({ page }) => {
      await authenticator(page, 'ok');
      await page.goto('./');
      await expect(page).toHaveURL(/#\/welkom$/);
      const kaart = () => page.locator('.welkom__kaart').evaluate((e) => Math.round(e.getBoundingClientRect().height));
      const klaar = async (waar) => {
        await animatiesKlaar(page);
        expect.soft(await kaart(), `kaarthoogte ${waar}`).toBe(KAART[`${breed}x${hoog}`]);
      };
      await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
      await klaar('stap 1');
      for (const n of [2, 3, 4]) {
        await page.locator('.welkom__knoppen .knop--primair').click();
        await expect(page.getByText(`Stap ${n} van 4`)).toBeVisible();
        await klaar(`stap ${n}`);
      }
      await page.locator('.welkom__knoppen .knop--primair').click();
      await expect(page.locator('.welkom .cijferblok')).toBeVisible();
      await klaar('cijferblok');
      await tik(page, CODE);
      await tik(page, CODE);
      await expect(stap(page)).toBeVisible();
      await klaar('herstelcode');
      await stap(page).getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
      await foto(page, 'welkom-herstelcode', maat);
      await meet(page, '[data-herstelstap]', 'enkel', 'herstelcode bewaren (welkom)');
    });
  });
}

test.describe('Android: de naam op Je code niet meer weten', () => {
  test.use(ANDROID);
  test.beforeEach(async ({ page }) => vasteKlok(page));
  test('Bevestig met je vingerafdruk of schermslot: even breed, gecentreerd, niets afgekapt', async ({ page }) => {
    await metSlot(page);
    await page.reload();
    await expect(page.locator('#slot .cijferblok')).toBeVisible();
    await page.getByRole('button', { name: 'Ik ken mijn code niet meer' }).click();
    await expect(page.getByRole('button', { name: 'Bevestig met je vingerafdruk of schermslot' })).toBeVisible();
    await foto(page, 'kwijt-android', [412]);
    await meet(page, '#slot .slot__kwijt', 'kolom', 'Android: Je code niet meer weten');
  });
});
