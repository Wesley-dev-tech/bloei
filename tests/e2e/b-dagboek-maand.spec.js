// Dagboek · Maand (BESLISSING 255, herzien): rustige kalender, het overzicht van de volle maand, het paneel van de gekozen dag en een compact blok
// "Gepland deze maand". Alle gegevens zijn verzonnen. De maand van de cijfers is een vaste maand (november 2026: 30 dagen, 6 weken), zodat de
// noemers niet van de dag van uitvoering afhangen (november 2026 voor de lege stand en de weken).
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { meetKaarten } from './leeg-vlak.js';
import { wachtOpRust, wachtTotStil } from './r-wacht.js';

// Vaste klok voor het hele bestand: donderdag 12 november 2026, 12:00 ("vandaag", "deze maand" en de geplande beurt van vandaag).
//
test.beforeEach(async ({ page }) => {
  await vasteKlok(page, { stil: true });
});

const MAAND = '2026-09'; // september 2026: 30 dagen, helemaal voorbij
const DAGEN = 30;

// Vult de opslag met een volle maand: dagen 1 tot en met 28 (elke negende dag leeg), een dagelijks supplement met drie momenten, een periodiek
// supplement ("Testkuur", elke 7 dagen vanaf de 3e, de beurt van de 10e is afgevinkt) en twee wegingen.
async function vulMaand(page, maand, aantalDagen = 28) {
  await page.evaluate(
    ([m, aantal]) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const winkels = ['dagen', 'maaltijden', 'dranken', 'momentinnames', 'supplementen', 'wegingen'];
          const tx = idb.transaction(winkels, 'readwrite');
          for (const w of winkels) tx.objectStore(w).clear();
          const d = (n) => `${m}-${String(n).padStart(2, '0')}`;
          const soorten = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
          tx.objectStore('supplementen').add({ id: 1, naam: 'Testdruppels', dosis: '', hoeveelheid: '1 pipetje', aanwijzing: '', momenten: ['ochtend', 'middag', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.objectStore('supplementen').add({ id: 2, naam: 'Testspuit', dosis: '', hoeveelheid: 'een ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 7, start: d(3) }, volgorde: 2, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.objectStore('momentinnames').put({ datum: d(10), supplementId: 2, moment: 'dag', tijdstip: 1, voorbeeld: false });
          for (let n = 1; n <= aantal; n++) {
            if (n % 9 === 0) continue; // lege dagen
            tx.objectStore('dagen').put({ datum: d(n), notitie: n === 4 ? 'Een rustige dag.' : '', stemming: (n % 5) + 1, energie: ((n + 1) % 5) + 1, doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
            for (let i = 0; i < n % 7; i++) tx.objectStore('maaltijden').put({ datum: d(n), soort: soorten[i], tijd: '12:00', tekst: 'Soep', fotoId: null, gevoel: null, voorbeeld: false, gewijzigdOp: 1 });
            const ml = n % 3 === 0 ? 2600 : n % 3 === 1 ? 900 : 0; // 2600 haalt elk gangbaar dagdoel
            if (ml) tx.objectStore('dranken').add({ datum: d(n), tijdstip: 1000 + n, soort: 'water', ml, voorbeeld: false });
            const momenten = n % 4 === 0 ? ['ochtend', 'middag', 'avond'] : n % 4 === 1 ? ['ochtend'] : [];
            for (const mo of momenten) tx.objectStore('momentinnames').put({ datum: d(n), supplementId: 1, moment: mo, tijdstip: 1, voorbeeld: false });
          }
          tx.objectStore('wegingen').put({ week: d(2), datum: d(2), kg: 70, voorbeeld: false, gewijzigdOp: 1 });
          tx.objectStore('wegingen').put({ week: d(9), datum: d(10), kg: 69.5, voorbeeld: false, gewijzigdOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [maand, aantalDagen],
  );
}

// Open de app één keer (de database moet bestaan), vul de maand en laad de maand opnieuw.
async function openMetMaand(page, maand, aantalDagen) {
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  await vulMaand(page, maand, aantalDagen);
  await page.goto(`./#/dagboek/maand/${maand}`);
  await page.reload();
  await expect(page.locator('.mk__dag').first()).toBeVisible();
}

const liter = (ml) => `${String(Math.round(ml / 10) / 100).replace('.', ',')} l`;

test('Maand: de cel bevat alleen het nummer, het bolletje van alle supplementen en het spuitje (geen stemming)', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await openMetMaand(page, MAAND);
  await expect(page.locator('.mk__dag')).toHaveCount(DAGEN);
  for (let n = 1; n <= DAGEN; n++) {
    const dag = page.locator(`.mk__dag[data-datum="${MAAND}-${String(n).padStart(2, '0')}"]`);
    // geen eten, drinken, supplementen of energie in de cel
    await expect(dag.locator('.mk__eten, .mk__drinken, .mk__supplementen, .mk__energie, .mk__blad, .energie, progress')).toHaveCount(0);
    const kinderen = await dag.evaluate((el) => [...el.children].map((c) => c.className));
    expect(kinderen.length).toBe(2); // het nummer en één regel tekens
    expect(kinderen[0]).toContain('mk__nr');
    const tekens = await dag.locator('.mk__tekens > *').evaluateAll((els) => els.map((e) => e.className));
    expect(tekens.length).toBeLessThanOrEqual(2); // hoogstens het bolletje en het spuitje
    for (const k of tekens) expect(k).toMatch(/mk__plek/);
    // BESLISSING 294: geen gezichtje of stemmingsbolletje in de cel, ook niet op dagen met een ingevulde stemming
    await expect(dag.locator('.mk__stemming, .gevoelicoon, .kalender__bol')).toHaveCount(0);
    // het bolletje van alle supplementen (in het Dagboek bruin, in Nacht roze: src/uitleg/kleurnamen.js) precies op de dagen met alle drie de momenten afgevinkt (4, 8, 12, ... 28)
    await expect(dag.locator('.mk__klaar')).toHaveCount(n <= 28 && n % 4 === 0 ? 1 : 0);
  }
  // het spuitje op de beurten van "Testkuur" (3, 10, 17, 24) en nergens anders
  for (const n of [3, 10, 17, 24]) await expect(page.locator(`.mk__dag[data-datum="${MAAND}-${String(n).padStart(2, '0')}"] .kalender__spuit`)).toHaveCount(1);
  await expect(page.locator('.mk__dag .kalender__spuit')).toHaveCount(4);
  // het bolletje van alle supplementen: 7 dagen, een dag met maar één moment (5) en een dag met niets (6) hebben het niet
  await expect(page.locator('.mk__dag .mk__klaar')).toHaveCount(7);
  // toegankelijk label in woorden, zonder tellingen van supplementen per dag
  const label = await page.locator(`.mk__dag[data-datum="${MAAND}-04"]`).getAttribute('aria-label');
  expect(label).toMatch(/^[a-z]+ 4 [a-z]+( \d{4})?, stemming [a-z]+, energie [a-z]+, 4 van 6 maaltijden, /);
  expect(label).toMatch(/alle supplementen genomen/);
  // bij hover verandert de cel niet van plaats, kleur of schaduw (alleen een icoon mag oplichten)
  const cel = page.locator(`.mk__dag[data-datum="${MAAND}-05"]`);
  const voor = await cel.evaluate((e) => ({ r: JSON.stringify(e.getBoundingClientRect()), c: getComputedStyle(e).backgroundColor, s: getComputedStyle(e).boxShadow }));
  await cel.hover();
  await wachtOpRust(page);
  const na = await cel.evaluate((e) => ({ r: JSON.stringify(e.getBoundingClientRect()), c: getComputedStyle(e).backgroundColor, s: getComputedStyle(e).boxShadow }));
  expect(na).toEqual(voor);
});

test('Maand: het overzicht rekent over de hele maand (30 dagen, 180 maaltijden), elk label staat op één regel en alles op dezelfde lijnen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await openMetMaand(page, MAAND);
  let bijgehouden = 0;
  let maaltijden = 0;
  let totaalMl = 0;
  let metDrank = 0;
  let doel = 0;
  let alle = 0;
  const telling = [0, 0, 0, 0, 0, 0];
  for (let n = 1; n <= 28; n++) {
    if (n % 9 === 0) continue;
    bijgehouden += 1;
    maaltijden += n % 7;
    const ml = n % 3 === 0 ? 2600 : n % 3 === 1 ? 900 : 0;
    totaalMl += ml;
    if (ml) metDrank += 1;
    if (ml === 2600) doel += 1;
    if (n % 4 === 0) alle += 1;
    telling[(n % 5) + 1] += 1;
  }
  const meest = [1, 2, 3, 4, 5].reduce((m, n) => (telling[n] >= telling[m] ? n : m), 1);
  const stemmingNaam = ['moe', 'gewoon', 'goed', 'blij', 'stralend'][meest - 1];

  const items = page.locator('.maand__overzicht .maand__kc');
  await expect(items).toHaveCount(8);
  const labels = ['Bijgehouden', 'Maaltijden', 'Gedronken', 'Dagdoel', 'Supplementen', 'Stemming', 'Gewicht', 'Spuiten'];
  for (const [i, l] of labels.entries()) await expect(items.nth(i).locator('.maand__kclabel')).toHaveText(l);
  // de waarde is één groot cijfer of woord; de rest staat in de onderregel
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const waarde = async (i) => norm(await items.nth(i).locator('.maand__kcwaarde').innerText());
  const sub = async (i) => norm(await items.nth(i).locator('.maand__kcsub').innerText());
  expect(await waarde(0)).toBe(String(bijgehouden));
  expect(await sub(0)).toBe(`van ${DAGEN} dagen`);
  expect(await waarde(1)).toBe(String(maaltijden));
  expect(await sub(1)).toBe(`van ${DAGEN * 6} ingevuld`);
  expect(await sub(1)).toContain('van 180');
  expect(await waarde(2)).toBe(liter(totaalMl));
  await expect(items.nth(2).locator('.maand__kceenheid')).toHaveText('l');
  // BESLISSINGEN 456 en 457: het gemiddelde rekent over de verstreken dagen van de maand (een eerdere maand: alle dagen); een lege dag telt als 0.
  // September 2026 is voorbij (vaste klok: 12 november 2026): alle 30 dagen. (Vroeger: alleen de dagen met drank, metDrank.)
  expect(metDrank).toBeLessThan(DAGEN);
  expect(await sub(2)).toBe(`gem. ${liter(totaalMl / DAGEN)} per dag`);
  expect(await waarde(3)).toBe(String(doel));
  expect(await sub(3)).toBe(`van ${DAGEN} dagen gehaald`);
  expect(await waarde(4)).toBe(String(alle));
  expect(await sub(4)).toBe(`van ${DAGEN} dagen volledig`);
  // BESLISSING 314: alleen het gezichtje, geen woord; het woord staat in de toegankelijke naam; gecentreerd in de kolom en op de lijn van de cijfers
  expect(await waarde(5)).toBe('');
  await expect(items.nth(5).locator('.maand__kcwaarde')).toHaveAttribute('aria-label', `Stemming: ${stemmingNaam}, ${telling[meest]} dagen`);
  await expect(items.nth(5).locator('.maand__kcwaarde .gevoelicoon')).toHaveCount(1);
  const stemMeting = await page.evaluate(() => {
    const lijst = [...document.querySelectorAll('.maand__overzicht .maand__kc')];
    const kc = lijst[5];
    const ic = kc.querySelector('.gevoelicoon .icoon').getBoundingClientRect();
    const kol = kc.getBoundingClientRect();
    const ref = lijst[4].querySelector('.maand__kcwaarde').getBoundingClientRect();
    const eigen = kc.querySelector('.maand__kcwaarde').getBoundingClientRect();
    return { dx: Math.abs(ic.left + ic.width / 2 - (kol.left + kol.width / 2)), dy: Math.abs(ic.top + ic.height / 2 - (ref.top + ref.height / 2)), hoogte: ic.height, eigenDy: Math.abs(eigen.top - ref.top) };
  });
  expect(stemMeting.dx).toBeLessThanOrEqual(0.5);
  expect(stemMeting.dy).toBeLessThanOrEqual(1);
  expect(stemMeting.hoogte).toBeGreaterThanOrEqual(28);
  expect(stemMeting.hoogte).toBeLessThanOrEqual(32);
  expect(stemMeting.eigenDy).toBeLessThanOrEqual(0.5);
  expect(await sub(5)).toBe(`${telling[meest]} dagen`);
  expect(await waarde(6)).toBe('69,5 kg');
  await expect(items.nth(6).locator('.maand__kceenheid')).toHaveText('kg');
  expect(await sub(6)).toBe('2 wegingen');
  expect(await waarde(7)).toBe('4');
  expect(await sub(7)).toBe('gepland · 1 gezet');
  // geen kaart met de verdeling van stemmingen
  await expect(page.locator('.maand__stemkaart')).toHaveCount(0);

  await wachtOpRust(page); // de kaarten schuiven bij het openen één keer op hun plaats
  await controleerRaster(page);
});

// Het overzicht is een strak raster: acht even brede kolommen met een dunne lijn ertussen, elk blok gecentreerd, labels, waarden (op één basislijn) en onderregels
// op dezelfde lijnen, niets breekt af of raakt de buurkolom.
async function controleerRaster(page) {
  const m = await page.locator('.maand__overzicht').evaluate((ul) => {
    const kaart = ul.closest('.kaart');
    const ks = getComputedStyle(kaart);
    const binnen = { links: kaart.getBoundingClientRect().left + parseFloat(ks.paddingLeft), rechts: kaart.getBoundingClientRect().right - parseFloat(ks.paddingRight) };
    const inhoud = (e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      const b = r.getBoundingClientRect();
      return { links: b.left, rechts: b.right, top: b.top, hoogte: b.height };
    };
    const items = [...ul.querySelectorAll('.maand__kc')].map((li) => {
      const r = li.getBoundingClientRect();
      const midden = (r.left + r.right) / 2;
      const delen = {};
      for (const [naam, sel] of [['label', '.maand__kclabel'], ['waarde', '.maand__kcwaarde'], ['sub', '.maand__kcsub']]) {
        const e = li.querySelector(sel);
        const c = inhoud(e);
        const basis = document.createElement('span');
        delen[naam] = { top: e.getBoundingClientRect().top, hoogte: c.hoogte, afwijking: (c.links + c.rechts) / 2 - midden, past: e.scrollWidth <= e.clientWidth, breedte: c.rechts - c.links, kolomBinnen: r.width - 2 * parseFloat(getComputedStyle(li).paddingLeft) };
        void basis;
      }
      const t = li.querySelector('.tegel').getBoundingClientRect();
      // de basislijn van de waarde: de onderkant van het eerste tekstteken in de waarde
      const w = li.querySelector('.maand__kcwaarde');
      const tekst = [...w.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim() !== '');
      // het blok Stemming toont alleen een icoon (BESLISSING 314): geen tekstbasislijn, dat staat apart gemeten
      let basis = null;
      if (tekst) {
        const rg = document.createRange();
        rg.selectNodeContents(tekst);
        basis = rg.getBoundingClientRect().bottom;
      }
      return { links: r.left, rechts: r.right, breedte: r.width, tegelAfwijking: (t.left + t.right) / 2 - midden, basis, delen };
    });
    return { binnen, items };
  });
  expect(m.items.length).toBe(8);
  const breedtes = m.items.map((i) => i.breedte);
  expect(Math.max(...breedtes) - Math.min(...breedtes), 'acht even brede kolommen').toBeLessThanOrEqual(1);
  expect(Math.abs(m.items[0].links - m.binnen.links), 'het eerste blok begint op de linker binnenrand').toBeLessThanOrEqual(1);
  expect(Math.abs(m.items[7].rechts - m.binnen.rechts), 'het laatste eindigt op de rechter binnenrand').toBeLessThanOrEqual(1);
  const gelijk = (lijst, tekst) => expect(Math.max(...lijst) - Math.min(...lijst), tekst).toBeLessThanOrEqual(1);
  gelijk(m.items.map((i) => i.delen.label.top), 'labels op dezelfde y');
  gelijk(m.items.map((i) => i.delen.waarde.top), 'waarden op dezelfde y');
  gelijk(m.items.map((i) => i.delen.sub.top), 'onderregels op dezelfde y');
  gelijk(m.items.map((i) => i.basis).filter((b) => b != null), 'waarden op dezelfde basislijn');
  m.items.forEach((i, n) => {
    expect(Math.abs(i.tegelAfwijking), `blok ${n}: tegel gecentreerd`).toBeLessThanOrEqual(1);
    for (const naam of ['label', 'waarde', 'sub']) {
      expect(i.delen[naam].past, `blok ${n}: ${naam} past zonder afkappen`).toBe(true);
      expect(i.delen[naam].hoogte, `blok ${n}: ${naam} op één regel`).toBeLessThanOrEqual(i.delen[naam] === i.delen.waarde ? 48 : 24);
      expect(Math.abs(i.delen[naam].afwijking), `blok ${n}: ${naam} gecentreerd`).toBeLessThanOrEqual(1);
      expect(i.delen[naam].breedte, `blok ${n}: ${naam} past in de kolom (raakt de buur niet)`).toBeLessThanOrEqual(i.delen[naam].kolomBinnen);
    }
  });
}

test('Maand op 1280 px: het overzicht is een strak raster (acht kolommen als alles past, anders vier)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openMetMaand(page, MAAND);
  await wachtOpRust(page);
  const kolommen = await page.locator('.maand__overzicht').evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length);
  expect([4, 8]).toContain(kolommen);
  if (kolommen === 8) await controleerRaster(page);
  else {
    const links = await page.locator('.maand__overzicht .maand__kc').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(links.length).toBe(4);
    const kc = await page.locator('.maand__kclabel').evaluateAll((els) => els.every((e) => e.scrollWidth <= e.clientWidth));
    expect(kc).toBe(true);
  }
});

test('Maand: zonder gegevens toont elk cijfer een streepje en staat er geen kaart met nullen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto(`./#/dagboek/maand/${MAAND}`);
  await expect(page.locator('.maand__overzicht .maand__kc')).toHaveCount(8);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) await expect(page.locator('.maand__overzicht .maand__kc').nth(i).locator('.maand__kcwaarde')).toHaveText('-');
  await expect(page.locator('.maand__stemkaart, .maand__gepkaart')).toHaveCount(0);
  await expect(page.locator('.maand__overzicht')).not.toContainText(/\b0\b/);
});

test('Maand: de legenda heeft precies twee paren, alle supplementen genomen en geplande spuit, elk teken direct gevolgd door zijn woord', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await openMetMaand(page, MAAND);
  const paren = page.locator('.maand__legenda .maand__legitem');
  await expect(paren).toHaveCount(2);
  for (const li of await paren.all()) {
    await expect(li.locator('.maand__legteken')).toHaveCount(1);
    await expect(li.locator('.maand__legwoord')).toHaveCount(1);
  }
  await expect(paren.nth(0).locator('.mk__klaar')).toHaveCount(1);
  await expect(page.locator('.maand__legenda .gevoelicoon')).toHaveCount(0);
  await expect(paren.nth(0).locator('.maand__legwoord')).toHaveText('alle supplementen genomen');
  await expect(paren.nth(1).locator('.kalender__spuit')).toHaveCount(1);
  await expect(paren.nth(1).locator('.maand__legwoord')).toHaveText('geplande spuit');
  await expect(page.locator('.maand__legenda')).not.toContainText(/afgevinkt|niet gezet|volledige dag/i);
  // het woord staat direct achter zijn teken
  for (const li of await paren.all()) {
    const [teken, woord] = await li.evaluate((el) => [el.querySelector('.maand__legteken').getBoundingClientRect(), el.querySelector('.maand__legwoord').getBoundingClientRect()].map((r) => ({ rechts: r.right, links: r.left })));
    expect(woord.links - teken.rechts).toBeLessThanOrEqual(10);
    expect(woord.links - teken.rechts).toBeGreaterThanOrEqual(0);
  }
});

test('Maand: het paneel toont de gekozen dag, vandaag is bij het openen gekozen en een dag in de adresbalk is vooraf gekozen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await openMetMaand(page, MAAND);
  await page.goto(`./#/dagboek/maand/${MAAND}-04`);
  await expect(page.locator(`.mk__dag[data-datum="${MAAND}-04"]`)).toHaveAttribute('aria-pressed', 'true');
  const paneel = page.locator('.maand__paneel');
  await expect(paneel).toContainText('4 september');
  await expect(paneel).toContainText('stralend');
  await expect(paneel.locator('.maand__blok').nth(0)).toContainText('4 van 6');
  await expect(paneel.locator('.maand__maaltijd')).toHaveCount(4);
  await expect(paneel.locator('.maand__baan')).toHaveAttribute('value', '900');
  await expect(paneel.locator('.maand__moment.is-vol')).toHaveCount(3);
  await expect(paneel).toContainText('Ochtend');
  await expect(paneel).toContainText('Middag');
  await expect(paneel).toContainText('Avond');
  await expect(paneel).toContainText('Een rustige dag.');
  await expect(paneel.getByRole('button', { name: 'Dag openen' })).toBeVisible();
  // een andere dag aantikken
  await wachtOpRust(page); // de kaarten schuiven bij het openen één keer op hun plaats
  await page.locator(`.mk__dag[data-datum="${MAAND}-05"]`).click();
  await expect(paneel).toContainText('5 september');
  await expect(page.locator('.mk__dag.is-gekozen')).toHaveCount(1);
  await expect(page.locator(`.mk__dag[data-datum="${MAAND}-05"]`)).toHaveAttribute('aria-pressed', 'true');
  // het paneel van de dag van een beurt toont de beurt; een afgevinkte beurt zegt dat
  await page.locator(`.mk__dag[data-datum="${MAAND}-10"]`).click();
  await expect(paneel).toContainText('Testspuit');
  await expect(paneel).toContainText('Afgevinkt');
  // de ene kalender en het ene paneel: toetsenbord
  await page.locator(`.mk__dag[data-datum="${MAAND}-10"]`).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(`.mk__dag[data-datum="${MAAND}-11"]`)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`.mk__dag[data-datum="${MAAND}-18"]`)).toBeFocused();
  // Dag openen
  await paneel.getByRole('button', { name: 'Dag openen' }).click();
  await expect(page).toHaveURL(new RegExp(`#/dagboek/dag/${MAAND}-10$`));
});

// Een gewone volle dag (6 maaltijden, dranken, drie momenten en een notitie) past zonder scrollen in het paneel: niets afgesneden, "Dag openen" volledig zichtbaar.
for (const breedte of [1690, 1280]) {
  test(`Maand op ${breedte} px: een volle dag past in het paneel zonder scrollen en zonder afgesneden regel`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 1230 });
    await openMetMaand(page, MAAND);
    // dag 20: zes maaltijden en drie momenten; een notitie en 2,18 l erbij
    // BESLISSING 658: de notitie is lang genoeg om ook in de dagkaart van 784 px (op 1690) af te kappen
    await page.evaluate(
      (m) =>
        new Promise((klaar, fout) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['dagen', 'dranken'], 'readwrite');
            tx.objectStore('dagen').put({ datum: `${m}-20`, notitie: 'Een lange notitie over een rustige dag met veel wandelen, koken en een vriendelijk gesprek met de buren over de tuin, de boodschappen, het weer, de plannen voor het weekend en wat er nog in de kast ligt aan lekkere dingen voor de volgende dagen.', stemming: 4, energie: 3, doelGehaald: true, voorbeeld: false, gewijzigdOp: 1 });
            tx.objectStore('dranken').clear();
            tx.objectStore('dranken').add({ datum: `${m}-20`, tijdstip: 5, soort: 'water', ml: 2180, voorbeeld: false });
            tx.oncomplete = () => {
              idb.close();
              klaar();
            };
            tx.onerror = () => fout(tx.error);
          };
        }),
      MAAND,
    );
    await page.goto(`./#/dagboek/maand/${MAAND}-20`);
    const paneel = page.locator('.maand__paneel');
    await expect(paneel.locator('.maand__maaltijd')).toHaveCount(6);
    await expect(paneel.locator('.maand__moment.is-vol')).toHaveCount(3);
    await expect(paneel).toContainText('2,18 l');
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const inh = document.querySelector('.maand__paneelinhoud');
      const knop = document.querySelector('.maand__paneel > .knop').getBoundingClientRect();
      const kaart = document.querySelector('.maand__paneel').getBoundingClientRect();
      const notitie = document.querySelector('.maand__notitie');
      return { scroll: inh.scrollHeight, zicht: inh.clientHeight, vervaagd: inh.classList.contains('kan-scrollen'), knopBinnen: knop.top >= kaart.top && knop.bottom <= kaart.bottom, notitieAfgekapt: notitie.scrollWidth > notitie.clientWidth, rijen: new Set([...document.querySelectorAll('.maand__maaltijd')].map((e) => Math.round(e.getBoundingClientRect().top))).size };
    });
    expect(m.scroll, 'niets afgesneden: de scrollhoogte is niet groter dan de zichtbare hoogte').toBeLessThanOrEqual(m.zicht);
    expect(m.vervaagd).toBe(false);
    expect(m.knopBinnen, '"Dag openen" is volledig zichtbaar').toBe(true);
    expect(m.notitieAfgekapt, 'de notitie is één afgekapte regel').toBe(true);
    // BESLISSING 681 en 688: vanaf 1600 px staan de maaltijden onder elkaar met hun uur (de volledige stand), smaller in twee kolommen
    expect(m.rijen, breedte >= 1600 ? 'zes maaltijden onder elkaar' : 'zes maaltijden in drie rijen').toBe(breedte >= 1600 ? 6 : 3);
    await expect(paneel.getByRole('button', { name: 'Dag openen' })).toBeVisible();
  });
}

test('Maand: een geplande beurt van vandaag afvinken in het paneel, en het blok Gepland deze maand toont één rij per beurt', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const nu = await page.evaluate(() => {
    const d = new Date();
    const t2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
  });
  await page.evaluate(
    (start) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          tx.objectStore('supplementen').add({ id: 1, naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    nu,
  );
  await page.goto('./#/dagboek/maand');
  await page.reload();
  const paneel = page.locator('.maand__paneel');
  await expect(paneel).toContainText('een halve ampule');
  await expect(page.locator('.maand__beurt').first()).toContainText('Testspuit');
  await expect(page.locator('.maand__beurt').first()).toContainText('Gepland');
  await paneel.getByRole('button', { name: 'Afvinken' }).click();
  await expect(paneel).toContainText('Afgevinkt');
  await page.reload();
  await expect(page.locator('.maand__paneel')).toContainText('Afgevinkt');
  await expect(page.locator('.maand__beurt').first()).toContainText('Afgevinkt');
  await expect(page.locator('.maand__overzicht .maand__kc').nth(7).locator('.maand__kcsub')).toContainText('1 gezet');
  // elke rij op één lijn: tegel, naam met de hoeveelheid eronder, datum en stand rechts op de binnenrand van de kaart
  const rij = page.locator('.maand__beurt').first();
  const m = await rij.evaluate((el) => {
    const r = (s) => el.querySelector(s).getBoundingClientRect();
    // de binnenrand van de rij zelf (in twee kolommen is dat de rand van de kolom)
    return { rij: el.getBoundingClientRect().height, stand: r('.maand__beurtstand').right, binnenrand: el.closest('li').getBoundingClientRect().right, tegel: r('.tegel').height };
  });
  expect(m.rij).toBeLessThanOrEqual(64);
  expect(Math.abs(m.stand - m.binnenrand)).toBeLessThanOrEqual(2);
});

test('Maand: zonder beurten is er geen blok Gepland deze maand', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek/maand/2027-02');
  await expect(page.locator('.mk')).toBeVisible();
  await expect(page.locator('.maand__gepkaart')).toHaveCount(0);
});

test('Maand: bladeren naar de vorige en volgende maand en terug naar deze maand', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek/maand/2026-11');
  await expect(page.locator('.bladerkop__titel')).toContainText('november 2026');
  await page.locator('.bladerkop button').last().click();
  await expect(page).toHaveURL(/#\/dagboek\/maand\/2026-12$/);
  await expect(page.locator('.bladerkop__titel')).toContainText('december 2026');
  await expect(page.locator('.mk__dag')).toHaveCount(31);
  await page.locator('.bladerkop button').first().click();
  await page.locator('.bladerkop button').first().click();
  await expect(page).toHaveURL(/#\/dagboek\/maand\/2026-10$/);
  await expect(page.locator('.mk__dag')).toHaveCount(31);
  // ook de toekomst, en terug met "Naar deze maand"
  await page.goto('./#/dagboek/maand/2031-05');
  await expect(page.locator('.mk__dag')).toHaveCount(31);
  await expect(page.locator('.maand__overzicht .maand__kc')).toHaveCount(8);
  await page.getByRole('button', { name: 'Naar deze maand' }).click();
  await expect(page.locator('.mk__dag.is-vandaag')).toHaveCount(1);
  await expect(page.locator('.mk__dag.is-gekozen')).toHaveCount(1);
});

// BESLISSING 666: de lege ruimte die de kalender met opzet vrijhoudt: de rijen van de ontbrekende weken en de regels van de legenda voor paren die deze maand niet voorkomen.
function legeRuimte() {
  const weken = document.querySelectorAll('.mk__week:not(.mk__kop)');
  const rijen = document.querySelector('.mk').getBoundingClientRect().bottom - weken[weken.length - 1].getBoundingClientRect().bottom;
  const leg = document.querySelector('.maand__legenda');
  const laatste = Math.max(...[...leg.children].map((li) => li.getBoundingClientRect().bottom));
  return [rijen, leg.getBoundingClientRect().bottom - laatste];
}

// BESLISSING 688: vanaf 1440 px staan de blokken van de dagkaart (naast de kalender) bovenaan tegen elkaar; de vrije ruimte van een sobere of lege dag staat onderaan,
// tussen het laatste blok en "Dag openen". Alleen dat vlak is toegestaan: de ruimte TUSSEN de blokken blijft 0.
function paneelRuimte() {
  const inh = document.querySelector('.maand__paneelinhoud');
  const knop = document.querySelector('.maand__paneel > .knop').getBoundingClientRect();
  const kids = [...inh.children].map((k) => k.getBoundingClientRect());
  let tussen = 0;
  for (let k = 1; k < kids.length; k++) tussen = Math.max(tussen, kids[k].top - kids[k - 1].bottom);
  return { tussen, onder: Math.max(0, knop.top - kids[kids.length - 1].bottom) };
}

// Maanden van vier (februari 2027), vijf (maart 2027) en zes weken (november 2026) op 1690x1230, zonder gegevens en met een volle maand: geen leeg vlak van
// meer dan 32 px in een kaart, kalender en paneel beginnen en eindigen op dezelfde lijn, geen leeg vlak onder de laatste week.
for (const [maand, weken] of [['2027-02', 4], ['2027-03', 5], ['2026-11', 6]]) {
  for (const stand of ['leeg', 'vol']) {
    test(`Maand ${maand} (${weken} weken, ${stand}): verhoudingen op 1690x1230`, async ({ page }) => {
      await page.setViewportSize({ width: 1690, height: 1230 });
      if (stand === 'vol') await openMetMaand(page, maand, 25);
      else await page.goto(`./#/dagboek/maand/${maand}`);
      await expect(page.locator('.mk')).toBeVisible();
      await wachtOpRust(page);
      expect(await page.locator('.mk__week:not(.mk__kop)').count()).toBe(weken);
      const kaarten = await meetKaarten(page, '.maand__kolommen');
      // BESLISSING 666: de kalender reserveert zes weken; in een maand van vier of vijf weken telt de lege plaats van de ontbrekende weken niet als leeg vlak
      // (en evenmin de regel die de legenda vrijhoudt voor een paar dat deze maand niet voorkomt)
      const [gereserveerd, legVrij] = await page.evaluate(legeRuimte);
      // BESLISSING 688: in de dagkaart telt alleen de vrije ruimte onderaan (boven "Dag openen") niet mee; tussen de blokken is er geen ruimte
      const pr = await page.evaluate(paneelRuimte);
      expect(pr.tussen, 'geen ruimte tussen de blokken van de dagkaart').toBeLessThanOrEqual(1);
      for (const k of kaarten) expect(k.gat - (k.naam === 'maand__kalkaart' ? Math.max(gereserveerd, legVrij) : k.naam === 'maand__paneel' ? pr.onder : 0), `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
      const per = Object.fromEntries(kaarten.map((k) => [k.naam, k]));
      expect(Math.abs(per.maand__kalkaart.top - per.maand__paneel.top)).toBeLessThanOrEqual(2);
      const rechtsBodem = per.maand__paneel.bodem;
      expect(Math.abs(per.maand__kalkaart.bodem - rechtsBodem), 'kalender en paneel eindigen gelijk').toBeLessThanOrEqual(1);
      expect(Math.abs(per.maand__kalkaart.hoogte - per.maand__paneel.hoogte), 'het paneel is even hoog als de kalender').toBeLessThanOrEqual(1);
      // het overzicht staat bovenaan over de volle breedte
      expect(per.maand__cijferkaart.bodem).toBeLessThanOrEqual(per.maand__kalkaart.top + 1);
      expect(Math.abs(per.maand__cijferkaart.links - per.maand__kalkaart.links)).toBeLessThanOrEqual(1);
      // zonder gegevens past alles in het venster zonder scrollen (een volle dag met veel maaltijden en een notitie mag iets langer worden)
      if (stand === 'leeg') expect(Math.max(per.maand__kalkaart.bodem, rechtsBodem, per.maand__gepkaart?.bodem ?? 0)).toBeLessThanOrEqual(1230);
      // BESLISSING 666: vierkante vakjes in elke maand (was 658: 64 px breed, in vier weken 92 px hoog)
      const cel = await page.locator('.mk__dag').first().boundingBox();
      expect(Math.abs(cel.width - cel.height), `vakje ${cel.width} bij ${cel.height}`).toBeLessThanOrEqual(1);
      // BESLISSING 666: de kalender eindigt vlak boven de legenda; daarboven staan de lege rijen van de ontbrekende weken (elk een vakje en 4 px tussenruimte)
      const gat = await page.evaluate(() => document.querySelector('.maand__legenda').getBoundingClientRect().top - document.querySelector('.mk').getBoundingClientRect().bottom);
      expect(gat).toBeLessThanOrEqual(32);
      expect(Math.abs(gereserveerd - (6 - weken) * (cel.height + 4)), `${6 - weken} lege rijen: ${gereserveerd} px`).toBeLessThanOrEqual(1);
    });
  }
}

// De kalender heeft een vaste grootte: hoe de gekozen dag, de maand of een afgevinkte beurt ook is, de rechthoek van de kalenderkaart verandert niet
// en het paneel van de dag is even hoog als de kalender.
for (const breedte of [1690, 1280]) {
  test(`Maand op ${breedte} px: de kalender verspringt niet bij een lege, volle of toekomstige dag, bij bladeren en bij afvinken`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 1230 });
    await openMetMaand(page, MAAND);
    const rect = () => page.locator('.maand__kalkaart').evaluate((e) => {
      // de plaats ten opzichte van de kop van het scherm (het scherm zelf mag scrollen)
      const r = e.getBoundingClientRect();
      const kop = document.querySelector('.maand .bladerkop').getBoundingClientRect();
      return [r.x, r.y - kop.y, r.width, r.height];
    });
    const paneelHoogte = () => page.locator('.maand__paneel').evaluate((e) => e.getBoundingClientRect().height);
    // Meet pas als de kaarten opgekomen zijn en kalender en paneel stilstaan: het paneel wordt na een klik of na het bladeren
    // opnieuw getekend (de dag wordt gelezen); de ronde van 16 november mat soms midden in die hertekening (496 px verschil).
    const stil = () => wachtTotStil(page, async () => [...(await rect()), await paneelHoogte()]);
    await wachtOpRust(page);
    const [x0, y0, b0, h0, p0] = await stil();
    const vast = [x0, y0, b0, h0];
    const gelijk = (a, b) => a.forEach((w, i) => expect(Math.abs(w - b[i]), `waarde ${i}: ${w} tegen ${b[i]}`).toBeLessThanOrEqual(1));
    expect(Math.abs(p0 - vast[3])).toBeLessThanOrEqual(1);
    const kies = async (dag) => {
      const datum = await dag.getAttribute('data-datum');
      await dag.click();
      await expect(dag).toHaveAttribute('aria-pressed', 'true');
      const [j, m, d] = datum.split('-').map(Number);
      await expect(page.locator('.maand__paneel')).toContainText(new Date(j, m - 1, d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' })); // het paneel toont de gekozen dag
      await wachtOpRust(page);
      const [x, y, b, hh, p] = await stil();
      gelijk([x, y, b, hh], vast);
      expect(Math.abs(p - vast[3])).toBeLessThanOrEqual(1);
    };
    // een lege dag (9), een volle dag (6 maaltijden, notitie: 4 heeft er vier), een dag met een beurt (10) en een leeg dag zonder iets (18)
    for (const n of [9, 6, 4, 10, 18, 30]) await kies(page.locator(`.mk__dag[data-datum="${MAAND}-${String(n).padStart(2, '0')}"]`));
    // bladeren naar maanden van vier, vijf en zes weken (ook in de toekomst, met een toekomstige dag gekozen)
    for (const maand of ['2027-02', '2027-03', '2026-11', '2031-05']) {
      await page.goto(`./#/dagboek/maand/${maand}`);
      await expect(page.locator('.mk__dag').first()).toHaveAttribute('data-datum', new RegExp(`^${maand}-`));
      await kies(page.locator('.mk__dag').nth(14));
    }
  });
}

// Geen lege band boven de overzichtskaart: "Naar deze maand" neemt geen hoogte in. De afstand bladerkop tot de eerste kaart is dezelfde als tussen de kaarten
// onderling, in de huidige maand en in een andere maand.
test('Maand: de afstand van de bladerkop tot de overzichtskaart is gelijk aan die tussen de kaarten, in de huidige en in een andere maand', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  const nu = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  for (const maand of [nu, MAAND, '2031-05']) {
    await page.goto(`./#/dagboek/maand/${maand}`);
    await expect(page.locator('.maand__cijferkaart')).toBeVisible();
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      // BESLISSING 372: onder de bladerkop staat de regel met "Delen"; de afstand tussen die regel en de overzichtskaart is die van de week (8 px meer dan tussen de kaarten)
      return { boven: r('.maand__cijferkaart').top - r('.week__delen').bottom - 8, tussen: r('.maand__kalkaart').top - r('.maand__cijferkaart').bottom };
    });
    expect(Math.abs(m.boven - m.tussen), `${maand}: ${m.boven} tegen ${m.tussen}`).toBeLessThanOrEqual(1);
    if (maand !== nu) await expect(page.getByRole('button', { name: 'Naar deze maand' })).toBeVisible();
  }
});

// "Gepland deze maand": met één beurt loopt de rij over de volle breedte (de stand op de rechter binnenrand), vanaf twee beurten staan er twee kolommen en
// een losse laatste rij loopt over de volle breedte.
for (const [dagen, aantal] of [[28, 1], [14, 2], [10, 3]]) {
  test(`Maand: Gepland deze maand met ${aantal} beurt(en) vult de kaart zonder halve lege rij`, async ({ page }) => {
    await page.setViewportSize({ width: 1690, height: 1230 });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dagboek__kop')).toBeVisible();
    await page.evaluate(
      ([maand, n]) =>
        new Promise((klaar, fout) => {
          const open = indexedDB.open('bloei-dagboek');
          open.onerror = () => fout(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
            tx.objectStore('supplementen').clear();
            tx.objectStore('momentinnames').clear();
            tx.objectStore('supplementen').add({ id: 2, naam: 'Testspuit', dosis: '', hoeveelheid: 'een ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: n, start: `${maand}-03` }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
            tx.oncomplete = () => {
              idb.close();
              klaar();
            };
            tx.onerror = () => fout(tx.error);
          };
        }),
      [MAAND, dagen],
    );
    await page.goto(`./#/dagboek/maand/${MAAND}`);
    await page.reload();
    await expect(page.locator('.maand__beurt')).toHaveCount(aantal);
    await wachtOpRust(page);
    const m = await page.evaluate(() => {
      const kaart = document.querySelector('.maand__gepkaart');
      const stijl = getComputedStyle(kaart);
      const binnenRechts = kaart.getBoundingClientRect().right - parseFloat(stijl.paddingRight);
      const binnenLinks = kaart.getBoundingClientRect().left + parseFloat(stijl.paddingLeft);
      const lis = [...kaart.querySelectorAll('.maand__geplandlijst > li')].map((li) => {
        const r = li.getBoundingClientRect();
        return { links: r.left, rechts: r.right, top: r.top, stand: li.querySelector('.maand__beurtstand').getBoundingClientRect().right };
      });
      return { binnenLinks, binnenRechts, lis };
    });
    const [eerste, tweede, derde] = m.lis;
    if (aantal === 1) {
      expect(Math.abs(eerste.rechts - m.binnenRechts)).toBeLessThanOrEqual(1);
      expect(Math.abs(eerste.stand - m.binnenRechts), 'de stand staat op de rechter binnenrand').toBeLessThanOrEqual(2);
    } else {
      expect(eerste.rechts, 'twee kolommen').toBeLessThan(tweede.links + 1);
      expect(Math.abs(eerste.top - tweede.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(tweede.stand - m.binnenRechts)).toBeLessThanOrEqual(2);
    }
    if (aantal === 3) {
      expect(Math.abs(derde.links - m.binnenLinks)).toBeLessThanOrEqual(1);
      expect(Math.abs(derde.rechts - m.binnenRechts), 'de losse laatste rij loopt over de volle breedte').toBeLessThanOrEqual(1);
      expect(Math.abs(derde.stand - m.binnenRechts)).toBeLessThanOrEqual(2);
    }
  });
}

for (const breedte of [390, 360]) {
  test(`Maand op ${breedte} px: kalender, paneel en cijfers in twee kolommen zonder horizontale scroll`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 844 });
    await openMetMaand(page, MAAND);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const maten = await page.locator('.mk__dag').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
    for (const [b, hh] of maten) {
      expect(b).toBeGreaterThanOrEqual(40);
      expect(hh).toBeGreaterThanOrEqual(40);
    }
    // onder elkaar: kalender, paneel, geplande beurten, cijfers
    const bovenkant = await page.evaluate(() => ['.maand__kalkaart', '.maand__paneel', '.maand__gepkaart', '.maand__cijferkaart'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    expect([...bovenkant].sort((a, b) => a - b)).toEqual(bovenkant);
    // elke kaart binnen het scherm
    const kaarten = await page.evaluate(() => [...document.querySelectorAll('.maand__kolommen .kaart')].map((k) => [k.getBoundingClientRect().left, k.getBoundingClientRect().right]));
    for (const [l, r] of kaarten) {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(breedte);
    }
    // de cijfers in twee kolommen, elk met zijn tegel
    const links = await page.locator('.maand__overzicht .maand__kc').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))]);
    expect(links.length).toBe(2);
    await expect(page.locator('.maand__overzicht .maand__kc .tegel:visible')).toHaveCount(8);
    for (const l of await page.locator('.maand__kclabel').all()) {
      const w = await l.evaluate((e) => [e.scrollWidth, e.clientWidth]);
      expect(w[0], 'een label past zonder afkappen').toBeLessThanOrEqual(w[1]);
    }
    const kaartenMeting = await meetKaarten(page, '.maand__kolommen');
    // BESLISSING 666: september 2026 telt vijf weken; de lege zesde rij van de kalender en de vrije regels van de legenda tellen niet als leeg vlak
    const [rijen, legVrij] = await page.evaluate(legeRuimte);
    for (const k of kaartenMeting) expect(k.gat - (k.naam === 'maand__kalkaart' ? Math.max(rijen, legVrij) : 0), `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
  });
}

test('Maand: vandaag staat in hetzelfde paarse rondje als de kalender op Vandaag, even breed als hoog en op dezelfde regel als de buurdag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/vandaag');
  const stip = await page.locator('.vandaag .kalkaart .kalender__dag.is-vandaag .kalender__nr').first().evaluate((e) => ({
    bg: getComputedStyle(e, '::before').backgroundColor,
    tekst: getComputedStyle(e).color,
  }));
  await openMetMaand(page, '2026-11') /* de maand van de vaste klok; was de UTC-maand via toISOString (R4-17) */;
  const m = await page.locator('.mk__dag.is-vandaag .mk__nr').evaluate((e) => {
    const s = getComputedStyle(e, '::before');
    const cel = e.closest('.mk__cel');
    const buur = (cel.nextElementSibling ?? cel.previousElementSibling)?.querySelector('.mk__nr');
    const mid = (el) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
    return { bg: s.backgroundColor, tekst: getComputedStyle(e).color, b: parseFloat(s.width), h: parseFloat(s.height), tb: e.getBoundingClientRect().width, y: mid(e), yBuur: buur ? mid(buur) : null };
  });
  expect(m.bg).toBe(stip.bg);
  expect(m.tekst).toBe(stip.tekst);
  expect(m.b).toBe(m.h);
  expect((m.b - m.tb) / 2, 'rondje steekt niet meer dan 4 px uit').toBeLessThanOrEqual(4);
  if (m.yBuur !== null) expect(Math.abs(m.y - m.yBuur)).toBeLessThanOrEqual(1);
});

// BESLISSING 294 en 295: de tekens in de cel staan op vaste plaatsen, het nummer staat iets naar binnen en het rondje van vandaag staat vrij van de celrand.
for (const breedte of [1690, 1280, 390]) {
  test(`Maand op ${breedte} px: bolletje en spuitje staan op één lijn, naast elkaar, in alle rijen op dezelfde afstand onder het nummer`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 1230 });
    await openMetMaand(page, MAAND);
    const m = await page.evaluate(() => {
      // BESLISSING 666: vierkante vakjes; een vakje smaller dan 64 px (ook op desktop tot rond 1380 px) toont alles gecentreerd, zoals de telefoon
      const ruim = document.querySelector('.mk__dag').getBoundingClientRect().width >= 64;
      const uit = { ruim, nrTop: [], nrLinks: [], klaar: [], spuit: [], beide: null, klaarX: [], spuitX: [], groepX: [], bolMidden: [], spuitLinks: [] };
      for (const dag of document.querySelectorAll('.mk__dag')) {
        const c = dag.getBoundingClientRect();
        const nr = dag.querySelector('.mk__nr').getBoundingClientRect();
        uit.nrTop.push(nr.top - c.top);
        if (nr.left - c.left > 0) uit.nrLinks.push(breedteNaarCel(dag, nr));
        const k = dag.querySelector('.mk__klaar')?.getBoundingClientRect();
        const s = dag.querySelector('.mk__spuit')?.getBoundingClientRect();
        if (k) { uit.klaar.push(k.top + k.height / 2 - nr.bottom); uit.klaarX.push(k.left + k.width / 2 - c.left - c.width / 2); }
        if (s) { uit.spuit.push(s.top + s.height / 2 - nr.bottom); uit.spuitX.push(s.left + s.width / 2 - c.left - c.width / 2); }
        // uitlijning: op een telefoon staat het groepje tekens (één of twee) gecentreerd onder het nummer; daarboven staat het bolletje midden onder het nummer en het spuitje (alleen) op de linkerlijn van het nummer
        const nrMid = nr.left + nr.width / 2;
        if (!ruim && (k || s)) uit.groepX.push((Math.min(k?.left ?? 1e9, s?.left ?? 1e9) + Math.max(k?.right ?? -1e9, s?.right ?? -1e9)) / 2 - nrMid);
        if (ruim && k) uit.bolMidden.push(k.left + k.width / 2 - nrMid);
        if (ruim && s && !k) uit.spuitLinks.push(s.left - nr.left);
        if (k && s) uit.beide = { gap: s.left - k.right, dy: Math.abs(k.top + k.height / 2 - (s.top + s.height / 2)) };
      }
      function breedteNaarCel(d, nr) { return nr.left - d.getBoundingClientRect().left; }
      return uit;
    });
    const spreid = (a) => Math.max(...a) - Math.min(...a);
    const tekst = JSON.stringify(m);
    expect(m.klaar.length, tekst).toBe(7);
    expect(m.spuit.length, tekst).toBe(4);
    expect(spreid(m.nrTop), `nummers op één lijn: ${tekst}`).toBeLessThanOrEqual(1);
    if (breedte > 719) expect(spreid(m.nrLinks), `nummers op één lijn in de kolom: ${tekst}`).toBeLessThanOrEqual(1);
    expect(spreid(m.klaar), `bolletjes: ${tekst}`).toBeLessThanOrEqual(1);
    expect(spreid(m.spuit), `spuitjes: ${tekst}`).toBeLessThanOrEqual(1);
    // de tekens staan in dezelfde kolom op dezelfde plek: bolletje midden onder het nummer, spuitje op de linkerlijn van het nummer (telefoon: het groepje gecentreerd)
    for (const x of [...m.groepX, ...m.bolMidden]) expect(Math.abs(x), `gecentreerd onder het nummer: ${tekst}`).toBeLessThanOrEqual(0.5);
    if (m.ruim) expect(m.spuitLinks.length, tekst).toBe(3); // BESLISSING 666: hangt af van de breedte van het vakje, niet van het venster
    expect(m.ruim, tekst).toBe(breedte >= 1440);
    for (const x of m.spuitLinks) expect(Math.abs(x), `spuitje op de linkerlijn van het nummer: ${tekst}`).toBeLessThanOrEqual(1);
    expect(m.beide, tekst).not.toBeNull(); // de 24e heeft allebei
    expect(m.beide.dy, tekst).toBeLessThanOrEqual(1);
    expect(m.beide.gap, `geen overlap: ${tekst}`).toBeGreaterThanOrEqual(1);
    expect(Math.abs(m.klaar[0] - m.spuit[0]), `bolletje en spuitje op dezelfde hoogte: ${tekst}`).toBeLessThanOrEqual(1);
  });

  test(`Maand op ${breedte} px: het rondje van vandaag staat rondom minstens 4 px vrij van de celrand en de gekozen-rand`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: 1230 });
    await openMetMaand(page, '2026-11') /* de maand van de vaste klok; was de UTC-maand via toISOString (R4-17) */;
    await wachtOpRust(page);
    const m = await page.locator('.mk__dag.is-vandaag').evaluate((dag) => {
      const c = dag.getBoundingClientRect();
      const nr = dag.querySelector('.mk__nr').getBoundingClientRect();
      const x = nr.left + nr.width / 2;
      const y = nr.top + nr.height / 2;
      const rand = dag.classList.contains('is-gekozen') ? 2 : 1;
      return { links: x - 13 - c.left - rand, boven: y - 13 - c.top - rand, rechts: c.right - rand - (x + 13), onder: c.bottom - rand - (y + 13), gekozen: dag.classList.contains('is-gekozen') };
    });
    const tekst = JSON.stringify(m);
    expect(m.gekozen, tekst).toBe(true);
    for (const k of ['links', 'boven', 'rechts', 'onder']) expect(m[k], `${k}: ${tekst}`).toBeGreaterThanOrEqual(4);
  });
}

// BESLISSING 330: de focusring van "Afvinken" in het paneel van de dag wordt niet afgesneden door de overflow van de inhoud (4 px binnenmarge,
// 4 px negatieve buitenmarge), en de kaart en haar inhoud staan op dezelfde plaats als zonder die marge.
test('Maand (330): de focusring van "Afvinken" in het paneel is niet afgesneden en de indeling van het paneel is ongewijzigd', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dagboek__kop')).toBeVisible();
  const nu = await page.evaluate(() => {
    const d = new Date();
    const t2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
  });
  await page.evaluate(
    (start) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen', 'momentinnames'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          tx.objectStore('supplementen').add({ id: 1, naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    nu,
  );
  await page.goto('./#/dagboek/maand');
  await page.reload();
  const paneel = page.locator('.maand__paneel');
  await expect(paneel).toContainText('een halve ampule');
  await wachtOpRust(page);
  const knop = paneel.getByRole('button', { name: 'Afvinken' });
  await page.keyboard.press('Tab');
  await knop.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(knop).toBeFocused();
  const m = await page.evaluate(() => {
    const knop = document.activeElement;
    const kr = knop.getBoundingClientRect();
    const ring = parseFloat(getComputedStyle(knop).outlineOffset) + parseFloat(getComputedStyle(knop).outlineWidth);
    const buiten = { links: kr.left - ring, boven: kr.top - ring, rechts: kr.right + ring, onder: kr.bottom + ring };
    // elke houder met overflow tussen de knop en het paneel moet de ring (met zijn offset) binnen zijn rand laten
    let afgesneden = [];
    for (let p = knop.parentElement; p && !p.classList.contains('kaart'); p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(s.overflowX + s.overflowY)) {
        const r = p.getBoundingClientRect();
        if (buiten.links < r.left - 0.5 || buiten.rechts > r.right + 0.5 || buiten.boven < r.top - 0.5 || buiten.onder > r.bottom + 0.5) afgesneden.push(p.className);
      }
    }
    const inhoud = document.querySelector('.maand__paneelinhoud');
    const ir = inhoud.getBoundingClientRect();
    const eerste = inhoud.firstElementChild.getBoundingClientRect();
    return { afgesneden, stijl: getComputedStyle(knop).outlineStyle, randLinks: Math.round(eerste.left - ir.left) };
  });
  expect(m.stijl).not.toBe('none');
  expect(m.afgesneden, 'houders die de focusring afsnijden').toEqual([]);
  expect(m.randLinks, 'de inhoud begint 4 px binnen de rand van de houder (de binnenmarge)').toBe(4);
});

// BESLISSING 666 (vervangt 658, vakjes van 64 bij 60): de vakjes zijn vierkant in elke weergave en in maanden van zes, vijf en vier weken (november 2026,
// december 2026, februari 2027). De ene uitzondering: een tikvlak is minstens 44 px hoog (BESLISSING 524), dus op telefoons smaller dan 390 px is een vakje
// smaller dan hoog (34,9 bij 44 op 320, 40,6 bij 44 op 360). Waar de kalender en de dagkaart naast elkaar staan, zijn ze even breed, eindigen ze op dezelfde
// onderlijn en eindigt de dagkaart op de rechterrand van de cijferkaart. De kalender is in elke maand even hoog (zes weken gereserveerd, BESLISSING 272) en
// buiten de lege rijen van een korte maand heeft geen kaart een leeg vlak van meer dan 32 px.
for (const [breedte, hoogte] of [[320, 480], [360, 560], [390, 660], [390, 844], [445, 580], [820, 1180], [1100, 900], [1150, 900], [1179, 900], [1180, 820], [1280, 800], [1440, 900], [1690, 1230]]) {
  test(`Maand op ${breedte}x${hoogte}: vierkante vakjes, even brede kolommen en een kalender van vaste hoogte in maanden van zes, vijf en vier weken`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await openMetMaand(page, '2026-11');
    let kalHoogte = null;
    for (const [maand, weken] of [['2026-11', 6], ['2026-12', 5], ['2027-02', 4]]) {
      await page.goto(`./#/dagboek/maand/${maand}-10`);
      await expect(page.locator(`.mk__dag[data-datum="${maand}-10"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.mk__week:not(.mk__kop)')).toHaveCount(weken);
      await wachtOpRust(page);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s)?.getBoundingClientRect();
        const vakken = [...document.querySelectorAll('.mk__dag')].map((e) => e.getBoundingClientRect()).map((b) => [b.width, b.height]);
        const weken = document.querySelectorAll('.mk__week:not(.mk__kop)');
        return { vakken, kal: r('.maand__kalkaart'), mk: r('.mk'), dag: r('.maand__paneel'), cijfers: r('.maand__cijferkaart'), leeg: r('.mk').bottom - weken[weken.length - 1].getBoundingClientRect().bottom, scroll: document.documentElement.scrollWidth };
      });
      const tekst = `${maand}: ${JSON.stringify({ vak: m.vakken[0], kal: m.kal, dag: m.dag })}`;
      expect(m.scroll, tekst).toBeLessThanOrEqual(breedte);
      for (const [b, h] of m.vakken) {
        if (b < 44) expect(Math.abs(h - 44), `uitzondering 524: vakje ${b} bij ${h}`).toBeLessThanOrEqual(1);
        else expect(Math.abs(b - h), `vierkant: vakje ${b} bij ${h}`).toBeLessThanOrEqual(1);
      }
      if (breedte < 390) expect(m.vakken[0][0], 'alleen onder 390 px is een vakje smaller dan 44 px').toBeLessThan(44);
      else expect(m.vakken[0][0]).toBeGreaterThanOrEqual(44);
      // de kalender is in elke maand even hoog; de ontbrekende weken blijven leeg onderaan
      kalHoogte ??= m.kal.height;
      expect(Math.abs(m.kal.height - kalHoogte), `de kalender is in elke maand even hoog: ${tekst}`).toBeLessThanOrEqual(1);
      expect(Math.abs(m.leeg - (6 - weken) * (m.vakken[0][1] + 4)), tekst).toBeLessThanOrEqual(1);
      const naast = Math.abs(m.kal.top - m.dag.top) <= 1;
      // BESLISSING 692: tot 1099 px staan kalender en dagkaart onder elkaar, vanaf 1100 px naast elkaar
      expect(naast, tekst).toBe(breedte >= 1100);
      if (naast) {
        expect(Math.abs(m.kal.width - m.dag.width), `even brede kolommen: ${tekst}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.kal.bottom - m.dag.bottom), `dezelfde onderlijn: ${tekst}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.dag.right - m.cijfers.right), `de dagkaart eindigt op de rechterrand van de cijferkaart: ${tekst}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.dag.left - m.kal.right - 16), 'de gewone tussenruimte van 16 px').toBeLessThanOrEqual(1);
      }
      const legVrij = (await page.evaluate(legeRuimte))[1];
      for (const k of await meetKaarten(page, '.maand__kolommen')) {
        // BESLISSING 688: vanaf 1440 px telt de vrije ruimte onderaan de dagkaart (boven "Dag openen") niet mee, de ruimte tussen de blokken wel (0)
        const pr = breedte >= 1440 ? await page.evaluate(paneelRuimte) : { tussen: 0, onder: 0 };
        expect(pr.tussen, 'geen ruimte tussen de blokken van de dagkaart').toBeLessThanOrEqual(1);
        const gat = k.gat - (k.naam === 'maand__kalkaart' ? Math.max(m.leeg, legVrij) : k.naam === 'maand__paneel' ? pr.onder : 0);
        expect(gat, `${maand}: ${k.naam} heeft buiten de lege weken een leeg vlak van ${Math.round(gat)} px`).toBeLessThanOrEqual(32);
      }
    }
  });
}
