import { describe, expect, test } from 'vitest';
import {
  dagdeel, isToekomst, maandRaster, naarDatum, naarSleutel, nuAlsTijd, opmaakDatum,
  plusDagen, vandaag, weekDagen, weekStart, weekdag,
} from '../../src/kern/datum.js';

describe('datumsleutels', () => {
  test('sleutel is lokale datum, ook vlak voor en na middernacht', () => {
    expect(naarSleutel(new Date(2026, 10, 12, 23, 59))).toBe('2026-11-12');
    expect(naarSleutel(new Date(2026, 10, 13, 0, 0))).toBe('2026-11-13');
    expect(vandaag(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });

  test('heen en terug', () => {
    expect(naarSleutel(naarDatum('2026-02-28'))).toBe('2026-02-28');
  });

  test('plusDagen over maand, jaar, schrikkeldag en zomer-/winteruur', () => {
    expect(plusDagen('2026-11-30', 1)).toBe('2026-12-01');
    expect(plusDagen('2026-12-31', 1)).toBe('2027-01-01');
    expect(plusDagen('2027-01-01', -1)).toBe('2026-12-31');
    expect(plusDagen('2028-02-28', 1)).toBe('2028-02-29');
    // Laatste zondag van maart en oktober: het uur verspringt.
    expect(plusDagen('2026-03-28', 1)).toBe('2026-03-29');
    expect(plusDagen('2026-03-29', 1)).toBe('2026-03-30');
    expect(plusDagen('2026-10-24', 1)).toBe('2026-10-25');
    expect(plusDagen('2026-10-25', 1)).toBe('2026-10-26');
    expect(plusDagen('2026-10-26', -7)).toBe('2026-10-19');
  });
});

describe('weken beginnen op maandag', () => {
  test('weekdag', () => {
    expect(weekdag('2026-11-09')).toBe(1); // maandag
    expect(weekdag('2026-11-12')).toBe(4); // donderdag
    expect(weekdag('2026-11-15')).toBe(7); // zondag
  });

  test('weekStart op maandag, zondag en over de jaarwissel', () => {
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  test('weekDagen geeft zeven dagen vanaf maandag', () => {
    expect(weekDagen('2026-11-12')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ]);
  });

  test('maandRaster', () => {
    const november = maandRaster('2026-11'); // 1 november 2026 is een zondag
    expect(november[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(november.at(-1)[0]).toBe('2026-11-30');
    expect(november.every((rij) => rij.length === 7)).toBe(true);
    expect(november.flat().filter(Boolean)).toHaveLength(30);

    const februari = maandRaster('2027-02'); // begint op maandag, 28 dagen: precies vier rijen
    expect(februari).toHaveLength(4);
    expect(februari[0][0]).toBe('2027-02-01');
  });
});

describe('vandaag en dagdeel', () => {
  const nu = new Date(2026, 10, 12, 14, 5);

  test('isToekomst', () => {
    expect(isToekomst('2026-11-13', nu)).toBe(true);
    expect(isToekomst('2026-11-12', nu)).toBe(false);
    expect(isToekomst('2026-11-11', nu)).toBe(false);
  });

  test('dagdeel: ochtend 07:00 tot 11:59, middag 12:00 tot 16:59, avond 17:00 tot 06:59', () => {
    const om = (u, m) => dagdeel(new Date(2026, 10, 12, u, m));
    expect([om(0, 30), om(6, 59), om(7, 0), om(11, 59), om(12, 0), om(16, 59), om(17, 0), om(23, 59)]).toEqual([
      'avond', 'avond', 'ochtend', 'ochtend', 'middag', 'middag', 'avond', 'avond',
    ]);
  });

  test('nuAlsTijd', () => {
    expect(nuAlsTijd(nu)).toBe('14:05');
    expect(nuAlsTijd(new Date(2026, 10, 12, 7, 0))).toBe('07:00');
  });
});

describe('opmaak nl-BE', () => {
  const nu = new Date(2026, 10, 12);

  test('lang, met jaar alleen als het niet het huidige is', () => {
    expect(opmaakDatum('2026-11-12', 'lang', nu)).toBe('donderdag 12 november');
    expect(opmaakDatum('2025-12-31', 'lang', nu)).toBe('woensdag 31 december 2025');
  });

  test('kort, dag en maand', () => {
    expect(opmaakDatum('2026-11-12', 'kort', nu)).toBe('do 12 nov');
    expect(opmaakDatum('2026-03-01', 'kort', nu)).toBe('zo 1 mrt');
    expect(opmaakDatum('2026-11-02', 'dag', nu)).toBe('2');
    expect(opmaakDatum('2026-11', 'maand', nu)).toBe('november 2026');
    expect(opmaakDatum('2026-11-12', 'maand', nu)).toBe('november 2026');
  });

  test('week, ook over twee maanden', () => {
    expect(opmaakDatum('2026-11-12', 'week', nu)).toBe('Week van 9 tot 15 november');
    expect(opmaakDatum('2026-11-30', 'week', nu)).toBe('Week van 30 november tot 6 december');
  });
});
