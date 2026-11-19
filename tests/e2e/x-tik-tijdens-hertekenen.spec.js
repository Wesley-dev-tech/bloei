// Een tik die landt terwijl een scherm hertekent, gaat niet verloren en telt niet dubbel (beheerScherm in src/schermen/hulp.js).
// De fout (18 november): na Annuleren in het maaltijdblad schrijft de app naar de database; 40 ms later bouwt Vandaag een nieuwe tekening.
// Een tik op "Volgende maand" tijdens dat bouwen werkte op het oude scherm, en de nieuwe tekening (die de oude maand al gelezen had)
// verving daarna het hele scherm: de kalender bleef op de oude maand. Hetzelfde voor een dag kiezen in Dagboek, maand terwijl een
// ander tabblad iets wijzigt. Nu wordt een tekening die door een tik achterhaald is weggegooid en na de tik opnieuw gedaan.
// Elke tik is een echte muisklik (desktop) of een echte tik op het aanraakscherm (telefoon), op verschillende momenten na de wijziging,
// zodat er altijd tikken in het venster van het bouwen vallen. Een variant met een vertraagde processor (CDP) staat voor een trage telefoon.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { wachtOpRust } from './r-wacht.js';

const WACHTTIJDEN = [0, 20, 40, 60, 85, 120, 200];
const MATEN = [
  { naam: '1280x800', breedte: 1280, hoogte: 800, telefoon: false },
  { naam: '390x660', breedte: 390, hoogte: 660, telefoon: true },
];
const kort = (ms) => new Promise((r) => setTimeout(r, ms));

// Een echte klik of tik op het midden van het element, zonder de wachtcontroles van Playwright (die zouden het venster missen).
async function tikOp(page, telefoon, selector) {
  const punt = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  expect(punt, selector).not.toBeNull();
  if (telefoon) await page.touchscreen.tap(punt.x, punt.y);
  else await page.mouse.click(punt.x, punt.y);
}

async function inBeeld(page, selector) {
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), selector);
  await wachtOpRust(page);
}

async function leesStore(page, store) {
  return page.evaluate(
    (store) =>
      new Promise((ok, nee) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => nee(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const r = db.transaction(store).objectStore(store).getAll();
          r.onsuccess = () => {
            db.close();
            ok(r.result);
          };
          r.onerror = () => nee(r.error);
        };
      }),
    store,
  );
}

const TITEL = '.vc--kalender .kalkaart__maand';
const VOLGENDE = '.vc--kalender .kalkaart__blader button:last-of-type';

// Vandaag: maaltijdblad open, Annuleren, en na `wacht` ms een tik op Volgende maand. De kalender moet op december staan.
async function kalenderNaAnnuleren(page, telefoon, wacht) {
  await page.goto('./#/meer');
  await page.goto('./#/vandaag');
  await expect(page.locator(TITEL)).toHaveText('november 2026');
  await inBeeld(page, '.vc--kalender .kalkaart__blader');
  // Het blad openen zonder te scrollen (op een lage telefoon staan de maaltijd en de kalender niet samen in beeld).
  await page.evaluate(() => document.querySelector('.maaltijd[data-soort="ontbijt"] > .rij').click());
  await expect(page.locator('.blad.maaltijdblad dialog[open]')).toBeVisible();
  await wachtOpRust(page);
  await tikOp(page, telefoon, '.blad.maaltijdblad .maaltijd__annuleer');
  if (wacht) await kort(wacht);
  await tikOp(page, telefoon, VOLGENDE);
  await expect(page.locator(TITEL), `tik ${wacht} ms na Annuleren`).toHaveText('december 2026');
  // Ook na de hertekening die op Annuleren volgt: niet terug naar november, en het raster hoort bij december (vijf weken).
  await kort(600);
  await expect(page.locator(TITEL), `tik ${wacht} ms na Annuleren, na de hertekening`).toHaveText('december 2026');
  await expect(page.locator('.vc--kalender .kalender__week:not(.kalender__kop)')).toHaveCount(5);
}

for (const m of MATEN) {
  test.describe(`Tik tijdens hertekenen ${m.naam}`, () => {
    test.use({ viewport: { width: m.breedte, height: m.hoogte }, isMobile: m.telefoon, hasTouch: m.telefoon });
    test.beforeEach(async ({ page }) => {
      await vasteKlok(page, { datum: '2026-11-13', uur: '10:00' });
    });

    test(`${m.naam}: Vandaag, een tik op Volgende maand vlak na Annuleren in het maaltijdblad gaat niet verloren`, async ({ page }) => {
      test.setTimeout(150000);
      // Dicht bij elkaar: het venster van het bouwen is maar enkele tientallen ms breed.
      for (const wacht of [...WACHTTIJDEN, 30, 35, 45, 50, 55, 65, 70]) await kalenderNaAnnuleren(page, m.telefoon, wacht);
    });

    test(`${m.naam}: Vandaag, twee snelle tikken op Volgende maand bladeren twee maanden`, async ({ page }) => {
      await page.goto('./#/vandaag');
      await expect(page.locator(TITEL)).toHaveText('november 2026');
      await inBeeld(page, '.vc--kalender .kalkaart__blader');
      await tikOp(page, m.telefoon, VOLGENDE);
      await tikOp(page, m.telefoon, VOLGENDE);
      await expect(page.locator(TITEL)).toHaveText('januari 2027');
      await kort(600);
      await expect(page.locator(TITEL)).toHaveText('januari 2027');
    });

    test(`${m.naam}: Dagboek maand, een dag kiezen terwijl een ander tabblad iets wijzigt, blijft gekozen`, async ({ page, context }) => {
      const ander = await context.newPage();
      await vasteKlok(ander, { datum: '2026-11-13', uur: '10:00' });
      await ander.goto('./#/vandaag');
      await expect(ander.locator('.drankknop[data-soort="water"]')).toBeVisible();
      const dagen = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10'];
      await page.goto('./#/dagboek/maand/2026-11');
      await expect(page.locator('.maand__dag .maand__paneel')).toBeVisible();
      for (const [i, wacht] of WACHTTIJDEN.entries()) {
        const dag = dagen[i];
        const sel = `.mk__dag[data-datum="${dag}"]`;
        await inBeeld(page, sel);
        // Het andere tabblad voegt een drank toe: dit scherm hoort dat (elders:gewijzigd) en hertekent.
        await ander.evaluate(() => document.querySelector('.drankknop[data-soort="water"]').click());
        if (wacht) await kort(wacht);
        await tikOp(page, m.telefoon, sel);
        await expect(page.locator(sel), `tik ${wacht} ms na de wijziging elders`).toHaveAttribute('aria-pressed', 'true');
        await kort(600);
        await expect(page.locator(sel), `tik ${wacht} ms na de wijziging elders, na de hertekening`).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.maand__dag .maand__paneel .kaartkop').first()).toContainText(String(Number(dag.slice(8))) + ' november');
      }
      await ander.close();
    });

    test(`${m.naam}: Vandaag, twee dranken vlak na elkaar tellen allebei, precies een keer`, async ({ page }) => {
      await page.goto('./#/vandaag');
      await expect(page.locator('.drankknop[data-soort="thee"]')).toBeVisible();
      await inBeeld(page, '.drankknop[data-soort="water"]');
      let verwacht = 0;
      for (const wacht of WACHTTIJDEN) {
        await tikOp(page, m.telefoon, '.drankknop[data-soort="water"]');
        if (wacht) await kort(wacht);
        await tikOp(page, m.telefoon, '.drankknop[data-soort="thee"]');
        verwacht += 2;
        await expect.poll(async () => (await leesStore(page, 'dranken')).length, { message: `na ${wacht} ms` }).toBe(verwacht);
        await kort(400);
      }
      const dranken = await leesStore(page, 'dranken');
      expect(dranken.filter((d) => d.soort === 'water')).toHaveLength(WACHTTIJDEN.length);
      expect(dranken.filter((d) => d.soort === 'thee')).toHaveLength(WACHTTIJDEN.length);
    });

    test(`${m.naam}: Vandaag, twee tikken op hetzelfde supplementmoment heffen elkaar op`, async ({ page }) => {
      await page.goto('./#/supplementen');
      await page.getByRole('button', { name: 'Eerste supplement toevoegen' }).click();
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('textbox', { name: 'Naam' }).fill('Voorbeeld');
      await dlg.getByRole('button', { name: 'Bewaren' }).click();
      await expect(dlg).toBeHidden();
      await page.goto('./#/vandaag');
      const rijSel = '.suppkaart .momentrij[data-moment="ochtend"]';
      await expect(page.locator(rijSel)).toBeVisible();
      await inBeeld(page, rijSel);
      for (const wacht of WACHTTIJDEN) {
        await tikOp(page, m.telefoon, rijSel);
        if (wacht) await kort(wacht);
        await tikOp(page, m.telefoon, rijSel);
        await kort(700);
        await expect(page.locator(rijSel), `tweede tik ${wacht} ms na de eerste`).toHaveAttribute('aria-checked', 'false');
        await expect
          .poll(async () => (await leesStore(page, 'momentinnames')).filter((r) => r.moment === 'ochtend' && r.genomen).length, { message: `na ${wacht} ms` })
          .toBe(0);
      }
    });
  });
}

// Precies in het venster: de test kijkt mee in IndexedDB. Na Annuleren bouwt Vandaag een nieuwe tekening; vlak voor de kalender leest
// ze de badges (gemeten: bij een vier keer tragere processor lezen ze ongeveer 15 ms na de start van het bouwen, de tekening vervangt het
// scherm ongeveer 60 ms later). Zodra die leestransactie start, volgt de tik: de tekening heeft de maand dan al gelezen en is nog niet
// geplaatst. In de eerste test is het een echte tik (Playwright), die door de reistijd soms net buiten het venster valt.
// De tweede test telt eerst hoeveel leestransacties het bouwen na Annuleren doet tot het scherm vervangen wordt, en geeft daarna de tik
// zelf (pointerdown en click, zoals een vinger) zodra de voorlaatste leestransactie start: de kalendermaand is dan al gelezen en de tekening
// is nog niet geplaatst. Dat is elke keer binnen het venster.
async function loerOpLezen(page) {
  await page.addInitScript((volgende) => {
    const echt = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, modus, ...rest) {
      if (window.__loer && modus !== 'readwrite' && [].concat(stores).includes('badges')) {
        window.__loer = 0;
        window.__bouwt = performance.now();
      }
      if (window.__tel && modus !== 'readwrite') {
        window.__tel.push([].concat(stores).join('+'));
        if (window.__tel.length === window.__tikNa) {
          setTimeout(() => {
            const knop = document.querySelector(volgende);
            knop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
            knop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true }));
            knop.click();
            window.__getikt = window.__vervangen ? -1 : performance.now(); // -1: te laat, het scherm was al vervangen
          }, 0);
        }
      }
      return echt.call(this, stores, modus, ...rest);
    };
  }, VOLGENDE);
}

// Telt de leestransacties vanaf nu tot het scherm (een kaart) vervangen wordt.
async function startTellen(page, tikNa = 0) {
  await page.evaluate((tikNa) => {
    window.__tel = [];
    window.__tikNa = tikNa;
    window.__getikt = 0;
    window.__vervangen = 0;
    const w = new MutationObserver((lijst) => {
      if (lijst.some((x) => [...x.removedNodes].some((n) => n.nodeType === 1 && (n.matches('.kaart') || n.querySelector('.kaart'))))) {
        window.__vervangen = window.__tel.length;
        w.disconnect();
      }
    });
    w.observe(document.getElementById('scherm'), { childList: true, subtree: true });
  }, tikNa);
}

for (const m of MATEN) {
  test.describe(`Tik tijdens het bouwen, precies in het venster ${m.naam}`, () => {
    test.use({ viewport: { width: m.breedte, height: m.hoogte }, isMobile: m.telefoon, hasTouch: m.telefoon });
    test(`${m.naam}: een tik op Volgende maand terwijl Vandaag na Annuleren bouwt, gaat niet verloren`, async ({ page }) => {
      test.setTimeout(150000);
      await vasteKlok(page, { datum: '2026-11-13', uur: '10:00' });
      await loerOpLezen(page);
      const cdp = await page.context().newCDPSession(page);
      for (let i = 0; i < 5; i += 1) {
        await page.goto('./#/meer');
        await page.goto('./#/vandaag');
        await expect(page.locator(TITEL)).toHaveText('november 2026');
        await inBeeld(page, '.vc--kalender .kalkaart__blader');
        await page.evaluate(() => document.querySelector('.maaltijd[data-soort="ontbijt"] > .rij').click());
        await expect(page.locator('.blad.maaltijdblad dialog[open]')).toBeVisible();
        await wachtOpRust(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.evaluate(() => {
          window.__bouwt = 0;
          window.__loer = 1;
        });
        await tikOp(page, m.telefoon, '.blad.maaltijdblad .maaltijd__annuleer');
        await page.waitForFunction(() => window.__bouwt > 0, null, { polling: 'raf' });
        await tikOp(page, m.telefoon, VOLGENDE);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await expect(page.locator(TITEL), `ronde ${i + 1}`).toHaveText('december 2026');
        await kort(600);
        await expect(page.locator(TITEL), `ronde ${i + 1}, na de hertekening`).toHaveText('december 2026');
        await expect(page.locator('.vc--kalender .kalender__week:not(.kalender__kop)')).toHaveCount(5);
      }
    });

    test(`${m.naam}: een tik die de pagina geeft terwijl Vandaag na Annuleren bouwt, gaat niet verloren (elke keer)`, async ({ page }) => {
      await vasteKlok(page, { datum: '2026-11-13', uur: '10:00' });
      await loerOpLezen(page);
      const openBlad = async () => {
        await page.goto('./#/meer');
        await page.goto('./#/vandaag');
        await expect(page.locator(TITEL)).toHaveText('november 2026');
        await page.evaluate(() => document.querySelector('.maaltijd[data-soort="ontbijt"] > .rij').click());
        await expect(page.locator('.blad.maaltijdblad dialog[open]')).toBeVisible();
        await wachtOpRust(page);
      };
      // IJken: hoeveel leestransacties tot het scherm vervangen wordt (zonder tik).
      await openBlad();
      await startTellen(page);
      await tikOp(page, m.telefoon, '.blad.maaltijdblad .maaltijd__annuleer');
      await page.waitForFunction(() => window.__vervangen > 0);
      const totaal = await page.evaluate(() => window.__vervangen);
      expect(totaal).toBeGreaterThan(5);
      for (let i = 0; i < 5; i += 1) {
        await openBlad();
        await startTellen(page, totaal - 1); // de voorlaatste: de kalender is gelezen, het einde van het bouwen is nog niet bereikt
        await tikOp(page, m.telefoon, '.blad.maaltijdblad .maaltijd__annuleer');
        await page.waitForFunction(() => window.__getikt !== 0, null, { timeout: 8000 });
        expect(await page.evaluate(() => window.__getikt), `ronde ${i + 1}: de tik viel in het venster van het bouwen`).toBeGreaterThan(0);
        await expect(page.locator(TITEL), `ronde ${i + 1}`).toHaveText('december 2026');
        await kort(600);
        await expect(page.locator(TITEL), `ronde ${i + 1}, na de hertekening`).toHaveText('december 2026');
        await expect(page.locator('.vc--kalender .kalender__week:not(.kalender__kop)')).toHaveCount(5);
      }
    });
  });
}

// Een trage telefoon: de processor vier keer trager (Chrome DevTools Protocol). Het bouwen duurt dan langer, het venster is breder.
test.describe('Tik tijdens hertekenen op een trage telefoon', () => {
  test.use({ viewport: { width: 390, height: 660 }, isMobile: true, hasTouch: true });
  test('390x660, processor vier keer trager: Volgende maand na Annuleren gaat niet verloren', async ({ page, browserName }) => {
    test.setTimeout(300000);
    expect(browserName).toBe('chromium');
    await vasteKlok(page, { datum: '2026-11-13', uur: '10:00' });
    const cdp = await page.context().newCDPSession(page);
    await page.goto('./#/vandaag');
    await expect(page.locator(TITEL)).toHaveText('november 2026');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Om de 20 ms van 40 tot 400 ms: met een trage processor schuift het venster van het bouwen op en wordt het breder.
    for (let wacht = 40; wacht <= 400; wacht += 20) await kalenderNaAnnuleren(page, true, wacht);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
