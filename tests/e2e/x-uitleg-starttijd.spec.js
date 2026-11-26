// BESLISSING 735: van de tik op "Toon het me" tot de eerste uitlegkaart verstrijkt hoogstens 1500 ms (de routewissel inbegrepen),
// met een gevuld en met een leeg profiel, en de kaart blijft daarna dezelfde.
import { test, expect } from '@playwright/test';
import { TEKSTEN } from '../../src/teksten.js';

test.use({ channel: async ({ browserName }, use) => use(browserName === 'chromium' ? process.env.PW_CHANNEL || undefined : undefined) });

const kaart = (page) => page.locator('.uitleg__kaart[role="dialog"]:not(.uitleg__kaart--welkom)');

function vul(page) {
  return page.evaluate(() => new Promise((klaar, fout) => {
    const open = indexedDB.open('bloei-dagboek');
    open.onerror = () => fout(open.error);
    open.onsuccess = async () => {
      const db = open.result;
      const schrijf = (store, rij, wijze = 'put') => new Promise((ok, no) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store)[wijze](rij); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
      const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      const nu = new Date();
      try {
        await schrijf('supplementen', { naam: 'Vitamine D', dosis: '1 tablet', hoeveelheid: '1 tablet', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }, 'add');
        await schrijf('instellingen', { sleutel: 'gewicht.streefKg', waarde: 62 });
        for (let w = 0; w < 3; w++) {
          const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - w * 7, 12);
          const maandag = new Date(x.getFullYear(), x.getMonth(), x.getDate() - ((x.getDay() + 6) % 7), 12);
          await schrijf('wegingen', { week: iso(maandag), datum: iso(x), kg: 70 - (2 - w) * 0.6, voorbeeld: false, gewijzigdOp: Date.now() });
        }
        for (let k = 0; k < 4; k++) {
          const x = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - k, nu.getHours(), nu.getMinutes());
          const ds = iso(x);
          await schrijf('dagen', { datum: ds, notitie: '', doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
          await schrijf('dranken', { datum: ds, tijdstip: x.getTime() - 3600e3, soort: 'water', ml: 800, voorbeeld: false }, 'add');
          await schrijf('maaltijden', { datum: ds, soort: 'ontbijt', tekst: 'havermout', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
        }
        db.close();
        klaar();
      } catch (e) { fout(e); }
    };
  }));
}

const RIJEN = {
  gevuld: ['maaltijd', 'drinken', 'gewicht'],
  leeg: ['supplementen', 'lijst', 'gewicht', 'maaltijd'],
};

for (const [profiel, onderwerpen] of Object.entries(RIJEN)) {
  for (const onderwerp of onderwerpen) {
    test(`Starttijd (${profiel} profiel): ${TEKSTEN.uitleg.onderwerp[onderwerp]} toont binnen 1500 ms de eerste kaart`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 660 });
      await page.goto('./');
      await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      if (profiel === 'gevuld') {
        await vul(page);
        await page.reload();
        await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
      }
      await page.goto('./#/meer/uitleg');
      await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', 'meer/uitleg');
      const knop = page.getByRole('button', { name: `${TEKSTEN.uitleg.toonHet}: ${TEKSTEN.uitleg.onderwerp[onderwerp]}` });
      await expect(knop).toBeVisible();
      // de tik en de meting in de pagina zelf, zodat Playwright er geen tijd aan toevoegt
      const ms = await knop.evaluate((el) => new Promise((klaar) => {
        const t0 = performance.now();
        const wacht = () => {
          const t = document.querySelector('.uitleg__kaart[role="dialog"]:not(.uitleg__kaart--welkom) .uitleg__titel');
          if (t && t.textContent.trim()) return klaar(Math.round(performance.now() - t0));
          requestAnimationFrame(wacht);
        };
        el.click();
        wacht();
      }));
      console.log(`STARTTIJD ${profiel} ${onderwerp}: ${ms} ms`);
      expect(ms).toBeLessThanOrEqual(1500);
      // de winst van de afgemaakte opkomst (BESLISSING 735, 570): gemeten 260 tot 520 ms; 900 ms laat marge voor een tragere machine
      expect(ms).toBeLessThanOrEqual(900);
      const titel = await kaart(page).locator('.uitleg__titel').textContent();
      await page.waitForTimeout(2000);
      await expect(kaart(page).locator('.uitleg__titel')).toHaveText(titel.trim());
    });
  }
}
