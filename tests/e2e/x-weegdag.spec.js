// BESLISSING 477, 478 en 479: "Weegdag aanpassen" opent een pop-up (hetzelfde blad als Streefgewicht) met de zeven dagen als keuzegroep.
// Weekdagknoppen in hoofdletters (css) op drie plaatsen: het blad, Algemeen Gewicht (keuze en voorbeeldweek).
import { test, expect, devices } from '@playwright/test';
import { vasteKlok, VASTE_DATUM } from './vaste-klok.js';
import { animatiesKlaar } from './wacht.js';
import { wachtOpInstelling } from './r-wacht.js';

const BEELDEN = process.env.PW_BEELDEN || '';

const leesInst = (page, sleutel) =>
  page.evaluate(
    (s) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const v = open.result.transaction('instellingen').objectStore('instellingen').get(s);
          v.onsuccess = () => {
            open.result.close();
            klaar(v.result?.waarde ?? null);
          };
        };
      }),
    sleutel,
  );

// Drie wegingen en een weegdag (de vaste datum is een donderdag).
async function zaai(page, { weegdag = 1, thema = null } = {}) {
  await vasteKlok(page);
  await page.goto('./#/gewicht');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    ([dag, vandaag, themaKeuze]) =>
      new Promise((klaar, mislukt) => {
        const t2 = (x) => String(x).padStart(2, '0');
        const naarTekst = (d) => `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
        const [j, m, d0] = vandaag.split('-').map(Number);
        const verzoek = indexedDB.open('bloei-dagboek');
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onsuccess = () => {
          const db = verzoek.result;
          const tx = db.transaction(['wegingen', 'instellingen'], 'readwrite');
          tx.objectStore('wegingen').clear();
          [70, 69.2, 68.4].forEach((kg, i) => {
            const d = new Date(j, m - 1, d0 - 7 * (2 - i));
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            tx.objectStore('wegingen').put({ week: naarTekst(maandag), datum: naarTekst(d), kg, voorbeeld: false, gewijzigdOp: Date.now() });
          });
          tx.objectStore('instellingen').put({ sleutel: 'gewicht.weegdag', waarde: dag });
          if (themaKeuze) tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: themaKeuze });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [weegdag, VASTE_DATUM, thema],
  );
  await page.reload();
  await page.locator('.gewicht .gewicht__weetjes').waitFor();
  await animatiesKlaar(page);
}

const FORMATEN = [
  { naam: 'iPhone 390\u00d7844', breed: 390, hoog: 844, touch: true },
  { naam: 'iPhone 360\u00d7740', breed: 360, hoog: 740, touch: true },
  { naam: 'iPhone liggend 844\u00d7390', breed: 844, hoog: 390, touch: true },
  { naam: 'iPad staand 820\u00d71180', breed: 820, hoog: 1180, touch: true },
  { naam: 'iPad liggend 1180\u00d7820', breed: 1180, hoog: 820, touch: true },
  { naam: 'desktop 1280\u00d7800', breed: 1280, hoog: 800, touch: false },
  { naam: 'desktop 1690\u00d71230', breed: 1690, hoog: 1230, touch: false },
];
const { defaultBrowserType: _dbt, ...PIXEL7 } = devices['Pixel 7'];
const ALLE = [...FORMATEN, { naam: 'Android Pixel 7', apparaat: PIXEL7, breed: 412, hoog: 915, touch: true }];

const kaart = (page) => page.locator('.gewicht__weegdag');
const dialoog = (page) => page.locator('dialog.dialoog[open]');
const dagen = (page) => dialoog(page).getByRole('radio');
const dag = (page, naam) => dialoog(page).getByRole('radio', { name: naam, exact: true });
const klaarKnop = (page) => dialoog(page).getByRole('button', { name: 'Klaar', exact: true });
const annuleerKnop = (page) => dialoog(page).getByRole('button', { name: 'Annuleren', exact: true });
const kruisje = (page) => dialoog(page).getByRole('button', { name: 'Sluiten' });
const aanpasKnop = (page) => page.getByRole('button', { name: 'Weegdag aanpassen' });

for (const f of ALLE) {
  test.describe(f.naam, () => {
    if (f.apparaat) test.use(f.apparaat);
    else test.use({ viewport: { width: f.breed, height: f.hoog }, hasTouch: f.touch, isMobile: f.touch });
    const tik = (loc) => (f.touch ? loc.tap() : loc.click());

    test('de pop-up Weegdag: openen, kiezen, Klaar bewaart, vier manieren van sluiten bewaren niet', async ({ page }) => {
      await zaai(page, { weegdag: 1, thema: 'nacht' });
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('maandag'); // de DOM-tekst blijft gewoon geschreven
      expect(await kaart(page).locator('.cijfer-groot').evaluate((el) => getComputedStyle(el).textTransform)).toBe('capitalize'); // BESLISSING 482: een beginhoofdletter, geen drukletters
      const hash = await page.evaluate(() => location.hash);

      await tik(aanpasKnop(page));
      await expect(page.locator('#scherm')).toBeVisible();
      expect(await page.evaluate(() => location.hash)).toBe(hash); // geen sprong naar Algemeen
      await expect(dialoog(page)).toHaveCount(1);
      await expect(dialoog(page).getByRole('heading', { name: 'Weegdag' })).toBeVisible();
      await expect(page.locator('.blad[data-familie="gewicht"]')).toHaveCount(1);
      await expect(kruisje(page)).toBeVisible();
      await expect(dialoog(page).getByRole('radiogroup')).toHaveCount(1);
      await expect(dagen(page)).toHaveCount(7);
      await expect(dag(page, 'maandag')).toHaveAttribute('aria-checked', 'true'); // de huidige dag voorgekozen
      await expect(dag(page, 'maandag')).toBeFocused();
      await expect(dialoog(page)).toContainText('De dag waarop je je weging noteert.');
      expect(await dialoog(page).innerText()).not.toMatch(/[\u2013\u2014\u203a\u2192]/);
      // De zeven keuzes: hoofdletters via css, elk tikvlak minstens 44 px, geen afkappen en geen zijwaartse scroll
      const maten = await page.evaluate(() => {
        const blad = document.querySelector('dialog.dialoog[open] .dialoog__blad').getBoundingClientRect();
        return {
          keuzes: [...document.querySelectorAll('dialog.dialoog[open] [role="radio"]')].map((k) => {
            const r = k.getBoundingClientRect();
            const sp = k.querySelector('span');
            return { tekst: sp.textContent, transform: getComputedStyle(sp).textTransform, h: r.height, links: r.left, rechts: r.right, afgekapt: sp.scrollWidth > sp.clientWidth + 1 || k.scrollWidth > k.clientWidth + 1 };
          }),
          blad: { l: blad.left, r: blad.right, o: blad.bottom, b: blad.top },
          scroll: document.documentElement.scrollWidth,
          breed: innerWidth,
          hoog: innerHeight,
        };
      });
      for (const k of maten.keuzes) {
        expect(k.transform, k.tekst).toBe('uppercase');
        expect(k.h, k.tekst).toBeGreaterThanOrEqual(44);
        expect(k.afgekapt, k.tekst).toBe(false);
        expect(k.links).toBeGreaterThanOrEqual(maten.blad.l - 0.5);
        expect(k.rechts).toBeLessThanOrEqual(maten.blad.r + 0.5);
      }
      expect(maten.scroll).toBeLessThanOrEqual(maten.breed);
      if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/weegdag-blad-${f.breed}x${f.hoog}.png` });

      // Kiezen met de muis of een tik, Annuleren bewaart niet
      await tik(dag(page, 'donderdag'));
      await expect(dag(page, 'donderdag')).toHaveAttribute('aria-checked', 'true');
      await expect(dag(page, 'maandag')).toHaveAttribute('aria-checked', 'false');
      await tik(annuleerKnop(page));
      await expect(dialoog(page)).toHaveCount(0);
      expect(await leesInst(page, 'gewicht.weegdag')).toBe(1);
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('maandag');
      await expect(aanpasKnop(page)).toBeFocused();

      // Escape, het kruisje en de terugknop bewaren niet
      await tik(aanpasKnop(page));
      await tik(dag(page, 'zaterdag'));
      await page.keyboard.press('Escape');
      await expect(dialoog(page)).toHaveCount(0);
      expect(await leesInst(page, 'gewicht.weegdag')).toBe(1);
      await expect(aanpasKnop(page)).toBeFocused();

      await tik(aanpasKnop(page));
      await tik(dag(page, 'zaterdag'));
      await tik(kruisje(page));
      await expect(dialoog(page)).toHaveCount(0);
      expect(await leesInst(page, 'gewicht.weegdag')).toBe(1);

      await tik(aanpasKnop(page));
      await tik(dag(page, 'zaterdag'));
      await page.goBack();
      await expect(dialoog(page)).toHaveCount(0);
      await expect(page).toHaveURL(/#\/gewicht$/);
      expect(await leesInst(page, 'gewicht.weegdag')).toBe(1);

      // Dezelfde dag kiezen en Klaar: er verandert niets en er komt geen melding
      await tik(aanpasKnop(page));
      await tik(klaarKnop(page));
      await expect(dialoog(page)).toHaveCount(0);
      await expect(page.locator('.strook')).toHaveCount(0);
      expect(await leesInst(page, 'gewicht.weegdag')).toBe(1);
      await expect(aanpasKnop(page)).toBeFocused();

      // Een andere dag en Klaar: bewaart, het blad sluit, de kaart en de regel eronder kloppen, een melding, de focus terug
      await tik(aanpasKnop(page));
      await tik(dag(page, 'zaterdag'));
      await tik(klaarKnop(page));
      await expect(dialoog(page)).toHaveCount(0);
      await wachtOpInstelling(page, 'gewicht.weegdag', 6);
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('zaterdag');
      await expect(kaart(page)).toContainText('14 november'); // donderdag 12 november: de eerstvolgende zaterdag
      await expect(page.getByText('Weegdag bewaard.')).toBeVisible();
      await expect(page.locator('.strokenhouder')).toHaveAttribute('aria-live', 'polite');
      await expect(aanpasKnop(page)).toBeFocused();

      // Toetsenbord: pijltje kiest de volgende dag en Enter is Klaar
      await page.keyboard.press('Enter');
      await expect(dag(page, 'zaterdag')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(dag(page, 'zondag')).toBeFocused();
      await expect(dag(page, 'zondag')).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('ArrowRight'); // omlopen naar maandag
      await expect(dag(page, 'maandag')).toBeFocused();
      await page.keyboard.press('End');
      await expect(dag(page, 'zondag')).toBeFocused();
      await page.keyboard.press('Home');
      await expect(dag(page, 'maandag')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(dag(page, 'zondag')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(dialoog(page)).toHaveCount(0);
      await wachtOpInstelling(page, 'gewicht.weegdag', 7);
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('zondag');
      await page.reload();
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('zondag'); // ook na herladen

      // Ongedaan maken zet de vorige dag terug
      await tik(aanpasKnop(page));
      await tik(dag(page, 'dinsdag'));
      await tik(klaarKnop(page));
      await wachtOpInstelling(page, 'gewicht.weegdag', 2);
      await tik(page.locator('.strook__actie', { hasText: 'Ongedaan maken' }));
      await wachtOpInstelling(page, 'gewicht.weegdag', 7);
    });

    test('de knoppen staan gecentreerd en de kaart verandert niet van hoogte', async ({ page }) => {
      await zaai(page, { weegdag: 4, thema: 'nacht' });
      const rij = () => page.evaluate(() => ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height * 10) / 10));
      const voor = await rij();
      expect(Math.max(...voor) - Math.min(...voor), `${f.naam}: ${voor}`).toBeLessThanOrEqual(1); // BESLISSING 494: ook op 360 zijn de drie kaarten even hoog (korte knoptekst)
      await tik(aanpasKnop(page));
      await animatiesKlaar(page);
      const m = await page.evaluate(() => {
        const blad = document.querySelector('dialog.dialoog[open] .dialoog__blad');
        const knoppen = [...blad.querySelectorAll('.streefblad__knoppen .knop')].map((k) => k.getBoundingClientRect());
        const groep = (Math.min(...knoppen.map((k) => k.left)) + Math.max(...knoppen.map((k) => k.right))) / 2;
        const keuzes = blad.querySelector('.weegdagblad__dagen').getBoundingClientRect();
        const b = blad.getBoundingClientRect();
        const cs = getComputedStyle(blad);
        return { groep, keuzes: keuzes.left + keuzes.width / 2, blad: b.left + parseFloat(cs.paddingLeft) + (b.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 2, aantal: knoppen.length, hoogtes: knoppen.map((k) => k.height) };
      });
      expect(m.aantal).toBe(2);
      expect(Math.abs(m.groep - m.blad)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.groep - m.keuzes)).toBeLessThanOrEqual(1);
      for (const h of m.hoogtes) expect(h).toBeGreaterThanOrEqual(44);
      await tik(annuleerKnop(page));
      expect(await rij()).toEqual(voor); // de rij is niet veranderd door het openen en sluiten
      // Een andere dag: de kaart blijft even hoog, ook met het langste woord
      for (const [naam, nr] of [['donderdag', 4], ['woensdag', 3]]) {
        await tik(aanpasKnop(page));
        await tik(dag(page, naam));
        await tik(klaarKnop(page));
        await wachtOpInstelling(page, 'gewicht.weegdag', nr);
        await expect(kaart(page).locator('.cijfer-groot')).toHaveText(naam);
        const na = await rij();
        if (f.breed >= 380) expect(Math.max(...na) - Math.min(...na), `${naam}: ${na}`).toBeLessThanOrEqual(1);
        expect(na, naam).toEqual(voor);
        const over = await kaart(page).locator('.cijfer-groot').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, regels: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) }));
        expect(over.sw, `${naam} loopt over`).toBeLessThanOrEqual(over.cw + 1);
        expect(over.regels, `${naam} breekt af`).toBe(1);
        if (BEELDEN && nr === 4) await page.screenshot({ path: `${BEELDEN}/weegdag-kaart-${f.breed}x${f.hoog}.png` });
      }
    });
  });
}

test.describe('dezelfde dag bij Algemeen, Gewicht', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test('een wijziging op het ene scherm staat op het andere, en de weekdagknoppen zijn overal hoofdletters', async ({ page }) => {
    await zaai(page, { weegdag: 1, thema: 'nacht' });
    await aanpasKnop(page).click();
    await dag(page, 'woensdag').click();
    await klaarKnop(page).click();
    await wachtOpInstelling(page, 'gewicht.weegdag', 3);
    await page.goto('./#/meer/gewicht');
    await page.locator('.weegdagen .chip').first().waitFor();
    await animatiesKlaar(page);
    const stijl = (sel) =>
      page.evaluate((s) => [...document.querySelectorAll(s)].map((el) => { const c = getComputedStyle(el); return { tekst: el.textContent.trim(), tt: c.textTransform, ff: c.fontFamily, ls: c.letterSpacing, over: el.scrollWidth > el.clientWidth + 1 }; }), sel);
    const links = await stijl('.weegdagen .chip span');
    const rechts = await stijl('.gewvoorbeeld__dag');
    expect(links).toHaveLength(7);
    expect(rechts).toHaveLength(7);
    for (const s of [...links, ...rechts]) {
      expect(s.tt, s.tekst).toBe('uppercase');
      expect(s.over, s.tekst).toBe(false);
    }
    expect(links.map((s) => s.tekst)).toEqual(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']); // de DOM-tekst blijft gewoon
    expect(new Set([...links, ...rechts].map((s) => s.ff + '|' + s.ls)).size).toBe(1); // dezelfde letter en spatiering op beide plaatsen
    await expect(page.locator('.weegdagen .chip.is-actief')).toContainText('wo');
    await expect(page.locator('.gewvoorbeeld__dag.is-weegdag')).toContainText('wo');
    await expect(page.locator('.gewvoorbeeld__zin')).toHaveText('Je weegt op woensdag.'); // de zinnen blijven gewoon geschreven
    if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/instellingen-gewicht-1280.png` });
    // Omgekeerd: daar wijzigen en op Gewicht zien (de keuzeknop bewaart meteen)
    await page.locator('.weegdagen .chip', { hasText: 'za' }).click();
    await wachtOpInstelling(page, 'gewicht.weegdag', 6);
    await page.goto('./#/gewicht');
    await expect(kaart(page).locator('.cijfer-groot')).toHaveText('zaterdag');
    await aanpasKnop(page).click();
    await expect(dag(page, 'zaterdag')).toHaveAttribute('aria-checked', 'true');
  });
});

for (const breed of [360, 390]) {
  test.describe(`weekdagknoppen op ${breed}`, () => {
    test.use({ viewport: { width: breed, height: 800 }, hasTouch: true, isMobile: true });
    test('Instellingen Gewicht: hoofdletters, tikvlak minstens 44 px, geen overloop', async ({ page }) => {
      await zaai(page, { weegdag: 2, thema: 'nacht' });
      await page.goto('./#/meer/gewicht');
      await page.locator('.weegdagen .chip').first().waitFor();
      await animatiesKlaar(page);
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        breed: innerWidth,
        chips: [...document.querySelectorAll('.weegdagen .chip')].map((c) => { const r = c.getBoundingClientRect(); return { h: r.height, over: c.scrollWidth > c.clientWidth + 1, tt: getComputedStyle(c.querySelector('span')).textTransform }; }),
      }));
      expect(m.scroll).toBeLessThanOrEqual(m.breed);
      for (const c of m.chips) {
        expect(c.h).toBeGreaterThanOrEqual(44);
        expect(c.over).toBe(false);
        expect(c.tt).toBe('uppercase');
      }
      if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/instellingen-gewicht-${breed}.png` });
    });
  });
}

test('de kaart Weegdag past op 360, 390 en in de smalle kaart (1100 tot 1280) zonder afbreken of uitlopen', async ({ page }) => {
  for (const breed of [360, 390, 1100, 1180, 1280]) {
    await page.setViewportSize({ width: breed, height: 900 });
    for (const [dagNr, naam] of [[4, 'DONDERDAG'], [3, 'WOENSDAG'], [2, 'DINSDAG']]) {
      await zaai(page, { weegdag: dagNr, thema: 'nacht' });
      const m = await page.evaluate(() => {
        const el = document.querySelector('.gewicht__weegdag .cijfer-groot');
        const kaart = document.querySelector('.gewicht__weegdag').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const bereik = document.createRange();
        bereik.selectNodeContents(el);
        const tekst = bereik.getBoundingClientRect();
        return { over: el.scrollWidth > el.clientWidth + 1, regels: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight)), tekstRechts: tekst.right, kaartRechts: kaart.right, hoogte: kaart.height };
      });
      expect(m.over, `${naam} op ${breed}`).toBe(false);
      expect(m.regels, `${naam} op ${breed}`).toBe(1);
      expect(m.tekstRechts, `${naam} op ${breed}`).toBeLessThanOrEqual(m.kaartRechts);
    }
  }
});

// BESLISSING 481: de rij in de pop-up heeft dezelfde knopvorm, hoogte, afronding, letter en gekozen-stand als de rij bij Algemeen, Gewicht.
for (const [breed, hoog, touch] of [[390, 844, true], [360, 740, true], [1280, 800, false]]) {
  test.describe(`rij in de pop-up naast die in Instellingen op ${breed}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: touch, isMobile: touch });
    test('zelfde stijl en maten', async ({ page }) => {
      await zaai(page, { weegdag: 3, thema: 'nacht' });
      const meet = (wortel) =>
        page.evaluate((w) => {
          const groep = document.querySelector(w + ' .chips');
          const gr = groep.getBoundingClientRect();
          const chips = [...groep.querySelectorAll('.chip')];
          const stijl = (el) => { const c = getComputedStyle(el); return [c.fontFamily, c.fontSize, c.fontWeight, c.letterSpacing, c.textTransform, c.borderRadius].join('|'); };
          const zicht = (el) => { const c = getComputedStyle(el, '::before'); return [c.borderRadius, c.height].join('|'); };
          const vulling = (el) => getComputedStyle(el, '::before').backgroundColor;
          return {
            tekst: chips.map((c) => c.textContent.trim()),
            namen: chips.map((c) => c.getAttribute('aria-label')),
            kolommen: getComputedStyle(groep).gridTemplateColumns.split(' ').length,
            gap: getComputedStyle(groep).columnGap,
            hoogte: chips.map((c) => Math.round(c.getBoundingClientRect().height)),
            rijen: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size,
            breedtes: chips.map((c) => Math.round(c.getBoundingClientRect().width)),
            stijl: stijl(chips[0].querySelector('span')),
            vlak: zicht(chips[0]),
            gekozen: chips.findIndex((c) => c.classList.contains('is-actief')),
            gekozenVlak: zicht(chips.find((c) => c.classList.contains('is-actief'))),
            gekozenVulling: vulling(chips.find((c) => c.classList.contains('is-actief'))),
            rechts: Math.round(gr.right),
          };
        }, wortel);
      await aanpasKnop(page).tap().catch(() => aanpasKnop(page).click());
      await animatiesKlaar(page);
      const blad = await meet('dialog.dialoog[open]');
      if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/weegdag-blad-afk-${breed}.png` });
      await page.keyboard.press('Escape');
      await page.goto('./#/meer/gewicht');
      await page.locator('.weegdagen .chip').first().waitFor();
      await animatiesKlaar(page);
      const inst = await meet('.weegdagen');
      expect(blad.tekst).toEqual(['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']);
      expect(blad.namen).toEqual(['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']);
      expect(blad.stijl).toBe(inst.stijl);
      expect(blad.vlak).toBe(inst.vlak);
      expect(blad.gekozenVlak).toBe(inst.gekozenVlak);
      // De vulling van de gekozen dag volgt de familie van het scherm (Gewicht in de pop-up, Algemeen bij de instelling): bewust niet gelijk, wel gevuld
      expect(blad.gekozenVulling).not.toBe('rgba(0, 0, 0, 0)');
      expect(blad.gekozen).toBe(inst.gekozen);
      expect(blad.gap).toBe(inst.gap);
      for (const h of blad.hoogte) expect(h).toBeGreaterThanOrEqual(44);
      expect(blad.hoogte).toEqual(inst.hoogte);
      // Of de zeven naast elkaar passen, is een kwestie van de breedte van het blad: gemeld, niet verzwegen (zie de meting in het rapport)
      console.log(`MEETING ${breed}: pop-up kolommen ${blad.kolommen} rijen ${blad.rijen} breedtes ${blad.breedtes}; instelling kolommen ${inst.kolommen} rijen ${inst.rijen} breedtes ${inst.breedtes}`);
    });
  });
}
