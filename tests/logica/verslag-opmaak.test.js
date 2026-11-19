// De pdf van het verslag (BESLISSING 302): een afdrukbaar A4-document met nette paginaovergangen; elke tekst binnen zijn vak en binnen de marges,
// niets overlapt, ook met lange teksten. (173, alles op één pagina, is vervangen.)
import 'fake-indexeddb/auto';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { zetEnergie, zetNotitie, zetStemming } from '../../src/data/dagen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { voegSupplementToe } from '../../src/data/supplementen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { unzlibSync } from 'fflate';
import { maakPdf, verslagBestandsnaam, alsLabel, periodeAlsLabel } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { papierKleuren, zetTokensBron } from '../../src/ui/pdf-tokens.js';

zetTokensBron(readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8'));
const dag = (n) => plusDagen(vandaag(), n);
const wortel = new URL('../../node_modules/@fontsource/', import.meta.url);
const lees = (pad) => new Uint8Array(readFileSync(new URL(pad, wortel)));
const fonts = () => ({
  serif: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff')),
  serifSchuin: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'), { schuin: -12 }),
  sans: maakFont(lees('jost/files/jost-latin-400-normal.woff')),
  sansMedium: maakFont(lees('jost/files/jost-latin-500-normal.woff')),
});
const ALLES = { eten: true, drinken: true, supplementen: true, stemming: true, gewicht: true, notities: true };
const RAND = 51;
const B = 595.28;
const H = 841.89;

// De tests noemen vaste data (zondag 15 november 2026): de klok staat daar altijd op, welke dag het echt is.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  await db.delete();
  await openDb();
});

const MAALTIJDEN = ['ontbijt', 'tussendoortje', 'middagmaal', 'vieruurtje', 'avondmaal', 'latesnack'];
const lang = (n, woord = 'lekker ') => woord.repeat(Math.ceil(n / woord.length)).slice(0, n).trim();

// Een volle dag: zes maaltijden met tekst, dranken, drie momenten, stemming, energie, een notitie en een weging.
async function vulDag(datum, { maaltijdTekst = 'havermout met fruit en noten', notitie = 'Een rustige dag, goed geslapen.', n = 0 } = {}) {
  for (const [i, soort] of MAALTIJDEN.entries()) await bewaarMaaltijd(datum, soort, { tekst: maaltijdTekst, tijd: `${String(7 + i * 3).padStart(2, '0')}:15`, gevoel: 1 + ((i + n) % 5) });
  for (const soort of ['water', 'thee', 'koffie', 'sap']) await voegDrankToe(datum, soort, 250);
  await zetStemming(datum, 1 + (n % 5));
  await zetEnergie(datum, 1 + ((n + 2) % 5));
  await zetNotitie(datum, notitie);
}

async function vulSupplementen(namen) {
  const ids = [];
  for (const naam of namen) ids.push((await voegSupplementToe({ naam, dosis: '3x per dag 1 capsule', momenten: ['ochtend', 'middag', 'avond'] })).id);
  return ids;
}

async function model(van, tot, onderdelen = ALLES) {
  return bouwVerslagModel(await leesVerslag({ van, tot, onderdelen }), 'Marie');
}

// Alle teksten binnen hun vak en binnen de paginamarges, en geen twee teksten die elkaar overlappen.
function controleer(meting) {
  const fouten = [];
  const tol = 0.6;
  for (const t of meting.teksten) {
    if (t.x0 < meting.rand - tol || t.x1 > meting.b - meting.rand + tol) fouten.push(`buiten de marge: ${t.tekst.slice(0, 40)} (${t.x0.toFixed(1)}-${t.x1.toFixed(1)})`);
    if (t.top < 0 || t.bottom > meting.h) fouten.push(`buiten de pagina: ${t.tekst.slice(0, 40)}`);
    if (t.vak && (t.x0 < t.vak.x0 - tol || t.x1 > t.vak.x1 + tol || t.top < t.vak.top - 1.5 || t.bottom > t.vak.bottom + 1.5)) {
      fouten.push(`buiten zijn vak: ${t.tekst.slice(0, 40)} x ${t.x0.toFixed(1)}-${t.x1.toFixed(1)} vak ${t.vak.x0.toFixed(1)}-${t.vak.x1.toFixed(1)} y ${t.top.toFixed(1)}-${t.bottom.toFixed(1)} vak ${t.vak.top.toFixed(1)}-${t.vak.bottom.toFixed(1)}`);
    }
  }
  const teksten = meting.teksten;
  for (let i = 0; i < teksten.length; i += 1) {
    for (let j = i + 1; j < teksten.length; j += 1) {
      const a = teksten[i];
      const b = teksten[j];
      if (a.pagina !== b.pagina) continue;
      const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (dx > 0.8 && dy > 1.2) fouten.push(`overlap: "${a.tekst.slice(0, 25)}" en "${b.tekst.slice(0, 25)}"`);
    }
  }
  return fouten;
}

const uitvoer = (naam, bytes) => process.env.PDF_DIR && writeFileSync(`${process.env.PDF_DIR}/${naam}.pdf`, bytes);

// Een gewone dag: drie maaltijden, twee soorten drinken, soms een notitie. n verschuift de uren en hoeveelheden.
async function vulGewoon(datum, n = 0) {
  for (const [i, soort] of ['ontbijt', 'middagmaal', 'avondmaal'].entries()) await bewaarMaaltijd(datum, soort, { tekst: `testmaaltijd ${i + 1} met fruit`, tijd: `${String(8 + i * 5).padStart(2, '0')}:${n % 2 ? '30' : '15'}` });
  await voegDrankToe(datum, 'water', 500 + (n % 4) * 400);
  await voegDrankToe(datum, 'thee', 200);
  if (n % 3 === 0) await zetNotitie(datum, 'Een rustige dag, goed geslapen.');
}

// (vaste spaties tussen getal en eenheid worden gewone spaties, zoals een lezer ze ziet)
const gewoon = (tekst) => tekst.replace(/[  ]/g, ' ');
const paginaTeksten = (meting, i) => meting.teksten.filter((x) => x.pagina === i).map((x) => gewoon(x.tekst));
const alleTeksten = (meting) => meting.teksten.map((x) => gewoon(x.tekst));

describe('de pdf als afdrukbaar A4-document (BESLISSING 302): pagina, kop, voet en paginaovergangen', () => {
  test('één dag, leeg en vol: één staande pagina met kop, voet en alle tekst in zijn vak', async () => {
    const leeg = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    uitvoer('vandaag-leeg', leeg);
    expect(leeg.meting.paginas).toBe(1);
    expect(leeg.meting.b).toBeCloseTo(595.28);
    expect(leeg.meting.h).toBeLessThan(H * 0.85); // BESLISSING 332: een kort verslag op één pagina krijgt een blad zo hoog als zijn inhoud
    expect(controleer(leeg.meting)).toEqual([]);
    expect(alleTeksten(leeg.meting)).toContain('In deze periode staat nog niets.');
    await vulDag(dag(0));
    const vol = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    uitvoer('vandaag-vol', vol);
    expect(vol.meting.paginas).toBe(1);
    expect(controleer(vol.meting)).toEqual([]);
    expect(alleTeksten(vol.meting)).not.toContain('In deze periode staat nog niets.');
  });

  // BESLISSING 332: bij één pagina die niet gevuld is, is het blad zo hoog als de inhoud: bovenmarge + inhoud + ± 24 pt + de voet + ondermarge.
  const voetEnInhoud = (meting) => {
    const voet = meting.teksten.filter((x) => /^(Gemaakt op|Pagina \d+ van)/.test(gewoon(x.tekst)));
    const rest = meting.teksten.filter((x) => !voet.includes(x));
    return { voetTop: Math.min(...voet.map((x) => x.top)), inhoudOnder: Math.max(...rest.map((x) => x.bottom)) };
  };
  const heeftVoetOnderInhoud = (meting) => {
    const { voetTop, inhoudOnder } = voetEnInhoud(meting);
    expect(voetTop - inhoudOnder, 'ruimte tussen de laatste inhoud en de voet').toBeLessThanOrEqual(40);
    expect(voetTop - inhoudOnder).toBeGreaterThan(0);
    expect(Number.isInteger(meting.h), 'hele punten').toBe(true);
    expect(meting.b).toBeCloseTo(595.28);
    expect(meting.paginas).toBe(1);
    expect(meting.h).toBeLessThanOrEqual(H * 0.85);
  };

  test('één dag met 1 maaltijd, met 6 maaltijden en dranken, en met alle onderdelen en een lange notitie: het blad is zo hoog als de inhoud', async () => {
    await bewaarMaaltijd(dag(0), 'ontbijt', { tekst: 'brood', tijd: '08:00' });
    const een = maakPdf(await model(dag(0), dag(0), { eten: true, drinken: false, gewicht: false, notities: false }), fonts(), { meet: true });
    uitvoer('dag-een', een);
    heeftVoetOnderInhoud(een.meting);
    await vulDag(dag(0));
    const zes = maakPdf(await model(dag(0), dag(0), { eten: true, drinken: true, gewicht: false, notities: false }), fonts(), { meet: true });
    uitvoer('dag-zes', zes);
    heeftVoetOnderInhoud(zes.meting);
    expect(zes.meting.h).toBeGreaterThan(een.meting.h);
    await bewaarWeging(dag(0), 70.4);
    await zetNotitie(dag(0), lang(500, 'een lange notitie over de dag '));
    const alles = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    uitvoer('dag-alles', alles);
    heeftVoetOnderInhoud(alles.meting);
    expect(controleer(alles.meting)).toEqual([]);
    // een week en een maand blijven gewone A4-pagina's
    for (let n = 0; n < 30; n += 1) await vulGewoon(dag(n - 29), n);
    for (const [van, tot] of [[-6, 0], [-29, 0]]) {
      const lang_ = maakPdf(await model(dag(van), dag(tot)), fonts(), { meet: true });
      expect(lang_.meting.paginas).toBeGreaterThan(1);
      expect(lang_.meting.h).toBeCloseTo(H);
    }
  });

  test('het grensgeval: net onder en net boven één pagina (of 85 % van een A4)', async () => {
    await vulDag(dag(0));
    let vorige = null;
    let eerstGroter = null;
    for (const n of [100, 300, 600, 900, 1200, 1500, 1800, 2200, 2600, 3000, 3500, 4000, 5000]) {
      await zetNotitie(dag(0), lang(n, 'een lange notitie over de dag '));
      const pdf = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
      const { paginas, h } = pdf.meting;
      if (paginas === 1) {
        // een blad hoogstens 85 % van een A4, anders een gewone A4
        expect(h <= H * 0.85 + 0.01 || Math.abs(h - H) < 0.01, `hoogte ${h}`).toBe(true);
        vorige = { n, h };
      } else {
        expect(h).toBeCloseTo(H);
        eerstGroter ??= { n, paginas };
      }
    }
    expect(vorige, 'er is een geval met één pagina').not.toBeNull();
    expect(eerstGroter, 'en een met meer pagina\'s').not.toBeNull();
    expect(vorige.n).toBeLessThan(eerstGroter.n);
  });

  test('een week blijft hoogstens twee pagina\'s met gewone gegevens; twee weken en een maand blijven klein', async () => {
    for (let n = 0; n < 30; n += 1) await vulGewoon(dag(n - 29), n);
    const week = maakPdf(await model(dag(-6), dag(0)), fonts(), { meet: true });
    uitvoer('week-gewoon', week);
    expect(week.meting.paginas).toBeLessThanOrEqual(2);
    expect(controleer(week.meting)).toEqual([]);
    const tweeWeken = maakPdf(await model(dag(-13), dag(0)), fonts(), { meet: true });
    uitvoer('twee-weken', tweeWeken);
    expect(tweeWeken.meting.paginas).toBeLessThanOrEqual(3);
    const maand = maakPdf(await model(dag(-29), dag(0)), fonts(), { meet: true });
    uitvoer('maand', maand);
    expect(maand.meting.paginas).toBeLessThanOrEqual(7); // elke dagtabel heeft nu een kolomkoprij (was 6)
    expect(controleer(maand.meting)).toEqual([]);
    console.log("PAGINA'S gewoon: week", week.meting.paginas, 'twee weken', tweeWeken.meting.paginas, 'maand', maand.meting.paginas);
  });

  test('de volste week (zes maaltijden, vijf dranken, notitie) blijft binnen drie pagina\'s', async () => {
    for (let n = 0; n < 7; n += 1) await vulDag(dag(n - 6), { n });
    await bewaarWeging(dag(-3), 68.4);
    const week = maakPdf(await model(dag(-6), dag(0)), fonts(), { meet: true });
    uitvoer('week-vol', week);
    expect(week.meting.paginas).toBeLessThanOrEqual(3);
    expect(controleer(week.meting)).toEqual([]);
  });

  test('een maand met zes maaltijden per dag, vier dranken en een notitie (de volste) blijft binnen elf pagina\'s', async () => {
    for (let n = 0; n < 30; n += 1) await vulDag(dag(n - 29), { n });
    for (const n of [-29, -20, -10, -1]) await bewaarWeging(dag(n), 68 + (n % 3) * 0.3);
    const maand = maakPdf(await model(dag(-29), dag(0)), fonts(), { meet: true });
    uitvoer('maand-vol', maand);
    expect(maand.meting.paginas).toBeLessThanOrEqual(11); // drie dagen per pagina: een dag is 180 pt hoog
    expect(controleer(maand.meting)).toEqual([]);
    console.log("PAGINA'S maand vol", maand.meting.paginas);
  });

  test('op elke pagina staan de kop (voornaam en periode) en de voet (gemaakt op, pagina x van y)', async () => {
    for (let n = 0; n < 14; n += 1) await vulDag(dag(n - 13), { n });
    const doc = await model(dag(-13), dag(0));
    const pdf = maakPdf(doc, fonts(), { meet: true, nu: new Date(2026, 10, 15) });
    const m = pdf.meting;
    expect(m.paginas).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < m.paginas; i += 1) {
      const tekst = paginaTeksten(m, i);
      expect(tekst, `kop pagina ${i + 1}`).toContain('Verslag van Marie');
      expect(tekst).toContain('bloei');
      // BESLISSING 459 en 490: de korte periode (label, hoofdletters) staat in de kop van de volgende pagina's; op pagina 1 staat de titel met de volle periode, dus alleen "Verslag van <naam>"
      if (i === 0) expect(tekst).not.toContain(alsLabel(doc.periodeKort));
      else expect(tekst).toContain(alsLabel(doc.periodeKort));
      expect(tekst).toContain(`Pagina ${i + 1} van ${m.paginas}`);
      expect(tekst.some((x) => /^Gemaakt op [a-z]+ \d+ [a-z]+ 2026$/.test(x))).toBe(true);
    }
    expect(alleTeksten(m)).toContain(periodeAlsLabel(doc.periodeLang)); // BESLISSING 461: de periode als label onder de titel op de eerste pagina
    expect(paginaTeksten(m, 1)).not.toContain(periodeAlsLabel(doc.periodeLang));
    // ook bij één pagina staat "Pagina 1 van 1"
    const een = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    expect(alleTeksten(een.meting)).toContain('Pagina 1 van 1');
  });

  test('zonder voornaam staat er "Je verslag" in de kop, zonder "Verslag van"', async () => {
    const doc = bouwVerslagModel(await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen: ALLES }), '');
    const pdf = maakPdf(doc, fonts(), { meet: true });
    expect(alleTeksten(pdf.meting)).toContain('Je verslag');
    expect(alleTeksten(pdf.meting).join(' ')).not.toContain('Verslag van');
  });

  test('een dag breekt niet midden door als ze op één pagina past, en een kop staat nooit alleen onderaan', async () => {
    for (let n = 0; n < 30; n += 1) await vulGewoon(dag(n - 29), n);
    for (const aantal of [7, 14, 21, 30]) {
      const pdf = maakPdf(await model(dag(-(aantal - 1)), dag(0)), fonts(), { meet: true });
      const { cellen } = pdf.meting;
      let band = null;
      for (const c of cellen.filter((q) => q.soort === 'dagkop' || q.soort === 'rij')) {
        if (c.soort === 'dagkop') band = c;
        else if (band) expect(c.pagina, `${aantal} dagen: ${band.tekst} is gebroken`).toBe(band.pagina);
      }
      // onder een dagband staat op dezelfde pagina minstens één rij, tenzij de dag leeg is
      const leeg = pdf.meting.teksten.filter((x) => x.tekst === 'Niets genoteerd');
      for (const b of cellen.filter((c) => c.soort === 'dagkop')) {
        const isLeeg = leeg.some((x) => x.pagina === b.pagina && x.top > b.y && x.bottom < b.y + b.h);
        const eronder = cellen.filter((c) => c.soort === 'rij' && c.pagina === b.pagina && c.y >= b.y + b.h - 0.5 && c.y < b.y + b.h + 40);
        if (!isLeeg) expect(eronder.length, `${b.tekst} staat alleen`).toBeGreaterThan(0);
      }
    }
  });

  test('de kolommen staan in het hele document op dezelfde x, en de kolomkop komt op elke pagina met dagen terug', async () => {
    for (let n = 0; n < 30; n += 1) await vulGewoon(dag(n - 29), n);
    const pdf = maakPdf(await model(dag(-29), dag(0)), fonts(), { meet: true });
    const { cellen, paginas } = pdf.meting;
    for (const kolom of [0, 1]) expect(new Set(cellen.filter((c) => c.soort === 'rij' && c.kolom === kolom).map((c) => c.x.toFixed(2))).size, `kolom ${kolom}`).toBe(1);
    const koppen = cellen.filter((c) => c.soort === 'kop');
    for (const kolom of [0, 1]) expect(new Set(koppen.filter((c) => c.kolom === kolom).map((c) => c.x.toFixed(2))).size).toBe(1);
    // elke dagtabel heeft zijn eigen kolomkoprij (Maaltijd | Wat), direct onder de dagband (BESLISSING 316, 336)
    // BESLISSING 420: een dag kan tussen twee rijen gesplitst worden; het vervolg heeft dan zijn eigen band "(vervolg)" met de kolomkop eronder
    const banden = cellen.filter((c) => c.soort === 'dagkop');
    expect(banden.filter((b) => !b.tekst.endsWith('(vervolg)'))).toHaveLength(30);
    for (const b of banden) {
      const kop = koppen.find((c) => c.pagina === b.pagina && c.kolom === 0 && Math.abs(c.y - (b.y + 21)) < 0.6);
      expect(kop, `kolomkop onder ${b.tekst}`).toBeTruthy();
    }
    expect(koppen.filter((c) => c.kolom === 0).map((c) => c.tekst)).toEqual(Array(banden.length).fill('Maaltijd'));
    expect(paginas).toBeGreaterThanOrEqual(3);
    // BESLISSING 336: geen kolom Uur, nergens een uur in het verslag
    expect(pdf.meting.teksten.filter((x) => /^\d{2}:\d{2}$/.test(x.tekst))).toEqual([]);
    expect(koppen.map((c) => c.tekst)).not.toContain('Uur');
  });

  test('geen bijna lege laatste pagina: de laatste pagina heeft altijd meer dan een paar regels', async () => {
    for (let n = 0; n < 30; n += 1) await vulGewoon(dag(n - 29), n);
    const gemeten = [];
    for (let aantal = 6; aantal <= 30; aantal += 1) {
      const pdf = maakPdf(await model(dag(-(aantal - 1)), dag(0)), fonts(), { meet: true });
      const { eindPerPagina, top, paginas } = pdf.meting;
      gemeten.push([aantal, paginas, Math.round(eindPerPagina.at(-1) - top)]);
      if (paginas > 1) expect(eindPerPagina.at(-1) - top, `${aantal} dagen: laatste pagina te leeg`).toBeGreaterThanOrEqual(150);
    }
    console.log("LAATSTE PAGINA [dagen, pagina's, gebruikte hoogte]", JSON.stringify(gemeten));
  });

  test('lange teksten: een maaltijd van 200 tekens, een woord van 120 tekens, een notitie van 600 tekens en tien dranken breken binnen hun kolom', async () => {
    const datum = dag(-1);
    await vulDag(datum, { maaltijdTekst: lang(200), notitie: lang(600, 'rustig ') });
    await bewaarMaaltijd(datum, 'ontbijt', { tekst: 'W'.repeat(120), tijd: '07:00' });
    for (let i = 0; i < 10; i += 1) await voegDrankToe(datum, ['water', 'thee', 'koffie', 'sap', 'frisdrank', 'anders'][i % 6], 150);
    const dagPdf = maakPdf(await model(datum, datum), fonts(), { meet: true });
    uitvoer('lang-dag', dagPdf);
    expect(controleer(dagPdf.meting)).toEqual([]);
    expect(dagPdf.meting.paginas).toBeLessThanOrEqual(2);
    // gelijke regelafstand binnen een tekst
    const notitie = dagPdf.meting.teksten.filter((x) => x.tekst.startsWith('rustig'));
    const afstanden = notitie.slice(1).map((x, i) => +(x.top - notitie[i].top).toFixed(2));
    expect(afstanden.length).toBeGreaterThan(3);
    expect(new Set(afstanden).size).toBe(1);
  });

  test('een notitie van 14000 tekens loopt over de pagina\'s met dezelfde kolomkop en zonder tekst buiten zijn vak', async () => {
    await vulDag(dag(-2));
    await zetNotitie(dag(-2), lang(14000, 'rustig verhaal '));
    await vulDag(dag(-1));
    const pdf = maakPdf(await model(dag(-2), dag(-1)), fonts(), { meet: true });
    uitvoer('notitie-zeer-lang', pdf);
    expect(pdf.meting.paginas).toBeGreaterThanOrEqual(3);
    expect(controleer(pdf.meting)).toEqual([]);
    const koppen = pdf.meting.cellen.filter((c) => c.soort === 'kop' && c.kolom === 0);
    expect(new Set(koppen.map((c) => c.pagina)).size).toBe(pdf.meting.paginas);
  });

  test('een lege periode: één pagina met de kop en "In deze periode staat nog niets."', async () => {
    const pdf = maakPdf(await model(dag(-6), dag(0)), fonts(), { meet: true });
    uitvoer('week-leeg', pdf);
    expect(pdf.meting.paginas).toBe(1);
    expect(alleTeksten(pdf.meting)).toEqual(expect.arrayContaining(['Verslag van Marie', 'In deze periode staat nog niets.', 'Pagina 1 van 1']));
    expect(pdf.meting.cellen.filter((c) => c.soort === 'kop')).toHaveLength(0);
  });
});

describe('de inhoud van de pdf (BESLISSING 284 en 285)', () => {
  const GEEN = ['Gevoel', 'GEVOEL', 'upplement', 'temming', 'nergie', 'Vitamine D'];

  test('alleen de aangevinkte onderdelen staan erin; nooit gevoel, supplementen, stemming of energie', async () => {
    for (let n = 0; n < 7; n += 1) await vulDag(dag(n - 6), { n, notitie: 'testnotitie voor de diëtiste' });
    await vulSupplementen(['Vitamine D']);
    await bewaarWeging(dag(-3), 68.4);
    const tekstVan = async (onderdelen) => alleTeksten(maakPdf(await model(dag(-6), dag(0), onderdelen), fonts(), { meet: true }).meting).join('\n');
    const alles = await tekstVan({ eten: true, drinken: true, gewicht: true, notities: true });
    // één weging: geen tabel, het kerncijfer zegt het (gewicht, eenheid en de datum eronder)
    for (const stuk of ['havermout met fruit', 'l van 2,5 l', 'LAATSTE WEGING', '68,4\nkg\ndo 12 november', 'testnotitie voor de diëtiste', 'Notitie']) expect(alles).toContain(stuk);
    expect(alles).not.toContain('VERSCHIL MET DE VORIGE');
    for (const woord of GEEN) expect(alles).not.toContain(woord);
    const standaard = await tekstVan({ eten: true, drinken: true });
    expect(standaard).toContain('havermout met fruit');
    expect(standaard).toContain('l van 2,5 l');
    for (const stuk of ['68,4', 'testnotitie', 'Notitie', 'Gewicht', 'WEGING']) expect(standaard).not.toContain(stuk);
    const alleenEten = await tekstVan({ eten: true });
    expect(alleenEten).toContain('havermout met fruit');
    for (const stuk of ['Drinken', 'l van 2,5 l', 'GEDRONKEN', 'gemiddeld per dag', 'Dagdoel']) expect(alleenEten).not.toContain(stuk);
    const alleenDrinken = await tekstVan({ drinken: true });
    expect(alleenDrinken).toContain('l van 2,5 l');
    for (const stuk of ['havermout', 'MAALTIJDEN', 'UUR']) expect(alleenDrinken).not.toContain(stuk);
    const alleenNotities = await tekstVan({ notities: true });
    expect(alleenNotities).toContain('testnotitie');
    expect(alleenNotities).not.toContain('havermout');
  });

  test('de dagen staan in oplopende volgorde, elk met zijn datum met jaar', async () => {
    for (let n = 0; n < 21; n += 1) await vulGewoon(dag(n - 20), n);
    const doc = await model(dag(-20), dag(0));
    const pdf = maakPdf(doc, fonts(), { meet: true });
    const banden = pdf.meting.cellen.filter((c) => c.soort === 'dagkop').map((c) => c.tekst);
    expect(banden).toEqual(doc.dagen.map((d) => d.titelJaar));
    expect(banden[0]).toMatch(/^[A-Z][a-z]+ \d+ [a-z]+ \d{4}$/);
  });

  test('de kerncijfers kloppen met de gezaaide gegevens: dagen, maaltijden, gemiddelde en dagdoel', async () => {
    // 5 dagen met drie maaltijden; drie dagen 2,5 l of meer water, twee dagen 1 l
    for (const [n, ml] of [[-6, 2500], [-5, 3000], [-4, 1000], [-3, 2500], [-2, 1000]]) {
      for (const [i, soort] of ['ontbijt', 'middagmaal', 'avondmaal'].entries()) await bewaarMaaltijd(dag(n), soort, { tekst: 'testmaaltijd', tijd: `${String(8 + i * 5).padStart(2, '0')}:00` });
      await voegDrankToe(dag(n), 'water', ml);
    }
    const pdf = maakPdf(await model(dag(-6), dag(0)), fonts(), { meet: true });
    const tekst = alleTeksten(pdf.meting);
    // per kerncijfer: label, getal, (eenheid) en onderregel. BESLISSING 449: het gemiddelde over de 7 dagen, de twee lege dagen tellen als 0 (10 000 / 7 = 1,43 l)
    expect(tekst).toEqual(expect.arrayContaining(['5', 'van 7 dagen', '15', 'genoteerd', '1,43', 'l', 'gemiddeld per dag', '3']));
    for (const label of ['DAGEN INGEVULD', 'MAALTIJDEN', 'GEDRONKEN', 'DAGDOEL GEHAALD']) expect(tekst).toContain(label);
    // gewicht staat aan maar er is niet gewogen: het kerncijfer toont een streepje en zegt het, geen leeg blok en geen tabel
    expect(tekst).toEqual(expect.arrayContaining(['LAATSTE WEGING', '-']));
    expect(tekst.join(' ')).toContain('niet gewogen in deze periode'); // de onderregel mag over twee regels staan
    expect(tekst).not.toContain('VERSCHIL MET DE VORIGE');
    // de band van een dag zegt hoeveel maaltijden en hoeveel er gedronken is
    expect(tekst.filter((x) => x.startsWith('3 maaltijden · '))).toHaveLength(5);
    expect(tekst.filter((x) => x === 'Niets genoteerd')).toHaveLength(2);
    // het drinken tegenover het dagdoel
    expect(tekst).toEqual(expect.arrayContaining(['2,5 l van 2,5 l', '3 l van 2,5 l', '1 l van 2,5 l']));
    expect(tekst.filter((x) => x.endsWith('dagdoel gehaald'))).toHaveLength(3);
  });

  test('het gewicht: een korte tabel met datum, kg en het verschil met de vorige weging, neutraal', async () => {
    for (const [n, kg] of [[-27, 68.4], [-20, 68.9], [-10, 68.1], [-1, 68.1]]) await bewaarWeging(dag(n), kg);
    await vulGewoon(dag(-1));
    const pdf = maakPdf(await model(dag(-29), dag(0), { eten: true, gewicht: true }), fonts(), { meet: true });
    const tekst = alleTeksten(pdf.meting);
    expect(tekst).toEqual(expect.arrayContaining(['68,4 kg', '68,9 kg', '68,1 kg', '+0,5 kg', '-0,8 kg', '0,0 kg', 'LAATSTE WEGING', 'DATUM', 'GEWICHT', 'VERSCHIL MET DE VORIGE', 'VERSCHIL MET DE EERSTE']));
    expect(tekst.filter((x) => /^[a-z]{2} \d+ [a-z]+ 20\d{2}$/.test(x))).toHaveLength(4);
    const woorden = tekst.join(' ').toLowerCase();
    for (const oordeel of ['goed', 'slecht', 'te veel', 'afgevallen', 'aangekomen', 'streef', '%']) expect(woorden).not.toContain(oordeel);
    // getallen in kolommen rechts uitgelijnd: de kg-waarden in de tabel eindigen op dezelfde x
    const kg = pdf.meting.teksten.filter((x) => /^6\d,\d kg$/.test(gewoon(x.tekst)) && x.x1 < 300);
    expect(kg.length).toBeGreaterThanOrEqual(4);
    expect(new Set(kg.map((x) => x.x1.toFixed(1))).size).toBe(1);
  });

  test('zwart-wit: de tekst is donker genoeg en de lijnen blijven zichtbaar', () => {
    const k = papierKleuren();
    const lum = (c) => 0.2126 * c[0] ** 2.2 + 0.7152 * c[1] ** 2.2 + 0.0722 * c[2] ** 2.2;
    const contrast = (c) => 1.05 / (lum(c) + 0.05);
    expect(contrast(k.tekst)).toBeGreaterThan(10);
    expect(contrast(k.gedempt)).toBeGreaterThan(4.4);
    expect(contrast(k.lijnSterk)).toBeGreaterThan(1.5);
  });

  test('de pdf is voor het papier gemaakt: metadata in het Nederlands, geen naam in het bestand, een duidelijke bestandsnaam', async () => {
    await vulGewoon(dag(-1));
    const doc = await model(dag(-6), dag(0));
    const bytes = maakPdf(doc, fonts(), { nu: new Date(2026, 10, 15, 14, 5, 9) });
    const tekst = Buffer.from(bytes).toString('latin1');
    expect(tekst).toContain('/Lang (nl-BE)');
    expect(tekst).toContain('/DisplayDocTitle true');
    expect(tekst).toMatch(/\/CreationDate \(D:20261115140509[+-]\d\d'\d\d'\)/);
    const titel = /\/Title <feff([0-9a-f]+)>/.exec(tekst)[1];
    const gelezen = titel.match(/.{4}/g).map((h) => String.fromCharCode(parseInt(h, 16))).join('');
    expect(gelezen).toBe(`Verslag van Marie, ${doc.periodeKort}`);
    expect(tekst).not.toContain('/Author');
    expect(tekst).not.toContain('Peeters');
    expect(bytes.paginas).toBe(1);
    expect(verslagBestandsnaam({ van: '2026-11-09', tot: '2026-11-15' })).toBe('bloei-verslag-2026-11-09-2026-11-15.pdf');
    expect(verslagBestandsnaam({ van: '2026-11-09', tot: '2026-11-09' })).toBe('bloei-verslag-2026-11-09.pdf');
  });
});


describe('structuur: elk gegeven op zijn eigen plek, in vaste kolommen', () => {
  const tweeUren = /\d{2}:\d{2}.*\d{2}:\d{2}/;

  test('een tabel met een eigen rij per ingevulde maaltijd in de volgorde van de dag; geen tekstvak met twee uren of twee maaltijden', async () => {
    await vulDag(dag(0));
    await vulSupplementen(['Vitamine D']);
    const pdf = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    uitvoer('vandaag-gewoon', pdf);
    const rijen = pdf.meting.cellen.filter((c) => c.soort === 'rij' && c.kolom === 0);
    expect(rijen.map((c) => c.tekst)).toEqual(['Ontbijt', 'Tussendoortje', 'Middagmaal', 'Vieruurtje', 'Avondmaal', 'Late snack', 'Notitie', 'Drinken']); // Drinken is de voetrij van de tabel
    expect(new Set(rijen.map((c) => c.y.toFixed(1))).size).toBe(rijen.length);
    expect(pdf.meting.teksten.filter((x) => tweeUren.test(x.tekst))).toEqual([]);
    // een dag zonder band: de titel van de pagina is de datum
    expect(pdf.meting.cellen.filter((c) => c.soort === 'dagkop')).toHaveLength(0);
    // geen supplementen, ook al zijn ze bijgehouden
    expect(alleTeksten(pdf.meting).join(' ')).not.toContain('Vitamine');
  });

  test('een niet-ingevulde maaltijd blijft weg (overal gelijk); een onderdeel zonder gegevens op een dag met gegevens toont een streepje', async () => {
    await bewaarMaaltijd(dag(0), 'ontbijt', { tekst: 'brood', tijd: '08:00' });
    const pdf = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    expect(pdf.meting.cellen.filter((c) => c.soort === 'rij' && c.kolom === 0).map((c) => c.tekst)).toEqual(['Ontbijt', 'Drinken']);
    expect(pdf.meting.teksten.filter((x) => x.tekst === '-')).toHaveLength(1); // Drinken: geen dranken op die dag
    // een dag met alleen een drank toont bij Eten een streepje
    await db.maaltijden.clear();
    await voegDrankToe(dag(0), 'water', 500);
    const drank = maakPdf(await model(dag(0), dag(0)), fonts(), { meet: true });
    expect(drank.meting.cellen.filter((c) => c.soort === 'rij' && c.kolom === 0).map((c) => c.tekst)).toEqual(['Eten', 'Drinken']);
  });

  test('een volle week met lange teksten gaat verder op een volgende pagina met dezelfde kop, en niets valt buiten zijn vak', async () => {
    for (let n = 0; n < 7; n += 1) await vulDag(dag(n - 6), { n, maaltijdTekst: lang(260), notitie: lang(500, 'rustig ') });
    const pdf = maakPdf(await model(dag(-6), dag(0)), fonts(), { meet: true });
    uitvoer('week-lang', pdf);
    expect(pdf.meting.paginas).toBeGreaterThanOrEqual(3);
    expect(controleer(pdf.meting)).toEqual([]);
    // de kolomkoppen staan op elke pagina
    const koppen = pdf.meting.cellen.filter((c) => c.soort === 'kop' && c.kolom === 0);
    expect(new Set(koppen.map((c) => c.pagina)).size).toBe(pdf.meting.paginas);
  });
});

// De bovenkant van het verslag en de dagtabellen (BESLISSING 315 en 316): gevallen met 0, 1, 2 en 5 wegingen, een week en een maand.
describe('de kerncijfers, het gewicht en de dagtabellen', () => {
  // Een gewone dag met de late snack vóór het avondmaal op het uur (het uur sorteert anders dan de dag).
  async function vulKop(aantal, wegingen) {
    for (let n = 0; n < aantal; n += 1) {
      const d = dag(n - (aantal - 1));
      await bewaarMaaltijd(d, 'ontbijt', { tekst: 'verzonnen havermout met fruit', tijd: '08:15' });
      await bewaarMaaltijd(d, 'avondmaal', { tekst: 'soep en brood', tijd: '19:44' });
      await bewaarMaaltijd(d, 'latesnack', { tekst: 'appel', tijd: '19:07' });
      await voegDrankToe(d, 'water', 1800 + (n % 3) * 400);
      if (n % 2 === 0) await voegDrankToe(d, 'koffie', 150);
      if (n % 3 === 0) await zetNotitie(d, 'Verzonnen notitie, een rustige dag.');
    }
    for (let i = 0; i < wegingen; i += 1) await bewaarWeging(dag(-i * 7), 70 - (wegingen - 1 - i) * 0.3 + (i % 2) * 0.5); // één per week
  }
  const GEVALLEN = [
    ['week', 7, 0, true],
    ['week', 7, 1, true],
    ['week', 7, 1, false],
    ['maand', 30, 0, true],
    ['maand', 30, 2, true],
    ['maand', 30, 5, true],
    ['maand', 30, 5, false],
  ];
  for (const [naam, aantal, wegingen, alles] of GEVALLEN) {
    test(`geval ${naam}, ${wegingen} wegingen, ${alles ? 'alle vier' : 'Eten en Drinken'}: past, geen tekst buiten zijn vak`, async () => {
      await vulKop(aantal, wegingen);
      const onderdelen = alles ? { eten: true, drinken: true, gewicht: true, notities: true } : { eten: true, drinken: true, gewicht: false, notities: false };
      const pdf = maakPdf(await model(dag(-(aantal - 1)), dag(0), onderdelen), fonts(), { meet: true });
      uitvoer(`kop-${naam}-w${wegingen}-${alles ? 'alles' : 'ed'}`, pdf);
      expect(controleer(pdf.meting)).toEqual([]);
    });
  }

  const ALLE4 = { eten: true, drinken: true, gewicht: true, notities: true };

  test('kerncijfers: exact even brede blokken van marge tot marge, labels, getallen en onderregels elk op één lijn', async () => {
    await vulKop(30, 5);
    const pdf = maakPdf(await model(dag(-29), dag(0), ALLE4), fonts(), { meet: true });
    const { cellen, teksten, rand, b } = pdf.meting;
    const kc = cellen.filter((c) => c.soort === 'kerncijfer');
    expect(kc).toHaveLength(5);
    expect(kc[0].x).toBeCloseTo(rand, 1);
    expect(kc.at(-1).x + kc.at(-1).w).toBeCloseTo(b - rand, 1);
    for (let i = 1; i < kc.length; i += 1) {
      expect(kc[i].w).toBeCloseTo(kc[0].w, 2);
      expect(kc[i].x - kc[i - 1].x).toBeCloseTo(kc[0].w, 2); // scheidingslijnen op gelijke afstand
    }
    const op = (re) => teksten.filter((x) => x.pagina === 0 && re.test(x.tekst));
    const labels = op(/^(DAGEN INGEVULD|MAALTIJDEN|GEDRONKEN|DAGDOEL GEHAALD|LAATSTE WEGING)$/);
    expect(labels).toHaveLength(5);
    expect(new Set(labels.map((x) => x.top.toFixed(1))).size).toBe(1);
    const getallen = op(/^(30|90|2,28|10|68,8)$/);
    expect(getallen).toHaveLength(5);
    expect(new Set(getallen.map((x) => x.bottom.toFixed(1))).size).toBe(1);
    const onder = op(/^(van 30 dagen|genoteerd|gemiddeld per dag|zo 15 november)$/);
    expect(onder).toHaveLength(5);
    expect(new Set(onder.map((x) => x.top.toFixed(1))).size).toBe(1);
  });

  test('met drie of vier kerncijfers blijven de blokken even breed over de volle breedte', async () => {
    await vulKop(30, 0);
    for (const onderdelen of [{ eten: true, drinken: true }, { eten: false, drinken: true }, { eten: true, drinken: false }]) {
      const pdf = maakPdf(await model(dag(-29), dag(0), onderdelen), fonts(), { meet: true });
      const kc = pdf.meting.cellen.filter((c) => c.soort === 'kerncijfer');
      expect(kc.length).toBeGreaterThanOrEqual(2);
      expect(kc.at(-1).x + kc.at(-1).w).toBeCloseTo(pdf.meting.b - pdf.meting.rand, 1);
      for (const c of kc) expect(c.w).toBeCloseTo(kc[0].w, 2);
    }
  });

  test('één weging: geen gewichtstabel, de datum staat in het kerncijfer; niet gewogen: een streepje met uitleg', async () => {
    await vulKop(7, 1);
    const een = maakPdf(await model(dag(-6), dag(0), ALLE4), fonts(), { meet: true });
    const t1 = alleTeksten(een.meting);
    expect(t1).not.toContain('DATUM');
    expect(t1).not.toContain('VERSCHIL MET DE VORIGE');
    expect(t1.filter((x) => /^[a-z]{2} \d+ november$/.test(x))).toHaveLength(1);
    expect(een.meting.cellen.filter((c) => c.soort === 'gewicht')).toHaveLength(0);
    await db.wegingen.clear();
    const geen = maakPdf(await model(dag(-6), dag(0), ALLE4), fonts(), { meet: true });
    expect(alleTeksten(geen.meting)).toEqual(expect.arrayContaining(['LAATSTE WEGING', '-']));
    expect(alleTeksten(geen.meting).join(' ')).toContain('niet gewogen in deze periode');
    expect(geen.meting.cellen.filter((c) => c.soort === 'gewicht')).toHaveLength(0);
  });

  test('twee of meer wegingen: een tabel over de volle breedte, getallen rechts uitgelijnd onder hun kop, neutrale verschillen, de eerste rij met streepjes', async () => {
    await vulKop(30, 5);
    const pdf = maakPdf(await model(dag(-29), dag(0), ALLE4), fonts(), { meet: true });
    const { teksten, rand, b } = pdf.meting;
    const rij = teksten.filter((x) => x.pagina === 0 && x.tekst.length && /^[a-z]{2} \d+ \w+ 20\d{2}$/.test(x.tekst));
    expect(rij).toHaveLength(5);
    const kop = (naam) => teksten.find((x) => x.tekst === naam);
    for (const [naam, re] of [['GEWICHT', /^\d{2},\d kg$/], ['VERSCHIL MET DE VORIGE', /^[+-]\d,\d kg$|^-$/], ['VERSCHIL MET DE EERSTE', /^[+-]\d,\d kg$|^-$/]]) {
      const k = kop(naam);
      expect(k, naam).toBeTruthy();
      const waarden = teksten.filter((x) => x.pagina === k.pagina && x.top > k.bottom && x.top < k.bottom + 120 && re.test(gewoon(x.tekst).replace(/ /g, ' ')) && Math.abs(x.x1 - k.x1) < 8);
      expect(waarden.length, naam).toBeGreaterThanOrEqual(4);
      for (const w of waarden) expect(Math.abs(w.x1 - waarden[0].x1), naam).toBeLessThan(0.1); // rechts uitgelijnd
    }
    expect(kop('VERSCHIL MET DE EERSTE').x1).toBeLessThanOrEqual(b - rand);
    expect(kop('VERSCHIL MET DE EERSTE').x1).toBeGreaterThan(b - rand - 10); // loopt tot de rechtermarge
    const streepjes = teksten.filter((x) => x.pagina === 0 && x.tekst === '-' && x.top > kop('DATUM').bottom && x.top < kop('DATUM').bottom + 30);
    expect(streepjes).toHaveLength(2); // de eerste rij: geen verschil met de vorige en met de eerste
    expect(alleTeksten(pdf.meting).join(' ').toLowerCase()).not.toMatch(/goed|slecht|afgevallen|aangekomen|streef|%/);
  });

  test('elke dagtabel: band, kolomkop Maaltijd | Wat, maaltijden in de vaste volgorde van de dag, Notitie in de kolom Wat, Drinken als voetrij', async () => {
    await vulKop(7, 0);
    const pdf = maakPdf(await model(dag(-6), dag(0), ALLE4), fonts(), { meet: true });
    const { cellen, teksten } = pdf.meting;
    const banden = cellen.filter((c) => c.soort === 'dagkop');
    expect(banden).toHaveLength(7);
    expect(cellen.filter((c) => c.soort === 'kop' && c.kolom === 0).map((c) => c.tekst)).toEqual(Array(7).fill('Maaltijd'));
    expect(new Set(cellen.filter((c) => c.soort === 'kop' && c.kolom === 1).map((c) => c.x.toFixed(2))).size).toBe(1);
    // ontbijt, avondmaal (19:44), late snack (19:07): de volgorde van de dag, niet die van het uur
    const eerste = cellen.filter((c) => c.soort === 'rij' && c.kolom === 0).slice(0, 5).map((c) => c.tekst);
    expect(eerste).toEqual(['Ontbijt', 'Avondmaal', 'Late snack', 'Notitie', 'Drinken']);
    // Notitie staat in dezelfde kolom Wat als de andere rijen (geen lege middencel) en Drinken is de laatste rij van de dag
    expect(new Set(cellen.filter((c) => c.soort === 'rij' && c.kolom === 1).map((c) => c.x.toFixed(2))).size).toBe(1);
    expect(cellen.filter((c) => c.soort === 'rij' && c.kolom === 2)).toEqual([]);
    // de band zegt het aantal maaltijden en het gedronken totaal
    expect(teksten.some((x) => /^3 maaltijden · [\d,]+ l gedronken$/.test(gewoon(x.tekst).replace(/ /g, ' ')))).toBe(true);
  });

  test('een dagtabel die over een pagina loopt, begint op de volgende pagina opnieuw met band (vervolg) en kolomkop', async () => {
    for (let n = 0; n < 3; n += 1) await vulDag(dag(n - 2), { n, notitie: lang(5200, 'rustig verhaal ') });
    const pdf = maakPdf(await model(dag(-2), dag(0), ALLE4), fonts(), { meet: true });
    uitvoer('kop-vervolg', pdf);
    const { cellen } = pdf.meting;
    const vervolgen = cellen.filter((c) => c.soort === 'dagkop' && c.tekst.endsWith('(vervolg)'));
    expect(vervolgen.length).toBeGreaterThan(0);
    for (const b of cellen.filter((c) => c.soort === 'dagkop')) expect(cellen.some((c) => c.soort === 'kop' && c.kolom === 0 && c.pagina === b.pagina && Math.abs(c.y - (b.y + 21)) < 0.6), b.tekst).toBe(true);
    for (const v of vervolgen) expect(v.pagina).toBeGreaterThan(0);
    expect(controleer(pdf.meting)).toEqual([]);
  });

  test('een dag zonder gegevens is een smalle tabel van één rij "Niets genoteerd" in hetzelfde kader', async () => {
    await vulKop(7, 0);
    await db.maaltijden.where('datum').equals(dag(-3)).delete();
    await db.dranken.where('datum').equals(dag(-3)).delete();
    await db.dagen.where('datum').equals(dag(-3)).delete();
    const pdf = maakPdf(await model(dag(-6), dag(0), ALLE4), fonts(), { meet: true });
    const band = pdf.meting.cellen.find((c) => c.soort === 'dagkop' && c.tekst.startsWith('Woensdag 11') || c.tekst === 'Woensdag 11 november 2026');
    expect(alleTeksten(pdf.meting).filter((x) => x === 'Niets genoteerd')).toHaveLength(1);
    expect(band).toBeTruthy();
    expect(pdf.meting.cellen.filter((c) => c.soort === 'kop' && c.kolom === 0)).toHaveLength(6);
  });
});

describe('één kleur (BESLISSING 373): lavendel, naast de tekst, het gedempte grijs en de lijnen', () => {
  const hexNaarRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  // De kleuren van het beeldmerk bovenaan: dat is het merk, geen onderdeel van het blad.
  const merk = [...readFileSync(new URL('../../bloei-huisstijl/logo/bloei-mark.svg', import.meta.url), 'utf8').matchAll(/#[0-9a-f]{6}/gi)].map((m) => hexNaarRgb(m[0]));

  // Alle kleuren (rg en RG) in de pagina-inhoud van de pdf.
  function kleurenIn(bytes) {
    const ruw = Buffer.from(bytes).toString('latin1');
    const gevonden = new Set();
    for (const m of ruw.matchAll(/\/Filter \/FlateDecode[^>]*>>\s*stream\r?\n/g)) {
      const van = m.index + m[0].length;
      const tot = ruw.indexOf('endstream', van);
      let inhoud;
      try {
        inhoud = Buffer.from(unzlibSync(Uint8Array.from(Buffer.from(ruw.slice(van, tot).replace(/\r?\n$/, ''), 'latin1')))).toString('latin1');
      } catch {
        continue; // een lettertype of tabel, geen pagina
      }
      for (const k of inhoud.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (?:rg|RG)\b/g)) gevonden.add(`${k[1]} ${k[2]} ${k[3]}`);
    }
    return [...gevonden].map((s) => s.split(' ').map(Number));
  }

  const dicht = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.003);

  test('de pdf van één dag, een week en een maand, met alle onderdelen en met enkele, bevat alleen kleuren uit de vaste lijst', async () => {
    for (let n = 0; n < 30; n += 1) {
      await vulGewoon(dag(n - 29), n);
      if (n % 3 === 0) await zetNotitie(dag(n - 29), 'Verzonnen notitie.');
    }
    await bewaarWeging(dag(0), 70.4);
    await bewaarWeging(dag(-7), 70.9);
    const k = papierKleuren();
    const toegestaan = [k.tekst, k.gedempt, k.lijnSterk, k.lavendel.vol, k.lavendel.zacht, k.lavendel.donker, [1, 1, 1], ...merk];
    const gezien = [];
    for (const dagen of [1, 7, 30]) {
      for (const onderdelen of [{ eten: true, drinken: true, gewicht: true, notities: true }, { eten: false, drinken: true, gewicht: false, notities: false }, { eten: true, drinken: false, gewicht: false, notities: true }]) {
        const bytes = maakPdf(await model(dag(1 - dagen), dag(0), onderdelen), fonts());
        for (const c of kleurenIn(bytes)) {
          gezien.push(c);
          expect(toegestaan.some((t) => dicht(c, t)), `kleur ${c.join(' ')} bij ${dagen} dag(en)`).toBe(true);
        }
      }
    }
    // niet leeg: de lavendeltinten komen echt voor (tegels, dagband, balk)
    for (const l of [k.lavendel.vol, k.lavendel.zacht, k.lavendel.donker]) expect(gezien.some((c) => dicht(c, l))).toBe(true);
  });

  test('lavendel: icoon donker op zacht en tekst op zacht minstens 4,5:1; in zwart-wit blijft de balk te onderscheiden van haar spoor', () => {
    const k = papierKleuren();
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const verhouding = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(verhouding(k.lavendel.donker, k.lavendel.zacht)).toBeGreaterThanOrEqual(4.5);
    expect(verhouding(k.tekst, k.lavendel.zacht)).toBeGreaterThanOrEqual(4.5);
    expect(verhouding(k.gedempt, k.lavendel.zacht)).toBeGreaterThanOrEqual(4.5);
    expect(verhouding(k.lavendel.vol, k.lavendel.zacht)).toBeGreaterThanOrEqual(2); // balk tegen spoor, ook als grijs
  });
});
