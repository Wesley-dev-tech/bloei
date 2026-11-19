import 'fake-indexeddb/auto';
import { readFileSync, writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag } from '../../src/kern/datum.js';
import { zetEnergie, zetNotitie, zetStemming } from '../../src/data/dagen.js';
import { bewaarMaaltijd } from '../../src/data/maaltijden.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { bewaarWeging } from '../../src/data/wegingen.js';
import { voegSupplementToe, zetInname } from '../../src/data/supplementen.js';
import { leesVerslag } from '../../src/data/verslag.js';
import { zetInstelling } from '../../src/data/instellingen.js';
import { bouwVerslagModel } from '../../src/ui/verslag-model.js';
import { maakPdf } from '../../src/ui/verslag-pdf.js';
import { maakFont } from '../../src/ui/pdf-fonts.js';
import { leesPad, padOps } from '../../src/ui/pdf-vector.js';
import { poederTokens, kleur, zetTokensBron } from '../../src/ui/pdf-tokens.js';

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

beforeEach(async () => {
  await db.delete();
  await openDb();
});

async function vulWeek() {
  for (const n of [-6, -5, -4, -3, -2, -1]) {
    await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'havermout met fruit en noten', tijd: '08:15', gevoel: 3 });
    await bewaarMaaltijd(dag(n), 'middagmaal', { tekst: 'soep met brood, daarna een appel', tijd: '12:30', gevoel: 4 });
    await voegDrankToe(dag(n), 'water', 500);
    await voegDrankToe(dag(n), 'thee', 200);
    await zetStemming(dag(n), 1 + (n + 7) % 5);
    await zetEnergie(dag(n), 1 + (n + 8) % 5);
  }
  await zetNotitie(dag(-2), 'Een rustige dag, goed geslapen en een wandeling gemaakt.');
  await bewaarWeging(dag(-2), 68.4);
  const a = await voegSupplementToe({ naam: 'Vitamine D', dosis: '1x per dag 1 capsule', momenten: ['ochtend'] });
  const b = await voegSupplementToe({ naam: 'Magnesium', dosis: '2x per dag 1 tablet', momenten: ['ochtend', 'avond'] });
  await voegSupplementToe({ naam: 'Supplement om de 14 dagen', dosis: '1x om de 14 dagen', ritme: { soort: 'interval', dagen: 14, start: dag(-9) } });
  await zetInname(dag(-2), a.id, 'ochtend', true);
  await zetInname(dag(-2), b.id, 'ochtend', true);
}

describe('pdf-vector', () => {
  test('boog en relatieve commando\'s worden absolute krommen', () => {
    const s = leesPad('M0 0a10 10 0 0 1 20 0z');
    expect(s[0]).toEqual(['M', 0, 0]);
    expect(s.filter((x) => x[0] === 'C')).toHaveLength(2); // een halve cirkel is twee kwartslagen
    const laatste = s.filter((x) => x[0] === 'C').at(-1);
    expect(laatste[5]).toBeCloseTo(20);
    expect(laatste[6]).toBeCloseTo(0);
    expect(padOps(s)).toContain(' c ');
  });
});

describe('pdf-tokens', () => {
  test('Poeder komt uit tokens.css, zonder var()', () => {
    const tk = poederTokens();
    expect(tk['--c-text']).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tk['--energy-on']).toBe(tk['--c-accent']);
    expect(kleur('--c-text')).toHaveLength(3);
  });
});

describe('verslag in de huisstijl', () => {
  test('het model heeft kop, samenvatting, dagen met rijen en een voet; zonder oordeel of percentage', async () => {
    await vulWeek();
    const verslag = await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen: { eten: true, drinken: true, supplementen: true, stemming: true, gewicht: true, notities: true } }); // de verdwenen onderdelen worden genegeerd
    const doc = bouwVerslagModel(verslag, 'Marie Peeters');
    expect(doc.kop).toMatchObject({ titel: 'Verslag', voornaam: 'Van Marie' });
    expect(doc.samenvatting[0].waarde).toBe('6 van 7');
    const d = doc.dagen.find((x) => x.datum === dag(-2));
    expect(d.rijen.map((r) => r.soort)).toEqual(['eten', 'eten', 'drinken']);
    expect(d.notitie).toContain('rustige dag');
    expect(doc.dagen.at(-1).leeg).toBe(true);
    expect(doc.bijlage).toBeUndefined();
    expect(d.rijen[0]).not.toHaveProperty('gevoel'); // het gevoel na een maaltijd (3) komt nergens in het verslag
    expect(JSON.stringify(doc).toLowerCase()).not.toContain('gevoel');
    expect(Object.keys(d).sort()).toEqual(['aantalMaaltijden', 'bandTekst', 'datum', 'datumJaar', 'drinkenMl', 'kort', 'leeg', 'notitie', 'notitieAanwezig', 'rijen', 'titel', 'titelJaar']);
    const tekst = JSON.stringify(doc);
    for (const woord of ['upplement', 'temming', 'nergie', 'Vitamine D']) expect(tekst).not.toContain(woord);
    expect(doc.voet).toMatch(/^Bloei · gemaakt op /);
    expect(JSON.stringify(doc)).not.toContain('%');
  });

  test('het model levert voor de pdf datums met jaar, kerncijfers (alleen feiten) en wegingen met het verschil', async () => {
    // een weging per week: drie wegingen in drie verschillende weken, één maaltijd en 2,5 liter gedronken op één dag
    await bewaarWeging(dag(-20), 69.1);
    await bewaarWeging(dag(-10), 68.4);
    await bewaarWeging(dag(0), 68.7);
    await bewaarMaaltijd(dag(-1), 'ontbijt', { tekst: 'testmaaltijd', tijd: '08:00' });
    await voegDrankToe(dag(-1), 'water', 2500);
    const nu = new Date(2026, 10, 15, 9, 30);
    const onderdelen = { eten: true, drinken: true, gewicht: true, notities: true };
    const doc = bouwVerslagModel(await leesVerslag({ van: dag(-20), tot: dag(0), onderdelen }), 'Testnaam Achternaam', nu);
    expect(doc.kop.naam).toBe('Testnaam');
    expect(doc.gemaaktOp).toBe('zondag 15 november 2026');
    expect(doc.periodeLang).toMatch(/^[A-Z][a-z]+ \d+ \w+ \d{4} tot [a-z]+ \d+ \w+ \d{4}$/);
    expect(doc.periodeKort).toMatch(/^[a-z]{2} \d+ \w+ \d{4} - [a-z]{2} \d+ \w+ \d{4}$/);
    expect(doc.dagen.at(-1).datumJaar).toMatch(/^[a-z]{2} \d+ [a-z]+ \d{4}$/);
    expect(doc.dagen.at(-1).titelJaar).toMatch(/^[A-Z][a-z]+ \d+ [a-z]+ \d{4}$/);
    expect(doc.dagdoelMl).toBe(2500);
    // elk kerncijfer: label, getal, eenheid en onderregel (BESLISSING 315)
    expect(doc.kerncijfers.map((c) => c.label)).toEqual(['Dagen ingevuld', 'Maaltijden', 'Gedronken', 'Dagdoel gehaald', 'Laatste weging']);
    // BESLISSING 449: 2,5 l op één dag, gemiddeld over de 21 dagen van de periode (lege dagen tellen als 0): 2500 / 21 = 0,12 l
    expect(doc.kerncijfers.map((c) => c.getal)).toEqual(['4', '1', '0,12', '1', '68,7']);
    expect(doc.kerncijfers.map((c) => c.eenheid)).toEqual(['', '', 'l', '', 'kg']);
    expect(doc.kerncijfers.map((c) => c.onder)).toEqual(['van 21 dagen', 'genoteerd', 'gemiddeld per dag', 'van 21 dagen', doc.gewicht.wegingen.at(-1).datumTekst.split(' ').slice(0, 3).join(' ')]);
    expect(doc.gewicht.tabel).toBe(true); // twee of meer wegingen: de tabel met het verschil met de vorige en met de eerste
    const gewoon = (tekst) => tekst.replace(/ /g, ' '); // vaste spatie tussen getal en eenheid
    expect(doc.kerncijfers.map((c) => gewoon(c.waarde))).toEqual(['4', '1', '0,12 l', '1', '68,7 kg']);
    expect(doc.gewicht.wegingen.map((w) => [gewoon(w.kgTekst), gewoon(w.verschil), gewoon(w.verschilEerste)])).toEqual([['69,1 kg', '', ''], ['68,4 kg', '-0,7 kg', '-0,7 kg'], ['68,7 kg', '+0,3 kg', '-0,4 kg']]);
    // zonder Eten en Gewicht vallen hun kerncijfers weg; voor één dag is er geen rij
    const zonder = bouwVerslagModel(await leesVerslag({ van: dag(-20), tot: dag(0), onderdelen: { eten: false, drinken: true, gewicht: false, notities: false } }), '', nu);
    expect(zonder.kerncijfers.map((c) => c.label)).toEqual(['Dagen ingevuld', 'Gedronken', 'Dagdoel gehaald']);
    expect(zonder.kop.naam).toBe('');
    // één dag: een eigen set (BESLISSING 331 en 333): maaltijden, gedronken, dagdoel in procenten en, alleen als er die dag gewogen is, het gewicht
    const eenDag = bouwVerslagModel(await leesVerslag({ van: dag(-1), tot: dag(-1), onderdelen }), '', nu);
    expect(eenDag.kerncijfers.map((c) => c.label)).toEqual(['Maaltijden', 'Gedronken', 'Dagdoel']);
    expect(eenDag.kerncijfers.map((c) => [c.getal, c.eenheid, c.onder.replace(/[  ]/g, ' ')])).toEqual([['1', '', 'van 6 genoteerd'], ['2,5', 'l', 'van 2,5 l'], ['100', '%', 'gehaald']]);
    expect(eenDag.modus).toBe('dag');
    expect(JSON.stringify(doc.kerncijfers)).not.toContain('%');
  });

  // BESLISSING 333: de kerncijfers van één dag, met een eigen berekening: niets gedronken, onder het doel, precies gehaald, erboven; wel en niet gewogen; gewicht uit
  test('één dag: de teksten van de kerncijfers per geval, zonder dubbele gegevens', async () => {
    const alles = { eten: true, drinken: true, gewicht: true, notities: true };
    const nu = new Date(2026, 10, 15, 9, 30);
    const gewoon = (tekst) => tekst.replace(/[  ]/g, ' ');
    const lees1 = async (onderdelen = alles) => bouwVerslagModel(await leesVerslag({ van: dag(0), tot: dag(0), onderdelen }), '', nu);
    const tekst = (doc) => doc.kerncijfers.map((c) => [c.label, gewoon(c.getal), c.eenheid, gewoon(c.onder)]);
    await zetInstelling('drinken.dagdoelMl', 2500);
    // niets gedronken, geen maaltijd, niet gewogen: geen blok Gewicht, geen "-"
    expect(tekst(await lees1())).toEqual([['Maaltijden', '0', '', 'van 6 genoteerd'], ['Gedronken', '0', 'l', 'van 2,5 l'], ['Dagdoel', '0', '%', 'nog 2,5 l te gaan']]);
    // onder het doel: 0,95 l; het restant is 1,55 l en samen is dat het doel
    await voegDrankToe(dag(0), 'water', 950);
    expect(tekst(await lees1()).slice(1)).toEqual([['Gedronken', '0,95', 'l', 'van 2,5 l'], ['Dagdoel', '38', '%', 'nog 1,55 l te gaan']]);
    // net onder het doel: nooit 100 % en nooit "nog 0 l"
    await voegDrankToe(dag(0), 'water', 1545);
    expect(tekst(await lees1())[2]).toEqual(['Dagdoel', '99', '%', 'nog 0,01 l te gaan']);
    // precies gehaald en erboven: altijd 100 %, nooit meer (BESLISSING 381), geen negatief getal
    await voegDrankToe(dag(0), 'water', 5);
    expect(tekst(await lees1())[2]).toEqual(['Dagdoel', '100', '%', 'gehaald']);
    await voegDrankToe(dag(0), 'water', 480);
    expect(tekst(await lees1())[2]).toEqual(['Dagdoel', '100', '%', 'gehaald']);
    // een ongeldig dagdoel (0) in de opslag geldt als het standaard dagdoel (R5-06): het blok Dagdoel blijft
    await zetInstelling('drinken.dagdoelMl', 0);
    expect((await lees1()).kerncijfers.map((c) => c.label)).toEqual(['Maaltijden', 'Gedronken', 'Dagdoel']);
    await zetInstelling('drinken.dagdoelMl', 2500);
    // een maaltijd telt alleen als er tekst of foto is (zoals de tabel); wel gewogen: getal in kg, het verschil met de vorige weging
    await bewaarMaaltijd(dag(0), 'ontbijt', { tekst: 'brood', tijd: '08:00' });
    await bewaarMaaltijd(dag(0), 'middagmaal', { tekst: '', tijd: '12:00', gevoel: 3 });
    await bewaarWeging(dag(-8), 72.7);
    await bewaarWeging(dag(0), 72.4);
    const gewogen = await lees1();
    expect(tekst(gewogen)[0]).toEqual(['Maaltijden', '1', '', 'van 6 genoteerd']);
    expect(gewogen.dagen[0].rijen.filter((r) => r.soort === 'eten')).toHaveLength(1);
    const kg = gewogen.kerncijfers.at(-1);
    expect([kg.label, gewoon(kg.getal), kg.eenheid]).toEqual(['Gewicht', '72,4', 'kg']);
    expect(gewoon(kg.onder)).toMatch(/^-0,3 kg sinds \d+ \w+$/);
    expect(gewogen.gewicht.tabel).toBe(false); // het gewicht staat maar op één plaats: het kerncijfer
    // zonder vorige weging: een korte onderregel zonder verschil; gewicht uit: geen blok
    await db.wegingen.clear();
    await bewaarWeging(dag(0), 72.4);
    expect(gewoon((await lees1()).kerncijfers.at(-1).onder)).toBe('weging van die dag');
    expect((await lees1({ ...alles, gewicht: false })).kerncijfers.map((c) => c.label)).not.toContain('Gewicht');
    // dezelfde eenheid in één maat in vel en pdf: de eenheid staat altijd apart van het getal
    for (const c of gewogen.kerncijfers) expect(c.getal).not.toMatch(/ (l|kg|%)$/);
    // in de tabel staat bij één dag alleen de verdeling per drank; totaal en doel alleen in de kerncijfers
    const drank = (await lees1()).dagen[0].rijen.find((r) => r.soort === 'drinken');
    expect(drank.soorten.length).toBeGreaterThan(0);
  });

  test('de pdf heeft ingebedde lettertypes, vectoriconen, een voet op elke pagina en blijft klein', async () => {
    await vulWeek();
    const verslag = await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen: { eten: true, drinken: true, supplementen: true, stemming: true, gewicht: false, notities: true } });
    const bytes = maakPdf(bouwVerslagModel(verslag, 'Marie'), fonts());
    const tekst = Buffer.from(bytes).toString('latin1');
    expect(tekst.startsWith('%PDF-')).toBe(true);
    expect(tekst).toContain('%%EOF');
    expect(tekst).toContain('/FontFile2');
    expect(tekst).toContain('/Subtype /CIDFontType2');
    expect(tekst).toContain('/ToUnicode');
    expect(tekst).toContain('/Multiply'); // het beeldmerk
    expect(tekst).not.toContain('/Helvetica');
    expect(tekst).not.toContain('/Subtype /Image'); // geen rasterbeelden
    expect(bytes.length).toBeLessThan(400 * 1024);
    if (process.env.PDF_UIT) writeFileSync(process.env.PDF_UIT, bytes);
  });

  test('een verslag van een maand met veel gegevens blijft ruim onder 1 MB', async () => {
    for (let n = -29; n <= -1; n += 1) {
      await bewaarMaaltijd(dag(n), 'ontbijt', { tekst: 'havermout met fruit en noten', tijd: '08:15', gevoel: 3 });
      await bewaarMaaltijd(dag(n), 'middagmaal', { tekst: 'soep met brood, daarna een appel', tijd: '12:30', gevoel: 4 });
      await bewaarMaaltijd(dag(n), 'avondmaal', { tekst: 'rijst met groenten en kip', tijd: '18:30' });
      await voegDrankToe(dag(n), 'water', 500);
      await voegDrankToe(dag(n), 'koffie', 150);
      await zetStemming(dag(n), 1 + ((n + 30) % 5));
      await zetEnergie(dag(n), 1 + ((n + 31) % 5));
    }
    const verslag = await leesVerslag({ van: dag(-29), tot: dag(0), onderdelen: { eten: true, drinken: true, supplementen: true, stemming: true, gewicht: true, notities: true } });
    const bytes = maakPdf(bouwVerslagModel(verslag, 'Marie'), fonts());
    expect(bytes.length).toBeLessThan(1024 * 1024);
    if (process.env.PDF_MAAND) writeFileSync(process.env.PDF_MAAND, bytes);
    console.log('GROOTTE maand', bytes.length);
  });

  test('een lege week geeft rustige regels en een geldige pdf', async () => {
    const verslag = await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen: { eten: true, drinken: true, supplementen: true, stemming: true, gewicht: false, notities: false } });
    const doc = bouwVerslagModel(verslag, '');
    expect(doc.kop.voornaam).toBe('');
    expect(doc.leeg).toBe(true);
    const bytes = maakPdf(doc, fonts());
    expect(Buffer.from(bytes).toString('latin1')).toContain('%%EOF');
    if (process.env.PDF_LEEG) writeFileSync(process.env.PDF_LEEG, bytes);
  });

  test('elke combinatie van de zes onderdelen, met en zonder gegevens: nergens null, undefined, NaN of [object in de tekst', async () => {
    const namen = ['eten', 'drinken', 'gewicht', 'notities'];
    const kapot = /\bnull\b|undefined|NaN|\[object/;
    const teksten = (waarde, uit = []) => {
      if (typeof waarde === 'string') uit.push(waarde);
      else if (Array.isArray(waarde)) waarde.forEach((w) => teksten(w, uit));
      else if (waarde && typeof waarde === 'object') Object.values(waarde).forEach((w) => teksten(w, uit));
      return uit;
    };
    const f = fonts();
    for (const metGegevens of [false, true]) {
      if (metGegevens) await vulWeek();
      for (let mask = 0; mask < 16; mask += 1) {
        const onderdelen = Object.fromEntries(namen.map((n, i) => [n, Boolean(mask & (1 << i))]));
        const verslag = await leesVerslag({ van: dag(-6), tot: dag(0), onderdelen });
        const doc = bouwVerslagModel(verslag, mask % 2 ? 'Marie' : '');
        const slecht = teksten(doc).filter((x) => kapot.test(x));
        expect(slecht, JSON.stringify(onderdelen)).toEqual([]);
        const bytes = maakPdf(doc, f); // gooit niet en blijft een geldige pdf
        expect(Buffer.from(bytes).toString('latin1')).toContain('%%EOF');
        expect(doc.gewicht === null || onderdelen.gewicht).toBe(true);
        expect(doc.bijlage).toBeUndefined();
      }
    }
  });
});
