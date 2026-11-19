// Vandaag in Safari en in Chrome: dezelfde maten in beide motoren.
// Draait in de gewone ronde (Chromium) en in WebKit: PW_POORT=4671 PW_OUTDIR=<eigen map> npx playwright test -c playwright.safari.config.js
//  1. De kaart Drinken op de telefoon: het glas heeft de vorm van zijn verhouding (120 x 196), zijn kolom is even breed als het glas, en de cijfers,
//     de balk en Laatste weghalen blijven binnen de kaart (de melding van de eigenaar op zijn iPhone: de cijfers vielen rechts buiten de kaart).
//  2. Vanaf 1440 px: het glas naast de cijfers houdt zijn verhouding (in WebKit was het 40 px breed: de breedte kwam uit de gerekte hoogte, wat WebKit niet doet).
//  3. BESLISSING 679: op de telefoon staat de begroeting met een gewone naam op één regel, in een kleinere letter; een lange naam krijgt een nog kleinere
//     letter tot 28 px en valt pas daaronder op een tweede regel, zonder afgekapt te worden.
// Verzonnen namen: Sofie en Marie-Louise.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

async function zaai(page, { naam = 'Sofie', dranken = 4 } = {}) {
  await page.goto('./');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    ({ naam, dranken }) =>
      new Promise((klaar, mislukt) => {
        const q = indexedDB.open('bloei-dagboek');
        q.onerror = () => mislukt(q.error);
        q.onsuccess = () => {
          const db = q.result;
          const tx = db.transaction(['instellingen', 'dranken'], 'readwrite');
          tx.objectStore('instellingen').put({ sleutel: 'start.klaar', waarde: true });
          tx.objectStore('instellingen').put({ sleutel: 'profiel.naam', waarde: naam });
          const d = tx.objectStore('dranken');
          d.clear();
          const nu = new Date();
          const t2 = (x) => String(x).padStart(2, '0');
          const vandaag = `${nu.getFullYear()}-${t2(nu.getMonth() + 1)}-${t2(nu.getDate())}`;
          for (let i = 0; i < dranken; i++) d.add({ datum: vandaag, tijdstip: nu.getTime() - (dranken - i) * 60000, soort: 'water', ml: 200, voorbeeld: false });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    { naam, dranken },
  );
  await page.goto('./?opnieuw#/vandaag');
  await schermKlaar(page, 'vandaag');
}

// De kaart Drinken: het glas, zijn kolom en het verst naar rechts reikende element tegenover de binnenrand van de kaart.
const meetDrinken = (page) =>
  page.evaluate(() => {
    const kaart = document.querySelector('.vandaag .drinkkaart');
    const k = kaart.getBoundingClientRect();
    const binnenRechts = k.right - parseFloat(getComputedStyle(kaart).paddingRight);
    const glas = document.querySelector('.vandaag .drinkkaart .watervulling').getBoundingClientRect();
    const links = document.querySelector('.vandaag .drinkkaart .drinkkaart__links');
    const kolommen = getComputedStyle(links).gridTemplateColumns.split(' ').map(parseFloat);
    // Het cijfer, "van 2,5 l" en de balk binnen de binnenrand; de tekst van Laatste weghalen binnen de kaart (de knop steekt op 360 px al 4 px in de
    // binnenmarge, in beide motoren en zo goedgekeurd; het tikvlak eromheen telt niet).
    const r = (sel) => Math.max(...[...links.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().right));
    const cijfer = document.querySelector('.vandaag .drinkkaart .cijfer-groot').getBoundingClientRect();
    return { binnenRechts, kaartRechts: k.right, glasB: glas.width, glasH: glas.height, kolom1: kolommen[0], rechts: r('.cijfer-groot, .cijfer-groot + .t-klein, .drinkbaan'), knopRechts: r('.knop__tekst'), cijferL: cijfer.left, glasR: glas.right };
  });

// De begroeting: lettermaat, aantal regels en de rechterrand van de naam.
const meetBegroeting = (page) =>
  page.evaluate(() => {
    const titel = document.querySelector('.begroeting__titel');
    const cs = getComputedStyle(titel);
    const naam = document.querySelector('.begroeting__naam').getBoundingClientRect();
    const groet = document.querySelector('.begroeting__groet').getBoundingClientRect();
    const tekst = document.querySelector('.begroeting__tekst').getBoundingClientRect();
    return {
      fs: parseFloat(cs.fontSize),
      regels: Math.round(titel.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
      zelfdeRegel: Math.abs(naam.bottom - groet.bottom) < parseFloat(cs.lineHeight) / 2,
      naamRechts: naam.right,
      tekstRechts: tekst.right,
      titelRechts: titel.getBoundingClientRect().right,
      vw: innerWidth,
    };
  });

// Wacht tot vandaag.js de breedte van de begroeting gemeten heeft (zodra de letters geladen zijn).
const begroetingGemeten = (page) => expect.poll(() => page.evaluate(() => document.querySelector('.vandaag__begroeting')?.style.getPropertyValue('--begroet-em') || '')).not.toBe('');

test.describe('Vandaag in Safari en Chrome', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('de kaart Drinken op de telefoon: het glas houdt zijn vorm en de cijfers blijven binnen de kaart', async ({ page }) => {
    await zaai(page);
    for (const [b, h] of [[440, 956], [440, 760], [390, 844], [390, 660], [375, 667], [360, 560], [320, 480]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(150);
      const m = await meetDrinken(page);
      const maat = `${b}x${h}`;
      expect(Math.abs(m.glasB - (m.glasH * 120) / 196), `${maat}: het glas heeft de verhouding 120 x 196`).toBeLessThan(1);
      expect(Math.abs(m.kolom1 - m.glasB), `${maat}: de kolom van het glas is even breed als het glas`).toBeLessThan(1);
      expect(m.cijferL - m.glasR, `${maat}: geen brede lege strook tussen het glas en de cijfers`).toBeLessThan(40);
      expect(m.rechts, `${maat}: het cijfer, de doelregel en de balk binnen de binnenrand`).toBeLessThanOrEqual(m.binnenRechts + 0.5);
      expect(m.knopRechts, `${maat}: Laatste weghalen binnen de kaart`).toBeLessThanOrEqual(m.kaartRechts - 8);
    }
  });

  test('vanaf 1440 px houdt het glas naast de cijfers zijn verhouding', async ({ page }) => {
    await zaai(page);
    for (const [b, h] of [[1440, 900], [1690, 1230]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const g = document.querySelector('.vandaag .drinkkaart .watervulling').getBoundingClientRect();
        return { b: g.width, h: g.height };
      });
      expect(Math.abs(m.b - (m.h * 120) / 196), `${b}x${h}: glas ${m.b} x ${m.h}`).toBeLessThan(1);
    }
  });

  test('BESLISSING 679: een gewone naam staat op één regel, de gewone maat blijft als ze past', async ({ page }) => {
    await zaai(page, { naam: 'Sofie' });
    await begroetingGemeten(page);
    for (const [b, h] of [[440, 760], [390, 660], [360, 560], [320, 480]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(150);
      const m = await meetBegroeting(page);
      expect(m.regels, `${b}x${h}: een regel`).toBe(1);
      expect(m.zelfdeRegel, `${b}x${h}: de naam op de regel van de groet`).toBe(true);
      // De gewone maat op de telefoon (clamp(1.9rem, 10.5vw, 2.9rem)): "Goeiemiddag, Sofie" past erin en wordt niet kleiner.
      expect(Math.abs(m.fs - Math.min(46.4, Math.max(30.4, b * 0.105))), `${b}x${h}: de gewone maat`).toBeLessThan(0.5);
    }
  });

  test('BESLISSING 679: een lange naam krijgt een kleinere letter en valt pas onder 28 px op een tweede regel', async ({ page }) => {
    await zaai(page, { naam: 'Marie-Louise' });
    await begroetingGemeten(page);
    for (const [b, h] of [[440, 760], [390, 660], [360, 560]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(150);
      const m = await meetBegroeting(page);
      expect(m.regels, `${b}x${h}: een regel`).toBe(1);
      expect(m.zelfdeRegel, `${b}x${h}: de naam op de regel van de groet`).toBe(true);
      expect(m.fs, `${b}x${h}: niet onder de ondergrens`).toBeGreaterThanOrEqual(28);
      expect(m.fs, `${b}x${h}: kleiner dan de gewone maat`).toBeLessThan(b * 0.105);
      expect(m.naamRechts, `${b}x${h}: de naam binnen de kolom`).toBeLessThanOrEqual(m.tekstRechts + 0.5);
    }
    // 320 px: de naam past niet meer op 28 px; de letter blijft 28 px en de naam staat heel op de tweede regel.
    await page.setViewportSize({ width: 320, height: 480 });
    await page.waitForTimeout(150);
    const m = await meetBegroeting(page);
    expect(m.fs).toBe(28);
    expect(m.regels).toBe(2);
    expect(m.zelfdeRegel).toBe(false);
    expect(m.naamRechts, 'de naam wordt niet afgekapt').toBeLessThanOrEqual(m.tekstRechts + 0.5);
  });
});

// BESLISSING 679, ook op een tablet en een liggende telefoon (720 tot 959 px): dezelfde regel, andere breedte voor de titel (de kop is daar een rij naast Rondleiding en Delen).
test.describe('De begroeting op een liggende telefoon en een tablet', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  test('een gewone naam staat op één regel, de letter krimpt tot hij naast de knoppen past', async ({ page }) => {
    await zaai(page, { naam: 'Annelies' });
    await begroetingGemeten(page);
    for (const [b, h] of [[844, 390], [820, 1180], [768, 1024], [720, 900], [667, 375], [568, 320]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meetBegroeting(page);
      expect(m.regels, `${b}x${h}: een regel`).toBe(1);
      expect(m.zelfdeRegel, `${b}x${h}: de naam op de regel van de groet`).toBe(true);
      expect(m.fs, `${b}x${h}: niet onder de ondergrens`).toBeGreaterThanOrEqual(28);
      expect(m.naamRechts, `${b}x${h}: de naam binnen de kolom`).toBeLessThanOrEqual(m.titelRechts + 0.5);
    }
  });

  test('een lange naam valt pas onder 28 px op een tweede regel en wordt niet afgekapt', async ({ page }) => {
    await zaai(page, { naam: 'Marie-Louise' });
    await begroetingGemeten(page);
    for (const [b, h] of [[844, 390], [820, 1180], [768, 1024]]) {
      await page.setViewportSize({ width: b, height: h });
      await page.waitForTimeout(250);
      const m = await meetBegroeting(page);
      expect(m.fs, `${b}x${h}: de ondergrens`).toBe(28);
      expect(m.regels, `${b}x${h}: twee regels`).toBe(2);
      expect(m.naamRechts, `${b}x${h}: de naam wordt niet afgekapt`).toBeLessThanOrEqual(m.titelRechts + 0.5);
    }
  });

  test('vanaf 960 px (eigen mechaniek, BESLISSING 594 tot 596) staan beide namen op één regel', async ({ page }) => {
    for (const naam of ['Annelies', 'Marie-Louise']) {
      await zaai(page, { naam });
      await begroetingGemeten(page);
      for (const [b, h] of [[960, 700], [1100, 800], [1280, 800], [1440, 900]]) {
        await page.setViewportSize({ width: b, height: h });
        await page.waitForTimeout(250);
        const m = await meetBegroeting(page);
        expect(m.regels, `${naam} ${b}x${h}: een regel`).toBe(1);
        expect(m.zelfdeRegel, `${naam} ${b}x${h}: de naam op de regel van de groet`).toBe(true);
      }
    }
  });
});

// BESLISSING 697: op een liggende telefoon en een tablet staat de eerste regel van de begroeting op de grondlijn van het woord "bloei" (hoogstens 1 px verschil),
// voor elke lettermaat van 28 tot 44 px en voor een korte en een langere naam. De grondlijn is gemeten met een onzichtbaar blokje van 0 hoogte op de grondlijn.
const meetGrondlijnen = (page, fs) =>
  page.evaluate((fs) => {
    const titel = document.querySelector('.begroeting__titel');
    if (fs) titel.style.fontSize = fs + 'px';
    const sonde = (el) => {
      const s = document.createElement('span');
      s.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
      el.insertBefore(s, el.firstChild);
      const y = s.getBoundingClientRect().bottom;
      s.remove();
      return y;
    };
    const woord = sonde(document.querySelector('.vandaag__begroeting .logo__woord'));
    const groet = sonde(document.querySelector('.begroeting__groet'));
    if (fs) titel.style.fontSize = '';
    return { woord, groet };
  }, fs);

test.describe('De groet staat op de grondlijn van het woord bloei (BESLISSING 697)', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
  });

  for (const naam of ['Annelies', 'Marie-Louise']) {
    test(`${naam}: de grondlijn van de groet valt samen met die van "bloei" op 844 x 390 en 820 x 1180, voor elke lettermaat`, async ({ page }) => {
      await zaai(page, { naam });
      await begroetingGemeten(page);
      for (const [b, h] of [[844, 390], [820, 1180]]) {
        await page.setViewportSize({ width: b, height: h });
        await page.waitForTimeout(250);
        for (const fs of [0, 28, 36, 44]) {
          const m = await meetGrondlijnen(page, fs);
          expect(Math.abs(m.groet - m.woord), `${naam} ${b}x${h} letter ${fs || 'gewoon'}: groet ${m.groet}, bloei ${m.woord}`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

// De kaart Drinken van 960 tot 1439 px: de kolom van het glas heeft een vaste breedte en is even breed als het glas (WebKit maakt een automatische kolom niet meer smaller).
test('Vandaag van 960 tot 1439 px: de kolom van het glas is even breed als het glas en het glas houdt zijn verhouding', async ({ page }) => {
  await vasteKlok(page);
  await zaai(page);
  for (const b of [960, 1100, 1280, 1366, 1439]) {
    await page.setViewportSize({ width: b, height: 800 });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const g = document.querySelector('.vandaag .drinkkaart .watervulling').getBoundingClientRect();
      const kern = document.querySelector('.vandaag .drinkkaart__kern');
      return { b: g.width, h: g.height, kolom1: parseFloat(getComputedStyle(kern).gridTemplateColumns) };
    });
    expect(Math.abs(m.b - (m.h * 120) / 196), `${b}: glas ${m.b} x ${m.h}`).toBeLessThan(1);
    expect(Math.abs(m.kolom1 - m.b), `${b}: de kolom (${m.kolom1}) is even breed als het glas (${m.b})`).toBeLessThan(1);
  }
});
