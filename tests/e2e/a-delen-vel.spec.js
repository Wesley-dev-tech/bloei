// Het vel op het scherm Delen volgt de pdf (BESLISSING 306): dezelfde dagen in dezelfde volgorde, dezelfde kerncijfers en dezelfde regels per dag,
// de kolommen Onderdeel en Wat op dezelfde plaats in alle dagen, geen afgebroken kolomkoppen en geen horizontale scroll in het vel.
// Alle gegevens zijn verzonnen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pdfTekst } from './pdf-tekst.js';
import { animatiesKlaar, domRustig } from './wacht.js';
import { wachtTotStil } from './r-wacht.js';

// Het vel en de pdf horen bij de laatste keuze: elke tik zet Bewaren meteen uit ("Even geduld") tot de pdf van díe stand klaar
// is, en het vel is dan al getekend. Daarna verandert het scherm niet meer (geen vaste wachttijd).
async function velKlaar(page) {
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  await domRustig(page);
  await animatiesKlaar(page);
}

test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

const AANTAL = 40;

// De klok staat vast op donderdag 12 november 2026: "Deze week" telt dan vier dagen en de tests hangen niet af van de weekdag waarop ze draaien.
// Op een maandag telt "Deze week" één dag (een weekverslag, BESLISSING 457); dat geval heeft zijn eigen test onderaan.
const KLOK = new Date(2026, 10, 12, 12, 0, 0);
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(KLOK);
});

// Veertig dagen met afwisseling: drie maaltijden, alleen drinken, een lange tekst, een notitie, en dagen zonder iets.
async function vul(page) {
  await page.goto('./#/vandaag');
  await expect(page.locator('.vandaag')).toBeVisible();
  await page.evaluate(
    (aantal) =>
      new Promise((klaar, fout) => {
        const sleutel = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const nu = new Date();
        const open = indexedDB.open('bloei-dagboek');
        open.onerror = () => fout(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          const tx = idb.transaction(['maaltijden', 'dranken', 'dagen', 'wegingen'], 'readwrite');
          for (let i = 0; i < aantal; i += 1) {
            const datum = sleutel(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - i));
            if (i % 5 === 3) continue; // een dag zonder iets
            const lang = 'verzonnen ontbijt met havermout, fruit, noten en yoghurt en nog veel meer tekst zodat de regel zeker breekt in de kolom';
            if (i % 4 !== 1) {
              tx.objectStore('maaltijden').put({ datum, soort: 'ontbijt', tijd: '08:15', tekst: i % 6 === 0 ? lang : 'havermout met fruit', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
              tx.objectStore('maaltijden').put({ datum, soort: 'avondmaal', tijd: '18:45', tekst: 'soep en brood', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
              if (i % 3 === 0) tx.objectStore('maaltijden').put({ datum, soort: 'tussendoortje', tijd: '10:30', tekst: 'appel', fotoId: null, voorbeeld: false, gewijzigdOp: 1 });
            }
            tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 1000 - i, soort: 'water', ml: 500 + (i % 5) * 600, voorbeeld: false });
            if (i % 2 === 0) tx.objectStore('dranken').add({ datum, tijdstip: Date.now() - 900 - i, soort: 'thee', ml: 250, voorbeeld: false });
            tx.objectStore('dagen').put({ datum, notitie: i % 3 === 0 ? `Verzonnen notitie ${i}, met wat extra woorden erbij zodat ze ook breekt als de kolom smal is.` : '', doelGehaald: false, voorbeeld: false });
            if (i === 0 || i === 8 || i === 20) tx.objectStore('wegingen').put({ week: datum, datum, kg: 71.3 - i * 0.05, voorbeeld: false, gewijzigdOp: 1 });
          }
          tx.oncomplete = () => {
            idb.close();
            klaar();
          };
          tx.onerror = () => fout(tx.error);
        };
      }),
    AANTAL,
  );
}

const woorden = (tekst) =>
  tekst
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .split(' ')
    .filter((w) => w && w !== '·');

// Wat het vel toont, in leesvolgorde, als gewone tekst (niet via innerText: de hoofdletters van de opmaak horen er niet in).
async function leesVel(page) {
  return page.locator('.verslagvel').evaluate((vel) => {
    // de tekstknopen met een spatie ertussen (cellen staan zonder spatie naast elkaar in de opmaak)
    const tekst = (el) => {
      if (!el) return '';
      const stukken = [];
      const lopen = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (lopen.nextNode()) stukken.push(lopen.currentNode.textContent);
      return stukken.join(' ').replace(/\s+/g, ' ').trim();
    };
    const dagen = [...vel.querySelectorAll('.verslagvel__dag')].map((d) => ({ titel: tekst(d.querySelector('.verslagvel__dagtitel')), tekst: tekst(d) }));
    return {
      merk: tekst(vel.querySelector('.verslagvel__woord')),
      wie: tekst(vel.querySelector('.verslagvel__naamkop')),
      // BESLISSING 490: rechtsboven staat op het scherm alleen "Verslag van <naam>"; de korte periode bestaat daar niet meer
      periodeKortAanwezig: Boolean(vel.querySelector('.verslagvel__periodekort')),
      // BESLISSING 461: de titel is het woord "Verslag", de periode staat eronder als label (hoofdletters via css, de DOM-tekst is gewoon)
      titel: tekst(vel.querySelector('.verslagvel__titel')),
      periode: tekst(vel.querySelector('.verslagvel__periode')),
      periodeStijl: vel.querySelector('.verslagvel__periode') ? getComputedStyle(vel.querySelector('.verslagvel__periode')).textTransform : '',
      // per kerncijfer: label, getal, eenheid (of ''), onderregel
      cijfers: [...vel.querySelectorAll('.verslagvel__cijfer')].map((c) => [tekst(c.querySelector('.verslagvel__cijferlabel')), tekst(c.querySelector('.verslagvel__cijfergetal')), tekst(c.querySelector('.verslagvel__cijfereenheid')), tekst(c.querySelector('.verslagvel__cijferonder'))]),
      gewicht: vel.querySelector('.verslagvel__gewicht') ? [...vel.querySelectorAll('.verslagvel__gewicht h3, .verslagvel__gewichtrij > *')].map(tekst) : null,
      // de kolomkoprij van elke dagtabel
      kolomkop: [...vel.querySelectorAll('.verslagvel__dag')].map((d) => [...d.querySelectorAll('.verslagvel__kolomkop > span')].map(tekst)),
      dagen,
      voet: tekst(vel.querySelector('.verslagvel__voet')),
    };
  });
}

// De pdf van het scherm: de regels zonder wat op elke pagina terugkomt (kop, voet, kolomkop).
async function leesPdf(page, naam) {
  await expect(page.getByRole('button', { name: 'Bewaren', exact: true })).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
  const regels = pdfTekst(readFileSync(await (await download).path())).split('\n').filter(Boolean);
  // BESLISSING 490: pagina 1 heeft in de kop alleen "Verslag van <naam>"; de volgende pagina's hebben er de korte periode bij, in hoofdletters
  // ("VR 30 OKT 2026 - DO 12 NOV 2026"). Die kopregel is ruis, net als de naam, het merk en het paginanummer.
  const ruis = (r) => r === 'bloei' || r === `Verslag van ${naam}` || /^Pagina \d+ van \d+$/.test(r) || KORTE_PERIODE.test(r);
  // Elke dagtabel heeft zijn eigen kolomkop; bij een paginabreuk komt ze terug met "(vervolg)" achter de datum: die herhaling is ruis.
  const inhoud = [];
  let overslaan = 0;
  for (const r of regels.filter((q) => !ruis(q))) {
    if (overslaan) {
      overslaan -= 1;
      continue;
    }
    if (/ \(vervolg\)$/i.test(r)) overslaan = 2; // MAALTIJD, WAT (BESLISSING 336: de kolom Uur is weg, de herhaalde kolomkop heeft twee regels; de dagkop met "(VERVOLG)" is in hoofdletters)
    else inhoud.push(r);
  }
  return { alle: regels, inhoud };
}

// BESLISSING 459: in de pdf staan de dagkoppen en de periodes echt in hoofdletters.
const DAGTITEL = /^(MAANDAG|DINSDAG|WOENSDAG|DONDERDAG|VRIJDAG|ZATERDAG|ZONDAG) \d+ [A-Z]+ \d{4}$/;
const KORTE_PERIODE = /^[A-Z]{2} \d+ [A-Z.]+ \d{4}( - [A-Z]{2} \d+ [A-Z.]+ \d{4})?$/;

async function vergelijk(page, naam, gewicht) {
  const vel = await leesVel(page);
  const pdf = await leesPdf(page, naam);
  const lijst = pdf.inhoud;
  // kop en voet
  expect(vel.merk).toBe('bloei');
  expect(vel.wie).toBe(`Verslag van ${naam}`);
  expect(pdf.alle).toContain(vel.wie);
  expect(vel.titel).toBe('Verslag'); // BESLISSING 461
  // BESLISSING 490: geen korte periode rechtsboven op het scherm; in de pdf niet op pagina 1, wel op elke volgende pagina (bij één dag nergens)
  expect(vel.periodeKortAanwezig, 'geen korte periode in de kop van het vel').toBe(false);
  const eindPagina1 = pdf.alle.findIndex((r) => /^Pagina 1 van \d+$/.test(r));
  expect(eindPagina1).toBeGreaterThan(0);
  const aantalPaginas = Number(pdf.alle[eindPagina1].match(/van (\d+)$/)[1]);
  expect(pdf.alle.slice(0, eindPagina1).filter((r) => KORTE_PERIODE.test(r)), 'pagina 1: geen korte periode in de kop').toEqual([]);
  const korteKoppen = pdf.alle.slice(eindPagina1).filter((r) => KORTE_PERIODE.test(r));
  expect(korteKoppen, 'elke volgende pagina heeft de korte periode in de kop').toHaveLength(aantalPaginas - 1);
  for (const kort of korteKoppen) expect(kort.match(/\d+/g), 'dezelfde dagen en jaartallen als de periode').toEqual(vel.periode.match(/\d+/g));
  expect(pdf.alle.filter((r) => r === vel.voet).length).toBeGreaterThan(0);
  expect(vel.voet).toMatch(/^Gemaakt op [a-z]+ \d+ [a-z]+ \d{4}$/);
  expect(vel.voet).not.toMatch(/pagina/i);
  // de titel "Verslag" en daaronder de periode: op het scherm een label (hoofdletters via css, gewone DOM-tekst, een bereik met " - "), in de pdf echt in hoofdletters
  // (de pdf mag de periode op twee regels zetten)
  expect(vel.periodeStijl, 'de periode is een label in hoofdletters').toBe('uppercase');
  expect(vel.periode).not.toContain(' tot ');
  let i = 0;
  expect(lijst[i++]).toBe(vel.titel);
  const verwachtePeriode = vel.periode.toLocaleUpperCase('nl-BE').replace(/\s+/g, ' ');
  const periodeRegels = [];
  while (periodeRegels.join(' ') !== verwachtePeriode && i < lijst.length) periodeRegels.push(lijst[i++]);
  expect(periodeRegels.join(' ')).toBe(verwachtePeriode);
  // de kerncijfers: dezelfde labels en waarden in dezelfde volgorde
  for (const [label, getal, eenheid, onder] of vel.cijfers) {
    expect(lijst[i++]).toBe(label.toUpperCase());
    expect(lijst[i++]).toBe(getal);
    if (eenheid) expect(lijst[i++]).toBe(eenheid);
    expect(lijst[i++]).toBe(onder);
  }
  // het gewicht (vóór de dagen): alleen een tabel bij twee of meer wegingen (of bij één dag, zonder kerncijfers)
  if (gewicht) {
    expect(vel.gewicht).not.toBeNull();
    const g = vel.gewicht.map((x, n) => (n >= 1 && n <= 4 ? x.toUpperCase() : x));
    expect(lijst.slice(i, i + g.length)).toEqual(g);
    i += g.length;
  } else expect(vel.gewicht).toBeNull();
  // de dagen: dezelfde titels in dezelfde volgorde en per dag dezelfde woorden (de pdf breekt regels anders af)
  const rest = lijst.slice(i).filter((r) => !/^Gemaakt op /.test(r));
  const metBand = vel.dagen.some((d) => d.titel);
  if (metBand) {
    const delen = [];
    for (const r of rest) {
      if (DAGTITEL.test(r)) delen.push([r]);
      else if (delen.length) delen.at(-1).push(r);
    }
    expect(delen.map((d) => d[0])).toEqual(vel.dagen.map((d) => d.titel.toLocaleUpperCase('nl-BE')));
    vel.dagen.forEach((d, n) => expect(woorden(delen[n].join(' ')).sort(), 'dag ' + d.titel).toEqual(woorden(d.tekst).sort()));
  } else {
    // één dag: geen band, de tabel staat direct onder de titel
    expect(woorden(rest.join(' ')).sort()).toEqual(woorden(vel.dagen.map((d) => d.tekst).join(' ')).sort());
  }
  // elke dagtabel (behalve een lege dag) heeft zijn eigen kolomkoprij: Maaltijd | Wat
  const gevuld = vel.dagen.filter((d) => !/Niets genoteerd/.test(d.tekst)).length;
  expect(vel.kolomkop.filter((k) => k.length).length).toBe(gevuld);
  for (const k of vel.kolomkop.filter((q) => q.length)) expect(k).toEqual(['Maaltijd', 'Wat']);
  return vel;
}

// BESLISSING 317: bij een kort verslag is het vel zo hoog als zijn inhoud en staat het bovenaan in de kaart; bij een lang verslag vult het de kaart en scrolt het.
// De kaart is in beide gevallen even hoog als de linkerkolom.
async function meetHoogte(page) {
  return page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const vel = document.querySelector('.verslagvel');
    const velR = vel.getBoundingClientRect();
    const houder = r('.delen__velhouder');
    const kaart = r('.delen__verslag');
    const links = { top: r('.delen__samenstel').top, bottom: r('.delen__bewaren').bottom };
    return {
      onderOpVoet: velR.bottom - parseFloat(getComputedStyle(vel).borderBottomWidth) - r('.verslagvel__voet').bottom, // ruimte onder de laatste inhoud (de opvulling)
      onderVelBoven: houder.bottom - velR.bottom, // ruimte onder het vel in de kaart
      kaartVerschil: Math.abs(kaart.height - (links.bottom - links.top)),
      scrolt: vel.scrollHeight - vel.clientHeight,
      velBoven: velR.top - houder.top,
    };
  });
}

test('Delen: één dag, het vel is zo hoog als zijn inhoud en staat bovenaan; de kaart is even hoog als de linkerkolom', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Vandaag', exact: true }).click();
  await expect(page.locator('.verslagvel__voet')).toBeVisible();
  // De hoogtes worden pas gemeten als ze niet meer veranderen (het vel en de kaart passen zich aan na het tekenen)
  await velKlaar(page);
  const m = await wachtTotStil(page, () => meetHoogte(page));
  if (process.env.PW_SCHERMEN) await page.locator('.delen__verslag').screenshot({ path: `${process.env.PW_SCHERMEN}/vel-een-dag-1690.png` });
  expect(m.onderOpVoet).toBeLessThanOrEqual(24.5);
  expect(m.velBoven).toBeLessThanOrEqual(1);
  // BESLISSING 331: bij een kort verslag is de kaart zo hoog als het vel; "Goed om te weten" staat eronder en de twee kolommen eindigen gelijk
  expect(m.onderVelBoven, 'de kaart is zo hoog als het vel').toBeLessThanOrEqual(1);
  const kolommen = await page.evaluate(() => ({ links: document.querySelector('.delen__bewaren').getBoundingClientRect().bottom, weetjes: document.querySelector('.delen__weetjes').getBoundingClientRect().bottom, binnen: Boolean(document.querySelector('.delen__weetjes').closest('.delen__rechts')) }));
  expect(kolommen.binnen).toBe(true);
  expect(Math.abs(kolommen.links - kolommen.weetjes)).toBeLessThanOrEqual(2);
});

test('Delen: een maand vult de kaart en scrolt binnenin; de kaart is even hoog als de linkerkolom', async ({ page }) => {
  await page.setViewportSize({ width: 1690, height: 1230 });
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Een maand', exact: true }).click();
  await expect(page.locator('.verslagvel__periode')).toContainText(' - '); // BESLISSING 461: een bereik met " - " onder de titel "Verslag"
  await velKlaar(page);
  const m = await wachtTotStil(page, () => meetHoogte(page));
  expect(m.onderVelBoven).toBeLessThanOrEqual(1);
  expect(m.scrolt).toBeGreaterThan(50);
  expect(m.kaartVerschil).toBeLessThanOrEqual(1);
});

// Geometrie: de kolommen staan op dezelfde x, niets breekt in een kop, geen horizontale scroll in het vel.
async function meetVel(page) {
  return page.locator('.verslagvel').evaluate((vel) => {
    const links = (sel) => [...vel.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().left);
    const spreiding = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    const gebroken = [...vel.querySelectorAll('.verslagvel__kolomkop > span, .verslagvel__cijferlabel, .verslagvel__gewichtrij--kop > span')]
      .filter((e) => {
        const stijl = getComputedStyle(e);
        const hoogte = e.getBoundingClientRect().height - parseFloat(stijl.paddingTop) - parseFloat(stijl.paddingBottom); // de cellen hebben opvulling
        const lh = parseFloat(stijl.lineHeight) || hoogte;
        return hoogte > lh * 1.5 || e.scrollWidth > e.clientWidth + 1;
      })
      .map((e) => e.textContent);
    const rijRechts = Math.max(0, ...[...vel.querySelectorAll('.verslagvel__rij, .verslagvel__kolomkop, .verslagvel__band')].map((e) => e.getBoundingClientRect().right - vel.getBoundingClientRect().right));
    // de verticale kolomlijnen (de linkerrand van de cellen 2 en 3) liggen in alle dagtabellen op dezelfde x
    const dagtabellen = [...vel.querySelectorAll('.verslagvel__dag')].filter((d) => d.querySelector('.verslagvel__kolomkop'));
    const lijnX = (n) => dagtabellen.flatMap((d) => [...d.querySelectorAll(`.verslagvel__kolomkop > span:nth-child(${n}), .verslagvel__rij > span:nth-child(${n}):not(.verslagvel__wat--breed)`)].map((e) => e.getBoundingClientRect().left));
    // de kerncijfers: per rij even brede blokken; labels, getallen en onderregels op één lijn
    const blokken = [...vel.querySelectorAll('.verslagvel__cijfer')];
    const rijenKc = new Map();
    for (const b of blokken) {
      const t = Math.round(b.getBoundingClientRect().top);
      rijenKc.set(t, [...(rijenKc.get(t) ?? []), b]);
    }
    const kcBreedte = Math.max(0, ...[...rijenKc.values()].filter((r) => r.length > 1).map((r) => spreiding(r.map((b) => b.getBoundingClientRect().width))));
    const kcLijn = (sel, kant) => Math.max(0, ...[...rijenKc.values()].map((r) => spreiding(r.map((b) => b.querySelector(sel).getBoundingClientRect()[kant]))));
    const eerste = blokken[0]?.getBoundingClientRect();
    const laatste = blokken.at(-1)?.getBoundingClientRect();
    const velR = vel.getBoundingClientRect();
    const padL = parseFloat(getComputedStyle(vel).paddingLeft);
    const contentLinks = velR.left + vel.clientLeft + padL;
    const contentRechts = contentLinks + vel.clientWidth - padL - parseFloat(getComputedStyle(vel).paddingRight);
    const gw = vel.querySelector('.verslagvel__gewichttabel');
    const gewichtRechts = gw
      ? [2, 3, 4].map((n) => spreiding([...gw.querySelectorAll(`.verslagvel__gewichtrij > span:nth-child(${n})`)].map((e) => e.getBoundingClientRect().right)))
      : [];
    return {
      onderdeel: spreiding(links('.verslagvel__kolomkop > span:nth-child(1), .verslagvel__rij > .verslagvel__onderdeel')),
      wat: spreiding(lijnX(2)),
      kolomkoppen: vel.querySelectorAll('.verslagvel__dag .verslagvel__kolomkop').length,
      dagtabellen: dagtabellen.length,
      kcBreedte,
      kcLabel: kcLijn('.verslagvel__cijferlabel', 'top'),
      kcGetal: kcLijn('.verslagvel__cijfergetal', 'bottom'),
      kcOnder: kcLijn('.verslagvel__cijferonder', 'top'),
      kcBlokken: blokken.length,
      kcRijen: rijenKc.size,
      velBreedte: Math.round(contentRechts - contentLinks),
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      // het eerste blok begint op de linkerrand van het blad, het laatste loopt tot de rechterrand (de opvulling buiten de rand is weggeknipt)
      kcLinks: eerste ? Math.abs(blokken[0].querySelector('.verslagvel__cijferlabel').getBoundingClientRect().left - contentLinks) : 0,
      kcRechts: laatste ? Math.abs(vel.querySelector('.verslagvel__cijfers').getBoundingClientRect().right + parseFloat(getComputedStyle(vel.querySelector('.verslagvel__cijfers')).marginRight) - contentRechts) : 0,
      gewichtBreedte: gw ? Math.abs(gw.getBoundingClientRect().width - (contentRechts - contentLinks)) : 0,
      gewichtRechts,
      gebroken,
      scrollBreedte: vel.scrollWidth - vel.clientWidth,
      rijRechts,
      pagina: document.documentElement.scrollWidth - window.innerWidth,
      tabellen: vel.querySelectorAll('.verslagvel__tabel').length,
    };
  });
}

const PERIODES = [['Vandaag', 1], ['Deze week', 7], ['Een maand', 30]];

for (const [periode] of PERIODES) {
  for (const alle of [false, true]) {
    test(`Delen: het vel volgt de pdf, ${periode}, ${alle ? 'alle vier de onderdelen' : 'Eten en Drinken'}`, async ({ page }) => {
      await vul(page);
      await page.goto('./#/delen');
      await page.getByRole('button', { name: periode, exact: true }).click();
      if (alle) {
        await page.getByRole('checkbox', { name: 'Gewicht', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Notities', exact: true }).click();
      }
      if (periode !== 'Vandaag') await expect(page.locator('.verslagvel__periode')).toContainText(' - ');
      if (alle && periode !== 'Deze week' && periode !== 'Vandaag') await expect(page.locator('.verslagvel__gewicht')).toBeVisible();
      await velKlaar(page); // het vel en de pdf horen bij de laatste keuze
      if (process.env.PW_SCHERMEN && alle) {
        await page.setViewportSize({ width: 1690, height: 1230 });
        await domRustig(page); // het vel deelt zich opnieuw in op de nieuwe breedte
        await animatiesKlaar(page);
        await page.locator('.delen__verslag').screenshot({ path: `${process.env.PW_SCHERMEN}/vel-${periode.replace(' ', '-')}-1690.png` });
      }
      // de gewichtstabel: bij één dag (zonder kerncijfers) en bij een maand met drie wegingen; bij één weging in de week zegt het kerncijfer alles
      const vel = await vergelijk(page, 'Testnaam', alle && periode !== 'Deze week' && periode !== 'Vandaag');
      // één dag: de eigen kerncijfers van die dag (BESLISSING 331 en 333); het gewicht alleen als er die dag gewogen is, en dan geen tabel
      if (periode === 'Vandaag') expect(vel.cijfers.map((c) => c[0])).toEqual(alle ? ['Maaltijden', 'Gedronken', 'Dagdoel', 'Gewicht'] : ['Maaltijden', 'Gedronken', 'Dagdoel']);
      else expect(vel.cijfers.length).toBeGreaterThanOrEqual(2);
      for (const woord of ['Supplementen']) expect(vel.dagen.map((d) => d.tekst).join(' ')).not.toContain(woord);
      if (!alle) expect(vel.cijfers.map((c) => c[0])).not.toContain('Laatste weging');
      if (alle && periode === 'Een maand') expect(vel.cijfers.map((c) => c[0])).toContain('Laatste weging');
      if (alle && periode === 'Deze week') {
        // één weging: geen tabel, het kerncijfer toont het gewicht met de datum erbij
        expect(vel.gewicht).toBeNull();
        const weging = vel.cijfers.find((c) => c[0] === 'Laatste weging');
        expect(weging[2]).toBe('kg');
        expect(weging[3]).toMatch(/^[a-z]{2} \d+ [a-z]+$/);
      }
      // de kerncijfers hebben alle vier de lijnen; een maand heeft er vijf
      for (const c of vel.cijfers) expect(c[0]).not.toMatch(/Gemiddeld|op$/);
      const m = await meetVel(page);
      expect(m.onderdeel).toBeLessThanOrEqual(1);
      expect(m.wat).toBeLessThanOrEqual(1);
      expect(m.tabellen).toBeGreaterThan(0);
    });
  }
}

for (const [breedte, hoogte] of [[1690, 1230], [1280, 800], [390, 844]]) {
  test(`Delen: in het vel breekt geen kolomkop en is er geen horizontale scroll, met een maand en alle vier de onderdelen (${breedte} px)`, async ({ page }) => {
    await page.setViewportSize({ width: breedte, height: hoogte });
    await vul(page);
    await page.goto('./#/delen');
    await page.getByRole('button', { name: 'Een maand', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Gewicht', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Notities', exact: true }).click();
    await expect(page.locator('.verslagvel__gewicht')).toBeVisible();
    // Meten als het vel bij de laatste keuze hoort en de maten niet meer veranderen
    await velKlaar(page);
    const m = await wachtTotStil(page, () => meetVel(page));
    if (process.env.PW_SCHERMEN) await page.locator('.delen__verslag').screenshot({ path: `${process.env.PW_SCHERMEN}/vel-maand-${breedte}.png` });
    expect(m.gebroken, 'afgebroken kolomkoppen').toEqual([]);
    expect(m.scrollBreedte).toBeLessThanOrEqual(0);
    expect(m.rijRechts).toBeLessThanOrEqual(0.5);
    expect(m.pagina).toBeLessThanOrEqual(0);
    expect(m.onderdeel).toBeLessThanOrEqual(1);
    expect(m.wat).toBeLessThanOrEqual(1);
    // de tekst in de cellen loopt niet over de rand van het vel
    const over = await page.locator('.verslagvel').evaluate((vel) => [...vel.querySelectorAll('.verslagvel__wat, .verslagvel__naam')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(over).toBe(0);
    // de dagtabellen: elke dag heeft een kolomkoprij en de verticale kolomlijnen liggen overal op dezelfde x (al gemeten: onderdeel, wat)
    expect(m.kolomkoppen).toBe(m.dagtabellen);
    expect(m.dagtabellen).toBeGreaterThan(5);
    // de kerncijfers: vijf blokken, in een vel van ± 720 px in één rij, in ± 360 px in twee rijen (3 + 2), op een telefoon elk op een eigen regel;
    // de blokken in een rij zijn even breed en hun labels, getallen en onderregels staan op één lijn; het eerste blok begint op de linkerrand en de rij loopt tot de rechterrand
    expect(m.kcBlokken).toBe(5);
    expect(m.kcRijen, `vel ${m.velBreedte} px, 1 rem = ${m.rem} px`).toBe(breedte >= 1690 ? 1 : breedte >= 1280 ? 2 : 5);
    expect(m.kcBreedte, 'blokken even breed').toBeLessThanOrEqual(1);
    expect(m.kcLabel, 'labels op één lijn').toBeLessThanOrEqual(1);
    expect(m.kcGetal, 'getallen op één basislijn').toBeLessThanOrEqual(1);
    expect(m.kcOnder, 'onderregels op één lijn').toBeLessThanOrEqual(1);
    expect(m.kcLinks).toBeLessThanOrEqual(1);
    expect(m.kcRechts).toBeLessThanOrEqual(1);
    // de gewichtstabel loopt over de volle breedte en de getallen staan rechts uitgelijnd onder hun kop
    expect(m.gewichtBreedte).toBeLessThanOrEqual(1);
    for (const r of m.gewichtRechts) expect(r).toBeLessThanOrEqual(1);
  });
}

test('Delen: een lange tekst breekt binnen de kolom Wat en het vel toont geen woorden uit andere onderdelen', async ({ page }) => {
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Deze week', exact: true }).click();
  await expect(page.locator('.verslagvel__titel')).toBeVisible();
  const vel = page.locator('.verslagvel');
  const tekst = (await vel.textContent()) ?? '';
  for (const woord of ['Supplementen', 'Vitamine']) expect(tekst).not.toContain(woord);
  expect(tekst).not.toMatch(/\bnull\b|undefined|NaN|\[object/);
  // het vel is licht papier, ook als de app donker is
  const papier = await vel.evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'nacht'));
  expect(await vel.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(papier);
});

// BESLISSING 373: het vel heeft één accentkleur, lavendel: alle icoontegels, de dagband en de balk komen uit de lavendelfamilie, in elk thema.
test('Delen: icoontegels, dagbanden en drinkbalken van het vel zijn lavendel, in Poeder en in Nacht', async ({ page }) => {
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Twee weken', exact: true }).click();
  for (const naam of ['Gewicht', 'Notities']) {
    const vak = page.getByRole('checkbox', { name: naam, exact: true });
    if ((await vak.getAttribute('aria-checked')) !== 'true') await vak.click();
  }
  await expect(page.locator('.verslagvel__titel')).toBeVisible();
  for (const thema of ['poeder', 'nacht']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), thema);
    const kleuren = await page.locator('.verslagvel').evaluate((vel) => {
      // een token omgezet naar de kleur die de browser ervan maakt
      const rgb = (token) => {
        const el = document.createElement('i');
        el.style.color = `var(${token})`;
        vel.appendChild(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
      };
      const stijl = (el, pseudo) => getComputedStyle(el, pseudo);
      return {
        zacht: rgb('--c-share-soft'),
        donker: rgb('--c-share'),
        tegels: [...vel.querySelectorAll('.tegel')].map((t) => [stijl(t).backgroundColor, stijl(t).color]),
        banden: [...vel.querySelectorAll('.verslagvel__band')].map((b) => stijl(b).backgroundColor),
        balken: [...vel.querySelectorAll('.verslagvel__balk')].map((b) => stijl(b).backgroundColor),
        // de vulling van de balk is een pseudo-element dat getComputedStyle niet geeft: de regel zelf lezen
        vulling: [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r.selectorText === '.verslagvel__balk::-webkit-progress-value').map((r) => r.style.getPropertyValue('background').trim()),
      };
    });
    expect(kleuren.tegels.length).toBeGreaterThan(10);
    for (const [bg, fg] of kleuren.tegels) {
      expect(bg, thema).toBe(kleuren.zacht);
      expect(fg, thema).toBe(kleuren.donker);
    }
    expect(kleuren.banden.length).toBeGreaterThan(5);
    for (const bg of kleuren.banden) expect(bg, thema).toBe(kleuren.zacht);
    expect(kleuren.balken.length).toBeGreaterThan(5);
    for (const spoor of kleuren.balken) expect(spoor, thema).toBe(kleuren.zacht);
    expect(kleuren.vulling, thema).toEqual(['var(--c-share-licht)']);
  }
});

// Op een maandag telt "Deze week" één dag; het blijft een weekverslag (BESLISSING 457): "Week van maandag ...", "van 7 dagen", en er gaat niets mis.
test('Delen: op een maandag telt "Deze week" één dag, de periode is "Week van maandag ..." en de console blijft schoon', async ({ page }) => {
  const fouten = [];
  page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
  page.on('pageerror', (e) => fouten.push(String(e)));
  await page.clock.setFixedTime(new Date(2026, 10, 16, 12, 0, 0)); // maandag 16 november 2026
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Deze week', exact: true }).click();
  await expect(page.locator('.verslagvel__titel')).toBeVisible();
  await velKlaar(page); // het vel hoort bij "Deze week", niet meer bij de vorige keuze
  await expect(page.locator('.verslagvel__periode')).not.toContainText(' - '); // een enkele dag: geen bereik
  expect(await page.locator('.verslagvel__dag').count(), 'één dag in het vel').toBe(1);
  // BESLISSING 457: "Deze week" is ook op een maandag een weekverslag: de weekcijfers tellen "van 7 dagen" en de periode is de week van maandag.
  await expect(page.locator('.verslagvel__periode')).toHaveText('Week van maandag 16 november 2026'); // BESLISSING 487
  await expect(page.locator('.verslagvel .verslagvel__cijfer').first()).toContainText('Dagen ingevuld');
  await expect(page.locator('.verslagvel .verslagvel__cijfer').first()).toContainText(/van 7 dagen/);
  expect(fouten).toEqual([]);
});

// BESLISSING 474 en 485: "Vorige week" is maandag tot en met zondag van de vorige week, een weekverslag "van 7 dagen"; het blokje onder de knoppen toont de periode voluit.
test('Delen: "Vorige week" geeft maandag tot en met zondag van de vorige week, van 7 dagen, ook in het blokje onder de knoppen', async ({ page }) => {
  await vul(page); // de klok staat op donderdag 12 november 2026: de vorige week is maandag 2 tot en met zondag 8 november
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Vorige week', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vorige week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await velKlaar(page);
  await expect(page.locator('.delen__periodewoorden')).toContainText('maandag 2 november 2026 - zondag 8 november 2026');
  await expect(page.locator('.delen__periodewoorden')).toContainText('7 dagen');
  await expect(page.locator('.verslagvel__periode')).toHaveText('Maandag 2 november 2026 - zondag 8 november 2026');
  await expect(page.locator('.verslagvel .verslagvel__cijfer').first()).toContainText('Dagen ingevuld');
  await expect(page.locator('.verslagvel .verslagvel__cijfer').first()).toContainText(/van 7 dagen/);
  const titels = await page.locator('.verslagvel__dagtitel').allTextContents();
  expect(titels.map((x) => x.trim())).toEqual(['Maandag 2 november 2026', 'Dinsdag 3 november 2026', 'Woensdag 4 november 2026', 'Donderdag 5 november 2026', 'Vrijdag 6 november 2026', 'Zaterdag 7 november 2026', 'Zondag 8 november 2026']);
});

// BESLISSING 474: uit de vorige week van het Dagboek staat in Delen "Vorige week" aan (en niet "Aangepast").
test('Delen: uit de vorige week van het Dagboek staat "Vorige week" aan', async ({ page }) => {
  await vul(page);
  await page.goto('./#/dagboek/week');
  await page.getByRole('button', { name: 'Vorige', exact: true }).click();
  await page.getByRole('button', { name: 'Deze week delen' }).click();
  await expect(page).toHaveURL(/#\/delen\/2026-11-02\/2026-11-08$/);
  await expect(page.getByRole('button', { name: 'Vorige week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Aangepast', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Deze week', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

// BESLISSING 487: "Deze week" op een maandag toont ook in het blokje onder de periodeknoppen "Week van maandag ..." met het aantal dagen eronder.
test('Delen: op een maandag toont het blokje onder de periodeknoppen bij "Deze week" "Week van maandag 16 november 2026"', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 16, 12, 0, 0)); // maandag 16 november 2026
  await vul(page);
  await page.goto('./#/delen');
  await page.getByRole('button', { name: 'Deze week', exact: true }).click();
  await velKlaar(page);
  await expect(page.locator('.delen__periodewoorden')).toContainText('Week van maandag 16 november 2026');
  await expect(page.locator('.delen__periodewoorden')).toContainText('1 dag');
  await expect(page.locator('.delen__periodedatum')).toHaveCSS('text-transform', 'uppercase'); // BESLISSING 467: een label in hoofdletters
});
