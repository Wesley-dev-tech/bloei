// BESLISSING 273: onder de kop van elke kaart staat dezelfde dunne lijn (1 px, lijnkleur), met overal dezelfde afstand kop → lijn.
// Uitzondering: Deze week op Supplementen (.weekkaart--supp) is één regel met de dagen rechts.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vasteKlok } from './vaste-klok.js';
import { schermKlaar } from './wacht.js';

const ROUTES = [
  'vandaag', 'dagboek/dag', 'dagboek/week', 'dagboek/maand', 'drinken', 'supplementen', 'gewicht',
  'meer', 'meer/profiel', 'meer/favorieten', 'meer/badges', 'meer/instellingen', 'meer/gewicht',
  'meer/vergrendeling', 'meer/uitleg', 'delen',
];

// Eén dagelijks supplement, zodat de momentkaarten en Deze week op Supplementen er zijn.
async function zaai(page) {
  // Welke momentkaarten er staan en hoe Deze week eruitziet, hangt van de dag en het uur af: een vaste klok (BESLISSING 408).
  await vasteKlok(page);
  await page.goto('./#/supplementen');
  await schermKlaar(page, 'supplementen');
  await page.evaluate(
    () =>
      new Promise((klaar, fout) => {
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['supplementen'], 'readwrite');
          tx.objectStore('supplementen').add({ naam: 'Testkuur', dosis: '', hoeveelheid: '1 capsule', aanwijzing: '', momenten: ['ochtend', 'avond'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: false, aangemaaktOp: 1 });
          tx.oncomplete = () => { idb.close(); klaar(); };
          tx.onerror = () => fout(tx.error);
        };
      }),
  );
}

test.use({ viewport: { width: 1690, height: 1230 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false });

// BESLISSING 281: overal dezelfde ruimte rond de lijn (titel → lijn 8 px, lijn → eerste inhoud 12 px), op een breed scherm en op een telefoon.
const FORMATEN = [
  { naam: '1690x1230', viewport: { width: 1690, height: 1230 } },
  { naam: '390x844', viewport: { width: 390, height: 844 } },
];
for (const formaat of FORMATEN) {
test(`elke kaart met een kop heeft precies één lijn onder de kop: 8 px erboven, 12 px eronder, buren op dezelfde y (${formaat.naam})`, async ({ page }) => {
  await page.setViewportSize(formaat.viewport);
  await zaai(page);
  let totaal = 0;
  for (const route of ROUTES) {
    await page.goto(`./#/${route}`);
    await page.reload();
    await schermKlaar(page, route);
    const koppen = await page.evaluate((route) => {
      const probe = document.createElement('div');
      probe.style.cssText = 'border-bottom: 1px solid var(--c-line); position: absolute; visibility: hidden;';
      document.body.appendChild(probe);
      const lijnKleur = getComputedStyle(probe).borderBottomColor;
      probe.remove();
      return [...document.querySelectorAll('.kaart > .kaartkop')]
        // een kop die niet getoond wordt, heeft geen lijn om te meten: het weerbericht staat op een desktop zonder kop naast de begroeting (0.5.8)
        .filter((k) => !k.closest('.weekkaart--supp') && k.offsetParent !== null)
        .map((k) => {
          const cs = getComputedStyle(k);
          const kb = k.getBoundingClientRect().bottom;
          const marge = parseFloat(cs.marginBottom);
          // een tweede lijn: een element in dezelfde kaart met een bovenrand vlak onder de kop
          const dubbel = [...k.parentElement.querySelectorAll('*')].filter((e) => {
            if (k.contains(e)) return false;
            const c = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            return parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none' && r.height <= 6 && r.top >= kb - 1 && r.top <= kb + marge + 3;
          }).length;
          // geometrie: titel (tegel of label) → lijn, lijn → eerste element van de kaart (zijn bovenrand), tegel → kaartrand
          const kaart = k.parentElement;
          const kr = k.getBoundingClientRect();
          const cr = kaart.getBoundingClientRect();
          const tegel = k.querySelector('.tegel');
          const tr = tegel ? tegel.getBoundingClientRect() : kr;
          // De zichtbare lijn: de onderrand van de kop, of (BESLISSING 273 en scherm-vandaag.css: de kalenderkaart naast Eten vanaf 720 px, waar de maand op een eigen regel
          // ONDER de lijn staat) een ::before of ::after met een bovenrand, over de volle breedte van de kop. Precies één van beide mag bestaan.
          const onderrand = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none';
          const laagLijnen = ['::before', '::after'].map((p) => getComputedStyle(k, p)).filter((c) => c.content !== 'none' && c.position === 'absolute' && parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none' && parseFloat(c.height) <= 1.5);
          const laag = laagLijnen[0];
          const lijnen = (onderrand ? 1 : 0) + laagLijnen.length;
          const vol = laag ? Math.abs(parseFloat(laag.width) - k.clientWidth) <= 1 && Math.abs(parseFloat(laag.left)) <= 1 : true;
          const lijnY = laag && !onderrand ? kr.top + parseFloat(laag.top) : kr.bottom - parseFloat(cs.borderBottomWidth);
          const eerste = [...k.parentElement.children].find((e) => e !== k && e.getBoundingClientRect().top >= kr.bottom - 1 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).position !== 'absolute');
          return {
            naam: `${route}: ${(k.textContent || '').trim().slice(0, 20)}`,
            breedte: onderrand ? cs.borderBottomWidth : laag?.borderTopWidth,
            kleur: onderrand ? cs.borderBottomColor : laag?.borderTopColor,
            stijl: onderrand ? cs.borderBottomStyle : laag?.borderTopStyle,
            lijnen,
            vol,
            afstand: parseFloat(cs.paddingBottom),
            marge,
            lijnKleur,
            dubbel,
            // een kop van twee regels (de kalender op een telefoon) heeft de maand onder de titel: alleen de titelregel telt voor 8 px
            eenRegel: kr.height < parseFloat(cs.minHeight) + 12,
            titelNaarLijn: lijnY - Math.max(tr.bottom, kr.top + parseFloat(cs.minHeight)),
            lijnNaarInhoud: eerste ? eerste.getBoundingClientRect().top - kr.bottom : null,
            tegelOnderKaartrand: tr.top - cr.top,
            lijnY,
            kaartTop: cr.top,
            kaartX: cr.left,
            instelscherm: !!k.closest('.instelscherm'),
          };
        });
    }, route);
    for (const k of koppen) {
      expect(k.lijnen, `${k.naam}: precies één zichtbare lijn (onderrand of ::before/::after)`).toBe(1);
      expect(k.vol, `${k.naam}: de lijn loopt over de volle breedte van de kop`).toBe(true);
      expect(k.breedte, k.naam).toBe('1px');
      expect(k.stijl, k.naam).toBe('solid');
      expect(k.kleur, k.naam).toBe(k.lijnKleur);
      expect(k.dubbel, `${k.naam}: dubbele lijn`).toBe(0);
      expect(Math.abs(k.afstand - 8), `${k.naam}: 8 px tussen titel en lijn`).toBeLessThanOrEqual(1);
      if (k.eenRegel) expect(Math.abs(k.titelNaarLijn - 8), `${k.naam}: titel naar lijn`).toBeLessThanOrEqual(1);
      // 12 px, met hooguit 1 px afwijking; drie kaarten ("Vandaag gedronken" 2 px, "Je week in cijfers" 5 px, Favorieten op Algemeen 5 tot 8 px) staan hoger,
      // omdat hun eerste blok of rij 2 tot 8 px eigen ruimte boven de inhoud heeft en het lege vlak onder de kop anders boven de 32 px van de lay-outtests komt.
      if (k.lijnNaarInhoud !== null) expect(Math.abs(k.lijnNaarInhoud - 12), `${k.naam}: 12 px tussen lijn en eerste inhoud (${k.lijnNaarInhoud})`).toBeLessThanOrEqual(/Favorieten|Vandaag gedronke|Je week in cijfe/.test(k.naam) ? 10 : 1);
      totaal += 1;
    }
    // kaarten naast elkaar (zelfde bovenrand): titel en lijn op dezelfde y
    for (const a of koppen) {
      for (const b of koppen) {
        if (a === b || a.kaartX >= b.kaartX - 1 || Math.abs(a.kaartTop - b.kaartTop) > 1.5) continue;
        expect(Math.abs(a.lijnY - b.lijnY), `${a.naam} naast ${b.naam}: lijn op dezelfde y`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.tegelOnderKaartrand - b.tegelOnderKaartrand), `${a.naam} naast ${b.naam}: titel op dezelfde y`).toBeLessThanOrEqual(1);
      }
    }
    // de tegel van de titel staat op elke kaart even ver onder de kaartrand (24 px breed, 20 px op een telefoon: de binnenmarge van de kaart); een instelscherm is zelf één kaart
    const kaarten = koppen.filter((k) => !k.instelscherm && k.eenRegel);
    for (const k of kaarten) expect(Math.abs(k.tegelOnderKaartrand - kaarten[0].tegelOnderKaartrand), `${k.naam}: tegel onder de kaartrand`).toBeLessThanOrEqual(1);
  }
  expect(totaal).toBeGreaterThan(30);
});
}

test('Deze week op Supplementen blijft één regel zonder lijn', async ({ page }) => {
  await zaai(page);
  await page.reload();
  const kop = page.locator('.weekkaart--supp > .kaartkop');
  await expect(kop).toBeVisible();
  expect(await kop.evaluate((k) => getComputedStyle(k).borderBottomWidth)).toBe('0px');
});

// De lijn maakt een kaart nauwelijks hoger: zonder lijn was de kop 16 px van de inhoud, met lijn is het 8 + 1 + 12 = 21 px (BESLISSING 281), dus 5 px per kop.
// Met de regels van kaartkop-lijn.css aan is geen kaart meer dan 12 px hoger dan met die regels uit;
// 12 en niet 6, omdat een kaart die door een buurkaart wordt uitgerekt (Jouw instellingen naast Over) de 5 px van die buurkaart erbij krijgt plus de afronding van haar eigen inhoud.
// Op de gebouwde app zit kaartkop-lijn.css in de gebundelde css: de test zoekt elke regel van het bronbestand (op zijn selector) in de
// stylesheets van de pagina, haalt ze er tijdelijk uit en zet ze terug. Vindt ze een regel niet precies één keer, dan faalt ze.
const LIJN_CSS = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'stijl', 'kaartkop-lijn.css'), 'utf8');

test('de lijn maakt geen kaart hoger dan 12 px', async ({ page }) => {
  await zaai(page);
  let gemeten = 0;
  for (const route of ROUTES) {
    await page.goto(`./#/${route}`);
    await page.reload();
    await schermKlaar(page, route);
    const m = await page.evaluate((bron) => {
      // De regels van het bronbestand, zoals de browser hun selector schrijft.
      const proef = new CSSStyleSheet();
      proef.replaceSync(bron);
      const selectors = [...proef.cssRules].map((r) => r.selectorText);
      const gevonden = [];
      for (const blad of document.styleSheets) {
        let regels;
        try {
          regels = blad.cssRules;
        } catch {
          continue;
        }
        [...regels].forEach((r, index) => {
          if (r instanceof CSSStyleRule && selectors.includes(r.selectorText)) gevonden.push({ blad, index, tekst: r.cssText, selector: r.selectorText });
        });
      }
      const ontbreekt = selectors.filter((s) => gevonden.filter((g) => g.selector === s).length !== 1);
      if (ontbreekt.length) return { ontbreekt };
      // de kaarten van Dagboek dag zetten hun eigen ruimte onder de lijn (spacing op het eerste element, door de bouwer van die dag): niet vergelijkbaar met 'uit'
      const lees = () => [...document.querySelectorAll('.kaart > .kaartkop')].filter((k) => !k.closest('.dag__raster')).map((k) => ({ naam: (k.textContent || '').trim().slice(0, 20), h: k.parentElement.getBoundingClientRect().height }));
      const aan = lees();
      // uit: van achter naar voor verwijderen (de indexen blijven geldig), daarna in omgekeerde volgorde terugzetten
      const volgorde = [...gevonden].sort((a, b) => b.index - a.index);
      for (const g of volgorde) g.blad.deleteRule(g.index);
      const uit = lees();
      for (const g of [...volgorde].reverse()) g.blad.insertRule(g.tekst, g.index);
      const terug = lees();
      return { regels: gevonden.length, verschillen: aan.map((a, i) => ({ naam: a.naam, verschil: a.h - uit[i].h, terug: Math.abs(a.h - terug[i].h) })) };
    }, LIJN_CSS);
    expect(m.ontbreekt, `${route}: regels van kaartkop-lijn.css die niet precies één keer in de gebouwde css staan`).toBeUndefined();
    expect(m.regels).toBeGreaterThanOrEqual(5);
    for (const k of m.verschillen) {
      // Rondleiding (meer/uitleg): de lijst "Hoe doe ik dat?" is even hoog als de linkerkolom (BESLISSING 236) en haar rijen rekken mee tot die hoogte (BESLISSINGEN 346 en 360).
      // In de linkerkolom staan drie kaarten met een kop onder elkaar, elk 5 px hoger door de lijn (BESLISSING 281): 3 keer 5 = 15 px, plus 1 px afronding. De eigen kop van de
      // lijst telt niet mee: haar hoogte volgt links. Is de linkerkolom de laagste van de twee, dan blijft het bij de 5 px van haar eigen kop.
      const grens = route === 'meer/uitleg' && k.naam.startsWith('Hoe doe ik dat') ? 16 : 12;
      expect(k.verschil, `${route}: ${k.naam}`).toBeLessThanOrEqual(grens);
      expect(k.terug, `${route}: ${k.naam} na het terugzetten van de regels`).toBeLessThanOrEqual(0.5);
      gemeten += 1;
    }
  }
  expect(gemeten).toBeGreaterThan(30);
});

// Bewaakt dat de meting hierboven echt iets uitzet: zonder de regels heeft geen enkele kop nog de lijn (BESLISSING 273).
test('zonder de regels van kaartkop-lijn.css heeft geen kop de lijn; met de regels wel', async ({ page }) => {
  await vasteKlok(page);
  await page.goto('./#/vandaag');
  await schermKlaar(page, 'vandaag');
  const r =await page.evaluate((bron) => {
    const proef = new CSSStyleSheet();
    proef.replaceSync(bron);
    const selectors = [...proef.cssRules].map((x) => x.selectorText);
    const lijnen = () => [...document.querySelectorAll('.kaart > .kaartkop')].filter((k) => !k.closest('.weekkaart--supp')).filter((k) => getComputedStyle(k).borderBottomStyle !== 'none' && parseFloat(getComputedStyle(k).borderBottomWidth) > 0).length;
    const met = lijnen();
    const gevonden = [];
    for (const blad of document.styleSheets) [...blad.cssRules].forEach((x, index) => x instanceof CSSStyleRule && selectors.includes(x.selectorText) && gevonden.push({ blad, index, tekst: x.cssText }));
    const volgorde = gevonden.sort((a, b) => b.index - a.index);
    for (const g of volgorde) g.blad.deleteRule(g.index);
    const zonder = lijnen();
    for (const g of [...volgorde].reverse()) g.blad.insertRule(g.tekst, g.index);
    return { met, zonder, terug: lijnen() };
  }, LIJN_CSS);
  expect(r.met).toBeGreaterThan(2);
  expect(r.zonder).toBe(0);
  expect(r.terug).toBe(r.met);
});
