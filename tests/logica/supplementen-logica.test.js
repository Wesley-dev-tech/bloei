// Pure regels voor supplementen per moment: afleiden uit de tekst van dosis, periodiek en het rooster van een dag.
import { describe, expect, test } from 'vitest';
import { geldigOp, leidAfUitDosis, schoonPeriode, momentVanNu, plusMaanden, reeksdatums, rooster, splitsDosis, teDoenDatum, telRooster, volgendeKeer } from '../../src/logica/supplementen.js';

const START = '2026-11-13';
const ALLE = ['ochtend', 'middag', 'avond'];
const dagelijks = { soort: 'dagelijks' };

describe('leidAfUitDosis: veertien voorbeeldteksten', () => {
  // [naam, tekst van dosis (zoals ingetikt), verwachte momenten, verwacht ritme]
  const TABEL = [
    ['Kruidendruppels A', '3x per dag 1 pippetje oplossen in water', ALLE, dagelijks],
    ['Kruidendruppels B', '3x per dag 1 pippetje oplossen in water', ALLE, dagelijks],
    ['Kruidendruppels C', '3x per dag 1 pippetje oplossen in water', ALLE, dagelijks],
    ['Kruidendruppels D', '3 x per dag 1 pippetje', ALLE, dagelijks],
    ['Kruidendrank E', '3X per dag 1 borreltje van 250 ml', ALLE, dagelijks],
    ['Vitamine C', '2x borreltje van 250 ml per dag', ['ochtend', 'avond'], dagelijks],
    ['IJzer en B-vitamines', '2x pilletjes per dag', ['ochtend'], dagelijks],
    ['Vitamine D', '2x pilletjes per dag', ['ochtend'], dagelijks],
    ['Mineraalwater', '1x borretje per dag', ['ochtend'], dagelijks],
    ['Visolie', '1x borreltje per dag', ['ochtend'], dagelijks],
    ['Zink', '1x pilletje per dag', ['ochtend'], dagelijks],
    ['Magnesium', "1x schepje per dag s'avonds", ['avond'], dagelijks],
    ['Supplement om de 14 dagen', '1x om de 14 dagen', [], { soort: 'interval', dagen: 14, start: START }],
    ['Maandelijks supplement', '1x per maand een halve ampule', [], { soort: 'maand', start: START }],
  ];

  test.each(TABEL)('%s: "%s"', (_naam, tekst, momenten, ritme) => {
    expect(leidAfUitDosis(tekst, START)).toEqual({ momenten, ritme });
  });

  test('hoofdletters en spaties maken niet uit, en s\'avonds gaat voor de rest', () => {
    expect(leidAfUitDosis("  3  X   PER  DAG  's AVONDS ", START).momenten).toEqual(['avond']);
    expect(leidAfUitDosis('1x per dag s avonds', START).momenten).toEqual(['avond']);
    expect(leidAfUitDosis('2x pil per dag', START).momenten).toEqual(['ochtend']);
    expect(leidAfUitDosis('2x tabletten per dag', START).momenten).toEqual(['ochtend']);
    expect(leidAfUitDosis('2x capsules per dag', START).momenten).toEqual(['ochtend']);
    expect(leidAfUitDosis('2x schepje per dag', START).momenten).toEqual(['ochtend', 'avond']);
    expect(leidAfUitDosis('2x pipetje per dag', START).momenten).toEqual(['ochtend', 'avond']);
    expect(leidAfUitDosis('Om De 7 Dagen', START).ritme).toEqual({ soort: 'interval', dagen: 7, start: START });
    expect(leidAfUitDosis('5x per dag', START).momenten).toEqual(ALLE);
  });

  test('zonder bruikbare tekst: ochtend, dagelijks', () => {
    for (const leeg of ['', '   ', null, undefined, 'naar eigen inzicht', 'om de 1 dagen']) {
      expect(leidAfUitDosis(leeg, START)).toEqual({ momenten: ['ochtend'], ritme: dagelijks });
    }
  });
});

describe('periodiek rekenen', () => {
  test('plusMaanden met één maand: dezelfde dag, hoogstens de laatste dag van de maand', () => {
    expect(plusMaanden('2026-01-31', 1)).toBe('2026-02-28');
    expect(plusMaanden('2028-01-31', 1)).toBe('2028-02-29');
    expect(plusMaanden('2026-03-31', 1)).toBe('2026-04-30');
    expect(plusMaanden('2026-11-13', 1)).toBe('2026-12-13');
    expect(plusMaanden('2026-12-15', 1)).toBe('2027-01-15');
  });

  test('de reeks van 14 dagen vanaf een vrijdag loopt over een jaargrens', () => {
    const ritme = { soort: 'interval', dagen: 14, start: '2026-11-27' };
    expect(reeksdatums(ritme, '2026-11-01', '2027-02-28')).toEqual(['2026-11-27', '2026-12-11', '2026-12-25', '2027-01-08', '2027-01-22', '2027-02-05', '2027-02-19']);
    expect(reeksdatums(ritme, '2026-12-12', '2027-01-08')).toEqual(['2026-12-25', '2027-01-08']);
    expect(reeksdatums(ritme, '2026-01-01', '2026-11-26')).toEqual([]);
  });

  test('de maandreeks rekent vanaf de start: 31 januari, 28 februari, 31 maart', () => {
    expect(plusMaanden('2026-01-31', 1)).toBe('2026-02-28');
    expect(plusMaanden('2026-01-31', 2)).toBe('2026-03-31');
    expect(reeksdatums({ soort: 'maand', start: '2026-01-31' }, '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    expect(reeksdatums({ soort: 'maand', start: '2026-12-04' }, '2026-12-01', '2027-03-31')).toEqual(['2026-12-04', '2027-01-04', '2027-02-04', '2027-03-04']);
  });

  test('te laat afvinken verschuift de reeks niet en niet afvinken telt door', () => {
    const ritme = { soort: 'interval', dagen: 14, start: '2026-11-27' };
    // niets afgevinkt: de volgende keer is de eerste datum van de reeks op of na de dag
    expect(volgendeKeer(ritme, '2026-11-20', [])).toBe('2026-11-27');
    expect(volgendeKeer(ritme, '2026-12-01', [])).toBe('2026-12-11');
    expect(volgendeKeer(ritme, '2027-01-20', [])).toBe('2027-01-22');
    // twee dagen te laat afgevinkt (zondag 29 november): hoort bij 27 november, de reeks blijft 11 december, 25 december
    expect(volgendeKeer(ritme, '2026-11-29', ['2026-11-29'])).toBe('2026-12-11');
    expect(volgendeKeer(ritme, '2026-12-01', ['2026-11-29'])).toBe('2026-12-11');
    // op de dag zelf afgevinkt: de volgende in de reeks
    expect(volgendeKeer(ritme, '2026-12-11', ['2026-11-27', '2026-12-11'])).toBe('2026-12-25');
  });

  test('te doen: tot afgevinkt, en bij een nieuwe datum van de reeks gaat het over die datum (één open beurt)', () => {
    const ritme = { soort: 'interval', dagen: 14, start: '2026-11-27' };
    expect(teDoenDatum(ritme, '2026-11-26', [])).toBeNull();
    expect(teDoenDatum(ritme, '2026-11-27', [])).toBe('2026-11-27');
    expect(teDoenDatum(ritme, '2026-12-05', [])).toBe('2026-11-27');
    expect(teDoenDatum(ritme, '2026-12-11', [])).toBe('2026-12-11'); // de nieuwe datum, geen stapel
    expect(teDoenDatum(ritme, '2026-12-05', ['2026-11-29'])).toBeNull();
    expect(teDoenDatum(ritme, '2026-11-29', ['2026-11-29'])).toBe('2026-11-27'); // op de dag van afvinken zelf nog zichtbaar
  });
});

describe('rooster en telRooster', () => {
  const s = (id, extra) => ({ id, naam: 'S' + id, dosis: '', volgorde: id, actief: true, voorbeeld: false, momenten: ['ochtend'], ritme: dagelijks, ...extra });
  const inname = (datum, supplementId, moment) => ({ datum, supplementId, moment, tijdstip: 1, voorbeeld: false });

  test('telt per moment, plus periodiek dat aan de beurt is', () => {
    const lijst = [
      s(1, { momenten: ALLE }),
      s(2, { momenten: ['ochtend', 'avond'] }),
      s(3, { momenten: [], ritme: { soort: 'interval', dagen: 14, start: '2026-11-01' } }),
      s(4, { momenten: [], ritme: { soort: 'maand', start: '2026-12-01' } }), // nog niet aan de beurt
    ];
    const innames = [inname('2026-11-13', 1, 'ochtend'), inname('2026-11-13', 3, 'dag')];
    const r = rooster('2026-11-13', lijst, innames);
    expect(telRooster(r)).toEqual({ genomen: 2, totaal: 6 });
    expect(r.periodiek.map((p) => [p.supplement.id, p.aanDeBeurt, p.genomen, p.volgende])).toEqual([[3, true, true, '2026-11-15'], [4, false, false, '2026-12-01']]);
    // een andere dag: niets afgevinkt, het periodieke is er niet meer aan de beurt
    const dagErna = rooster('2026-11-14', lijst, innames);
    expect(telRooster(dagErna)).toEqual({ genomen: 0, totaal: 5 });
  });

  test('zonder supplementen is er niets', () => {
    expect(rooster('2026-11-13', [], [])).toEqual({ momenten: [], periodiek: [], binnenkort: [] });
    expect(telRooster({ momenten: [], periodiek: [] })).toEqual({ genomen: 0, totaal: 0 });
  });

  test('momentVanNu', () => {
    expect(momentVanNu(new Date(2026, 10, 13, 9))).toBe('ochtend');
    expect(momentVanNu(new Date(2026, 10, 13, 14))).toBe('middag');
    expect(momentVanNu(new Date(2026, 10, 13, 21))).toBe('avond');
    expect(momentVanNu(new Date(2026, 10, 13, 17, 0))).toBe('avond');
    expect(momentVanNu(new Date(2026, 10, 13, 16, 59))).toBe('middag');
    expect(momentVanNu(new Date(2026, 10, 13, 3, 0))).toBe('avond');
  });
});

describe('splitsDosis: hoeveelheid en aanwijzing uit de vrije tekst', () => {
  // [naam, tekst van dosis, hoeveelheid, aanwijzing]
  const TABEL = [
    ['Kruidendruppels A', '3x per dag 1 pippetje oplossen in water', '1 pippetje', 'oplossen in water'],
    ['Kruidendruppels B', '3x per dag 1 pippetje oplossen in water', '1 pippetje', 'oplossen in water'],
    ['Kruidendruppels C', '3x per dag 1 pippetje oplossen in water', '1 pippetje', 'oplossen in water'],
    ['Kruidendruppels D', '3x per dag 1 pippetje oplossen in water', '1 pippetje', 'oplossen in water'],
    ['Kruidendrank E', '3x per dag 1 borreltje van 250 ml', '1 borreltje van 250 ml', ''],
    ['Vitamine C', '2x borreltje van 250 ml per dag', '1 borreltje van 250 ml', ''],
    ['IJzer en B-vitamines', '2x pilletjes per dag', '2 pilletjes', ''],
    ['Vitamine D', '2x pilletjes per dag', '2 pilletjes', ''],
    ['Mineraalwater', '1x borretje per dag', '1 borretje', ''],
    ['Visolie', '1x borreltje per dag', '1 borreltje', ''],
    ['Zink', '1x pilletje per dag', '1 pilletje', ''],
    ['Magnesium', "1x schepje per dag s'avonds", '1 schepje', ''],
    ['Supplement om de 14 dagen', '1x om de 14 dagen', '', ''],
    ['Maandelijks supplement', '1x per maand een halve ampule', 'een halve ampule', ''],
  ];

  test.each(TABEL)('%s: "%s"', (_naam, tekst, hoeveelheid, aanwijzing) => {
    expect(splitsDosis(tekst)).toEqual({ hoeveelheid, aanwijzing });
  });

  test('hoofdletters, spaties en andere schrijfwijzen', () => {
    expect(splitsDosis('3 X per dag 1 pipetje oplossen in water')).toEqual({ hoeveelheid: '1 pipetje', aanwijzing: 'oplossen in water' });
    expect(splitsDosis("2x tabletten per dag s avonds")).toEqual({ hoeveelheid: '2 tabletten', aanwijzing: '' });
    expect(splitsDosis("1x capsule per dag 's avonds")).toEqual({ hoeveelheid: '1 capsule', aanwijzing: '' });
    expect(splitsDosis('3x per dag 1 pipetje innemen met water')).toEqual({ hoeveelheid: '1 pipetje', aanwijzing: 'innemen met water' });
    expect(splitsDosis('1 pipetje oplossen in water')).toEqual({ hoeveelheid: '1 pipetje', aanwijzing: 'oplossen in water' });
  });

  test('liever leeg dan fout', () => {
    for (const tekst of ['', '   ', null, undefined, 'naar eigen inzicht', 'per dag', "'s avonds", 'om de 14 dagen']) {
      expect(splitsDosis(tekst)).toEqual({ hoeveelheid: '', aanwijzing: '' });
    }
  });
});

describe('de periode van een supplement: vanaf en tot (BESLISSING 211)', () => {
  const s = (id, extra) => ({ id, naam: 'S' + id, dosis: '', volgorde: id, actief: true, voorbeeld: false, momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, ...extra });
  const inname = (datum, supplementId, moment) => ({ datum, supplementId, moment, tijdstip: 1, voorbeeld: false });

  test('een dagelijks supplement met vanaf in de toekomst staat vandaag niet in het rooster en wel op en na vanaf; "x van y" verandert niet', () => {
    const lijst = [s(1), s(2, { naam: 'Nieuw', vanaf: '2026-12-05' })];
    const voor = rooster('2026-12-04', lijst, []);
    expect(voor.momenten.flatMap((m) => m.items.map((i) => i.supplement.id))).toEqual([1]);
    expect(telRooster(voor)).toEqual({ genomen: 0, totaal: 1 });
    expect(voor.binnenkort.map((b) => [b.supplement.id, b.vanaf])).toEqual([[2, '2026-12-05']]);
    const op = rooster('2026-12-05', lijst, []);
    expect(op.momenten[0].items.map((i) => i.supplement.id)).toEqual([1, 2]);
    expect(op.binnenkort).toEqual([]);
    expect(telRooster(rooster('2027-01-20', lijst, []))).toEqual({ genomen: 0, totaal: 2 });
  });

  test('een dagelijks supplement met tot telt niet meer mee na die dag, maar blijft zichtbaar op een dag waarop het is afgevinkt', () => {
    const lijst = [s(1, { tot: '2026-12-04' })];
    expect(telRooster(rooster('2026-12-04', lijst, []))).toEqual({ genomen: 0, totaal: 1 });
    expect(telRooster(rooster('2026-12-05', lijst, []))).toEqual({ genomen: 0, totaal: 0 });
    expect(geldigOp(lijst[0], '2026-12-05')).toBe(false);
  });

  test('een maandreeks met tot op haar eerste datum heeft precies één beurt en daarna geen volgende keer', () => {
    const ritme = { soort: 'maand', start: '2026-12-04' };
    const sup = s(3, { momenten: [], ritme, tot: '2026-12-04' });
    expect(reeksdatums(ritme, '2026-01-01', '2028-01-01', { tot: '2026-12-04' })).toEqual(['2026-12-04']);
    expect(reeksdatums(ritme, '2026-12-05', '2028-01-01', { tot: '2026-12-04' })).toEqual([]);
    expect(volgendeKeer(ritme, '2026-12-05', ['2026-12-04'], { tot: '2026-12-04' })).toBeNull();
    const voor = rooster('2026-12-01', [sup], []);
    expect(voor.periodiek[0]).toMatchObject({ volgende: '2026-12-04', laatste: true, aanDeBeurt: false });
    const erna = rooster('2026-12-20', [sup], []);
    expect(erna.periodiek[0]).toMatchObject({ aanDeBeurt: true, volgende: null }); // de open laatste beurt blijft te doen
    const klaar = rooster('2026-12-20', [sup], [inname('2026-12-06', 3, 'dag')]);
    expect(klaar.periodiek[0]).toMatchObject({ aanDeBeurt: false, volgende: null });
  });

  test('een reeks met vanaf begint pas op de eerste datum op of na vanaf', () => {
    const ritme = { soort: 'interval', dagen: 14, start: '2026-11-27' };
    expect(reeksdatums(ritme, '2026-11-01', '2027-01-31', { vanaf: '2026-12-01' })).toEqual(['2026-12-11', '2026-12-25', '2027-01-08', '2027-01-22']);
  });

  test('schoonPeriode: lege waarden vallen weg, een ongeldige datum of tot vóór vanaf wordt geweigerd', () => {
    expect(schoonPeriode({ vanaf: '', tot: null })).toEqual({});
    expect(schoonPeriode({ vanaf: '2026-12-05' })).toEqual({ vanaf: '2026-12-05' });
    expect(() => schoonPeriode({ vanaf: '5 december' })).toThrow('periode');
    expect(() => schoonPeriode({ vanaf: '2026-12-05', tot: '2026-12-04' })).toThrow('periode');
  });
});
