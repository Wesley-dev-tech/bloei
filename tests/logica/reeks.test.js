import { describe, expect, test } from 'vitest';
import { dagenBijgehouden, lopendeReeks } from '../../src/logica/reeks.js';
import { BADGES, verdiend } from '../../src/logica/badges.js';
import { vatSamen } from '../../src/logica/weekoverzicht.js';
import { plusDagen } from '../../src/kern/datum.js';

// Donderdag 12 november 2026. De week loopt van maandag 9 tot en met zondag 15 november.
const NU = '2026-11-12';
const dagen = (...offsets) => offsets.map((n) => plusDagen(NU, n));

describe('dagenBijgehouden', () => {
  test('telt verschillende dagen', () => {
    expect(dagenBijgehouden([])).toBe(0);
    expect(dagenBijgehouden(['2026-11-01', '2026-11-01', '2026-11-03'])).toBe(2);
  });
});

describe('lopendeReeks', () => {
  test('geen enkele dag = 0', () => {
    expect(lopendeReeks([], NU)).toBe(0);
  });

  test('opeenvolgende dagen tellen mee, vandaag inbegrepen', () => {
    expect(lopendeReeks(dagen(0, -1, -2), NU)).toBe(3);
  });

  test('vandaag nog leeg telt niet als gemist', () => {
    expect(lopendeReeks(dagen(-1, -2, -3), NU)).toBe(3);
  });

  test('één gemiste dag per week wordt vergeven en telt zelf niet mee', () => {
    // do 12, wo 11 ontbreekt, di 10, ma 9 ingevuld: vergeven in de week van 9 november
    expect(lopendeReeks(dagen(0, -2, -3), NU)).toBe(3);
  });

  test('twee gemiste dagen in dezelfde week stoppen de reeks', () => {
    // do 12 ingevuld, wo 11 en di 10 gemist, ma 9 ingevuld
    expect(lopendeReeks(dagen(0, -3), NU)).toBe(1);
  });

  test('gemiste zondag en gemiste maandag zijn twee verschillende weken: allebei vergeven', () => {
    // vandaag di 10 nov; ma 9 gemist (week 9 nov), zo 8 gemist (week 2 nov), za 7 ingevuld
    const reeks = lopendeReeks(['2026-11-10', '2026-11-07', '2026-11-06'], '2026-11-10');
    expect(reeks).toBe(3);
  });

  test('daarna stopt een tweede gemiste dag in dezelfde oude week', () => {
    // zo 8 gemist (vergeven), za 7 ingevuld, vr 6 gemist (zelfde week 2 nov: stop)
    expect(lopendeReeks(['2026-11-10', '2026-11-07', '2026-11-05'], '2026-11-10')).toBe(2);
  });

  test('stopt vóór de eerste bijgehouden dag ooit', () => {
    // maar twee dagen ooit bijgehouden: de dagen daarvoor tellen niet als vergeven
    expect(lopendeReeks(dagen(-1, -2), NU)).toBe(2);
    expect(lopendeReeks(dagen(0), NU)).toBe(1);
  });

  test('een lange stilte begint de reeks gewoon opnieuw, zonder fout', () => {
    expect(lopendeReeks(dagen(-30, -31, -32), NU)).toBe(0);
    expect(lopendeReeks(dagen(0, -30, -31), NU)).toBe(1);
  });

  test('de volgorde van de invoer maakt niet uit', () => {
    expect(lopendeReeks(dagen(-2, 0, -1), NU)).toBe(3);
  });
});

describe('badges', () => {
  const stats = (extra = {}) => ({
    dagenBijgehouden: 0, lopendeReeks: 0, doelDagen: 0, notitieDagen: 0, backups: 0, ...extra,
  });

  test('exact tien, alleen gedrag', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'eerste-bladzijde', 'week-vol', 'maand-vol', 'honderd', 'eerste-kan',
      'tien-kannen', 'kanttekening', 'twee-weken', 'eerste-potje', 'trouw',
    ]);
  });

  test('nul gedrag, geen badges', () => {
    expect(verdiend(stats())).toEqual([]);
  });

  test.each([
    ['eerste-bladzijde', { dagenBijgehouden: 1 }, { dagenBijgehouden: 0 }],
    ['week-vol', { dagenBijgehouden: 7 }, { dagenBijgehouden: 6 }],
    ['maand-vol', { dagenBijgehouden: 30 }, { dagenBijgehouden: 29 }],
    ['honderd', { dagenBijgehouden: 100 }, { dagenBijgehouden: 99 }],
    ['eerste-kan', { doelDagen: 1 }, { doelDagen: 0 }],
    ['tien-kannen', { doelDagen: 10 }, { doelDagen: 9 }],
    ['kanttekening', { notitieDagen: 5 }, { notitieDagen: 4 }],
    ['twee-weken', { lopendeReeks: 14 }, { lopendeReeks: 13 }],
  ])('%s: precies op de drempel', (id, genoeg, bijnaGenoeg) => {
    expect(verdiend(stats(genoeg))).toContain(id);
    expect(verdiend(stats(bijnaGenoeg))).not.toContain(id);
  });

  test('alles bij elkaar geeft alle acht', () => {
    expect(verdiend(stats({
      dagenBijgehouden: 100, lopendeReeks: 14, doelDagen: 10, notitieDagen: 5,
    }))).toHaveLength(8);
  });
});

describe('vatSamen (weekoverzicht)', () => {
  const dag = (datum, maaltijden, ml) => ({ datum, maaltijden, ml });

  test('een lege week', () => {
    const w = vatSamen([dag('2026-11-09', 0, 0), dag('2026-11-10', 0, 0)]);
    expect(w).toMatchObject({ ingevuldeDagen: 0 });
  });

  test('ingevulde dagen: minstens één maaltijd of één drank', () => {
    const w = vatSamen([dag('2026-11-09', 2, 0), dag('2026-11-10', 0, 250), dag('2026-11-11', 0, 0)]);
    expect(w.ingevuldeDagen).toBe(2);
  });

  // BESLISSING 456: het weekoverzicht heeft geen eigen gemiddelde meer (het werd nergens getoond); het gemiddelde per dag komt uit gemiddeldPerDag
  test('geen eigen gemiddelde drinken', () => {
    const w = vatSamen([dag('2026-11-09', 1, 1000), dag('2026-11-10', 1, 1250), dag('2026-11-11', 1, 0)]);
    expect(w).not.toHaveProperty('gemiddeldMl');
  });

  test('geeft de dagen terug', () => {
    const invoer = [dag('2026-11-09', 1, 0)];
    expect(vatSamen(invoer).dagen).toBe(invoer);
  });
});
