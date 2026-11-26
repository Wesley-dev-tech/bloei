// BESLISSING 296: wat alleen informatie toont, reageert nergens op. Alleen wat je kan aantikken licht bij hover op.
// Daarnaast (aanvulling): "Goed om te weten" op de instellingenschermen is een 2x2-raster (op de telefoon onder elkaar) met als laatste blok "Toon het me".
import { test, expect } from '@playwright/test';
import { animatiesKlaar } from './wacht.js';

// Een muis die kan hoveren (anders is (hover: hover) onwaar en bewijst een hovertest niets).
test.use({ hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

const EIGEN =['transform', 'backgroundColor', 'color', 'filter', 'opacity'];
const stijlen = (el) => {
  const s = getComputedStyle(el);
  return Object.fromEntries(['transform', 'backgroundColor', 'color', 'filter', 'opacity', 'boxShadow'].map((k) => [k, s[k]]));
};

async function hoverGelijk(page, selector, kind) {
  const doel = page.locator(selector).first();
  await doel.scrollIntoViewIfNeeded();
  const voor = await doel.evaluate(stijlen);
  const voorKind = kind ? await doel.locator(kind).first().evaluate(stijlen) : null;
  await doel.hover();
  await animatiesKlaar(page); // een eventuele overgang is uitgelopen
  const na = await doel.evaluate(stijlen);
  for (const k of EIGEN) expect(na[k], `${selector} ${k}`).toBe(voor[k]);
  if (kind) {
    const naKind = await doel.locator(kind).first().evaluate(stijlen);
    for (const k of [...EIGEN, 'boxShadow']) expect(naKind[k], `${selector} ${kind} ${k}`).toBe(voorKind[k]);
  }
  await page.mouse.move(0, 0);
}

test('Vandaag: de vier tegels van de motivator zijn geen link of knop en reageren niet op hover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/vandaag');
  const vakken = page.locator('.motiv__vak');
  await expect(vakken.first()).toBeVisible();
  const aantal = await vakken.count(); // Supplementen staat er alleen als er supplementen zijn
  expect(aantal).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < aantal; i++) {
    const v = vakken.nth(i);
    expect(await v.evaluate((e) => e.tagName)).toBe('DIV');
    await expect(v).not.toHaveAttribute('role', /.*/);
    await expect(v).not.toHaveAttribute('tabindex', /.*/);
    await expect(v).not.toHaveClass(/licht-op-icoon/);
    expect(await v.evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
    await v.scrollIntoViewIfNeeded();
    const tegel = v.locator('.tegel').first();
    const voor = await tegel.evaluate(stijlen);
    const voorVak = await v.evaluate(stijlen);
    await v.hover();
    await animatiesKlaar(page); // een eventuele overgang is uitgelopen
    const na = await tegel.evaluate(stijlen);
    const naVak = await v.evaluate(stijlen);
    for (const k of [...EIGEN, 'boxShadow']) {
      expect(na[k], `tegel ${i} ${k}`).toBe(voor[k]);
      expect(naVak[k], `vak ${i} ${k}`).toBe(voorVak[k]);
    }
  }
  await expect(vakken.locator('a, button')).toHaveCount(0);
});

test('Naam en profielfoto: het voorbeeld, de rijen en de weetjes zijn statisch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/meer/profiel');
  await expect(page.locator('.profielvoorbeeld__vak')).toHaveCount(4);
  // Het langste label is "Supplementen" (sinds 0.5.8 het vierde vak, na Dagdoel): volledig zichtbaar, op één regel en niet afgekapt.
  const derde = page.locator('.profielvoorbeeld__vak .label').nth(3);
  await expect(derde).toHaveText('Supplementen');
  await expect(derde).toBeVisible();
  const maat = await derde.evaluate((e) => ({ hoogte: e.getBoundingClientRect().height, regel: parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.5, afgekapt: e.scrollWidth > e.clientWidth + 1 }));
  expect(maat.afgekapt).toBe(false);
  expect(maat.hoogte).toBeLessThan(maat.regel * 1.5);
  await expect.poll(() => page.locator('.profielvoorbeeld').evaluate((e) => getComputedStyle(e).transform)).toBe('none'); // de intrede is klaar
  await hoverGelijk(page, '.profielvoorbeeld', '.tegel');
  await hoverGelijk(page, '.profielvoorbeeld__vak', '.tegel');
  await hoverGelijk(page, '.instellingen__profiel > .rij >> nth=0', '.tegel');
  await hoverGelijk(page, '.instellingen__profiel > .rij >> nth=1', null); // de tweede rij toont de foto zelf, geen tegel
  for (const i of [0, 1]) await hoverGelijk(page, `.instel__weetjes .weetje >> nth=${i}`, '.tegel');
  await expect(page.locator('.instel__weetjes .weetje--link')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Foto kiezen/ })).toBeVisible();
});

test('Drinken: de link in de vierde weetjeskolom licht nog wel op, de weetjes niet', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/drinken');
  const link = page.locator('.drinken__weetjesrij .weetje--link');
  await link.scrollIntoViewIfNeeded();
  const tegel = link.locator('.tegel');
  const voor = await tegel.evaluate((e) => getComputedStyle(e).transform);
  await link.hover();
  await expect.poll(() => tegel.evaluate((e) => getComputedStyle(e).transform)).not.toBe(voor);
  await page.mouse.move(0, 0);
  await hoverGelijk(page, '.drinken__weetjesrij .weetje >> nth=0', '.tegel');
});

const SCHERMEN = [
  ['#/meer/instellingen', 4],
  ['#/meer/gewicht', 4],
  ['#/meer/vergrendeling', 4],
  ['#/meer/profiel', 2],
];
for (const [breedte, hoogte] of [[1690, 1230], [1440, 1000], [1280, 900], [390, 844]]) {
  for (const [hash, aantal] of SCHERMEN) {
    test(`Goed om te weten ${hash}, ${breedte} px: even brede kolommen, rijen gelijk, link als laatste blok`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: hoogte });
      await page.goto('./' + hash);
      const blok = page.locator('.instel__weetjes--blokken');
      await expect(blok).toBeVisible();
      const blokken = blok.locator('.weetje');
      await expect(blokken).toHaveCount(aantal);
      const dozen = [];
      for (let i = 0; i < aantal; i++) dozen.push(await blokken.nth(i).boundingBox());
      const tekst = [];
      for (let i = 0; i < aantal; i++) tekst.push(await blokken.nth(i).locator('.weetje__tekst').boundingBox());
      const rijBox = await blok.locator('.instel__weetjesrij').boundingBox();
      if (breedte >= 600) {
        // kolommen even breed (de link mag smaller zijn maar eindigt op de rechter binnenrand)
        const kol = [...new Set(dozen.slice(0, 3).map((d) => Math.round(d.x)))];
        const breed = dozen.slice(0, Math.min(3, aantal)).map((d) => d.width);
        if (breedte >= 1600 && aantal === 2) {
          // BESLISSING 433 (scherm-algemeen.css): vanaf 1600 px staat een rij van één of twee weetjes op haar inhoudsbreedte, het eerste op de linker en het laatste op de
          // rechter binnenrand van de rij, met een zichtbare ruimte ertussen; de kolommen zijn dan niet meer even breed
          expect(Math.abs(dozen[0].x - rijBox.x), 'eerste weetje tegen de linkerrand van de rij').toBeLessThanOrEqual(2);
          expect(Math.abs(rijBox.x + rijBox.width - (dozen[1].x + dozen[1].width)), 'laatste weetje tegen de rechterrand van de rij').toBeLessThanOrEqual(2);
          expect(dozen[1].x - (dozen[0].x + dozen[0].width), 'ruimte tussen de twee weetjes').toBeGreaterThanOrEqual(24);
        } else expect(Math.max(...breed) - Math.min(...breed)).toBeLessThanOrEqual(1);
        // Vergrendeling met het slot uit: de weetjes staan met vier op een rij over de volle breedte (BESLISSING 547)
        expect(kol.length).toBeLessThanOrEqual(hash === '#/meer/vergrendeling' ? 4 : 2);
        // tegels in één rij beginnen op dezelfde y. BESLISSING 568 en 569 (goedgekeurd): de tekst staat als blok in het midden van haar tegel (één regel in het
        // midden, twee regels vullen de tegel) en een tekst van drie of meer regels begint op de bovenrand; ze steekt nooit boven de tegel uit. De eerste tekstregels
        // van twee weetjes naast elkaar staan dus niet meer op één y; de pixelmeting in x-weetjes-uitlijning.spec.js bewaakt de stand.
        const paren = aantal === 4 ? [[0, 1], [2, 3]] : [[0, 1]];
        for (const [a, b] of paren) expect(Math.abs(dozen[a].y - dozen[b].y)).toBeLessThanOrEqual(1);
        for (let i = 0; i < aantal; i++) {
          const m = await blokken.nth(i).evaluate((e) => {
            const t = e.querySelector('.weetje__tekst');
            if (!t?.firstChild || t.firstChild.nodeType !== 3 || e.classList.contains('weetje--link')) return null;
            const alle = document.createRange();
            alle.selectNodeContents(t);
            const rechthoeken = [...alle.getClientRects()].filter((r) => r.width > 0);
            const regels = new Set(rechthoeken.map((r) => Math.round(r.top))).size;
            const g = document.createRange();
            g.setStart(t.firstChild, 0);
            g.setEnd(t.firstChild, 1);
            const tegel = e.querySelector('.tegel').getBoundingClientRect();
            const blokTop = Math.min(...rechthoeken.map((r) => r.top));
            const blokOnder = Math.max(...rechthoeken.map((r) => r.bottom));
            return {
              regels,
              letters: g.getBoundingClientRect().top + 0.37 * parseFloat(getComputedStyle(t).fontSize) - tegel.top,
              midden: (blokTop + blokOnder) / 2 - (tegel.top + tegel.bottom) / 2,
            };
          });
          if (!m) continue;
          expect(m.letters, `weetje ${i}: de tekst steekt niet boven de tegel uit (${m.letters.toFixed(1)} px)`).toBeGreaterThanOrEqual(-2);
          // de schatting 0,37 x lettergrootte ligt 4 tot 5 px onder de echte inkt; de exacte stand meet x-weetjes-uitlijning.spec.js op pixels
          if (m.regels >= 3) expect(m.letters, `weetje ${i}: drie of meer regels beginnen bij de bovenrand (${m.letters.toFixed(1)} px)`).toBeLessThanOrEqual(6);
          else expect(Math.abs(m.midden), `weetje ${i}: ${m.regels} regel(s) als blok in het midden van de tegel (${m.midden.toFixed(1)} px)`).toBeLessThanOrEqual(2);
        }
      } else {
        for (let i = 1; i < aantal; i++) expect(dozen[i].y).toBeGreaterThan(dozen[i - 1].y);
      }
      if (aantal === 4) {
        const link = blok.locator('.weetje--link');
        await expect(link).toHaveCount(1);
        await expect(link.locator('.tegel')).toHaveCount(1);
        const kleur = (l) => l.evaluate((e) => getComputedStyle(e).color);
        expect(await kleur(link.locator('.weetje__tekst'))).toBe(await kleur(blokken.first().locator('.weetje__tekst'))); // BESLISSING 351: de link heeft de tekstkleur van het blok
        // de link staat in het raster: tegel exact onder de tegel van het tweede weetje (op de telefoon op dezelfde linkerlijn als het weetje erboven),
        // en op dezelfde y als de tegel van het derde weetje; de tekst begint op dezelfde x als die van het weetje erboven
        const tx = async (i) => blokken.nth(i).locator('.tegel').first().boundingBox();
        const boven = breedte >= 600 ? 1 : 2;
        // BESLISSING 547: Vergrendeling met het slot uit heeft de vier weetjes op één rij over de volle breedte: de link staat dan naast het derde weetje, niet onder het tweede
        const opEenRij = hash === '#/meer/vergrendeling' && breedte >= 600;
        if (!opEenRij) {
          expect(Math.abs((await tx(3)).x - (await tx(boven)).x)).toBeLessThanOrEqual(1);
          expect(Math.abs(tekst[3].x - tekst[boven].x)).toBeLessThanOrEqual(1);
        } else {
          expect((await tx(3)).x, 'de link staat rechts van het derde weetje').toBeGreaterThan((await tx(2)).x + (await tx(2)).width);
        }
        if (breedte >= 600) expect(Math.abs((await tx(3)).y - (await tx(2)).y)).toBeLessThanOrEqual(1);
        expect(Math.abs((await tx(3)).width - (await tx(boven)).width)).toBeLessThanOrEqual(1);
        expect(await blokken.nth(3).evaluate((e) => e.classList.contains('weetje--link'))).toBe(true);
      }
      // hoogstens twee regels per weetje
      for (let i = 0; i < Math.min(3, aantal); i++) expect(tekst[i].height).toBeLessThanOrEqual(20 * 2 + 20);
      // BESLISSING 362: de gewone kaartkop (icoontegel, titel, lijn eronder), 12 px tussen de lijn en het eerste weetje en geen lijn boven de kop
      const kop = blok.locator(':scope > .kaartkop');
      await expect(kop.locator('.tegel')).toHaveCount(1);
      const kopBox = await kop.boundingBox();
      expect(await kop.evaluate((e) => parseFloat(getComputedStyle(e).borderBottomWidth)), 'een lijn onder de kop').toBeGreaterThanOrEqual(1);
      expect(await blok.evaluate((e) => parseFloat(getComputedStyle(e).borderTopWidth)), 'geen lijn boven het blok').toBe(0);
      const naLijn = dozen[0].y - (kopBox.y + kopBox.height);
      expect(naLijn, `${naLijn.toFixed(1)} px tussen lijn en eerste weetje`).toBeGreaterThanOrEqual(11);
      expect(naLijn).toBeLessThanOrEqual(13);
    });
  }
}

// Binnen één blok "Goed om te weten" hebben alle weetjes hetzelfde aantal tekstregels; op 1690 en 1440 px is dat één regel.
for (const breedte of [1690, 1440]) {
  for (const hash of ['#/meer/instellingen', '#/meer/gewicht', '#/meer/profiel', '#/meer/favorieten', '#/meer/vergrendeling']) {
    test(`Goed om te weten ${hash}, ${breedte} px: zelfde bloktekst-hoogte, hoogstens twee regels`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 1230 });
      await page.goto('./' + hash);
      const teksten = page.locator('.instel__weetjes--blokken .weetje:not(.weetje--link) .weetje__tekst');
      await expect(teksten.first()).toBeVisible();
      // BESLISSING 303: een zin loopt over hoogstens twee regels. BESLISSING 361 vervangt de vaste tekstvakhoogte: het tekstvak van twee regels
      // staat bovenaan de tegel, dat van één regel op het midden, dus gelijk zijn nu de weetjes zelf (even hoog als de tegel, ook met twee regels).
      const m = await teksten.evaluateAll((els) => els.map((e) => { const r = document.createRange(); r.selectNodeContents(e); return Math.round(r.getBoundingClientRect().height / 20); }));
      for (const regels of m) expect(regels).toBeLessThanOrEqual(2);
      const weetjes = await page.locator('.instel__weetjes--blokken .weetje:not(.weetje--link)').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(Math.max(...weetjes) - Math.min(...weetjes), `hoogtes van de weetjes: ${weetjes.join(', ')}`).toBeLessThanOrEqual(1);
    });
  }
}
