// Delen: de kaart "Goed om te weten" (BESLISSING 297), in dezelfde vorm als op Drinken en Gewicht.
import { test, expect } from '@playwright/test';
import { verwachtGelijkeWeetjes } from './weetjes-rij.js';
import { naTekenen, animatiesKlaar } from './wacht.js';

test.use({ hasTouch: false, isMobile: false });

async function open(page, breed, hoog = 1230) {
  await page.setViewportSize({ width: breed, height: hoog });
  await page.goto('./#/delen');
  await expect(page.locator('.delen__weetjes')).toBeVisible();
}

for (const breed of [1690, 1720]) {
  test(`vier blokken in één rij op ${breed}`, async ({ page }) => {
    await open(page, breed);
    await expect(page.locator('.delen__privacy')).toHaveCount(0);
    await expect(page.locator('.delen__weetjes .kaartkop')).toContainText('Goed om te weten');
    const m = await page.evaluate(() => {
      const kaart = document.querySelector('.delen__weetjes');
      const rij = kaart.querySelector('.delen__weetjesrij');
      const r = (e) => e.getBoundingClientRect();
      const bl = [...rij.children].map((b) => ({ b: r(b), t: r(b.querySelector('.weetje__tekst')), tegel: r(b.querySelector('.tegel')), tegelNaTekst: r(b.querySelector('.tegel')).right <= r(b.querySelector('.weetje__tekst')).left + 1 }));
      const kb = r(kaart);
      const cs = getComputedStyle(kaart);
      const lijn = r(kaart.querySelector('.kaartkop'));
      const regelH = parseFloat(getComputedStyle(rij.querySelector('.weetje__tekst')).lineHeight);
      return {
        n: bl.length,
        tekstY: bl.map((x) => Math.round(x.t.top * 10) / 10),
        tekstH: [...rij.querySelectorAll('.weetje__tekst')].map((e) => r(e).height - parseFloat(getComputedStyle(e).paddingTop)),
        regelH,
        linkRechts: bl[3].b.right,
        binnenRechts: kb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
        boven: r(rij).top - lijn.bottom,
        onder: kb.bottom - parseFloat(cs.paddingBottom) - parseFloat(cs.borderBottomWidth) - Math.max(...bl.map((x) => x.b.bottom)),
        padOnder: parseFloat(cs.paddingBottom),
        kopOnder: lijn.bottom,
        rijBoven: r(rij).top,
        tegelsLinks: bl.map((x) => x.tegelNaTekst),
      };
    });
    expect(m.n).toBe(4);
    // BESLISSING 433: op één rij, met gelijke zichtbare tussenruimte, het eerste item op de linker en het laatste op de rechter binnenrand
    const [rij] = await verwachtGelijkeWeetjes(page, '.delen__weetjes', 'Delen');
    const tops = rij.items.map((i) => i.midden);
    expect(Math.max(...tops) - Math.min(...tops), 'één rij').toBeLessThanOrEqual(1);
    for (const y of m.tekstY) expect(Math.abs(y - m.tekstY[0])).toBeLessThanOrEqual(1);
    for (const h of m.tekstH) expect(h).toBeLessThanOrEqual(m.regelH + 1); // één regel
    expect(Math.abs(m.linkRechts - m.binnenRechts)).toBeLessThanOrEqual(1);
    expect(m.tegelsLinks.every(Boolean)).toBe(true);
    expect(m.rijBoven - m.kopOnder).toBeLessThan(32); // geen leeg vlak boven 32 px
    expect(Math.abs(m.boven - (m.onder + m.padOnder))).toBeLessThanOrEqual(1); // ruimte boven en onder de rij gelijk
  });
}

test('hover verandert alleen het icoon van de link', async ({ page }) => {
  await open(page, 1690);
  const blokken = page.locator('.delen__weetjesrij > *');
  const vorm = (i) => blokken.nth(i).evaluate((e) => ({ r: JSON.stringify(e.getBoundingClientRect()), bg: getComputedStyle(e).backgroundColor, tf: getComputedStyle(e).transform, tegel: getComputedStyle(e.querySelector('.tegel')).transform }));
  // Met de zevende periodeknop (BESLISSING 474/485) is de linkerkolom hoger en staat "Goed om te weten" op 1690x1230 deels onder het venster: een hover scrolt
  // het blok in beeld en dat verschuift de y met 80 px. Daarom eerst in beeld scrollen; de meting daarna vergelijkt weer elk getal van de vorm voor en na het aanwijzen.
  await page.locator('.delen__weetjes').scrollIntoViewIfNeeded();
  await animatiesKlaar(page); // het scherm komt zacht op (20 px omhoog): pas meten als het stilstaat
  await naTekenen(page);
  const voor = [await vorm(0), await vorm(3)];
  await blokken.nth(0).hover();
  expect(await vorm(0)).toEqual(voor[0]);
  await blokken.nth(3).hover();
  const na = await vorm(3);
  expect(na.r).toBe(voor[1].r);
  expect(na.bg).toBe(voor[1].bg);
  expect(na.tf).toBe(voor[1].tf);
});

test('de link start de rondleiding van Delen', async ({ page }) => {
  await open(page, 1690);
  await page.locator('.delen__weetjesrij > button').click();
  await expect(page.locator('.rondleiding, [role="dialog"]').first()).toBeVisible();
});

for (const breed of [390, 360]) {
  test(`telefoon ${breed}: onder elkaar, geen horizontale scroll`, async ({ page }) => {
    await open(page, breed, 844);
    const m = await page.evaluate(() => {
      const bl = [...document.querySelectorAll('.delen__weetjesrij > *')].map((b) => b.getBoundingClientRect());
      return { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, x: bl.map((b) => Math.round(b.left)), y: bl.map((b) => b.top) };
    });
    expect(m.scroll).toBeLessThanOrEqual(0);
    expect(new Set(m.x).size).toBe(1);
    expect(m.y[1]).toBeGreaterThan(m.y[0]);
    expect(m.y[3]).toBeGreaterThan(m.y[2]);
  });
}

test('tweede inleidingsregel is weg en laat geen lege ruimte achter', async ({ page }) => {
  await open(page, 1690);
  const m = await page.evaluate(() => {
    const u = document.querySelector('.delen__uitleg').getBoundingClientRect();
    const raster = document.querySelector('.delen__kolommen').getBoundingClientRect(); // BESLISSING 300: de twee kolommen volgen op de inleidingsregel
    return { gat: raster.top - u.bottom };
  });
  expect(m.gat).toBeLessThanOrEqual(32);
});
