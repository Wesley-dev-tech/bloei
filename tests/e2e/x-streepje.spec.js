// BESLISSING 460: het korte streepje (U+002D) staat overal recht, ook in het sierlettertype (Cormorant Garamond tekent het schuin;
// src/stijl/streepje.css laat voor dat ene teken Jost tekenen). Gemeten op de gebouwde app, op de plaatsen waar het streepje in het
// sierlettertype staat: elk teken "-" in een element met Cormorant wordt gefotografeerd (schermafbeelding van alleen dat teken) en de
// inkt gemeten: breed en laag, en de linker- en de rechterkant van de inkt liggen even hoog (±1 px) en even dik.
// Het streepje moet de maten van het oude schuine streepje hebben (src/stijl/streepje.css, public/fonts/streepje-*.woff): lengte en dikte, lang:dik minstens 5:1.
// (De hoogte boven de basislijn is vastgelegd in tests/logica/streepje.test.js: de plaats van de glyph in het bestand.)
// Thema's Poeder, Salie en Nacht; breedte 390 en 1280.
// Zet STREEPJE_BEELDEN=<map> om per teken de afbeelding en de meting te bewaren (bv. buiten de projectmap).
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { vasteKlok } from './vaste-klok.js';
import { vulGegevens } from './r-gegevens.js';
import { naTekenen, schermKlaar } from './wacht.js';

import { TEKENS } from '../../scripts/maak-streepjesfonts.mjs';

const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle'); // de PNG-lezer die Playwright zelf meebrengt

const THEMAS = ['poeder', 'salie', 'nacht'];
const BREEDTES = [
  { naam: '390', b: 390, h: 844 },
  { naam: '1280', b: 1280, h: 900 },
];
// [route, soort gegevens, minimum aantal tekens "-" in het sierlettertype, wat er staat, knop om eerst te tikken]
// (De titel "Verslag" van het verslagvel en zijn periode staan sinds BESLISSING 461 in de sans-letter: daar geen sierletter-streepje meer.)
const PLAATSEN = [
  ['gewicht', 'leeg', 2, 'Gewicht: laatste weging en Streefgewicht leeg'],
  ['drinken', 'leeg', 1, 'Drinken: Gemiddeld per dag zonder gegevens'],
  ['dagboek/week', 'leeg', 1, 'Dagboek week: kerncijfers zonder gegevens'],
  ['dagboek/maand', 'leeg', 1, 'Dagboek maand: kerncijfers zonder gegevens'],
  ['meer', 'leeg', 0, 'Algemeen'],
  ['delen', 'vol', 0, 'Delen: de periode "ma 9 - do 12 november 2026" (Deze week); sinds BESLISSING 461 een label in de sans-letter, dus geen sierletter-streepje meer', 'Deze week'],
];

async function zetThema(page, thema) {
  await page.evaluate(
    (t) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction('instellingen', 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: t });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    thema,
  );
}

// Draait in de pagina: elk zichtbaar teken "-" in het sierlettertype. Met nr: scrolt het nr-de in beeld en geeft zijn omtrek.
const ZOEK = (arg) => {
  const { nr, scroll } = arg ?? {};
  const uit = [];
  const loper = document.createTreeWalker(document.querySelector('#scherm'), NodeFilter.SHOW_TEXT);
  for (let knoop = loper.nextNode(); knoop; knoop = loper.nextNode()) {
    const el = knoop.parentElement;
    if (!el || el.closest('script, style, [hidden]')) continue;
    const stijl = getComputedStyle(el);
    if (stijl.visibility === 'hidden' || stijl.display === 'none' || !/Cormorant/.test(stijl.fontFamily.split(',')[0])) continue;
    for (let i = 0; i < knoop.data.length; i++) {
      if (knoop.data[i] !== '-') continue;
      const r = document.createRange();
      r.setStart(knoop, i);
      r.setEnd(knoop, i + 1);
      const rect = r.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if (nr === uit.length) {
        if (scroll) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const q = r.getBoundingClientRect();
        return { x: q.x, y: q.y, w: q.width, h: q.height };
      }
      uit.push({ pad: String(el.className || el.tagName), tekst: knoop.data.trim().slice(0, 30), gewicht: stijl.fontWeight, stijl: stijl.fontStyle, grootte: parseFloat(stijl.fontSize) });
    }
  }
  return nr === undefined ? uit : null;
};

// Meet de inkt in een PNG van één teken (in Node: de CSP van de app laat de pagina zelf geen afbeelding decoderen).
const METING = (png, schaal) => {
  const { data, width, height } = PNG.sync.read(png);
  let br = 0, bg = 0, bb = 0, n = 0;
  const rand = (x, y) => {
    const o = (y * width + x) * 4;
    br += data[o]; bg += data[o + 1]; bb += data[o + 2]; n++;
  };
  for (let x = 0; x < width; x++) { rand(x, 0); rand(x, height - 1); }
  for (let y = 0; y < height; y++) { rand(0, y); rand(width - 1, y); }
  br /= n; bg /= n; bb /= n;
  const ruw = (x, y) => {
    const o = (y * width + x) * 4;
    return Math.max(Math.abs(data[o] - br), Math.abs(data[o + 1] - bg), Math.abs(data[o + 2] - bb));
  };
  let max = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) max = Math.max(max, ruw(x, y));
  if (max < 40) return { leeg: true };
  // alleen de inkt van het streepje zelf: de aaneengesloten vlek die het dichtst bij het midden van de afbeelding begint
  // (de afbeelding kan een stukje van een buurelement bevatten)
  let start = null, beste = Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (ruw(x, y) < max * 0.5) continue;
    const d = (x - width / 2) ** 2 + (y - height / 2) ** 2;
    if (d < beste) { beste = d; start = [x, y]; }
  }
  const masker = new Uint8Array(width * height);
  const rij = [start];
  masker[start[1] * width + start[0]] = 1;
  while (rij.length) {
    const [x, y] = rij.pop();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || masker[ny * width + nx] || ruw(nx, ny) < max * 0.15) continue;
      masker[ny * width + nx] = 1;
      rij.push([nx, ny]);
    }
  }
  const sterkte = (x, y) => (masker[y * width + x] ? ruw(x, y) : 0);
  const drempel = max * 0.5;
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (sterkte(x, y) >= drempel) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const breedte = x1 - x0 + 1;
  // per kolom: het zwaartepunt en de dikte van de inkt, voor de linker en de rechter 30 % van de breedte
  const kolom = (x) => {
    let som = 0, gewicht = 0;
    for (let y = 0; y < height; y++) { const s = Math.max(0, sterkte(x, y) - drempel * 0.2); som += s * y; gewicht += s; }
    return { midden: gewicht ? som / gewicht : NaN, dikte: gewicht / max };
  };
  const deel = Math.max(1, Math.round(breedte * 0.3));
  const gem = (van, tot) => {
    const w = [];
    for (let x = van; x < tot; x++) w.push(kolom(x));
    return { midden: w.reduce((a, k) => a + k.midden, 0) / w.length, dikte: w.reduce((a, k) => a + k.dikte, 0) / w.length };
  };
  const xm = Math.round((x0 + x1) / 2);
  let dikteMidden = 0, mom = 0;
  for (let y = 0; y < height; y++) { const v = sterkte(xm, y) / max; dikteMidden += v; mom += v * (y + 0.5); }
  const middenY = mom / dikteMidden;
  const links = gem(x0, x0 + deel);
  const rechts = gem(x1 - deel + 1, x1 + 1);
  return {
    leeg: false,
    breed: breedte / schaal,
    hoog: (y1 - y0 + 1) / schaal,
    verschilHoogte: Math.abs(links.midden - rechts.midden) / schaal, // CSS-px tussen linker- en rechterdeel
    dikteMidden: dikteMidden / schaal, // dikte in de middelste kolom, in CSS-px
    midden: middenY / schaal, // hoogte van het midden van de inkt vanaf de bovenkant van de afbeelding, in CSS-px
    lengte: breedte / schaal,
    dikte: (links.dikte + rechts.dikte) / 2 / schaal,
    verschilDikte: Math.abs(links.dikte - rechts.dikte) / schaal,
  };
};

for (const thema of THEMAS) {
  for (const breedte of BREEDTES) {
    test.describe(`streepje recht: ${thema}, ${breedte.naam}`, () => {
      test.use({ viewport: { width: breedte.b, height: breedte.h } });
      for (const [route, soort, minimum, wat, klik] of PLAATSEN) {
        test(`${wat}`, async ({ page }) => {
          await vasteKlok(page);
          await page.goto('./');
          await page.locator('#scherm[data-scherm]').waitFor({ state: 'attached' });
          await zetThema(page, thema);
          await vulGegevens(page, soort); // herlaadt de pagina
          // Poeder is het standaardthema zonder attribuut
          if (thema === 'poeder') await expect(page.locator('html')).not.toHaveAttribute('data-theme', /salie|nacht/);
          else await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
          await page.goto('./#/' + route);
          await schermKlaar(page, route);
          if (klik) await page.getByRole('button', { name: klik, exact: true }).click();
          await expect(page.locator('#scherm')).toBeVisible();
          await naTekenen(page);
          await page.evaluate(() => document.fonts.ready);
          const gevonden = await page.evaluate(ZOEK);
          expect(gevonden.length, `tekens "-" in het sierlettertype op ${route}`).toBeGreaterThanOrEqual(minimum);
          if (gevonden.length) {
            // de regel voor het teken is echt geladen (anders valt het teken terug op het schuine van Cormorant)
            const geladen = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Cormorant Garamond' && /^U\+2D$/i.test(f.unicodeRange.trim()) && f.status === 'loaded').length);
            expect.soft(geladen, 'de regel met unicode-range U+002D is geladen').toBeGreaterThan(0);
          }

          const bewaar = process.env.STREEPJE_BEELDEN;
          for (let k = 0; k < gevonden.length; k++) {
            await page.evaluate(ZOEK, { nr: k, scroll: true });
            await naTekenen(page);
            const rect = await page.evaluate(ZOEK, { nr: k, scroll: false });
            expect(rect).not.toBeNull();
            const marge = 3;
            const clip = { x: Math.max(0, rect.x - marge), y: Math.max(0, rect.y - marge), width: rect.w + 2 * marge, height: rect.h + 2 * marge };
            const png = await page.screenshot({ clip });
            const m = METING(png, 3);
            const naam = `${route.replace('/', '-')}-${thema}-${breedte.naam}-${k}`;
            if (bewaar) {
              mkdirSync(bewaar, { recursive: true });
              writeFileSync(join(bewaar, naam + '.png'), png);
              writeFileSync(join(bewaar, naam + '.json'), JSON.stringify({ ...gevonden[k], ...m }));
            }
            expect.soft(m.leeg, `${naam}: er is inkt te zien`).toBe(false);
            if (m.leeg) continue;
            // De maten van het oude (schuine) Cormorant-streepje, die in TEKENS staan: lengte ±1 px, dikte ±0,4 px; lang:dik minstens 5:1.
            const g = gevonden[k];
            const t = TEKENS[g.stijl === 'italic' ? 'streepje-500-italic' : Number(g.gewicht) >= 600 ? 'streepje-600' : 'streepje-500'];
            const em = g.grootte / 1000;
            expect.soft(m.lengte / m.dikteMidden, `${naam}: lang:dik minstens 5:1 (${m.lengte.toFixed(1)} x ${m.dikteMidden.toFixed(2)} px)`).toBeGreaterThanOrEqual(5);
            expect.soft(Math.abs(m.lengte - t.lengte * em), `${naam}: lengte ${m.lengte.toFixed(2)} px tegenover ${(t.lengte * em).toFixed(2)} px van het oude streepje`).toBeLessThanOrEqual(1);
            expect.soft(Math.abs(m.dikteMidden - (t.y1 - t.y0) * em), `${naam}: dikte ${m.dikteMidden.toFixed(2)} px tegenover ${((t.y1 - t.y0) * em).toFixed(2)} px van het oude streepje`).toBeLessThanOrEqual(0.4);
            expect.soft(m.verschilHoogte, `${naam}: links en rechts even hoog`).toBeLessThanOrEqual(1);
            expect.soft(m.verschilDikte, `${naam}: links en rechts even dik`).toBeLessThanOrEqual(1);
          }
        });
      }
    });
  }
}

// Offline: het streepjeslettertype zit in de precache van de service worker, dus ook zonder netwerk is het streepje recht, dun en lang.
test('streepje recht, dun en lang: ook zonder netwerk (precache)', async ({ page, context }) => {
  await vasteKlok(page);
  await page.goto('./#/gewicht');
  await schermKlaar(page, 'gewicht');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // wacht tot de service worker alles in de precache heeft gezet (de woff-bestanden van het streepje horen erbij)
  await expect
    .poll(() => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat().filter((u) => /streepje-(500|600|500-italic)[^/]*\.woff$/.test(u)).length), { timeout: 30000 })
    .toBe(3);
  await context.setOffline(true);
  await page.reload();
  await schermKlaar(page, 'gewicht');
  await page.evaluate(() => document.fonts.ready);
  const gevonden = await page.evaluate(ZOEK);
  expect(gevonden.length).toBeGreaterThanOrEqual(2);
  const geladen = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Cormorant Garamond' && /^U\+2D$/i.test(f.unicodeRange.trim()) && f.status === 'loaded').length);
  expect(geladen, 'het streepjeslettertype is offline geladen').toBeGreaterThan(0);
  for (let k = 0; k < gevonden.length; k++) {
    await page.evaluate(ZOEK, { nr: k, scroll: true });
    await naTekenen(page);
    const rect = await page.evaluate(ZOEK, { nr: k, scroll: false });
    const png = await page.screenshot({ clip: { x: rect.x - 3, y: rect.y - 3, width: rect.w + 6, height: rect.h + 6 } });
    const m = METING(png, 3);
    expect(m.leeg).toBe(false);
    expect(m.verschilHoogte).toBeLessThanOrEqual(1);
    expect(m.lengte / m.dikteMidden).toBeGreaterThanOrEqual(5);
  }
  await context.setOffline(false);
});

// De demo hoort hetzelfde te doen: dezelfde css, dezelfde bestanden. Een demo heeft voorbeeldgegevens; we dwingen het teken in het
// sierlettertype te laden en meten, op elk scherm met zo'n streepje, of het recht is.
test.describe('de demo', { tag: '@demo' }, () => {
  for (const route of ['gewicht', 'drinken', 'dagboek/week', 'dagboek/maand']) {
    test(`streepje recht in de demo: ${route}`, async ({ page }) => {
      await vasteKlok(page);
      await page.goto('./#/' + route);
      await schermKlaar(page, route);
      // het streepjeslettertype laadt van het eigen origin in de demobouw
      const geladen = await page.evaluate(async () => {
        await document.fonts.load('500 40px "Cormorant Garamond"', '-');
        await document.fonts.load('600 40px "Cormorant Garamond"', '-');
        await document.fonts.load('italic 500 40px "Cormorant Garamond"', '-');
        return [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Cormorant Garamond' && /^U\+2D$/i.test(f.unicodeRange.trim()) && f.status === 'loaded').length;
      });
      expect(geladen).toBe(3);
      const gevonden = await page.evaluate(ZOEK);
      for (let k = 0; k < gevonden.length; k++) {
        await page.evaluate(ZOEK, { nr: k, scroll: true });
        await naTekenen(page);
        const rect = await page.evaluate(ZOEK, { nr: k, scroll: false });
        const m = METING(await page.screenshot({ clip: { x: Math.max(0, rect.x - 3), y: Math.max(0, rect.y - 3), width: rect.w + 6, height: rect.h + 6 } }), 3);
        if (m.leeg) continue;
        expect.soft(m.verschilHoogte, `${route} ${k}: links en rechts even hoog`).toBeLessThanOrEqual(1);
        expect.soft(m.lengte / m.dikteMidden, `${route} ${k}: lang:dik minstens 5:1`).toBeGreaterThanOrEqual(5);
      }
    });
  }
});
