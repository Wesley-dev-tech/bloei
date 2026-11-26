// Upgrade van schema 3 naar schema 4: hoeveelheid en aanwijzing komen erbij, afgeleid uit dosis. Momenten, ritme, dosis en innames
// blijven precies zoals ze waren (ook een supplement met aangepaste momenten).
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, test } from 'vitest';

const START = '2026-11-13';
const alle = ['ochtend', 'middag', 'avond'];
const dag = { soort: 'dagelijks' };
// [naam, dosis, momenten, ritme]
const LIJST = [
  ['Kruidendruppels A', '3x per dag 1 pippetje oplossen in water', alle, dag],
  ['Kruidendruppels B', '3x per dag 1 pippetje oplossen in water', alle, dag],
  ['Kruidendruppels C', '3x per dag 1 pippetje oplossen in water', alle, dag],
  ['Kruidendruppels D', '3x per dag 1 pippetje oplossen in water', alle, dag],
  ['Kruidendrank E', '3x per dag 1 borreltje van 250 ml', alle, dag],
  ['Vitamine C', '2x borreltje van 250 ml per dag', ['ochtend', 'middag'], dag], // met een aangepast aantal momenten
  ['IJzer en B-vitamines', '2x pilletjes per dag', ['ochtend'], dag],
  ['Vitamine D', '2x pilletjes per dag', ['ochtend'], dag],
  ['Mineraalwater', '1x borretje per dag', ['ochtend'], dag],
  ['Visolie', '1x borreltje per dag', ['ochtend'], dag],
  ['Zink', '1x pilletje per dag', ['ochtend'], dag],
  ['Magnesium', "1x schepje per dag s'avonds", ['avond'], dag],
  ['Supplement om de 14 dagen', '1x om de 14 dagen', [], { soort: 'interval', dagen: 14, start: START }],
  ['Maandelijks supplement', '1x per maand een halve ampule', [], { soort: 'maand', start: START }],
];
const VERWACHT = [
  ['1 pippetje', 'oplossen in water'], ['1 pippetje', 'oplossen in water'], ['1 pippetje', 'oplossen in water'], ['1 pippetje', 'oplossen in water'],
  ['1 borreltje van 250 ml', ''], ['1 borreltje van 250 ml', ''], ['2 pilletjes', ''], ['2 pilletjes', ''], ['1 borretje', ''],
  ['1 borreltje', ''], ['1 pilletje', ''], ['1 schepje', ''], ['', ''], ['een halve ampule', ''],
];

describe('database schema 3 naar 4', () => {
  test('hoeveelheid en aanwijzing komen erbij, de rest blijft onaangeroerd', async () => {
    // Een database zoals de app van vóór stap 17b hem maakte: Dexie-versie 3 (IndexedDB-versie 30).
    const oud = new Dexie('bloei-dagboek');
    oud.version(1).stores({ dagen: 'datum', maaltijden: '[datum+soort], datum, soort', fotos: '++id', dranken: '++id, datum', wegingen: 'week, datum', favorieten: '++id, &sleutel', badges: 'id', instellingen: 'sleutel' });
    oud.version(2).stores({ supplementen: '++id', innames: '[datum+supplementId], datum, supplementId' });
    oud.version(3).stores({ innames: null, momentinnames: '[datum+supplementId+moment], datum, supplementId' });
    await oud.open();
    expect(oud.verno).toBe(3);
    for (const [i, [naam, dosis, momenten, ritme]] of LIJST.entries()) {
      await oud.table('supplementen').add({ naam, dosis, momenten, ritme, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1000 + i });
    }
    // Een supplement dat al een hoeveelheid heeft, wordt niet overschreven.
    await oud.table('supplementen').add({ naam: 'Eigen', dosis: '3x per dag 1 pippetje', hoeveelheid: 'mijn eigen', aanwijzing: '', momenten: ['ochtend'], ritme: dag, volgorde: 15, actief: true, voorbeeld: false, aangemaaktOp: 1 });
    await oud.table('momentinnames').put({ datum: '2026-11-10', supplementId: 1, moment: 'middag', tijdstip: 5, voorbeeld: false });
    await oud.table('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
    oud.close();

    const { db, openDb, SCHEMA_VERSIE } = await import('../../src/data/db.js');
    await openDb();
    expect(SCHEMA_VERSIE).toBe(5);
    expect(db.verno).toBe(5);

    const lijst = (await db.supplementen.toArray()).sort((a, b) => a.volgorde - b.volgorde);
    expect(lijst).toHaveLength(15);
    for (const [i, [naam, dosis, momenten, ritme]] of LIJST.entries()) {
      expect(lijst[i], naam).toMatchObject({ naam, dosis, momenten, ritme, hoeveelheid: VERWACHT[i][0], aanwijzing: VERWACHT[i][1], actief: true });
    }
    expect(lijst[14]).toMatchObject({ hoeveelheid: 'mijn eigen', aanwijzing: '', dosis: '3x per dag 1 pippetje' });
    expect(await db.momentinnames.count()).toBe(1);
    expect(await db.instellingen.get('profiel.naam')).toMatchObject({ waarde: 'Testnaam' });

    // De nieuwe velden komen mee in het schema van een dag.
    const { schemaVanDag } = await import('../../src/data/supplementen.js');
    const schema = await schemaVanDag('2026-11-10');
    expect(schema.momenten[0].items[0].supplement).toMatchObject({ hoeveelheid: '1 pippetje', aanwijzing: 'oplossen in water' });
  });
});
