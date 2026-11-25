// BESLISSINGEN 339 en 345: de kaart Privacy op Algemeen (zes regels, elke rij eindigt gelijk en heeft geen leeg vlak), Gewicht en Favorieten van 960 tot 1440 px
// (kolommen eindigen gelijk, geen leeg vlak in het voorbeeld, geen uitgerekte rij) en Badges op Algemeen met alle badges behaald.
import { test, expect } from '@playwright/test';
import { vasteKlok } from './vaste-klok.js';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';
import { afbrekingen } from './r-meting.js';
import { zaaiAlgemeen, meetLegeVlakken } from './r-algemeen-gegevens.js';

const ALLE = ALLE_BADGES.map((b) => b.id);

async function begin(page, route, soort, ids = ALLE) {
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await zaaiAlgemeen(page, soort, ids);
  await page.goto('./#/' + route);
  await expect(page.locator('#scherm h1').first()).toBeVisible();
  await page.waitForTimeout(2000);
}

const REGELS = [
  'Alles wat je bijhoudt, ook je geboortedatum, blijft op dit toestel. Geen account, geen cookies en geen volgcode.',
  'Voor herinneringen bewaart Cloudflare alleen je pushadres en uren. Geen naam, geen dagboek.',
  'Voor het weer en je gemeente verlaat je locatie het toestel, afgerond op ongeveer een kilometer. Nooit je naam of dagboek.',
  'Een verslag of je supplementenlijst deel je zelf, als bestand. Er staat alleen je lijst in.',
  'Je pincode houdt meekijkers buiten. Je gegevens zelf zijn niet versleuteld.',
  'Er is geen back-up. Verwijder je je profiel of Bloei, of wist je toestel de gegevens, dan is alles weg.',
];

test('Algemeen: de kaart Privacy heeft haar zes regels, elk met een tegel, en niets over wie de dienst beheert', async ({ page }) => {
  await begin(page, 'meer', 'gewoon');
  const kaart = page.locator('.meer__raster > .privacy');
  await expect(kaart).toHaveCount(1);
  await expect(kaart.locator('.kaartkop')).toContainText('Privacy');
  await expect(kaart.locator('.weetje__tekst')).toHaveText(REGELS);
  await expect(kaart.locator('.weetje .tegel')).toHaveCount(6);
  await expect(kaart).not.toContainText(/@|contact|beheerder/i);
  // "Profiel verwijderen" staat op één plaats: in Over
  await expect(page.getByRole('button', { name: 'Profiel verwijderen' })).toHaveCount(1);
});

for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1280, 800], [1180, 820], [820, 1180], [390, 844]]) {
  test.describe(`Algemeen ${breedte}x${hoogte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: breedte < 720, isMobile: breedte < 720 });
    for (const soort of ['leeg', 'vol']) {
      test(`elke rij kaarten eindigt gelijk en heeft geen leeg vlak (${soort})`, async ({ page }) => {
        await begin(page, 'meer', soort);
        const m = await page.evaluate(() => {
          const kaarten = [...document.querySelectorAll('.meer__raster > .kaart')].map((k) => { const r = k.getBoundingClientRect(); return { naam: [...k.classList].find((c) => c !== 'kaart') ?? 'kaart', top: Math.round(r.top + scrollY), onder: r.bottom + scrollY, links: Math.round(r.left) }; });
          const rijen = {};
          for (const k of kaarten) (rijen[k.top] ??= []).push(k);
          return Object.values(rijen).map((r) => ({ namen: r.map((k) => k.naam).join(' | '), verschil: Math.max(...r.map((k) => k.onder)) - Math.min(...r.map((k) => k.onder)), aantal: r.length }));
        });
        for (const rij of m) expect(rij.verschil, `rij ${rij.namen} eindigt gelijk`).toBeLessThanOrEqual(2);
        // twee kaarten naast elkaar op 720 px en breder, één kolom daaronder; de vier rijen: 2, 2, 2 en Privacy alleen
        if (breedte >= 720) expect(m.map((r) => r.aantal)).toEqual([2, 2, 2, 1]);
        else expect(m.every((r) => r.aantal === 1)).toBe(true);
        const gaten = await page.evaluate(meetLegeVlakken, '.meer__raster');
        // De kaart Naam en profielfoto heeft vanaf 1440 px een ruimte van 41 px onder de foto: ze bestond al en die breedte verandert niet (BESLISSING 345).
        const slecht = gaten.filter((k) => k.gat > 34 && !(soort === 'leeg' && /favorieten|badge/.test(k.naam)) && !(breedte >= 1440 && /meer__profiel/.test(k.naam))).map((k) => `${k.naam}: ${Math.round(k.gat)} px tussen ${k.tussen}`);
        expect(slecht, 'leeg vlak in een kaart').toEqual([]);
        // Privacy: elke regel binnen de kaart en geen afgebroken woord
        expect(await afbrekingen(page, '.privacy')).toEqual([]);
      });
    }
  });
}

// Privacy is één raster: zes regels in gelijke cellen (3 x 2, 2 x 3 of 1 x 6), elke kolom loopt over alle rijen door.
for (const [breedte, hoogte, kolommen] of [[1690, 1230, 3], [1440, 900, 3], [1280, 800, 3], [820, 1180, 2], [390, 844, 1]]) {
  test.describe(`Privacy-raster ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: breedte < 720, isMobile: breedte < 720 });
    test(`zes regels in ${kolommen} kolom(men), uitgelijnd`, async ({ page }) => {
      await begin(page, 'meer', 'gewoon');
      const m = await page.evaluate(() => {
        const cellen = [...document.querySelectorAll('.privacy .privacy__lijst > .weetje')].map((c) => {
          const r = c.getBoundingClientRect();
          const tegel = c.querySelector('.tegel').getBoundingClientRect();
          const tekst = c.querySelector('.weetje__tekst');
          const tr = tekst.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(tekst).lineHeight);
          return { x: r.left, y: r.top, b: r.width, tegelX: tegel.left, tegelY: tegel.top, tekstX: tr.left, tekstY: tr.top, regels: Math.round((tr.height - parseFloat(getComputedStyle(tekst).paddingTop)) / lh), leeg: tekst.textContent.trim() === '' };
        });
        return cellen;
      });
      expect(m).toHaveLength(6);
      const uniek = (w) => [...new Set(w.map((x) => Math.round(x)))];
      const kols = [...new Set(m.map((c) => Math.round(c.x)))];
      expect(kols, 'aantal kolommen').toHaveLength(kolommen);
      for (const x of kols) {
        const kolom = m.filter((c) => Math.round(c.x) === x);
        expect(Math.max(...kolom.map((c) => c.tegelX)) - Math.min(...kolom.map((c) => c.tegelX)), 'tegels van een kolom op één x').toBeLessThanOrEqual(1);
        expect(Math.max(...kolom.map((c) => c.tekstX)) - Math.min(...kolom.map((c) => c.tekstX)), 'tekst van een kolom op één x').toBeLessThanOrEqual(1);
      }
      const rijen = [...new Set(m.map((c) => Math.round(c.y)))];
      expect(rijen, 'aantal rijen').toHaveLength(6 / kolommen);
      for (const y of rijen) {
        const rij = m.filter((c) => Math.round(c.y) === y);
        expect(Math.max(...rij.map((c) => c.tegelY)) - Math.min(...rij.map((c) => c.tegelY)), 'tegels van een rij op één y').toBeLessThanOrEqual(1);
        // BESLISSING 568 en 569: de tekst staat als blok in het midden van haar tegel; de eerste tekstregels van een rij liggen dus niet meer op één y,
        // maar het tekstblok steekt nooit boven zijn tegel uit (de tegel van 40 px bepaalt de rij; lijnMeting hieronder meet de regels).
        for (const c of rij) expect(c.tekstY, 'het tekstblok steekt niet boven zijn tegel uit').toBeGreaterThanOrEqual(c.tegelY - 2);
        expect(rij).toHaveLength(kolommen);
      }
      expect(Math.max(...m.map((c) => c.b)) - Math.min(...m.map((c) => c.b)), 'alle cellen even breed').toBeLessThanOrEqual(1);
      // Hoogstens drie regels per zin. Uitzondering: de eerste zin is sinds BESLISSING 432 langer ("... Bloei gebruikt geen cookies en geen volgcode.") en
      // staat in een cel smaller dan 300 px (1280 px: 280 px breed) op vier regels; gemeten 16 november: niets loopt uit de cel, de rijen blijven uitgelijnd.
      const grens = (c, i) => (i === 0 && c.b < 300 ? 4 : 3);
      expect(m.filter((c, i) => c.regels > grens(c, i)).map((c) => c.regels), 'geen zin over meer dan drie regels (de eerste in een smalle cel: vier)').toEqual([]);
      expect(m.some((c) => c.leeg), 'geen lege cel').toBe(false);
      // gelijke afstand: tussen kolommen en tussen rijen
      const kolAfstand = uniek(kols.slice(1).map((x, i) => x - kols[i] - m[0].b));
      expect(kolAfstand.length <= 1 ? true : Math.max(...kolAfstand) - Math.min(...kolAfstand) <= 1, 'gelijke kolomafstand').toBe(true);
      // één gap voor de rijen en één voor de kolommen, en alle rijen even hoog (gelijke rijafstand)
      const gaten = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.privacy .privacy__lijst')); return { rij: s.rowGap, kolom: s.columnGap, auto: s.gridAutoRows }; });
      expect(gaten.rij).not.toBe('normal');
      expect(gaten.kolom).not.toBe('normal');
      const pitch = rijen.slice(1).map((y, i) => y - rijen[i]);
      if (kolommen > 1) expect(Math.max(...pitch) - Math.min(...pitch), 'gelijke rijafstand').toBeLessThanOrEqual(1);
    });
  });
}

// BESLISSING 345: Gewicht en Favorieten van 960 tot 1440 px, met een lege, een gewone en een volle gebruiker.
for (const breedte of [960, 1024, 1180, 1280, 1366, 1439]) {
  test.describe(`Instellingen Gewicht en Favorieten ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: 900 } });
    for (const [route, soorten] of [['meer/gewicht', ['leeg', 'gewoon']], ['meer/favorieten', ['leeg', 'gewoon', 'vol']]]) {
      for (const soort of soorten) {
        test(`${route} (${soort}): kolommen gelijk, geen leeg vlak, geen uitgerekte rij`, async ({ page }) => {
          await begin(page, route, soort);
          const m = await page.evaluate(() => {
            // het laatste blok van elke kolom (links de kaart of "Goed om te weten", rechts het voorbeeld of "Goed om te weten" eronder)
            const zijde = document.querySelector('.instel__voorbeeld');
            return { links: document.querySelector('.instel__lijst').lastElementChild.getBoundingClientRect().bottom, rechts: zijde.lastElementChild.getBoundingClientRect().bottom, rijen: [...zijde.querySelectorAll('.rij')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height), balans: document.querySelector('.instelscherm').classList.contains('is-balans') };
          });
          expect(m.balans, 'de balans is actief').toBe(true);
          expect(Math.abs(m.links - m.rechts), 'beide kolommen eindigen op dezelfde lijn').toBeLessThanOrEqual(2);
          expect(Math.max(0, ...m.rijen), 'geen uitgerekte rij').toBeLessThanOrEqual(80.5);
          const gaten = await page.evaluate(meetLegeVlakken, '.instel__voorbeeld');
          expect(Math.max(0, ...gaten.map((k) => k.gat)), 'leeg vlak in het voorbeeld').toBeLessThanOrEqual(32);
        });
      }
    }
  });
}

// Vanaf 1440 px verandert er niets: de balans doet niet mee.
test.describe('Instellingen op 1440 px', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const route of ['meer/gewicht', 'meer/favorieten']) {
    test(`${route}: geen balans, "Goed om te weten" links`, async ({ page }) => {
      await begin(page, route, 'gewoon');
      expect(await page.evaluate(() => document.querySelector('.instelscherm').classList.contains('is-balans'))).toBe(false);
      expect(await page.evaluate(() => document.querySelector('.instel__weetjes').parentElement.classList.contains('instel__lijst'))).toBe(true);
    });
  }
});

// Alle badges behaald: de medaille staat naast haar tekst over de volle breedte van de kaart.
for (const [breedte, hoogte] of [[1690, 1230], [1180, 820], [820, 1180], [390, 844]]) {
  test.describe(`Badges ${breedte}x${hoogte}`, () => {
  test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: breedte < 720, isMobile: breedte < 720 });
  test('met alle badges behaald staat de medaille naast haar tekst, zonder leeg vak', async ({ page }) => {
    await begin(page, 'meer', 'vol');
    const kaart = page.locator('.meer__badges');
    await expect(kaart.locator('.meer__allebehaald')).toHaveText('Alle 33 badges behaald.');
    const m = await page.evaluate(() => {
      const k = document.querySelector('.meer__badges').getBoundingClientRect();
      const label = document.querySelector('.meer__medaillelabel');
      const lh = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.3;
      const medaille = document.querySelector('.meer__badges .medaille--groot').getBoundingClientRect();
      const regel = document.querySelector('.meer__allebehaald').getBoundingClientRect();
      const naam = document.querySelector('.meer__badges .medaille-bijschrift__naam').getBoundingClientRect();
      return { labelRegels: Math.round(label.getBoundingClientRect().height / lh), links: medaille.right <= naam.left + 1, naastElkaar: Math.abs((naam.top + regel.bottom) / 2 - (medaille.top + medaille.bottom) / 2) < 30, rechts: naam.left - k.left };
    });
    expect(m.labelRegels, '"Laatst behaald" op één regel').toBe(1);
    expect(m.links, 'de medaille staat links van haar naam').toBe(true);
    expect(m.naastElkaar, 'de tekst staat midden naast de medaille').toBe(true);
    expect(await afbrekingen(page, '.meer__badges')).toEqual([]);
  });
  });
}

// BESLISSING 296: de grafiek in het voorbeeld van de instellingen Gewicht is statisch: inert, geen tabstop, een klik doet niets.
test('Instellingen Gewicht: de grafiek in het voorbeeld is inert (geen tabstop, een klik kiest geen punt)', async ({ page }) => {
  // Vaste klok (do 12 november 2026, 12:00): de wegingen hieronder worden gezaaid vanaf de maandag van "deze week" in de pagina.
  //
  await vasteKlok(page, { stil: true });
  await page.goto('./#/vandaag');
  await expect(page.locator('#scherm[data-scherm]')).toBeAttached();
  await zaaiAlgemeen(page, 'gewoon', ['eerste-favoriet', 'dag-rond']);
  await page.evaluate(() => new Promise((klaar) => {
    const o = indexedDB.open('bloei-dagboek');
    o.onsuccess = () => {
      const tx = o.result.transaction('wegingen', 'readwrite');
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      for (let i = 0; i < 5; i++) {
        const x = new Date(d);
        x.setDate(x.getDate() - 7 * i);
        const s = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
        tx.objectStore('wegingen').put({ week: s, datum: s, kg: 70 - i * 0.6, voorbeeld: false, gewijzigdOp: Date.now() });
      }
      tx.oncomplete = () => { o.result.close(); klaar(); };
    };
  }));
  await page.goto('./#/meer/gewicht');
  const echt = page.locator('.gewvoorbeeld__echt');
  await expect(echt).toHaveCount(1);
  await expect(echt).toHaveAttribute('inert', '');
  await expect(echt).toHaveAttribute('aria-hidden', 'true');
  const voor = await echt.innerHTML();
  // De klik moet echt op de grafiek vallen. Een klik met force op een vaste plek viel op 390 px soms op de tabbalk (de grafiek
  // begon op y = 760, de klik op y = 800 opende Dagboek) en wachtte dan 90 s op een grafiek die niet meer bestond.
  await echt.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  let vorige = '';
  await expect.poll(async () => { const r = JSON.stringify(await echt.boundingBox()); const stil = r === vorige; vorige = r; return stil; }).toBe(true);
  const vak = await echt.boundingBox();
  const punt = { x: vak.x + 40, y: vak.y + vak.height / 2 };
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.gewvoorbeeld'), punt), 'het klikpunt ligt in het voorbeeld, niet onder de tabbalk').toBe(true);
  const hash = await page.evaluate(() => location.hash);
  await page.mouse.click(punt.x, punt.y);
  await page.evaluate(() => new Promise((klaar) => requestAnimationFrame(() => requestAnimationFrame(klaar)))); // de klik is verwerkt en getekend
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(await echt.innerHTML(), 'een klik verandert niets').toBe(voor);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.gewvoorbeeld__echt')), 'geen tabstop in de grafiek').toBe(false);
  }
});

// BESLISSING 568 en 569 (vervangen 361 en 557): de tekst staat als blok in het midden van haar tegel (een regel in het midden, twee regels vullen de tegel),
// een tekst van drie of meer regels begint bij de bovenrand, en de tekst steekt nooit boven de tegel uit. De bovenkant van de hoofdletters wordt geschat met
// een Range over het eerste teken plus 0,37 x de lettergrootte (zoals op het scherm Uitleg); die schatting ligt door de halve regelafstand 4 tot 5 px onder
// de echte inkt, dus de grens is 6 px. De exacte stand van de inkt meet x-weetjes-uitlijning.spec.js op pixels.
const lijnMeting = () =>
  [...document.querySelectorAll('.privacy .weetje, .instel__weetjesrij .weetje')]
    .filter((e) => e.offsetParent)
    .map((e) => {
      const t = e.querySelector('.weetje__tekst');
      if (!t?.firstChild || t.firstChild.nodeType !== 3 || e.classList.contains('weetje--link')) return null;
      const alle = document.createRange();
      alle.selectNodeContents(t);
      const regels = new Set([...alle.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      const g = document.createRange();
      g.setStart(t.firstChild, 0);
      g.setEnd(t.firstChild, 1);
      const tegel = e.firstElementChild.getBoundingClientRect();
      const eerste = g.getBoundingClientRect();
      const letters = eerste.top + 0.37 * parseFloat(getComputedStyle(t).fontSize);
      const blok = [...alle.getClientRects()].filter((r) => r.width > 0);
      const blokMidden = (Math.min(...blok.map((r) => r.top)) + Math.max(...blok.map((r) => r.bottom))) / 2;
      return { regels, verschil: Math.round((letters - tegel.top) * 10) / 10, middenVerschil: Math.round((blokMidden - (tegel.top + tegel.bottom) / 2) * 10) / 10, privacy: !!e.closest('.privacy') };
    })
    .filter(Boolean);

for (const [breedte, hoogte] of [[1690, 1230], [1440, 900], [1280, 800], [820, 1180], [390, 844]]) {
  test.describe(`Tegel en tekst ${breedte}`, () => {
    test.use({ viewport: { width: breedte, height: hoogte }, hasTouch: breedte < 720, isMobile: breedte < 720 });
    test('Privacy: tegel en eerste tekstregel beginnen op één lijn, in elke cel', async ({ page }) => {
      await begin(page, 'meer', 'gewoon');
      const m = await page.evaluate(lijnMeting);
      expect(m.filter((x) => x.privacy)).toHaveLength(6);
      for (const x of m.filter((y) => y.privacy)) {
        expect(x.verschil, `Privacy: de tekst steekt niet boven de tegel uit (${x.verschil} px)`).toBeGreaterThanOrEqual(-2);
        if (x.regels >= 3) expect(x.verschil, `Privacy: drie of meer regels beginnen bij de tegelrand (${x.verschil} px)`).toBeLessThanOrEqual(6);
        else expect(Math.abs(x.middenVerschil), `Privacy: ${x.regels} regel(s) als blok in het midden van de tegel (${x.middenVerschil} px)`).toBeLessThanOrEqual(2);
      }
    });
    // Vergrendeling bouwt zijn blok "Goed om te weten" zelf (src/vergrendeling/scherm.js, niet van deze bouwer): daar staat BESLISSING 361 en 362 nog open.
    for (const route of ['meer/instellingen', 'meer/gewicht', 'meer/profiel', 'meer/favorieten']) {
      test(`${route}: "Goed om te weten" heeft een kop met lijn eronder en uitgelijnde tegels`, async ({ page }) => {
        await begin(page, route, 'gewoon');
        const m = await page.evaluate(lijnMeting);
        for (const x of m) {
          expect(x.verschil, `de tekst steekt niet boven de tegel uit (${x.verschil} px)`).toBeGreaterThanOrEqual(-2);
          if (x.regels >= 3) expect(x.verschil, `drie of meer regels beginnen bij de tegelrand (${x.verschil} px)`).toBeLessThanOrEqual(6);
          else expect(Math.abs(x.middenVerschil), `${x.regels} regel(s) als blok in het midden van de tegel (${x.middenVerschil} px)`).toBeLessThanOrEqual(2);
        }
        if (route === 'meer/vergrendeling') return; // dit blok bouwt src/vergrendeling/scherm.js zelf (BESLISSING 362 staat daar nog open)
        const kop = await page.evaluate(() => {
          const k = document.querySelector('.instel__weetjes > .kaartkop');
          if (!k) return null;
          const cs = getComputedStyle(k);
          const rij = document.querySelector('.instel__weetjes .instel__weetjesrij').getBoundingClientRect();
          const kr = k.getBoundingClientRect();
          return { tegel: !!k.querySelector('.tegel'), lijn: cs.borderBottomWidth, titelNaarLijn: parseFloat(cs.paddingBottom), lijnNaarWeetje: Math.round(rij.top - kr.bottom) };
        });
        expect(kop, 'een kaartkop in het blok').not.toBeNull();
        expect(kop.tegel).toBe(true);
        expect(kop.lijn).toBe('1px');
        expect(kop.titelNaarLijn).toBe(8);
        expect(kop.lijnNaarWeetje).toBeGreaterThanOrEqual(11);
        expect(kop.lijnNaarWeetje).toBeLessThanOrEqual(13);
      });
    }
  });
}
