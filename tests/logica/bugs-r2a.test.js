// Bugs uit review R2 (spoor schermen A): R2-03, een periode van meer dan 366 dagen.
// Het verslag houdt de recentste dagen (tot en met de einddatum) en zegt welke periode het echt toont.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { plusDagen } from '../../src/kern/datum.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { begrensPeriode, leesVerslag, MAX_DAGEN } from '../../src/data/verslag.js';

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('R2-03: een lange periode', () => {
  test('leesVerslag houdt de recentste 366 dagen: de einddatum en de dagen ervoor blijven, de oudste vallen weg', async () => {
    const tot = '2026-11-12';
    await voegDrankToe(tot, 'water', 250); // de recentste dag heeft iets
    const verslag = await leesVerslag({ van: '2025-01-01', tot, onderdelen: { drinken: true } });
    expect(MAX_DAGEN).toBe(366);
    expect(verslag.dagen).toHaveLength(366);
    expect(verslag.tot).toBe(tot);
    expect(verslag.van).toBe(plusDagen(tot, -365));
    expect(verslag.dagen.at(-1).datum).toBe(tot);
    expect(verslag.dagen.at(-1).drinken.ml).toBe(250);
    expect(verslag.samenvatting.dagen).toBe(366);
  });

  test('een periode van precies 366 dagen blijft heel', async () => {
    const verslag = await leesVerslag({ van: '2025-11-12', tot: '2026-11-12', onderdelen: {} });
    expect(verslag.van).toBe('2025-11-12');
    expect(verslag.tot).toBe('2026-11-12');
    expect(verslag.dagen).toHaveLength(366);
  });

  test('begrensPeriode: te lang wordt de recentste 366 dagen, voorbij vandaag eindigt vandaag, een periode helemaal in de toekomst blijft', () => {
    const nu = '2026-11-12';
    expect(begrensPeriode({ van: '2026-11-01', tot: '2026-11-10' }, nu)).toEqual({ van: '2026-11-01', tot: '2026-11-10', ingekort: false });
    expect(begrensPeriode({ van: '2025-01-01', tot: '2026-11-12' }, nu)).toEqual({ van: '2025-11-12', tot: '2026-11-12', ingekort: true });
    expect(begrensPeriode({ van: '2026-11-01', tot: '2027-03-01' }, nu)).toEqual({ van: '2026-11-01', tot: '2026-11-12', ingekort: true });
    expect(begrensPeriode({ van: '2024-01-01', tot: '2027-03-01' }, nu)).toEqual({ van: '2025-11-12', tot: '2026-11-12', ingekort: true });
    // een dag in de toekomst (vanuit het Dagboek) blijft zoals hij is: Delen toont dan zijn lege toestand
    expect(begrensPeriode({ van: '2026-11-15', tot: '2026-11-15' }, nu)).toEqual({ van: '2026-11-15', tot: '2026-11-15', ingekort: false });
    // zonder vandaag: alleen de lengte
    expect(begrensPeriode({ van: '2026-11-01', tot: '2027-03-01' })).toEqual({ van: '2026-11-01', tot: '2027-03-01', ingekort: false });
  });
});
