// BESLISSING 463: "Streefgewicht zetten" (en "Streefgewicht aanpassen") opent een pop-up waarin je zelf een gewicht typt.
import { test, expect, devices } from '@playwright/test';
import { vasteKlok, VASTE_DATUM } from './vaste-klok.js';
import { animatiesKlaar } from './wacht.js';
import { wachtOpInstelling } from './r-wacht.js';

const rijen = (page, tabel) =>
  page.evaluate(
    (naam) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onsuccess = () => {
          const vraag = open.result.transaction(naam).objectStore(naam).getAll();
          vraag.onsuccess = () => {
            open.result.close();
            klaar(vraag.result);
          };
        };
      }),
    tabel,
  );
const streefInDb = async (page) => (await rijen(page, 'instellingen')).find((r) => r.sleutel === 'gewicht.streefKg')?.waarde ?? null;

// Zaait drie wegingen (eentje per week, de laatste in de huidige week van de vaste klok) en een streefgewicht (of geen).
async function zaai(page, { streef = null, wegingen = [70, 69.2, 68.4], thema = null } = {}) {
  await vasteKlok(page);
  await page.goto('./#/gewicht');
  await page.locator('#scherm[data-scherm]').first().waitFor({ state: 'attached' });
  await page.evaluate(
    ([kgs, streefKg, vandaag, themaKeuze]) =>
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
          kgs.forEach((kg, i) => {
            const d = new Date(j, m - 1, d0 - 7 * (kgs.length - 1 - i));
            const maandag = new Date(d);
            maandag.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            tx.objectStore('wegingen').put({ week: naarTekst(maandag), datum: naarTekst(d), kg, voorbeeld: false, gewijzigdOp: Date.now() });
          });
          tx.objectStore('instellingen').put({ sleutel: 'gewicht.streefKg', waarde: streefKg });
          if (themaKeuze) tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: themaKeuze });
          tx.oncomplete = () => {
            db.close();
            klaar();
          };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    [wegingen, streef, VASTE_DATUM, thema],
  );
  await page.reload();
  await page.locator('.gewicht .gewicht__weetjes').waitFor();
  await animatiesKlaar(page);
}

const BEELDEN2 = process.env.PW_BEELDEN || '';
const FORMATEN = [
  { naam: 'iPhone 390\u00d7844', breed: 390, hoog: 844, touch: true },
  { naam: 'iPhone 360\u00d7740', breed: 360, hoog: 740, touch: true },
  { naam: 'iPhone liggend 844\u00d7390', breed: 844, hoog: 390, touch: true },
  { naam: 'iPad staand 820\u00d71180', breed: 820, hoog: 1180, touch: true },
  { naam: 'iPad liggend 1180\u00d7820', breed: 1180, hoog: 820, touch: true },
  { naam: 'desktop 1280\u00d7800', breed: 1280, hoog: 800, touch: false },
  { naam: 'desktop 1690\u00d71230', breed: 1690, hoog: 1230, touch: false },
];

const kaart = (page) => page.locator('.gewichtstreef');
const dialoog = (page) => page.locator('dialog.dialoog[open]');
const veld = (page) => dialoog(page).getByRole('textbox', { name: 'Gewicht in kg' });
const klaarKnop = (page) => dialoog(page).getByRole('button', { name: 'Klaar', exact: true });
const annuleerKnop = (page) => dialoog(page).getByRole('button', { name: 'Annuleren', exact: true });
const verwijderKnop = (page) => dialoog(page).getByRole('button', { name: 'Verwijderen', exact: true });
const kruisje = (page) => dialoog(page).getByRole('button', { name: 'Sluiten' });
const zetKnop = (page) => page.getByRole('button', { name: 'Streefgewicht zetten' });
const aanpasKnop = (page) => page.getByRole('button', { name: 'Streefgewicht aanpassen' });

const BEELDEN = process.env.PW_BEELDEN || '';
const { defaultBrowserType: _dbt, ...PIXEL7 } = devices['Pixel 7'];

const ALLE_FORMATEN = [...FORMATEN, { naam: 'Android Pixel 7', apparaat: PIXEL7, breed: 412, hoog: 915, touch: true }];

for (const f of ALLE_FORMATEN) {
  test.describe(f.naam, () => {
    if (f.apparaat) test.use(f.apparaat);
    else test.use({ viewport: { width: f.breed, height: f.hoog }, hasTouch: f.touch, isMobile: f.touch });
    const tik = (loc) => (f.touch ? loc.tap() : loc.click());

    test('van leeg naar een streefgewicht, aanpassen, sluiten zonder bewaren en verwijderen met Ongedaan maken', async ({ page }) => {
      await zaai(page, { streef: null });
      // Zonder streefgewicht: het streepje, de regel en de knop
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('-');
      await expect(kaart(page)).toContainText('Alleen voor jou, als een stippellijn in de grafiek.');
      await expect(page.locator('.grafiek__streef')).toHaveCount(0);

      // Openen: een pop-up met titel, kruisje, een leeg veld met de focus erin en Klaar uit
      await tik(zetKnop(page));
      await expect(dialoog(page)).toHaveCount(1);
      await expect(dialoog(page).getByRole('heading', { name: 'Streefgewicht' })).toBeVisible();
      await expect(page.locator('.blad[data-familie="gewicht"]')).toHaveCount(1);
      await expect(kruisje(page)).toBeVisible();
      await expect(veld(page)).toHaveValue('');
      await expect(veld(page)).toBeFocused();
      await expect(veld(page)).toHaveAttribute('inputmode', 'decimal');
      await expect(klaarKnop(page)).toBeDisabled();
      await expect(annuleerKnop(page)).toBeVisible();
      await expect(verwijderKnop(page)).toHaveCount(0); // er is nog niets om te verwijderen
      await expect(dialoog(page)).toContainText('Alleen voor jou, als een stippellijn in de grafiek.');
      expect(await dialoog(page).innerText()).not.toMatch(/[\u2013\u2014\u203a\u2192]/);
      // Volgorde: Klaar, Annuleren (Verwijderen komt rechts als het er is)
      const x = async (loc) => (await loc.boundingBox()).x;
      expect(await x(klaarKnop(page))).toBeLessThan(await x(annuleerKnop(page)));
      // Geen zijwaartse scroll, het blad binnen het scherm
      await animatiesKlaar(page); // het blad komt zacht op: pas daarna meten
      const maten = await page.evaluate(() => {
        const d = document.querySelector('dialog.dialoog[open] .dialoog__blad').getBoundingClientRect();
        return { links: d.left, rechts: d.right, boven: d.top, onder: d.bottom, breedte: innerWidth, hoogte: innerHeight, scroll: document.documentElement.scrollWidth };
      });
      expect(maten.links).toBeGreaterThanOrEqual(0);
      expect(maten.rechts).toBeLessThanOrEqual(maten.breedte + 0.5);
      expect(maten.boven).toBeGreaterThanOrEqual(-0.5);
      expect(maten.onder).toBeLessThanOrEqual(maten.hoogte + 0.5);
      expect(maten.scroll).toBeLessThanOrEqual(maten.breedte);
      if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/streef-leeg-${f.breed}x${f.hoog}.png` });
      // Klaar bereikbaar (binnen het blad, eventueel door te scrollen)
      await klaarKnop(page).scrollIntoViewIfNeeded();
      await expect(klaarKnop(page)).toBeInViewport();

      // Typen met een komma en Klaar: bewaart, het blad sluit, de kaart toont het cijfer, de stippellijn en de zin staan er, de focus keert terug
      await veld(page).fill('64,5');
      await expect(klaarKnop(page)).toBeEnabled();
      await tik(klaarKnop(page));
      await expect(dialoog(page)).toHaveCount(0);
      await wachtOpInstelling(page, 'gewicht.streefKg', 64.5);
      expect(await streefInDb(page)).toBe(64.5);
      await expect(kaart(page).locator('.cijfer-groot')).toContainText('64,5');
      await expect(kaart(page).locator('.cijfer-groot')).toContainText('kg');
      await expect(page.locator('.grafiek__streef')).toHaveCount(1);
      await expect(page.locator('.gewicht__wegzin')).toHaveText('Nog 3,9 kg tot je streefgewicht.');
      await expect(page.getByText('Streefgewicht bewaard.')).toBeVisible();
      await expect(page.locator('.strokenhouder')).toHaveAttribute('aria-live', 'polite');
      await expect(aanpasKnop(page)).toBeVisible();
      await expect(aanpasKnop(page)).toBeFocused();
      await expect(zetKnop(page)).toHaveCount(0);
      await expect(page.locator('.gewichtstreef .stapper')).toHaveCount(0);

      // Aanpassen: het veld staat ingevuld en geselecteerd
      await tik(aanpasKnop(page));
      await expect(veld(page)).toHaveValue('64,5');
      await expect(veld(page)).toBeFocused();
      expect(await veld(page).evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([0, 4]);
      await expect(verwijderKnop(page)).toBeVisible();
      if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/streef-ingevuld-${f.breed}x${f.hoog}.png` });

      // Typen met een punt; Annuleren bewaart niet
      await veld(page).fill('60.2');
      await tik(annuleerKnop(page));
      await expect(dialoog(page)).toHaveCount(0);
      expect(await streefInDb(page)).toBe(64.5);
      await expect(kaart(page).locator('.cijfer-groot')).toContainText('64,5');
      await expect(aanpasKnop(page)).toBeFocused();

      // Escape, het kruisje en de terugknop bewaren niet (er is geen tussentijdse opslag)
      await tik(aanpasKnop(page));
      await veld(page).fill('61,1');
      await page.keyboard.press('Escape');
      await expect(dialoog(page)).toHaveCount(0);
      expect(await streefInDb(page)).toBe(64.5);
      await expect(aanpasKnop(page)).toBeFocused();

      await tik(aanpasKnop(page));
      await veld(page).fill('61,2');
      await tik(kruisje(page));
      await expect(dialoog(page)).toHaveCount(0);
      expect(await streefInDb(page)).toBe(64.5);
      await expect(aanpasKnop(page)).toBeFocused();

      await tik(aanpasKnop(page));
      await veld(page).fill('61,3');
      await page.goBack();
      await expect(dialoog(page)).toHaveCount(0);
      await expect(page).toHaveURL(/#\/gewicht$/);
      expect(await streefInDb(page)).toBe(64.5);

      // Een nieuw gewicht met een punt en Enter bewaart
      await tik(aanpasKnop(page));
      await veld(page).fill('63.8');
      await veld(page).press('Enter');
      await expect(dialoog(page)).toHaveCount(0);
      await wachtOpInstelling(page, 'gewicht.streefKg', 63.8);
      await expect(kaart(page).locator('.cijfer-groot')).toContainText('63,8');
      await page.reload();
      await expect(page.locator('.gewichtstreef .cijfer-groot')).toContainText('63,8'); // ook na herladen
      await expect(page.locator('.grafiek__streef')).toHaveCount(1);

      // Ongedaan maken na bewaren zet het vorige streefgewicht terug
      await tik(aanpasKnop(page));
      await veld(page).fill('62');
      await veld(page).press('Enter');
      await wachtOpInstelling(page, 'gewicht.streefKg', 62);
      await tik(page.locator('.strook__actie', { hasText: 'Ongedaan maken' }));
      await wachtOpInstelling(page, 'gewicht.streefKg', 63.8);

      // Verwijderen: eerst de vraag; "Laten staan" doet niets, "Wissen" haalt het weg, Ongedaan maken brengt het terug
      await tik(aanpasKnop(page));
      await tik(verwijderKnop(page));
      await expect(page.getByText('Je streefgewicht wissen?')).toBeVisible();
      await tik(page.getByRole('button', { name: 'Laten staan' }));
      expect(await streefInDb(page)).toBe(63.8);
      await tik(verwijderKnop(page));
      await tik(page.getByRole('button', { name: 'Wissen', exact: true }));
      await expect(dialoog(page)).toHaveCount(0);
      await wachtOpInstelling(page, 'gewicht.streefKg', undefined);
      await expect(kaart(page).locator('.cijfer-groot')).toHaveText('-');
      await expect(page.locator('.grafiek__streef')).toHaveCount(0);
      await expect(page.getByText('Streefgewicht gewist.')).toBeVisible();
      await expect(zetKnop(page)).toBeFocused();
      await tik(page.locator('.strook__actie', { hasText: 'Ongedaan maken' }));
      await wachtOpInstelling(page, 'gewicht.streefKg', 63.8);
      await expect(kaart(page).locator('.cijfer-groot')).toContainText('63,8');
    });

    test('de bovenste rij blijft gelijk hoog met en zonder streefgewicht', async ({ page }) => {
      for (const streef of [null, 66]) {
        await zaai(page, { streef });
        const m = await page.evaluate(() => ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((s) => document.querySelector(s).getBoundingClientRect().height));
        expect(Math.max(...m) - Math.min(...m), `${f.naam} ${streef}: ${m}`).toBeLessThanOrEqual(1);
      }
    });
  });
}

test.describe('ongeldige waarden', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  for (const [waarde, ongeldig] of [
    ['', false], // leeg: geen melding, Klaar staat uit
    ['abc', true],
    ['6x', true],
    ['-65', true],
    ['19,9', true],
    ['300,1', true],
    ['1000', true],
    ['65,4,1', true],
  ]) {
    test(`"${waarde}" laat Klaar uit${ongeldig ? ' met een melding' : ''} en bewaart niets`, async ({ page }) => {
      await zaai(page, { streef: 66 });
      await aanpasKnop(page).click();
      await veld(page).fill(waarde);
      await expect(klaarKnop(page)).toBeDisabled();
      const melding = dialoog(page).getByRole('alert');
      if (ongeldig) {
        await expect(melding).toHaveText('Vul een gewicht tussen 20 en 300 kg in.');
        await expect(veld(page)).toHaveAttribute('aria-invalid', 'true');
      } else await expect(melding).toBeHidden();
      await veld(page).press('Enter'); // Enter = Klaar, maar de waarde is ongeldig: het blad blijft open
      await expect(dialoog(page)).toHaveCount(1);
      await expect(veld(page)).toBeFocused();
      expect(await streefInDb(page)).toBe(66);
      // Een geldige waarde haalt de melding weg en zet Klaar aan
      await veld(page).fill('66,5');
      await expect(klaarKnop(page)).toBeEnabled();
      await expect(melding).toBeHidden();
    });
  }

  test('de grenzen zelf (20 en 300) en een tweede decimaal (afgerond zoals bij een weging) zijn geldig', async ({ page }) => {
    await zaai(page, { streef: null });
    for (const [invoer, bewaard] of [['20', 20], ['300', 300], ['65,44', 65.4], ['65.46', 65.5]]) {
      await zetKnop(page).or(aanpasKnop(page)).click();
      await veld(page).fill(invoer);
      await expect(klaarKnop(page)).toBeEnabled();
      await klaarKnop(page).click();
      await wachtOpInstelling(page, 'gewicht.streefKg', bewaard);
      await expect(dialoog(page)).toHaveCount(0);
    }
  });
});

test.describe('dezelfde waarde bij Algemeen, Gewicht', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  test('een wijziging op het ene scherm staat op het andere, en omgekeerd', async ({ page }) => {
    await zaai(page, { streef: null });
    await zetKnop(page).click();
    await veld(page).fill('64,5');
    await klaarKnop(page).click();
    await wachtOpInstelling(page, 'gewicht.streefKg', 64.5);
    await page.goto('./#/meer/gewicht');
    await expect(page.locator('.streefveld__invoer')).toHaveValue('64,5');
    // Daar wijzigen (de stapper bewaart na een korte tik) en terug naar Gewicht
    await page.locator('.streefbediening').getByRole('button').first().click();
    await expect.poll(() => streefInDb(page)).not.toBe(64.5);
    const nieuw = await streefInDb(page);
    await page.goto('./#/gewicht');
    await expect(page.locator('.gewichtstreef .cijfer-groot')).toContainText(String(nieuw.toFixed(1)).replace('.', ','));
    await aanpasKnop(page).click();
    await expect(veld(page)).toHaveValue(String(nieuw.toFixed(1)).replace('.', ','));
  });
});

test('de rondleiding wijst nog naar de streefkaart', async ({ page }) => {
  await zaai(page, { streef: 66 });
  await expect(page.locator('[data-uitleg="streefgewicht"]')).toHaveCount(1);
  await expect(page.locator('[data-uitleg="streefgewicht"] .knop')).toHaveAccessibleName('Streefgewicht aanpassen'); // BESLISSING 494: de naam is altijd de volle tekst
});

// BESLISSING 469: de knoppen en de regel van het blad staan gecentreerd onder het gecentreerde veld: het midden van de groep valt op
// 1 px samen met het midden van het veld en van het blad, met twee en met drie knoppen, en elk tikvlak is minstens 44 px hoog.
const CENTREER = [
  { naam: 'iPhone 390', breed: 390, hoog: 844, touch: true },
  { naam: 'iPhone 360', breed: 360, hoog: 740, touch: true },
  { naam: 'desktop 1280', breed: 1280, hoog: 800, touch: false },
];
for (const f of CENTREER) {
  for (const thema of ['poeder', 'nacht']) {
    test.describe(`${f.naam} ${thema}: knoppen gecentreerd`, () => {
      test.use({ viewport: { width: f.breed, height: f.hoog }, hasTouch: f.touch, isMobile: f.touch });
      for (const streef of [null, 66]) {
        test(`met ${streef == null ? 'twee' : 'drie'} knoppen`, async ({ page }) => {
          await zaai(page, { streef, thema });
          await (streef == null ? zetKnop(page) : aanpasKnop(page)).click();
          await animatiesKlaar(page);
          const m = await page.evaluate(() => {
            const midden = (el) => {
              const r = el.getBoundingClientRect();
              return { m: r.left + r.width / 2, l: r.left, r: r.right, h: r.height };
            };
            const blad = document.querySelector('dialog.dialoog[open] .dialoog__blad');
            const rij = blad.querySelector('.streefblad__knoppen');
            const knoppen = [...rij.querySelectorAll('.knop')].map(midden);
            const regel = blad.querySelector('.streefblad__regel');
            const groep = { m: (Math.min(...knoppen.map((k) => k.l)) + Math.max(...knoppen.map((k) => k.r))) / 2 };
            const vb = getComputedStyle(blad);
            const binnen = blad.getBoundingClientRect();
            const padL = parseFloat(vb.paddingLeft);
            const padR = parseFloat(vb.paddingRight);
            return {
              groep: groep.m,
              veld: midden(blad.querySelector('.veld__invoer')).m,
              blad: binnen.left + padL + (binnen.width - padL - padR) / 2,
              regel: midden(regel).m,
              regelAlign: getComputedStyle(regel).textAlign,
              hoogtes: knoppen.map((k) => k.h),
              aantal: knoppen.length,
              tussen: knoppen.slice(1).map((k, i) => k.l - knoppen[i].r),
            };
          });
          expect(m.aantal).toBe(streef == null ? 2 : 3);
          expect(Math.abs(m.groep - m.veld), `groep ${m.groep} veld ${m.veld}`).toBeLessThanOrEqual(1);
          expect(Math.abs(m.groep - m.blad), `groep ${m.groep} blad ${m.blad}`).toBeLessThanOrEqual(1);
          expect(m.regelAlign).toBe('center');
          for (const h of m.hoogtes) expect(h).toBeGreaterThanOrEqual(44);
          expect(Math.max(...m.tussen) - Math.min(...m.tussen), 'gelijke tussenruimte').toBeLessThanOrEqual(1);
          if (BEELDEN) await page.screenshot({ path: `${BEELDEN}/streef-${thema}-${m.aantal}knoppen-${f.breed}.png` });
        });
      }
    });
  }
}

// BESLISSING 483 en 484: "Weging noteren", "Weegdag aanpassen" en "Streefgewicht zetten/aanpassen" zijn alle drie de gevulde knop in de kleur van
// Gewicht: zelfde vorm, kleur, hoogte en onderkant in hun kaart, met en zonder wegingen en op elke breedte; contrast minstens 4,5 in Poeder, Salie en Nacht.
for (const [breed, hoog] of [[390, 844], [820, 1180], [1280, 800], [1690, 1230]]) {
  for (const [naam, wegingen, streef] of [['zonder weging', [], null], ['met wegingen', [70, 69.2, 68.4], 66]]) {
    test(`knoppen van de drie bovenkaarten gelijk: ${naam} op ${breed}`, async ({ page }) => {
      await page.setViewportSize({ width: breed, height: hoog });
      await zaai(page, { streef, wegingen, thema: 'nacht' });
      const m = await page.evaluate(() =>
        ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((s) => {
          const kaart = document.querySelector(s);
          const k = kaart.querySelector('.gewicht__actie .knop');
          const c = getComputedStyle(k);
          const r = k.getBoundingClientRect();
          const kr = kaart.getBoundingClientRect();
          return { klasse: k.className, hoogte: Math.round(r.height), links: Math.round(r.left - kr.left), breedte: Math.round(r.width), onder: Math.round(kr.bottom - r.bottom), radius: c.borderTopLeftRadius, kleur: c.color, rand: c.borderTopWidth + c.borderTopStyle, achtergrond: c.backgroundColor, gewicht: c.fontWeight, padding: c.paddingLeft + '|' + c.paddingTop, kaartOnder: Math.round(kr.bottom) };
        }),
      );
      const [a, b, c] = m;
      for (const x of [a, b, c]) {
        expect(x.klasse).toContain('knop--primair');
        expect(x.achtergrond).not.toBe('rgba(0, 0, 0, 0)'); // gevuld, niet transparant
      }
      expect(a.radius).toBe(b.radius);
      expect(b.radius).toBe(c.radius);
      for (const x of [b, c]) {
        expect(x.hoogte).toBe(a.hoogte);
        expect(x.kleur).toBe(a.kleur);
        expect(x.rand).toBe(a.rand);
        expect(x.achtergrond).toBe(a.achtergrond);
        expect(x.gewicht).toBe(a.gewicht);
        expect(x.padding).toBe(a.padding);
        expect(Math.abs(x.links - a.links)).toBeLessThanOrEqual(1);
        // de breedte volgt de tekst van de knop (breed naar inhoud, links uitgelijnd): niet gelijk te eisen
        expect(Math.abs(x.onder - a.onder)).toBeLessThanOrEqual(1);
      }
      if (BEELDEN2 && naam === 'met wegingen') await page.screenshot({ path: `${BEELDEN2}/drie-kaarten-${breed}.png` });
    });
  }
}

// BESLISSING 484: contrast van de tekst op de vulling van de drie knoppen (de familiekleur van Gewicht); BESLISSING 544: "Klaar" in de pop-up heeft als groepsknop de zachte tint.
for (const thema of ['poeder', 'salie', 'nacht']) {
  test(`de gevulde knoppen van Gewicht in ${thema}: contrast en familiekleur`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await zaai(page, { streef: 66, thema });
    const lees = () =>
      page.evaluate(() => {
        const rgb = (kleur) => {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 1;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = kleur;
          cx.fillRect(0, 0, 1, 1);
          return [...cx.getImageData(0, 0, 1, 1).data];
        };
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const verhouding = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
        return ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((s) => {
          const k = document.querySelector(s + ' .gewicht__actie .knop');
          const c = getComputedStyle(k);
          return { bg: c.backgroundColor, fg: c.color, cr: Math.round(verhouding(rgb(c.backgroundColor), rgb(c.color)) * 100) / 100, h: Math.round(k.getBoundingClientRect().height) };
        });
      });
    const knoppen = await lees();
    for (const k of knoppen) {
      expect(k.cr, JSON.stringify(k)).toBeGreaterThanOrEqual(4.5);
      expect(k.bg).toBe(knoppen[0].bg);
      expect(k.fg).toBe(knoppen[0].fg);
      expect(k.h).toBe(knoppen[0].h);
    }
    await aanpasKnop(page).click();
    // BESLISSING 544: een knop die alleen staat (de drie kaartknoppen) blijft gevuld in de familiekleur; "Klaar" staat in een groep met Annuleren en heeft
    // net als die de zachte tint van het tabblad (--knop-zacht-bg) met de gewone tekstkleur, met voldoende contrast.
    const klaar = await klaarKnop(page).evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--knop-zacht-bg)';
      el.closest('dialog').append(probe);
      const zacht = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, zacht };
    });
    expect(klaar.bg, 'Klaar heeft de zachte tint van het tabblad').toBe(klaar.zacht);
    expect(klaar.bg, 'de zachte tint verschilt van de gevulde kaartknoppen').not.toBe(knoppen[0].bg);
    const annuleer = await annuleerKnop(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(klaar.bg, 'Klaar en Annuleren hebben dezelfde kleur (een groep)').toBe(annuleer);
    await page.keyboard.press('Escape');
    if (BEELDEN2) {
      await page.screenshot({ path: `${BEELDEN2}/drie-knoppen-${thema}-1280.png` });
    }
  });
}

// BESLISSING 492: de pop-up "Weging noteren" heeft Noteren en Annuleren gecentreerd naast elkaar, met dezelfde helper en klasse als de
// pop-ups Streefgewicht en Weegdag; op een telefoon (tot 430 px) vullen ze samen de breedte zoals bij het maaltijdblad.
const wegingKnop = (page) => page.getByRole('button', { name: 'Weging noteren' });
const annuleerKnop2 = (page) => dialoog(page).getByRole('button', { name: 'Annuleren', exact: true });
for (const [breed, hoog, touch] of [[390, 844, true], [360, 740, true], [430, 900, true], [820, 1180, true], [1280, 800, false]]) {
  test.describe(`pop-up Weging noteren op ${breed}`, () => {
    test.use({ viewport: { width: breed, height: hoog }, hasTouch: touch, isMobile: touch });
    test('Noteren en Annuleren staan gecentreerd naast elkaar zoals bij Streefgewicht', async ({ page }) => {
      await zaai(page, { streef: 66, thema: 'nacht' });
      const meet = () =>
        page.evaluate(() => {
          const d = document.querySelector('dialog.dialoog[open]');
          const groep = d.querySelector('.streefblad__knoppen');
          const kn = [...groep.querySelectorAll('.knop')].map((k) => k.getBoundingClientRect());
          const db = d.querySelector('.dialoog__blad').getBoundingClientRect();
          return {
            klassen: groep.className,
            namen: [...groep.querySelectorAll('.knop')].map((k) => k.textContent.trim()),
            tops: kn.map((r) => Math.round(r.top)),
            hoogtes: kn.map((r) => Math.round(r.height)),
            breedtes: kn.map((r) => Math.round(r.width * 10) / 10),
            midden: (Math.min(...kn.map((r) => r.left)) + Math.max(...kn.map((r) => r.right))) / 2,
            bladMidden: (db.left + db.right) / 2,
            vink: !!groep.querySelector('.maaltijd__vink'),
            oudeActies: d.querySelectorAll('.dialoog__acties').length,
          };
        });
      await wegingKnop(page).click();
      const dlg = dialoog(page);
      await dlg.waitFor();
      await animatiesKlaar(page);
      const w = await meet();
      expect(w.namen).toEqual(['Noteren', 'Annuleren']);
      expect(w.klassen).toContain('maaltijd__acties');
      expect(w.klassen).toContain('streefblad__knoppen');
      expect(w.oudeActies).toBe(0);
      expect(w.vink).toBe(true);
      expect(new Set(w.tops).size, `naast elkaar op ${breed}: ${w.tops}`).toBe(1);
      expect(Math.min(...w.hoogtes)).toBeGreaterThanOrEqual(44);
      expect(Math.abs(w.midden - w.bladMidden), `gecentreerd op ${breed}`).toBeLessThanOrEqual(1);
      if (breed <= 430) expect(Math.abs(w.breedtes[0] - w.breedtes[1]), `gelijke breedte op ${breed}: ${w.breedtes}`).toBeLessThanOrEqual(1);
      if (BEELDEN2 && (breed === 390 || breed === 1280)) await page.screenshot({ path: `${BEELDEN2}/wegingblad-${breed}.png` });
      // Dezelfde groep als in het blad Streefgewicht: zelfde klassen en zelfde hoogte
      await annuleerKnop2(page).click();
      await expect(dlg).toHaveCount(0);
      await aanpasKnop(page).click();
      await dlg.waitFor();
      await animatiesKlaar(page);
      const s = await meet();
      expect(s.klassen).toBe(w.klassen);
      expect(s.hoogtes[0]).toBe(w.hoogtes[0]);
      if (BEELDEN2 && (breed === 390 || breed === 1280)) await page.screenshot({ path: `${BEELDEN2}/streefblad-${breed}.png` });
    });
  });
}

test.describe('pop-up Weging noteren: gedrag ongewijzigd', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('Annuleren bewaart niets; Noteren bewaart, meldt en Ongedaan maken zet terug; Escape en het kruisje sluiten zonder te bewaren', async ({ page }) => {
    await zaai(page, { streef: 66 });
    const wegingen = async () => (await rijen(page, 'wegingen')).map((r) => `${r.datum} ${r.kg}`).sort();
    const voor = await wegingen();
    await wegingKnop(page).click();
    await dialoog(page).getByRole('button', { name: /^Eentje meer/ }).click();
    await annuleerKnop2(page).click();
    await expect(dialoog(page)).toHaveCount(0);
    expect(await wegingen()).toEqual(voor);
    await wegingKnop(page).click();
    await dialoog(page).waitFor();
    await page.keyboard.press('Escape');
    await expect(dialoog(page)).toHaveCount(0);
    await wegingKnop(page).click();
    await dialoog(page).waitFor();
    await kruisje(page).click();
    await expect(dialoog(page)).toHaveCount(0);
    expect(await wegingen()).toEqual(voor);

    // Noteren: dezelfde week heeft al een weging, dus eerst de vraag; Vervangen bewaart
    await wegingKnop(page).click();
    await dialoog(page).getByRole('button', { name: /^Eentje meer/ }).click();
    await dialoog(page).getByRole('button', { name: 'Noteren', exact: true }).click();
    await page.getByRole('button', { name: 'Vervangen', exact: true }).click();
    await expect(page.locator('.strook__tekst')).toHaveText('Genoteerd.');
    await expect.poll(wegingen).not.toEqual(voor);
    await page.locator('.strook__actie', { hasText: 'Ongedaan maken' }).click();
    await expect.poll(wegingen).toEqual(voor);
  });
});

// BESLISSING 494: de knoptekst op de kaarten Streefgewicht en Weegdag is vanaf 390 px de volle tekst en op smallere telefoons "Zetten" of "Aanpassen";
// de schermlezernaam is altijd de volle tekst; op 360 breekt de tekst niet en is de kaart Streefgewicht niet hoger dan haar buren.
for (const breed of [320, 360, 375, 389, 390, 412, 820, 1280]) {
  test.describe(`korte knoptekst op ${breed}`, () => {
    test.use({ viewport: { width: breed, height: 800 }, hasTouch: breed < 800, isMobile: breed < 800 });
    test('volle tekst vanaf 390, korte daaronder; naam altijd vol; geen afbreken', async ({ page }) => {
      for (const streef of [null, 66]) {
        await zaai(page, { streef, thema: 'nacht' });
        const smal = breed < 390;
        const verwacht = [
          { kaart: '.gewichtstreef', vol: streef == null ? 'Streefgewicht zetten' : 'Streefgewicht aanpassen', kort: streef == null ? 'Zetten' : 'Aanpassen' },
          { kaart: '.gewicht__weegdag', vol: 'Weegdag aanpassen', kort: 'Aanpassen' },
        ];
        for (const v of verwacht) {
          const knop = page.locator(`${v.kaart} .knop`);
          await expect(knop, `${v.kaart} ${breed}`).toHaveAccessibleName(v.vol);
          const m = await knop.evaluate((k) => {
            const tekst = k.querySelector('.knop__tekst');
            const zichtbaar = [...tekst.children].filter((s) => getComputedStyle(s).display !== 'none');
            const r = document.createRange();
            r.selectNodeContents(zichtbaar[0]);
            const lijn = parseFloat(getComputedStyle(tekst).lineHeight) || 20;
            return { zichtbaar: zichtbaar.map((s) => s.textContent), regels: Math.round(r.getBoundingClientRect().height / lijn), over: k.scrollWidth > k.clientWidth + 1 };
          });
          expect(m.zichtbaar, `${v.kaart} ${breed} ${streef}`).toEqual([smal ? v.kort : v.vol]);
          expect(m.regels, `${v.kaart} ${breed} ${streef}: een regel`).toBe(1);
          expect(m.over).toBe(false);
        }
        const hoogtes = await page.evaluate(() => ['.gewichthoofd', '.gewicht__weegdag', '.gewichtstreef'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().height * 10) / 10));
        if (breed < 720) expect(Math.max(...hoogtes) - Math.min(...hoogtes), `${breed} ${streef}: ${hoogtes}`).toBeLessThanOrEqual(1);
        const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        expect(scroll[0]).toBeLessThanOrEqual(scroll[1]);
        if (BEELDEN2 && streef != null && breed === 360) {
          await page.setViewportSize({ width: breed, height: 1100 });
          await page.evaluate(() => document.querySelector('.gewichthoofd').scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: `${BEELDEN2}/kaarten-360.png` });
        }
      }
    });
  });
}
