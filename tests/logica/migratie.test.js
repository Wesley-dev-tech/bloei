// Migratie van schema 1 rechtstreeks naar schema 3: alle oude gegevens blijven staan, de nieuwe stores werken.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, test } from 'vitest';

describe('database schema 1 naar 3', () => {
  test('alle oude gegevens blijven staan en de nieuwe stores werken', async () => {
    // Een database zoals de app van vóór stap 15 hem maakte: Dexie-versie 1 (IndexedDB-versie 10).
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
    await oud.open();
    await oud.table('dagen').put({ datum: '2026-11-10', notitie: 'oud', stemming: 4, energie: 3, doelGehaald: true, voorbeeld: false, gewijzigdOp: 1 });
    await oud.table('maaltijden').put({ datum: '2026-11-10', soort: 'ontbijt', tijd: '08:00', tekst: 'havermout', fotoId: null, gevoel: 4, voorbeeld: false, gewijzigdOp: 1 });
    await oud.table('dranken').add({ datum: '2026-11-10', tijdstip: 5, soort: 'water', ml: 250, voorbeeld: false });
    await oud.table('wegingen').put({ week: '2026-11-09', datum: '2026-11-10', kg: 68.4, voorbeeld: false, gewijzigdOp: 1 });
    await oud.table('favorieten').add({ tekst: 'havermout', sleutel: 'havermout', laatstGebruikt: 1 });
    await oud.table('badges').put({ id: 'eerste-bladzijde', behaaldOp: 1, gezien: true });
    await oud.table('instellingen').put({ sleutel: 'profiel.naam', waarde: 'Testnaam' });
    expect(oud.verno).toBe(1);
    oud.close();

    const { db, openDb, SCHEMA_VERSIE } = await import('../../src/data/db.js');
    await openDb();
    expect(SCHEMA_VERSIE).toBe(4);
    expect(db.verno).toBe(4);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ['badges', 'dagen', 'dranken', 'favorieten', 'fotos', 'instellingen', 'maaltijden', 'momentinnames', 'supplementen', 'wegingen'],
    );

    expect(await db.dagen.get('2026-11-10')).toMatchObject({ notitie: 'oud', stemming: 4, doelGehaald: true });
    expect(await db.maaltijden.get(['2026-11-10', 'ontbijt'])).toMatchObject({ tekst: 'havermout', gevoel: 4 });
    expect(await db.dranken.count()).toBe(1);
    expect(await db.wegingen.get('2026-11-09')).toMatchObject({ kg: 68.4 });
    expect(await db.favorieten.count()).toBe(1);
    expect(await db.badges.get('eerste-bladzijde')).toMatchObject({ gezien: true });
    expect(await db.instellingen.get('profiel.naam')).toMatchObject({ waarde: 'Testnaam' });
    expect(await db.supplementen.count()).toBe(0);
    expect(await db.momentinnames.count()).toBe(0);

    // De nieuwe stores zijn bruikbaar naast de oude gegevens.
    const { voegSupplementToe, zetInname, leesInnames } = await import('../../src/data/supplementen.js');
    const vitamine = await voegSupplementToe({ naam: 'Vitamine D' });
    await zetInname('2026-11-10', vitamine.id, 'ochtend', true);
    expect(await leesInnames('2026-11-10')).toEqual([vitamine.id]);
  });
});
