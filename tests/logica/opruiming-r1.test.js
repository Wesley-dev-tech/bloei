// Opruiming na review R1 (BESLISSING 408): wat verplaatst of samengevoegd is, doet hetzelfde als voordien.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, isEigen, openDb } from '../../src/data/db.js';
import { plusDagen, vandaag, isDatum, MAANDEN_KORT, opmaakDatum } from '../../src/kern/datum.js';
import { opEenDecimaal } from '../../src/kern/getal.js';
import { isPasGehaald } from '../../src/logica/drinken.js';
import { rondeDagenUit, dagRondDagen } from '../../src/logica/badgeregels.js';
import { ETEN_KLAAR } from '../../src/logica/motivatie.js';
import { voegDrankToe } from '../../src/data/dranken.js';
import { leesReeks } from '../../src/data/statistiek.js';
import { controleerBadges } from '../../src/data/badges.js';

const V = vandaag();

beforeEach(async () => {
  await db.delete();
  await openDb();
});

describe('samengevoegde hulpfuncties (R1-15)', () => {
  test('isDatum kijkt alleen naar de vorm JJJJ-MM-DD', () => {
    expect(isDatum('2026-11-16')).toBe(true);
    expect(['2026-1-16', '16-11-2026', '', null, undefined, 20261116].some(isDatum)).toBe(false);
  });

  test('MAANDEN_KORT is dezelfde lijst als in de korte datumopmaak', () => {
    expect(MAANDEN_KORT).toHaveLength(12);
    expect(opmaakDatum('2026-03-02', 'kort')).toContain(MAANDEN_KORT[2]);
  });

  test('opEenDecimaal rondt af op één decimaal', () => {
    expect(opEenDecimaal(68.44)).toBe(68.4);
    expect(opEenDecimaal(68.45 + 1e-9)).toBe(68.5);
    expect(opEenDecimaal(-0.26)).toBe(-0.3);
  });
});

describe('de vlag voorbeeld: één functie (BESLISSING 407)', () => {
  test('isEigen: alleen een bestaande rij zonder voorbeeld: true', () => {
    expect(isEigen({ voorbeeld: false })).toBe(true);
    expect(isEigen({})).toBe(true);
    expect(isEigen({ voorbeeld: true })).toBe(false);
    expect(isEigen(null)).toBe(false);
    expect(isEigen(undefined)).toBe(false);
  });
});

describe('pure regels uit de datalaag gehaald (R1-19, R1-20)', () => {
  test('isPasGehaald: alleen de eerste keer over het doel', () => {
    expect(isPasGehaald({ doelGehaald: false, totaal: 2500, doelMl: 2500 })).toBe(true);
    expect(isPasGehaald({ doelGehaald: false, totaal: 2499, doelMl: 2500 })).toBe(false);
    expect(isPasGehaald({ doelGehaald: true, totaal: 3000, doelMl: 2500 })).toBe(false);
  });

  test('rondeDagenUit: eten klaar met ETEN_KLAAR, momenten en drinken per dag', () => {
    const d = '2026-11-10';
    const maaltijden = ETEN_KLAAR.map((soort) => ({ datum: d, soort }));
    const supplementen = [{ id: 1, volgorde: 1, actief: true, momenten: ['ochtend'], ritme: { soort: 'dagelijks' } }];
    const innames = [{ datum: d, supplementId: 1, moment: 'ochtend' }];
    const dagen = rondeDagenUit({ maaltijden, dranken: [{ datum: d, ml: 2000 }, { datum: d, ml: 500 }], innames, supplementen, doelMl: 2500 });
    expect(dagen).toEqual([{ etenKlaar: true, supplementen: { genomen: 1, totaal: 1 }, ml: 2500, doelMl: 2500 }]);
    expect(dagRondDagen(dagen)).toBe(1);
    // Zonder avondmaal is het eten niet klaar; een dag zonder eten staat er niet in.
    expect(rondeDagenUit({ maaltijden: maaltijden.slice(0, 2), doelMl: 2500 })[0].etenKlaar).toBe(false);
    expect(rondeDagenUit({ dranken: [{ datum: d, ml: 3000 }], doelMl: 2500 })).toEqual([]);
  });
});

describe('leesReeks schrijft niet; controleerBadges bewaart de teller (R1-18)', () => {
  test('lezen laat teller.hoogste ongemoeid, nakijken bewaart het hoogste', async () => {
    await voegDrankToe(V, 'water', 200);
    await voegDrankToe(plusDagen(V, -1), 'water', 200);
    expect((await leesReeks()).dagenBijgehouden).toBe(2);
    expect(await db.instellingen.get('teller.hoogste')).toBeUndefined();
    await controleerBadges();
    expect(await db.instellingen.get('teller.hoogste')).toMatchObject({ waarde: 2 });
  });
});
