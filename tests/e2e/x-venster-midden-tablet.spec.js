// BESLISSINGEN 711, 717 en 718: op de staande tablet (720 tot 959 px breed, hoger dan 500 px) staat elk venster van de app in het midden van de pagina,
// horizontaal en verticaal, met vier ronde hoeken, zoals vanaf 960 px; nooit meer een blad tegen de onderkant. Een venster dat hoger is dan het scherm
// blijft binnen het scherm met een gelijke marge boven en onder en scrolt binnenin. De telefoon (onder 720 px en liggend tot 500 px hoog) verandert niet.
// De regel staat in src/stijl/componenten.css (de .dialoog). Draait tegen de gebouwde app; stijl.html zit in elke testbouw (playwright.config.js).
// Verzonnen supplementen: Multivitamine, Kurkuma.
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';

const meet = (page) =>
  page.evaluate(() => {
    const d = [...document.querySelectorAll('dialog[open]')].pop();
    const r = d.getBoundingClientRect();
    const s = getComputedStyle(d);
    return {
      boven: r.top, onder: innerHeight - r.bottom, links: r.left, rechts: innerWidth - r.right, b: r.width, h: r.height, vh: innerHeight,
      hoeken: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat),
      kanScrollen: ['auto', 'scroll'].includes(s.overflowY) || [...d.querySelectorAll('*')].some((e) => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)),
    };
  });

async function zaaiSupplement(page) {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction(['supplementen'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('supplementen').put({ id: 1, naam: 'Multivitamine', hoeveelheid: '1 tablet', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['ochtend'], dosis: '', volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => (db.close(), klaar());
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
}

// Elk soort venster van de app: de bladen van blad() (maaltijd, streefgewicht met een invoerveld, weegdag, medaille), een bevestigvraag, de supplementkaart,
// de wisdialoog "Profiel verwijderen" en de dialoog "Lijst overnemen".
const VENSTERS = {
  'het blad van een maaltijd': async (page) => {
    await page.goto('./#/dagboek');
    await page.locator('.maaltijd[data-soort="ontbijt"] > .rij').click();
  },
  'het blad Streefgewicht': async (page) => {
    await page.goto('./#/gewicht');
    await page.getByRole('button', { name: 'Streefgewicht zetten' }).click();
  },
  'het blad Weegdag': async (page) => {
    await page.goto('./#/gewicht');
    await page.getByRole('button', { name: 'Weegdag aanpassen' }).click();
  },
  'het blad van een medaille': async (page) => {
    await page.goto('./#/meer/badges');
    await page.locator('.medaillekaart').first().click();
  },
  'de wisdialoog Profiel verwijderen': async (page) => {
    await page.goto('./#/meer');
    await page.locator('.over').getByRole('button', { name: 'Profiel verwijderen' }).click();
  },
  'een bevestigvraag': async (page) => {
    await page.goto('./stijl.html');
    await page.getByRole('button', { name: 'Dialoog openen' }).click();
  },
  'de supplementkaart': async (page) => {
    await page.goto('./stijl.html');
    await page.getByRole('button', { name: 'Open supplementkaart (nieuw)' }).click();
  },
  'de dialoog Lijst overnemen': async (page) => {
    await zaaiSupplement(page);
    await page.goto('./?opnieuw#/supplementen');
    const knop = page.locator('[data-lijstbestand="overnemen"]');
    await knop.waitFor();
    const kiezer = page.waitForEvent('filechooser');
    await knop.click();
    const tekst = JSON.stringify({ soort: 'bloei-supplementenlijst', versie: 1, supplementen: [{ naam: 'Kurkuma', hoeveelheid: '1 capsule', aanwijzing: '', ritme: { soort: 'dagelijks' }, momenten: ['avond'] }] });
    await (await kiezer).setFiles({ name: 'lijst.json', mimeType: 'application/json', buffer: Buffer.from(tekst, 'utf8') });
  },
};

async function open(page, naam) {
  await VENSTERS[naam](page);
  await expect(page.locator('dialog[open]').last()).toBeVisible();
  await animatiesKlaar(page);
  return meet(page);
}

test.describe('717 en 718: elk venster in het midden op de staande tablet', () => {
  for (const [breed, hoog] of [[768, 1024], [820, 1180]]) {
    for (const naam of Object.keys(VENSTERS)) {
      test(`${breed} x ${hoog}: ${naam}`, async ({ page }) => {
        await page.setViewportSize({ width: breed, height: hoog });
        const m = await open(page, naam);
        expect(Math.abs(m.links - m.rechts), 'horizontaal in het midden').toBeLessThanOrEqual(1);
        expect(m.onder, 'niet tegen de onderkant').toBeGreaterThan(0);
        expect(Math.abs(m.boven - m.onder), 'verticaal in het midden').toBeLessThanOrEqual(1);
        for (const r of m.hoeken) expect(r, 'vier ronde hoeken').toBeGreaterThan(0);
        // dezelfde breedte als vanaf 960 px: 480 px, de supplementkaart 640 px
        expect(Math.round(m.b)).toBe(naam === 'de supplementkaart' ? 640 : 480);
      });
    }
  }

  // Een venster dat hoger is dan het scherm: binnen het scherm, gelijke marge boven en onder, en de inhoud scrolt binnenin (een lage tablet).
  test('een lang venster op een lage tablet (800 x 560): binnen het scherm, gelijke marge, scrolt binnenin', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 560 });
    const m = await open(page, 'de supplementkaart');
    expect(m.boven).toBeGreaterThan(0);
    expect(m.onder).toBeGreaterThan(0);
    expect(Math.abs(m.boven - m.onder)).toBeLessThanOrEqual(1);
    expect(m.h).toBeLessThan(m.vh);
    expect(m.kanScrollen).toBe(true);
  });

  // De telefoon blijft zoals goedgekeurd (BESLISSING 421): staand een kadertje iets boven het midden met 16 px opzij, liggend ook.
  for (const [breed, hoog] of [[390, 844], [844, 390]]) {
    test(`${breed} x ${hoog}: de telefoon blijft het kadertje iets boven het midden`, async ({ page }) => {
      await page.setViewportSize({ width: breed, height: hoog });
      const m = await open(page, 'de wisdialoog Profiel verwijderen');
      expect(m.onder).toBeGreaterThan(m.boven);
      expect(m.boven).toBeGreaterThanOrEqual(16);
    });
  }
});
