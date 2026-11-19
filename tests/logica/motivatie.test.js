// De warme zin van de dag en van de week (PLAN.md §15.2): pure functies, vaste keuze per dag.
import { describe, expect, test } from 'vitest';
import { GROEPEN, WEEKGROEPEN, isDagRond, kiesWeekZin, kiesZin } from '../../src/logica/motivatie.js';

const leeg = {
  dagdeel: 'ochtend', maaltijden: 0, ml: 0, doelMl: 2000, supplementen: { genomen: 0, totaal: 0 }, stemming: null,
  lopendeReeks: 0, dagenBijgehouden: 0, dagenSindsVorige: null, datum: '2026-11-13',
};
const groepVan = (sleutel) => sleutel.split('.')[1];

describe('kiesZin', () => {
  test('GROEPEN heeft acht groepen met elk vijf zinnen', () => {
    expect(Object.keys(GROEPEN).sort()).toEqual(['begin', 'dagRond', 'drinkenBijna', 'drinkenKlaar', 'onderweg', 'reeks', 'supplementenKlaar', 'terug']);
    for (const aantal of Object.values(GROEPEN)) expect(aantal).toBe(5);
  });

  test('de juiste groep bij elke toestand', () => {
    const cases = [
      [{}, 'begin'],
      [{ maaltijden: 1 }, 'onderweg'],
      [{ stemming: 3 }, 'onderweg'],
      [{ ml: 1500 }, 'drinkenBijna'],
      [{ ml: 2000 }, 'drinkenKlaar'],
      [{ ml: 2400 }, 'drinkenKlaar'],
      [{ supplementen: { genomen: 2, totaal: 2 } }, 'supplementenKlaar'],
      [{ supplementen: { genomen: 1, totaal: 2 } }, 'onderweg'],
      [{ maaltijden: 2, ml: 600, supplementen: { genomen: 1, totaal: 2 }, stemming: 4 }, 'onderweg'], // stemming telt niet mee voor een ronde dag
      [{ maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 2, totaal: 2 } }, 'dagRond'], // alles in orde, zonder stemming; dagRond gaat voor de losse klaar-groepen
      [{ maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 0, totaal: 0 } }, 'dagRond'], // zonder supplementen telt dat als in orde
      [{ maaltijden: 6, etenKlaar: true, ml: 2000, supplementen: { genomen: 2, totaal: 2 }, stemming: 1 }, 'dagRond'],
      [{ maaltijden: 6, etenKlaar: true, ml: 1750, supplementen: { genomen: 2, totaal: 2 }, stemming: 4 }, 'drinkenBijna'], // alles behalve het drinkdoel: niet rond
      [{ maaltijden: 6, etenKlaar: true, ml: 1999, supplementen: { genomen: 0, totaal: 0 }, stemming: 4 }, 'drinkenBijna'],
      [{ maaltijden: 6, etenKlaar: true, ml: 500, supplementen: { genomen: 2, totaal: 2 } }, 'onderweg'], // alleen het drinken ontbreekt, maar nog ver weg: geen "bijna"
      [{ maaltijden: 6, etenKlaar: false, ml: 2000, supplementen: { genomen: 2, totaal: 2 } }, 'drinkenKlaar'], // eten niet in orde
      [{ maaltijden: 6, etenKlaar: true, ml: 2000, supplementen: { genomen: 1, totaal: 2 } }, 'drinkenKlaar'], // supplementen niet in orde
      [{ maaltijden: 1, dagenSindsVorige: 4 }, 'terug'],
      [{ dagenSindsVorige: 9 }, 'begin'], // nog niets ingevuld: geen welkom-terug
      [{ maaltijden: 1, lopendeReeks: 7 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 14 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 30 }, 'reeks'],
      [{ maaltijden: 1, lopendeReeks: 8 }, 'onderweg'],
      [{ lopendeReeks: 7 }, 'begin'],
      [{ maaltijden: 1, lopendeReeks: 7, dagenSindsVorige: 5 }, 'terug'], // terug gaat voor reeks
    ];
    for (const [wijziging, groep] of cases) expect(groepVan(kiesZin({ ...leeg, ...wijziging })), JSON.stringify(wijziging)).toBe(groep);
  });

  test('het dagdoel komt uit de status: bij 1500 ml en een doel van 1500 is het drinken klaar', () => {
    expect(groepVan(kiesZin({ ...leeg, ml: 1500, doelMl: 1500 }))).toBe('drinkenKlaar');
    expect(groepVan(kiesZin({ ...leeg, ml: 1500, doelMl: 2000 }))).toBe('drinkenBijna');
    expect(groepVan(kiesZin({ ...leeg, ml: 1499, doelMl: 2000 }))).toBe('onderweg');
  });

  test('altijd een geldige sleutel binnen het aantal zinnen van de groep', () => {
    for (let dagNr = 1; dagNr <= 28; dagNr++) {
      const datum = `2026-11-${String(dagNr).padStart(2, '0')}`;
      for (const wijziging of [{}, { maaltijden: 1 }, { ml: 1600 }, { ml: 2000 }, { maaltijden: 1, dagenSindsVorige: 6 }, { maaltijden: 1, lopendeReeks: 14 }, { supplementen: { genomen: 1, totaal: 1 } }, { maaltijden: 1, ml: 5, stemming: 2, supplementen: { genomen: 1, totaal: 3 } }]) {
        const sleutel = kiesZin({ ...leeg, ...wijziging, datum });
        const [naamruimte, groep, nr] = sleutel.split('.');
        expect(naamruimte).toBe('motivatie');
        expect(GROEPEN[groep]).toBeDefined();
        expect(Number(nr)).toBeGreaterThanOrEqual(1);
        expect(Number(nr)).toBeLessThanOrEqual(GROEPEN[groep]);
      }
    }
  });

  test('dezelfde dag en dezelfde toestand geven altijd dezelfde zin; andere dagen wisselen', () => {
    const een = kiesZin({ ...leeg, maaltijden: 1 });
    for (let i = 0; i < 5; i++) expect(kiesZin({ ...leeg, maaltijden: 1 })).toBe(een);
    const verschillend = new Set();
    for (let dagNr = 1; dagNr <= 28; dagNr++) verschillend.add(kiesZin({ ...leeg, maaltijden: 1, datum: `2026-11-${String(dagNr).padStart(2, '0')}` }));
    expect(verschillend.size).toBeGreaterThan(2);
  });

  test('zonder status valt het terug op begin', () => {
    expect(groepVan(kiesZin(undefined))).toBe('begin');
  });
});

describe('kiesWeekZin', () => {
  test('groepen week0, week1, week4 en week7 met drie zinnen', () => {
    expect(WEEKGROEPEN).toEqual({ week0: 3, week1: 3, week4: 3, week7: 3 });
    const verwacht = { 0: 'week0', 1: 'week1', 3: 'week1', 4: 'week4', 6: 'week4', 7: 'week7' };
    for (const [dagen, groep] of Object.entries(verwacht)) {
      const sleutel = kiesWeekZin(Number(dagen), '2026-11-09');
      expect(groepVan(sleutel), dagen).toBe(groep);
      expect(Number(sleutel.split('.')[2])).toBeLessThanOrEqual(3);
    }
  });

  test('dezelfde week geeft dezelfde zin', () => {
    expect(kiesWeekZin(5, '2026-11-09')).toBe(kiesWeekZin(5, '2026-11-09'));
  });
});

describe('isDagRond (gedeeld met de badges dag-rond en zeven-dagen-rond)', () => {
  test('geeft precies dagRond voor de zin als de dag rond is', () => {
    const basis = { ...leeg, maaltijden: 3, etenKlaar: true, ml: 2000, supplementen: { genomen: 1, totaal: 1 } };
    for (const wijziging of [{}, { ml: 1900 }, { etenKlaar: false }, { supplementen: { genomen: 0, totaal: 1 } }, { supplementen: { genomen: 0, totaal: 0 } }, { stemming: 2 }]) {
      const status = { ...basis, ...wijziging };
      expect(isDagRond(status), JSON.stringify(wijziging)).toBe(groepVan(kiesZin(status)) === 'dagRond');
    }
  });
});

describe('iets (BESLISSING 168)', () => {
  const leeg = { maaltijden: 0, ml: 0, doelMl: 2000, supplementen: { genomen: 0, totaal: 0 }, stemming: null, lopendeReeks: 0, dagenBijgehouden: 0, dagenSindsVorige: null, datum: '2026-11-13' };
  test('met iets: waar telt een dag als begonnen, ook zonder eten of drinken (bijvoorbeeld alleen een notitie)', () => {
    expect(kiesZin(leeg)).toMatch(/^motivatie\.begin\./);
    expect(kiesZin({ ...leeg, iets: true })).toMatch(/^motivatie\.onderweg\./);
  });
  test('zonder iets rekent kiesZin het zelf uit, zoals voorheen', () => {
    expect(kiesZin({ ...leeg, maaltijden: 1 })).toMatch(/^motivatie\.onderweg\./);
  });
});
