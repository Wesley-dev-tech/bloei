// De datumkoppen in de pdf (BESLISSINGEN 459 en 461) en het rechte koppelteken (BESLISSING 460):
// - de titel is het woord "Verslag" in de schreefletter, eronder de periode als label: hoofdletters (nl-BE), sans medium, gespatieerd, een bereik met " - ";
// - de dagkoppen (ook "(vervolg)") en de korte periode in de paginakop staan in labelvorm; de cel van de meting houdt de gewone tekst;
// - geen enkel koppelteken (U+002D) staat in de schreefletter: ook een "-" in een groot kerncijfer of een lege waarde komt uit de sans-letter.
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { maakPdf, stukken, alsLabel, periodeAlsLabel } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { zetTokensBron } from '../../src/ui/pdf-tokens.js';

zetTokensBron(readFileSync(new URL('../../bloei-huisstijl/tokens.css', import.meta.url), 'utf8'));
const wortel = new URL('../../node_modules/@fontsource/', import.meta.url);
const lees = (pad) => new Uint8Array(readFileSync(new URL(pad, wortel)));
const FONTS = {
  serif: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff')),
  serifSchuin: maakFont(lees('cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff'), { schuin: -12 }),
  sans: maakFont(lees('jost/files/jost-latin-400-normal.woff')),
  sansMedium: maakFont(lees('jost/files/jost-latin-500-normal.woff')),
};

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
});
afterAll(() => vi.useRealTimers());

const dag = (n) => plusDagen(vandaag(), n);

async function pdfVan(van, tot) {
  const doc = bouwVerslagModel(await leesVerslag({ van, tot, onderdelen: { eten: true, drinken: true, gewicht: true, notities: true } }), 'Marie');
  return { doc, m: maakPdf(doc, FONTS, { meet: true, nu: new Date(2026, 10, 15) }).meting };
}

describe('hulpjes voor de labelvorm in de pdf', () => {
  test('alsLabel zet om met de Nederlandse regels; de gewone tekst blijft elders gewoon', () => {
    expect(alsLabel('Dinsdag 10 november 2026')).toBe('DINSDAG 10 NOVEMBER 2026');
    expect(alsLabel('ijsje in Ieper')).toBe('IJSJE IN IEPER');
    expect(alsLabel('ma 9 nov 2026 - zo 15 nov 2026')).toBe('MA 9 NOV 2026 - ZO 15 NOV 2026');
  });
  test('periodeAlsLabel maakt van "tot" een bereik met een kort streepje (BESLISSING 446)', () => {
    expect(periodeAlsLabel('Maandag 9 november 2026 tot zondag 15 november 2026')).toBe('MAANDAG 9 NOVEMBER 2026 - ZONDAG 15 NOVEMBER 2026');
    expect(periodeAlsLabel('Maandag 16 november 2026')).toBe('MAANDAG 16 NOVEMBER 2026');
    expect(periodeAlsLabel('x')).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
  });
  test('stukken: in de schreefletter komt elk koppelteken uit de sans-letter; andere letters blijven', () => {
    expect(stukken('serif', '-0,7')).toEqual([['sans', '-'], ['serif', '0,7']]);
    expect(stukken('serif', '-')).toEqual([['sans', '-']]);
    expect(stukken('serifSchuin', 'a-b')).toEqual([['serifSchuin', 'a'], ['sans', '-'], ['serifSchuin', 'b']]);
    expect(stukken('sans', '9 - 15')).toEqual([['sans', '9 - 15']]);
    expect(stukken('serif', '68,2')).toEqual([['serif', '68,2']]);
  });
});

describe('de pdf van een week', () => {
  beforeAll(async () => {
    await db.delete();
    await openDb();
    for (let n = 0; n < 7; n += 1) {
      const datum = dag(n - 6);
      if (n === 3) continue; // een lege dag
      await bewaarMaaltijd(datum, 'ontbijt', { tekst: 'brood met kaas', tijd: '08:00' });
      await voegDrankToe(datum, 'water', 1500);
    }
    await bewaarWeging(dag(-13), 70.4);
    await bewaarWeging(dag(-6), 70.1);
    await bewaarWeging(dag(0), 69.7); // een daling: een "-" in een getal
  });

  test('titel "Verslag" in de schreefletter, eronder de periode als label; dagkoppen en paginakop in labelvorm', async () => {
    const { doc, m } = await pdfVan(dag(-6), dag(0));
    const teksten = m.teksten.map((x) => x.tekst);
    expect(teksten).toContain('Verslag');
    expect(teksten).toContain(periodeAlsLabel(doc.periodeLang));
    expect(periodeAlsLabel(doc.periodeLang)).toMatch(/^[A-Z]+ \d+ [A-Z]+ 2026 - [A-Z]+ \d+ [A-Z]+ 2026$/);
    // BESLISSING 490: op pagina 1 geen korte periode in de kop (de titel heeft de volle periode); de volgende pagina's hebben ze wel
    expect(m.teksten.filter((x) => x.pagina === 0).map((x) => x.tekst)).not.toContain(alsLabel(doc.periodeKort));
    if (m.paginas > 1) expect(m.teksten.filter((x) => x.pagina > 0).map((x) => x.tekst)).toContain(alsLabel(doc.periodeKort));
    expect(teksten).not.toContain(doc.periodeLang);
    // elke dagkop: de cel houdt de gewone tekst, getekend staat de labelvorm in sans medium
    const koppen = m.cellen.filter((c) => c.soort === 'dagkop');
    expect(koppen.length).toBe(7);
    for (const k of koppen) {
      expect(k.tekst).not.toBe(alsLabel(k.tekst));
      expect(teksten).toContain(alsLabel(k.tekst));
      expect(m.lopen.find((l) => l.tekst === alsLabel(k.tekst))?.font).toBe('sansMedium');
    }
    expect(m.lopen.find((l) => l.tekst === 'Verslag')?.font).toBe('serif');
    expect(m.lopen.find((l) => l.tekst === periodeAlsLabel(doc.periodeLang))?.font).toBe('sansMedium');
  });

  test('geen koppelteken in de schreefletter (BESLISSING 460), ook niet in een kerncijfer met een daling', async () => {
    const { m } = await pdfVan(dag(-6), dag(0));
    const serif = m.lopen.filter((l) => l.font === 'serif' || l.font === 'serifSchuin');
    expect(serif.length).toBeGreaterThan(0);
    expect(serif.filter((l) => l.tekst.includes('-'))).toEqual([]);
    // er staat wel ergens een "-" in de pdf (bereik, lege waarde of daling), dus de controle is niet leeg
    expect(m.lopen.some((l) => l.tekst.includes('-'))).toBe(true);
  });
});
