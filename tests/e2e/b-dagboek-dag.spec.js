// Dagboek · Dag (BESLISSING 260, 264, 267): geen lege witruimte, Drinken en Supplementen op twee lijnen, Stemming en energie als op het hoofdscherm,
// de Notitie ernaast op dezelfde lijnen. Verzonnen gegevens.
import { test, expect } from '@playwright/test';
import { vul, meetKaarten } from './leeg-vlak.js';
import { maaltijdblad, wachtOpRust, wachtTotStil, wachtTotWaar } from './r-wacht.js';
import { vasteKlok } from './vaste-klok.js';

const lokaleDatum = (page) =>
  page.evaluate(() => {
    const d = new Date();
    const t2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${t2(d.getMonth() + 1)}-${t2(d.getDate())}`;
  });

// Drie supplementen (ochtend, middag, avond) met twee afgevinkte momenten, eventueel een geplande spuit en een notitie.
async function vulExtra(page, { supplementen = false, spuit = false, notitie = '', lang = false } = {}) {
  const vandaag = await lokaleDatum(page);
  await page.evaluate(
    ([dag, metSupp, metSpuit, tekst, langTekst]) =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'supplementen', 'momentinnames', 'dagen'], 'readwrite');
          tx.objectStore('supplementen').clear();
          tx.objectStore('momentinnames').clear();
          if (langTekst) {
            const lees = tx.objectStore('maaltijden').getAll();
            lees.onsuccess = () => lees.result.forEach((m) => tx.objectStore('maaltijden').put({ ...m, tekst: 'Pasta met groenten, kaas en een grote kom tomatensaus en daarna nog een stuk fruit en een glas melk voor het slapengaan' }));
          }
          if (metSupp) {
            ['ochtend', 'middag', 'avond'].forEach((m, i) => tx.objectStore('supplementen').add({ naam: 'Testmiddel ' + m, dosis: '', hoeveelheid: '', aanwijzing: '', momenten: [m], ritme: { soort: 'dagelijks' }, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1 }));
            [1, 2].forEach((id, i) => tx.objectStore('momentinnames').add({ datum: dag, supplementId: id, moment: ['ochtend', 'middag'][i], tijdstip: Date.now(), voorbeeld: false }));
          }
          if (metSpuit) tx.objectStore('supplementen').add({ naam: 'Testspuit', dosis: '', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'interval', dagen: 14, start: dag }, volgorde: 9, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          if (tekst) tx.objectStore('dagen').put({ datum: dag, stemming: 4, energie: 3, notitie: tekst, gewijzigdOp: Date.now() });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
    [vandaag, supplementen, spuit, notitie, lang],
  );
  await page.reload();
}

async function opbouw(page, breedte, hoogte, c) {
  await page.setViewportSize({ width: breedte, height: hoogte });
  await page.goto('./#/dagboek');
  await expect(page.locator('.dag__eten')).toBeVisible();
  await vul(page, { dranken: c.dranken, maaltijden: c.maaltijden });
  await vulExtra(page, c);
  await expect(page.locator('.dag__eten')).toBeVisible();
  await page.waitForTimeout(1300); // de kaarten komen zacht op
}

// De kaarten van de twee kolommen op een breed scherm, van boven naar onder, met hun naam, boven- en onderkant.
const kolommen = async (page) => {
  await page.waitForLoadState('load');
  await page.locator('.dag__raster:not(.is-meet) .dag__notitie').waitFor();
  // wacht tot de kaarten stilstaan (de opkomst-animatie en een late meting van de kolommen zijn dan klaar)
  return wachtTotStil(page, () => meetKolommen(page));
};

// Staat de notitie (de tekst, of '' voor "geen notitie") in de database? De notitie bewaart bij het verlaten van het vak.
const notitieBewaard = (page, tekst) =>
  wachtTotWaar(
    page,
    (t) =>
      new Promise((klaar) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => klaar(false);
        open.onsuccess = () => {
          const v = open.result.transaction('dagen').objectStore('dagen').getAll();
          v.onsuccess = () => {
            open.result.close();
            const notities = v.result.map((d) => d.notitie ?? '').filter(Boolean);
            klaar(t ? notities.includes(t) : notities.length === 0);
          };
          v.onerror = () => klaar(false);
        };
      }),
    tekst,
  );
const meetKolommen = (page) =>
  page.evaluate(() => {
    const kaarten = ['eten', 'drinken', 'supplementen', 'notitie'].map((naam) => { const b = document.querySelector('.dag__' + naam).getBoundingClientRect(); return { naam, links: b.left, top: b.top, bottom: b.bottom }; });
    const midden = document.querySelector('.dag__stemming').getBoundingClientRect().left + document.querySelector('.dag__stemming').getBoundingClientRect().width / 2;
    const van = (links) => kaarten.filter((k) => (k.links < midden) === links).sort((a, b) => a.top - b.top);
    return { links: van(true), rechts: van(false) };
  });

const LANG = 'Een lange notitie over een rustige dag met veel gedachten. '.repeat(30);
const COMBINATIES = [
  { naam: 'leeg', dranken: 0, maaltijden: 0, supplementen: false, spuit: false, notitie: '' },
  { naam: '5 maaltijden, 5 dranken van vijf soorten, 3 momenten, zonder spuit, lege notitie', dranken: 5, maaltijden: 5, supplementen: true, spuit: false, notitie: '', gelijk: true },
  { naam: '5 maaltijden, 10 dranken van vijf soorten, 3 momenten', dranken: 10, maaltijden: 5, supplementen: true, spuit: false, notitie: '' },
  { naam: '5 maaltijden, 10 dranken van vijf soorten, 3 momenten en spuit', dranken: 10, maaltijden: 5, supplementen: true, spuit: true, notitie: 'Kort.' },
  { naam: '3 maaltijden, 3 dranken, 3 momenten', dranken: 3, maaltijden: 3, supplementen: true, spuit: false, notitie: 'Kort.' },
  { naam: '6 maaltijden, 15 dranken, momenten en spuit, lange notitie', dranken: 15, maaltijden: 6, supplementen: true, spuit: true, notitie: LANG },
  { naam: '6 lange maaltijden, 15 dranken, zonder spuit', dranken: 15, maaltijden: 6, supplementen: true, spuit: false, notitie: '', lang: true },
];

for (const [breedte, hoogte] of [[1690, 1230], [1720, 950]]) {
  for (const c of COMBINATIES) {
    test(`Dag ${breedte}x${hoogte} (${c.naam}): compacte rijen, geen leeg vlak, twee kolommen die gelijk eindigen`, async ({ page }) => {
      await opbouw(page, breedte, hoogte, c);
      const rijen = await page.locator('.dag__eten .maaltijd').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(rijen).toHaveLength(6);
      for (const r of rijen) expect(r, 'een maaltijdrij is hoger dan 70 px').toBeLessThanOrEqual(70);
      for (const k of await meetKaarten(page, '.dag__raster')) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { eten: r('.dag__eten'), drinken: r('.dag__drinken'), supp: r('.dag__supplementen'), stemming: r('.dag__stemming'), notitie: r('.dag__notitie') };
      });
      // Twee kolommen (BESLISSING 299): Eten staat linksboven, Drinken of Supplementen rechtsboven, de Notitie vult de kortste kolom; Stemming en energie eronder over de volle breedte
      const kol = await kolommen(page);
      expect(Math.abs(kol.links[0].top - kol.rechts[0].top)).toBeLessThanOrEqual(1);
      expect(kol.links[0].naam).toBe('eten');
      expect(m.stemming.top).toBeGreaterThanOrEqual(Math.max(kol.links.at(-1).bottom, kol.rechts.at(-1).bottom) - 1);
      expect(m.stemming.width, 'Stemming en energie staat niet over de volle breedte').toBeGreaterThan(m.eten.width * 1.9);
      // geen strook pagina-achtergrond hoger dan 40 px tussen twee kaarten in dezelfde kolom, en niet tussen de kolommen en Stemming en energie
      for (const kolom of [kol.links, kol.rechts]) kolom.slice(1).forEach((k, i) => expect(k.top - kolom[i].bottom, `strook boven ${k.naam}`).toBeLessThanOrEqual(40));
      expect(m.stemming.top - Math.max(kol.links.at(-1).bottom, kol.rechts.at(-1).bottom), 'strook boven Stemming en energie').toBeLessThanOrEqual(40);
      // de onderkanten van de twee kolommen liggen gelijk zolang de Notitie boven haar minimum zit
      const vak = await page.evaluate(() => {
        const k = document.querySelector('.dag__notitie').getBoundingClientRect();
        const v = document.querySelector('.dag__notitie textarea').getBoundingClientRect();
        return { onder: k.bottom - v.bottom, hoogte: v.height };
      });
      expect(vak.onder, 'het tekstvak vult de kaart niet').toBeLessThanOrEqual(32);
      if (c.gelijk) expect(vak.hoogte, 'de Notitie zit op haar minimum terwijl de kolommen gelijk moeten eindigen').toBeGreaterThan(98);
      const verschil = Math.abs(kol.links.at(-1).bottom - kol.rechts.at(-1).bottom);
      expect(verschil, vak.hoogte > 98 ? 'de twee kolommen eindigen niet gelijk' : 'de Notitie zit op haar minimum en de kolommen eindigen meer dan 12 px uit elkaar').toBeLessThanOrEqual(vak.hoogte > 98 ? 2 : 12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}

for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844], [360, 780]]) {
  test(`Dag ${breedte}: Drinken en Supplementen staan op twee lijnen, de vinkvakken op de rechterbinnenrand`, async ({ page }) => {
    await opbouw(page, breedte, hoogte, { dranken: 15, maaltijden: 3, supplementen: true, spuit: true });
    await expect(page.locator('.dag__drinken .dagdranklijst__rij')).toHaveCount(6);
    const m = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const binnen = (k) => { const b = r(k); const s = getComputedStyle(k); return { l: b.left + parseFloat(s.paddingLeft), r: b.right - parseFloat(s.paddingRight) }; };
      const links = (k, sel) => [...k.querySelectorAll(sel)].map((e) => r(e).left);
      const rechts = (k, sel) => [...k.querySelectorAll(sel)].map((e) => r(e).right);
      const dr = document.querySelector('.dag__drinken'); const su = document.querySelector('.dag__supplementen');
      // BESLISSING 384: de eerste en laatste dranktegel staan niet meer op de binnenrand; elk icoon staat boven zijn eigen naam (zie r-telefoon.spec.js)
      return {
        dr: binnen(dr), su: binnen(su),
        drL: [...links(dr, '.kaartkop .tegel'), ...links(dr, '.drinkbaan'), ...links(dr, '.dagdranklijst__rij .tegel')],
        drR: [...rechts(dr, '.kaartkop__eind'), ...rechts(dr, '.drinkbaan'), ...rechts(dr, '.drank__weg path')],
        suL: [...links(su, '.kaartkop .tegel'), ...links(su, '.momentrij .tegel')],
        suR: [...rechts(su, '.kaartkop__eind svg'), ...rechts(su, '.vinkvak__vak')],
        vinkX: [...su.querySelectorAll('.vinkvak__vak')].map((e) => r(e).left),
        vinkAantal: su.querySelectorAll('.momentrij').length,
      };
    });
    for (const [lijst, rand] of [[m.drL, m.dr.l], [m.drR, m.dr.r], [m.suL, m.su.l], [m.suR, m.su.r]]) {
      expect(lijst.length).toBeGreaterThan(0);
      for (const x of lijst) expect(Math.abs(x - rand), `${x} ligt niet op de binnenrand ${rand}`).toBeLessThanOrEqual(1);
    }
    expect(m.vinkAantal).toBe(4); // drie momenten en de spuit
    for (const x of m.vinkX) expect(Math.abs(x - m.vinkX[0])).toBeLessThanOrEqual(1);
    // de zes dranktegels liggen op gelijke afstand en overlappen elkaar niet
    const xs = await page.locator('.dag__drinken .dagdrank .tegel').evaluateAll((els) => { const top = els[0].getBoundingClientRect().top; return els.filter((e) => Math.abs(e.getBoundingClientRect().top - top) < 2).map((e) => { const b = e.getBoundingClientRect(); return (b.left + b.right) / 2; }); }); // op de telefoon twee rijen van drie: de eerste rij
    const stappen = xs.slice(1).map((x, i) => x - xs[i]);
    for (const s of stappen) expect(Math.abs(s - stappen[0])).toBeLessThanOrEqual(5);
    // de labels van de dranktegels overlappen elkaar niet
    const labels = await page.locator('.dag__drinken .dagdrank__naam').evaluateAll((els) => els.map((e) => { const rg = document.createRange(); rg.selectNodeContents(e); const b = rg.getBoundingClientRect(); return [b.left, b.right, Math.round(b.top)]; }));
    for (let i = 1; i < labels.length; i += 1) if (labels[i][2] === labels[i - 1][2]) expect(labels[i][0], `label ${i} overlapt het vorige`).toBeGreaterThanOrEqual(labels[i - 1][1] - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Dag: de weghaal-knop is een tikvlak van 44 px en overlapt geen tekst; dranken toevoegen en weghalen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await page.goto('./#/dagboek');
  const drinken = page.getByRole('region', { name: 'Drinken' });
  await expect(drinken).toContainText('0 l van 2,5 l');
  for (let i = 0; i < 4; i += 1) await drinken.locator('.dagdrank[data-soort="water"]').click();
  await drinken.locator('.dagdrank[data-soort="thee"]').click();
  const water = drinken.locator('.dagdranklijst__rij[data-soort="water"]');
  await expect(water).toContainText('4x ·');
  const meet = await water.evaluate((rij) => {
    const knop = rij.querySelector('.drank__weg').getBoundingClientRect();
    const kaart = rij.closest('.kaart').getBoundingClientRect();
    const teksten = [...rij.querySelectorAll('.dagdranklijst__naam, .dagdranklijst__stand, .tegel')].map((e) => e.getBoundingClientRect());
    return { w: knop.width, h: knop.height, binnen: knop.left >= kaart.left && knop.right <= kaart.right, snijdt: teksten.some((t) => t.left < knop.right && t.right > knop.left && t.top < knop.bottom && t.bottom > knop.top) };
  });
  expect(meet.w).toBeGreaterThanOrEqual(44);
  expect(meet.h).toBeGreaterThanOrEqual(44);
  expect(meet.binnen).toBe(true);
  expect(meet.snijdt).toBe(false);
  for (let over = 3; over >= 0; over -= 1) {
    await drinken.getByRole('button', { name: 'Eén water weghalen' }).click();
    if (over > 0) await expect(water).toContainText(`${over}x ·`);
  }
  await expect(drinken.locator('.dagdranklijst__rij[data-soort="water"]')).toHaveCount(0);
  await expect(drinken.locator('.dagdranklijst__rij[data-soort="thee"]')).toHaveCount(1);
});

test('Dag: gezichtjes en blaadjes staan op dezelfde vijf x-posities; stemming, energie en notitie blijven na herladen', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await opbouw(page, 1690, 1230, { dranken: 0, maaltijden: 0 });
  const centra = (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return (b.left + b.right) / 2; }));
  const centraY = (sel) => page.locator(sel).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; }));
  const gez = await centra('.dag__stemming .stemming__vraag .gevoel__optie');
  const bla = await centra('.dag__stemming .vandaag__energie .energie__tik');
  expect(gez).toHaveLength(5);
  expect(bla).toHaveLength(5);
  // naast elkaar: eerst de vijf gezichtjes, dan de vijf blaadjes, op dezelfde horizontale lijn en elk in een eigen raster van vijf gelijke kolommen
  expect(Math.max(...gez)).toBeLessThan(Math.min(...bla));
  const gezY = await centraY('.dag__stemming .stemming__vraag .gevoel__optie');
  const blaY = await centraY('.dag__stemming .vandaag__energie .energie__tik');
  gezY.forEach((y, i) => expect(Math.abs(y - blaY[i])).toBeLessThanOrEqual(2));
  for (const rij of [gez, bla]) {
    const st = rij.slice(1).map((x, i) => x - rij[i]);
    st.forEach((s) => expect(Math.abs(s - st[0])).toBeLessThanOrEqual(1));
  }
  const stemH = await page.evaluate(() => document.querySelector('.dag__stemming').getBoundingClientRect().height);
  expect(stemH).toBeLessThanOrEqual(260);
  // de keuzes zijn gelijke tegels die hun helft vullen: de tussenruimte is nooit groter dan een tegel, de eerste en laatste staan op de binnenrand van de helft
  for (const sel of ['.dag__stemming .stemming__vraag .gevoel__optie', '.dag__stemming .vandaag__energie .energie__tik']) {
    const dozen = await page.locator(sel).evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.right, b.width]; }));
    expect(dozen[0][2]).toBeGreaterThanOrEqual(56);
    for (let i = 1; i < dozen.length; i += 1) {
      expect(dozen[i][0] - dozen[i - 1][1], 'tussenruimte tussen twee keuzetegels').toBeLessThanOrEqual(dozen[i][2]);
      expect(Math.abs(dozen[i][2] - dozen[0][2])).toBeLessThanOrEqual(1);
    }
  }
  const deel = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const o = [...document.querySelectorAll('.dag__stemming .stemming__vraag .gevoel__optie')].map((e) => e.getBoundingClientRect());
    const b = [...document.querySelectorAll('.dag__stemming .vandaag__energie .energie__tik')].map((e) => e.getBoundingClientRect());
    return { v: r('.dag__stemming .stemming__vraag'), e: r('.dag__stemming .vandaag__energie'), o, b };
  });
  expect(Math.abs(deel.o[0].left - deel.v.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(deel.o[4].right - deel.v.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(deel.b[0].left - deel.e.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(deel.b[4].right - deel.e.right)).toBeLessThanOrEqual(1);
  // het hintje is de laatste regel van de kaart
  const hint = await page.evaluate(() => { const k = document.querySelector('.dag__stemming'); return k.lastElementChild.querySelector('.dag__wis') !== null || k.querySelector('.stemming__inhoud').lastElementChild.classList.contains('dag__wis'); });
  expect(hint).toBe(true);
  await page.locator('.dag__stemming .gevoel__optie[data-stap="4"]').click();
  await page.locator('.dag__stemming .energie__tik').nth(1).click();
  await expect(page.locator('.dag__stemming .energie__tik[aria-checked="true"]')).toHaveAttribute('aria-label', 'rustig'); // BESLISSING 468: de keuze via aria-checked
  await page.locator('.dag__notitie textarea').fill('rustige dag');
  await page.locator('.dag__notitie textarea').blur();
  await notitieBewaard(page, 'rustige dag');
  await page.reload();
  await expect(page.locator('.dag__stemming .gevoel__optie[data-stap="4"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.dag__stemming .energie__tik[aria-checked="true"]')).toHaveAttribute('aria-label', 'rustig'); // BESLISSING 468: de keuze via aria-checked
  await expect(page.locator('.dag__notitie textarea')).toHaveValue('rustige dag');
});

test('Dag: momenten en de spuit vink je af en weer uit (momenten), de data-uitleg-haken staan er', async ({ page }) => {
  await opbouw(page, 1690, 1230, { dranken: 0, maaltijden: 0, supplementen: true, spuit: true });
  const supp = page.getByRole('region', { name: 'Supplementen' });
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toContainText('vanaf 17 uur');
  await supp.locator('.momentrij[data-moment="avond"]').click();
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toHaveAttribute('aria-checked', 'true');
  await expect(supp.locator('.kaartkop__eind')).toContainText('3 van 3');
  await supp.locator('.momentrij[data-moment="avond"]').click();
  await expect(supp.locator('.momentrij[data-moment="avond"]')).toHaveAttribute('aria-checked', 'false');
  const spuit = supp.getByRole('checkbox', { name: /Afvinken: Testspuit/ });
  await expect(spuit).toContainText('Testspuit');
  await spuit.click();
  await expect(supp.locator('.dag__spuit')).toContainText('Afgevinkt');
  for (const naam of ['dag-stand', 'dag-drinken', 'dag-supplementen', 'dag-stemming', 'dag-notitie']) await expect(page.locator(`.dag [data-uitleg="${naam}"]`)).toHaveCount(1);
});

for (const [breedte, hoogte] of [[390, 844], [360, 780]]) {
  test(`Dag ${breedte}: één kolom in vaste volgorde, compact en zonder horizontale scroll`, async ({ page }) => {
    await opbouw(page, breedte, hoogte, { dranken: 15, maaltijden: 6, supplementen: true, spuit: true, notitie: LANG, lang: true });
    const rijen = await page.locator('.dag__eten .maaltijd').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const r of rijen) expect(r).toBeLessThanOrEqual(70);
    const volgorde = await page.evaluate(() => ['.dag__eten', '.dag__drinken', '.dag__supplementen', '.dag__stemming', '.dag__notitie'].map((s) => document.querySelector(s).getBoundingClientRect().top));
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde);
    for (const k of await meetKaarten(page, '.dag__raster')) expect(k.gat, `${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`).toBeLessThanOrEqual(32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

// BESLISSING 299: de Notitie vult de kortste kolom; de twee kolommen eindigen gelijk, voor elke vulling van de dag.
for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1280, 800]]) {
  test(`Dag ${breedte}x${hoogte}: raster van vullingen, de Notitie vult de kortste kolom en de kolommen eindigen gelijk`, async ({ page }) => {
    test.setTimeout(900000);
    await page.setViewportSize({ width: breedte, height: hoogte });
    await page.goto('./#/dagboek');
    await expect(page.locator('.dag__eten')).toBeVisible();
    const fouten = [];
    for (const dranken of [0, 1, 3, 6]) {
      for (const maaltijden of [0, 3, 6]) {
        for (const supp of ['geen', 'momenten', 'spuit']) {
          for (const lang of [false, true]) {
            const naam = `${dranken} soorten dranken, ${maaltijden} maaltijden, supplementen ${supp}, ${lang ? 'lange' : 'lege'} notitie`;
            for (let poging = 0; ; poging += 1) {
              try {
                await vul(page, { dranken, maaltijden });
                await vulExtra(page, { supplementen: supp !== 'geen', spuit: supp === 'spuit', notitie: lang ? LANG : '' });
                break;
              } catch (fout) {
                if (poging >= 2 || !/destroyed/.test(String(fout))) throw fout;
                await page.waitForLoadState('load');
                await page.waitForTimeout(1500);
              }
            }
            await page.waitForLoadState('load');
            await expect(page.locator('.dag__raster:not(.is-meet) .dag__notitie')).toBeVisible();
            // Een late herlaad van de dev-server (ander werk aan de bronbestanden) mag de meting niet breken: dan opnieuw.
            const herhaal = async (fn) => {
              for (let poging = 0; ; poging += 1) {
                try { return await fn(); } catch (fout) {
                  if (poging >= 2 || !/destroyed|Cannot read/.test(String(fout))) throw fout;
                  await page.waitForLoadState('load');
                  await page.waitForTimeout(1500);
                }
              }
            };
            const kol = await herhaal(() => kolommen(page));
            const stem = await herhaal(() => page.evaluate(() => document.querySelector('.dag__stemming').getBoundingClientRect().top));
            const vakH = await herhaal(() => page.evaluate(() => document.querySelector('.dag__notitie textarea').getBoundingClientRect().height));
            const eind = (kolom) => kolom.at(-1).bottom;
            const hoogteZonder = (kolom) => { const rest = kolom.filter((k) => k.naam !== 'notitie'); return rest.length ? rest.at(-1).bottom - rest[0].top : 0; };
            const metNotitie = kol.links.some((k) => k.naam === 'notitie') ? 'links' : 'rechts';
            const verschil = Math.abs(eind(kol.links) - eind(kol.rechts));
            if (verschil > (vakH > 98 ? 2 : 12)) fouten.push(`${naam}: kolommen ${Math.round(verschil)} px uit elkaar (tekstvak ${Math.round(vakH)} px)`);
            const eigen = hoogteZonder(metNotitie === 'links' ? kol.links : kol.rechts);
            const andere = hoogteZonder(metNotitie === 'links' ? kol.rechts : kol.links);
            if (eigen > andere + 1) fouten.push(`${naam}: de Notitie staat in de langste kolom (${Math.round(eigen)} tegen ${Math.round(andere)} px)`);
            for (const kolom of [kol.links, kol.rechts]) kolom.slice(1).forEach((k, i) => { if (k.top - kolom[i].bottom > 40) fouten.push(`${naam}: strook van ${Math.round(k.top - kolom[i].bottom)} px boven ${k.naam}`); });
            if (stem - Math.max(eind(kol.links), eind(kol.rechts)) > 40) fouten.push(`${naam}: strook boven Stemming en energie`);
            for (const k of await herhaal(() => meetKaarten(page, '.dag__raster'))) if (k.gat > 32.5) fouten.push(`${naam}: ${k.naam} heeft een leeg vlak van ${Math.round(k.gat)} px`);
            const rijen = await herhaal(() => page.locator('.dag__eten .maaltijd, .dag__momenten .momentrij').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height)));
            if (rijen.some((r) => r > 76)) fouten.push(`${naam}: een rij is uitgerekt tot ${Math.round(Math.max(...rijen))} px`);
          }
        }
      }
    }
    expect(fouten).toEqual([]);
  });
}

test('Dag: de Notitie verspringt niet en het tekstvak houdt focus en tekst terwijl je typt en het venster verandert', async ({ page }) => {
  await opbouw(page, 1690, 1230, { dranken: 0, maaltijden: 0, supplementen: true });
  const vak = page.locator('.dag__notitie textarea');
  await vak.click();
  await vak.pressSequentially('even typen');
  const voor = await page.evaluate(() => document.querySelector('.dag__notitie').parentElement.className);
  await page.setViewportSize({ width: 1380, height: 1000 });
  // de indeling past zich aan het nieuwe venster aan (of wacht ermee zolang het vak focus heeft): wacht tot ze stilstaat
  await wachtTotStil(page, () => page.evaluate(() => [document.querySelector('.dag__notitie').parentElement.className, JSON.stringify(document.querySelector('.dag__notitie').getBoundingClientRect())]));
  await expect(vak).toBeFocused();
  await expect(vak).toHaveValue('even typen');
  expect(await page.evaluate(() => document.querySelector('.dag__notitie').parentElement.className)).toBe(voor);
  await vak.pressSequentially(' verder');
  await expect(vak).toHaveValue('even typen verder');
});

// BESLISSING 310: de kaart Notitie groeit niet mee met de tekst; lange tekst scrolt binnen het tekstvak.
test('Dag: de Notitie en alle andere kaarten hebben dezelfde rechthoek bij een lege, korte en zeer lange notitie', async ({ page }) => {
  const lang = Array.from({ length: 40 }, (_, i) => `Regel ${i + 1} van een lange notitie over een rustige dag met veel gedachten en nog wat extra woorden.`).join('\n').padEnd(2000, 'x');
  const meetAlles = () => page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height].map(Math.round); };
    return { kaarten: ['.dag__eten', '.dag__drinken', '.dag__supplementen', '.dag__stemming', '.dag__notitie'].map(r), pagina: document.documentElement.scrollHeight };
  });
  const stabiel = async () => { await wachtOpRust(page); return wachtTotStil(page, meetAlles); };
  for (const [b, h] of [[1690, 1230], [820, 1180], [390, 844]]) {
    await opbouw(page, b, h, { dranken: 3, maaltijden: 3, supplementen: true });
    const vak = page.locator('.dag__notitie textarea');
    const leeg = await stabiel();
    await vak.fill('Kort.');
    await vak.blur();
    const kort = await stabiel();
    await vak.fill(lang);
    await vak.blur();
    const lange = await stabiel();
    for (const m of [kort, lange]) {
      m.kaarten.forEach((k, i) => k.forEach((w, j) => expect(Math.abs(w - leeg.kaarten[i][j]), `${b}: kaart ${i} meting ${j}`).toBeLessThanOrEqual(1)));
      expect(Math.abs(m.pagina - leeg.pagina)).toBeLessThanOrEqual(1);
    }
    expect(await vak.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
    await page.reload();
    await page.locator('.dag__raster:not(.is-meet) .dag__notitie').waitFor();
    const herlaad = await stabiel();
    herlaad.kaarten.forEach((k, i) => k.forEach((w, j) => expect(Math.abs(w - leeg.kaarten[i][j]), `${b} herladen: kaart ${i} meting ${j}`).toBeLessThanOrEqual(1)));
    if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/notitie-${b}.png` });
    await vak.fill('');
    await vak.blur();
    await notitieBewaard(page, ''); // leeg bewaard vóór de volgende opbouw
  }
});

// BESLISSING 330: elk tikdoel op de dag is minstens 44 px hoog (de zes maaltijdrijen en "Alle supplementen van deze dag"), zonder dat de
// kaart Eten hoger wordt (de rij heeft een negatieve marge van 2 px boven en onder, haar inhoud en de kaart blijven staan).
for (const [breedte, hoogte] of [[1690, 1230], [820, 1180], [390, 844]]) {
  test(`Dag (330) ${breedte}: maaltijdrijen en de link naar alle supplementen zijn minstens 44 px hoog, de kaart Eten groeit niet`, async ({ page }) => {
    await opbouw(page, breedte, hoogte, { dranken: 3, maaltijden: 6, supplementen: true });
    await page.locator('.dag__raster:not(.is-meet)').waitFor();
    const m = await page.evaluate(() => {
      const rijen = [...document.querySelectorAll('.dag__eten .maaltijd > .rij')].map((r) => {
        const b = r.getBoundingClientRect();
        const s = getComputedStyle(r);
        // de ruimte die de rij op de indeling inneemt (marge-doos): hoogte min de twee negatieve marges
        return { h: b.height, w: b.width, inDeling: b.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom), inhoud: b.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) };
      });
      const meer = document.querySelector('.dag__meer').getBoundingClientRect();
      const kaart = document.querySelector('.dag__eten').getBoundingClientRect();
      const kop = document.querySelector('.dag__eten .kaartkop').getBoundingClientRect();
      const laatste = [...document.querySelectorAll('.dag__eten .maaltijd')].at(-1).getBoundingClientRect();
      return { rijen, meer: { w: meer.width, h: meer.height }, kaartH: kaart.height, kopOnder: kop.bottom, laatsteOnder: laatste.bottom, kaartOnder: kaart.bottom };
    });
    expect(m.rijen).toHaveLength(6);
    for (const r of m.rijen) {
      expect(r.h, 'hoogte van een maaltijdrij').toBeGreaterThanOrEqual(43.5);
      expect(r.w, 'breedte van een maaltijdrij').toBeGreaterThanOrEqual(43.5);
      expect(Math.abs(r.inDeling - r.inhoud), 'de rij neemt op de indeling haar inhoud in (marge en binnenmarge heffen elkaar op)').toBeLessThanOrEqual(0.5);
    }
    expect(m.meer.h, 'hoogte van "Alle supplementen van deze dag"').toBeGreaterThanOrEqual(43.5);
    expect(m.meer.w).toBeGreaterThanOrEqual(43.5);
    // de laatste maaltijd eindigt op de binnenrand van de kaart: de rij zelf (44 px) steekt hoogstens 2 px uit in de binnenmarge van de kaart
    expect(m.kaartOnder - m.laatsteOnder).toBeGreaterThanOrEqual(0);
  });
}

// BESLISSING 419 ("Overal: ook telefoon en Dagboek"): met het maaltijdblad open zijn de kaarten Eten, Drinken en Notitie (en alle andere kaarten
// van de dag) EXACT even hoog als met het blad dicht. Een dag in een maand van zes (november 2026), vijf (december 2026) en vier weken (februari 2027);
// de klok staat erna (maart 2027), zodat de drie dagen geen toekomst zijn en de rijen een blad openen.
for (const [breedte, hoogte, telefoon] of [[1690, 1230, false], [1280, 800, false], [820, 1180, true], [390, 844, true]]) {
  test.describe(`Dag ${breedte}x${hoogte} met een open maaltijdblad`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, isMobile: telefoon && breedte < 600, hasTouch: telefoon });
    test(`Dag ${breedte}x${hoogte}: met een open maaltijdblad zijn Eten, Drinken en Notitie exact even hoog als zonder (maanden van 6, 5 en 4 weken)`, async ({ page }) => {
      await vasteKlok(page, { datum: '2027-03-01' });
      const meet = () =>
        page.evaluate(() =>
          Object.fromEntries(
            [...document.querySelectorAll('#scherm .dag__raster .kaart')].map((k) => {
              const naam = (k.className.match(/dag__[a-z]+/) ?? ['?'])[0];
              const r = k.getBoundingClientRect();
              return [naam, { h: r.height, b: r.width, onder: r.bottom + scrollY }];
            }),
          ),
        );
      for (const datum of ['2026-11-12', '2026-12-10', '2027-02-11']) {
        await page.goto(`./#/dagboek/dag/${datum}`);
        await page.locator('.dag__raster:not(.is-meet) .dag__notitie').waitFor();
        await wachtOpRust(page);
        const dicht = await wachtTotStil(page, meet);
        for (const k of ['dag__eten', 'dag__drinken', 'dag__notitie']) expect(dicht[k], `${datum}: kaart ${k}`).toBeTruthy();
        await page.locator('.dag__eten .maaltijd[data-soort="middagmaal"] > .rij').click();
        const blad = maaltijdblad(page, 'middagmaal');
        await expect(blad).toBeVisible();
        await wachtOpRust(page); // het blad is helemaal opgekomen
        const open = await wachtTotStil(page, meet);
        expect(open, `${datum}: de kaarten met het blad open tegenover dicht`).toEqual(dicht);
        await blad.getByRole('button', { name: 'Annuleren', exact: true }).click();
        await expect(blad).toHaveCount(0);
      }
    });
  });
}

// BESLISSING 299 en 330: de kaarten wisselen op een breed scherm met een script van kolom; de tabvolgorde moet de zichtbare volgorde volgen
// (kolom voor kolom, van boven naar onder, links eerst; Stemming en energie over de volle breedte als laatste), in elke indeling van de kolommen.
for (const [breedte, hoogte] of [[1280, 800], [1690, 1230]]) {
  for (const c of [{ naam: 'volle dag', opties: { dranken: 15, maaltijden: 6, supplementen: true, spuit: true, lang: true } }, { naam: 'gewone dag', opties: { dranken: 3, maaltijden: 3, supplementen: true } }, { naam: 'lege dag', opties: { dranken: 0, maaltijden: 0 } }]) {
    test(`Dag (330) ${breedte}, ${c.naam}: de tabvolgorde volgt de kolommen die je ziet`, async ({ page }) => {
      await opbouw(page, breedte, hoogte, c.opties);
      await page.locator('.dag__raster:not(.is-meet)').waitFor();
      await page.locator('#scherm').evaluate((e) => e.focus());
      const stops = [];
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
          const e = document.activeElement;
          const kaart = e?.closest?.('.dag__raster .kaart');
          if (!kaart) return e === document.body || !e?.closest?.('#scherm') ? 'buiten' : null;
          const raster = document.querySelector('.dag__raster').getBoundingClientRect();
          const r = e.getBoundingClientRect();
          const k = kaart.getBoundingClientRect();
          const breed = k.width > raster.width * 0.75;
          return { kaart: (kaart.className.match(/dag__(eten|drinken|supplementen|stemming|notitie)/) ?? [])[1], kolom: breed ? 2 : k.left + k.width / 2 < raster.left + raster.width / 2 ? 0 : 1, y: r.top + scrollY };
        });
        if (s === 'buiten' && stops.length) break;
        if (s && s !== 'buiten') stops.push(s);
      }
      expect(stops.length, 'tabstops in het raster').toBeGreaterThan(5);
      // de kolom neemt nooit af (links, rechts, volle breedte) en binnen een kolom neemt de hoogte nooit af
      for (let i = 1; i < stops.length; i++) {
        const a = stops[i - 1];
        const b = stops[i];
        expect(b.kolom, `na ${a.kaart} komt ${b.kaart}: de kolom mag niet teruggaan`).toBeGreaterThanOrEqual(a.kolom);
        if (b.kolom === a.kolom) expect(b.y, `${b.kaart} staat niet hoger dan ${a.kaart}`).toBeGreaterThanOrEqual(a.y - 1);
      }
    });
  }
}
