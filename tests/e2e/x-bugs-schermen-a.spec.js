// Bugs uit review R2 (spoor schermen A): R2-03, R2-04, R2-07, R2-09, R2-10, R2-11, R2-16, R2-17 en R2-19.
// Vaste datum: donderdag 12 november 2026. Alle gegevens zijn verzonnen.
import { test, expect } from '@playwright/test';
import { domRustig, schermKlaar, naTekenen } from './wacht.js';

const NU = new Date(2026, 10, 12, 10, 0, 0);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NU);
});

// Schrijft verzonnen dranken rechtstreeks in de opslag (de app opent eerst de database, zodat het schema er is).
async function zetDranken(page, datums) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (datums) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['dranken'], 'readwrite');
          datums.forEach((datum, i) => tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000 - i, soort: 'water', ml: 500, voorbeeld: false }));
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    datums,
  );
}

test.describe('Delen', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test('R2-03: een periode van meer dan 366 dagen toont en deelt de recentste 366 dagen; de toekomst valt weg', async ({ page }) => {
    await zetDranken(page, ['2026-11-12']);
    // via de route: te lang
    await page.goto('./#/delen/2025-01-01/2026-11-12');
    await expect(page.locator('.delen__samenvatting')).toContainText(/^366 dagen/);
    await expect(page.locator('.delen__eigen input').first()).toHaveValue('2025-11-12');
    await expect(page.locator('.delen__eigen input').last()).toHaveValue('2026-11-12');
    await expect(page.locator('.verslagvel')).toBeVisible();
    await expect(page.locator('.verslagvel')).not.toContainText('In deze periode staat nog niets.'); // de recentste dag (met een drank) staat erin
    // via de route: tot in de toekomst
    await page.goto('./#/delen/2026-11-01/2027-03-01');
    await expect(page.locator('.delen__samenvatting')).toContainText(/^12 dagen/);
    await expect(page.locator('.delen__eigen input').last()).toHaveValue('2026-11-12');
    // via de datumvelden: geen datum na vandaag in de kiezer, en een te lange periode zegt wat er echt in komt
    await page.goto('./#/delen');
    await page.locator('.delen__periode .chip', { hasText: 'Aangepast' }).click();
    const [van, tot] = [page.locator('.delen__eigen input').first(), page.locator('.delen__eigen input').last()];
    await expect(van).toHaveAttribute('max', '2026-11-12');
    await expect(tot).toHaveAttribute('max', '2026-11-12');
    await van.fill('2025-01-01');
    await expect(page.locator('.delen__samenvatting')).toContainText(/^366 dagen/);
    await expect(page.locator('.strook__tekst')).toContainText('366 dagen');
    await expect(page.locator('.strook__tekst')).toContainText('12 nov 2025');
  });

  test('R2-04: van na tot zet Versturen en Bewaren uit en deelt nooit de pdf van de vorige periode', async ({ page }) => {
    await zetDranken(page, ['2026-11-05']);
    await page.goto('./#/delen/2026-11-01/2026-11-10');
    const knoppen = page.locator('.delen__knoppen .knop');
    await expect(knoppen.first()).toBeEnabled({ timeout: 20000 }); // de pdf van 1 tot 10 november is klaar
    await page.locator('.delen__eigen input').first().fill('2026-11-15');
    const aantal = await knoppen.count();
    for (let i = 0; i < aantal; i += 1) await expect(knoppen.nth(i)).toBeDisabled();
    await expect(page.locator('.strook__tekst')).toHaveText('Kies een begindatum die vóór de einddatum ligt.');
    // de oude pdf komt niet terug: de pdf van 1 tot 10 november was al klaar, en het enige uitgestelde werk van Delen (het klaarmaken
    // van een pdf, 250 ms na een keuze) is bij van-na-tot geschrapt. Geen vaste wachttijd: het scherm blijft langer stil dan die 250 ms.
    await domRustig(page, { rust: 400 });
    for (let i = 0; i < aantal; i += 1) await expect(knoppen.nth(i)).toBeDisabled();
    // een geldige periode: de knoppen komen terug
    await page.locator('.delen__eigen input').first().fill('2026-11-02');
    await expect(knoppen.first()).toBeEnabled({ timeout: 20000 });
  });
});

test('R2-07: de tips van de week laten geen luisteraars op document achter na het verlaten', async ({ page }) => {
  await page.addInitScript(() => {
    const actief = new Set();
    window.__tipLuisteraars = () => actief.size;
    const voeg = Document.prototype.addEventListener;
    const haal = Document.prototype.removeEventListener;
    Document.prototype.addEventListener = function (type, fn, o) {
      if (type === 'pointerdown' && typeof fn === 'function' && String(fn).includes('[data-tip]')) actief.add(fn);
      return voeg.call(this, type, fn, o);
    };
    Document.prototype.removeEventListener = function (type, fn, o) {
      if (type === 'pointerdown') actief.delete(fn);
      return haal.call(this, type, fn, o);
    };
  });
  await page.goto('./#/dagboek/week');
  await expect(page.locator('.wk__schemakaart')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tipLuisteraars())).toBe(1);
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__tipLuisteraars())).toBe(0);
});

test('R2-09: een dubbele tik op Noteren bewaart één keer en vraagt niet "Vervangen?"', async ({ page }) => {
  await page.addInitScript(() => {
    window.__wegingSchrijf = 0;
    for (const naam of ['put', 'add']) {
      const echt = IDBObjectStore.prototype[naam];
      IDBObjectStore.prototype[naam] = function (...a) {
        if (this.name === 'wegingen') window.__wegingSchrijf += 1;
        return echt.apply(this, a);
      };
    }
  });
  await page.goto('./#/gewicht');
  await page.getByRole('button', { name: 'Weging noteren' }).click();
  await page.getByRole('textbox', { name: 'Gewicht in kg' }).fill('68,4');
  await page.evaluate(() => {
    const knop = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Noteren');
    knop.click();
    knop.click();
  });
  await expect(page.locator('.strook__tekst')).toHaveText('Genoteerd.');
  // Geen vaste wachttijd: het blad is dicht en het scherm Gewicht is opnieuw uitgebouwd; een tweede bewaring zou er dan al zijn
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await domRustig(page);
  expect(await page.evaluate(() => window.__wegingSchrijf)).toBe(1);
  await expect(page.getByText(/Vervangen/)).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('R2-10: op Meer zit geen tikbaar element in een ander, de kaarten blijven tikbaar en hebben een echte link', async ({ page }) => {
  await page.goto('./#/meer');
  await expect(page.locator('.meer__badges')).toBeVisible();
  // De medaille zelf (src/ui/medaille.js) draagt in haar kaartje nog een link "Alle badges" (tabindex -1): die valt buiten dit scherm.
  const genest = await page.evaluate(() =>
    [...document.querySelectorAll('.meer :is(button, a[href], [role="button"]):not(.medaille-hover)')].filter((el) => el.querySelector('button, a[href], input, [role="button"], [tabindex="0"]')).map((el) => el.className),
  );
  expect(genest).toEqual([]);
  await expect(page.locator('.meer__badges a.medaille-hover').first()).toBeVisible(); // de medailles blijven links met hun uitleg
  // de hele kaart blijft het tikvlak
  await page.locator('.meer__badges .kaartkop').click();
  await expect(page).toHaveURL(/#\/meer\/badges$/);
  await page.goto('./#/meer');
  await page.locator('.meer__profiel .meer__stats').click();
  await expect(page).toHaveURL(/#\/meer\/profiel$/);
  await page.goto('./#/meer');
  await page.locator('.meer__favorieten .kaartkop').click();
  await expect(page).toHaveURL(/#\/meer\/favorieten$/);
  // en elke kaart heeft één echte link met een korte naam
  // Na een nieuwe goto zet de browser de bewaarde schuifstand terug en schuift Playwright de link zacht (scroll-behavior: smooth) in beeld:
  // een klik midden in die scroll valt naast de link. Eerst wachten tot het scherm stil staat en de link al op zijn plek ligt.
  const klikLink = async (naam) => {
    await page.goto('./#/meer');
    await schermKlaar(page, '#/meer');
    const link = page.getByRole('link', { name: naam });
    await link.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await naTekenen(page);
    await link.click();
  };
  await klikLink('Alle badges bekijken');
  await expect(page).toHaveURL(/#\/meer\/badges$/);
  await klikLink('Naar je profiel');
  await expect(page).toHaveURL(/#\/meer\/profiel$/);
  await klikLink('Favoriet toevoegen');
  await expect(page).toHaveURL(/#\/meer\/favorieten$/);
});

test('R2-17: de ResizeObservers van Meer worden losgekoppeld bij het verlaten en bij een hertekening', async ({ page }) => {
  await page.addInitScript(() => {
    const Echt = window.ResizeObserver;
    const levend = new Set();
    window.__meerWaarnemers = () => levend.size;
    window.ResizeObserver = class extends Echt {
      constructor(cb) {
        super(cb);
        this.__meer = /favorietenNog|meer\.nogMeer/.test(String(cb));
      }
      observe(...a) {
        if (this.__meer) levend.add(this);
        return super.observe(...a);
      }
      disconnect() {
        levend.delete(this);
        return super.disconnect();
      }
    };
  });
  await page.goto('./#/meer');
  await expect(page.locator('.meer__favorieten')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meerWaarnemers())).toBe(1);
  // een ander thema hertekent Meer: er blijft er één
  await page.locator('.themategel').nth(1).click();
  // Meer is hertekend met het nieuwe thema (geen vaste wachttijd): pas dan zegt de telling iets
  await expect(page.locator('.themategel').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await domRustig(page);
  await expect.poll(() => page.evaluate(() => window.__meerWaarnemers())).toBe(1);
  await page.locator('.themategel').nth(0).click();
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meerWaarnemers())).toBe(0);
});

test('R2-11: een eerdere dag zonder dranken zegt niet "vandaag"', async ({ page }) => {
  await page.goto('./#/dagboek/dag/2026-11-10');
  await expect(page.locator('.dagdranken__leeg')).toHaveText('Nog niets gedronken op deze dag.');
  await page.goto('./#/dagboek/dag/2026-11-12');
  await expect(page.locator('.dagdranken__leeg')).toHaveText('Nog niets gedronken vandaag. Eén tik per drank.');
});

test('R2-19: de knop van een afgevinkte beurt in de maand zegt dat een tik het vinkje weghaalt', async ({ page }) => {
  await page.goto('./#/dagboek/maand');
  await page.evaluate(
    () =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          tx.objectStore('supplementen').add({ id: 1, naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-12' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
  );
  await page.reload();
  const paneel = page.locator('.maand__paneel');
  await expect(paneel).toContainText('een halve ampule');
  await paneel.getByRole('button', { name: 'Afvinken' }).click();
  const terug = paneel.getByRole('button', { name: 'Afgevinkt. Tik om het vinkje weg te halen.' });
  await expect(terug).toBeVisible();
  await expect(terug).toHaveText('Afgevinkt'); // de zichtbare tekst blijft
  await terug.click();
  await expect(paneel.getByRole('button', { name: 'Afvinken' })).toBeVisible();
});

test.describe('Welkom', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // BESLISSING 444: de laatste stap is nu stap 4 (Bloei vergrendelen); daar wordt bewaard, ook met "Nu niet".
  test('R2-16: mislukt het bewaren, dan blijft ze op de laatste stap met haar keuzes en ziet ze een melding', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('textbox', { name: 'Je naam' }).fill('Testnaam');
    await page.getByRole('button', { name: 'Verder' }).click();
    await page.getByRole('button', { name: 'Verder' }).click();
    await expect(page.getByText('Stap 3 van 4')).toBeVisible();
    await page.getByRole('button', { name: 'Verder' }).click();
    await expect(page.getByText('Stap 4 van 4')).toBeVisible();
    // het bewaren mislukt (bv. een volle opslag)
    await page.evaluate(() => {
      window.__echtPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('vol', 'QuotaExceededError');
      };
    });
    await page.getByRole('button', { name: 'Nu niet' }).click();
    await expect(page.locator('.strook__tekst')).toHaveText('Dit lukte niet. Probeer het nog eens.');
    await domRustig(page); // het scherm is stil (geen vaste wachttijd): een navigatie naar Vandaag zou nu al gebeurd zijn
    await expect(page).toHaveURL(/#\/welkom$/);
    await expect(page.getByText('Stap 4 van 4')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Je naam', includeHidden: true })).toHaveValue('Testnaam');
    await expect(page.getByRole('button', { name: 'Nu niet' })).toBeEnabled();
    // daarna lukt het wel
    await page.evaluate(() => {
      IDBObjectStore.prototype.put = window.__echtPut;
    });
    await page.getByRole('button', { name: 'Nu niet' }).click();
    await expect(page).toHaveURL(/#\/vandaag$/);
  });
});
