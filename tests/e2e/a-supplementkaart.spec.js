// De supplementkaart (BESLISSINGEN 213 en 214): toevoegen, aanpassen, annuleren, Escape en een tik naast de kaart, weghalen, foutmeldingen, vanaf en tot,
// een periodiek ritme, focus, en op 390 en 360 px. De kaart wordt geopend vanaf de stijlpagina (stijl.html); alle namen zijn verzonnen.
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

async function start(page, supplementen = []) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (lijst) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          lijst.forEach((s, i) => tx.objectStore('supplementen').add({ dosis: '', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1, ...s }));
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    supplementen,
  );
  await page.goto('./stijl.html');
}

const lees = (page) =>
  page.evaluate(
    () =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const vraag = idb.transaction('supplementen').objectStore('supplementen').getAll();
          vraag.onsuccess = () => {
            idb.close();
            klaar(vraag.result);
          };
        };
      }),
  );

const kaart = (page) => page.locator('dialog.supplementkaart');
const openNieuw = (page) => page.getByRole('button', { name: 'Open supplementkaart (nieuw)' }).click();
const openBestaand = (page) => page.getByRole('button', { name: 'Open supplementkaart (bestaand)' }).click();

test('Nieuw: de focus staat in Naam, toevoegen bewaart in één keer en sluit de kaart; de focus keert terug', async ({ page }) => {
  await start(page);
  const opener = page.getByRole('button', { name: 'Open supplementkaart (nieuw)' });
  await opener.focus();
  await opener.click();
  await expect(kaart(page)).toBeVisible();
  await expect(kaart(page).getByRole('heading', { name: 'Supplement toevoegen' })).toBeVisible();
  await expect(kaart(page).getByLabel('Naam')).toBeFocused();
  await kaart(page).getByLabel('Naam').fill('Testkuur');
  await kaart(page).getByLabel('Hoeveelheid per keer').fill('2 capsules');
  await kaart(page).getByRole('button', { name: 'Middag' }).click();
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page)).toHaveCount(0);
  const [s] = await lees(page);
  expect(s).toMatchObject({ naam: 'Testkuur', hoeveelheid: '2 capsules', momenten: ['ochtend', 'middag'], ritme: { soort: 'dagelijks' } });
  await expect(opener).toBeFocused();
});

test('Bestaand: aanpassen en bewaren; de pagina erachter scrolt niet; geen style-attribuut', async ({ page }) => {
  await start(page, [{ naam: 'Oudekuur', hoeveelheid: '1 tablet' }]);
  await openBestaand(page);
  await expect(kaart(page).getByRole('heading', { name: 'Oudekuur' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/heeft-supplementkaart/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  expect(await kaart(page).locator('[style]').count()).toBe(0);
  await kaart(page).getByLabel('Naam').fill('Nieuwekuur');
  await kaart(page).getByLabel('Hoe neem je het').fill('oplossen in water');
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page)).toHaveCount(0);
  expect((await lees(page))[0]).toMatchObject({ naam: 'Nieuwekuur', aanwijzing: 'oplossen in water', hoeveelheid: '1 tablet' });
  await expect(page.locator('html')).not.toHaveClass(/heeft-supplementkaart/);
});

test('Annuleren, Escape en een tik naast de kaart: zonder wijzigingen meteen dicht, met wijzigingen eerst de vraag', async ({ page }) => {
  await start(page, [{ naam: 'Oudekuur', hoeveelheid: '1 tablet' }]);
  await openBestaand(page);
  await kaart(page).getByRole('button', { name: 'Annuleren' }).click();
  await expect(kaart(page)).toHaveCount(0);
  await openBestaand(page);
  await page.keyboard.press('Escape');
  await expect(kaart(page)).toHaveCount(0);
  await openBestaand(page);
  await page.mouse.click(5, 5); // naast de kaart
  await expect(kaart(page)).toHaveCount(0);

  // Met een wijziging: Escape stelt de vraag; Verder aanpassen houdt de kaart open, Niet bewaren sluit zonder te bewaren
  await openBestaand(page);
  await kaart(page).getByLabel('Naam').fill('Gewijzigd');
  await page.keyboard.press('Escape');
  await expect(kaart(page)).toContainText('Wijzigingen bewaren?');
  await kaart(page).getByRole('button', { name: 'Verder aanpassen' }).click();
  await expect(kaart(page)).toBeVisible();
  await expect(kaart(page)).not.toContainText('Wijzigingen bewaren?');
  await page.mouse.click(5, 5);
  await expect(kaart(page)).toContainText('Wijzigingen bewaren?');
  await kaart(page).getByRole('button', { name: 'Niet bewaren' }).click();
  await expect(kaart(page)).toHaveCount(0);
  expect((await lees(page))[0].naam).toBe('Oudekuur');
  // Wijzigingen bewaren? Bewaren
  await openBestaand(page);
  await kaart(page).getByLabel('Naam').fill('Bewaarkuur');
  await kaart(page).getByRole('button', { name: 'Sluiten' }).click();
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page)).toHaveCount(0);
  expect((await lees(page))[0].naam).toBe('Bewaarkuur');
});

test('Verwijderen vraagt een bevestiging in de kaart en haalt het supplement weg', async ({ page }) => {
  await start(page, [{ naam: 'Oudekuur', hoeveelheid: '1 tablet' }]);
  await openBestaand(page);
  await kaart(page).getByRole('button', { name: 'Verwijderen' }).click();
  await expect(kaart(page)).toContainText('Verwijderen? Wat je al afvinkte blijft in je Dagboek.');
  await kaart(page).getByRole('group').getByRole('button', { name: 'Annuleren' }).click();
  expect(await lees(page)).toHaveLength(1);
  await kaart(page).getByRole('button', { name: 'Verwijderen' }).click();
  await kaart(page).getByRole('group').getByRole('button', { name: 'Verwijderen' }).click();
  await expect(kaart(page)).toHaveCount(0);
  expect(await lees(page)).toHaveLength(0);
});

test('Foutmeldingen staan bij het veld, in gewone taal', async ({ page }) => {
  await start(page);
  await openNieuw(page);
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page).getByRole('alert').filter({ hasText: 'Geef het supplement een naam.' })).toBeVisible();
  await kaart(page).getByLabel('Naam').fill('Testkuur');
  await kaart(page).getByRole('button', { name: 'Ochtend' }).click(); // geen moment meer
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page).getByRole('alert').filter({ hasText: 'Kies minstens één moment.' })).toBeVisible();
  await kaart(page).getByRole('button', { name: 'Ochtend' }).click();
  await kaart(page).getByRole('radio', { name: 'Om de ... dagen' }).click();
  await kaart(page).getByLabel('Aantal dagen').fill('1');
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page).getByRole('alert').filter({ hasText: 'minstens 2' })).toBeVisible();
  await kaart(page).getByLabel('Aantal dagen').fill('14');
  await kaart(page).getByLabel('Begint op').fill('2026-12-05');
  await kaart(page).getByLabel('Stopt na').fill('2026-12-04');
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page).getByRole('alert').filter({ hasText: 'op of na Begint op' })).toBeVisible();
  expect(await lees(page)).toHaveLength(0); // niets bewaard
});

test('Begint op en Stopt na bewaren en leegmaken; een periodiek ritme bewaart "Volgende keer op"', async ({ page }) => {
  await start(page);
  await openNieuw(page);
  await kaart(page).getByLabel('Naam').fill('Periodekuur');
  await kaart(page).getByRole('radio', { name: 'Elke maand' }).click();
  await expect(kaart(page).getByRole('button', { name: 'Ochtend' })).toHaveCount(0); // momenten alleen bij Elke dag
  await kaart(page).getByLabel('Volgende keer op').fill('2026-12-04');
  await kaart(page).getByLabel('Begint op').fill('2026-12-04');
  await kaart(page).getByLabel('Stopt na').fill('2026-12-04');
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page)).toHaveCount(0);
  expect((await lees(page))[0]).toMatchObject({ ritme: { soort: 'maand', start: '2026-12-04' }, vanaf: '2026-12-04', tot: '2026-12-04', momenten: [] });
  await openBestaand(page);
  await expect(kaart(page).getByLabel('Begint op')).toHaveValue('2026-12-04');
  await kaart(page).getByLabel('Begint op').fill('');
  await kaart(page).getByLabel('Stopt na').fill('');
  await kaart(page).getByRole('button', { name: 'Bewaren', exact: true }).click();
  await expect(kaart(page)).toHaveCount(0);
  const na = (await lees(page))[0];
  expect(na.vanaf).toBeUndefined();
  expect(na.tot).toBeUndefined();
});

test('Het toetsenbord: Tab blijft in de kaart en Enter in een tekstveld bewaart', async ({ page }) => {
  await start(page);
  await openNieuw(page);
  await kaart(page).getByLabel('Naam').fill('Toetskuur');
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.supplementkaart')))).toBe(true);
  }
  // Shift+Tab vanaf het eerste veld gaat naar de laatste knop in de kaart, en Tab daarna weer naar het eerste veld
  await kaart(page).getByLabel('Naam').focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('dialog.supplementkaart') !== null && document.activeElement?.tagName === 'BUTTON')).toBe(true);
  await page.keyboard.press('Tab');
  await expect(kaart(page).getByLabel('Naam')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(kaart(page)).toHaveCount(0);
  expect((await lees(page))[0].naam).toBe('Toetskuur');
});

for (const breedte of [390, 360]) {
  test(`Op ${breedte} px past de kaart in het scherm en blijven de knoppen bereikbaar`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 700 });
    await start(page, [{ naam: 'Oudekuur', hoeveelheid: '1 tablet', ritme: { soort: 'interval', dagen: 14, start: '2026-12-04' }, momenten: [] }]);
    await openBestaand(page);
    await animatiesKlaar(page); // de opkomst van het blad is voorbij (geen vaste wachttijd)
    const doos = await wachtTotStil(page, () => kaart(page).boundingBox());
    expect(doos.x).toBeGreaterThanOrEqual(0);
    expect(doos.x + doos.width).toBeLessThanOrEqual(breedte + 1);
    expect(doos.y + doos.height).toBeLessThanOrEqual(701);
    await expect(kaart(page).getByRole('button', { name: 'Bewaren', exact: true })).toBeInViewport();
    await expect(kaart(page).getByRole('button', { name: 'Verwijderen' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  });
}
