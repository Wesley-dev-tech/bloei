// Datums als kop of label (BESLISSINGEN 459 en 461): overal de vorm van de bestaande labels (.label: Jost 500, 12 px, hoofdletters via css,
// letterafstand 0,12em, de gedempte tekstkleur). De hoofdletters komen uit css: de tekst in de DOM (schermlezer, kopiëren) blijft gewoon geschreven.
// De vijf bladerkoppen (Dagboek dag, week en maand, de kalender op Vandaag, Drinken) zien er hetzelfde uit; de pijltjes verspringen niet en plakken
// nergens tegen tekst. Een tekstlink met een pijl heeft dezelfde ruimte tussen tekst en pijl als "Alle badges bekijken". Alle gegevens zijn verzonnen.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';

// Elf dagen eten en drinken tot en met de vaste datum (12 november 2026), twee wegingen en één supplement.
async function vul(page) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(() => new Promise((klaar, fout) => {
    const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nu = new Date();
    const open = indexedDB.open('bloei-dagboek');
    open.onerror = () => fout(open.error);
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction(['maaltijden', 'dranken', 'wegingen', 'supplementen', 'momentinnames'], 'readwrite');
      for (let i = 0; i < 11; i += 1) {
        const d = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i);
        const datum = sleutel(d);
        tx.objectStore('maaltijden').put({ datum, soort: 'ontbijt', tijd: '08:15', tekst: 'testmaaltijd', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
        tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000 - i, soort: 'water', ml: 1500, voorbeeld: false });
        if (i === 0 || i === 7) {
          const maandag = sleutel(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
          tx.objectStore('wegingen').put({ week: maandag, datum, kg: i === 0 ? 70.9 : 71.3, voorbeeld: false, gewijzigdOp: 1 });
        }
      }
      // een dagelijks supplement (op 10 november afgevinkt: het salie bolletje) en een spuit om de 14 dagen: de legenda van de kalender heeft twee items
      tx.objectStore('supplementen').put({ id: 1, naam: 'Vitamine D', dosis: '1 capsule', hoeveelheid: '1 capsule', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
      tx.objectStore('supplementen').put({ id: 2, naam: 'Testspuit', dosis: '', hoeveelheid: 'een ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-05' }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 1 });
      tx.objectStore('momentinnames').put({ datum: '2026-11-10', supplementId: 1, moment: 'ochtend', tijdstip: 1, voorbeeld: false });
      tx.oncomplete = () => { idb.close(); klaar(); };
      tx.onerror = () => fout(tx.error);
    };
  }));
}

async function zetThema(page, thema) {
  await page.evaluate((t) => new Promise((klaar, fout) => {
    const q = indexedDB.open('bloei-dagboek');
    q.onerror = () => fout(q.error);
    q.onsuccess = () => { const db = q.result; const tx = db.transaction('instellingen', 'readwrite'); tx.objectStore('instellingen').put({ sleutel: 'thema.keuze', waarde: t }); tx.oncomplete = () => { db.close(); klaar(); }; };
  }), thema);
  await page.reload();
}

// De computed stijl die een label bepaalt, plus de DOM-tekst.
const stijlVan = (loc) =>
  loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return { tekst: el.textContent, transform: s.textTransform, familie: s.fontFamily, grootte: s.fontSize, gewicht: s.fontWeight, afstand: s.letterSpacing, kleur: s.color, regel: s.lineHeight };
  });

// De referentie: een nieuw, gewoon .label op dezelfde plaats (zelfde thema en zelfde rem; vanaf een brede viewport groeit de rem).
const labelStijl = (loc) =>
  loc.evaluate((el) => {
    const p = document.createElement('span');
    p.className = 'label';
    p.textContent = 'x';
    el.parentElement.append(p);
    const s = getComputedStyle(p);
    const r = { transform: s.textTransform, familie: s.fontFamily, grootte: s.fontSize, gewicht: s.fontWeight, afstand: s.letterSpacing, kleur: s.color, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    p.remove();
    return r;
  });

// groot: de datum in de bladerkop van het Dagboek (BESLISSING 470): dezelfde labelvorm, maar groter dan het label en in de tekstkleur.
// Een datumkop (.datumkop) is iets krapper gespatieerd: 0,08em.
async function isLabel(loc, { groot = false } = {}) {
  const s = await stijlVan(loc);
  const ref = await labelStijl(loc);
  const datumkop = await loc.evaluate((e) => e.classList.contains('datumkop'));
  expect(ref.transform).toBe('uppercase');
  expect(s.transform, `"${s.tekst}" in hoofdletters via css`).toBe('uppercase');
  expect(s.familie).toMatch(/Jost/);
  expect(s.familie).toBe(ref.familie);
  expect(s.gewicht).toBe('500');
  if (groot) {
    expect(parseFloat(s.grootte), `"${s.tekst}": groter dan het label`).toBeGreaterThan(parseFloat(ref.grootte));
    expect(parseFloat(s.grootte)).toBeGreaterThanOrEqual(13);
  } else {
    expect(s.grootte, `"${s.tekst}": de maat van .label`).toBe(ref.grootte);
    expect(parseFloat(s.grootte)).toBeCloseTo(0.75 * ref.rem, 1); // --fs-label
    expect(s.kleur, `"${s.tekst}": kleur van .label`).toBe(ref.kleur);
  }
  if (datumkop) expect(parseFloat(s.afstand), `"${s.tekst}": letterafstand van een datumkop`).toBeCloseTo(0.08 * parseFloat(s.grootte), 1);
  else expect(s.afstand, `"${s.tekst}": letterafstand van .label`).toBe(ref.afstand);
  // de DOM-tekst is niet omgezet: er staan kleine letters in
  expect(s.tekst, 'de DOM-tekst blijft gewoon geschreven').toMatch(/[a-z]/);
  expect(s.tekst).not.toBe(s.tekst.toUpperCase());
}

test.describe('datums als kop of label (BESLISSING 459)', () => {
  test.beforeEach(async ({ page }) => {
    await vasteKlok(page);
    await vul(page);
  });

  test('elke datum als kop of label staat in labelvorm, de DOM-tekst blijft gewoon geschreven', async ({ page }) => {
    const plaatsen = [
      ['#/vandaag', '.begroeting__datum', /donderdag 12 november 2026/],
      ['#/vandaag', '.kalkaart__maand', /^november 2026$/],
      // BESLISSING 489: de h2 bevat de volle en de korte vorm (één is zichtbaar); de DOM-tekst begint met de volle vorm
      ['#/dagboek/dag/2026-11-12', '.bladerkop__titel', /^donderdag 12 november 2026/, true],
      ['#/dagboek/week/2026-11-09', '.bladerkop__titel', /^9 - 15 november 2026/, true],
      ['#/dagboek/maand/2026-11', '.bladerkop__titel', /^november 2026$/, true],
      ['#/drinken', '.drinken__weekperiode', /^9 - 15 november 2026$/],
      ['#/supplementen', '.weekkaart--supp .kaartkop__eind .label', /^9 - 15 november$/],
      ['#/meer/meldingen', '.meldingen__datum', /^donderdag 12 november$/],
      ['#/delen', '.delen__periodedatum', /^donderdag 12 november 2026$/],
      ['#/delen', '.delen__periodedagen', /^1 dag$/],
    ];
    for (const [pad, sel, tekst, groot = false] of plaatsen) {
      await page.goto('./' + pad);
      const el = page.locator(sel).first();
      await expect(el, `${pad} ${sel}`).toBeVisible();
      await expect(el).toHaveText(tekst);
      await isLabel(el, { groot });
    }
    // Dagboek dag: "Vandaag" en de datum zijn twee labels; de h2 is de datum
    await page.goto('./#/dagboek/dag/2026-11-12');
    await expect(page.locator('.bladerkop__midden > p.label')).toHaveText('Vandaag');
    await expect(page.getByRole('heading', { level: 2, name: 'donderdag 12 november 2026' })).toBeVisible();
    await expect(page.locator('.bladerkop__vorm--kort')).toBeVisible(); // telefoon: de korte vorm (BESLISSING 489)
    await expect(page.locator('.bladerkop__vorm--kort')).toHaveText('do 12 november 2026');
    await expect(page.locator('.bladerkop__vorm--vol')).toBeHidden();
    // Dagboek week: de kop is kort, de schermlezer hoort de volledige vorm met het jaar (BESLISSINGEN 461 en 489)
    await page.goto('./#/dagboek/week/2026-11-09');
    await expect(page.getByRole('heading', { level: 2, name: 'Week van 9 tot 15 november 2026' })).toBeVisible();
    await expect(page.locator('.bladerkop__vorm--kort')).toHaveText('9 - 15 nov 2026');
    // Gewicht: het blad "Weging noteren" (label DATUM en de datum)
    await page.goto('./#/gewicht');
    await page.getByRole('button', { name: 'Weging noteren' }).first().click();
    const blad = page.locator('.bladerkop__titel').last();
    await expect(blad).toBeVisible();
    await isLabel(blad);
  });

  test('Delen: het verslag heeft de titel "Verslag" met de periode als label eronder, de dagkoppen en de korte periode in labelvorm (BESLISSING 461)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/delen');
    await page.locator('.delen__periode').getByText('Twee weken', { exact: false }).first().click();
    const vel = page.locator('.verslagvel');
    await expect(vel.locator('.verslagvel__dag').first()).toBeVisible();
    const titel = vel.locator('h2.verslagvel__titel');
    await expect(titel).toHaveText('Verslag');
    expect(await titel.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Cormorant/);
    const periode = vel.locator('.verslagvel__periode');
    await expect(periode).toHaveText(/^[A-Z][a-z]+ \d+ [a-z]+ 2026 - [a-z]+ \d+ [a-z]+ 2026$/);
    // het vel draagt de Poeder-tokens: de referentie is een .label in het vel zelf
    for (const sel of ['.verslagvel__periode', '.verslagvel__dagtitel']) {
      const el = vel.locator(sel).first();
      await isLabel(el);
      if (sel === '.verslagvel__dagtitel') await expect(el).toHaveText(/^[A-Z][a-z]+ \d+ [a-z]+ 2026$/);
    }
  });

  test('de bladerkoppen: dag, week en maand van het Dagboek gelijk en groter dan "Vandaag" (BESLISSING 470); de kalender en Drinken gelijk in labelmaat', async ({ page }) => {
    const stijl = async (pad, sel) => {
      await page.goto('./' + pad);
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      // gecentreerd; op één regel (Drinken mag op een telefoon na het streepje breken, BESLISSING 476)
      expect(await el.evaluate((e) => getComputedStyle(e).textAlign)).toBe('center');
      if (!sel.includes('drinken')) expect(await el.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('nowrap');
      const { tekst, ...s } = await stijlVan(el);
      return s;
    };
    for (const breedte of [390, 1280]) {
      await page.setViewportSize({ width: breedte, height: 900 });
      const dagboek = [];
      for (const pad of ['#/dagboek/dag/2026-11-12', '#/dagboek/week/2026-11-09', '#/dagboek/maand/2026-11']) dagboek.push(await stijl(pad, '.bladerkop__titel'));
      for (const s of dagboek.slice(1)) expect(s, `Dagboek op ${breedte}`).toEqual(dagboek[0]);
      await page.goto('./#/dagboek/dag/2026-11-12');
      const vandaagLabel = await stijlVan(page.locator('.bladerkop__midden > p.label'));
      expect(parseFloat(dagboek[0].grootte)).toBeGreaterThan(parseFloat(vandaagLabel.grootte));
      const kal = await stijl('#/vandaag', '.kalkaart__maand');
      const drinken = await stijl('#/drinken', '.drinken__weekperiode');
      expect(drinken, `kalender en Drinken op ${breedte}`).toEqual(kal);
    }
  });

  test('de langste datum past op één regel van 320 tot 430 px (ook met de grootste lettergrootte), de pijltjes verspringen niet en raken de datum niet (BESLISSING 489)', async ({ page }) => {
    // groot: de grootste lettergrootte van Chrome ("Zeer groot", een rem van 24 px), via de CSSOM (de CSP laat geen inline stijlblok toe)
    const geval = async (pad, groot) => {
      await page.goto('./' + pad);
      await page.evaluate((g) => (g ? document.documentElement.style.setProperty('font-size', '24px', 'important') : document.documentElement.style.removeProperty('font-size')), groot);
      const el = page.locator('#scherm .bladerkop__titel').first();
      await expect(el).toBeVisible();
      return el.evaluate((e) => {
        const doos = e.closest('.bladerkop');
        const knoppen = [...doos.querySelectorAll(':scope > .icoonknop')];
        const [a, b] = knoppen.map((p) => p.querySelector('svg').getBoundingClientRect());
        // de zichtbare vorm (BESLISSING 489: volle of korte vorm; de maand heeft er maar één)
        const zicht = [...e.querySelectorAll('.bladerkop__vorm')].find((s) => s.getClientRects().length) ?? e;
        const r = document.createRange();
        r.selectNodeContents(zicht);
        const t = r.getBoundingClientRect();
        const s = getComputedStyle(zicht);
        return {
          past: e.scrollWidth <= e.clientWidth + 0.5,
          eenRegel: zicht.getClientRects().length === 1 && t.height < parseFloat(s.fontSize) * 1.6,
          links: a.left, rechts: b.left, l: t.left - a.right, r: b.left - t.right,
          tik: Math.min(...knoppen.map((k) => Math.min(k.getBoundingClientRect().width, k.getBoundingClientRect().height))),
          paginaScroll: document.documentElement.scrollWidth > innerWidth + 0.5,
          tekst: zicht.textContent, naam: e.getAttribute('aria-label'), grootte: parseFloat(s.fontSize), hoog: doos.getBoundingClientRect().height,
        };
      });
    };
    for (const groot of [false, true]) {
      for (const breedte of [320, 360, 390, 430]) {
        await page.setViewportSize({ width: breedte, height: 800 });
        const paren = [
          ['dag', await geval('#/dagboek/dag/2026-09-30', groot), await geval('#/dagboek/dag/2026-11-01', groot)],
          ['dag', await geval('#/dagboek/dag/2026-09-24', groot), await geval('#/dagboek/dag/2026-11-01', groot)],
          ['week', await geval('#/dagboek/week/2026-09-28', groot), await geval('#/dagboek/week/2026-11-09', groot)],
          ['week', await geval('#/dagboek/week/2026-12-28', groot), await geval('#/dagboek/week/2026-11-09', groot)],
          ['maand', await geval('#/dagboek/maand/2026-09', groot), await geval('#/dagboek/maand/2026-05', groot)],
        ];
        // op een telefoon de korte vorm; de schermlezer hoort de volle
        expect(paren[0][1].tekst).toBe('wo 30 september 2026');
        expect(paren[0][1].naam).toBe('woensdag 30 september 2026');
        expect(paren[1][1].tekst).toBe('do 24 september 2026');
        expect(paren[2][1].tekst).toBe('28 sep - 4 okt 2026');
        expect(paren[2][1].naam).toBe('Week van 28 september tot 4 oktober 2026');
        expect(paren[3][1].tekst).toBe('28 dec 2026 - 3 jan 2027');
        expect(paren[3][1].naam).toBe('Week van 28 december 2026 tot 3 januari 2027');
        expect(paren[2][2].tekst).toBe('9 - 15 nov 2026');
        expect(paren[4][1].tekst).toBe('september 2026');
        for (const [soort, lang, kort] of paren) {
          for (const g of [lang, kort]) {
            const wie = `${breedte}${groot ? ' groot' : ''} ${soort} "${g.tekst}" (${g.grootte} px)`;
            expect(g.past, `${wie}: niet afgekapt`).toBe(true);
            expect(g.eenRegel, `${wie}: één regel`).toBe(true);
            expect(g.l, `${wie}: niet tegen de linkerpijl`).toBeGreaterThanOrEqual(4);
            expect(Math.abs(g.l - g.r), `${wie}: gecentreerd`).toBeLessThanOrEqual(1);
            expect(g.tik, `${wie}: tikvlak`).toBeGreaterThanOrEqual(44);
            expect(g.paginaScroll, `${wie}: geen horizontaal scrollen`).toBe(false);
            expect(g.grootte).toBeGreaterThanOrEqual(13);
          }
          expect(lang.links, `${breedte} ${soort}: linkerpijl op zijn plaats`).toBeCloseTo(kort.links, 0);
          expect(lang.rechts, `${breedte} ${soort}: rechterpijl op zijn plaats`).toBeCloseTo(kort.rechts, 0);
          if (!groot) expect(lang.hoog, `${breedte} ${soort}: de bladerkop verspringt niet`).toBeCloseTo(kort.hoog, 0);
        }
      }
    }
    // tablet en desktop: de volle vorm met het jaar, op één regel
    for (const breedte of [820, 1280, 1690]) {
      await page.setViewportSize({ width: breedte, height: 900 });
      for (const [pad, tekst] of [['#/dagboek/dag/2026-09-24', 'donderdag 24 september 2026'], ['#/dagboek/week/2026-09-28', '28 september - 4 oktober 2026'], ['#/dagboek/week/2026-12-28', '28 december 2026 - 3 januari 2027'], ['#/dagboek/week/2026-11-09', '9 - 15 november 2026']]) {
        const g = await geval(pad, false);
        const wie = `${breedte} "${g.tekst}"`;
        expect(g.tekst).toBe(tekst);
        expect(g.past, `${wie}: niet afgekapt`).toBe(true);
        expect(g.eenRegel, `${wie}: één regel`).toBe(true);
        // vanaf 960 px staat de datum 4 px uit het midden tussen de pijl-iconen (ook vóór 489 gemeten: 300,5 en 296,5 op 1280); hier geldt dus 4,5 px
        expect(Math.abs(g.l - g.r), `${wie}: gecentreerd`).toBeLessThanOrEqual(breedte >= 960 ? 4.5 : 1);
      }
    }
    // Drinken (labelmaat): zes weken terug is de week van 28 september - 4 oktober
    for (const breedte of [320, 360, 390, 430, 820, 1280, 1690]) {
      await page.setViewportSize({ width: breedte, height: 800 });
      await page.goto('./#/drinken');
      await page.reload();
      const per = page.locator('.drinken__weekperiode');
      await expect(per).toHaveText('9 - 15 november 2026');
      const meet = () => per.evaluate((e) => {
        const [a, b] = [...e.parentElement.querySelectorAll('.drinken__weekpijl')].map((p) => p.querySelector('svg').getBoundingClientRect());
        const r = document.createRange();
        r.selectNodeContents(e);
        const t = r.getBoundingClientRect();
        return { past: e.scrollWidth <= e.clientWidth + 0.5, links: a.left, rechts: b.left, l: t.left - a.right, r: b.left - t.right };
      });
      const kort = await meet();
      for (const tekst of ['2 - 8 november 2026', '26 oktober - 1 november 2026', '19 - 25 oktober 2026', '12 - 18 oktober 2026', '5 - 11 oktober 2026', '28 september - 4 oktober 2026']) {
        await page.locator('.drinken__weekpijl[data-richting="vorige"]').click();
        await expect(per).toHaveText(tekst);
      }
      const lang = await meet();
      for (const g of [kort, lang]) {
        expect(g.past).toBe(true);
        expect(g.l).toBeGreaterThanOrEqual(4);
        expect(Math.abs(g.l - g.r)).toBeLessThanOrEqual(1);
      }
      expect(lang.links).toBeCloseTo(kort.links, 0);
      expect(lang.rechts).toBeCloseTo(kort.rechts, 0);
    }
  });

  test('de kalender op Vandaag: ruimte tussen label en pijl, de maand gecentreerd, de pijl achter "Naar het Dagboek" zoals bij "Alle badges bekijken"', async ({ page }) => {
    // de referentie: "Alle badges bekijken" op Algemeen
    await page.goto('./#/meer');
    const ref = await page.locator('a.meer__actie').first().evaluate((a) => {
      const r = document.createRange();
      r.selectNodeContents(a.firstChild);
      return a.querySelector('svg').getBoundingClientRect().left - r.getBoundingClientRect().right;
    });
    for (const thema of ['poeder', 'nacht']) {
      await zetThema(page, thema);
      for (const breedte of [360, 390, 820, 1100, 1280, 1440, 1690]) {
        await page.setViewportSize({ width: breedte, height: 900 });
        await page.goto('./#/vandaag');
        await page.reload(); // de gekozen maand van een vorige ronde vergeten
        const kaart = page.locator('.kalkaart');
        await expect(kaart.locator('.kalkaart__maand')).toHaveText('november 2026');
        for (const maand of ['oktober 2026', 'september 2026']) {
          await kaart.locator('.kalkaart__blader .icoonknop').first().click();
          await expect(kaart.locator('.kalkaart__maand')).toHaveText(maand);
        }
        const m = await kaart.evaluate((k) => {
          const doos = (e) => e.getBoundingClientRect();
          const tekstDoos = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect(); };
          const label = tekstDoos(k.querySelector('.kaartkop__label'));
          const [k1, k2] = k.querySelectorAll('.kalkaart__blader .icoonknop');
          const [a, b] = [k1, k2].map((p) => doos(p.querySelector('svg')));
          const maand = tekstDoos(k.querySelector('.kalkaart__maand'));
          const link = k.querySelector('.kalkaart__link');
          return {
            eenRegel: Math.abs(doos(k1).top - doos(k.querySelector('.kaartkop__label')).top) < 24,
            labelTotKnop: doos(k1).left - label.right,
            l: maand.left - a.right,
            r: b.left - maand.right,
            past: k.querySelector('.kalkaart__maand').scrollWidth <= k.querySelector('.kalkaart__maand').clientWidth + 0.5,
            link: doos(link.querySelector('svg')).left - tekstDoos(link.firstChild).right,
          };
        });
        const wie = `${thema} ${breedte}`;
        if (m.eenRegel) expect(m.labelTotKnop, `${wie}: label tot linkerpijl`).toBeGreaterThanOrEqual(12);
        expect(Math.abs(m.l - m.r), `${wie}: maand gecentreerd`).toBeLessThanOrEqual(1);
        expect(m.l, `${wie}: pijl niet tegen de maand`).toBeGreaterThanOrEqual(8);
        expect(m.past, `${wie}: maand past`).toBe(true);
        expect(Math.abs(m.link - ref), `${wie}: pijl achter de link`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('de legenda onder de kalender staat in labelvorm, op Vandaag en in Dagboek maand dezelfde (BESLISSING 464); een item blijft heel', async ({ page }) => {
    const stijlen = {};
    for (const [pad, lijst, item] of [['#/vandaag', '.kalkaart__legenda', '.kalkaart__legendaitem'], ['#/dagboek/maand/2026-11', '.maand__legenda', '.maand__legitem']]) {
      for (const breedte of [360, 390, 1100, 1280]) {
        await page.setViewportSize({ width: breedte, height: 900 });
        await page.goto('./' + pad);
        const el = page.locator(lijst).first();
        await expect(el).toBeVisible();
        await isLabel(el);
        const s = await stijlVan(el);
        const { tekst, regel, ...rest } = s;
        (stijlen[breedte] ??= []).push(rest);
        // elk item op één regel: teken en woord op dezelfde hoogte, verticaal gecentreerd
        const items = await page.locator(item).evaluateAll((lijst) => lijst.map((e) => {
          const r = document.createRange();
          r.selectNode(e.lastChild); // het woord: een tekstknoop (Vandaag) of een span (Dagboek maand)
          const [teken, woord] = [e.firstElementChild.getBoundingClientRect(), r.getBoundingClientRect()];
          return { een: e.getBoundingClientRect().height < 26, midden: Math.abs((teken.top + teken.bottom) / 2 - (woord.top + woord.bottom) / 2) };
        }));
        expect(items.length).toBeGreaterThan(0);
        for (const i of items) {
          expect(i.een, `${pad} ${breedte}: item op één regel`).toBe(true);
          expect(i.midden).toBeLessThanOrEqual(2);
        }
        // de legenda loopt niet uit de kaart
        expect(await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 0.5)).toBe(true);
      }
    }
    // per breedte (de rem groeit op een breed scherm) dezelfde stijl op Vandaag en in Dagboek maand
    for (const [breedte, [a, b]] of Object.entries(stijlen)) expect(b, `legenda op ${breedte}`).toEqual(a);
    // de link eronder staat ook in labelvorm (BESLISSING 466), maar in de linkkleur van de kaart, met een tikvlak van minstens 44 px
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/vandaag');
    const link = page.locator('.kalkaart__link');
    const ls = await link.evaluate((e) => {
      const s = getComputedStyle(e);
      const na = getComputedStyle(e, '::after');
      return { transform: s.textTransform, kleur: s.color, gedempt: getComputedStyle(e.closest('.kalkaart').querySelector('.kaartkop__label')).color, tik: e.getBoundingClientRect().height + parseFloat(na.top) * -1 + parseFloat(na.bottom) * -1, tekst: e.textContent };
    });
    expect(ls.transform).toBe('uppercase');
    expect(ls.tekst).toMatch(/[a-z]/);
    expect(ls.kleur).not.toBe(ls.gedempt);
    expect(ls.tik).toBeGreaterThanOrEqual(44);
    // de legenda-teksten beginnen op dezelfde x (de tekens staan in een vak van gelijke breedte) en de regels plakken niet
    const items = await page.locator('.kalkaart__legendaitem').evaluateAll((lijst) => lijst.map((e) => {
      const r = document.createRange();
      r.selectNode(e.lastChild);
      const t = r.getBoundingClientRect();
      return { x: t.left, top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom };
    }));
    if (items.length === 2 && items[1].top > items[0].bottom - 1) {
      expect(Math.abs(items[0].x - items[1].x)).toBeLessThanOrEqual(1);
      expect(items[1].top - items[0].bottom).toBeGreaterThanOrEqual(7.5);
    }
  });

  test('contrast van de datumkop tegen haar kaart is minstens 4,5:1 in Poeder, Salie en Nacht', async ({ page }) => {
    for (const thema of ['poeder', 'salie', 'nacht']) {
      await zetThema(page, thema);
      for (const [pad, sel] of [['#/dagboek/dag/2026-11-12', '.bladerkop__titel'], ['#/vandaag', '.kalkaart__maand'], ['#/drinken', '.drinken__weekperiode']]) {
        await page.goto('./' + pad);
        const el = page.locator(sel).first();
        await expect(el).toBeVisible();
        const verhouding = await el.evaluate((e) => {
          const kleur = (s) => {
            const g = s.match(/[\d.]+/g).map(Number);
            const srgb = s.startsWith('color(') ? g.slice(0, 3) : g.slice(0, 3).map((x) => x / 255);
            return { rgb: srgb, a: s.startsWith('color(') ? (g[3] ?? 1) : (g[3] ?? 1) };
          };
          const lum = ([r, g, b]) => { const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          let n = e;
          let bg = null;
          while (n && n !== document.documentElement) {
            const k = kleur(getComputedStyle(n).backgroundColor);
            if (k.a > 0.99) { bg = k.rgb; break; }
            n = n.parentElement;
          }
          bg ??= kleur(getComputedStyle(document.body).backgroundColor).rgb;
          const fg = kleur(getComputedStyle(e).color).rgb;
          const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return (l1 + 0.05) / (l2 + 0.05);
        });
        expect(verhouding, `${thema} ${pad} ${sel}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  test('Delen: de gekozen periode staat voluit (BESLISSING 473), gelijk aan de periode in het voorbeeld, en het vak verspringt niet tussen de periodes', async ({ page }) => {
    const KEUZES = ['Gisteren', 'Vandaag', 'Deze week', 'Twee weken', 'Een maand'];
    const DAGNAAM = /^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) \d+ [a-z]+ \d{4}( - (maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag) \d+ [a-z]+ \d{4})?$/;
    const metingen = {};
    for (const breedte of [360, 390, 820, 1280, 1690]) {
      await page.setViewportSize({ width: breedte, height: 900 });
      await page.goto('./#/delen');
      await page.reload();
      const vak = page.locator('.delen__periodewoorden');
      await expect(vak).toBeVisible();
      metingen[breedte] = [];
      for (const keuze of KEUZES) {
        await page.locator('.delen__periode').getByText(keuze, { exact: true }).first().click();
        const datum = page.locator('.delen__periodedatum');
        await expect(datum).toHaveText(DAGNAAM);
        const tekst = (await datum.textContent()).trim();
        // gelijk aan de periode onder de titel van het voorbeeld (die zegt "Week van ..." alleen voor een week met één dag op maandag)
        const periode = page.locator('.verslagvel__periode');
        if (await periode.count()) {
          const vel = (await periode.textContent()).trim();
          if (!/^week van/i.test(vel)) expect(vel.toLowerCase(), `${breedte} ${keuze}`).toBe(tekst.toLowerCase());
        }
        const m = await vak.evaluate((p) => {
          const d = p.querySelector('.delen__periodedatum');
          const delen = [...p.querySelectorAll('.delen__periodedeel')].map((s) => s.getBoundingClientRect());
          return {
            hoog: p.getBoundingClientRect().height,
            past: p.scrollWidth <= p.clientWidth + 0.5 && delen.every((r) => r.right <= p.getBoundingClientRect().right + 0.5),
            heel: delen.every((r) => r.height < 20), // elke helft op één regel
            transform: getComputedStyle(d).textTransform,
            kaart: p.closest('.kaart').getBoundingClientRect().height,
          };
        });
        expect(m.transform).toBe('uppercase');
        expect(m.past, `${breedte} ${keuze}: past in het vak`).toBe(true);
        expect(m.heel, `${breedte} ${keuze}: een datum breekt nooit`).toBe(true);
        metingen[breedte].push({ keuze, tekst, hoog: m.hoog, kaart: m.kaart });
      }
      const hoogtes = metingen[breedte].map((x) => x.hoog);
      expect(Math.max(...hoogtes) - Math.min(...hoogtes), `${breedte}: het vak verspringt niet ${JSON.stringify(hoogtes)}`).toBeLessThanOrEqual(0.5);
    }
    if (process.env.DATUMKOP_METING) console.log('METING ' + JSON.stringify(metingen));
    await test.info().attach('metingen', { body: JSON.stringify(metingen, null, 1), contentType: 'application/json' });
  });

  test('de periode rechts in een kaartkop (Drinken "Je week in cijfers", Supplementen "Deze week") heeft de stijl van de kaarttitel (BESLISSING 475) en botst er niet mee', async ({ page }) => {
    for (const breedte of [360, 390, 1100, 1280]) {
      await page.setViewportSize({ width: breedte, height: 900 });
      for (const [pad, kop, eind, tekst] of [['#/drinken', '.drinken__cijferkaart > .kaartkop', '.kaartkop__eind', /^deze week$/i], ['#/supplementen', '.weekkaart--supp > .kaartkop', '.kaartkop__eind .label', /^9 - 15 november$/]]) {
        await page.goto('./' + pad);
        const k = page.locator(kop).first();
        await expect(k.locator(eind)).toHaveText(tekst);
        const m = await k.evaluate((el, sel) => {
          const pick = (e) => { const s = getComputedStyle(e); return { transform: s.textTransform, familie: s.fontFamily, grootte: s.fontSize, gewicht: s.fontWeight, afstand: s.letterSpacing, kleur: s.color }; };
          const titel = el.querySelector('.kaartkop__label');
          const eindEl = el.querySelector(sel);
          const r = (e) => { const q = document.createRange(); q.selectNodeContents(e); return q.getBoundingClientRect(); };
          const t = r(titel);
          const e = r(eindEl);
          return { titel: pick(titel), eind: pick(eindEl), titelHeel: titel.scrollWidth <= titel.clientWidth + 0.5 && t.height < 20, eindHeel: e.height < 20, botst: e.top < t.bottom - 1 && e.left < t.right + 8 };
        }, eind);
        const wie = `${pad} ${breedte}`;
        expect(m.eind, wie).toEqual(m.titel);
        expect(m.titelHeel, `${wie}: titel heel`).toBe(true);
        expect(m.eindHeel, `${wie}: eind op één regel`).toBe(true);
        expect(m.botst, `${wie}: titel en eind botsen niet`).toBe(false);
      }
    }
  });
});

test.describe('Drinken: de periode met jaartal over een jaargrens (BESLISSING 476)', () => {
  test('"28 december 2026 - 3 januari 2027": twee jaartallen, niets afgekapt, de pijltjes op dezelfde plaats als bij de kortste periode', async ({ page }) => {
    await vasteKlok(page, { datum: '2027-01-06' });
    for (const breedte of [320, 360, 390, 430, 820, 1280, 1690]) {
      await page.setViewportSize({ width: breedte, height: 800 });
      await page.goto('./#/drinken');
      await page.reload();
      const per = page.locator('.drinken__weekperiode');
      await expect(per).toHaveText('4 - 10 januari 2027');
      const meet = () => per.evaluate((e) => {
        const [a, b] = [...e.parentElement.querySelectorAll('.drinken__weekpijl')].map((p) => p.querySelector('svg').getBoundingClientRect());
        const r = document.createRange();
        r.selectNodeContents(e);
        const t = r.getBoundingClientRect();
        const kaart = e.closest('.kaart').getBoundingClientRect();
        return { past: e.scrollWidth <= e.clientWidth + 0.5, links: a.left, rechts: b.left, l: t.left - a.right, r: b.left - t.right, h: e.getBoundingClientRect().height, kaart: kaart.height, scroll: document.documentElement.scrollWidth > innerWidth + 0.5, delenHeel: [...e.querySelectorAll('.drinken__periodedeel')].every((d) => d.getClientRects().length === 1) };
      });
      const kort = await meet();
      await page.locator('.drinken__weekpijl[data-richting="vorige"]').click();
      await expect(per).toHaveText('28 december 2026 - 3 januari 2027');
      const lang = await meet();
      for (const g of [kort, lang]) {
        const wie = breedte + ' px';
        expect(g.past, wie + ': niet afgekapt').toBe(true);
        expect(g.scroll, wie + ': geen horizontale scroll').toBe(false);
        expect(g.delenHeel, wie + ': een datum breekt nooit').toBe(true);
        expect(g.l, wie + ': niet tegen de pijl').toBeGreaterThanOrEqual(4);
      }
      expect(lang.links, breedte + ': linkerpijl').toBeCloseTo(kort.links, 0);
      expect(lang.rechts, breedte + ': rechterpijl').toBeCloseTo(kort.rechts, 0);
      expect(lang.h, breedte + ': de kop verspringt niet').toBeCloseTo(kort.h, 0);
      // de kaart ernaast toont dezelfde periode met jaartal (oudere week: "Je week in cijfers" met rechts de periode)
    }
  });
});

test.describe('Drinken: de kop van "Je week in cijfers" op één regel (BESLISSING 480)', () => {
  for (const [datum, terug, lang] of [['2026-11-12', 2, 'maandgrens'], ['2027-01-13', 2, 'jaargrens']]) {
    test(`icoon, titel en periode op één lijn, ook bij de ${lang}; de volle periode voor een schermlezer`, async ({ page }) => {
      await vasteKlok(page, { datum });
      for (const breedte of [360, 390, 430, 820, 1280, 1690]) {
        await page.setViewportSize({ width: breedte, height: 800 });
        await page.goto('./#/drinken');
        await page.reload();
        const hoogtes = [];
        for (let stap = 0; stap <= terug; stap += 1) {
          if (stap) {
            const voor = await page.locator('.drinken__weekperiode').textContent();
            await page.locator('.drinken__weekpijl[data-richting="vorige"]').click();
            await expect(page.locator('.drinken__weekperiode')).not.toHaveText(voor);
          }
          const m = await page.locator('.drinken__cijferkaart > .kaartkop').evaluate((kop) => {
            const midden = (r) => (r.top + r.bottom) / 2;
            const rg = (e) => { const q = document.createRange(); q.selectNodeContents(e); return q.getBoundingClientRect(); };
            const titel = kop.querySelector('.kaartkop__label');
            const eind = kop.querySelector('.kaartkop__eind');
            const zichtbaar = [...eind.querySelectorAll('[aria-hidden]')].find((s) => s.getClientRects().length) ?? eind;
            const t = rg(titel);
            const e = rg(zichtbaar);
            const tegel = kop.querySelector('.tegel').getBoundingClientRect();
            const k = kop.getBoundingClientRect();
            return {
              tekst: zichtbaar.textContent, vol: eind.querySelector('.alleen-lezer')?.textContent ?? eind.textContent,
              midden: [midden(tegel), midden(t), midden(e)], eenRegel: e.height < 20 && t.height < 20 && e.left > t.right,
              binnen: e.right <= k.right + 0.5, titelHeel: titel.scrollWidth <= titel.clientWidth + 0.5, kop: k.height, grootte: parseFloat(getComputedStyle(zichtbaar).fontSize),
              kaart: kop.closest('.kaart').getBoundingClientRect().height,
            };
          });
          const wie = `${breedte} stap ${stap} "${m.tekst}"`;
          expect(m.eenRegel, wie + ': één regel').toBe(true);
          expect(m.binnen, wie + ': binnen de kaart').toBe(true);
          expect(m.titelHeel, wie + ': titel niet afgekapt').toBe(true);
          expect(Math.max(...m.midden) - Math.min(...m.midden), wie + ': zelfde middenlijn').toBeLessThanOrEqual(2);
          expect(m.grootte).toBeGreaterThanOrEqual(12);
          if (stap === terug) expect(m.vol, wie + ': volle periode voor een schermlezer').toMatch(/\d{4}$/);
          hoogtes.push(m.kop);
        }
        expect(Math.max(...hoogtes) - Math.min(...hoogtes), breedte + ': de kop verspringt niet').toBeLessThanOrEqual(0.5);
      }
    });
  }
});

test.describe('Drinken: op de smalste telefoons valt het icoon in de kop van "Je week in cijfers" weg (BESLISSING 488)', () => {
  test('320 en 340 px: geen icoon, titel en periode op één regel; vanaf 360 px staat het icoon er; de kop verspringt niet', async ({ page }) => {
    await vasteKlok(page);
    for (const breedte of [320, 340, 360, 390]) {
      await page.setViewportSize({ width: breedte, height: 800 });
      await page.goto('./#/drinken');
      await page.reload();
      const hoogtes = [];
      const teksten = [];
      for (let stap = 0; stap <= 2; stap += 1) {
        if (stap) {
          const voor = await page.locator('.drinken__weekperiode').textContent();
          await page.locator('.drinken__weekpijl[data-richting="vorige"]').click();
          await expect(page.locator('.drinken__weekperiode')).not.toHaveText(voor);
        }
        const m = await page.locator('.drinken__cijferkaart > .kaartkop').evaluate((kop) => {
          const rg = (e) => { const q = document.createRange(); q.selectNodeContents(e); return q.getBoundingClientRect(); };
          const titel = kop.querySelector('.kaartkop__label');
          const eind = kop.querySelector('.kaartkop__eind');
          const zicht = [...eind.querySelectorAll('[aria-hidden]')].find((s) => s.getClientRects().length) ?? eind;
          const t = rg(titel);
          const e = rg(zicht);
          const k = kop.getBoundingClientRect();
          return { tekst: zicht.textContent, tegel: kop.querySelector('.tegel').getClientRects().length > 0, eenRegel: e.height < 20 && t.height < 20 && e.left > t.right + 4, binnen: e.right <= k.right + 0.5 && t.left >= k.left - 0.5, kop: k.height, scroll: document.documentElement.scrollWidth > innerWidth + 0.5 };
        });
        const wie = `${breedte} stap ${stap} "${m.tekst}"`;
        expect(m.tegel, wie + ': icoon').toBe(breedte >= 360);
        expect(m.eenRegel, wie + ': één regel').toBe(true);
        expect(m.binnen, wie + ': binnen de kop').toBe(true);
        expect(m.scroll, wie + ': geen horizontale scroll').toBe(false);
        hoogtes.push(m.kop);
        teksten.push(m.tekst.toLowerCase());
      }
      expect(teksten).toEqual(['deze week', 'vorige week', '26 okt - 1 nov']);
      expect(Math.max(...hoogtes) - Math.min(...hoogtes), breedte + ': de kop verspringt niet').toBeLessThanOrEqual(0.5);
    }
  });
});

test.describe('Instellingen Drinken: in het voorbeeld van de drinkweek staat rechts alleen de periode, in labelvorm (BESLISSING 495)', () => {
  for (const [datum, vol, kort, kortst] of [['2026-11-12', '9 - 15 november 2026', '9 - 15 nov 2026', '9 - 15 nov'], ['2027-01-01', '28 december 2026 - 3 januari 2027', '28 dec 2026 - 3 jan 2027', '28 dec - 3 jan']]) {
    test(`week van ${vol}: geen doel meer, één regel, kop en kaart even hoog als voorheen`, async ({ page }) => {
      await vasteKlok(page, { datum });
      // de hoogtes van kop en kaart van voor de wijziging (gemeten op 17 november); het voorbeeld zelf is ongewijzigd
      const VOORHEEN = { 390: [49, 211], 820: [49, 211], 1280: [49, 210.88], 1690: [49, 210.88] };
      const VORM = { 360: kortst, 390: kortst, 430: kort, 820: vol, 1280: kortst, 1690: vol };
      for (const breedte of [360, 390, 430, 820, 1280, 1690]) {
        await page.setViewportSize({ width: breedte, height: 844 });
        await page.goto('./#/meer/instellingen');
        await page.reload();
        const kaart = page.locator('.drinkvoorbeeld__week .weekkaart').first();
        await expect(kaart).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const m = await kaart.evaluate((k) => {
          const kop = k.querySelector('.kaartkop');
          const eind = kop.querySelector('.kaartkop__eind');
          const zicht = [...eind.querySelectorAll('[aria-hidden]')].find((s) => s.getClientRects().length);
          const z = zicht.getBoundingClientRect();
          const s = getComputedStyle(zicht);
          const titel = kop.querySelector('.kaartkop__label');
          const ts = getComputedStyle(titel);
          return { tekst: zicht.textContent, eind: eind.textContent, vol: eind.querySelector('.alleen-lezer')?.textContent, transform: s.textTransform, grootte: s.fontSize, afstand: s.letterSpacing, gewicht: s.fontWeight, titel: [ts.fontSize, ts.letterSpacing, ts.fontWeight],
            eenRegel: z.height < parseFloat(s.fontSize) * 1.6 && z.left > titel.getBoundingClientRect().right, binnen: z.right <= kop.getBoundingClientRect().right + 0.5, kop: kop.getBoundingClientRect().height, kaart: k.getBoundingClientRect().height };
        });
        const wie = `${datum} ${breedte} "${m.tekst}"`;
        expect(m.tekst, wie).toBe(VORM[breedte]);
        expect(m.vol, wie + ': volle vorm voor een schermlezer').toBe(vol);
        expect(m.eind, wie + ': geen doel meer').not.toMatch(/doel|\d,\d\s?l/);
        expect(m.transform, wie).toBe('uppercase');
        expect([m.grootte, m.afstand, m.gewicht], wie + ': labelvorm, zoals de titel').toEqual(m.titel);
        expect(m.eenRegel, wie + ': één regel').toBe(true);
        expect(m.binnen, wie + ': binnen de kop').toBe(true);
        if (VOORHEEN[breedte]) {
          expect(m.kop, wie + ': kop even hoog').toBeCloseTo(VOORHEEN[breedte][0], 0);
          expect(m.kaart, wie + ': kaart even hoog').toBeCloseTo(VOORHEEN[breedte][1], 0);
        }
      }
    });
  }
});
