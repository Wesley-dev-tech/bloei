// De kalender van de motivator (logica/kalender.js): een verjaardag zonder jaar, feestdagen en seizoenen.
import { describe, expect, test } from 'vitest';
import { dagenInMaand, feestdagOp, geldigeVerjaardag, isJarig, leeftijdOp, pasen, seizoenOp } from '../../src/logica/kalender.js';

describe('de geboortedatum', () => {
  test('een echte dag, niet in de toekomst', () => {
    expect(geldigeVerjaardag({ dag: 24, maand: 11, jaar: 1990 })).toEqual({ dag: 24, maand: 11, jaar: 1990 });
    expect(geldigeVerjaardag({ dag: '3', maand: '7', jaar: '1985' })).toEqual({ dag: 3, maand: 7, jaar: 1985 });
    expect(geldigeVerjaardag({ dag: 29, maand: 2, jaar: 1992 })).toEqual({ dag: 29, maand: 2, jaar: 1992 });
    for (const fout of [null, undefined, {}, { dag: 24, maand: 11 }, { dag: 31, maand: 4, jaar: 1990 }, { dag: 29, maand: 2, jaar: 1991 }, { dag: 0, maand: 5, jaar: 1990 }, { dag: 5, maand: 13, jaar: 1990 }]) expect(geldigeVerjaardag(fout)).toBe(null);
    expect(geldigeVerjaardag({ dag: 25, maand: 11, jaar: 2026 }, '2026-11-24')).toBe(null); // morgen
    expect(geldigeVerjaardag({ dag: 24, maand: 11, jaar: 2026 }, '2026-11-24')).toEqual({ dag: 24, maand: 11, jaar: 2026 });
    expect(geldigeVerjaardag({ dag: 1, maand: 1, jaar: 1900 }, '2026-11-24')).toBe(null);
    expect(dagenInMaand(2)).toBe(29);
  });
  test('jarig op de dag zelf; 29 februari viert in een gewoon jaar op 28 februari; de leeftijd die ze die dag wordt', () => {
    const v = { dag: 24, maand: 11, jaar: 1990 };
    expect(isJarig(v, '2026-11-24')).toBe(true);
    expect(isJarig(v, '2026-11-25')).toBe(false);
    expect(isJarig(v, '1990-11-24')).toBe(false); // de dag van haar geboorte
    expect(isJarig(null, '2026-11-24')).toBe(false);
    expect(isJarig({ dag: 29, maand: 2, jaar: 1992 }, '2028-02-29')).toBe(true);
    expect(isJarig({ dag: 29, maand: 2, jaar: 1992 }, '2028-02-28')).toBe(false);
    expect(isJarig({ dag: 29, maand: 2, jaar: 1992 }, '2027-02-28')).toBe(true);
    expect(leeftijdOp(v, '2026-11-24')).toBe(36);
    expect(leeftijdOp(v, '2026-11-23')).toBe(35);
    expect(leeftijdOp({ dag: 29, maand: 2, jaar: 1992 }, '2027-02-28')).toBe(35);
    expect(leeftijdOp(null, '2026-11-24')).toBe(null);
  });
});

describe('feestdagen en seizoenen', () => {
  test('Pasen verschuift elk jaar; paasmaandag telt mee', () => {
    expect(pasen(2026)).toBe('2026-04-05');
    expect(pasen(2027)).toBe('2027-03-28');
    expect(pasen(2024)).toBe('2024-03-31');
    expect(feestdagOp('2026-04-05')).toBe('pasen');
    expect(feestdagOp('2026-04-06')).toBe('paasmaandag');
    expect(feestdagOp('2024-04-01')).toBe('paasmaandag'); // paasmaandag in de volgende maand
    expect(feestdagOp('2026-04-07')).toBe(null);
  });
  test('de tien wettelijke Belgische feestdagen en de andere dagen met een zin; geen Moederdag of Vaderdag', () => {
    const vast = { '2026-05-01': 'arbeid', '2026-05-14': 'hemelvaart', '2026-05-24': 'pinksteren', '2026-05-25': 'pinkstermaandag', '2026-08-15': 'olv', '2026-11-01': 'allerheiligen', '2026-11-11': 'wapenstilstand', '2026-01-01': 'nieuwjaar', '2026-02-14': 'valentijn', '2026-07-21': 'feestdag', '2026-10-31': 'halloween', '2026-12-06': 'sinterklaas', '2026-12-24': 'kerstavond', '2026-12-25': 'kerst', '2026-12-26': 'tweedeKerstdag', '2026-12-31': 'oudjaar' };
    for (const [datum, naam] of Object.entries(vast)) expect(feestdagOp(datum), datum).toBe(naam);
    for (const datum of ['2026-05-10', '2026-06-14', '2026-11-24', '']) expect(feestdagOp(datum), datum).toBe(null);
  });
  test('het seizoen en de dag waarop het begint', () => {
    expect(seizoenOp('2026-03-19')).toEqual({ naam: 'winter', start: false });
    expect(seizoenOp('2026-03-20')).toEqual({ naam: 'lente', start: true });
    expect(seizoenOp('2026-06-21')).toEqual({ naam: 'zomer', start: true });
    expect(seizoenOp('2026-09-22')).toEqual({ naam: 'herfst', start: true });
    expect(seizoenOp('2026-11-24')).toEqual({ naam: 'herfst', start: false });
    expect(seizoenOp('2026-12-21')).toEqual({ naam: 'winter', start: true });
    expect(seizoenOp('2027-01-05')).toEqual({ naam: 'winter', start: false });
    expect(seizoenOp('')).toBe(null);
  });
});
