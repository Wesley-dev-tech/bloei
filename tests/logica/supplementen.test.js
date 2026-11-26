// Supplementen per moment van de dag (PLAN.md §16.12): contract, periodiek, tellen, en voorbeelddata.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { luister } from '../../src/kern/bus.js';
import { plusDagen, vandaag, weekStart } from '../../src/kern/datum.js';
import {
  MOMENTEN, leesInnames, leesSupplementen, momentVanNu, schemaVanDag, supplementenVanDag, verwijderSupplement, voegSupplementToe,
  wijzigSupplement, zetInname, zetMoment,
} from '../../src/data/supplementen.js';
import { isSpuit } from '../../src/logica/supplementen.js';
import { dagStatus, leesMaand, leesReeks, leesStats, leesWeekoverzicht } from '../../src/data/statistiek.js';
import { controleerBadges } from '../../src/data/badges.js';
import { verdiend } from '../../src/logica/badges.js';
import { vatSamen } from '../../src/logica/weekoverzicht.js';
import { wisAlles } from '../../src/data/wissen.js';

const dag = (n) => plusDagen(vandaag(), n);
const alleMomenten = ['ochtend', 'middag', 'avond'];
// BESLISSING 698: een supplement telt vanaf de dag van toevoegen. Tests over vroegere dagen vullen daarom "Begint op" vroeger in.
const alVroeger = { vanaf: plusDagen(vandaag(), -60) };

beforeEach(async () => {
  await openDb();
  await wisAlles();
});

describe('lijst', () => {
  test('MOMENTEN', () => {
    expect(MOMENTEN).toEqual(['ochtend', 'middag', 'avond']);
  });

  test('toevoegen: standaard dagelijks in de ochtend, volgorde, lege naam', async () => {
    const a = await voegSupplementToe({ naam: '  Vitamine D ', dosis: '1 druppel' });
    const b = await voegSupplementToe({ naam: 'Magnesium', momenten: ['avond', 'ochtend', 'avond'] });
    expect(a).toMatchObject({ naam: 'Vitamine D', dosis: '1 druppel', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, actief: true, voorbeeld: false, volgorde: 1 });
    expect(b).toMatchObject({ dosis: '', momenten: ['ochtend', 'avond'], volgorde: 2 }); // uniek, in vaste volgorde
    expect((await leesSupplementen()).map((s) => s.naam)).toEqual(['Vitamine D', 'Magnesium']);
    await expect(voegSupplementToe({ naam: '   ' })).rejects.toThrow('leeg');
  });

  test('validatie: een dagelijks supplement heeft minstens een moment, een interval minstens 2 dagen', async () => {
    await expect(voegSupplementToe({ naam: 'A', momenten: [] })).rejects.toThrow('momenten');
    await expect(voegSupplementToe({ naam: 'A', momenten: ['nacht'] })).rejects.toThrow('momenten');
    await expect(voegSupplementToe({ naam: 'A', ritme: { soort: 'interval', dagen: 1 } })).rejects.toThrow('ritme');
    await expect(voegSupplementToe({ naam: 'A', ritme: { soort: 'interval', dagen: 2.5 } })).rejects.toThrow('ritme');
    await expect(voegSupplementToe({ naam: 'A', ritme: { soort: 'wekelijks' } })).rejects.toThrow('ritme');
    const p = await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14 } });
    expect(p).toMatchObject({ momenten: [], ritme: { soort: 'interval', dagen: 14, start: vandaag() } });
    const m = await voegSupplementToe({ naam: 'B12', ritme: { soort: 'maand', start: '2026-10-05' } });
    expect(m.ritme).toEqual({ soort: 'maand', start: '2026-10-05' });
  });

  test('hoeveelheid en aanwijzing: opslaan, bijsnijden en afleiden uit dosis', async () => {
    const a = await voegSupplementToe({ naam: 'A', hoeveelheid: '  1 pipetje ', aanwijzing: 'oplossen in water', dosis: '3x per dag 1 pipetje oplossen in water', momenten: alleMomenten });
    expect(a).toMatchObject({ hoeveelheid: '1 pipetje', aanwijzing: 'oplossen in water', dosis: '3x per dag 1 pipetje oplossen in water' });
    const b = await voegSupplementToe({ naam: 'B', dosis: '2x pilletjes per dag' }); // alleen dosis: afgeleid
    expect(b).toMatchObject({ hoeveelheid: '2 pilletjes', aanwijzing: '', dosis: '2x pilletjes per dag' });
    const c = await voegSupplementToe({ naam: 'C', hoeveelheid: 'x'.repeat(300) });
    expect(c.hoeveelheid).toHaveLength(120);
    expect(c).toMatchObject({ aanwijzing: '', dosis: '' });
    const w = await wijzigSupplement(a.id, { hoeveelheid: '2 pipetjes', aanwijzing: '' });
    expect(w).toMatchObject({ hoeveelheid: '2 pipetjes', aanwijzing: '', dosis: '3x per dag 1 pipetje oplossen in water' });
    expect((await leesSupplementen()).map((s) => s.hoeveelheid)).toEqual(['2 pipetjes', '2 pilletjes', c.hoeveelheid]);
    expect((await schemaVanDag(dag(0))).momenten[0].items[0].supplement).toMatchObject({ hoeveelheid: '2 pipetjes' });
  });

  test('wijzigen met dezelfde regels, ook van ritme', async () => {
    const a = await voegSupplementToe({ naam: 'A' });
    expect(await wijzigSupplement(a.id, { naam: 'Aa', dosis: '2', momenten: ['middag'] })).toMatchObject({ naam: 'Aa', dosis: '2', momenten: ['middag'] });
    await expect(wijzigSupplement(a.id, { naam: '' })).rejects.toThrow('leeg');
    await expect(wijzigSupplement(a.id, { momenten: [] })).rejects.toThrow('momenten');
    await expect(wijzigSupplement(a.id, { ritme: { soort: 'interval', dagen: 1 } })).rejects.toThrow('ritme');
    const periodiek = await wijzigSupplement(a.id, { ritme: { soort: 'interval', dagen: 7 } });
    expect(periodiek).toMatchObject({ momenten: [], ritme: { soort: 'interval', dagen: 7 } });
    expect(await wijzigSupplement(a.id, { ritme: { soort: 'dagelijks' } })).toMatchObject({ momenten: ['ochtend'] });
    await expect(wijzigSupplement(9999, { naam: 'x' })).rejects.toThrow('onbekend');
  });

  test('verwijderen zonder innames is echt weg, met innames wordt het inactief', async () => {
    const a = await voegSupplementToe({ naam: 'A' });
    const b = await voegSupplementToe({ naam: 'B' });
    await zetInname(dag(-1), b.id, 'ochtend', true);
    await verwijderSupplement(a.id);
    await verwijderSupplement(b.id);
    expect(await leesSupplementen()).toEqual([]);
    expect((await leesSupplementen({ ookInactief: true })).map((s) => [s.naam, s.actief])).toEqual([['B', false]]);
    expect(await db.supplementen.get(a.id)).toBeUndefined();
  });
});

describe('schema van een dag en innames per moment', () => {
  test('schemaVanDag: alleen momenten met minstens een supplement, op volgorde', async () => {
    const a = await voegSupplementToe({ naam: 'Alles', momenten: alleMomenten });
    const b = await voegSupplementToe({ naam: 'Avond', momenten: ['avond'] });
    const schema = await schemaVanDag(dag(0));
    expect(schema.momenten.map((m) => [m.moment, m.items.map((i) => i.supplement.naam)])).toEqual([
      ['ochtend', ['Alles']], ['middag', ['Alles']], ['avond', ['Alles', 'Avond']],
    ]);
    expect(schema.periodiek).toEqual([]);
    await verwijderSupplement(a.id);
    expect((await schemaVanDag(dag(0))).momenten.map((m) => m.moment)).toEqual(['avond']);
    void b;
  });

  test('zetInname per moment, event, en de toekomst wordt geweigerd', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: alleMomenten });
    const gebeurtenissen = [];
    const stop = luister('data:gewijzigd', (d) => gebeurtenissen.push(d));
    await zetInname(dag(0), a.id, 'middag', true);
    await zetInname(dag(0), a.id, 'middag', true); // nog eens afvinken verandert niets
    const schema = await schemaVanDag(dag(0));
    expect(schema.momenten.map((m) => [m.moment, m.items[0].genomen])).toEqual([['ochtend', false], ['middag', true], ['avond', false]]);
    expect(await db.momentinnames.count()).toBe(1);
    expect(await leesInnames(dag(0))).toEqual([a.id]);
    await zetInname(dag(0), a.id, 'middag', false);
    stop();
    expect(await leesInnames(dag(0))).toEqual([]);
    expect(gebeurtenissen).toContainEqual({ store: 'innames', datum: dag(0) });
    await expect(zetInname(dag(1), a.id, 'ochtend', true)).rejects.toThrow('toekomst');
    await expect(zetInname(dag(0), a.id, 'nacht', true)).rejects.toThrow('moment');
    await expect(zetInname(dag(0), a.id, 'dag', true)).rejects.toThrow('moment'); // 'dag' hoort bij periodiek
    await expect(zetInname(dag(0), 9999, 'ochtend', true)).rejects.toThrow('onbekend');
  });

  test('zetMoment vinkt alles van een moment in een keer af en weer terug', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: ['ochtend', 'avond'] });
    const b = await voegSupplementToe({ naam: 'B', momenten: ['ochtend'] });
    await zetInname(dag(0), a.id, 'ochtend', true); // staat al aan: blijft
    await zetMoment(dag(0), 'ochtend', true);
    let schema = await schemaVanDag(dag(0));
    expect(schema.momenten.find((m) => m.moment === 'ochtend').items.map((i) => i.genomen)).toEqual([true, true]);
    expect(schema.momenten.find((m) => m.moment === 'avond').items.map((i) => i.genomen)).toEqual([false]);
    expect(await db.momentinnames.count()).toBe(2);
    await zetMoment(dag(0), 'ochtend', false);
    schema = await schemaVanDag(dag(0));
    expect(schema.momenten.find((m) => m.moment === 'ochtend').items.map((i) => i.genomen)).toEqual([false, false]);
    await expect(zetMoment(dag(1), 'ochtend', true)).rejects.toThrow('toekomst');
    void b;
  });

  test('een inactief supplement staat alleen op dagen waarop het afgevinkt was', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: ['ochtend', 'avond'] });
    await voegSupplementToe({ naam: 'B', ...alVroeger });
    await zetInname(dag(-2), a.id, 'avond', true);
    await verwijderSupplement(a.id);
    const eerder = await schemaVanDag(dag(-2));
    expect(eerder.momenten.map((m) => [m.moment, m.items.map((i) => [i.supplement.naam, i.genomen])])).toEqual([
      ['ochtend', [['B', false]]], ['avond', [['A', true]]],
    ]);
    expect((await schemaVanDag(dag(0))).momenten.map((m) => m.moment)).toEqual(['ochtend']);
  });

  test('overgangsvorm: supplementenVanDag en zetInname met een boolean', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: ['ochtend', 'avond'] });
    await voegSupplementToe({ naam: 'B' });
    await zetInname(dag(0), a.id, 'ochtend', true);
    expect((await supplementenVanDag(dag(0))).map((r) => [r.supplement.naam, r.genomen])).toEqual([['A', false], ['B', false]]);
    await zetInname(dag(0), a.id, true); // alle momenten
    expect((await supplementenVanDag(dag(0))).map((r) => [r.supplement.naam, r.genomen])).toEqual([['A', true], ['B', false]]);
    expect(await db.momentinnames.count()).toBe(2);
    await zetInname(dag(0), a.id, false);
    expect(await db.momentinnames.count()).toBe(0);
    await expect(zetInname(dag(1), a.id, true)).rejects.toThrow('toekomst');
  });

  test('momentVanNu: ochtend 07:00 tot 11:59, middag 12:00 tot 16:59, avond 17:00 tot 06:59 (zelfde grenzen als de begroeting)', () => {
    const om = (u, m = 0) => momentVanNu(new Date(2026, 10, 13, u, m));
    expect([om(0, 30), om(6, 59), om(7), om(11, 59), om(12), om(16, 59), om(17), om(23, 59)]).toEqual(['avond', 'avond', 'ochtend', 'ochtend', 'middag', 'middag', 'avond', 'avond']);
  });
});

describe('periodiek', () => {
  test('aan de beurt vanaf de startdatum, tot het afgevinkt is; daarna pas weer na het interval', async () => {
    const p = await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14, start: dag(-5) }, ...alVroeger });
    const voor = await schemaVanDag(dag(-6));
    expect(voor.periodiek[0]).toMatchObject({ aanDeBeurt: false, genomen: false, volgende: dag(-5) });
    const nu = await schemaVanDag(dag(0));
    expect(nu.periodiek[0]).toMatchObject({ aanDeBeurt: true, genomen: false, volgende: dag(9) }); // blijft te doen; de reeks telt door
    await zetInname(dag(-1), p.id, 'dag', true);
    const na = await schemaVanDag(dag(0));
    expect(na.periodiek[0]).toMatchObject({ aanDeBeurt: false, genomen: false, volgende: dag(9) });
    const opDag = await schemaVanDag(dag(-1));
    expect(opDag.periodiek[0]).toMatchObject({ aanDeBeurt: true, genomen: true, volgende: dag(9) });
    // terugkijken naar een dag vóór de inname: toen was het nog aan de beurt
    expect((await schemaVanDag(dag(-3))).periodiek[0]).toMatchObject({ aanDeBeurt: true, genomen: false });
  });

  test('maand: dezelfde dag van de volgende maand, hoogstens de laatste dag', async () => {
    const p = await voegSupplementToe({ naam: 'B12', ritme: { soort: 'maand', start: '2026-01-31' }, vanaf: '2026-01-01' });
    await db.momentinnames.put({ datum: '2026-01-31', supplementId: p.id, moment: 'dag', tijdstip: 1, voorbeeld: false });
    expect((await schemaVanDag('2026-02-10')).periodiek[0].volgende).toBe('2026-02-28');
    await db.momentinnames.clear();
    await db.supplementen.clear();
    const q = await voegSupplementToe({ naam: 'B12', ritme: { soort: 'maand', start: '2028-01-31' }, vanaf: '2028-01-01' });
    await db.momentinnames.put({ datum: '2028-01-31', supplementId: q.id, moment: 'dag', tijdstip: 1, voorbeeld: false });
    expect((await schemaVanDag('2028-02-10')).periodiek[0].volgende).toBe('2028-02-29');
  });

  test('een periodiek supplement gebruikt het moment dag en niet de gewone momenten', async () => {
    const p = await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14 } });
    await expect(zetInname(dag(0), p.id, 'ochtend', true)).rejects.toThrow('moment');
    await zetInname(dag(0), p.id, 'dag', true);
    expect((await schemaVanDag(dag(0))).momenten).toEqual([]);
    expect((await supplementenVanDag(dag(0))).map((r) => [r.supplement.naam, r.genomen])).toEqual([['IJzer', true]]);
    await zetInname(dag(0), p.id, false);
    expect(await db.momentinnames.count()).toBe(0);
  });

  test('overgangsvorm: een periodiek supplement dat niet aan de beurt is, staat er niet in', async () => {
    const p = await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14, start: dag(5) } });
    expect(await supplementenVanDag(dag(0))).toEqual([]);
    void p;
  });
});

describe('tellen', () => {
  test('een dag met alleen een inname is bijgehouden: reeks, dagStatus, maand en week (per moment, plus periodiek)', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: alleMomenten, ...alVroeger });
    await voegSupplementToe({ naam: 'B', momenten: ['ochtend', 'avond'], ...alVroeger });
    await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14, start: dag(-1) }, ...alVroeger });
    await zetInname(dag(-1), a.id, 'ochtend', true);
    expect((await leesReeks()).dagenBijgehouden).toBe(1);
    expect((await leesReeks()).lopendeReeks).toBe(1);
    // 3 + 2 momenten, plus het periodieke dat aan de beurt is
    expect((await dagStatus(dag(-1))).supplementen).toEqual({ genomen: 1, totaal: 6 });
    expect((await dagStatus(dag(0))).supplementen).toEqual({ genomen: 0, totaal: 5 }); // dag 0 is geen datum van de reeks: de open beurt telt niet opnieuw als gepland
    const maand = await leesMaand(dag(-1).slice(0, 7));
    expect(maand[dag(-1)].supplementen).toEqual({ genomen: 1, totaal: 6 });
    const week = await leesWeekoverzicht(weekStart(dag(-1)));
    expect(week.supplementDagen).toBeGreaterThanOrEqual(1);
    expect(week.ingevuldeDagen).toBeGreaterThanOrEqual(1);
    expect(week.dagen.every((d) => d.supplementen)).toBe(true);
  });

  test('momenten tellen per dag (BESLISSING 150): klaar van totaal, en dagen met alle momenten afgevinkt in de week', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: alleMomenten, ...alVroeger });
    const b = await voegSupplementToe({ naam: 'B', momenten: ['ochtend'], ...alVroeger });
    await voegSupplementToe({ naam: 'IJzer', ritme: { soort: 'interval', dagen: 14, start: dag(-10) }, ...alVroeger }); // periodiek telt niet mee
    await zetInname(dag(-1), a.id, 'ochtend', true);
    await zetInname(dag(-1), b.id, 'ochtend', true); // ochtend klaar, middag en avond niet
    for (const m of alleMomenten) await zetInname(dag(-2), a.id, m, true);
    await zetInname(dag(-2), b.id, 'ochtend', true); // alles klaar
    const maand = await leesMaand(dag(-1).slice(0, 7));
    expect(maand[dag(-1)].supplementMomenten).toEqual({ klaar: 1, totaal: 3 });
    expect(maand[dag(-2)].supplementMomenten).toEqual({ klaar: 3, totaal: 3 });
    const week = await leesWeekoverzicht(weekStart(dag(-1)));
    const eigen = week.dagen.find((d) => d.datum === dag(-1));
    expect(eigen.supplementMomenten).toEqual({ klaar: 1, totaal: 3 });
    expect(week.supplementVolleDagen).toBeGreaterThanOrEqual(weekStart(dag(-1)) <= dag(-2) ? 1 : 0);
  });

  test('vatSamen telt supplementVolleDagen (alle momenten afgevinkt)', () => {
    const dagMet = (datum, klaar, totaal) => ({ datum, maaltijden: 0, ml: 0, supplementMomenten: { klaar, totaal } });
    const w = vatSamen([dagMet('2026-11-09', 3, 3), dagMet('2026-11-10', 1, 3), dagMet('2026-11-11', 0, 0), dagMet('2026-11-12', 2, 2)]);
    expect(w.supplementVolleDagen).toBe(2);
  });

  test('vatSamen telt supplementDagen en rekent een inname-dag als ingevuld', () => {
    const w = vatSamen([
      { datum: '2026-11-09', maaltijden: 0, ml: 0, supplementen: { genomen: 2, totaal: 3 } },
      { datum: '2026-11-10', maaltijden: 1, ml: 0, supplementen: { genomen: 0, totaal: 3 } },
      { datum: '2026-11-11', maaltijden: 0, ml: 0 },
    ]);
    expect(w.supplementDagen).toBe(1);
    expect(w.ingevuldeDagen).toBe(2);
  });

  test('leesStats: innameDagen en volledigeMomentDagen (elk moment van die dag afgevinkt)', async () => {
    const a = await voegSupplementToe({ naam: 'A', momenten: ['ochtend', 'avond'], ...alVroeger });
    const b = await voegSupplementToe({ naam: 'B', ...alVroeger });
    await zetInname(dag(-1), a.id, 'ochtend', true);
    await zetInname(dag(-2), a.id, 'ochtend', true);
    await zetInname(dag(-2), a.id, 'avond', true);
    await zetInname(dag(-2), b.id, 'ochtend', true);
    const stats = await leesStats();
    expect(stats.innameDagen).toBe(2);
    expect(stats.volledigeMomentDagen).toBe(1);
  });

  test('badges eerste-potje en trouw op hun drempel', async () => {
    expect(verdiend({ innameDagen: 0, volledigeMomentDagen: 0 })).toEqual([]);
    expect(verdiend({ innameDagen: 1, volledigeMomentDagen: 13 })).toEqual(['eerste-potje']);
    expect(verdiend({ innameDagen: 14, volledigeMomentDagen: 14 })).toEqual(['eerste-potje', 'trouw']);
    const a = await voegSupplementToe({ naam: 'A' });
    await zetInname(dag(-1), a.id, 'ochtend', true);
    expect(await controleerBadges()).toContain('eerste-potje');
  });

  test('supplementen tellen nooit mee voor het drinkdoel', async () => {
    const a = await voegSupplementToe({ naam: 'Borreltje van 250 ml' });
    await zetInname(dag(0), a.id, 'ochtend', true);
    expect((await dagStatus(dag(0))).ml).toBe(0);
    expect((await leesStats()).doelDagen).toBe(0);
  });
});

describe('oude voorbeelddata', () => {
  // Laden kan niet meer (BESLISSING 407), maar een bestaande gebruiker kan nog rijen met de vlag voorbeeld hebben: die tellen nergens mee.
  test('een oud voorbeeldsupplement met innames telt niet voor de stats en de reeks', async () => {
    const id = await db.supplementen.add({ naam: 'Vitamine D', dosis: '', hoeveelheid: '', aanwijzing: '', momenten: ['ochtend'], ritme: { soort: 'dagelijks' }, volgorde: 1, actief: true, voorbeeld: true, aangemaaktOp: 1 });
    for (const n of [-3, -2, -1]) await db.momentinnames.put({ datum: dag(n), supplementId: id, moment: 'ochtend', tijdstip: 1, voorbeeld: true });
    expect((await leesStats()).innameDagen).toBe(0);
    expect((await leesReeks()).dagenBijgehouden).toBe(0);
    // Een eigen vinkje op dat supplement is wel van haar.
    await zetInname(dag(0), id, 'ochtend', true);
    expect((await leesStats()).innameDagen).toBe(1);
  });
});

describe('vanaf en tot op een supplement (BESLISSING 211)', () => {
  test('voegSupplementToe en wijzigSupplement bewaren vanaf en tot; een lege waarde haalt de grens weg; een ongeldige waarde wordt geweigerd', async () => {
    const p = await voegSupplementToe({ naam: 'Testkuur', momenten: ['ochtend'], vanaf: dag(3), tot: dag(30) });
    expect((await db.supplementen.get(p.id))).toMatchObject({ vanaf: dag(3), tot: dag(30) });
    await wijzigSupplement(p.id, { tot: '' });
    const na = await db.supplementen.get(p.id);
    expect(na.vanaf).toBe(dag(3));
    expect(na.tot).toBeUndefined();
    await expect(wijzigSupplement(p.id, { tot: dag(1) })).rejects.toThrow('periode'); // vóór vanaf
    await expect(voegSupplementToe({ naam: 'Kapot', vanaf: 'morgen' })).rejects.toThrow('periode');
    expect((await db.supplementen.get(p.id)).vanaf).toBe(dag(3)); // niets verloren
  });

  test('een dagelijks supplement met vanaf in de toekomst telt vandaag niet mee en staat in "binnenkort"', async () => {
    await voegSupplementToe({ naam: 'Vast', momenten: ['ochtend'] });
    await voegSupplementToe({ naam: 'Straks', momenten: ['ochtend'], vanaf: dag(2) });
    const nu = await schemaVanDag(dag(0));
    expect(nu.momenten[0].items.map((i) => i.supplement.naam)).toEqual(['Vast']);
    expect(nu.binnenkort.map((b) => b.supplement.naam)).toEqual(['Straks']);
    expect((await dagStatus(dag(0))).supplementen).toEqual({ genomen: 0, totaal: 1 });
  });
});

// BESLISSING 275: een spuit herken je aan de naam, niet aan het ritme.
describe('isSpuit', () => {
  test('"spuit" of "injectie" in de naam, hoofdletterongevoelig en ook in de meervoudsvorm', () => {
    for (const naam of ['Testspuit ijzer', 'B12-spuit', 'SPUIT', 'Spuiten', 'Weekinjectie', 'Injecties', 'ijzer INJECTIE nodig']) {
      expect(isSpuit({ naam }), naam).toBe(true);
    }
  });
  test('een ander supplement is geen spuit, ook niet als het periodiek is', () => {
    for (const naam of ['Weektablet', 'Magnesium', 'Vitamine D', '']) {
      expect(isSpuit({ naam, ritme: { soort: 'interval', dagen: 7, start: '2026-11-14' } }), naam).toBe(false);
    }
    expect(isSpuit({})).toBe(false);
    expect(isSpuit(null)).toBe(false);
  });
});
