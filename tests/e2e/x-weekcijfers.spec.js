// BESLISSINGEN 448 en 449: weekcijfers tellen overal "van 7 dagen" (de volle week van maandag tot zondag), ook in de week van het Dagboek en in
// het verslag van "Deze week" in Delen; het gemiddelde per dag rekent over alle dagen die voorbij zijn (een lege dag telt als 0).
// Vaste klok: maandag 16, woensdag 18 en zondag 22 november 2026, en de eerdere week van 9 tot 15 november. Verzonnen gegevens; dagdoel 2,5 l.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar, animatiesKlaar, domRustig } from './wacht.js';

// Week van 16 november: ma 2 maaltijden en 2,6 l, di niets, wo 1 maaltijd en 1 l, do 4 l (toekomst op woensdag), zo 1 maaltijd en 2,5 l.
// Vorige week: ma 9 een maaltijd en 2,6 l, di 10 1 l, zo 15 2,6 l. Eén supplement (Testmix, elke dag 's ochtends), afgevinkt op 16 en 9 november.
// supp: { vanaf, tot } begrenst de dagen waarop het supplement gepland is (standaard elke dag).
async function zaai(page, supp = {}) {
  await page.evaluate(
    (grens) =>
      new Promise((klaar, mislukt) => {
        const v = indexedDB.open('bloei-dagboek');
        v.onerror = () => mislukt(v.error);
        v.onsuccess = () => {
          const db = v.result;
          const winkels = ['dagen', 'maaltijden', 'dranken', 'momentinnames', 'supplementen', 'wegingen', 'instellingen'];
          const tx = db.transaction(winkels, 'readwrite');
          for (const w of winkels.slice(0, 6)) tx.objectStore(w).clear();
          tx.objectStore('instellingen').put({ sleutel: 'drinken.dagdoelMl', waarde: 2500 });
          tx.objectStore('instellingen').put({ sleutel: 'drinken.dagdoelOmgezet', waarde: true });
          tx.objectStore('supplementen').put({ id: 1, naam: 'Testmix', dosis: '', hoeveelheid: '1', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1, ...grens });
          const maaltijd = (datum, soort) => tx.objectStore('maaltijden').put({ datum, soort, tijd: '12:00', tekst: 'testmaaltijd', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
          maaltijd('2026-11-16', 'ontbijt');
          maaltijd('2026-11-16', 'middagmaal');
          maaltijd('2026-11-18', 'ontbijt');
          maaltijd('2026-11-22', 'avondmaal');
          maaltijd('2026-11-09', 'ontbijt');
          let n = 0;
          for (const [datum, ml] of [['2026-11-16', 2600], ['2026-11-18', 1000], ['2026-11-19', 4000], ['2026-11-22', 2500], ['2026-11-09', 2600], ['2026-11-10', 1000], ['2026-11-15', 2600]]) {
            tx.objectStore('dranken').add({ datum, tijdstip: Date.parse(datum + 'T09:00:00') + n++, soort: 'water', ml, voorbeeld: false });
          }
          for (const datum of ['2026-11-16', '2026-11-09']) tx.objectStore('momentinnames').put({ datum, supplementId: 1, moment: 'ochtend', tijdstip: Date.parse(datum + 'T08:00:00'), voorbeeld: false });
          tx.oncomplete = () => { db.close(); klaar(); };
          tx.onerror = () => mislukt(tx.error);
        };
      }),
    supp,
  );
}

async function opDag(page, datum, supp) {
  await vasteKlok(page, { datum });
  await page.goto('./#/dagboek');
  await schermKlaar(page, '#/dagboek');
  await zaai(page, supp);
}

// De vijf kaartjes bovenaan de week: per kaartje [getal, eenheid, onderregel]
async function weekKaartjes(page, maandag) {
  await page.goto(`./#/dagboek/week/${maandag}`);
  await schermKlaar(page, `#/dagboek/week/${maandag}`);
  await expect(page.locator('.wk__skaart')).toHaveCount(5);
  return page.locator('.wk__skaart').evaluateAll((kaartjes) =>
    kaartjes.slice(0, 3).map((k) => [k.querySelector('.wk__sgetal')?.textContent.trim(), k.querySelector('.wk__seenheid')?.textContent.trim() ?? '', k.querySelector('.wk__sub')?.textContent.trim()]),
  );
}

// [Eten, Drinken, Supplementen]: wat er vóór BESLISSING 448 stond, staat in de commentaarregel
const WEEK = {
  '2026-11-16': [['2', 'van 42', 'maaltijden ingevuld'], ['2,6', 'liter', 'dagdoel gehaald op 1 van 7 dagen'], ['1', 'van 7 dagen', 'alles afgevinkt']], // was: van 6, op 1 van 1 dagen, van 1 dagen
  '2026-11-18': [['3', 'van 42', 'maaltijden ingevuld'], ['3,6', 'liter', 'dagdoel gehaald op 1 van 7 dagen'], ['1', 'van 7 dagen', 'alles afgevinkt']], // was: van 18, op 1 van 3 dagen, van 3 dagen
  '2026-11-22': [['4', 'van 42', 'maaltijden ingevuld'], ['10,1', 'liter', 'dagdoel gehaald op 3 van 7 dagen'], ['1', 'van 7 dagen', 'alles afgevinkt']], // ongewijzigd (alle 7 dagen voorbij)
};

test.describe('De week van het Dagboek: "van 7 dagen" (BESLISSING 448)', () => {
  for (const [datum, verwacht] of Object.entries(WEEK)) {
    test(`lopende week op ${datum}`, async ({ page }) => {
      await opDag(page, datum);
      expect(await weekKaartjes(page, '2026-11-16')).toEqual(verwacht);
      const tekst = await page.locator('.wk__samenvatting').innerText();
      expect(tekst).not.toMatch(/van 1 dagen|NaN|undefined/);
    });
  }

  test('een eerdere week (9 - 15 november, bekeken op woensdag): alle 7 dagen zijn voorbij, de cijfers blijven zoals ze waren', async ({ page }) => {
    await opDag(page, '2026-11-18');
    expect(await weekKaartjes(page, '2026-11-09')).toEqual([['1', 'van 42', 'maaltijden ingevuld'], ['6,2', 'liter', 'dagdoel gehaald op 2 van 7 dagen'], ['1', 'van 7 dagen', 'alles afgevinkt']]);
  });

  test('een supplement dat maar op sommige dagen gepland is, telt alleen die dagen (een dag één keer); één dag is enkelvoud', async ({ page }) => {
    await opDag(page, '2026-11-18', { tot: '2026-11-18' }); // maandag tot woensdag
    expect((await weekKaartjes(page, '2026-11-16'))[2]).toEqual(['1', 'van 3 dagen', 'alles afgevinkt']);
    await zaai(page, { vanaf: '2026-11-16', tot: '2026-11-16' }); // alleen maandag
    await page.reload();
    expect((await weekKaartjes(page, '2026-11-16'))[2]).toEqual(['1', 'van 1 dag', 'alles afgevinkt']);
    // pas vanaf vrijdag gepland, maar maandag wel afgevinkt: het schema van de dag (rooster) toont maandag ook, dus maandag en vrijdag tot zondag
    await zaai(page, { vanaf: '2026-11-20' });
    await page.reload();
    expect((await weekKaartjes(page, '2026-11-16'))[2]).toEqual(['1', 'van 4 dagen', 'alles afgevinkt']);
  });

  test('na herladen blijven de weekcijfers staan', async ({ page }) => {
    await opDag(page, '2026-11-18');
    const voor = await weekKaartjes(page, '2026-11-16');
    await page.reload();
    await schermKlaar(page, '#/dagboek/week/2026-11-16');
    expect(await weekKaartjes(page, '2026-11-16')).toEqual(voor);
  });
});

// Het verslag in Delen: het voorbeeld op het scherm (de pdf komt uit hetzelfde model, zie tests/logica/weekcijfers.test.js)
async function verslag(page, keuze) {
  await page.goto('./#/delen');
  await schermKlaar(page, '#/delen');
  await page.getByRole('button', { name: keuze, exact: true }).click();
  return leesVel(page, keuze);
}
async function leesVel(page, keuze) {
  await expect(page.getByRole('button', { name: keuze, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await domRustig(page);
  await animatiesKlaar(page);
  const vel = page.locator('.verslagvel');
  const cijfers = await vel.locator('.verslagvel__cijfer').evaluateAll((els) =>
    els.map((e) => [e.querySelector('.verslagvel__cijferlabel').textContent.trim(), e.querySelector('.verslagvel__cijfergetal').textContent.trim(), e.querySelector('.verslagvel__cijferonder').textContent.replace(/\s+/g, ' ').trim()]),
  );
  const dagen = await vel.locator('.verslagvel__dagen > *').count();
  // de periode onder de titel (BESLISSING 461: als label, hoofdletters via css; de tekst zelf blijft gewoon geschreven)
  const titel = ((await vel.locator('.verslagvel__periode').textContent()) ?? '').trim();
  return { cijfers, dagen, titel, tekst: (await vel.innerText()).replace(/\s+/g, ' ') };
}

test.describe('Het verslag van "Deze week" in Delen (BESLISSINGEN 448 en 449)', () => {
  test('woensdag: de dagen lopen tot vandaag (3), de noemer is 7; gemiddeld over de 3 verstreken dagen', async ({ page }) => {
    await opDag(page, '2026-11-18');
    const v = await verslag(page, 'Deze week');
    expect(v.dagen).toBe(3);
    expect(v.cijfers).toEqual([
      ['Dagen ingevuld', '2', 'van 7 dagen'], // was: van 3 dagen
      ['Maaltijden', '3', 'genoteerd'],
      ['Gedronken', '1,2', 'gemiddeld per dag'], // (2600 + 0 + 1000) / 3; was 1,8 (alleen de 2 dagen met drank)
      ['Dagdoel gehaald', '1', 'van 7 dagen'], // was: van 3 dagen
    ]);
    expect(v.tekst).not.toMatch(/19 november|donderdag/i); // geen toekomstige dag in het verslag
  });

  test('zondag: de volle week, van 7 dagen; gemiddeld over 7', async ({ page }) => {
    await opDag(page, '2026-11-22');
    const v = await verslag(page, 'Deze week');
    expect(v.dagen).toBe(7);
    expect(v.cijfers).toEqual([
      ['Dagen ingevuld', '4', 'van 7 dagen'],
      ['Maaltijden', '4', 'genoteerd'],
      ['Gedronken', '1,44', 'gemiddeld per dag'], // 10 100 / 7; was 2,53 (10 100 / 4 dagen met drank)
      ['Dagdoel gehaald', '3', 'van 7 dagen'],
    ]);
  });

  // BESLISSING 474: de vorige week (9 - 15 november): ma een maaltijd en 2,6 l, di 1 l, zo 2,6 l; gemiddeld 6,2 l / 7
  const VORIGE_WEEK = [
    ['Dagen ingevuld', '3', 'van 7 dagen'],
    ['Maaltijden', '1', 'genoteerd'],
    ['Gedronken', '0,89', 'gemiddeld per dag'],
    ['Dagdoel gehaald', '2', 'van 7 dagen'],
  ];
  // BESLISSING 457: op maandag is "Deze week" een weekverslag met één getoonde dag (was: een dagverslag zonder "van N dagen")
  const MAANDAG_WEEK = [
    ['Dagen ingevuld', '1', 'van 7 dagen'],
    ['Maaltijden', '2', 'genoteerd'],
    ['Gedronken', '2,6', 'gemiddeld per dag'],
    ['Dagdoel gehaald', '1', 'van 7 dagen'],
  ];
  test('maandag: "Deze week" is een weekverslag met één dag: van 7 dagen, titel "Week van ..."', async ({ page }) => {
    await opDag(page, '2026-11-16');
    const v = await verslag(page, 'Deze week');
    expect(v.dagen).toBe(1);
    expect(v.cijfers).toEqual(MAANDAG_WEEK);
    expect(v.titel).toBe('Week van maandag 16 november 2026');
  });

  // BESLISSING 487: het blokje onder de periodeknoppen zegt op maandag bij "Deze week" dezelfde tekst als de periode in het voorbeeld; het blokje verspringt niet
  test('maandag: het blokje onder de periodeknoppen toont "Week van maandag ..." gelijk aan het voorbeeld, met 1 dag, en verspringt niet tussen de periodeknoppen', async ({ page }) => {
    await opDag(page, '2026-11-16');
    const KEUZES = ['Gisteren', 'Vandaag', 'Deze week', 'Vorige week', 'Twee weken', 'Een maand'];
    const metingen = {};
    for (const breedte of [360, 390, 820, 1280, 1690]) {
      await page.setViewportSize({ width: breedte, height: 900 });
      await page.goto('./#/delen');
      await schermKlaar(page, '#/delen');
      const vak = page.locator('.delen__periodewoorden');
      const hoogtes = [];
      for (const keuze of KEUZES) {
        await page.getByRole('button', { name: keuze, exact: true }).click();
        await leesVel(page, keuze);
        const tekst = ((await page.locator('.delen__periodedatum').textContent()) ?? '').trim();
        if (keuze === 'Deze week') {
          expect(tekst).toBe('Week van maandag 16 november 2026');
          expect(tekst).toBe(((await page.locator('.verslagvel__periode').textContent()) ?? '').trim()); // zelfde tekst als het voorbeeld
          await expect(page.locator('.delen__periodedagen')).toHaveText(/^1 dag$/);
          expect(await page.locator('.delen__periodedatum').evaluate((e) => getComputedStyle(e).textTransform)).toBe('uppercase');
        } else {
          expect(tekst).not.toMatch(/^week van/i);
        }
        const r = await vak.boundingBox();
        hoogtes.push(r.height);
        expect(await vak.evaluate((p) => p.scrollWidth <= p.clientWidth + 0.5), `${breedte} ${keuze}: past in het vak`).toBe(true);
      }
      metingen[breedte] = hoogtes;
      expect(Math.max(...hoogtes) - Math.min(...hoogtes), `${breedte}: het blokje verspringt niet ${JSON.stringify(hoogtes)}`).toBeLessThanOrEqual(0.5);
    }
    if (process.env.DATUMKOP_METING) console.log('METING487 ' + JSON.stringify(metingen));
  });

  test('maandag: "Vandaag" blijft een gewoon dagverslag', async ({ page }) => {
    await opDag(page, '2026-11-16');
    const v = await verslag(page, 'Vandaag');
    expect(v.tekst).not.toMatch(/van \d+ dagen/);
    expect(v.cijfers.map((c) => c[0])).toEqual(['Maaltijden', 'Gedronken', 'Dagdoel']);
    expect(v.titel).toBe('Maandag 16 november 2026');
  });

  test('maandag: de knop Delen in de lopende week van het Dagboek opent "Deze week" met dezelfde noemer 7', async ({ page }) => {
    await opDag(page, '2026-11-16');
    await page.goto('./#/dagboek/week/2026-11-16');
    await schermKlaar(page, '#/dagboek/week/2026-11-16');
    await page.getByRole('button', { name: 'Deze week delen' }).click();
    await schermKlaar(page, '#/delen');
    const v = await leesVel(page, 'Deze week');
    expect(v.cijfers).toEqual(MAANDAG_WEEK);
  });

  // BESLISSING 474: uit de vorige week van het Dagboek staat "Vorige week" aan; een nog eerdere week blijft "Aangepast"
  test('de vorige week vanuit het Dagboek: "Vorige week", 7 volle dagen, van 7 dagen', async ({ page }) => {
    await opDag(page, '2026-11-18');
    await page.goto('./#/dagboek/week/2026-11-09');
    await schermKlaar(page, '#/dagboek/week/2026-11-09');
    await page.getByRole('button', { name: 'Deze week delen' }).click();
    await schermKlaar(page, '#/delen');
    const v = await leesVel(page, 'Vorige week');
    expect(v.dagen).toBe(7);
    expect(v.cijfers).toEqual(VORIGE_WEEK);
  });

  test('een nog eerdere week vanuit het Dagboek blijft "Aangepast", van 7 dagen', async ({ page }) => {
    await opDag(page, '2026-11-18');
    await page.goto('./#/dagboek/week/2026-11-02');
    await schermKlaar(page, '#/dagboek/week/2026-11-02');
    await page.getByRole('button', { name: 'Deze week delen' }).click();
    await schermKlaar(page, '#/delen');
    await expect(page.getByRole('button', { name: 'Aangepast', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Vorige week', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('de knop "Vorige week" op maandag: 9 tot en met 15 november, een weekverslag met van 7 dagen', async ({ page }) => {
    await opDag(page, '2026-11-16');
    const v = await verslag(page, 'Vorige week');
    expect(v.dagen).toBe(7);
    expect(v.cijfers).toEqual(VORIGE_WEEK);
    expect(v.titel.toLowerCase()).toContain('9 november 2026');
    expect(v.titel.toLowerCase()).toContain('15 november 2026');
  });

  test('"Aangepast" met toevallig dezelfde datums als deze week houdt zijn eigen noemer', async ({ page }) => {
    await opDag(page, '2026-11-18');
    await page.goto('./#/delen');
    await schermKlaar(page, '#/delen');
    await page.getByRole('button', { name: 'Aangepast', exact: true }).click();
    await page.locator('.delen__eigen input[type="date"]').first().fill('2026-11-16');
    await page.locator('.delen__eigen input[type="date"]').nth(1).fill('2026-11-18');
    await expect(page.locator('.verslagvel__cijfer').first()).toContainText('van 3 dagen');
    const v = await leesVel(page, 'Aangepast');
    expect(v.dagen).toBe(3);
    expect(v.cijfers[0]).toEqual(['Dagen ingevuld', '2', 'van 3 dagen']);
  });

  test('andere periodes houden hun eigen noemer: Twee weken van 14 dagen, Een maand van 30 dagen', async ({ page }) => {
    await opDag(page, '2026-11-18');
    const twee = await verslag(page, 'Twee weken');
    expect(twee.cijfers[0]).toEqual(['Dagen ingevuld', '5', 'van 14 dagen']);
    expect(twee.cijfers[2]).toEqual(['Gedronken', '0,7', 'gemiddeld per dag']); // 9 800 / 14 (5 - 18 november; de 4 l van donderdag 19 is toekomst); was 1,96 (9 800 / 5)
    const maand = await verslag(page, 'Een maand');
    expect(maand.cijfers[0]).toEqual(['Dagen ingevuld', '5', 'van 30 dagen']);
  });
});

// BESLISSING 456: de maand van het Dagboek rekent "gem. ... per dag" met de regel van 449: de dagen die voorbij zijn, een lege dag telt als 0
async function maandSub(page) {
  await page.goto('./#/dagboek/maand/2026-11');
  await schermKlaar(page, '#/dagboek/maand/2026-11');
  const kc = page.locator('.maand__kc').filter({ has: page.locator('.maand__kclabel', { hasText: /^gedronken$/i }) });
  return (await kc.locator('.maand__kcsub').innerText()).replace(/\s+/g, ' ').trim();
}

test.describe('De maand van het Dagboek: gemiddeld per dag (BESLISSING 456)', () => {
  test('lopende maand op woensdag 18 november: 9,8 l over 18 dagen; de toekomst telt niet mee', async ({ page }) => {
    await opDag(page, '2026-11-18');
    expect(await maandSub(page)).toBe('gem. 0,54 l per dag'); // 9 800 / 18; was 2,33 l (16 300 / 7 dagen met drank, ook de toekomst)
  });

  test('een eerdere maand (november, bekeken op 5 december): alle 30 dagen', async ({ page }) => {
    await opDag(page, '2026-12-05');
    await page.evaluate(
      () =>
        new Promise((klaar) => {
          const v = indexedDB.open('bloei-dagboek');
          v.onsuccess = () => {
            const tx = v.result.transaction('dranken', 'readwrite');
            tx.objectStore('dranken').add({ datum: '2026-11-30', tijdstip: 99, soort: 'water', ml: 5000, voorbeeld: false });
            tx.oncomplete = () => { v.result.close(); klaar(); };
          };
        }),
    );
    expect(await maandSub(page)).toBe('gem. 0,71 l per dag'); // 21 300 / 30; was 2,66 l (21 300 / 8 dagen met drank)
  });
});

// BESLISSING 474: zeven periodeknoppen in een raster van drie; "Aangepast" alleen op de laatste rij, over de volle breedte; geen wees, geen gat
for (const [breed, hoog] of [[360, 780], [390, 844], [1280, 800]]) {
  test(`Periodeknoppen ${breed}x${hoog}: zeven keuzes, "Aangepast" over de volle breedte, "Vorige week" op één regel`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: hoog });
    await opDag(page, '2026-11-16');
    await page.goto('./#/delen');
    await schermKlaar(page, '#/delen');
    const chips = page.locator('.delen__periode .chips .chip');
    await expect(chips).toHaveText(['Vorige week', 'Gisteren', 'Vandaag', 'Deze week', 'Twee weken', 'Een maand', 'Aangepast']);
    const raster = await page.locator('.delen__periode .chips').boundingBox();
    const dozen = await chips.evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, b: b.width, h: b.height, rol: e.getAttribute('role'), pressed: e.getAttribute('aria-pressed'), tag: e.tagName, eenRegel: e.scrollWidth <= e.clientWidth + 1 }; }));
    // drie rijen van drie, drie, één
    const rijen = [...new Set(dozen.map((d) => Math.round(d.y)))];
    expect(rijen).toHaveLength(3);
    expect(dozen.filter((d) => Math.round(d.y) === rijen[0])).toHaveLength(3);
    expect(dozen.filter((d) => Math.round(d.y) === rijen[1])).toHaveLength(3);
    const breedKnop = dozen[6];
    expect(Math.round(breedKnop.y)).toBe(rijen[2]);
    expect(Math.abs(breedKnop.x - raster.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(breedKnop.b - raster.width)).toBeLessThanOrEqual(1);
    for (const d of dozen) {
      expect(d.h).toBeGreaterThanOrEqual(44);
      expect(d.tag).toBe('BUTTON');
      expect(['true', 'false']).toContain(d.pressed); // dezelfde keuzegroep: aria-pressed zoals de andere zes
    }
    expect(dozen[0].eenRegel).toBe(true);
    expect(dozen[0].h).toBe(dozen[3].h); // "Vorige week" niet hoger dan "Deze week" (geen tweede regel)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
