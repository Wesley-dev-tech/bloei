// Meer, kaart Favorieten: even hoog als Badges, rijen over de volle breedte, geen lege vlakken (0, 1, 3 en 8 favorieten).
import { test, expect } from '@playwright/test';
import { meetKaarten } from './leeg-vlak.js';
import { schermKlaar } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

async function zetFavorieten(page, aantal) {
  await page.evaluate(
    (n) =>
      new Promise((klaar, mislukt) => {
        const v = indexedDB.open('bloei-dagboek');
        v.onerror = () => mislukt(v.error);
        v.onsuccess = () => {
          const db = v.result;
          const tx = db.transaction(['favorieten'], 'readwrite');
          tx.objectStore('favorieten').clear();
          for (let i = 0; i < n; i++) tx.objectStore('favorieten').add({ tekst: 'Favoriet nummer ' + (i + 1), sleutel: 'favoriet nummer ' + (i + 1), laatstGebruikt: Date.now() - i });
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    aantal,
  );
  await page.reload();
}

const meet = (page) =>
  page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const b = document.querySelector('.meer__badges');
    const f = document.querySelector('.meer__favorieten');
    const fr = r(f);
    const binnen = { links: fr.left + parseFloat(getComputedStyle(f).paddingLeft), rechts: fr.right - parseFloat(getComputedStyle(f).paddingRight) };
    // alleen de getoonde rijen (de kaart verbergt wat er onder 1440 px niet in past met .is-weg)
    const rijen = [...f.querySelectorAll('.meer__favrij')].filter((r) => r.offsetParent !== null);
    return {
      topVerschil: Math.abs(r(b).top - fr.top),
      bodemVerschil: Math.abs(r(b).bottom - fr.bottom),
      actieVerschil: Math.abs(r(b.querySelector('.meer__actie')).bottom - r(f.querySelector('.meer__actie')).bottom),
      aantalRijen: rijen.length,
      tegelLinks: rijen.map((x) => Math.abs(r(x.querySelector('.tegel')).left - binnen.links)),
      pijlRechts: rijen.map((x) => (x.querySelector('.rij__pijl') ? Math.abs(r(x.querySelector('.rij__pijl')).right - binnen.rechts) : 0)),
      rijHoogtes: rijen.map((x) => r(x).height),
      stijlAttr: f.querySelectorAll('[style]').length,
    };
  });

for (const breedte of [1690, 1440, 1280]) {
  for (const aantal of [0, 1, 3, 8]) {
    test(`Favorieten naast Badges op ${breedte} px met ${aantal} favorieten`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 1230 });
      await page.goto('./#/meer');
      await expect(page.locator('.meer__favorieten')).toBeVisible();
      await zetFavorieten(page, aantal);
      await expect(page.locator('.meer__favorieten')).toBeVisible();
      await schermKlaar(page, 'meer'); // uitgebouwd en opgekomen
      await page.evaluate(() => document.fonts.ready); // de lettertypes staan (een later geladen letter verschuift de rijen)
      await wachtTotStil(page, async () => [await meet(page), await meetKaarten(page, '.meer__raster')]); // en de kaarten liggen stil (de rijen worden na het tekenen geteld)
      if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/fav-${breedte}-${aantal}.png`, clip: await page.evaluate(() => { const a = document.querySelector('.meer__badges').getBoundingClientRect(); const b = document.querySelector('.meer__favorieten').getBoundingClientRect(); return { x: Math.floor(a.left) - 10, y: Math.floor(a.top) - 10, width: Math.ceil(b.right - a.left) + 20, height: Math.ceil(a.height) + 20 }; }) });
      const m = await meet(page);
      expect(m.topVerschil).toBeLessThanOrEqual(1);
      expect(m.bodemVerschil).toBeLessThanOrEqual(1);
      expect(m.actieVerschil).toBeLessThanOrEqual(2);
      // vanaf 1440 px vast (3 of 4 rijen); eronder telt de kaart hoeveel rijen van 64 tot 80 px er naast Badges passen (minstens 3, hoogstens de bewaarde plus de stappen)
      if (breedte >= 1440) expect(m.aantalRijen).toBe(aantal === 0 ? 3 : aantal >= 3 ? Math.min(aantal, 4) : 3);
      else {
        expect(m.aantalRijen).toBeGreaterThanOrEqual(3);
        for (const x of m.rijHoogtes) { expect(x).toBeGreaterThanOrEqual(63.5); expect(x).toBeLessThanOrEqual(80.5); }
      }
      for (const x of m.tegelLinks) expect(x).toBeLessThanOrEqual(1);
      for (const x of m.pijlRechts) expect(x).toBeLessThanOrEqual(1);
      expect(Math.max(...m.rijHoogtes) - Math.min(...m.rijHoogtes)).toBeLessThanOrEqual(2);
      expect(m.stijlAttr).toBe(0);
      const kaarten = await meetKaarten(page, '.meer__raster');
      const fav = kaarten.find((k) => /meer__favorieten/.test(k.naam));
      expect(fav.gat).toBeLessThanOrEqual(32);
      if (aantal === 8 && breedte >= 1440) await expect(page.locator('.meer__favorieten')).toContainText('En nog 4');
      if (aantal === 8 && breedte < 1440) await expect(page.locator('.meer__favorieten')).toContainText(/En nog \d/);
      await expect(page.locator('.meer__favorieten .kaartkop')).toContainText(`${aantal} bewaard`);
    });
  }
}

test('Favorieten op 390 px: onder elkaar, zo hoog als de inhoud', async ({ page }) => {
  await page.goto('./#/meer');
  await expect(page.locator('.meer__favorieten')).toBeVisible();
  await zetFavorieten(page, 0);
  await expect(page.locator('.meer__favorieten')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.locator('.meer__favorieten').scrollIntoViewIfNeeded();
  if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/fav-390-0.png` }); // schermafbeelding alleen op verzoek
  const m = await meet(page);
  expect(m.aantalRijen).toBe(3);
  for (const x of m.rijHoogtes) expect(x).toBeLessThan(90);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(390);
});

test('Favorieten: een tik op de kaart opent het beheer', async ({ page }) => {
  await page.goto('./#/meer');
  await zetFavorieten(page, 3);
  await page.locator('.meer__favorieten').click();
  await expect(page).toHaveURL(/#\/meer\/favorieten$/);
});
