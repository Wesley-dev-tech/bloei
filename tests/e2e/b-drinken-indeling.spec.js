// Drinken, de indeling van "Vandaag gedronken" en "Goed om te weten" (opmerkingen van de eigenaar, BESLISSING 264 en 270 hierbij).
// Verzonnen gegevens; de hulp vul() zet het aantal dranken van vandaag (elke volgende drank is een nieuwe soort, tot zes).
import { test, expect } from '@playwright/test';
import { vul, meetKaarten } from './leeg-vlak.js';
import { verwachtGelijkeWeetjes } from './weetjes-rij.js';
import { schermKlaar, animatiesKlaar, domRustig } from './wacht.js';

// De hover-regels gelden alleen met een muis: dit bestand draait dus als bureaublad, niet als telefoon met aanraking.
test.use({ hasTouch: false, isMobile: false, deviceScaleFactor: 1 });

const GROOTTES = [
  [1690, 1230],
  [1720, 950],
];

async function open(page, dranken, breed, hoog) {
  await page.setViewportSize({ width: breed, height: hoog });
  await page.goto('./#/drinken');
  await page.waitForSelector('.drinken .drinkhoofd');
  await page.waitForLoadState('load');
  await schermKlaar(page, '#/drinken'); // de app is klaar met starten: het scherm Drinken staat er uitgebouwd (geen navigatie meer tijdens het vullen)
  await vul(page, { dranken });
  await page.waitForSelector('.drinken .drinken__verloopkaart');
  await page.waitForTimeout(1800); // het opkomen van de kaarten
}

// De rechthoek van het zichtbare deel van een element (voor tekst: de eerste regel).
const tekstRand = (page, sel, naarBinnen = 0) =>
  page.evaluate(([s]) => {
    const e = document.querySelector(s);
    const r = document.createRange();
    r.selectNodeContents(e);
    const b = r.getClientRects();
    const eerste = b[0];
    const laatste = b[b.length - 1];
    return { links: eerste.left, rechts: laatste.right, midden: (eerste.top + eerste.bottom) / 2 };
  }, [sel, naarBinnen]);

for (const [breed, hoog] of GROOTTES) {
  for (const soorten of [0, 1, 2, 3, 4, 5, 6]) {
    test(`Vandaag gedronken met ${soorten} soorten op ${breed}x${hoog}: lage rijen, geen leeg vlak, even brede kolommen`, async ({ page }) => {
      await open(page, soorten, breed, hoog);
      const kaart = page.locator('.drinken__verloopkaart');
      const inhoud = await kaart.evaluate((k) => {
        const r = k.getBoundingClientRect();
        const s = getComputedStyle(k);
        const blokken = [...k.querySelectorAll('.soortblok')].map((b) => {
          const br = b.getBoundingClientRect();
          const tegel = b.querySelector('.tegel').getBoundingClientRect();
          const weg = b.querySelector('.drank__weg svg').getBoundingClientRect();
          return { x: br.left, y: br.top, b: br.width, h: br.height, tegelLinks: tegel.left, wegRechts: weg.right };
        });
        return { links: r.left + parseFloat(s.paddingLeft), rechts: r.right - parseFloat(s.paddingRight), blokken, tekst: k.querySelector('.drinken__nog-niets')?.textContent ?? '' };
      });
      expect(inhoud.blokken.length).toBe(soorten);
      if (soorten === 0) expect(inhoud.tekst.length).toBeGreaterThan(5);
      for (const b of inhoud.blokken) expect(b.h).toBeLessThanOrEqual(60);
      // Alle kolommen even breed
      const breedtes = inhoud.blokken.map((b) => b.b);
      for (const w of breedtes) expect(Math.abs(w - breedtes[0])).toBeLessThanOrEqual(1);
      // Tegels op vaste lijnen: dezelfde kolom heeft dezelfde linkerrand van de tegel
      const perKolom = new Map();
      for (const b of inhoud.blokken) {
        const sleutel = Math.round(b.x);
        perKolom.set(sleutel, [...(perKolom.get(sleutel) ?? []), b.tegelLinks]);
      }
      for (const lijst of perKolom.values()) for (const x of lijst) expect(Math.abs(x - lijst[0])).toBeLessThanOrEqual(1);
      if (soorten >= 1) {
        const eerste = inhoud.blokken[0];
        expect(Math.abs(eerste.tegelLinks - inhoud.links)).toBeLessThanOrEqual(1);
      }
      // Elke rij is gevuld tot de rechter binnenrand: het kruisje van het laatste blok van elke rij staat daar (≤ 2 px)
      const perRij = new Map();
      for (const b of inhoud.blokken) perRij.set(Math.round(b.y), Math.max(perRij.get(Math.round(b.y)) ?? 0, b.wegRechts));
      for (const rechtsste of perRij.values()) expect(Math.abs(rechtsste - inhoud.rechts)).toBeLessThanOrEqual(2);
      // Het aantal rijen: alles in één rij als elke kolom minstens 220 px krijgt, anders (alleen bij zes soorten op deze breedtes) 3 x 2
      const kolombreedte = (inhoud.rechts - inhoud.links + 32) / Math.max(soorten, 1);
      expect(perRij.size).toBe(soorten === 0 ? 0 : kolombreedte >= 220 ? 1 : 2);
      // Geen leeg vlak boven 32 px in de kaart
      const gaten = await meetKaarten(page, '.drinken__lijst');
      expect(gaten.length).toBe(1);
      expect(gaten[0].gat).toBeLessThanOrEqual(32);
    });
  }

  test(`Eén water weghalen op ${breed}x${hoog}: de knop overlapt geen tekst en het aantal daalt`, async ({ page }) => {
    await open(page, 6, breed, hoog);
    const som = () => page.evaluate(() => [...document.querySelectorAll('.drinken__lijst .soortblok[data-aantal]')].reduce((s, e) => s + Number(e.dataset.aantal), 0));
    expect(await som()).toBe(6);
    const knop = page.locator('.drinken__lijst .drank__weg').first();
    await expect(knop).toHaveAttribute('aria-label', 'Eén water weghalen');
    const doos = await knop.boundingBox();
    expect(doos.width).toBeGreaterThanOrEqual(44);
    expect(doos.height).toBeGreaterThanOrEqual(44);
    const overlap = await page.evaluate(() => {
      const blok = document.querySelector('.drinken__lijst .soortblok');
      const k = blok.querySelector('.drank__weg').getBoundingClientRect();
      return [...blok.querySelectorAll('.soortblok__naam, .soortblok__hoeveel')].some((t) => {
        const r = document.createRange();
        r.selectNodeContents(t);
        return [...r.getClientRects()].some((x) => x.left < k.right && x.right > k.left && x.top < k.bottom && x.bottom > k.top);
      });
    });
    expect(overlap).toBe(false);
    await knop.click();
    await expect.poll(som).toBe(5);
  });

  test(`Bovenste rij op ${breed}x${hoog}: laag, beide kaarten even hoog, zes even brede knoptegels over de volle binnenbreedte`, async ({ page }) => {
    await open(page, 5, breed, hoog);
    const m = await page.evaluate(() => {
      const hoofd = document.querySelector('.drinkhoofd').getBoundingClientRect();
      const andere = document.querySelector('.drinken__andere');
      const ar = andere.getBoundingClientRect();
      const s = getComputedStyle(andere);
      const tegels = [...andere.querySelectorAll('.drankknop')].map((e) => e.getBoundingClientRect());
      return { hoofdH: hoofd.height, andereH: ar.height, hoofdBodem: hoofd.bottom, andereBodem: ar.bottom, links: ar.left + parseFloat(s.paddingLeft), rechts: ar.right - parseFloat(s.paddingRight), tegels: tegels.map((r) => ({ x: r.left, r: r.right, y: r.top, b: r.width, h: r.height })) };
    });
    expect(m.hoofdH).toBeLessThanOrEqual(270);
    expect(Math.abs(m.hoofdBodem - m.andereBodem)).toBeLessThanOrEqual(1);
    expect(m.tegels.length).toBe(6);
    for (const t of m.tegels) {
      expect(Math.abs(t.b - m.tegels[0].b)).toBeLessThanOrEqual(1);
      expect(Math.abs(t.y - m.tegels[0].y)).toBeLessThanOrEqual(1);
      expect(t.h).toBeGreaterThanOrEqual(48);
    }
    expect(Math.abs(m.tegels[0].x - m.links)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.tegels[5].r - m.rechts)).toBeLessThanOrEqual(1);
    for (let i = 1; i < 6; i++) {
      const gat = m.tegels[i].x - m.tegels[i - 1].r;
      expect(gat).toBeGreaterThanOrEqual(0);
      expect(gat).toBeLessThanOrEqual(12);
    }
    // Geen leeg vlak boven 32 px in beide kaarten
    const gaten = await meetKaarten(page, '.drinken__raster');
    for (const k of gaten.slice(0, 2)) expect(k.gat, k.naam).toBeLessThanOrEqual(32);
  });

  test(`Goed om te weten op ${breed}x${hoog}: vier items op één rij met gelijke tussenruimte (BESLISSING 433), de vierde is de link naar de instellingen, alles op dezelfde y`, async ({ page }) => {
    await open(page, 5, breed, hoog);
    const kaart = await page.locator('.drinken__weetjes').evaluate((k) => {
      const r = k.getBoundingClientRect();
      const s = getComputedStyle(k);
      const kop = k.querySelector('.kaartkop');
      return { links: r.left + parseFloat(s.paddingLeft), rechts: r.right - parseFloat(s.paddingRight), kopBodem: kop.getBoundingClientRect().bottom, onder: r.bottom, kopEind: !!k.querySelector('.kaartkop__eind') };
    });
    expect(kaart.kopEind).toBe(false); // rechts in de kop staat niets meer
    const weetjes = await page.locator('.drinken__weetjes .weetje').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const tegel = e.querySelector('.tegel').getBoundingClientRect();
        const tr = document.createRange();
        tr.selectNodeContents(e.querySelector('.weetje__tekst'));
        const tb = tr.getClientRects()[0];
        return { x: r.left, b: r.width, regels: tr.getClientRects().length, tekstRechts: tr.getBoundingClientRect().right, tegelLinks: tegel.left, tegelMidden: (tegel.top + tegel.bottom) / 2, tekstMidden: (tb.top + tb.bottom) / 2 };
      }),
    );
    expect(weetjes.length).toBe(4);
    await verwachtGelijkeWeetjes(page, '.drinken__weetjes', 'Drinken'); // BESLISSING 433: gelijke zichtbare tussenruimte, eerste en laatste op de binnenrand
    expect(Math.abs(weetjes[3].tekstRechts - kaart.rechts), 'de link eindigt op de rechter binnenrand').toBeLessThanOrEqual(1);
    for (const w of weetjes) {
      expect(w.regels, 'elke tekst op één regel').toBe(1);
      expect(Math.abs(w.tegelMidden - weetjes[0].tegelMidden)).toBeLessThanOrEqual(1);
      expect(Math.abs(w.tekstMidden - w.tegelMidden)).toBeLessThanOrEqual(2);
      expect(Math.abs(w.tekstMidden - weetjes[0].tekstMidden)).toBeLessThanOrEqual(1);
      expect(Math.abs(w.x + 0 - (w.tegelLinks))).toBeLessThanOrEqual(1); // de tegel begint op de linkerrand van zijn kolom
    }
    expect(Math.abs(weetjes[0].tegelLinks - kaart.links)).toBeLessThanOrEqual(1);
    // De vierde is de link: een knop van minstens 44 px hoog, met de tekst in de linkkleur
    const link = await page.locator('.drinken__weetjes .weetje:nth-child(4)').evaluate((e) => ({ tag: e.tagName, klasse: e.className, h: e.getBoundingClientRect().height + 8, kleur: getComputedStyle(e.querySelector('.weetje__tekst')).color, gewoon: getComputedStyle(document.querySelector('.drinken__weetjes .weetje__tekst')).color }));
    expect(link.tag).toBe('BUTTON');
    expect(link.klasse).toContain('weetje--link');
    expect(link.h).toBeGreaterThanOrEqual(44);
    expect(link.kleur).toBe(link.gewoon); // BESLISSING 351: de link heeft dezelfde tekstkleur als de weetjes (via toonHetMe); hij is te herkennen aan zijn plaats, zijn tegel en zijn tikvlak
    await expect(page.locator('.drinken__weetjes .weetje--link')).toContainText('Dagdoel en groottes aanpassen');
    // Onder de rij dezelfde ruimte als boven de rij (≤ 2 px verschil)
    const boven = weetjes[0].tegelMidden - 20 - kaart.kopBodem;
    const onder = kaart.onder - (weetjes[0].tegelMidden + 20);
    expect(Math.abs(onder - boven)).toBeLessThanOrEqual(2);
  });

  test(`Hover op ${breed}x${hoog}: de knop zelf verandert niets, alleen de icoontegel licht op`, async ({ page }) => {
    await open(page, 5, breed, hoog);
    const stijl = (sel) =>
      page.locator(sel).first().evaluate((e) => {
        const s = getComputedStyle(e);
        const t = e.querySelector('.tegel');
        return { bg: s.backgroundColor, schaduw: s.boxShadow, transform: s.transform, tegel: t ? getComputedStyle(t).transform : null };
      });
    for (const sel of ['.drankknop[data-soort="thee"]', '.drinken__lijst .drank__weg']) {
      const voor = await stijl(sel);
      await page.locator(sel).first().hover();
      await animatiesKlaar(page); // de overgang van de icoontegel is voorbij (geen vaste wachttijd)
      const na = await stijl(sel);
      expect(na.bg).toBe(voor.bg);
      expect(na.schaduw).toBe(voor.schaduw);
      expect(na.transform).toBe(voor.transform);
      if (voor.tegel) {
        expect(na.tegel).not.toBe(voor.tegel);
        const schaal = Number(na.tegel.match(/matrix\(([\d.]+)/)[1]);
        expect(schaal).toBeGreaterThan(1.04);
        expect(schaal).toBeLessThan(1.1);
      }
    }
  });
}

// Op een smallere kaart (1280 px) vullen de rijen ook tot de rechter binnenrand, met 1 t/m 6 soorten (3 + 2 en 3 x 2 waar één rij te smal wordt).
for (const soorten of [1, 2, 3, 4, 5, 6]) {
  test(`Vandaag gedronken met ${soorten} soorten op 1280x900: elke rij loopt tot de rechter binnenrand`, async ({ page }) => {
    await open(page, soorten, 1280, 900);
    const m = await page.locator('.drinken__verloopkaart').evaluate((k) => {
      const r = k.getBoundingClientRect();
      const s = getComputedStyle(k);
      return { links: r.left + parseFloat(s.paddingLeft), rechts: r.right - parseFloat(s.paddingRight), blokken: [...k.querySelectorAll('.soortblok')].map((b) => ({ y: Math.round(b.getBoundingClientRect().top), wegRechts: b.querySelector('.drank__weg svg').getBoundingClientRect().right, tegelLinks: b.querySelector('.tegel').getBoundingClientRect().left })) };
    });
    expect(m.blokken.length).toBe(soorten);
    const perRij = new Map();
    for (const b of m.blokken) perRij.set(b.y, Math.max(perRij.get(b.y) ?? 0, b.wegRechts));
    for (const rechts of perRij.values()) expect(Math.abs(rechts - m.rechts)).toBeLessThanOrEqual(2);
    expect(Math.abs(m.blokken[0].tegelLinks - m.links)).toBeLessThanOrEqual(1);
    const gaten = await meetKaarten(page, '.drinken__lijst');
    expect(gaten[0].gat).toBeLessThanOrEqual(32);
  });
}

// Binnen één rij hebben alle blokken dezelfde vorm: hetzelfde aantal tekstregels en dezelfde hoogte (≤ 1 px).
for (const [breed, hoog] of [[1690, 1230], [1720, 950], [1280, 900]]) {
  for (const soorten of [1, 2, 3, 4, 5, 6]) {
    test(`Vandaag gedronken met ${soorten} soorten op ${breed}x${hoog}: alle blokken hebben dezelfde vorm (regels en hoogte)`, async ({ page }) => {
      await open(page, soorten, breed, hoog);
      const blokken = await page.locator('.drinken__verloopkaart .soortblok').evaluateAll((els) =>
        els.map((b) => {
          const r = b.getBoundingClientRect();
          const tops = new Set();
          for (const t of b.querySelectorAll('.soortblok__naam, .soortblok__hoeveel')) {
            const rg = document.createRange();
            rg.selectNodeContents(t);
            for (const x of rg.getClientRects()) tops.add(Math.round(x.top));
          }
          const tegel = b.querySelector('.tegel').getBoundingClientRect();
          const weg = b.querySelector('.drank__weg svg').getBoundingClientRect();
          return { y: Math.round(r.top), h: r.height, regels: tops.size, tegelMidden: (tegel.top + tegel.bottom) / 2 - r.top, wegMidden: (weg.top + weg.bottom) / 2 - r.top };
        }),
      );
      expect(blokken.length).toBe(soorten);
      // Dezelfde vorm in de hele kaart (niet alleen binnen een rij): één regel of twee regels, nooit een mengsel
      for (const b of blokken) {
        expect(b.regels).toBe(blokken[0].regels);
        expect(Math.abs(b.h - blokken[0].h)).toBeLessThanOrEqual(1);
        expect(Math.abs(b.tegelMidden - b.h / 2)).toBeLessThanOrEqual(2);
        expect(Math.abs(b.wegMidden - b.h / 2)).toBeLessThanOrEqual(2);
      }
    });
  }
}

for (const breed of [390, 360]) {
  test(`Drinken op ${breed} px: geen horizontale scroll, de rijen zijn laag en de link staat onderaan`, async ({ page }) => {
    await open(page, 6, breed, 844);
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, breed: document.documentElement.clientWidth, binnenBody: document.body.scrollWidth }));
    expect(m.scroll).toBeLessThanOrEqual(m.breed);
    expect(m.binnenBody).toBeLessThanOrEqual(m.breed);
    const hoogtes = await page.locator('.drinken__lijst .soortblok').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(hoogtes.length).toBe(6);
    for (const h of hoogtes) expect(h).toBeLessThanOrEqual(60);
    // Elke kaartkop blijft binnen het scherm
    const buiten = await page.evaluate(() => [...document.querySelectorAll('.drinken .kaartkop, .drinken .kaart')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).length);
    expect(buiten).toBe(0);
    await expect(page.locator('.drinken .weetje--link')).toBeVisible();
  });
}

// BESLISSING 349: de kaart "Je week in cijfers" heeft lucht tussen haar onderdelen, gelijkmatig, en eindigt gelijk met "Deze week".
// De rijen met inkt (alles wat afwijkt van de kaartkleur) in een beeld van de kaart, als banden [van, tot].
async function bandenVan(page, png) {
  const p2 = await page.context().newPage();
  await p2.goto('about:blank');
  const banden = await p2.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const px = (X, Y) => d.slice((Y * c.width + X) * 4, (Y * c.width + X) * 4 + 3);
    const bg = px(Math.floor(c.width / 2), c.height - 8);
    const b = [];
    let s = null;
    for (let Y = 0; Y <= c.height - 4; Y++) {
      let ink = false;
      for (let X = 30; X < c.width - 30 && !ink && Y < c.height - 4; X++) {
        const p = px(X, Y);
        ink = Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) > 10;
      }
      if (ink && s === null) s = Y;
      if (!ink && s !== null) { b.push([s, Y - 1]); s = null; }
    }
    return b;
  }, png.toString('base64'));
  await p2.close();
  return banden;
}

const CIJFERS_GROOTTES = [
  [1690, 1230],
  [1440, 900],
  [1280, 800],
];
for (const [breed, hoog] of CIJFERS_GROOTTES) {
  for (const dranken of [5, 1, 0]) {
    test(`Je week in cijfers op ${breed}x${hoog} met ${dranken} dranken: ruime, gelijkmatige tussenruimtes, eindigt gelijk met Deze week`, async ({ page }) => {
      await open(page, dranken, breed, hoog);
      const m = await page.evaluate(() => {
        const kaart = document.querySelector('.drinken__cijferkaart');
        const week = document.querySelector('.weekkaart--drinken');
        const r = (e) => e.getBoundingClientRect();
        const rijen = [...kaart.querySelectorAll('.kerncijfer')].map((e) => r(e));
        const rij1 = Math.max(rijen[0].bottom, rijen[1].bottom);
        const rij2Boven = Math.min(rijen[2].top, rijen[3].top);
        const rij2 = Math.max(rijen[2].bottom, rijen[3].bottom);
        const lijn = r(kaart.querySelector('.drinken__meest')).top;
        const label = r(kaart.querySelector('.drinken__meest .label'));
        const balk = kaart.querySelector('.verdeling');
        const leeg = kaart.querySelector('.drinken__meestleeg');
        const legenda = kaart.querySelector('.verdeling__item');
        // De lijn zelf is 1 px: de ruimte onder de lijn is van de rand van de lijn tot het kopje.
        const ruimtes = { rijen: rij2Boven - rij1, bovenLijn: lijn - rij2, onderLijn: label.top - lijn - 1, labelNaarBalk: (balk ? r(balk).top : r(leeg).top) - label.bottom };
        if (balk) ruimtes.balkNaarLegenda = r(legenda).top - r(balk).bottom;
        return { ruimtes, kaartBodem: r(kaart).bottom, weekBodem: r(week).bottom, kaartHoogte: r(kaart).height, weekHoogte: r(week).height };
      });
      // BESLISSING 354: de zichtbare tussenruimtes (op het beeld zelf gemeten, tussen de inkt) zijn gelijk: kaartkoplijn → rij 1 → rij 2 → scheidingslijn → kopje → balk → legenda.
      await page.mouse.move(0, 0);
      await page.waitForTimeout(1200); // tellers en overgangen zijn dan klaar
      await page.setViewportSize({ width: breed, height: 1500 }); // de hele kaart in beeld, zodat een vast element (zijbalk) er niet overheen valt
      // het scherm past zich aan de nieuwe hoogte aan en de overgangen zijn voorbij (geen vaste wachttijd)
      await domRustig(page);
      await animatiesKlaar(page);
      const png = await page.locator('.drinken__cijferkaart').screenshot();
      const banden = await bandenVan(page, png);
      const lijn = banden.findIndex((b) => b[0] === b[1] && b[0] > 10 && b[0] < 100); // de lijn onder de kaartkop (een band op rij 0 is de afgeronde hoek)
      const echte = [];
      for (const b of banden.slice(lijn)) {
        const vorige = echte[echte.length - 1];
        if (vorige && b[0] - vorige[1] - 1 < 8) vorige[1] = b[1]; // regels van één blok (een label over twee regels) horen bij elkaar
        else echte.push([...b]);
      }
      const gaten = echte.slice(1, dranken === 0 ? 6 : 7).map((b, i) => b[0] - echte[i][1] - 1); // lijn→rij 1, rij 1→rij 2, rij 2→lijn, lijn→kopje, kopje→balk, balk→legenda
      expect(gaten.length, `ruimtes ${JSON.stringify(gaten)} banden ${JSON.stringify(banden)}`).toBe(dranken === 0 ? 5 : 6);
      for (const g of gaten) expect(g, `ruimtes ${JSON.stringify(gaten)}`).toBeLessThanOrEqual(32);
      expect(Math.max(...gaten) - Math.min(...gaten), `ruimtes ${JSON.stringify(gaten)} banden ${JSON.stringify(banden)}`).toBeLessThanOrEqual(breed === 1280 ? 3 : 2);
      expect(Math.abs(m.kaartBodem - m.weekBodem)).toBeLessThanOrEqual(2);
      // Geen leeg vlak boven 32 px: in de cijferkaart is dat hierboven met de inkt gemeten (de scheidingslijn telt als inkt); in de weekkaart met de gewone meting.
      const leeg = await meetKaarten(page, '.drinken__raster');
      const week = leeg.find((g) => g.naam.includes('weekkaart'));
      expect(week.gat).toBeLessThanOrEqual(32);
    });
  }
}
