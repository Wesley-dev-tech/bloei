// BESLISSING 704, 715 en 721: de app opent op Vandaag, bovenaan. Na het slot begint ze op Vandaag en niet op het scherm of de plaats van de
// vorige keer; de grens NAAR_VANDAAG_NA_MS (src/app.js) is 0, dus ook na een seconde weg. In de geinstalleerde app (standalone) geldt het ook
// zonder slot bij terugkeer uit de achtergrond; in een gewoon browsertabblad blijft het scherm staan. Een gewone herlading (zonder slot) houdt
// het scherm (721). Een gekozen adres (een tik op een melding, een bladwijzer, een adres gekozen tijdens het opstarten) gaat voor; een venster
// met onbewaarde invoer en een systeemvenster van de app (vrijstelling.js) beschermen het werk. Elk moment uit de opdracht heeft hier een test.
// Draait in Chrome (de gewone ronde) en kan ook in WebKit: zie het rapport (een eigen config met testMatch op dit bestand en browserName webkit).
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';
import { readFileSync } from 'node:fs';

// De grens uit src/app.js (die module zelf kan niet in Node geladen worden: ze tekent schermen). Een uitdrukking als 60 * 1000 wordt uitgerekend.
const bron = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
const NAAR_VANDAAG_NA_MS = bron
  .match(/export const NAAR_VANDAAG_NA_MS = ([\d\s*]+);/)[1]
  .split('*')
  .reduce((a, b) => a * Number(b.trim()), 1);
const CODE = '123456';
const LANG = NAAR_VANDAAG_NA_MS + 60 * 1000; // ruim langer dan de grens
const KORT = 1000; // een blik van een seconde: bij grens 0 ook Vandaag

// Een verschuifbare klok die een herlading overleeft: Date.now() loopt op met sessionStorage '__verschil'. '__volgende' telt pas bij de
// volgende laadbeurt mee, zodat de tijd waarop de pagina verlaten werd nog met de oude klok bewaard wordt.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      const volgende = Number(sessionStorage.getItem('__volgende') || 0);
      if (volgende) {
        sessionStorage.setItem('__verschil', String(Number(sessionStorage.getItem('__verschil') || 0) + volgende));
        sessionStorage.removeItem('__volgende');
      }
      const echt = Date.now.bind(Date);
      Date.now = () => echt() + Number(sessionStorage.getItem('__verschil') || 0);
    } catch {
      /* about:blank */
    }
  });
});

const schuif = (page, ms) => page.evaluate((v) => sessionStorage.setItem('__verschil', String(Number(sessionStorage.getItem('__verschil') || 0) + v)), ms);
const schuifBijVolgendeLaadbeurt = (page, ms) => page.evaluate((v) => sessionStorage.setItem('__volgende', String(v)), ms);
const scherm = (page) => page.locator('#scherm');
const y = (page) => page.evaluate(() => Math.round(window.scrollY));

async function tik(page, code) {
  for (const cijfer of code) await page.locator(`.cijferblok__toets[data-cijfer="${cijfer}"]`).click();
}

async function zetZichtbaarheid(page, staat) {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, staat);
}

async function zetSlotAan(page) {
  await page.goto('./#/meer/vergrendeling');
  await page.getByRole('switch', { name: /^Bloei vergrendelen/ }).click();
  await tik(page, CODE);
  await tik(page, CODE);
  const stap = page.locator('[data-herstelstap]');
  await stap.getByRole('checkbox', { name: 'Ik heb ze bewaard' }).click();
  await stap.getByRole('button', { name: 'Verder' }).click();
  await expect(page.getByRole('switch', { name: /^Bloei vergrendelen/ })).toHaveAttribute('aria-checked', 'true');
}

async function ontgrendel(page) {
  await expect(page.locator('.cijferblok')).toBeVisible();
  await tik(page, CODE);
  await expect(page.locator('#tabbalk')).toBeVisible();
  await expect(page.locator('#slot')).toBeHidden();
}

// Op een scherm, een eind naar beneden gescrold, met de stand vastgelegd.
async function opScherm(page, route, naar = 600) {
  await page.goto('./#/' + route);
  await expect(scherm(page)).toHaveAttribute('data-scherm', route);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(naar);
  await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), naar);
  await expect.poll(() => y(page)).toBe(naar);
  await page.waitForTimeout(250); // de stand gaat met een kleine vertraging in history.state (src/kern/scroll.js)
}

async function opVandaagBovenaan(page) {
  await expect(page).toHaveURL(/#\/vandaag$/);
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'vandaag');
  await expect(page.locator('#tabbalk a[aria-current="page"]')).toHaveText(new RegExp(TEKSTEN.tab.vandaag));
  await page.waitForTimeout(600); // een vastgehouden stand zou nu al teruggezet zijn
  expect(await y(page)).toBe(0);
}

// ---- a en b: een verse start ----

test('a: een verse start op het kale adres opent Vandaag, bovenaan', async ({ page }) => {
  await page.goto('./');
  await opVandaagBovenaan(page);
});

test('b: een nieuwe navigatie naar een gekozen adres (bladwijzer, een tik op een melding die de app opent) opent dat scherm, bovenaan', async ({ page }) => {
  await page.goto('./#/meer/profiel');
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer/profiel');
  expect(await y(page)).toBe(0);
  // De paden van de meldingen (src/meldingen/tekst.js): Drinken en Supplementen.
  const tweede = await page.context().newPage();
  await tweede.goto('./#/drinken');
  await expect(tweede.locator('#scherm')).toHaveAttribute('data-scherm', 'drinken');
  await tweede.close();
});

// ---- c: herladen in hetzelfde tabblad ----

// BESLISSING 721: herladen is niet opnieuw openen. Deze tests leggen het scherm vast (de hoogte na een herlading beslist de eigenaar niet hier).
test('c: herladen na een seconde (F5, omlaag trekken, Herladen bij een nieuwe versie) houdt het scherm', async ({ page }) => {
  expect(NAAR_VANDAAG_NA_MS).toBe(0);
  await opScherm(page, 'meer');
  await schuifBijVolgendeLaadbeurt(page, KORT);
  await page.reload();
  await expect(page).toHaveURL(/#\/meer$/);
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
});

test('c: herladen na een tijd weg houdt ook het scherm, zonder extra stap in de geschiedenis', async ({ page }) => {
  await opScherm(page, 'meer');
  const lengte = await page.evaluate(() => history.length);
  await schuifBijVolgendeLaadbeurt(page, LANG);
  await page.reload();
  await expect(page).toHaveURL(/#\/meer$/);
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  expect(await page.evaluate(() => history.length)).toBe(lengte);
});

test('c: terug in de geschiedenis naar Bloei (een andere pagina ertussen) houdt het scherm', async ({ page }) => {
  await opScherm(page, 'meer');
  await page.goto('about:blank');
  await page.goBack();
  await expect(page).toHaveURL(/#\/meer$/);
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
});

test('c: een verse start op een adres (dezelfde pagina opnieuw geopend met een hash) opent dat adres', async ({ page }) => {
  await opScherm(page, 'meer');
  await schuifBijVolgendeLaadbeurt(page, LANG);
  await page.goto('about:blank');
  await page.goto('./#/meer');
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
});

test('c: een verse start op het kale adres na een scherm: Vandaag, bovenaan', async ({ page }) => {
  await opScherm(page, 'meer');
  await page.goto('about:blank');
  await page.goto('./');
  await opVandaagBovenaan(page);
});

test('c: de herlading laat niets achter in sessionStorage', async ({ page }) => {
  await opScherm(page, 'meer');
  await page.reload();
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  const sleutels = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => !k.startsWith('__')));
  expect(sleutels.filter((k) => k.endsWith('verlaten'))).toEqual([]);
});

test('c: het welkomscherm blijft bij een eerste start, ook na een herlading na een tijd', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('./');
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'welkom');
  await page.evaluate((v) => sessionStorage.setItem('__volgende', String(v)), LANG);
  await page.reload();
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'welkom');
  await context.close();
});

// ---- d: terug uit de achtergrond zonder slot ----

test('d: in een gewoon browsertabblad (niet geinstalleerd) blijft ze na de achtergrond waar ze was, ook na een tijd', async ({ page }) => {
  await opScherm(page, 'meer');
  await zetZichtbaarheid(page, 'hidden');
  await schuif(page, LANG);
  await zetZichtbaarheid(page, 'visible');
  await page.waitForTimeout(600);
  await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  expect(await y(page)).toBe(600);
});

// ---- d2: de geinstalleerde app zonder slot (BESLISSING 715) ----

test.describe('geinstalleerd, zonder slot', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  });

  test('d: terug uit de achtergrond na een seconde: Vandaag bovenaan, de ingang vervangen', async ({ page }) => {
    await opScherm(page, 'meer');
    await page.locator('#scherm .meer__menu').getByRole('button', { name: /^Drinken/ }).click();
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer/instellingen');
    const lengte = await page.evaluate(() => history.length);
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, KORT);
    await zetZichtbaarheid(page, 'visible');
    await opVandaagBovenaan(page);
    expect(await page.evaluate(() => history.length)).toBe(lengte);
  });

  test('d: een venster met onbewaarde invoer houdt alles zoals het was', async ({ page }) => {
    await page.goto('./#/supplementen');
    await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'Naam' }).fill('Half getypt');
    await zetZichtbaarheid(page, 'hidden');
    await zetZichtbaarheid(page, 'visible');
    await page.waitForTimeout(400);
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Naam' })).toHaveValue('Half getypt');
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'supplementen');
  });

  test('d: een blad zonder onbewaarde invoer gaat netjes dicht, zoals bij het slot, en ze staat op Vandaag', async ({ page }) => {
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await zetZichtbaarheid(page, 'hidden');
    await zetZichtbaarheid(page, 'visible');
    await opVandaagBovenaan(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('d: een systeemvenster van de app (bestandskiezer) dat openstond: ze blijft waar ze was', async ({ page }) => {
    await opScherm(page, 'meer');
    await page.evaluate(() => {
      const invoer = document.createElement('input');
      invoer.type = 'file';
      invoer.id = 'proefkiezer';
      invoer.style.cssText = 'position:fixed;top:80px;left:10px;z-index:9999;width:200px;height:40px';
      document.body.append(invoer);
    });
    const [kiezer] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#proefkiezer').click()]);
    await zetZichtbaarheid(page, 'hidden');
    await kiezer.setFiles([]);
    await zetZichtbaarheid(page, 'visible');
    await page.waitForTimeout(600);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  });

  test('d: een tik op een melding terwijl ze weg was (een ander adres) gaat voor', async ({ page }) => {
    await opScherm(page, 'meer');
    await zetZichtbaarheid(page, 'hidden');
    await page.evaluate(() => (window.location.hash = '#/drinken'));
    await zetZichtbaarheid(page, 'visible');
    await page.waitForTimeout(600);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'drinken');
  });

  test('d: terug via pageshow zonder visibilitychange (de pagina uit de cache) opent ook Vandaag', async ({ page }) => {
    await opScherm(page, 'meer');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await opVandaagBovenaan(page);
  });

  test('d: met het slot aan: een keer naar Vandaag, zonder flits van het oude scherm', async ({ page }) => {
    await zetSlotAan(page);
    await opScherm(page, 'meer');
    await page.evaluate(() => {
      window.__schermen = [];
      new MutationObserver(() => window.__schermen.push(document.getElementById('scherm').dataset.scherm)).observe(document.getElementById('scherm'), {
        attributes: true,
        attributeFilter: ['data-scherm'],
      });
    });
    await zetZichtbaarheid(page, 'hidden');
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await opVandaagBovenaan(page);
    expect(await page.evaluate(() => window.__schermen)).toEqual(['vandaag']);
  });
});

// ---- e: het slot ----

test.describe('met het slot', () => {
  test.beforeEach(async ({ page }) => {
    await zetSlotAan(page);
  });

  test('e: het slot na een tijd: Vandaag bovenaan, de ingang vervangen; een tabblad daarna begint bovenaan', async ({ page }) => {
    await opScherm(page, 'meer', 400);
    await page.locator('#scherm .meer__menu').getByRole('button', { name: /^Drinken/ }).click();
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer/instellingen');
    const lengte = await page.evaluate(() => history.length);
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, LANG);
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await opVandaagBovenaan(page);
    expect(await page.evaluate(() => history.length)).toBe(lengte);
    await expect(page).toHaveTitle(new RegExp(`^${TEKSTEN.tab.vandaag}`));
    // De herkomst van het vorige bezoek is weg: het tabblad Algemeen is vooruit en begint bovenaan.
    await page.locator('#tabbalk a[href="#/meer"]').click();
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
    await page.waitForTimeout(600);
    expect(await y(page)).toBe(0);
  });

  test('e: het slot na een tijd terwijl ze al op Vandaag was: Vandaag, bovenaan', async ({ page }) => {
    await opScherm(page, 'vandaag', 400);
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, LANG);
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await opVandaagBovenaan(page);
  });

  test('e: het slot na een seconde (even een andere app): ook Vandaag bovenaan (grens 0)', async ({ page }) => {
    await opScherm(page, 'meer');
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, KORT);
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await opVandaagBovenaan(page);
  });

  test('e: een venster met onbewaarde invoer blijft na een tijd staan, met het scherm eronder', async ({ page }) => {
    await page.goto('./#/supplementen');
    await page.getByRole('button', { name: /supplement toevoegen$/i }).first().click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'Naam' }).fill('Half getypt');
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, LANG);
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Naam' })).toHaveValue('Half getypt');
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'supplementen');
    await page.getByRole('dialog').getByRole('button', { name: 'Annuleren' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Niet bewaren' }).click();
  });

  test('e: een systeemvenster van de app (bestandskiezer) dat afliep terwijl ze weg was: na een tijd blijft ze waar ze was', async ({ page }) => {
    await opScherm(page, 'meer');
    await page.evaluate(() => {
      const invoer = document.createElement('input');
      invoer.type = 'file';
      invoer.id = 'proefkiezer';
      invoer.style.cssText = 'position:fixed;top:80px;left:10px;z-index:9999;width:200px;height:40px';
      document.body.append(invoer);
    });
    const [kiezer] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#proefkiezer').click()]);
    await zetZichtbaarheid(page, 'hidden');
    await expect(page.locator('#slot')).toBeHidden(); // vrijgesteld: het slot blijft open
    await kiezer.setFiles([]);
    await page.evaluate(() => document.getElementById('proefkiezer').dispatchEvent(new Event('cancel')));
    // De vrijstelling loopt af terwijl de pagina nog verborgen is: het slot gaat alsnog dicht (slot.js, gemist).
    await expect(page.locator('#slot')).toBeVisible({ timeout: 5000 });
    await schuif(page, LANG);
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  });

  // ---- f: een tik op een melding ----
  test('f: een tik op een melding achter het slot (een ander adres) gaat voor, ook na een tijd', async ({ page }) => {
    await opScherm(page, 'meer');
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, LANG);
    await page.evaluate(() => (window.location.hash = '#/drinken'));
    await zetZichtbaarheid(page, 'visible');
    await ontgrendel(page);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'drinken');
  });

  // ---- g: een handeling die op het scherm Uitleg gestart werd ----
  test('g: een handeling uit Uitleg die openstaat als het slot na een tijd dichtgaat: de uitleg is dicht en ze staat op Vandaag', async ({ page }) => {
    await page.goto('./#/meer/uitleg');
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer/uitleg');
    const knop = page.getByRole('button', { name: new RegExp(`^${TEKSTEN.uitleg.toonHet}: `) }).nth(3);
    await knop.scrollIntoViewIfNeeded();
    await knop.click();
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toBeVisible({ timeout: 10000 });
    await zetZichtbaarheid(page, 'hidden');
    await schuif(page, LANG);
    await zetZichtbaarheid(page, 'visible');
    // Een blad dat de handeling opende en waar niets in getypt is, gaat dicht bij het slot.
    await ontgrendel(page);
    await opVandaagBovenaan(page);
    await expect(page.locator('.uitleg__kaart[role="dialog"]')).toHaveCount(0);
  });

  test('e: een adres dat gekozen wordt terwijl het slot bij het opstarten de code vraagt (een tik op een melding), gaat voor', async ({ page }) => {
    await page.goto('./#/meer');
    await page.reload();
    await expect(page.locator('.cijferblok')).toBeVisible();
    await page.evaluate(() => (window.location.hash = '#/drinken'));
    await ontgrendel(page);
    await expect(page).toHaveURL(/#\/drinken$/);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'drinken');
  });

  test('e: een verse start met een adres en het slot aan (een tik op een melding die de app opent): na de code dat adres', async ({ page }) => {
    await page.goto('./#/meer');
    await page.goto('about:blank');
    await page.goto('./#/drinken');
    await ontgrendel(page);
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'drinken');
  });

  test('e: het slot bij een herlading, kort of na een tijd: na de code Vandaag', async ({ page }) => {
    await page.goto('./#/meer');
    await schuifBijVolgendeLaadbeurt(page, KORT);
    await page.reload();
    await ontgrendel(page);
    await opVandaagBovenaan(page);
    await page.goto('./#/meer');
    await schuifBijVolgendeLaadbeurt(page, LANG);
    await page.reload();
    await ontgrendel(page);
    await opVandaagBovenaan(page);
  });
});

// ---- h: de demo ----
test.describe('de demo', { tag: '@demo' }, () => {
  test('h: een nieuw bezoek opent Vandaag; herladen na een tijd houdt het scherm (721)', async ({ page }) => {
    await page.goto('./?app=bloei-demo');
    await opVandaagBovenaan(page);
    await page.goto('./?app=bloei-demo#/meer');
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
    await schuifBijVolgendeLaadbeurt(page, LANG);
    await page.reload();
    await expect(scherm(page)).toHaveAttribute('data-scherm', 'meer');
  });
});
