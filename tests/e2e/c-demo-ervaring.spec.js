// De demoversie (BESLISSING 364): gevuld bij het eerste bezoek, de balk met "Opnieuw beginnen", en op iPhone, iPad en desktop.
// Twee bouwversies (playwright.config.js, BESLISSING 408):
//   demo:  npm run e2e:demo -- c-demo-ervaring    de ronde met de tag @demo (bouw met --mode demo)
//   echt:  npm run e2e -- c-demo-ervaring         (de balk en de voorbeelddata bestaan dan niet)
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, naTekenen, schermKlaar } from './wacht.js';

const LEEG = { cookies: [], origins: [] }; // een eerste bezoek: niets in de opslag

// De formaten van de eigenaar: iPhone, iPad en desktop. Aanraking (geen hover) op iPhone en iPad.
const FORMATEN = [
  ['iPhone 360x740', 360, 740, true], ['iPhone 390x844', 390, 844, true], ['iPhone 430x932', 430, 932, true], ['iPhone liggend 844x390', 844, 390, true],
  ['iPad 768x1024', 768, 1024, true], ['iPad 820x1180', 820, 1180, true], ['iPad 1024x1366', 1024, 1366, true],
  ['iPad liggend 1024x768', 1024, 768, true], ['iPad liggend 1180x820', 1180, 820, true], ['iPad liggend 1366x1024', 1366, 1024, true],
  ['desktop 1280x800', 1280, 800, false], ['desktop 1440x900', 1440, 900, false], ['desktop 1690x1230', 1690, 1230, false], ['desktop 1920x1080', 1920, 1080, false],
];

const TABBLADEN = ['vandaag', 'dagboek', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht', 'meer', 'delen'];

// Een eerste bezoek: de app opent, vult zich en toont het scherm.
async function open(page, pad = 'vandaag') {
  await page.goto('./#/' + pad);
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await expect(page.locator('.demo-balk')).toBeVisible();
}

// Schrijft een eigen maaltijd rechtstreeks in de demodatabase (de naam van de database staat nergens vast in de test).
async function schrijfEigenMaaltijd(page) {
  await page.evaluate(
    () =>
      new Promise(async (klaar, mislukt) => {
        const namen = (await indexedDB.databases()).map((d) => d.name).filter((n) => n && n.startsWith('bloei'));
        const open = indexedDB.open(namen.find((n) => n === 'bloei-demo') ?? namen[0]);
        open.onerror = () => mislukt(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const t2 = (x) => String(x).padStart(2, '0');
          const nu = new Date();
          const datum = `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`;
          const tx = idb.transaction(['maaltijden'], 'readwrite');
          tx.objectStore('maaltijden').put({ datum, soort: 'vieruurtje', tijd: '16:00', tekst: 'Eigen vieruurtje van de test', fotoId: null, voorbeeld: false, gewijzigdOp: Date.now() });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
  );
}

async function drankToevoegen(page) {
  await page.goto('./#/drinken');
  await page.getByRole('button', { name: /Kan water/ }).first().click();
  await expect(page.getByText(/2,25/).first()).toBeVisible();
}

// ============================================================ de demo
test.describe('demo', { tag: '@demo' }, () => {
  test.use({ storageState: LEEG });
  // De voorbeeldgegevens worden rond "nu" gezaaid (3 van 6, 1,45 l): een vaste dag en een vast uur (BESLISSING 408).
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('eerste bezoek: alles gevuld, de begroeting met Sofie, de cijfers van vandaag, geen foutmeldingen in de console', async ({ page }) => {
    const fouten = [];
    page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) fouten.push(m.text()); });
    page.on('pageerror', (e) => fouten.push(e.message));
    await open(page);
    await expect(page.locator('.vandaag h1')).toHaveText(/^Goeie(morgen|middag|navond), Sofie$/);
    await expect(page.locator('.vandaag')).toContainText('3 van 6');
    await expect(page.locator('.vandaag')).toContainText('1,45');
    await expect(page.locator('.vandaag')).toContainText('1 van 3');
    await expect(page.locator('.leeg')).toHaveCount(0);
    for (const pad of TABBLADEN) {
      await page.goto('./#/' + pad);
      await schermKlaar(page, pad);
      await expect(page.locator('#scherm .leeg'), `lege toestand op ${pad}`).toHaveCount(0);
      expect((await page.locator('#scherm').innerText()).length, pad).toBeGreaterThan(80);
    }
    await page.goto('./#/supplementen');
    await expect(page.locator('#scherm')).toContainText('Multivitamine');
    await expect(page.locator('#scherm')).toContainText('Voorbeeldspuit');
    // geen viering of melding over nieuwe badges bij de start
    await expect(page.getByText(/nieuwe badges/)).toHaveCount(0);
    expect(fouten).toEqual([]);
  });

  test('de balk is een region met een naam, staat na de skip-link en vóór de navigatie, en zegt wat de demo is', async ({ page }) => {
    await open(page);
    const balk = page.getByRole('region', { name: 'Demo' });
    await expect(balk).toBeVisible();
    // BESLISSING 674: de balk zegt eerlijk dat wat je wijzigt niet blijft staan (onder 560 px de korte zin)
    await expect(balk).toContainText(/Demo · (probeer gerust alles, niets blijft bewaard|niets blijft bewaard)/);
    const volgorde = await page.evaluate(() => [...document.querySelector('#app').children].map((el) => el.className || el.id));
    expect(volgorde.slice(0, 2)).toEqual(['sla-over', 'demo-balk']);
    await expect(page.getByRole('button', { name: /Opnieuw beginnen/ })).toBeVisible();
  });

  test('"Opnieuw beginnen": Nee en Escape doen niets, Ja zet alles terug, ook na een eigen drank en maaltijd', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Opnieuw beginnen/ }).click();
    await expect(page.locator('.demo-balk')).toContainText('Alles wissen en opnieuw vullen?');
    await expect(page.locator('.demo-balk__zeker')).toBeFocused();
    await page.getByRole('button', { name: 'Nee' }).click();
    await expect(page.getByRole('button', { name: /Opnieuw beginnen/ })).toBeFocused();
    await page.getByRole('button', { name: /Opnieuw beginnen/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.demo-balk')).not.toContainText('Alles wissen');
    await expect(page.getByRole('button', { name: /Opnieuw beginnen/ })).toBeFocused();
    // wijzigingen blijven na herladen
    await drankToevoegen(page);
    await schrijfEigenMaaltijd(page);
    await page.reload();
    await page.goto('./#/vandaag');
    await expect(page.locator('.vandaag')).toContainText('2,25');
    await expect(page.locator('.vandaag')).toContainText('4 van 6');
    // Ja: alles terug op de beginstand en op Vandaag
    await page.getByRole('button', { name: /Opnieuw beginnen/ }).click();
    await page.getByRole('button', { name: 'Ja' }).click();
    await page.waitForURL(/#\/vandaag$/);
    await expect(page.locator('.vandaag')).toContainText('1,45');
    await expect(page.locator('.vandaag')).toContainText('3 van 6');
    await expect(page.locator('.vandaag h1')).toContainText('Sofie');
    await expect(page.getByText('Eigen vieruurtje van de test')).toHaveCount(0);
  });

  for (const [naam, breed, hoog, touch] of FORMATEN) {
    test.describe(naam, () => {
      test.use({ viewport: { width: breed, height: hoog }, hasTouch: touch, isMobile: touch && breed < 1100, deviceScaleFactor: 1 });

      test('de balk past, duwt de app omlaag en bedekt niets; tikvlak minstens 44 px; geen horizontale scroll', async ({ page }) => {
        await open(page);
        for (const pad of ['vandaag', 'drinken', 'dagboek/maand']) {
          await page.goto('./#/' + pad);
          await schermKlaar(page, pad);
          const m = await page.evaluate(() => {
            const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }; };
            const zichtbaar = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
            const balk = document.querySelector('.demo-balk');
            const knop = balk.querySelector('button');
            const tekst = [...balk.querySelectorAll('.demo-balk__lang, .demo-balk__kort')].find(zichtbaar);
            const zij = document.querySelector('#zijbalk');
            const tab = document.querySelector('#tabbalk');
            const scherm = document.querySelector('#scherm');
            const h1 = document.querySelector('.vandaag h1');
            return {
              balk: rect(balk), knop: rect(knop), tekstKlasse: tekst?.className, tekstHoogte: balk.querySelector('.demo-balk__tekst').getBoundingClientRect().height,
              zij: zichtbaar(zij) ? rect(zij) : null, tab: zichtbaar(tab) ? rect(tab) : null, scherm: rect(scherm),
              h1: h1 ? { ...rect(h1), lettergrootte: parseFloat(getComputedStyle(h1).fontSize) } : null,
              breedteScroll: document.documentElement.scrollWidth, binnenBreed: window.innerWidth, binnenHoog: window.innerHeight,
            };
          });
          const ctx = `${naam} op ${pad}`;
          expect(m.balk.top, ctx).toBe(0);
          expect(m.balk.left, ctx).toBe(0);
          expect(m.balk.right, ctx).toBe(m.binnenBreed);
          expect(m.breedteScroll, `${ctx}: horizontale scroll`).toBeLessThanOrEqual(m.binnenBreed);
          expect(m.knop.height, ctx).toBeGreaterThanOrEqual(44);
          expect(m.knop.width, ctx).toBeGreaterThanOrEqual(44);
          expect(m.knop.top, ctx).toBeGreaterThanOrEqual(m.balk.top);
          expect(m.knop.bottom, ctx).toBeLessThanOrEqual(m.balk.bottom);
          expect(m.knop.right, ctx).toBeLessThanOrEqual(m.binnenBreed);
          expect(m.tekstKlasse, ctx).toBe(breed < 560 ? 'demo-balk__kort' : 'demo-balk__lang');
          expect(m.tekstHoogte, `${ctx}: de tekst past op één regel`).toBeLessThan(26);
          expect(m.balk.height, ctx).toBeLessThanOrEqual(hoog < 500 ? 48 : 52);
          // niets van de app onder de balk
          expect(m.scherm.top, ctx).toBeGreaterThanOrEqual(m.balk.bottom - 0.5);
          if (m.zij) {
            expect(m.zij.top, `${ctx}: zijbalk`).toBeGreaterThanOrEqual(m.balk.bottom - 0.5);
            expect(m.zij.bottom, `${ctx}: zijbalk`).toBeLessThanOrEqual(m.binnenHoog + 0.5);
          }
          if (m.tab) {
            expect(m.tab.top, `${ctx}: tabbalk`).toBeGreaterThanOrEqual(m.balk.bottom);
            expect(m.tab.bottom, `${ctx}: tabbalk`).toBeLessThanOrEqual(m.binnenHoog + 0.5);
            expect(m.tab.top - m.balk.bottom, `${ctx}: ruimte voor de inhoud`).toBeGreaterThanOrEqual(hoog < 500 ? 180 : 300);
          }
          expect(Boolean(m.zij) !== Boolean(m.tab), ctx).toBe(true);
          expect(Boolean(m.zij), `${ctx}: zijbalk vanaf 960 px`).toBe(breed >= 960);
          // de begroeting met Sofie: op één regel waar de echte app dat eist (vanaf 960 px, r-vandaag-dagboek); op smallere schermen breekt ze
          // bewust na de komma (hoogstens twee regels)
          if (pad === 'vandaag' && m.h1) expect(m.h1.height, `${ctx}: begroeting`).toBeLessThan(m.h1.lettergrootte * (breed >= 960 ? 1.7 : 2.9));
        }
      });

      test('een sticky schermkop blijft na scrollen onder de balk', async ({ page }) => {
        await open(page, 'dagboek');
        await animatiesKlaar(page);
        await page.evaluate(() => window.scrollTo(0, 400));
        await naTekenen(page);
        const r = await page.evaluate(() => {
          const balk = document.querySelector('.demo-balk').getBoundingClientRect().bottom;
          const kop = document.querySelector('#scherm .schermkop');
          return { balk, kop: kop ? kop.getBoundingClientRect().top : null, sticky: kop ? getComputedStyle(kop).position : null };
        });
        if (r.kop !== null && r.sticky === 'sticky') expect(r.kop).toBeGreaterThanOrEqual(r.balk - 0.5);
      });
    });
  }
});

// ============================================================ de echte bouw
test.describe('echte versie', () => {
  test('geen demo-balk, geen voorbeelddata: de bouw bevat de naam van de demo niet en laadt geen demo-bestand', async ({ page }) => {
    const verzoeken = [];
    page.on('request', (v) => verzoeken.push(v.url()));
    await page.goto('./');
    await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
    // Alles wat de start laadt, is geladen (ook wat pas na het eerste scherm komt).
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.demo-balk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.classList.contains('demo'))).toBe(false);
    expect(verzoeken.filter((u) => /\/assets\/(start|voorbeelddata|balk|demo)[-.]/.test(u))).toEqual([]);
    await expect(page.locator('body')).not.toContainText('Sofie');
    const map = process.env.PW_OUTDIR || 'dist';
    const bestanden = [];
    (function loop(m) {
      for (const naam of readdirSync(m)) {
        const pad = join(m, naam);
        if (statSync(pad).isDirectory()) loop(pad);
        else if (/\.(js|css|html|json|webmanifest|txt)$/.test(naam)) bestanden.push(pad);
      }
    })(map);
    expect(bestanden.length).toBeGreaterThan(3);
    for (const b of bestanden) {
      const inhoud = readFileSync(b, 'utf8');
      expect(inhoud.includes('Sofie'), `${b} bevat de demonaam`).toBe(false);
      expect(inhoud.includes('demo-balk'), `${b} bevat de demo-balk`).toBe(false);
      // BESLISSING 706: de namen die alleen in de voorbeeldgegevens van de demo voorkomen
      // (de stijlpagina, alleen in een testbouw en nooit in productie, toont dezelfde namen als voorbeeld in een lijst: die telt niet mee)
      const stijlpagina = /[\\/](stijl\.html|assets[\\/]stijl-[^\\/]+\.js)$/.test(b);
      if (!stijlpagina) for (const supplement of ['Voorbeeldspuit', 'Kurkuma']) expect(inhoud.includes(supplement), `${b} bevat de voorbeeldsupplementen`).toBe(false);
      // BESLISSING 673 en 674: de zinnen van het kaartje bij "Profiel verwijderen" en van de balk, en het bezoek, alleen in de demo
      for (const stuk of ['Dit is de demo', 'verwijder je met deze knop', 'niets blijft bewaard', 'probeer gerust alles', 'toonProfielUitleg', 'startBezoek', 'bloei-demo-bezoek', 'bloei-demo-open',
        // BESLISSING 675: het voorbeeld van het welkomscherm, alleen in de demo
        'Zo begint een nieuwe gebruiker', 'er wordt niets bewaard', 'niets wordt bewaard','Terug naar de demo', 'In de demo blijft Bloei open', 'Er is niets bewaard:','demo-voorbeeld', 'zetVoorbeeldBalk']) {
        expect(inhoud.includes(stuk), `${b} bevat "${stuk}"`).toBe(false);
      }
    }
    expect(verzoeken.filter((u) => /\/assets\/(profiel|bezoek|teksten|voorbeeld)[-.]/.test(u))).toEqual([]);
  });
});
