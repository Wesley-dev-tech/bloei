// Het weer van nu (logica/weer.js): wat het toestel verlaat, hoe het antwoord gelezen wordt en welke zinnen erbij horen. Pure functies.
import { describe, expect, test } from 'vitest';
import { GOED_M, RUW_M, besteMeting, isGoedeMeting, isRuweMeting, PLAATS2_ORIGIN, PLAATS_ORIGIN, leesPlaats2, plaatsAdres2, WEERGROEPEN, WEERICONEN, WEERNAMEN, WEER_ORIGIN, isVerplaatst, leesAntwoord, leesPlaats, plaatsAdres, graad, voorbeeldWeer, weerAdres, weerBeeld, weerSoort } from '../../src/logica/weer.js';
import { GROEPEN } from '../../src/logica/motivatie.js';
import { TEKSTEN } from '../../src/teksten.js';
import { existsSync } from 'node:fs';

describe('wat er naar de weerdienst gaat', () => {
  test('de plaats gaat naar buiten zoals het toestel ze geeft: niets wordt afgerond', () => {
    expect(graad(50.846722)).toBe('50.846722');
    expect(graad(4.352528123456)).toBe('4.352528123456');
    expect(graad(-0.004)).toBe('-0.004');
    expect(graad(51)).toBe('51');
    expect(graad(0.0000001)).toBe('0.000000100000000');
    expect(Number(graad(50.84672212345678))).toBe(50.84672212345678);
  });

  test('het adres bevat alleen de plaats, niet afgerond, en de gevraagde waarden', () => {
    const adres = weerAdres(50.846722, 4.352528);
    const url = new URL(adres);
    expect(url.origin + url.pathname).toBe(WEER_ORIGIN + '/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '50.846722',
      longitude: '4.352528',
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      daily: 'temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,snowfall_sum',
      forecast_days: '1',
      timezone: 'auto',
    });
    expect(new URL(adres).origin).toBe('https://api.open-meteo.com');
  });

  test('een ongeldige plaats geeft geen adres', () => {
    for (const [b, l] of [[undefined, 5], [51, null], [NaN, 5], [91, 5], [51, 181], ['x', 'y']]) expect(weerAdres(b, l), `${b},${l}`).toBeNull();
  });
});

describe('de naam van de gemeente', () => {
  test('de vraag bevat alleen de plaats, niet afgerond, en de taal', () => {
    const adres = plaatsAdres(50.846722, 4.352528);
    const url = new URL(adres);
    expect(url.origin).toBe(PLAATS_ORIGIN);
    expect(url.origin + url.pathname).toBe('https://api.bigdatacloud.net/data/reverse-geocode-client');
    expect(Object.fromEntries(url.searchParams)).toEqual({ latitude: '50.846722', longitude: '4.352528', localityLanguage: 'nl' });
    for (const [b, l] of [[undefined, 5], [51, null], [NaN, 5], [91, 5], [51, 181]]) expect(plaatsAdres(b, l), `${b},${l}`).toBeNull();
  });

  test('het weer krijgt dezelfde plaats als de gemeente: het is het weer van de plek waar ze echt is', () => {
    const weer = new URL(weerAdres(50.846722, 4.352528)).searchParams;
    const plaats = new URL(plaatsAdres(50.846722, 4.352528)).searchParams;
    expect([weer.get('latitude'), weer.get('longitude')]).toEqual([plaats.get('latitude'), plaats.get('longitude')]);
  });

  test('uit het antwoord: eerst de gemeente (city), anders het kleinste benoemde gebied (locality)', () => {
    expect(leesPlaats({ city: 'Balen', locality: 'Olmen' })).toBe('Balen');
    expect(leesPlaats({ city: '', locality: 'Olmen' })).toBe('Olmen');
    expect(leesPlaats({ city: '  Heist-op-den-Berg ' })).toBe('Heist-op-den-Berg');
    expect(leesPlaats({ locality: "'s-Hertogenbosch" })).toBe("'s-Hertogenbosch");
    // Zonder city en locality: de gemeente uit de bestuurlijke gebieden (niveau 8), niet de provincie of het land.
    const bestuur = { localityInfo: { administrative: [{ name: 'België', adminLevel: 2 }, { name: 'Antwerpen', adminLevel: 6 }, { name: 'Balen', adminLevel: 8 }] } };
    expect(leesPlaats({ city: '', locality: '', ...bestuur })).toBe('Balen');
    expect(leesPlaats({ city: 'Mol', ...bestuur })).toBe('Mol');
    expect(leesPlaats({ localityInfo: { administrative: 'geen lijst' } })).toBeNull();
    expect(leesPlaats({ localityInfo: { administrative: [{ name: 'Antwerpen', adminLevel: 6 }] } })).toBeNull();
  });

  test('iets anders dan een gewone naam geeft null, nooit een fout', () => {
    for (const fout of [null, undefined, {}, { city: 42 }, { city: '', locality: '' }, { city: 'x' }, { city: '<b>Balen</b>' }, { city: 'a'.repeat(60) }, { city: 'Ba\u0007len' }, 'tekst', 7]) expect(leesPlaats(fout)).toBeNull();
  });

  test('OpenStreetMap krijgt dezelfde plaats, niet afgerond, en geeft de gemeente, de stad of het dorp', () => {
    const url = new URL(plaatsAdres2(50.846722, 4.352528));
    expect(url.origin).toBe(PLAATS2_ORIGIN);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/reverse');
    expect(Object.fromEntries(url.searchParams)).toEqual({ format: 'jsonv2', lat: '50.846722', lon: '4.352528', zoom: '10', 'accept-language': 'nl' });
    for (const [b, l] of [[undefined, 5], [51, null], [NaN, 5], [91, 5], [51, 181]]) expect(plaatsAdres2(b, l), `${b},${l}`).toBeNull();
    expect(leesPlaats2({ name: 'Balen', address: { town: 'Balen', county: 'Turnhout', state: 'Antwerpen', country: 'België' } })).toBe('Balen');
    expect(leesPlaats2({ name: 'Brussel-Hoofdstad', address: { city: 'Brussel' } })).toBe('Brussel');
    expect(leesPlaats2({ address: { village: 'Olmen', municipality: 'Balen' } })).toBe('Balen');
    expect(leesPlaats2({ name: 'Olmen', address: {} })).toBe('Olmen');
    for (const fout of [null, undefined, {}, { address: 'tekst' }, { address: { town: '<b>x</b>' } }, { error: 'Unable to geocode' }, 7]) expect(leesPlaats2(fout)).toBeNull();
  });

  test('opnieuw opzoeken zodra de plek ook maar iets anders is', () => {
    const vorige = { b: 50.846722, l: 4.352528, naam: 'Brussel' };
    expect(isVerplaatst(null, 50.846722, 4.352528)).toBe(true);
    expect(isVerplaatst(vorige, 50.846722, 4.352528)).toBe(false);
    expect(isVerplaatst(vorige, 50.846723, 4.352528)).toBe(true);
    expect(isVerplaatst(vorige, 50.846722, 4.352529)).toBe(true);
  });

  test('een antwoord dat op het internetadres steunt telt niet als plaats', () => {
    expect(leesPlaats({ city: 'Brussel', lookupSource: 'coordinates' })).toBe('Brussel');
    expect(leesPlaats({ city: 'Brussel' })).toBe('Brussel');
    expect(leesPlaats({ city: 'Brussel', lookupSource: 'ipGeolocation' })).toBeNull();
    expect(leesPlaats({ city: 'Brussel', lookupSource: 'IP geolocation' })).toBeNull();
  });

  test('de fijnste meting telt, en ruw is alleen wat het toestel zelf ruw noemt', () => {
    const m = (accuracy) => ({ coords: { latitude: 50.85, longitude: 4.35, accuracy } });
    const ruw = m(9000);
    const fijn = m(40);
    expect(besteMeting(null, ruw)).toBe(ruw);
    expect(besteMeting(ruw, fijn)).toBe(fijn);
    expect(besteMeting(fijn, ruw)).toBe(fijn);
    expect(besteMeting(fijn, m(40)).coords.accuracy).toBe(40);
    expect(besteMeting(m(undefined), fijn)).toBe(fijn);
    expect(isGoedeMeting(fijn)).toBe(true);
    expect(isGoedeMeting(m(GOED_M))).toBe(true);
    expect(isGoedeMeting(m(GOED_M + 1))).toBe(false);
    expect(isGoedeMeting(m(undefined))).toBe(false);
    expect(isRuweMeting(ruw)).toBe(true);
    expect(isRuweMeting(m(RUW_M))).toBe(false);
    expect(isRuweMeting(fijn)).toBe(false);
    expect(isRuweMeting(m(undefined))).toBe(false);
    expect(isRuweMeting(null)).toBe(false);
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
