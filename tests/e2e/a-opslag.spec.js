import { test, expect } from '@playwright/test';

// De proefpagina (src/dev/proef.js) is helemaal geschrapt (opruiming R2, BESLISSING 408): #/proef is een onbekende route.
test('er is geen proefpagina: #/proef gaat naar Vandaag', async ({ page }) => {
  await page.goto('./#/proef');
  await expect(page).toHaveURL(/#\/vandaag$/);
  expect(await page.evaluate(() => 'window.__schrift' in window || window.__schrift !== undefined)).toBe(false);
});

test('de database bestaat na de start met schema 5 en tien stores', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#tabbalk')).toBeVisible();
  const info = await page.evaluate(
    () =>
      new Promise((klaar, mislukt) => {
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          klaar({ versie: db.version, stores: [...db.objectStoreNames].sort() });
          db.close();
        };
      }),
  );
  // Dexie bewaart schemaversie 5 als IndexedDB-versie 50 (versie 1 was 10, 2 was 20, 3 was 30, 4 was 40).
  expect(info.versie).toBe(50);
  expect(info.stores).toEqual(['badges', 'dagen', 'dranken', 'favorieten', 'fotos', 'instellingen', 'maaltijden', 'momentinnames', 'supplementen', 'wegingen']);
});
