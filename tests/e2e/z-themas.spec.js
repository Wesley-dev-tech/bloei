// De thema's Salie en Nacht (controle 15 november): per scherm een vaste meting van de berekende kleuren.
//  1. tekst: de berekende tekstkleur tegenover de echte achtergrond haalt 4,5 : 1 (3 : 1 voor grote tekst: 24 px, of 18,66 px vet);
//  2. bedieningsdelen: het vinkvak en de baan van een schakelaar in de uit-stand halen 3 : 1 tegenover hun vlak (WCAG 1.4.11);
//  3. Nacht: geen vlak is licht, behalve het bewust lichte vel van het verslag en de themavoorbeelden;
//  4. het vel van het verslag blijft in elk thema licht met donkere tekst;
//  5. de vier themavoorbeelden op Algemeen tonen de achtergrondkleur van hun thema.
// Elk geval wordt gemeten (BESLISSING 340); er is geen lijst met bekende uitzonderingen meer (BESLISSING 408: niets overgeslagen).
// Gedimde onderdelen (opacity < 1: uitgeschakeld, zoals herinneringen zonder toestemming) tellen niet mee: een uitgeschakeld onderdeel hoeft geen contrast te halen.
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

const THEMAS = ['salie', 'nacht'];

// [route, wat er op staat]
const SCHERMEN = [
  ['vandaag', 'Vandaag'],
  ['dagboek/dag', 'Dagboek dag'],
  ['dagboek/week', 'Dagboek week'],
  ['dagboek/maand', 'Dagboek maand'],
  ['drinken', 'Drinken'],
  ['supplementen', 'Supplementen'],
  ['gewicht', 'Gewicht'],
  ['meer', 'Algemeen'],
  ['meer/instellingen', 'Instellingen Drinken'],
  ['meer/gewicht', 'Instellingen Gewicht'],
  ['meer/vergrendeling', 'Instellingen Vergrendeling'],
  ['meer/profiel', 'Naam en profielfoto'],
  ['meer/favorieten', 'Favorieten'],
  ['meer/badges', 'Badges'],
  ['meer/meldingen', 'Herinneringen'],
  ['meer/uitleg', 'Rondleiding'],
  ['delen', 'Delen'],
];

// Onderdelen waarvan de achtergrond een tekening is (een rondje achter het getal van vandaag): de meting ziet dat vlak niet.
const TEKENING = /(kalender__nr|mk__nr) cijfer$|is-vandaag/;

async function zetThemaEnGegevens(page, thema) {
  // vulGegevens zaait rond "nu": een vaste dag en een vast uur (BESLISSING 408).
  await vasteKlok(page);
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
  await page.evaluate(
    (t) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: t });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    thema,
  );
  await vulGegevens(page, 'vol'); // herlaadt de pagina
  await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
}

async function open(page, route) {
  await page.goto('./#/' + route);
  await expect(page.locator('#scherm')).toHaveAttribute('data-scherm', route.split('/')[0] === 'meer' || route.split('/')[0] === 'dagboek' ? new RegExp('^' + route.split('/')[0]) : route);
  await schermKlaar(page, route); // de openingsanimaties zijn voorbij
}

// Draait in de pagina: de tekstknopen onder de norm, en alle vlakken met een lichte achtergrond.
const METING = () => {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
    }
    const c = s.match(/color\(srgb ([^)]+)\)/);
    if (c) {
      const p = c[1].split(/[ /]+/).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 };
    }
    return { r: 0, g: 0, b: 0, a: 0 };
  };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => {
    const k = [c.r, c.g, c.b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
  };
  const verhouding = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const achtergrond = (el) => {
    let c = { r: 255, g: 255, b: 255, a: 1 };
    for (const e of [...(function* () { for (let p = el; p; p = p.parentElement) yield p; })()].reverse()) {
      const b = parse(getComputedStyle(e).backgroundColor);
      if (b.a > 0) c = over(b, c);
    }
    return c;
  };
  const tekst = [];
  const gezien = new Set();
  const lopen = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (lopen.nextNode()) {
    const knoop = lopen.currentNode;
    const t = knoop.textContent.trim();
    const el = knoop.parentElement;
    if (!t || !el || el.closest('script,style,svg,.verslagvel,.themavoorbeeld')) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    let dekking = 1;
    for (let p = el; p; p = p.parentElement) dekking *= Number(getComputedStyle(p).opacity);
    if (dekking < 1) continue; // gedimd = uitgeschakeld of nog in een overgang
    const bg = achtergrond(el);
    const f = parse(cs.color);
    const px = parseFloat(cs.fontSize);
    const groot = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    const norm = groot ? 3 : 4.5;
    const v = verhouding(over(f, bg), bg);
    const eigen = el.className?.toString?.() || '';
    const klasse = eigen || el.tagName + ' in ' + (el.parentElement?.className?.toString?.() || '');
    const sleutel = klasse + '|' + cs.color + '|' + bg.r + bg.g + bg.b;
    if (v < norm && !gezien.has(sleutel)) {
      gezien.add(sleutel);
      tekst.push({ tekst: t.slice(0, 30), klasse, verhouding: Math.round(v * 100) / 100, norm });
    }
  }
  const licht = [];
  const klassen = new Set();
  for (const el of document.querySelectorAll('html, body, #scherm, #tabbalk, #zijbalk, .kaart, dialog, .veld__invoer, .tegel, .rij, .schermkop, .grafiek')) {
    if (el.closest('.verslagvel, .themavoorbeeld')) continue;
    const bg = parse(getComputedStyle(el).backgroundColor);
    const r = el.getBoundingClientRect();
    if (bg.a < 0.9 || r.width < 8 || r.height < 8) continue;
    if (lum(bg) > 0.3) {
      const k = (el.id || '') + '.' + (el.className?.toString?.() || el.tagName);
      if (!klassen.has(k)) {
        klassen.add(k);
        licht.push({ element: k, achtergrond: getComputedStyle(el).backgroundColor });
      }
    }
  }
  return { tekst, licht };
};

for (const thema of THEMAS) {
  test.describe(`thema ${thema}`, () => {
    test.beforeEach(async ({ page }) => {
      await zetThemaEnGegevens(page, thema);
    });

    for (const [route, naam] of SCHERMEN) {
      test(`${naam}: tekst haalt de contrastnorm en (Nacht) niets is licht`, async ({ page }) => {
        await open(page, route);
        const { tekst, licht } = await page.evaluate(METING);
        const fouten = tekst.filter((x) => !TEKENING.test(x.klasse));
        expect(fouten, `${naam} in ${thema}: tekst onder de norm`).toEqual([]);
        if (thema === 'nacht') expect(licht, `${naam} in Nacht: lichte vlakken`).toEqual([]);
      });
    }

    test('Bedieningsdelen: vinkvak en schakelaar in de uit-stand halen 3 : 1 tegenover hun vlak', async ({ page }) => {
      await open(page, 'meer/meldingen');
      // De schakelaars op Herinneringen staan standaard uit; het vinkvak staat op Delen (uit voor Gewicht en Notities).
      const meet = () =>
        page.evaluate(() => {
          const parse = (s) => {
            const m = s.match(/rgba?\(([^)]+)\)/);
            if (m) {
              const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
              return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
            }
            const c = s.match(/color\(srgb ([^)]+)\)/);
            const p = c[1].split(/[ /]+/).map(Number);
            return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 };
          };
          const lum = (c) => {
            const k = [c.r, c.g, c.b].map((v) => {
              v /= 255;
              return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
          };
          const vh = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
          const vlak = (el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const b = parse(getComputedStyle(p).backgroundColor);
              if (b.a > 0.9) return b;
            }
            return { r: 255, g: 255, b: 255, a: 1 };
          };
          const uit = [];
          for (const baan of document.querySelectorAll('.schakelaar[aria-checked="false"]:not(:disabled) .schakelaar__baan')) {
            uit.push({ onderdeel: 'schakelaar', verhouding: vh(parse(getComputedStyle(baan).backgroundColor), vlak(baan)) });
          }
          for (const vak of document.querySelectorAll('.vinkvak[aria-checked="false"]:not(:disabled) .vinkvak__vak')) {
            uit.push({ onderdeel: 'vinkvak', verhouding: vh(parse(getComputedStyle(vak).borderTopColor), vlak(vak)) });
          }
          return uit;
        });
      const eerste = await meet();
      await open(page, 'delen');
      const tweede = await meet();
      const alle = [...eerste, ...tweede];
      expect(alle.length, 'er is minstens één schakelaar of vinkvak in de uit-stand gemeten').toBeGreaterThan(0);
      for (const m of alle) expect(m.verhouding, m.onderdeel).toBeGreaterThanOrEqual(3);
    });

    test('Het vel van het verslag blijft licht met donkere tekst', async ({ page }) => {
      await open(page, 'delen');
      const vel = page.locator('.verslagvel').first();
      await expect(vel).toBeVisible();
      const m = await vel.evaluate((el) => {
        const l = (s) => {
          const p = s.match(/[\d.]+/g).map(Number);
          const k = p.slice(0, 3).map((v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
        };
        const kop = el.querySelector('h1, h2, .verslagvel__naam, .verslagvel__wat') || el;
        return { achtergrond: l(getComputedStyle(el).backgroundColor), tekst: l(getComputedStyle(kop).color) };
      });
      expect(m.achtergrond, 'het vel is licht').toBeGreaterThan(0.8);
      expect(m.tekst, 'de tekst op het vel is donker').toBeLessThan(0.1);
    });

    test('De vier themavoorbeelden op Algemeen tonen de achtergrond van hun thema', async ({ page }) => {
      await open(page, 'meer');
      // De achtergrond van elk thema, gelezen uit de tokens zelf (een element met data-theme dat --c-bg als achtergrond krijgt).
      const verwacht = await page.evaluate(() => {
        const uit = {};
        for (const thema of ['poeder', 'salie', 'nacht']) {
          const e = document.createElement('div');
          if (thema !== 'poeder') e.setAttribute('data-theme', thema);
          e.style.setProperty('background-color', 'var(--c-bg)');
          document.body.append(e);
          uit[thema] = getComputedStyle(e).backgroundColor;
          e.remove();
        }
        // Poeder staat niet op een element met data-theme: de pagina staat in een ander thema. De merkkleur Porselein is de achtergrond van Poeder.
        const p = document.createElement('div');
        p.style.setProperty('background-color', 'var(--bloei-porselein)');
        document.body.append(p);
        uit.poeder = getComputedStyle(p).backgroundColor;
        p.remove();
        return uit;
      });
      const tegel = async (naam) =>
        page.locator('.themategel', { hasText: naam }).first().locator('.themavoorbeeld').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
      expect(await tegel('Poeder')).toEqual([verwacht.poeder]);
      expect(await tegel('Salie')).toEqual([verwacht.salie]);
      expect(await tegel('Nacht')).toEqual([verwacht.nacht]);
      const auto = await tegel('Toestel'); // buitenste vak + de twee helften: licht (Poeder) en donker (Nacht)
      expect(auto).toContain(verwacht.poeder);
      expect(auto).toContain(verwacht.nacht);
    });
  });
}

// Een afgevinkt vinkvak: het vinkje haalt 3 : 1 tegenover het gevulde vlak (WCAG 1.4.11), in elk thema (de schakelaar aan gebruikt hetzelfde token --c-health-gevuld).
for (const thema of THEMAS) {
  test(`${thema}: een afgevinkt vinkvak haalt 3 : 1 voor het vinkje op het vlak`, async ({ page }) => {
    await zetThemaEnGegevens(page, thema);
    await open(page, 'delen');
    const vh = await page.evaluate(() => {
      const k = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const l = (c) => {
        const f = c.map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      const vak = document.querySelector('.vinkvak[aria-checked="true"] .vinkvak__vak');
      if (!vak) return null;
      const x = l(k(getComputedStyle(vak).backgroundColor));
      const y = l(k(getComputedStyle(vak).color));
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    });
    expect(vh, 'er is een afgevinkt vinkvak op Delen').not.toBeNull();
    expect(vh).toBeGreaterThanOrEqual(3);
  });
}
