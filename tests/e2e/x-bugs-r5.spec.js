// Herstel van de bugs uit review R5 (de app echt gebruiken) en R2-18 (BESLISSING 409). Elke test toonde eerst de bug.
// R5-01 twee tabbladen · R5-02 de kop van een maaltijd en Escape · R5-03 tekst vlak voor herladen · R5-04 een drank net na middernacht ·
// R5-07 thema na "Profiel verwijderen" · R5-09 demo over middernacht (alleen in de demoronde, tag @demo) · R5-10 Delen, van na tot · R2-18 weging verhuizen.
// De gegevenslaag (R5-01 per veld, R5-03 vangnet, R5-05, R5-06, R2-18) staat in tests/logica/bugs-r5.test.js.
import { test, expect } from '@playwright/test';
import { animatiesKlaar, domRustig } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

const DEMO = process.env.PW_RONDE === 'demo';
const DB = DEMO ? 'bloei-demo' : 'bloei-dagboek';
// Donderdag 12 november 2026, 10 uur.
const DONDERDAG = new Date(2026, 10, 12, 10, 0, 0);
const D = '2026-11-12';

const rijen = (page, tabel) =>
  page.evaluate(
    ([naam, db]) =>
      new Promise((klaar) => {
        const open = indexedDB.open(db);
        open.onsuccess = () => {
          const vraag = open.result.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            open.result.close();
            klaar(vraag.result);
          };
        };
      }),
    [tabel, DB],
  );
const zetRij = (page, tabel, rij) =>
  page.evaluate(
    ([naam, waarde, db]) =>
      new Promise((klaar) => {
        const open = indexedDB.open(db);
        open.onsuccess = () => {
          const tx = open.result.transaction(naam, 'readwrite');
          tx.objectStore(naam).put(waarde);
          tx.oncomplete = () => {
            open.result.close();
            klaar();
          };
        };
      }),
    [tabel, rij, DB],
  );
const maaltijd = (datum, soort, tekst, extra = {}) => ({ datum, soort, tijd: '12:30', tekst, fotoId: null, voorbeeld: false, gewijzigdOp: 1, ...extra });
// BESLISSING 419: een maaltijd vul je in in een blad boven het scherm (een open <dialog>).
const blad = (page) => page.locator('dialog.dialoog[open]');
const ontbijtVan = async (page) => (await rijen(page, 'maaltijden')).find((m) => m.soort === 'ontbijt' && m.datum === D);

test.describe('de echte versie', () => {

  test.describe('R5-01 twee tabbladen', () => {
    test('tabblad B toont wat tabblad A bewaarde, en B overschrijft A niet', async ({ context, page }) => {
      await context.clock.setFixedTime(DONDERDAG);
      const a = page;
      await a.goto('./#/dagboek/dag');
      const b = await context.newPage();
      await b.goto('./#/dagboek/dag');
      await expect(b.locator('.maaltijd[data-soort="ontbijt"]')).toBeVisible();

      // A: een maaltijd en een notitie.
      await a.bringToFront();
      const ontbijtA = a.locator('.maaltijd[data-soort="ontbijt"]');
      await ontbijtA.locator('> .rij').click();
      await blad(a).locator('textarea').fill('Havermout');
      await blad(a).locator('.maaltijd__bewaar').click();
      const notitieA = a.locator('.dag__notitie textarea');
      await notitieA.fill('Lang verhaal uit tabblad A');
      await notitieA.blur();
      await expect.poll(async () => (await rijen(a, 'dagen'))[0]?.notitie).toBe('Lang verhaal uit tabblad A');

      // B komt in beeld, zonder herladen: het toont de stand van A.
      await b.bringToFront();
      await b.evaluate(() => window.dispatchEvent(new Event('focus')));
      const ontbijtB = b.locator('.maaltijd[data-soort="ontbijt"]');
      await expect(ontbijtB.locator('> .rij')).toContainText('Havermout');
      await expect(b.locator('.dag__notitie textarea')).toHaveValue('Lang verhaal uit tabblad A');

      await ontbijtB.locator('> .rij').click();
      await blad(b).locator('textarea').click();
      await a.bringToFront();
      await ontbijtA.locator('> .rij').click();
      await b.bringToFront();
      await blad(b).locator('textarea').fill('Havermout met banaan');
      await blad(b).locator('.maaltijd__bewaar').click();
      await expect.poll(async () => ontbijtVan(b)).toMatchObject({ tekst: 'Havermout met banaan' });
    });
  });

  test.describe('R5-02 de rij van een maaltijd terwijl het blad open is', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(DONDERDAG);
      await page.goto('./#/vandaag');
      await zetRij(page, 'maaltijden', maaltijd(D, 'middagmaal', 'Origineel'));
    });

    for (const route of ['dagboek/dag', 'vandaag']) {
      test(`${route}: de rij volgt de bewaarde tekst, en Escape sluit het blad met de focus op de rij`, async ({ page }) => {
        await page.goto('./#/' + route);
        const regel = page.locator('.maaltijd[data-soort="middagmaal"]');
        const kop = regel.locator('> .rij');
        await expect(kop).toContainText('Origineel');
        await kop.click();
        await blad(page).locator('textarea').fill('Nieuwe tekst');
        await expect.poll(async () => (await rijen(page, 'maaltijden')).find((m) => m.soort === 'middagmaal')?.tekst).toBe('Nieuwe tekst');
        await expect(kop.locator('.rij__sub')).toHaveText('Nieuwe tekst');
        await page.keyboard.press('Escape');
        await expect(blad(page)).toHaveCount(0);
        await expect(kop).toHaveAttribute('aria-expanded', 'false');
        await expect(kop).toBeFocused();
        await expect(kop).toContainText('Nieuwe tekst');
      });
    }

    test('een nieuwe maaltijd toont na het bewaren haar uur in de kop', async ({ page }) => {
      await page.goto('./#/dagboek/dag');
      const regel = page.locator('.maaltijd[data-soort="ontbijt"]');
      await regel.locator('> .rij').click();
      await blad(page).locator('textarea').fill('Yoghurt');
      await expect.poll(async () => (await ontbijtVan(page))?.tekst).toBe('Yoghurt');
      await expect(regel.locator('> .rij .rij__sub')).toHaveText('Yoghurt');
      await expect(regel.locator('> .rij .maaltijd__eind')).toContainText((await ontbijtVan(page)).tijd);
    });
  });

  test.describe('BESLISSING 412 Klaar en Annuleren in het maaltijdblad', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(DONDERDAG);
      await page.goto('./#/vandaag');
      await zetRij(page, 'maaltijden', maaltijd(D, 'middagmaal', 'Origineel', { tijd: '12:30' }));
    });
    const middagmaal = async (page) => (await rijen(page, 'maaltijden')).find((m) => m.soort === 'middagmaal' && m.datum === D) ?? null;

    for (const route of ['dagboek/dag', 'vandaag']) {
      test(`${route}: Annuleren zet tekst en uur terug zoals bij het openen, in de database en op het scherm`, async ({ page }) => {
        await page.goto('./#/' + route);
        const regel = page.locator('.maaltijd[data-soort="middagmaal"]');
        await regel.locator('> .rij').click();
        await blad(page).locator('textarea').fill('Nieuwe tekst');
        await expect.poll(async () => (await middagmaal(page))?.tekst).toBe('Nieuwe tekst');
        await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
        await expect.poll(() => middagmaal(page)).toMatchObject({ tekst: 'Origineel', tijd: '12:30', gewijzigdOp: 1 });
        await expect(blad(page)).toHaveCount(0);
        await expect(regel.locator('> .rij')).toContainText('Origineel');
        await expect(regel.locator('> .rij')).toBeFocused();
      });
    }

    test('Annuleren van een nieuwe maaltijd laat geen rij achter', async ({ page }) => {
      await page.goto('./#/dagboek/dag');
      const regel = page.locator('.maaltijd[data-soort="ontbijt"]');
      await regel.locator('> .rij').click();
      await blad(page).locator('textarea').fill('Even geprobeerd');
      await expect.poll(async () => (await ontbijtVan(page))?.tekst).toBe('Even geprobeerd');
      await blad(page).getByRole('button', { name: 'Annuleren', exact: true }).click();
      await expect.poll(() => ontbijtVan(page)).toBeUndefined();
      await expect(regel.locator('> .rij')).toContainText('Invullen');
    });

    test('Klaar bewaart meteen, ook wat nog geen 0,4 s oud is', async ({ page }) => {
      await page.goto('./#/dagboek/dag');
      const regel = page.locator('.maaltijd[data-soort="ontbijt"]');
      await regel.locator('> .rij').click();
      await blad(page).locator('textarea').fill('Met Klaar');
      await blad(page).getByRole('button', { name: 'Klaar', exact: true }).click();
      await expect(blad(page)).toHaveCount(0);
      await expect.poll(async () => (await ontbijtVan(page))?.tekst).toBe('Met Klaar');
    });

    test('Escape bewaart en sluit (zoals Klaar), het annuleert niet', async ({ page }) => {
      await page.goto('./#/dagboek/dag');
      const regel = page.locator('.maaltijd[data-soort="middagmaal"]');
      await regel.locator('> .rij').click();
      await blad(page).locator('textarea').fill('Met Escape');
      await page.keyboard.press('Escape');
      await expect(blad(page)).toHaveCount(0);
      await expect.poll(async () => (await middagmaal(page))?.tekst).toBe('Met Escape');
    });

    for (const breedte of [360, 390, 1280])
    test(`op ${breedte} px staan Klaar, Annuleren en Verwijderen (BESLISSING 417) naast elkaar, even hoog, zonder afgebroken tekst`, async ({ page }) => {
      // In het blad (BESLISSING 419) passen de drie knoppen ook op 360 px op één rij.
      await page.setViewportSize({ width: breedte, height: 844 });
      await page.goto('./#/dagboek/dag');
      const regel = page.locator('.maaltijd[data-soort="middagmaal"]');
      await regel.locator('> .rij').click();
      const knoppen = blad(page).locator('.maaltijd__acties .knop');
      await expect(knoppen).toHaveCount(3);
      const maten = await knoppen.evaluateAll((lijst) => lijst.map((k) => ({ tekst: k.textContent.trim(), ...k.getBoundingClientRect().toJSON(), past: k.scrollWidth <= k.clientWidth + 1 })));
      expect(maten.map((m) => m.tekst)).toEqual(['Klaar', 'Annuleren', 'Verwijderen']); // ook de DOM- en tabvolgorde
      for (const m of maten) {
        expect(m.height, m.tekst).toBeGreaterThanOrEqual(44);
        expect(m.past, m.tekst).toBe(true);
        expect(Math.abs(m.top - maten[0].top), m.tekst).toBeLessThan(2);
        expect(Math.abs(m.height - maten[0].height), m.tekst).toBeLessThan(2);
      }
      expect(maten[0].x).toBeLessThan(maten[1].x);
      expect(maten[1].x).toBeLessThan(maten[2].x);
    });
  });

  test.describe('R5-03 wat net getypt is, overleeft herladen', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(DONDERDAG);
      await page.goto('./#/dagboek/dag');
    });

    test('een maaltijd', async ({ page }) => {
      const regel = page.locator('.maaltijd[data-soort="ontbijt"]');
      await regel.locator('> .rij').click();
      await blad(page).locator('textarea').pressSequentially('Half getypt');
      await page.reload();
      await expect(page.locator('.maaltijd[data-soort="ontbijt"] > .rij')).toContainText('Half getypt');
      expect(await page.evaluate(() => localStorage.getItem('bloei-vangnet'))).toBeNull();
    });

    test('een notitie', async ({ page }) => {
      await page.locator('.dag__notitie textarea').pressSequentially('Notitie half');
      await page.reload();
      await expect(page.locator('.dag__notitie textarea')).toHaveValue('Notitie half');
      expect(await page.evaluate(() => localStorage.getItem('bloei-vangnet'))).toBeNull();
    });

    // Het bewaren is al gestart (de 0,4 s zijn om, of het veld is verlaten) maar staat nog niet in de database als de pagina verdwijnt:
    // ook dan gaat er niets verloren. De test houdt de tabel bezet, zodat het bewaren van de app zeker nog onderweg is bij het herladen.
    test('een notitie waarvan het bewaren nog onderweg is', async ({ page }) => {
      const vak = page.locator('.dag__notitie textarea');
      await expect(vak).toBeVisible();
      await page.evaluate(
        (db) =>
          new Promise((klaar) => {
            const open = indexedDB.open(db);
            open.onsuccess = () => {
              const tabel = open.result.transaction('dagen', 'readwrite').objectStore('dagen');
              const rond = () => {
                tabel.get('bezet').onsuccess = rond; // houdt de schrijfbeurt open tot de pagina verdwijnt
              };
              rond();
              klaar();
            };
          }),
        DB,
      );
      await vak.pressSequentially('Notitie onderweg');
      await vak.blur(); // het veld verlaten start het bewaren meteen; het wacht achter de bezette tabel
      await page.reload();
      await expect(page.locator('.dag__notitie textarea')).toHaveValue('Notitie onderweg');
      expect(await page.evaluate(() => localStorage.getItem('bloei-vangnet'))).toBeNull();
    });
  });

  test.describe('R5-04 een drank net na middernacht, voor de dagwissel liep', () => {
    for (const [route, chip] of [['vandaag', '.vandaag .laatst__chip'], ['drinken', null]]) {
      test(`${route}: het scherm gaat mee naar de nieuwe dag en toont de drank`, async ({ page }) => {
        await page.clock.setFixedTime(new Date(2026, 10, 12, 23, 58, 0));
        await page.goto('./#/' + route);
        const water = page.locator(`#scherm .drankknop[data-soort="water"]`).first();
        await expect(water).toBeVisible();
        await page.clock.setFixedTime(new Date(2026, 10, 13, 0, 0, 30));
        await water.click();
        await expect.poll(async () => (await rijen(page, 'dranken')).map((d) => d.datum)).toEqual(['2026-11-13']);
        if (chip) {
          await expect(page.locator('#scherm')).toContainText(/vrijdag 13 november/i);
          await expect(page.locator(chip)).toHaveCount(1);
        } else {
          // Drinken toont geen datum: de stand van de nieuwe dag is de kan van 0,8 liter (en niet 0 liter van de vorige dag).
          await expect(page.locator('.drinken__verloopkaart')).toContainText('Water');
          await expect(page.locator('#scherm')).toContainText(/0,8.?liter/);
        }
      });
    }
  });

  test('R5-07 "Profiel verwijderen" zet ook het thema terug', async ({ page }) => {
    await page.goto('./#/meer');
    await page.locator('.themategel', { hasText: 'Nacht' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'nacht');
    await page.getByRole('button', { name: 'Profiel verwijderen' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Ja, verwijder mijn profiel' }).click();
    const ja = page.locator('dialog[open]').getByRole('button', { name: 'Ja, verwijder mijn profiel' });
    await expect(ja).toBeEnabled({ timeout: 5000 });
    await ja.click();
    await expect(page).toHaveURL(/#\/welkom$/);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'nacht');
    expect(await page.evaluate(() => localStorage.getItem('bloei-thema'))).not.toBe('nacht');
  });

  test('R5-10 Delen, van na tot: het voorbeeld en "Wat komt erin" tonen de vorige periode niet meer', async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
    await page.goto('./#/vandaag');
    for (const datum of ['2026-11-10', '2026-11-11', '2026-11-12']) await zetRij(page, 'maaltijden', maaltijd(datum, 'ontbijt', 'Boterham'));
    await page.goto('./#/delen');
    await page.getByRole('button', { name: 'Aangepast' }).click();
    const [van, tot] = [page.locator('.delen__eigen input').nth(0), page.locator('.delen__eigen input').nth(1)];
    await van.fill('2026-11-10');
    await tot.fill('2026-11-12');
    await expect(page.locator('.verslagvel')).not.toHaveClass(/verslagvel--leeg/);
    await expect(page.locator('.delen__tel').first()).not.toHaveText('');
    await tot.fill('2026-11-01');
    for (const tel of await page.locator('.delen__tel').all()) await expect(tel).toHaveText('');
    // Het vel blijft staan zolang het datumveld focus heeft (geen verspringen, a-delen-indeling); daarna is het leeg.
    await tot.blur();
    await expect(page.locator('.verslagvel')).toHaveClass(/verslagvel--leeg/);
    await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeDisabled();
  });

  test.describe('R2-18 een weging aanpassen naar een andere week verhuist ze (BESLISSING 409)', () => {
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(DONDERDAG);
      await page.goto('./#/vandaag');
      await zetRij(page, 'wegingen', { week: '2026-11-02', datum: '2026-11-03', kg: 70, voorbeeld: false, gewijzigdOp: 1 });
    });

    async function verhuis(page, dagenTerug) {
      await page.goto('./#/gewicht');
      await page.locator('.gewicht__rijen .rij', { hasText: '3 november' }).click();
      await page.getByRole('button', { name: 'Aanpassen', exact: true }).click();
      const blad = page.locator('dialog[open]');
      for (let i = 0; i < dagenTerug; i += 1) await blad.getByRole('button', { name: 'Vorige', exact: true }).click();
      await blad.getByRole('button', { name: 'Noteren', exact: true }).click();
    }
    const weken = async (page) => (await rijen(page, 'wegingen')).map((w) => [w.week, w.datum, w.kg]).sort();

    test('naar een lege week: de oude week wordt leeg; Ongedaan maken zet ze terug', async ({ page }) => {
      await verhuis(page, 8); // 3 november → 26 oktober
      await expect.poll(() => weken(page)).toEqual([['2026-10-26', '2026-10-26', 70]]);
      await page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' }).click();
      await expect.poll(() => weken(page)).toEqual([['2026-11-02', '2026-11-03', 70]]);
    });

    test('naar een week met een weging: eerst "Vervangen?"; Ongedaan maken zet beide terug', async ({ page }) => {
      await zetRij(page, 'wegingen', { week: '2026-10-26', datum: '2026-10-27', kg: 68, voorbeeld: false, gewijzigdOp: 1 });
      await verhuis(page, 8);
      await page.locator('dialog[open]').getByRole('button', { name: 'Vervangen', exact: true }).click();
      await expect.poll(() => weken(page)).toEqual([['2026-10-26', '2026-10-26', 70]]);
      await page.locator('.strook').getByRole('button', { name: 'Ongedaan maken' }).click();
      await expect.poll(() => weken(page)).toEqual([
        ['2026-10-26', '2026-10-27', 68],
        ['2026-11-02', '2026-11-03', 70],
      ]);
    });

    test('Nee bij "Vervangen?" laat alles staan', async ({ page }) => {
      await zetRij(page, 'wegingen', { week: '2026-10-26', datum: '2026-10-27', kg: 68, voorbeeld: false, gewijzigdOp: 1 });
      await verhuis(page, 8);
      await page.locator('dialog[open]').getByRole('button', { name: 'Laten staan' }).click();
      await expect.poll(() => weken(page)).toEqual([
        ['2026-10-26', '2026-10-27', 68],
        ['2026-11-02', '2026-11-03', 70],
      ]);
    });
  });
});

// Alleen in de demoronde (PW_RONDE=demo, playwright.config.js): de tag @demo.
test.describe('de demo', { tag: '@demo' }, () => {

  test('R5-09 open over middernacht: de nieuwe dag heeft meteen voorbeeldgegevens', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 17, 23, 58, 0));
    await page.goto('./#/vandaag');
    await expect.poll(() => page.locator('.vandaag .laatst__chip').count()).toBeGreaterThan(0);
    await page.clock.setFixedTime(new Date(2026, 10, 18, 0, 3, 0));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#scherm')).toContainText(/woensdag 18 november/i);
    await expect.poll(async () => (await rijen(page, 'dranken')).filter((d) => d.datum === '2026-11-18').length).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.vandaag .laatst__chip').count()).toBeGreaterThan(0);
  });
});

// Dringende melding van de eigenaar (Delen): het voorbeeldkader en "Goed om te weten" moeten vanaf het eerste beeld goed staan, zonder klik.
// Gemeten: de hoogte en scrollHeight van het vel en van .delen__weetjes bij het openen, en dezelfde maten na een klik op "Pdf bewaren".
test.describe('Delen: de indeling klopt vanaf het eerste beeld', () => {
  const zaai = async (page) => {
    await page.clock.setFixedTime(DONDERDAG);
    await page.goto('./#/vandaag');
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(2026, 9, 14 + i);
      const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      for (const soort of ['ontbijt', 'middagmaal', 'avondmaal']) await zetRij(page, 'maaltijden', maaltijd(datum, soort, 'Een gewone maaltijd met brood en soep'));
    }
  };
  // Klaar met opbouwen: het vel is gevuld, niets beweegt nog en de maten staan stil.
  const klaar = async (page) => {
    await domRustig(page);
    await animatiesKlaar(page);
    return wachtTotStil(page, () => maten(page));
  };
  const maten = (page) =>
    page.evaluate(() => {
      const m = (s) => {
        const e = document.querySelector(s);
        return { h: Math.round(e.getBoundingClientRect().height), sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY };
      };
      const uit = [...document.querySelectorAll('#scherm .kaart')].filter((k) => k.scrollHeight > k.clientHeight + 1).map((k) => k.className);
      // Onderkanten in paginacoördinaten (los van hoe ver de pagina gescrold is): de linkerkolom, de rechterkolom en de laatste kaart rechts
      const onder = (s) => Math.round((document.querySelector(s).getBoundingClientRect().bottom + scrollY) * 10) / 10;
      const laatsteRechts = document.querySelector('.delen__rechts').lastElementChild;
      const kaart = document.querySelector('.delen__verslag');
      return {
        vel: m('.verslagvel'),
        kaart: { ch: kaart.clientHeight, sh: kaart.scrollHeight },
        weetjes: m('.delen__weetjes'),
        weetjesRechts: Boolean(document.querySelector('.delen__weetjes').closest('.delen__rechts')),
        links: onder('.delen__bewaren'),
        rechts: onder('.delen__rechts'),
        laatsteRechts: Math.round((laatsteRechts.getBoundingClientRect().bottom + scrollY) * 10) / 10,
        uit,
        klassen: document.querySelector('.delen__rechts').className,
      };
    });
  // Twee metingen zijn dezelfde toestand: klassen en lijsten gelijk, elke maat op hoogstens 1 px.
  const verschillen = (a, b, pad = '') =>
    Object.keys(a).flatMap((k) => {
      if (typeof a[k] === 'number') return Math.abs(a[k] - b[k]) <= 1 ? [] : [`${pad}${k}: ${a[k]} ≠ ${b[k]}`];
      if (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) return verschillen(a[k], b[k], `${pad}${k}.`);
      return JSON.stringify(a[k]) === JSON.stringify(b[k]) ? [] : [`${pad}${k}: ${JSON.stringify(a[k])} ≠ ${JSON.stringify(b[k])}`];
    });

  // Bij openen, zonder één klik, en daarna identiek na "Pdf bewaren" (tabel openen = na klik, ±1 px), voor Vandaag, Deze week, Twee weken en Een maand.
  // De bedoelde werking (BESLISSING 300, 317, 331):
  //  - een lang verslag (hoger dan het kader): het vel scrolt binnenin (overflow auto, en het schuift echt, de pagina niet);
  //    vanaf 1100 px is de kaart "Je verslag" even hoog als de linkerkolom, daaronder het vel tot 60dvh hoog.
  //  - een kort verslag (hier Vandaag: één dag met drie maaltijden; vier dagen zijn al hoger dan het kader): het vel is zo hoog als zijn inhoud (niets te scrollen); vanaf 1100 px eindigen de kolommen
  //    gelijk, met "Goed om te weten" rechts onder het vel als die daar past (is-kort, het vel dan overflow visible).
  // Altijd: "Goed om te weten" minstens zo hoog als haar inhoud en niets loopt uit een kaart.
  // (Eerder eiste deze test ook voor #/delen, dus Vandaag met één dag, dat het vel scrolt: dat spreekt BESLISSING 317 tegen.)
  const PERIODES = { vandaag: { route: 'delen', lang: false }, week: { route: 'delen/2026-11-09/2026-11-12', lang: true }, twee: { route: 'delen/2026-10-30/2026-11-12', lang: true }, maand: { route: 'delen/2026-10-14/2026-11-12', lang: true } };
  for (const breedte of [968, 1280, 1690]) {
    for (const [periode, { route, lang }] of Object.entries(PERIODES)) {
      test(`${breedte} px, ${periode} (#/${route}): het vel staat bij openen goed, niets loopt uit een kaart, en een klik verandert niets`, async ({ page }) => {
        await page.setViewportSize({ width: breedte, height: 900 });
        await zaai(page);
        await page.goto('./#/' + route);
        await expect(page.locator('.verslagvel .verslagvel__rij').first()).toBeVisible();
        const open = await klaar(page);
        const kort = open.klassen.includes('is-kort');
        if (lang) {
          expect(open.vel.oy).toBe('auto');
          expect(open.vel.sh).toBeGreaterThan(open.vel.ch); // het verslag is langer dan het kader: het kader scrolt binnenin
          expect(kort).toBe(false);
          // het vel schuift echt binnenin, de pagina zelf niet
          const geschoven = await page.evaluate(() => {
            const v = document.querySelector('.verslagvel');
            const y = scrollY;
            v.scrollTop = 200;
            const uit = { vel: v.scrollTop, pagina: scrollY - y };
            v.scrollTop = 0;
            return uit;
          });
          expect(geschoven.vel).toBeGreaterThan(0);
          expect(geschoven.pagina).toBe(0);
        } else {
          // kort verslag: het vel toont alles zonder te scrollen; met is-kort groeit het vel met zijn inhoud mee, anders scrolt het als dat nodig is
          expect(open.vel.oy).toBe(kort ? 'visible' : 'auto');
          expect(open.vel.sh).toBeLessThanOrEqual(open.vel.ch + 1);
        }
        if (breedte >= 1100) {
          expect(Math.abs(open.rechts - open.links), 'de kolommen eindigen gelijk').toBeLessThanOrEqual(1);
          expect(Math.abs(open.laatsteRechts - open.links), 'de laatste kaart rechts eindigt op de lijn van links').toBeLessThanOrEqual(1);
          expect(open.weetjesRechts).toBe(kort);
        }
        expect(open.weetjes.h).toBeGreaterThanOrEqual(open.weetjes.sh);
        expect(open.uit).toEqual([]);
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
        await download; // de pdf is gemaakt
        const na = await klaar(page);
        expect(verschillen(open, na), 'de toestand na "Pdf bewaren" is die van bij het openen (±1 px)').toEqual([]);
      });
    }
  }

  test('focus in "Goed om te weten" en het venster van 1699 naar 1280: dezelfde indeling als bij openen op 1280', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await zaai(page);
    await page.goto('./#/delen');
    const vers = await klaar(page);
    await page.setViewportSize({ width: 1699, height: 900 });
    await klaar(page);
    await page.locator('.delen__weetjes button').first().focus();
    await page.setViewportSize({ width: 1280, height: 900 });
    const na = await klaar(page);
    await expect(page.locator('.delen__weetjes button').first()).toBeFocused();
    expect(na.weetjes.h).toBeGreaterThanOrEqual(na.weetjes.sh);
    expect(na.uit).toEqual([]);
    expect(na.klassen).toBe(vers.klassen);
    expect(Math.abs(na.weetjes.h - vers.weetjes.h)).toBeLessThanOrEqual(1);
    expect(Math.abs(na.vel.h - vers.vel.h)).toBeLessThanOrEqual(1);
  });

  test('een venster dat smaller wordt terwijl "Goed om te weten" focus heeft, gaat meteen naar de smalle indeling', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await zaai(page);
    await page.goto('./#/delen');
    await klaar(page);
    await page.locator('.delen__weetjes button').first().focus();
    await page.setViewportSize({ width: 968, height: 900 });
    const smal = await klaar(page);
    expect(smal.klassen).not.toContain('is-kort');
    expect(await page.locator('.delen__rechts .delen__weetjes').count()).toBe(0);
    expect(smal.weetjes.h).toBeGreaterThanOrEqual(smal.weetjes.sh);
    expect(smal.uit).toEqual([]);
  });
});

// Drie fouten van het testteamlid (tests-2): Delen met een datumveld met focus, de focus in de gewichtsgrafiek, snel bladeren in het Dagboek.
test.describe('fouten uit de testronde', () => {
  test('Delen 1440: pijl omhoog in Van (Van na Tot) laat "Je verslag" en "Goed om te weten" even hoog zolang het veld focus heeft', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.setFixedTime(DONDERDAG);
    await page.goto('./#/vandaag');
    for (const soort of ['ontbijt', 'middagmaal', 'avondmaal', 'tussendoortje', 'vieruurtje', 'latesnack']) await zetRij(page, 'maaltijden', maaltijd(D, soort, 'Iets lekkers'));
    await page.goto('./#/delen');
    await page.getByRole('button', { name: 'Aangepast', exact: true }).click();
    await domRustig(page);
    await animatiesKlaar(page);
    const doosjes = () => page.evaluate(() => ['.delen__verslag', '.delen__weetjes'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height)));
    const voor = await doosjes();
    const van = page.locator('.delen__eigen input[type="date"]').first();
    await van.focus();
    await page.keyboard.press('ArrowUp'); // van wordt later dan tot
    await expect(van).toBeFocused();
    await domRustig(page); // wat de toets in gang zette, is getekend
    const na = await wachtTotStil(page, doosjes);
    expect(Math.abs(na[0] - voor[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(na[1] - voor[1])).toBeLessThanOrEqual(1);
  });

  test('Gewicht: de toetsenbordfocus blijft op het punt van de grafiek als de grafiek opnieuw tekent (bv. een andere breedte)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(DONDERDAG);
    await page.goto('./#/vandaag');
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(2026, 10, 9 - 7 * i);
      const datum = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await zetRij(page, 'wegingen', { week: datum, datum, kg: 70 - i * 0.2, voorbeeld: false, gewijzigdOp: 1 });
    }
    await page.goto('./#/gewicht');
    const punt = page.locator('.grafiek__tikgroep[tabindex="0"]');
    await punt.focus();
    await page.keyboard.press('ArrowLeft');
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(label).toBeTruthy();
    await page.setViewportSize({ width: 1180, height: 900 }); // de grafiek tekent opnieuw op een andere breedte
    await domRustig(page); // de nieuwe tekening is klaar
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(label);
  });

  test('Dagboek·Dag: pijl links en meteen pijl rechts landt weer op dezelfde dag (niet op morgen)', async ({ page }) => {
    await page.clock.setFixedTime(DONDERDAG);
    await page.goto('./#/dagboek/dag/2026-11-10');
    await expect(page.locator('#scherm')).toContainText(/10 november/);
    // Twee toetsen in dezelfde taak: de tweede komt nog bij het scherm van vóór de hashwissel.
    await page.evaluate(() => {
      for (const key of ['ArrowLeft', 'ArrowRight']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    await expect(page).toHaveURL(/#\/dagboek\/dag\/2026-11-10$/);
    await domRustig(page); // beide toetsen en de hertekening zijn verwerkt
    await expect(page).toHaveURL(/#\/dagboek\/dag\/2026-11-10$/);
  });
});
