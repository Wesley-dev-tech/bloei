// Het scherm Drinken in Safari en in Chrome: het glas bovenaan houdt zijn verhouding (120 x 196) in beide motoren.
// Vanaf 960 px stond het glas in WebKit op 85,7 x 260 tegenover 159,2 x 260 in Chrome (1280 x 800): de breedte kwam uit de gerekte hoogte (align-self: stretch), wat WebKit niet doet.
// Het herstel is height: 100% (in plaats van auto) met contain: size; Chrome verandert er niet door.
// Draait in de gewone ronde (Chromium) en in WebKit: PW_POORT=4671 PW_OUTDIR=<eigen map> npx playwright test -c playwright.safari.config.js
// Verzonnen naam: Sofie.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';

async function zaai(page) {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction(['instellingen', 'dranken'], 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Sofie' });
          const d = tx.objectStore('dranken');
          d.clear();
          const nu = new Date();
          const t2 = (x) => String(x).padStart(2, '0');
          const vandaag = `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`;
          for (let i = 0; i < 4; i++) d.add({ datum: vandaag, tijdstip: nu.getTime() - (4 - i) * 60000, soort: 'water', ml: 200, voorbeeld: false });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.goto('./?opnieuw#/drinken');
  await page.locator('.drinken .watervulling').first().waitFor();
}

const meetGlas = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('.drinken .watervulling').getBoundingClientRect();
    return { b: g.width, h: g.height };
  });

const MATEN = [[320, 480], [360, 560], [390, 660], [820, 1180], [960, 700], [1280, 800], [1440, 900], [1690, 1230]];

test.describe('Drinken in Safari en Chrome', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('het glas bovenaan houdt zijn verhouding op elke maat', async ({ page }) => {
    await zaai(page);
    for (const [b, h] of MATEN) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meetGlas(page);
      expect(Math.abs(m.b - (m.h * 120) / 196), `${b}x${h}: glas ${m.b} x ${m.h}`).toBeLessThan(1);
      expect(m.h, `${b}x${h}: het glas is hoog genoeg`).toBeGreaterThanOrEqual(140);
    }
  });

  test('het glas houdt zijn verhouding bij het wisselen van venstermaat zonder herladen, in beide richtingen', async ({ page }) => {
    await zaai(page);
    const volgorde = [...MATEN, ...[...MATEN].reverse()];
    for (const [b, h] of volgorde) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meetGlas(page);
      expect(Math.abs(m.b - (m.h * 120) / 196), `${b}x${h}: glas ${m.b} x ${m.h}`).toBeLessThan(1);
    }
  });

  test('de goedgekeurde maten van Chrome blijven: 159,2 x 260 op 1280 x 800 en 157,2 x 256,8 op 1440 x 900', async ({ page }) => {
    await zaai(page);
    for (const [b, h, gb, gh] of [[1280, 800, 159.2, 260], [1440, 900, 157.2, 256.8]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meetGlas(page);
      expect(Math.abs(m.b - gb), `${b}x${h}: breedte ${m.b}`).toBeLessThan(0.6);
      expect(Math.abs(m.h - gh), `${b}x${h}: hoogte ${m.h}`).toBeLessThan(0.6);
    }
  });
});
