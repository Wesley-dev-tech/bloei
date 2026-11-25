// Het weer van nu (logica/weer.js): wat het toestel verlaat, hoe het antwoord gelezen wordt en welke zinnen erbij horen. Pure functies.
import { describe, expect, test } from 'vitest';
import { WEERGROEPEN, WEERICONEN, WEERNAMEN, WEER_ORIGIN, leesAntwoord, rondAf, voorbeeldWeer, weerAdres, weerBeeld, weerSoort } from '../../src/logica/weer.js';
import { GROEPEN } from '../../src/logica/motivatie.js';
import { TEKSTEN } from '../../src/teksten.js';
import { existsSync } from 'node:fs';

describe('wat er naar de weerdienst gaat', () => {
  test('de plaats wordt afgerond op één cijfer na de komma (ongeveer elf kilometer)', () => {
    expect(rondAf(50.846722)).toBe(50.8);
    expect(rondAf(4.352528)).toBe(4.4);
    expect(rondAf(-0.04)).toBe(-0);
  });

  test('het adres bevat alleen de afgeronde plaats en de gevraagde waarden', () => {
    const adres = weerAdres(50.846722, 4.352528);
    const url = new URL(adres);
    expect(url.origin + url.pathname).toBe(WEER_ORIGIN + '/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '50.8',
      longitude: '4.4',
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      daily: 'temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,snowfall_sum',
      forecast_days: '1',
      timezone: 'auto',
    });
    expect(adres).not.toContain('50.84');
    expect(adres).not.toContain('4.35');
    expect(new URL(adres).origin).toBe('https://api.open-meteo.com');
  });

  test('een ongeldige plaats geeft geen adres', () => {
    for (const [b, l] of [[undefined, 5], [51, null], [NaN, 5], [91, 5], [51, 181], ['x', 'y']]) expect(weerAdres(b, l), `${b},${l}`).toBeNull();
  });
});

describe('het antwoord van de dienst', () => {
  test('een gewoon antwoord', () => {
    const daily = { temperature_2m_min: [4.4], temperature_2m_max: [10.6], precipitation_probability_max: [85], precipitation_sum: [2.34], snowfall_sum: [0] };
    expect(leesAntwoord({ current: { temperature_2m: 8.6, apparent_temperature: 5.7, weather_code: 61, wind_speed_10m: 14.4, is_day: 1 }, daily })).toEqual({ code: 61, temp: 9, gevoel: 6, wind: 14, dag: true, min: 4, max: 11, kans: 85, mm: 2.3, sneeuw: 0 });
    // Zonder de waarden van vandaag blijft het weer van nu bruikbaar: het weerbericht laat het bereik en de kans dan weg.
    expect(leesAntwoord({ current: { temperature_2m: -2.2, weather_code: 0, wind_speed_10m: 3, is_day: 0 } })).toEqual({ code: 0, temp: -2, gevoel: null, wind: 3, dag: false, min: null, max: null, kans: null, mm: null, sneeuw: null });
    expect(leesAntwoord({ current: { temperature_2m: 5, weather_code: 3 }, daily: { temperature_2m_min: [9], temperature_2m_max: [2], precipitation_probability_max: [140], precipitation_sum: [-1], snowfall_sum: ['veel'] } })).toEqual({ code: 3, temp: 5, gevoel: null, wind: 0, dag: true, min: null, max: null, kans: null, mm: null, sneeuw: null });
  });

  test('iets anders dan verwacht geeft null, nooit een fout', () => {
    for (const fout of [null, undefined, {}, { current: null }, { current: {} }, { current: { temperature_2m: 'warm', weather_code: 1 } }, { current: { temperature_2m: 10, weather_code: 1.5 } }, { current: { temperature_2m: 10, weather_code: 250 } }, { current: { temperature_2m: 900, weather_code: 1 } }, 'tekst', 7]) {
      expect(leesAntwoord(fout)).toBeNull();
    }
  });
});

describe('welke zinnen bij welk weer horen', () => {
  const w = (code, temp, extra = {}) => weerSoort({ code, temp, wind: 10, dag: true, ...extra });

  test('elke weersoort', () => {
    expect(w(95, 20)).toBe('weerOnweer');
    expect(w(73, -1)).toBe('weerSneeuw');
    expect(w(0, 30)).toBe('weerHeet');
    expect(w(3, -3)).toBe('weerVorst');
    expect(w(61, 11)).toBe('weerRegen');
    expect(w(80, 15)).toBe('weerRegen');
    expect(w(45, 9)).toBe('weerMist');
    expect(w(3, 12, { wind: 55 })).toBe('weerWind');
    expect(w(0, 18)).toBe('weerZon');
    expect(w(1, 4)).toBe('weerZon');
    expect(w(3, 5)).toBe('weerKoud');
    expect(w(3, 14)).toBe('weerGrijs');
  });

  test('het opvallendste gaat voor: onweer boven hitte, sneeuw boven vorst, regen boven kou', () => {
    expect(w(95, 31)).toBe('weerOnweer');
    expect(w(71, -4)).toBe('weerSneeuw');
    expect(w(63, 3)).toBe('weerRegen');
  });

  test("'s nachts geen zon en geen grijze lucht; een zachte, heldere nacht geeft niets", () => {
    expect(w(0, 15, { dag: false })).toBeNull();
    expect(w(3, 15, { dag: false })).toBeNull();
    expect(w(0, 3, { dag: false })).toBe('weerKoud');
    expect(w(61, 10, { dag: false })).toBe('weerRegen');
  });

  test('zonder bruikbaar weer: null', () => {
    for (const fout of [null, undefined, {}, { code: 3 }, { temp: 10 }, { code: 'x', temp: 'y' }]) expect(weerSoort(fout)).toBeNull();
  });

  test('elke uitkomst is een bestaande groep zinnen', () => {
    for (const g of WEERGROEPEN) expect(GROEPEN[g], g).toBeGreaterThanOrEqual(4);
    for (let code = 0; code <= 99; code++) {
      for (const temp of [-10, 0, 5, 12, 22, 30]) {
        for (const dag of [true, false]) {
          const g = weerSoort({ code, temp, wind: 10, dag });
          if (g !== null) expect(WEERGROEPEN, `${code} ${temp}`).toContain(g);
        }
      }
    }
  });
});

describe('het weerbericht: icoon en naam bij elke weercode', () => {
  test('elke code geeft een icoon dat bestaat en een naam die in de teksten staat', () => {
    for (const icoon of WEERICONEN) expect(existsSync(new URL(`../../src/iconen/solid/${icoon}.svg`, import.meta.url)), icoon).toBe(true);
    for (const naam of WEERNAMEN) expect(typeof TEKSTEN.weer[naam], naam).toBe('string');
    for (let code = 0; code <= 99; code++) {
      for (const dag of [true, false]) {
        const beeld = weerBeeld({ code, temp: 10, dag });
        expect(WEERICONEN, String(code)).toContain(beeld.icoon);
        expect(WEERNAMEN, String(code)).toContain(beeld.naam);
      }
    }
  });

  test("overdag een zon, 's nachts een maan", () => {
    expect(weerBeeld({ code: 0, temp: 20, dag: true })).toEqual({ icoon: 'sun', naam: 'zonnig' });
    expect(weerBeeld({ code: 0, temp: 12, dag: false })).toEqual({ icoon: 'moon', naam: 'helder' });
    expect(weerBeeld({ code: 2, temp: 12, dag: false })).toEqual({ icoon: 'cloud-moon', naam: 'halfBewolkt' });
    expect(weerBeeld({ code: 63, temp: 12, dag: false })).toEqual({ icoon: 'cloud-rain', naam: 'regen' });
  });

  test('zonder bruikbaar weer is er geen weerbericht', () => {
    for (const fout of [null, undefined, {}, { code: 3 }, { temp: 10 }]) expect(weerBeeld(fout)).toBeNull();
  });
});

describe('het voorbeeldweer van de demo', () => {
  test('elke dag van het jaar geeft weer dat bij een groep hoort, zonder netwerk', () => {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const datum = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        expect(WEERGROEPEN, datum).toContain(weerSoort(voorbeeldWeer(datum)));
      }
    }
  });

  test('het past bij het seizoen: geen sneeuw in juli, geen hitte in januari', () => {
    for (let d = 1; d <= 28; d++) {
      expect(weerSoort(voorbeeldWeer(`2026-07-${String(d).padStart(2, '0')}`))).not.toBe('weerSneeuw');
      expect(weerSoort(voorbeeldWeer(`2026-01-${String(d).padStart(2, '0')}`))).not.toBe('weerHeet');
    }
  });
});
