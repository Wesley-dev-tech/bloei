// Het scherm Profiel (Naam en profielfoto) in Safari en in Chrome: de kolom met "Je naam" en haar uitleg, en het naamveld, hebben in beide motoren dezelfde maat.
// In WebKit stond het naamveld op 263 px tegenover 216 px in Chrome (1280 x 800) en 242 tegen 192 px (820 x 1180 en 844 x 390): het veld had geen vaste breedte
// (width: 100% in een flex-item), en de eigen breedte van een invoerveld is per motor anders. De tekstkolom werd er smaller van, de uitleg brak op twee regels en de rij werd hoger.
// Het herstel is een vaste breedte van 12rem voor het naamveld vanaf 720 px (scherm-algemeen.css).
// Draait in de gewone ronde (Chromium) en in WebKit: PW_POORT=4791 PW_OUTDIR=<eigen map> npx playwright test -c playwright.safari.config.js x-safari-profiel
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
          const tx = db.transaction(['instellingen'], 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Sofie' });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
  await page.goto('./?opnieuw#/meer/profiel');
  await page.locator('.instellingen__profiel .profiel__naam input').waitFor();
}

const meet = (page) =>
  page.evaluate(() => {
    const rij = document.querySelector('.instellingen__profiel .rij:has(.profiel__naam)');
    const m = (e) => {
      const r = e.getBoundingClientRect();
      return { b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    return { rij: m(rij), tekst: m(rij.querySelector('.rij__tekst')), sub: m(rij.querySelector('.rij__sub')), veld: m(rij.querySelector('.profiel__naam input')) };
  });

// De maten die in Chrome zijn goedgekeurd: [breedte, hoogte, tekstkolom, hoogte uitleg, veld]. Op 390 x 660 staat het veld onder de tekst, over de breedte.
const MATEN = [
  [390, 660, 254, 19.6, 310],
  [844, 390, 368, 19.6, 192],
  [820, 1180, 368, 19.6, 192],
  [1280, 800, 225.6, 19.8, 216],
];

test.describe('Profiel in Safari en Chrome', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('de tekstkolom en het naamveld hebben de goedgekeurde maten van Chrome en de uitleg staat op een regel', async ({ page }) => {
    await zaai(page);
    for (const [b, h, tekst, sub, veld] of MATEN) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meet(page);
      expect(Math.abs(m.tekst.b - tekst), `${b}x${h}: tekstkolom ${m.tekst.b}`).toBeLessThan(1);
      expect(Math.abs(m.sub.h - sub), `${b}x${h}: uitleg ${m.sub.h} hoog (een regel is ${sub})`).toBeLessThan(1);
      expect(Math.abs(m.veld.b - veld), `${b}x${h}: naamveld ${m.veld.b}`).toBeLessThan(1);
    }
  });

  test('de maten blijven gelijk bij het wisselen van venstermaat zonder herladen, in beide richtingen', async ({ page }) => {
    await zaai(page);
    for (const [b, h, tekst, , veld] of [...MATEN, ...[...MATEN].reverse()]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meet(page);
      expect(Math.abs(m.tekst.b - tekst), `${b}x${h}: tekstkolom ${m.tekst.b}`).toBeLessThan(1);
      expect(Math.abs(m.veld.b - veld), `${b}x${h}: naamveld ${m.veld.b}`).toBeLessThan(1);
    }
  });
});
