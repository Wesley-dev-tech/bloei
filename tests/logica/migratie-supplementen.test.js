// Upgrade van schema 2 naar schema 3 met een lijst van veertien supplementen: geen enkel supplement en geen enkele inname gaat verloren.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, test } from 'vitest';

// Veertien verzonnen supplementen met dosisteksten zoals een gebruiker ze intikt (naam, tekst van dosis).
const LIJST = [
  ['Kruidendruppels A', '3x per dag 1 pippetje oplossen in water'],
  ['Kruidendruppels B', '3x per dag 1 borreltje van 250 ml'],
  ['Kruidendruppels C', '3x per dag 1 pippetje oplossen in water'],
  ['Kruidendruppels D', '3x per dag 1 pippetje oplossen in water'],
  ['Kruidendrank E', '3x per dag 1 borreltje van 250 ml'],
  ['Vitamine C', '2x borreltje van 250 ml per dag'],
  ['IJzer en B-vitamines', '2x pilletjes per dag'],
  ['Vitamine D', '1x pilletje per dag'],
  ['Mineraalwater', '1x borreltje per dag'],
  ['Visolie', '1x schepje per dag'],
  ['Zink', '1x pilletje per dag'],
  ['Magnesium', "1x schepje per dag s'avonds"],
  ['Supplement om de 14 dagen', '1x om de 14 dagen'],
  ['Maandelijks supplement', '1x per maand een halve ampule'],
];

describe('database schema 2 naar 3', () => {
  test('de veertien supplementen en hun innames blijven staan, met afgeleide momenten en ritme', async () => {
    // Een database zoals de app van vóór stap 17 hem maakte: Dexie-versie 2 (IndexedDB-versie 20).
    const oud = new Dexie('bloei-dagboek');
    oud.version(1).stores({
      dagen: 'datum',
      maaltijden: '[datum+soort], datum, soort',
      fotos: '++id',
      dranken: '++id, datum',
      wegingen: 'week, datum',
      favorieten: '++id, &sleutel',
      badges: 'id',
      instellingen: 'sleutel',
    });
    oud.version(2).stores({ supplementen: '++id', innames: '[datum+supplementId], datum, supplementId' });
    await oud.open();
    for (const [i, [naam, dosis]] of LIJST.entries()) {
      await oud.table('supplementen').add({ naam, dosis, volgorde: i + 1, actief: true, voorbeeld: false, aangemaaktOp: 1000 + i });
    }
    // Een inactief supplement met een inname uit het verleden, en innames op een paar dagen.
    const inactief = await oud.table('supplementen').add({ naam: 'Oud potje', dosis: '', volgorde: 15, actief: false, voorbeeld: false, aangemaaktOp: 1 });
    const innames = [
      ['2026-11-10', 1], ['2026-11-10', 8], ['2026-11-10', 12], ['2026-11-11', 1], ['2026-11-11', 13], ['2026-11-12', 14], ['2026-11-09', inactief],
    ];
    for (const [datum, supplementId] of innames) await oud.table('innames').put({ datum, supplementId, tijdstip: 50, voorbeeld: false });
    await oud.table('dagen').put({ datum: '2026-11-10', notitie: 'oud', stemming: 4, energie: null, doelGehaald: false, voorbeeld: false, gewijzigdOp: 1 });
    await oud.table('maaltijden').put({ datum: '2026-11-10', soort: 'ontbijt', tijd: '08:00', tekst: 'havermout', fotoId: null, gevoel: 4, voorbeeld: false, gewijzigdOp: 1 });
    await oud.table('dranken').add({ datum: '2026-11-10', tijdstip: 5, soort: 'water', ml: 250, voorbeeld: false });
    await oud.table('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
    expect(oud.verno).toBe(2);
    oud.close();

    const { db, openDb } = await import('../../src/data/db.js');
    const { vandaag } = await import('../../src/kern/datum.js');
    await openDb();
    expect(db.verno).toBe(6);

    // Alles wat er stond, staat er nog, ook de tekst van dosis.
    const lijst = (await db.supplementen.toArray()).sort((a, b) => a.volgorde - b.volgorde);
    expect(lijst).toHaveLength(15);
    for (const [i, [naam, dosis]] of LIJST.entries()) expect(lijst[i]).toMatchObject({ naam, dosis, volgorde: i + 1, actief: true });
    expect(lijst[14]).toMatchObject({ naam: 'Oud potje', actief: false });

    // De afgeleide momenten en het ritme.
    const alle = ['ochtend', 'middag', 'avond'];
    const verwacht = [alle, alle, alle, alle, alle, ['ochtend', 'avond'], ['ochtend'], ['ochtend'], ['ochtend'], ['ochtend'], ['ochtend'], ['avond'], [], []];
    LIJST.forEach((_, i) => expect(lijst[i].momenten, LIJST[i][0]).toEqual(verwacht[i]));
    expect(lijst[12].ritme).toEqual({ soort: 'interval', dagen: 14, start: vandaag() });
    expect(lijst[13].ritme).toEqual({ soort: 'maand', start: vandaag() });
    expect(lijst.slice(0, 12).every((s) => s.ritme.soort === 'dagelijks')).toBe(true);
    expect(lijst[14]).toMatchObject({ momenten: ['ochtend'], ritme: { soort: 'dagelijks' } });

    // Elke oude inname is er nog: één per moment van het supplement, 'dag' bij periodiek.
    const nieuw = await db.momentinnames.toArray();
    const sleutels = nieuw.map((i) => `${i.datum}|${i.supplementId}|${i.moment}`).sort();
    expect(sleutels).toEqual([
      '2026-11-09|15|ochtend',
      '2026-11-10|1|avond', '2026-11-10|1|middag', '2026-11-10|1|ochtend',
      '2026-11-10|12|avond',
      '2026-11-10|8|ochtend',
      '2026-11-11|1|avond', '2026-11-11|1|middag', '2026-11-11|1|ochtend',
      '2026-11-11|13|dag',
      '2026-11-12|14|dag',
    ].sort());
    expect(nieuw.every((i) => i.tijdstip === 50 && i.voorbeeld === false)).toBe(true);
    expect(db.tables.map((t) => t.name)).not.toContain('innames');

    // De rest van de database is onaangeroerd.
    expect(await db.dagen.get('2026-11-10')).toMatchObject({ notitie: 'oud' });
    expect(await db.dagen.get('2026-11-10')).not.toHaveProperty('stemming'); // schema 5 wist dit veld
    expect(await db.maaltijden.get(['2026-11-10', 'ontbijt'])).toMatchObject({ tekst: 'havermout' });
    expect(await db.dranken.count()).toBe(1);
    expect(await db.instellingen.get('profiel.naam')).toMatchObject({ waarde: 'Testnaam' });

    // En het nieuwe contract werkt erop: het schema van een dag toont wat er staat.
    const { schemaVanDag } = await import('../../src/data/supplementen.js');
    const schema = await schemaVanDag('2026-11-10');
    expect(schema.momenten.map((m) => m.moment)).toEqual(['ochtend', 'middag', 'avond']);
    expect(schema.momenten[0].items.filter((i) => i.genomen).map((i) => i.supplement.naam)).toEqual(['Kruidendruppels A', 'Vitamine D']);
  });
});
