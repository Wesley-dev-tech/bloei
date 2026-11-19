// BESLISSINGEN 448, 449 en 455 tot 458 in het verslag van Delen en in de maand van het Dagboek.
// - "Deze week" (de keuze die Delen meegeeft, keuze: 'deze-week') is altijd een weekverslag met noemer 7, ook op maandag (één getoonde dag);
//   de lijst van dagen loopt tot en met vandaag. Elke andere keuze (ook "Aangepast" met toevallig dezelfde datums) houdt het aantal dagen van de periode.
// - Het gemiddelde per dag rekent over alle dagen van de periode die voorbij zijn (vandaag inbegrepen); een dag zonder drank telt als 0. Het voorbeeld
//   op het scherm en de pdf tonen dezelfde waarde (één model).
// - De maand van het Dagboek gebruikt dezelfde regel (gemiddeldOverDagen in logica/drinken-week.js).
// Vaste klok: woensdag 18 november 2026 (de lopende week begint maandag 16 november).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen } from '../../src/kern/datum.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { KEUZE_VORIGE_WEEK, leesVerslag } from '../../src/data/verslag.js';
import { bouwVerslagModel, weekVanTitel } from '../../src/ui/verslag-model.js';
import { maakPdf } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { zetTokensBron } from '../../src/ui/pdf-tokens.js';
import { WEEKDAGEN, gemiddeldOverDagen, vorigeWeekPeriode } from '../../src/logica/drinken-week.js';
import { vatSamen } from '../../src/logica/weekoverzicht.js';

zetTokensBron(readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8'));
const wortel = new URL('../../node_modules/@fontsource/', import.meta.url);
const lees = (pad) => new Uint8Array(readFileSync(new URL(pad, wortel)));
const fonts = () => ({
  serif: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff')),
  serifSchuin: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'), { schuin: -12 }),
  sans: maakFont(lees('jost/files/jost-latin-400-normal.woff')),
  sansMedium: maakFont(lees('jost/files/jost-latin-500-normal.woff')),
});
const gewoon = (tekst) => tekst.replace(/[  ]/g, ' ');
const pdfTeksten = (doc) => maakPdf(doc, fonts(), { meet: true }).meting.teksten.map((x) => gewoon(x.tekst));

const AAN = { eten: true, drinken: true, gewicht: false, notities: false };
const WOENSDAG = '2026-11-18';
const MAANDAG = '2026-11-16';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

beforeEach(async () => {
  await db.delete();
  await openDb();
});

// maandag 2,6 l en een maaltijd, dinsdag niets, woensdag 2,5 l; donderdag (toekomst) 4 l telt nergens mee
async function vul() {
  await bewaarMaaltijd(MAANDAG, 'ontbijt', { tekst: 'testmaaltijd', tijd: '08:00' });
  await voegDrankToe(MAANDAG, 'water', 2600);
  await voegDrankToe(WOENSDAG, 'water', 2500);
  await db.dranken.add({ datum: '2026-11-19', tijdstip: 1, soort: 'water', ml: 4000, voorbeeld: false });
}

describe('het verslag van "Deze week" op woensdag', () => {
  test('de lijst loopt tot en met vandaag, de noemer is 7; voorbeeld en pdf tonen dezelfde cijfers', async () => {
    await vul();
    const v = await leesVerslag({ van: MAANDAG, tot: WOENSDAG, onderdelen: AAN, keuze: 'deze-week' });
    expect(v.dagen.map((d) => d.datum)).toEqual([MAANDAG, '2026-11-17', WOENSDAG]); // geen lege toekomstige dagen
    expect(v.samenvatting).toMatchObject({ dagen: 3, noemer: WEEKDAGEN, ingevuldeDagen: 2, dagdoelDagen: 2 });
    const doc = bouwVerslagModel(v, 'Testnaam');
    expect(doc.samenvatting[0].waarde).toBe('2 van 7');
    expect(doc.kerncijfers.map((c) => [c.label, c.getal, c.onder])).toEqual([
      ['Dagen ingevuld', '2', 'van 7 dagen'],
      ['Maaltijden', '1', 'genoteerd'],
      ['Gedronken', '1,7', 'gemiddeld per dag'], // (2600 + 0 + 2500) / 3 verstreken dagen; donderdag telt niet mee
      ['Dagdoel gehaald', '2', 'van 7 dagen'],
    ]);
    expect(doc.modus).toBe('week');
    expect(doc.dagen).toHaveLength(3);
    expect(pdfTeksten(doc)).toEqual(expect.arrayContaining(['2', 'van 7 dagen', '1,7', 'gemiddeld per dag']));
  });

  test('zondag: de volle week, 7 van 7 is mogelijk, gemiddelde gedeeld door 7', async () => {
    await vul();
    const v = await leesVerslag({ van: MAANDAG, tot: '2026-11-22', onderdelen: AAN, nu: '2026-11-22', keuze: 'deze-week' });
    expect(v.dagen).toHaveLength(7);
    expect(v.samenvatting).toMatchObject({ dagen: 7, noemer: 7, gemiddeldMl: 9100 / 7 });
  });
});

// BESLISSING 457: "Deze week" op een maandag is een weekverslag met één getoonde dag
describe('"Deze week" op maandag', () => {
  test('noemer 7, kerncijfers in de vorm van het weekverslag, titel "Week van ...", ook in de pdf', async () => {
    await vul();
    const v = await leesVerslag({ van: MAANDAG, tot: MAANDAG, onderdelen: AAN, nu: MAANDAG, keuze: 'deze-week' });
    expect(v.dagen).toHaveLength(1);
    expect(v.samenvatting).toMatchObject({ dagen: 1, noemer: 7, ingevuldeDagen: 1, dagdoelDagen: 1 });
    const doc = bouwVerslagModel(v, 'Testnaam', new Date(2026, 10, 16, 12));
    expect(doc.modus).toBe('week');
    expect(doc.samenvatting[0].waarde).toBe('1 van 7');
    expect(doc.kerncijfers.map((c) => [c.label, c.getal, c.onder])).toEqual([
      ['Dagen ingevuld', '1', 'van 7 dagen'],
      ['Maaltijden', '1', 'genoteerd'],
      ['Gedronken', '2,6', 'gemiddeld per dag'],
      ['Dagdoel gehaald', '1', 'van 7 dagen'],
    ]);
    expect(doc.periodeLang).toBe('Week van maandag 16 november 2026');
    expect(weekVanTitel('2026-11-16')).toBe(doc.periodeLang); // BESLISSING 487: het blokje in Delen gebruikt dezelfde functie
    expect(doc.kop.periode).toBe('Week van maandag 16 november');
    const tekst = pdfTeksten(doc);
    expect(tekst).toEqual(expect.arrayContaining(['DAGEN INGEVULD', '1', 'van 7 dagen', 'DAGDOEL GEHAALD']));
    // de titel; hoofdletters of niet volgt BESLISSING 459 (datums als kop in hoofdletters), dus hier zonder onderscheid
    expect(tekst.map((x) => x.toLowerCase())).toContain('week van maandag 16 november 2026');
    expect(tekst).not.toContain('van 6 genoteerd'); // niet de kerncijfers van een dagverslag
  });

  test('"Vandaag" op een maandag blijft een gewoon dagverslag', async () => {
    await vul();
    const v = await leesVerslag({ van: MAANDAG, tot: MAANDAG, onderdelen: AAN, nu: MAANDAG, keuze: 'vandaag' });
    expect(v.samenvatting.noemer).toBe(1);
    const doc = bouwVerslagModel(v);
    expect(doc.modus).toBe('dag');
    expect(doc.samenvatting).toEqual([]);
    expect(doc.kerncijfers.map((c) => c.onder).join(' ')).not.toMatch(/van \d+ dagen/);
  });
});

describe('andere periodes: de noemer blijft het aantal dagen van de periode', () => {
  test('"Aangepast" met toevallig dezelfde datums als deze week houdt zijn eigen noemer', async () => {
    await vul();
    const v = await leesVerslag({ van: MAANDAG, tot: WOENSDAG, onderdelen: AAN, keuze: 'eigen' });
    expect(v.samenvatting).toMatchObject({ dagen: 3, noemer: 3 });
    expect(bouwVerslagModel(v).samenvatting[0].waarde).toBe('2 van 3');
    const zonder = await leesVerslag({ van: MAANDAG, tot: WOENSDAG, onderdelen: AAN }); // zonder keuze: geen weekverslag
    expect(zonder.samenvatting.noemer).toBe(3);
  });

  test('twee weken (14 dagen tot vandaag); voorbeeld en pdf tonen hetzelfde gemiddelde (BESLISSING 455)', async () => {
    await vul();
    const v = await leesVerslag({ van: plusDagen(WOENSDAG, -13), tot: WOENSDAG, onderdelen: AAN, keuze: 'twee' });
    expect(v.samenvatting).toMatchObject({ dagen: 14, noemer: 14 });
    expect(v.samenvatting.gemiddeldMl).toBe(5100 / 14);
    const doc = bouwVerslagModel(v);
    expect(doc.kerncijfers[0].onder).toBe('van 14 dagen');
    expect(doc.kerncijfers[2].getal).toBe('0,36');
    expect(pdfTeksten(doc)).toEqual(expect.arrayContaining(['0,36', 'gemiddeld per dag', 'van 14 dagen']));
  });

  test('een maand (30 dagen)', async () => {
    const v = await leesVerslag({ van: plusDagen(WOENSDAG, -29), tot: WOENSDAG, onderdelen: AAN, keuze: 'maand' });
    expect(v.samenvatting).toMatchObject({ dagen: 30, noemer: 30 });
  });

  test('vandaag en gisteren: één dag, geen "van N dagen" (dagverslag)', async () => {
    await vul();
    for (const [datum, keuze] of [[WOENSDAG, 'vandaag'], ['2026-11-17', 'gisteren']]) {
      const v = await leesVerslag({ van: datum, tot: datum, onderdelen: AAN, keuze });
      expect(v.samenvatting.noemer).toBe(1);
      const doc = bouwVerslagModel(v);
      expect(doc.samenvatting).toEqual([]);
      expect(doc.kerncijfers.map((c) => c.onder).join(' ')).not.toMatch(/van \d+ dagen/);
    }
  });

  test('een eerdere, volle week (vanuit de week van het Dagboek: "Aangepast"): 7 dagen', async () => {
    const v = await leesVerslag({ van: '2026-11-09', tot: '2026-11-15', onderdelen: AAN, keuze: 'eigen' });
    expect(v.samenvatting).toMatchObject({ dagen: 7, noemer: 7 });
  });
});

// BESLISSING 456: de maand van het Dagboek rekent "gem. ... per dag" met dezelfde regel als de week
describe('gemiddeld over een periode (maand van het Dagboek)', () => {
  const ml = { '2026-11-02': 2000, '2026-11-16': 1000, '2026-11-25': 9000 };
  test('de lopende maand: delen door de dagen tot en met vandaag (18), lege dagen tellen als 0, de toekomst nooit', () => {
    expect(gemiddeldOverDagen('2026-11-01', '2026-11-30', (d) => ml[d] ?? 0, WOENSDAG)).toBe(3000 / 18);
  });
  test('een eerdere maand: alle dagen van de maand', () => {
    expect(gemiddeldOverDagen('2026-11-01', '2026-11-30', (d) => ml[d] ?? 0, '2026-12-05')).toBe(12000 / 30);
  });
  test('niets gedronken of een maand in de toekomst: geen gemiddelde', () => {
    expect(gemiddeldOverDagen('2026-11-01', '2026-11-30', () => 0, WOENSDAG)).toBeNull();
    expect(gemiddeldOverDagen('2026-12-01', '2026-12-31', () => 500, WOENSDAG)).toBeNull();
  });
});

// BESLISSING 456: het weekgemiddelde in logica/weekoverzicht.js werd nergens getoond en is weg (één bron: gemiddeldPerDag)
test('vatSamen geeft geen eigen gemiddelde meer', () => {
  const w = vatSamen([{ datum: '2026-11-16', maaltijden: 1, ml: 1000 }, { datum: '2026-11-17', maaltijden: 0, ml: 0 }]);
  expect(w).not.toHaveProperty('gemiddeldMl');
  expect(w.ingevuldeDagen).toBe(1);
});

// BESLISSING 474: de periodekeuze "Vorige week": de volle vorige week van maandag tot en met zondag, een weekverslag met noemer 7
describe('"Vorige week"', () => {
  test.each([
    ['maandag', '2026-11-16', '2026-11-09', '2026-11-15'],
    ['woensdag', '2026-11-18', '2026-11-09', '2026-11-15'],
    ['zondag', '2026-11-22', '2026-11-09', '2026-11-15'],
    ['over een maandgrens', '2026-11-04', '2026-10-26', '2026-11-01'],
    ['over een jaargrens', '2027-01-06', '2026-12-28', '2027-01-03'],
    ['over de wissel naar wintertijd (zondag 25 oktober 2026)', '2026-10-28', '2026-10-19', '2026-10-25'],
    ['over de wissel naar zomertijd (zondag 28 maart 2027)', '2027-03-31', '2027-03-22', '2027-03-28'],
  ])('%s: vandaag %s geeft %s tot en met %s', (_, nu, van, tot) => {
    expect(vorigeWeekPeriode(nu)).toEqual({ van, tot });
  });

  test('een weekverslag: van 7 dagen, gemiddeld gedeeld door 7; voorbeeld en pdf tonen hetzelfde', async () => {
    await bewaarMaaltijd('2026-11-09', 'ontbijt', { tekst: 'testmaaltijd', tijd: '08:00' });
    await voegDrankToe('2026-11-09', 'water', 2600);
    await voegDrankToe('2026-11-10', 'water', 1000);
    await voegDrankToe('2026-11-15', 'water', 2600);
    const { van, tot } = vorigeWeekPeriode(WOENSDAG);
    const v = await leesVerslag({ van, tot, onderdelen: AAN, keuze: KEUZE_VORIGE_WEEK });
    expect(v.weekverslag).toBe(true);
    expect(v.dagen).toHaveLength(7);
    expect(v.samenvatting).toMatchObject({ dagen: 7, noemer: 7, ingevuldeDagen: 3, dagdoelDagen: 2, gemiddeldMl: 6200 / 7 });
    const doc = bouwVerslagModel(v, 'Testnaam');
    expect(doc.modus).toBe('week');
    expect(doc.kerncijfers.map((c) => [c.label, c.getal, c.onder])).toEqual([
      ['Dagen ingevuld', '3', 'van 7 dagen'],
      ['Maaltijden', '1', 'genoteerd'],
      ['Gedronken', '0,89', 'gemiddeld per dag'],
      ['Dagdoel gehaald', '2', 'van 7 dagen'],
    ]);
    expect(pdfTeksten(doc)).toEqual(expect.arrayContaining(['3', 'van 7 dagen', '0,89', 'gemiddeld per dag', '2']));
  });
});
