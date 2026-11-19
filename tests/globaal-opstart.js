// Playwright globalSetup (BESLISSING 288): de app leest geen testsleutel. In plaats daarvan opent deze opstart de echte app één keer,
// laat ze haar eigen database met het juiste schema maken, zet daarin start.klaar = true en bewaart de hele browserstand
// (inclusief IndexedDB) in een bestand. De config laat elke test met die stand beginnen, zodat een lege database niet
// door het welkomscherm gaat; ook de naam (de verzonnen "Testnaam") staat erin, want de app heeft geen standaardnaam. Tests voor het welkomscherm zelf beginnen met een lege stand (zie c-welkom.spec.js).
import { chromium } from '@playwright/test';
import { STAND_BESTAND } from './stand.js';
import { vasteKlok } from './e2e/vaste-klok.js';

export default async function globaalOpstart(config) {
  const { baseURL, locale, timezoneId } = config.projects[0].use;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const context = await browser.newContext({ baseURL, locale, timezoneId });
  const page = await context.newPage();
  // Wat de app bij de eerste start eventueel met "nu" bewaart, hangt niet van de dag van de run af (BESLISSING 408).
  await vasteKlok(page);
  await page.goto('./');
  // De app is opgestart, dus de database bestaat.
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  // Een demobouw (VITE_DEMO=true, BESLISSING 364) heeft haar eigen database; de echte database bestaat daar niet.
  const naam = process.env.VITE_DEMO === 'true' ? 'bloei-demo' : 'bloei-dagboek';
  await page.evaluate(
    (naam) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open(naam);
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' }); // de app heeft geen standaardnaam; de tests beginnen met een verzonnen naam
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    naam,
  );
  await context.storageState({ path: STAND_BESTAND, indexedDB: true });
  await browser.close();
}
