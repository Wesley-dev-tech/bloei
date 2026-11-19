// BESLISSING 465: wie teruggaat naar een scherm komt terug op de plaats waar hij was (scrollstand en focus), op elk formaat:
// iPhone (staand en liggend), iPad (staand en liggend), desktop met zijbalk en Android. Vooruit begint een scherm bovenaan.
// Het venster scrolt op elk formaat (#scherm en de zijbalk hebben geen eigen scroll); de test controleert dat per formaat.
// Elk scenario meet de afwijking in px (SCROLL-METING op de console, voor het rapport) en dat het scherm bij de eerste verf al staat.
import { test, expect, devices } from '@playwright/test';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';
import { zaaiAlgemeen } from './r-algemeen-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { domRustig, schermKlaar } from './wacht.js';

const PIXEL = devices['Pixel 7'];
const MET_AANRAKING = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { isMobile: false, hasTouch: false, deviceScaleFactor: 1 };
// [naam, opties, heeft zijbalk]
const FORMATEN = [
  ['iPhone 390x844', { viewport: { width: 390, height: 844 }, ...MET_AANRAKING }],
  ['iPhone klein 360x740', { viewport: { width: 360, height: 740 }, ...MET_AANRAKING }],
  ['iPhone liggend 844x390', { viewport: { width: 844, height: 390 }, ...MET_AANRAKING }],
  ['iPad staand 820x1180', { viewport: { width: 820, height: 1180 }, ...MET_AANRAKING }],
  ['iPad liggend 1180x820', { viewport: { width: 1180, height: 820 }, ...MET_AANRAKING }],
  ['Desktop 1280x800', { viewport: { width: 1280, height: 800 }, ...DESKTOP }],
  ['Desktop 1690x1230', { viewport: { width: 1690, height: 1230 }, ...DESKTOP }],
  ['Android Pixel 7', { userAgent: PIXEL.userAgent, viewport: PIXEL.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
];

const scrollY = (page) => page.evaluate(() => Math.round(document.scrollingElement.scrollTop));
const meld = (naam, scenario, afw) => console.log(`SCROLL-METING | ${naam} | ${scenario} | afwijking ${afw} px`);

async function tik(page, loc, aanraking) {
  if (aanraking) await loc.tap();
  else await loc.click();
}

// Neemt de eerste frames na een navigatie op: per frame welk scherm, de scrollhoogte en of de pagina al zichtbaar is.
async function startFrames(page) {
  await page.evaluate(() => {
    window.__frames = [];
    const lus = () => {
      const s = document.querySelector('#scherm');
      window.__frames.push({ scherm: s?.dataset.scherm || '', y: Math.round(document.scrollingElement.scrollTop), leeg: !s?.children.length });
      if (window.__frames.length < 400 && !window.__stopFrames) requestAnimationFrame(lus);
    };
    window.__stopFrames = false;
    requestAnimationFrame(lus);
  });
}
// Geen frame van het doelscherm (met inhoud) dat op een andere stand dan de gewenste staat: dus geen sprong van 0 naar de oude stand.
async function geenSprong(page, doelScherm, y) {
  await page.evaluate(() => (window.__stopFrames = true));
  const frames = await page.evaluate(() => window.__frames);
  const sprong = frames.filter((f) => f.scherm === doelScherm && !f.leeg && Math.abs(f.y - y) > 2);
  expect(sprong, `frames van ${doelScherm} die niet op ${y} stonden`).toEqual([]);
}

for (const [naam, opties] of FORMATEN) {
  test.describe(`terug naar je plaats: ${naam}`, () => {
    test.use(opties);
    const aanraking = Boolean(opties.hasTouch);

    test.beforeEach(async ({ page }) => {
      await vasteKlok(page);
    });

    async function openAlgemeen(page) {
      await page.goto('./#/vandaag');
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      await zaaiAlgemeen(page, 'vol', ALLE_BADGES.map((b) => b.id));
      await page.goto('./#/meer');
      await schermKlaar(page, 'meer');
    }

    // Scrolt zo dat het element midden in het venster staat; geeft de stand.
    async function scrolNaar(page, loc) {
      await loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + r.top - window.innerHeight / 2)), behavior: 'instant' });
      });
      await page.evaluate(() => new Promise((k) => requestAnimationFrame(() => requestAnimationFrame(k))));
      await page.waitForTimeout(250); // de bewaarde stand in history.state (150 ms)
      return scrollY(page);
    }

    const drinkenRij = (page) => page.locator('#scherm .meer__menu').getByRole('button', { name: /^Drinken/ });
    const terugKnop = (page, naam = 'Algemeen') => page.locator('#scherm').getByRole('button', { name: new RegExp(naam) }).first();

    // Wat scrolt? Het venster; #scherm en de zijbalk niet.
    test('het venster scrolt, niet #scherm of de zijbalk', async ({ page }) => {
      await openAlgemeen(page);
      const y = await scrolNaar(page, drinkenRij(page));
      expect(y).toBeGreaterThan(50);
      const m = await page.evaluate(() => ({
        scherm: document.querySelector('#scherm').scrollTop,
        zij: document.querySelector('#zijbalk')?.scrollTop ?? 0,
        zijbalkZichtbaar: getComputedStyle(document.querySelector('#zijbalk')).display !== 'none',
        tabbalkZichtbaar: getComputedStyle(document.querySelector('#tabbalk')).display !== 'none',
        rest: history.scrollRestoration,
      }));
      expect(m.scherm).toBe(0);
      expect(m.zij).toBe(0);
      expect(m.zijbalkZichtbaar).not.toBe(m.tabbalkZichtbaar);
      expect(m.rest).toBe('manual');
      console.log(`SCROLL-METING | ${naam} | navigatie | ${m.zijbalkZichtbaar ? 'zijbalk' : 'tabbalk'}, scrolt: venster`);
    });

    for (const [doel, rijNaam, route] of [
      ['Drinken', 'Drinken', 'meer/instellingen'],
      ['Badges', 'Badges', 'meer/badges'],
    ]) {
      const rij = (page) => (doel === 'Drinken' ? drinkenRij(page) : page.locator('#scherm a.meer__actie[href="#/meer/badges"]').first());
      for (const hoe of ['terugknop Algemeen', 'browser terug']) {
        test(`Algemeen > ${doel} > ${hoe}: zelfde plaats, rij zichtbaar met focus`, async ({ page }) => {
          await openAlgemeen(page);
          const y = await scrolNaar(page, rij(page));
          expect(y).toBeGreaterThan(50);
          await tik(page, rij(page), aanraking);
          await expect(page).toHaveURL(new RegExp(route.replace('/', '\\/') + '$'));
          await schermKlaar(page, route);
          expect(await scrollY(page)).toBe(0); // vooruit: bovenaan
          await startFrames(page);
          if (hoe === 'terugknop Algemeen') await tik(page, terugKnop(page), aanraking);
          else await page.goBack();
          await expect(page).toHaveURL(/#\/meer$/);
          await schermKlaar(page, 'meer');
          const na = await scrollY(page);
          expect(Math.abs(na - y)).toBeLessThanOrEqual(2);
          await geenSprong(page, 'meer', y);
          const info = await page.evaluate(() => {
            const a = document.activeElement;
            const r = a.getBoundingClientRect();
            return { ingeBeeld: r.top >= 0 && r.bottom <= window.innerHeight, tekst: (a.textContent || '').trim().slice(0, 20), href: a.getAttribute('href') };
          });
          expect(info.ingeBeeld).toBe(true);
          if (doel === 'Drinken') expect(info.tekst).toMatch(/^Drinken/);
          else expect(info.href).toBe('#/meer/badges');
          meld(naam, `Algemeen>${doel}>${hoe}`, Math.abs(na - y));
        });
      }
    }

    // Een toetsenbordtest bestaat alleen op de formaten met muis en toetsenbord; op aanraakformaten wordt ze niet aangemaakt (geen overgeslagen test).
    if (!aanraking) {
      test('Algemeen > Drinken > terug met Tab + Enter en Alt+pijl-links (toetsenbord)', async ({ page }) => {
        await openAlgemeen(page);
        const y = await scrolNaar(page, drinkenRij(page));
        await drinkenRij(page).focus({ preventScroll: true });
        await page.keyboard.press('Enter');
        await schermKlaar(page, 'meer/instellingen');
        await page.goBack(); // Alt+pijl-links laat zich in Playwright niet nabootsen; dit is dezelfde geschiedenisstap
        await expect(page).toHaveURL(/#\/meer$/);
        await schermKlaar(page, 'meer');
        const na = await scrollY(page);
        expect(Math.abs(na - y)).toBeLessThanOrEqual(2);
        await expect(drinkenRij(page)).toBeFocused();
        meld(naam, 'Tab+Enter, Alt+pijl-links', Math.abs(na - y));
      });
    }

    test('Dagboek > Delen > terugknop Dagboek en browser terug: zelfde plaats', async ({ page }) => {
      for (const hoe of ['terugknop Dagboek', 'browser terug']) {
        await page.goto('./#/dagboek');
        await schermKlaar(page, 'dagboek');
        // Zeker scrollbaar, ook op een hoog venster (alleen onderaan extra ruimte).
        await page.evaluate(() => Object.assign(document.querySelector('#scherm').style, { paddingBottom: '1600px' }));
        const deelLink = page.locator('#scherm').getByRole('button', { name: /^Deze (dag|week|maand) delen/ });
        // De knop moet in beeld blijven (de tik scrolt de pagina dan niet): scroll tot hij net boven het midden staat, voor zover de pagina dat toelaat.
        await deelLink.evaluate((el) => window.scrollTo({ top: Math.max(0, Math.round(window.scrollY + el.getBoundingClientRect().top - 120)), behavior: 'instant' }));
        await page.waitForTimeout(250);
        const y = await scrollY(page);
        await tik(page, deelLink, aanraking);
        await schermKlaar(page, 'delen');
        expect(await scrollY(page)).toBe(0);
        await startFrames(page);
        if (hoe === 'terugknop Dagboek') await tik(page, terugKnop(page, 'Dagboek'), aanraking);
        else await page.goBack();
        await expect(page).toHaveURL(/#\/dagboek/);
        await schermKlaar(page, 'dagboek');
        const na = await scrollY(page);
        expect(Math.abs(na - y), hoe + ' na=' + na).toBeLessThanOrEqual(2);
        await geenSprong(page, 'dagboek', y);
        meld(naam, `Dagboek>Delen>${hoe}`, Math.abs(na - y));
      }
    });

    test('een pop-up openen en sluiten verandert de plaats niet en telt niet als terug', async ({ page }) => {
      await openAlgemeen(page);
      const wis = page.locator('#scherm').getByRole('button', { name: 'Profiel verwijderen' });
      const y = await scrolNaar(page, wis);
      await tik(page, wis, aanraking);
      await expect(page.locator('dialog[open]')).toBeVisible();
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(2);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.waitForTimeout(300);
      const na = await scrollY(page);
      expect(Math.abs(na - y)).toBeLessThanOrEqual(2);
      await expect(page).toHaveURL(/#\/meer$/);
      // Daarna vooruit en terug werkt nog gewoon
      const drink = drinkenRij(page);
      const y2 = await scrolNaar(page, drink);
      await tik(page, drink, aanraking);
      await schermKlaar(page, 'meer/instellingen');
      await page.goBack();
      await schermKlaar(page, 'meer');
      expect(Math.abs((await scrollY(page)) - y2)).toBeLessThanOrEqual(2);
      meld(naam, 'pop-up openen en sluiten', Math.abs(na - y));
    });

    test('vooruit naar een ander tabblad begint bovenaan', async ({ page }) => {
      await openAlgemeen(page);
      await scrolNaar(page, drinkenRij(page));
      const tab = page.locator('#tabbalk a[href="#/dagboek"]:visible, #zijbalk a[href="#/dagboek"]:visible').first();
      await tik(page, tab, aanraking);
      await schermKlaar(page, 'dagboek');
      expect(await scrollY(page)).toBe(0);
      // en terug naar Algemeen via het tabblad: een nieuw scherm, dus ook bovenaan
      const meerTab = page.locator('#tabbalk a[href="#/meer"]:visible, #zijbalk a[href="#/meer"]:visible').first();
      await tik(page, meerTab, aanraking);
      await schermKlaar(page, 'meer');
      expect(await scrollY(page)).toBe(0);
      meld(naam, 'vooruit naar ander tabblad', 0);
    });
  });
}
