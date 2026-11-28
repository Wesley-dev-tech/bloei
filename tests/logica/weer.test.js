// Het weerbericht (logica/weer.js): wat het toestel verlaat, welke meting telt, hoe het antwoord gelezen wordt. Pure functies.
import { describe, expect, test } from 'vitest';
import {
  BEWAARDAGEN,
  BEWAARUREN,
  FIJN_M,
  GRENS_M,
  STANDAARDPLEK,
  WEEKDAGEN,
  WEERICONEN,
  WEERNAMEN,
  WEER_ORIGIN,
  besteMeting,
  graad,
  isBruikbaar,
  isFijn,
  leesAntwoord,
  plekVanTijdzone,
  rondePlek,
  straalVan,
  uvWoord,
  voorbeeldWeer,
  weerAdres,
  WEERGROEPEN,
  WEER_EXTREEM,
  isHittegolf,
  weerBeeld,
  weerSoort,
  weerVoorNu,
  windkracht,
  windrichting,
} from '../../src/logica/weer.js';
import * as logica from '../../src/logica/weer.js';
import { TEKSTEN } from '../../src/teksten.js';
import { existsSync, readFileSync } from 'node:fs';

const meting = (latitude, longitude, accuracy) => ({ coords: { latitude, longitude, accuracy } });

describe('welke meting van het toestel telt', () => {
  test('tot 1 km is een meting fijn, tot 20 km bruikbaar, grover telt niet', () => {
    expect(FIJN_M).toBe(1000);
    expect(GRENS_M).toBe(20000);
    expect(isFijn(meting(51.16, 5.18, 9))).toBe(true);
    expect(isFijn(meting(51.16, 5.18, 1000))).toBe(true);
    expect(isFijn(meting(51.16, 5.18, 1001))).toBe(false);
    expect(isBruikbaar(meting(51.16, 5.18, 4000))).toBe(true);
    expect(isBruikbaar(meting(51.16, 5.18, 20000))).toBe(true);
    expect(isBruikbaar(meting(51.16, 5.18, 45000))).toBe(false);
  });

  test('een meting zonder straal is bruikbaar maar nooit fijn; zonder geldige plek telt ze niet', () => {
    expect(straalVan(meting(51.16, 5.18, undefined))).toBe(Infinity);
    expect(straalVan(meting(51.16, 5.18, -1))).toBe(Infinity);
    expect(isFijn(meting(51.16, 5.18, undefined))).toBe(false);
    expect(isBruikbaar(meting(51.16, 5.18, undefined))).toBe(true);
    for (const fout of [meting(NaN, 5.18, 10), meting(51.16, 181, 10), meting(91, 5.18, 10), meting('51.16', 5.18, 10), {}, null]) {
      expect(isFijn(fout)).toBe(false);
      expect(isBruikbaar(fout)).toBe(false);
    }
  });

  test('de beste van twee metingen is de fijnste; bij gelijk de nieuwste', () => {
    const grof = meting(51.2, 5.1, 4000);
    const fijn = meting(51.16, 5.18, 12);
    expect(besteMeting(null, grof)).toBe(grof);
    expect(besteMeting(grof, fijn)).toBe(fijn);
    expect(besteMeting(fijn, grof)).toBe(fijn);
    const even = meting(51.161, 5.181, 12);
    expect(besteMeting(fijn, even)).toBe(even);
  });
});

describe('wat er naar de weerdienst gaat', () => {
  test('één dienst: Open-Meteo, en geen tweede adres in de logica', () => {
    expect(WEER_ORIGIN).toBe('https://api.open-meteo.com');
    const adressen = Object.values(logica).filter((w) => typeof w === 'string' && /^https?:/.test(w));
    expect(adressen).toEqual([WEER_ORIGIN]);
  });

  test('de plaats gaat naar buiten zoals het toestel ze geeft: niets wordt afgerond', () => {
    expect(graad(51.16234567891234)).toBe('51.16234567891234');
    expect(graad(5)).toBe('5');
    expect(graad(-0.1278)).toBe('-0.1278');
    expect(graad(1e-7)).not.toMatch(/e/i);
  });

  test('het adres bevat alleen de plaats en de gevraagde waarden: nu, de uren van een week en vijftien dagen', () => {
    const url = new URL(weerAdres(51.16234567891234, 5.18345678912345));
    expect(url.origin + url.pathname).toBe(WEER_ORIGIN + '/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('51.16234567891234');
    expect(url.searchParams.get('longitude')).toBe('5.18345678912345');
    expect([...url.searchParams.keys()].sort()).toEqual(['current', 'daily', 'forecast_days', 'forecast_hours', 'hourly', 'latitude', 'longitude', 'timezone']);
    // De kaart toont de zeven dagen na vandaag. Bloei vraagt er vijftien, en de uren van een week: zo staat er ook weer als de dienst dagen niet antwoordt.
    expect(WEEKDAGEN).toBe(7);
    expect(url.searchParams.get('forecast_days')).toBe(String(BEWAARDAGEN));
    expect(BEWAARDAGEN).toBe(15); // vandaag en de zeven dagen erna, ook met een weerbericht van een week oud (0.6.4)
    expect(url.searchParams.get('forecast_hours')).toBe(String(BEWAARUREN));
    expect(BEWAARUREN).toBe(168);
    expect(url.searchParams.get('hourly')).toBe(url.searchParams.get('current'));
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(url.searchParams.get('current').split(',')).toEqual(['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day']);
    // Hoe het minimum en het maximum aanvoelen, staat niet op de kaart en wordt dus niet gevraagd.
    expect(url.searchParams.get('daily')).not.toMatch(/apparent_temperature/);
    for (const veld of ['weather_code', 'temperature_2m_min', 'temperature_2m_max', 'precipitation_probability_max', 'precipitation_sum', 'snowfall_sum', 'wind_gusts_10m_max', 'sunrise', 'sunset', 'uv_index_max']) {
      expect(url.searchParams.get('daily').split(','), veld).toContain(veld);
    }
  });

  test('een ongeldige plaats geeft geen adres', () => {
    for (const [b, l] of [[NaN, 5], [91, 5], [51, 181], ['51', 5], [undefined, undefined]]) expect(weerAdres(b, l)).toBe(null);
  });
});

describe('het antwoord van de weerdienst', () => {
  const antwoord = {
    current: { temperature_2m: 6.3, apparent_temperature: 3.4, relative_humidity_2m: 86.6, weather_code: 61, wind_speed_10m: 17.6, wind_direction_10m: 232, wind_gusts_10m: 41.4, is_day: 0 },
    daily: {
      time: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01'],
      weather_code: [61, 3, 2, 80, 63, 3, 45],
      temperature_2m_min: [3.1, 2.4, 0.8, 4.2, 5.6, 3.3, 1.1],
      temperature_2m_max: [8.4, 7.9, 6.2, 9.1, 10.3, 7.4, 5.8],
      precipitation_probability_max: [85, 30, 10, 75, 90, 35, 20],
      precipitation_sum: [5.24, 0.3, 0, 3.8, 8.6, 0.4, 0],
      snowfall_sum: [0, 0, 0, 0, 0, 0, 0],
      sunrise: ['2026-11-25T08:14', '2026-11-26T08:15'],
      sunset: ['2026-11-25T16:42', '2026-11-26T16:41'],
      uv_index_max: [0.8, 1.1],
    },
  };

  test('alles wat de kaart toont komt eruit, afgerond zoals het getoond wordt', () => {
    const weer = leesAntwoord(antwoord);
    expect(weer).toMatchObject({ code: 61, temp: 6, gevoel: 3, vocht: 87, wind: 18, richting: 232, stoot: 41, dag: false, min: 3, max: 8, kans: 85, mm: 5.2, sneeuw: 0, zonOp: '08:14', zonOnder: '16:42', uv: 1 });
    expect(weer).not.toHaveProperty('voeltMin');
    expect(weer.dagen).toHaveLength(7);
    expect(weer.dagen[0]).toEqual({ datum: '2026-11-25', code: 61, min: 3, max: 8, kans: 85, mm: 5.2, sneeuw: 0, stootMax: null, zonOp: '08:14', zonOnder: '16:42', uv: 1 });
    expect(weer.dagen[6]).toMatchObject({ datum: '2026-12-01', code: 45, min: 1, max: 6, kans: 20, mm: 0 });
    expect(weer.uren).toEqual([]); // dit antwoord heeft geen uren
  });

  test('wat ontbreekt of niet kan, is null; zonder temperatuur of weercode is er geen weer', () => {
    expect(leesAntwoord(null)).toBe(null);
    expect(leesAntwoord({})).toBe(null);
    expect(leesAntwoord({ current: { temperature_2m: 6, weather_code: 'x' } })).toBe(null);
    expect(leesAntwoord({ current: { temperature_2m: 999, weather_code: 3 } })).toBe(null);
    const kaal = leesAntwoord({ current: { temperature_2m: 6, weather_code: 3 } });
    expect(kaal).toMatchObject({ code: 3, temp: 6, gevoel: null, vocht: null, wind: null, richting: null, dag: true, min: null, max: null, kans: null, mm: null, zonOp: null, zonOnder: null, uv: null });
    expect(kaal.dagen).toEqual([]);
    expect(kaal.uren).toEqual([]);
    // Een minimum boven het maximum kan niet: dan liever geen van beide.
    const raar = leesAntwoord({ current: { temperature_2m: 6, weather_code: 3 }, daily: { time: ['2026-11-25'], temperature_2m_min: [9], temperature_2m_max: [4], precipitation_probability_max: [140] } });
    expect(raar.dagen[0]).toMatchObject({ min: null, max: null, kans: null });
  });
});

describe('het bewaarde weerbericht, voor nu', () => {
  // Een antwoord van woensdag 25 november 2026, 20 uur: vijftien dagen en de uren van een week.
  const p = (n) => String(n).padStart(2, '0');
  const dagNa = (n) => { const d = new Date(2026, 10, 25 + n, 12); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const uurNa = (n) => { const d = new Date(2026, 10, 25, 20 + n); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; };
  const rij = (lengte, f) => Array.from({ length: lengte }, (_, i) => f(i));
  const weer = leesAntwoord({
    current: { temperature_2m: 6.3, apparent_temperature: 3.4, relative_humidity_2m: 87, weather_code: 61, wind_speed_10m: 17.6, wind_direction_10m: 232, is_day: 0 },
    hourly: { time: rij(168, uurNa), temperature_2m: rij(168, (i) => 10 + (i % 24) / 10), apparent_temperature: rij(168, (i) => 8 + (i % 24) / 10), relative_humidity_2m: rij(168, () => 80), weather_code: rij(168, (i) => (i < 24 ? 61 : 3)), wind_speed_10m: rij(168, () => 12), wind_direction_10m: rij(168, () => 225), is_day: rij(168, (i) => ((20 + i) % 24 >= 8 && (20 + i) % 24 < 17 ? 1 : 0)) },
    daily: { time: rij(15, dagNa), weather_code: rij(15, (i) => (i === 3 ? 80 : 3)), temperature_2m_min: rij(15, (i) => i), temperature_2m_max: rij(15, (i) => 10 + i), precipitation_probability_max: rij(15, (i) => i * 5), precipitation_sum: rij(15, (i) => i / 10), snowfall_sum: rij(15, () => 0), sunrise: rij(15, (i) => `${dagNa(i)}T08:${p(10 + i)}`), sunset: rij(15, (i) => `${dagNa(i)}T16:${p(40 - i)}`), uv_index_max: rij(15, () => 1) },
  });

  test('het antwoord houdt vijftien dagen en 168 uren bij', () => {
    expect(weer.dagen).toHaveLength(15);
    expect(weer.uren).toHaveLength(168);
    expect(weer.uren[0]).toEqual({ uur: '2026-11-25T20:00', code: 61, temp: 10, gevoel: 8, vocht: 80, wind: 12, richting: 225, stoot: null, dag: false });
  });

  test('hetzelfde uur: het weer van dat uur, van vandaag en van de zeven dagen erna (0.6.4)', () => {
    const nu = weerVoorNu(weer, new Date(2026, 10, 25, 21, 30));
    expect(nu).toMatchObject({ code: 61, temp: 10, gevoel: 8, vocht: 80, wind: 12, richting: 225, dag: false, min: 0, max: 10, kans: 0, zonOp: '08:10', zonOnder: '16:40' });
    expect(nu.dagen).toHaveLength(8);
    expect(nu.dagen[0].datum).toBe('2026-11-25');
    expect(weerBeeld(nu)).toEqual({ icoon: 'eigen/weer-regen-licht', naam: 'lichteRegen' });
  });

  test('drie dagen later, overdag: het weer dat toen voor dat uur voorspeld was, en nog altijd een volle week vooruit', () => {
    const nu = weerVoorNu(weer, new Date(2026, 10, 28, 10, 15));
    expect(nu).toMatchObject({ code: 3, dag: true, min: 3, max: 13, kans: 15, mm: 0.3, zonOp: '08:13', zonOnder: '16:37' });
    expect(nu.temp).toBe(Math.round(10 + ((62 % 24) / 10))); // 62 uur na het antwoord
    expect(nu.dagen.map((d) => d.datum)).toEqual([3, 4, 5, 6, 7, 8, 9, 10].map(dagNa));
    expect(nu.dagen[0].code).toBe(80);
    expect(nu).not.toHaveProperty('uur');
    expect(nu).not.toHaveProperty('datum');
  });

  test('een week later is het weerbericht op: geen uur meer voor nu, dus geen weer uit de bewaring', () => {
    expect(weerVoorNu(weer, new Date(2026, 11, 2, 19, 0))).not.toBe(null); // het laatste uur dat erin staat
    expect(weerVoorNu(weer, new Date(2026, 11, 2, 20, 0))).toBe(null);
    expect(weerVoorNu(weer, new Date(2026, 10, 25, 19, 0))).toBe(null); // voor het antwoord
    expect(weerVoorNu(weer, new Date(2027, 0, 1, 12, 0))).toBe(null);
  });

  test('zonder een volle week vooruit, of zonder bruikbare bewaring: geen weer', () => {
    expect(weerVoorNu({ ...weer, dagen: weer.dagen.slice(0, 10) }, new Date(2026, 10, 28, 10, 0))).toBe(null); // nog maar zes dagen na vandaag
    expect(weerVoorNu({ ...weer, dagen: weer.dagen.slice(0, 11) }, new Date(2026, 10, 28, 10, 0))).not.toBe(null); // zeven dagen na vandaag (0.6.4)
    for (const fout of [null, undefined, {}, { dagen: [] }, { dagen: weer.dagen }, { uren: weer.uren }, voorbeeldWeer('2026-11-25')]) expect(weerVoorNu(fout, new Date(2026, 10, 25, 21, 0))).toBe(null);
  });
});

describe('wind en uv', () => {
  test('de schaal van Beaufort bij een snelheid in km per uur', () => {
    expect([0, 1, 5, 6, 12, 19, 20, 38, 61, 117, 118, 200].map(windkracht)).toEqual([0, 0, 1, 2, 3, 3, 4, 5, 7, 11, 12, 12]);
    expect(windkracht(-1)).toBe(null);
    expect(windkracht(NaN)).toBe(null);
  });

  test('de windrichting in acht streken, waar de wind vandaan komt', () => {
    expect([0, 44, 90, 135, 180, 225, 232, 270, 315, 350, 360].map(windrichting)).toEqual(['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'ZW', 'W', 'NW', 'N', 'N']);
    expect(windrichting(-5)).toBe(null);
    expect(windrichting(undefined)).toBe(null);
  });

  test('de uv-index in een woord dat in de teksten staat', () => {
    expect([0, 2, 3, 5, 6, 7, 8, 10, 11].map(uvWoord)).toEqual(['uvLaag', 'uvLaag', 'uvMatig', 'uvMatig', 'uvHoog', 'uvHoog', 'uvZeerHoog', 'uvZeerHoog', 'uvExtreem']);
    expect(uvWoord(null)).toBe(null);
    for (const woord of ['uvLaag', 'uvMatig', 'uvHoog', 'uvZeerHoog', 'uvExtreem']) expect(typeof TEKSTEN.weer[woord], woord).toBe('string');
  });
});

describe('het weerbeeld', () => {
  test('elke weercode van de dienst heeft een icoon dat bestaat en een naam in de teksten', () => {
    for (const naam of WEERNAMEN) expect(typeof TEKSTEN.weer[naam], naam).toBe('string');
    // Een naam met een map erin ('eigen/weer-sneeuw') is een eigen tekening; anders is het een icoon van Font Awesome (solid).
    for (const icoon of WEERICONEN) expect(existsSync(new URL(`../../src/iconen/${icoon.includes('/') ? icoon : 'solid/' + icoon}.svg`, import.meta.url)), icoon).toBe(true);
    for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]) {
      const beeld = weerBeeld({ code });
      expect(WEERICONEN, String(code)).toContain(beeld.icoon);
      expect(WEERNAMEN, String(code)).toContain(beeld.naam);
    }
  });

  test("'s nachts een maan in plaats van een zon, en een code die Bloei niet kent is bewolkt", () => {
    expect(weerBeeld({ code: 0, dag: true })).toEqual({ icoon: 'eigen/weer-zonnig', naam: 'zonnig' });
    expect(weerBeeld({ code: 0, dag: false })).toEqual({ icoon: 'eigen/weer-helder', naam: 'helder' });
    expect(weerBeeld({ code: 2, dag: false })).toEqual({ icoon: 'eigen/weer-half-bewolkt-nacht', naam: 'halfBewolkt' });
    expect(weerBeeld({ code: 61, dag: false })).toEqual({ icoon: 'eigen/weer-regen-licht', naam: 'lichteRegen' });
    expect(weerBeeld({ code: 42 })).toEqual({ icoon: 'eigen/weer-bewolkt', naam: 'bewolkt' });
    expect(weerBeeld(null)).toBe(null);
    expect(weerBeeld({})).toBe(null);
  });

  test('onweer volgt de weercodes van Open-Meteo: 95 onweer, 96 en 99 met hagel, 97 zwaar onweer; de wind verandert de naam niet', () => {
    expect(weerBeeld({ code: 95 })).toEqual({ icoon: 'eigen/weer-onweer', naam: 'onweer' });
    expect(weerBeeld({ code: 96 })).toEqual({ icoon: 'eigen/weer-onweer-hagel', naam: 'onweerHagel' });
    expect(weerBeeld({ code: 97 })).toEqual({ icoon: 'eigen/weer-onweer-zwaar', naam: 'zwaarOnweer' });
    expect(weerBeeld({ code: 99 })).toEqual({ icoon: 'eigen/weer-onweer-hagel-zwaar', naam: 'onweerZwareHagel' });
    expect(TEKSTEN.weer.zwaarOnweer).toBe('Zwaar onweer');
    expect(TEKSTEN.weer.onweerZwareHagel).toBe('Onweer met zware hagel');
    // Waar Open-Meteo zwaar meldt, zegt de naam dat ook.
    expect(weerBeeld({ code: 85 }).naam).toBe('sneeuwbuien');
    expect(weerBeeld({ code: 86 }).naam).toBe('zwareSneeuwbuien');
    for (const [code, naam] of [[65, 'zwareRegen'], [75, 'zwareSneeuw'], [82, 'zwareBuien'], [86, 'zwareSneeuwbuien'], [97, 'zwaarOnweer'], [99, 'onweerZwareHagel']]) expect(TEKSTEN.weer[weerBeeld({ code }).naam], String(code)).toMatch(/[Zz]wa(ar|re)/);
    // Geen eigen regels: storm (veel wind) geeft geen andere naam, de weercode beslist.
    expect(weerBeeld({ code: 3, wind: 90 })).toEqual({ icoon: 'eigen/weer-bewolkt', naam: 'bewolkt' });
  });
});

describe('de demo', () => {
  test('voorbeeldweer voor elke dag van het jaar, met alles wat de kaart toont en een week erbij', () => {
    for (let d = new Date(2026, 0, 1, 12); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      const sleutel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const weer = voorbeeldWeer(sleutel);
      expect(weerBeeld(weer), sleutel).not.toBe(null);
      for (const veld of ['temp', 'gevoel', 'vocht', 'wind', 'richting', 'min', 'max', 'kans', 'mm', 'uv']) expect(Number.isFinite(weer[veld]), sleutel + ' ' + veld).toBe(true);
      expect(weer.min, sleutel).toBeLessThanOrEqual(weer.max);
      expect(weer.zonOp, sleutel).toMatch(/^\d\d:\d\d$/);
      expect(weer.zonOnder, sleutel).toMatch(/^\d\d:\d\d$/);
      expect(weer.dagen, sleutel).toHaveLength(8); // vandaag en de zeven dagen erna (0.6.4)
      expect(weer.dagen[0].datum, sleutel).toBe(sleutel);
    }
    // Vast per dag: twee bezoekers zien hetzelfde.
    expect(voorbeeldWeer('2026-11-25')).toEqual(voorbeeldWeer('2026-11-25'));
  });
});

describe('zonder plek van het toestel', () => {
  test('de noodplek is de hoofdstad van de tijdzone; een onbekende tijdzone geeft Brussel', () => {
    expect(STANDAARDPLEK).toEqual([50.85, 4.35]);
    expect(plekVanTijdzone('Europe/Brussels')).toEqual([50.85, 4.35]);
    expect(plekVanTijdzone('Europe/Amsterdam')).toEqual([52.37, 4.9]);
    expect(plekVanTijdzone('Pacific/Auckland')).toEqual(STANDAARDPLEK);
    expect(plekVanTijdzone(undefined)).toEqual(STANDAARDPLEK);
    for (const tijdzone of ['Europe/Brussels', 'Europe/Amsterdam', 'Europe/Luxembourg', 'Europe/Paris', 'Europe/Berlin', 'Europe/London']) expect(weerAdres(...plekVanTijdzone(tijdzone)), tijdzone).not.toBe(null);
  });

  test('de laatste plek wordt afgerond bewaard: twee cijfers na de komma, ongeveer een kilometer', () => {
    expect(rondePlek(51.16234567891234, 5.18345678912345)).toEqual([51.16, 5.18]);
    expect(rondePlek(-0.1278, 51.5074)).toEqual([-0.13, 51.51]);
    expect(rondePlek(NaN, 5)).toBe(null);
    expect(rondePlek(91, 5)).toBe(null);
    expect(rondePlek('51', 5)).toBe(null);
  });
});

describe('wat het weerbericht bewaart en waarmee het verbindt', () => {
  const bron = readFileSync(new URL('../../src/data/weer.js', import.meta.url), 'utf8');
  const kaart = readFileSync(new URL('../../src/ui/weerkaart.js', import.meta.url), 'utf8');

  test('nooit in de database (dus nooit in een reservekopie of een verslag): alleen één sleutel in de opslag van de browser', () => {
    expect(bron).not.toMatch(/from '\.\/db\.js'|sessionStorage|indexedDB/);
    expect(bron).toMatch(/const SLEUTEL = OPSLAG_VOORVOEGSEL \+ 'weer';/);
    expect(bron.match(/localStorage\?\.(getItem|setItem)\(SLEUTEL/g)).toHaveLength(2);
    // De plek die bewaard wordt, is altijd de afgeronde.
    expect(bron).toMatch(/plek: bruikbaar \? rondePlek\(breedte, lengte\) : undefined/);
  });

  test('altijd de fijne locatie van nu, nooit een plek van daarnet', () => {
    expect(bron).toMatch(/enableHighAccuracy: true, maximumAge: 0/);
  });

  test('één vraag naar één dienst: geen ander adres in data/weer.js, zonder cookies en zonder verwijzer', () => {
    expect(bron).not.toMatch(/https?:\/\//);
    expect(bron).toMatch(/weerAdres\(/);
    expect(bron).toMatch(/credentials: 'omit'/);
    expect(bron).toMatch(/referrerPolicy: 'no-referrer'/);
  });

  test('op de kaart staat nooit een zin dat het niet lukt, en geen knop: die teksten en die standen bestaan niet meer', () => {
    for (const weg of ['ruw', 'geweigerd', 'geenLocatie', 'offline', 'fout', 'opnieuw', 'regio', 'om', 'zon', 'zonTot', 'voeltKort']) expect(TEKSTEN.weer[weg], weg).toBeUndefined();
    for (const blijft of ['laden', 'zonOp', 'zonOnder', 'vocht', 'labelVocht', 'neerslag', 'snelheid', 'kmu', 'voorbeeld']) expect(typeof TEKSTEN.weer[blijft], blijft).toBe('string');
    expect(bron).not.toMatch(/fase: '(ruw|geweigerd|geenLocatie|offline|fout)'/);
    // Antwoordt de dienst niet, dan komt het bewaarde weerbericht voor dit uur, en probeert Bloei het snel opnieuw.
    expect(bron).toMatch(/weerVoorNu\(b\.weer, new Date\(\)\)/);
    expect(bron).toMatch(/const OPNIEUW_MS = \[3, 6, 12, 24, 60\]/);
    expect(kaart).not.toMatch(/knop\(|role: 'status'|weerkaart__melding/);
    // 'laden' is er alleen voor een schermlezer.
    expect(kaart).toMatch(/class: 'alleen-lezer' \}, t\('weer\.laden'\)/);
  });
});

// De weersoort voor de warme zin van de motivator (logica/motivatie.js): het opvallendste eerst.
describe('weerSoort', () => {
  const w = (extra) => ({ code: 3, temp: 12, wind: 10, dag: true, ...extra });
  test('het opvallendste weer wint: onweer en sneeuw, dan hitte en vorst, dan regen, mist en wind', () => {
    expect(weerSoort(w({ code: 95, temp: 30 }))).toBe('weerOnweer');
    expect(weerSoort(w({ code: 73, temp: -3 }))).toBe('weerSneeuw');
    expect(weerSoort(w({ code: 0, temp: 27 }))).toBe('weerHeet');
    expect(weerSoort(w({ code: 61, temp: 0 }))).toBe('weerVorst');
    expect(weerSoort(w({ code: 61, wind: 55 }))).toBe('weerRegen');
    expect(weerSoort(w({ code: 45, wind: 55 }))).toBe('weerMist');
    expect(weerSoort(w({ code: 0, wind: 40 }))).toBe('weerZon'); // de wind verandert de zin niet: alleen de weercode en de temperatuur tellen
  });
  test('daarna zon, kou of een grijze lucht; een zachte nacht zonder regen geeft niets', () => {
    expect(weerSoort(w({ code: 0, temp: 3 }))).toBe('weerZon');
    expect(weerSoort(w({ code: 1 }))).toBe('weerZon');
    expect(weerSoort(w({ code: 3, temp: 7 }))).toBe('weerKoud');
    expect(weerSoort(w({ code: 2 }))).toBe('weerGrijs');
    expect(weerSoort(w({ code: 0, dag: false }))).toBeNull();
    expect(weerSoort(w({ code: 3, dag: false }))).toBeNull();
    expect(weerSoort(w({ code: 0, temp: 5, dag: false }))).toBe('weerKoud');
    expect(weerSoort(w({ code: 61, dag: false }))).toBe('weerRegen');
  });
  test('zonder bruikbaar weer: niets', () => {
    for (const fout of [null, undefined, {}, { code: 3 }, { temp: 12 }, { code: NaN, temp: 12 }]) expect(weerSoort(fout)).toBeNull();
    expect(weerSoort({ code: 3, temp: 12 })).toBe('weerGrijs'); // zonder wind en zonder dag: overdag en windstil
  });
  test('elke uitkomst is een bekende weergroep, ook voor het voorbeeldweer van de demo en het weer uit een antwoord', () => {
    expect(new Set(WEERGROEPEN).size).toBe(15);
    expect(WEERGROEPEN.length).toBe(15);
    for (let code = 0; code <= 99; code++) for (const temp of [-5, 5, 15, 30]) for (const dag of [true, false]) {
      const soort = weerSoort({ code, temp, wind: 5, dag });
      if (soort !== null) expect(WEERGROEPEN, `${code} ${temp}`).toContain(soort);
    }
    const demo = weerSoort(voorbeeldWeer('2026-07-14'));
    expect(demo === null || WEERGROEPEN.includes(demo)).toBe(true);
  });
  test('een warme dag (vanaf 25 graden) en een hete dag (vanaf 27 graden) zijn twee groepen; regen gaat voor op een warme dag', () => {
    expect(weerSoort(w({ code: 0, temp: 25 }))).toBe('weerWarm');
    expect(weerSoort(w({ code: 3, temp: 26, dag: false }))).toBe('weerWarm');
    expect(weerSoort(w({ code: 0, temp: 24 }))).toBe('weerZon');
    expect(weerSoort(w({ code: 61, temp: 26 }))).toBe('weerRegen');
    expect(weerSoort(w({ code: 0, temp: 26, wind: 45 }))).toBe('weerWarm');
    expect(weerSoort(w({ code: 61, temp: 28 }))).toBe('weerHeet');
  });
  test('zwaar weer gaat voor alles, en alleen zoals Open-Meteo het meldt (de weercode): zwaar onweer, zware sneeuw, ijzel en zware regen', () => {
    // Geen eigen grenzen: veel wind, veel millimeters of veel centimeters veranderen de groep niet.
    expect(weerSoort(w({ code: 95, wind: 90 }))).toBe('weerOnweer');
    expect(weerSoort(w({ code: 3, wind: 90 }))).toBe('weerGrijs');
    expect(weerSoort(w({ code: 97 }))).toBe('weerZwaarOnweer'); // zwaar onweer, zoals Open-Meteo het meldt
    expect(weerSoort(w({ code: 99, temp: 30 }))).toBe('weerZwaarOnweer'); // onweer met zware hagel
    expect(weerSoort(w({ code: 96 }))).toBe('weerOnweer'); // onweer met lichte hagel is geen zwaar onweer
    expect(weerSoort(w({ code: 95 }))).toBe('weerOnweer');
    expect(weerSoort(w({ code: 75, temp: -2 }))).toBe('weerSneeuwval');
    expect(weerSoort(w({ code: 86, temp: 0 }))).toBe('weerSneeuwval');
    expect(weerSoort(w({ code: 71, temp: -1, sneeuw: 30 }))).toBe('weerSneeuw'); // lichte sneeuw blijft lichte sneeuw, hoeveel er ook valt
    expect(weerSoort(w({ code: 85, temp: -1 }))).toBe('weerSneeuw');
    expect(weerSoort(w({ code: 3, temp: -1, sneeuw: 12 }))).toBe('weerVorst'); // het sneeuwt nu niet
    for (const code of [56, 57, 66, 67]) expect(weerSoort(w({ code, temp: -1 })), code).toBe('weerIjzel');
    expect(weerSoort(w({ code: 65 }))).toBe('weerStortregen');
    expect(weerSoort(w({ code: 82 }))).toBe('weerStortregen');
    expect(weerSoort(w({ code: 61, mm: 60 }))).toBe('weerRegen'); // lichte regen blijft regen, hoeveel er ook valt
    expect(weerSoort(w({ code: 81, mm: 60 }))).toBe('weerRegen');
    expect(weerSoort(w({ code: 3, mm: 40 }))).toBe('weerGrijs'); // het regent nu niet
    expect(WEER_EXTREEM).toHaveLength(5);
    expect(WEERGROEPEN).not.toContain('weerStorm');
    expect(WEERGROEPEN).not.toContain('weerWind');
  });
  test('een hittegolf: vijf dagen vanaf vandaag minstens 25 graden, waarvan drie minstens 30', () => {
    const dagen = (...max) => max.map((m) => ({ max: m }));
    expect(isHittegolf({ dagen: dagen(30, 31, 32, 26, 25) })).toBe(true);
    expect(isHittegolf({ dagen: dagen(25, 30, 30, 30, 25, 12) })).toBe(true);
    expect(isHittegolf({ dagen: dagen(30, 31, 29, 26, 25) })).toBe(false); // maar twee dagen van 30
    expect(isHittegolf({ dagen: dagen(30, 31, 32, 24, 25) })).toBe(false); // een dag onder 25
    expect(isHittegolf({ dagen: dagen(30, 31, 32, 33) })).toBe(false); // geen vijf dagen bekend
    for (const fout of [null, undefined, {}, { dagen: null }, { dagen: [{}, {}, {}, {}, {}] }]) expect(isHittegolf(fout)).toBe(false);
    const golf = dagen(31, 32, 33, 30, 27);
    expect(weerSoort(w({ code: 0, temp: 21, dagen: golf }))).toBe('weerHittegolf'); // ook 's ochtends, als het nog niet heet is
    expect(weerSoort(w({ code: 0, temp: 33, dag: false, dagen: golf }))).toBe('weerHittegolf');
    expect(weerSoort(w({ code: 95, temp: 30, dagen: golf }))).toBe('weerOnweer'); // wat er nu gebeurt, gaat voor
    expect(weerSoort(w({ code: 0, temp: 29, dagen: dagen(29, 28, 24, 22, 21) }))).toBe('weerHeet');
  });
});

describe('storm en vorst (0.7.3)', () => {
  test('storm vanaf windstoten van 80 km/u en vorst vanaf -5 graden, alleen bij droog weer', () => {
    expect(weerBeeld({ code: 3, stoot: 79 })).toEqual({ icoon: 'eigen/weer-bewolkt', naam: 'bewolkt' });
    expect(weerBeeld({ code: 3, stoot: 80 })).toEqual({ icoon: 'eigen/weer-storm', naam: 'storm' });
    expect(weerBeeld({ code: 63, stoot: 110 })).toEqual({ icoon: 'eigen/weer-regen', naam: 'regen' }); // neerslag gaat voor
    expect(weerBeeld({ code: 0, temp: -4 })).toEqual({ icoon: 'eigen/weer-zonnig', naam: 'zonnig' });
    expect(weerBeeld({ code: 0, temp: -5 })).toEqual({ icoon: 'eigen/weer-vorst', naam: 'vorst' });
    expect(weerBeeld({ code: 45, temp: -8 })).toEqual({ icoon: 'eigen/weer-mist', naam: 'mist' }); // mist blijft mist
    expect(logica.STORM_KMU).toBe(80);
    expect(logica.VORST_GRADEN).toBe(-5);
  });

  test('storm en vorst hebben een naam en een icoon', () => {
    expect(TEKSTEN.weer.storm).toBe('Storm');
    expect(TEKSTEN.weer.vorst).toBe('Vorst');
    expect(existsSync(new URL('../../src/iconen/eigen/weer-storm.svg', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../../src/iconen/eigen/weer-vorst.svg', import.meta.url))).toBe(true);
  });
});

describe('elk weerbeeld zijn eigen icoon (0.7.5)', () => {
  const CODES = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99];
  const beelden = [
    ...CODES.flatMap((code) => [weerBeeld({ code, dag: true }), weerBeeld({ code, dag: false })]),
    weerBeeld({ code: 3, stoot: 90 }),
    weerBeeld({ code: 0, temp: -8 }),
  ];

  test('geen twee weerbeelden delen een icoon, overdag en ’s nachts samen', () => {
    const naamBijIcoon = new Map();
    for (const { icoon, naam } of beelden) {
      // Half bewolkt heeft overdag de zon en 's nachts de maan achter de wolk, en zo ook de buien: dezelfde naam, twee iconen mag.
      if (naamBijIcoon.has(icoon)) expect(naamBijIcoon.get(icoon), icoon).toBe(naam);
      naamBijIcoon.set(icoon, naam);
    }
    for (const naam of WEERNAMEN) expect([...naamBijIcoon.values()], naam).toContain(naam);
  });

  test('de thermometer van de kop en de driehoek van de waarschuwing zijn nooit een weerbeeld', () => {
    for (const { icoon } of beelden) expect(['temperature-half', 'triangle-exclamation', 'temperature-low']).not.toContain(icoon);
  });

  test('licht, gewoon en zwaar hebben elk hun icoon, ook bij sneeuw, buien en onweer met hagel', () => {
    const icoon = (code) => weerBeeld({ code }).icoon;
    expect(new Set([51, 61, 63, 65].map(icoon)).size).toBe(4); // motregen, lichte regen, regen, zware regen
    expect(new Set([80, 81, 82].map(icoon)).size).toBe(3);
    expect(new Set([71, 73, 75].map(icoon)).size).toBe(3);
    expect(new Set([85, 86].map(icoon)).size).toBe(2);
    expect(new Set([95, 96, 97, 99].map(icoon)).size).toBe(4);
  });
});
