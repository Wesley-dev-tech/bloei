// BESLISSING 608: op een venster smaller dan 720 px met minder dan 500 px zichtbare hoogte wordt het glas van Drinken op Vandaag kleiner getekend,
// zodat het blok met het glas en Laatste weghalen (het vak van de rondleiding, .drinkkaart__links) hoogstens 190 px hoog is en met 12 px tot de kop
// en 12 px tot de kaart past. Het glas behoudt zijn vorm (breedte en hoogte schalen samen), cijfers en Laatste weghalen blijven heel en leesbaar,
// het tikvlak van Laatste weghalen blijft minstens 44 px. Op hogere schermen en vanaf 720 px breed verandert niets: glas en blok houden hun maat.
// GLAS_MELDING=1 drukt de gemeten tabel af.
import { test, expect } from '@playwright/test';
import { vulGegevens } from './r-gegevens.js';
import { vasteKlok } from './vaste-klok.js';
import { animatiesKlaar, schermKlaar } from './wacht.js';

// Maten van het blok en het glas zoals ze waren voor 608 (BESLISSING 608: hoger dan 499 px of vanaf 720 px breed verandert niets).
const HOOG = [
  { b: 390, h: 660, blok: 226.3, glasH: 200 },
  { b: 445, h: 580, blok: 219.42, glasH: 200 },
  { b: 360, h: 560, blok: 226.3, glasH: 200 },
  { b: 820, h: 1180, blok: 355.77, glasH: 200 },
  { b: 1280, h: 800, blok: 344.31, glasH: 139.97 },
];
const LAAG = [
  { b: 435, h: 470 },
  { b: 445, h: 480 },
  { b: 360, h: 480 },
  { b: 320, h: 480 },
];
const THEMAS = ['poeder', 'nacht'];
test.use({ deviceScaleFactor: 2 });

async function zet(page, thema) {
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
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    thema,
  );
  await vulGegevens(page, 'vol');
  if (thema !== 'poeder') await expect(page.locator('html')).toHaveAttribute('data-theme', thema);
  else await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
}

async function meet(page, b, h, foto) {
  await page.setViewportSize({ width: b, height: h });
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  await animatiesKlaar(page);
  if (process.env.GLAS_FOTO && foto) {
    await page.evaluate(() => window.scrollBy(0, document.querySelector('.vandaag .drinkkaart__links').getBoundingClientRect().top - 96));
    await page.evaluate(() => document.querySelectorAll('.vieringhouder').forEach((e) => e.style.setProperty('display', 'none')));
    await animatiesKlaar(page);
    await page.screenshot({ path: `${process.env.GLAS_FOTO}/${process.env.GLAS_TAG || 'x'}-${foto}-${b}x${h}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  return page.evaluate(() => {
    const r = (el) => {
      const x = el.getBoundingClientRect();
      return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height };
    };
    const links = document.querySelector('.vandaag .drinkkaart__links');
    const glas = links.querySelector('.watervulling');
    const getal = links.querySelector('.cijfer-groot');
    const stand = links.querySelector('.drinkkaart__stand');
    const baan = links.querySelector('.drinkbaan');
    const knop = links.querySelector('.drinkkaart__acties .knop');
    const kaart = links.closest('.drinkkaart');
    const kop = kaart.querySelector('.drinkkaart__label');
    const kl = links.querySelector(':scope > .label');
    const l = r(links);
    // Het vak van de rondleiding volgt de zichtbare inhoud (niet de lege tikrand van Laatste weghalen): van het label tot de onderkant van de getekende rand van het glas of van Laatste weghalen.
    const inh = [kl, glas.querySelector('.watervulling__rand') || glas, getal, baan, ...links.querySelectorAll('.t-klein, .laatst, .laatst__chip'), ...knop.children].map(r).filter((x) => x.w > 0 && x.h > 0);
    const vak = { t: Math.min(...inh.map((x) => x.t)), b: Math.max(...inh.map((x) => x.b)) };
    const delen = { kl, glas, getal, baan, knop }; // de delen binnen het blok
    const buiten = Object.entries(delen).filter(([, el]) => {
      if (!el) return false;
      const x = r(el);
      return x.l < l.l - 0.5 || x.r > l.r + 0.5 || x.t < l.t - 0.5 || x.b > l.b + 0.5;
    }).map(([k]) => k);
    // Tikvlak van Laatste weghalen: het element met zijn doorzichtige rand of vergrotend pseudo-element, gemeten met elementFromPoint.
    const kr = r(knop);
    const raakt = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === knop || knop.contains(e)); };
    let top = kr.t, bodem = kr.b;
    const midx = (kr.l + kr.r) / 2;
    while (raakt(midx, top - 1) && kr.t - top < 40) top -= 1;
    while (raakt(midx, bodem + 1) && bodem - kr.b < 40) bodem += 1;
    // overlap van glas en stand
    const g = r(glas), s = r(stand);
    const overlap = !(g.r <= s.l + 0.5 || s.r <= g.l + 0.5 || g.b <= s.t + 0.5 || s.b <= g.t + 0.5);
    const tekstBreed = [getal, baan, knop, ...links.querySelectorAll('.t-klein, .laatst__chip')].filter(Boolean).some((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible');
    return {
      blok: vak.b - vak.t, glasH: g.h, glasB: g.w, vorm: g.w / g.h,
      buiten, overlap, tekstBreed,
      tikH: bodem - top, knopH: kr.h,
      lettergrootte: parseFloat(getComputedStyle(getal).fontSize),
      knopLetter: parseFloat(getComputedStyle(knop).fontSize),
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      kaartH: r(kaart).h, kopH: r(kop).h,
      delenH: { label: r(kl).h, stand: r(stand).h, cijfer: r(getal).h, klein: r(links.querySelector('.t-klein')).h, baan: r(baan).h, acties: r(links.querySelector('.drinkkaart__acties')).h, knop: kr.h },
    };
  });
}

test.describe('BESLISSING 608: het glas op een laag venster', () => {
  const rapport = [];
  test.afterAll(() => {
    if (process.env.GLAS_MELDING) console.log('GLASTABEL\n' + rapport.map((x) => JSON.stringify(x)).join('\n'));
  });

  for (const thema of THEMAS) {
    test.describe(thema, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await zet(page, thema);
      });

      test('hoger dan 499 px of vanaf 720 px breed: glas en blok houden hun maat', async ({ page }) => {
        for (const v of HOOG) {
          const m = await meet(page, v.b, v.h, thema);
          rapport.push({ thema, ...v, ...m });
          if (v.blok) {
            expect(m.blok, `blok ${v.b}x${v.h}`).toBeCloseTo(v.blok, 0);
            expect(m.glasH, `glas ${v.b}x${v.h}`).toBeCloseTo(v.glasH, 0);
          }
        }
      });

      test('onder 720 px breed en onder 500 px hoog: blok hoogstens 190 px, glas niet vervormd, niets afgekapt', async ({ page }) => {
        const vorm = (await meet(page, 390, 660)).vorm;
        for (const v of LAAG) {
          const m = await meet(page, v.b, v.h, thema);
          rapport.push({ thema, ...v, ...m });
          const wie = `${v.b}x${v.h}`;
          expect(m.blok, `blok ${wie}`).toBeLessThanOrEqual(190);
          expect(m.vorm, `vorm van het glas ${wie}`).toBeCloseTo(vorm, 2);
          expect(m.buiten, `delen buiten het blok ${wie}`).toEqual([]);
          expect(m.overlap, `glas over de cijfers ${wie}`).toBe(false);
          expect(m.tekstBreed, `afgekapte tekst ${wie}`).toBe(false);
          expect(m.tikH, `tikvlak van Laatste weghalen ${wie}`).toBeGreaterThanOrEqual(44);
          expect(m.lettergrootte, `het cijfer ${wie}`).toBeGreaterThanOrEqual(28);
          expect(m.knopLetter, `Laatste weghalen ${wie}`).toBeGreaterThanOrEqual(14);
          expect(m.scrollX, `horizontaal scrollen ${wie}`).toBeLessThanOrEqual(0);
        }
      });
    });
  }
});
