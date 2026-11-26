import { describe, expect, test } from 'vitest';
import { verloopCijfers, voortgangNaarStreef, weekKalender, wekenGewogen } from '../../src/logica/gewichtcijfers.js';
import { plusDagen, weekStart } from '../../src/kern/datum.js';

// Verzonnen gegevens. 2026-11-14 is een zaterdag; de maandag van die week is 2026-11-09.
const VANDAAG = '2026-11-14';
const weging = (datum, kg) => ({ week: weekStart(datum), datum, kg });

describe('verloopCijfers', () => {
  test('zonder wegingen is alles leeg', () => {
    const c = verloopCijfers([], VANDAAG);
    expect(c.aantal).toBe(0);
    expect(c.laatste).toBeNull();
    expect(c.sindsVorige).toBeNull();
    expect(c.sindsEerste).toBeNull();
    expect(c.laagste).toBeNull();
    expect(c.maand).toBeNull();
  });

  test('met één weging bestaat er geen verschil, wel laagste, hoogste en het maandgemiddelde', () => {
    const c = verloopCijfers([weging('2026-11-12', 70.4)], VANDAAG);
    expect(c.aantal).toBe(1);
    expect(c.sindsVorige).toBeNull();
    expect(c.sindsEerste).toBeNull();
    expect(c.laagste).toEqual({ kg: 70.4, datum: '2026-11-12' });
    expect(c.hoogste).toEqual({ kg: 70.4, datum: '2026-11-12' });
    expect(c.maand).toEqual({ gemiddelde: 70.4, aantal: 1 });
  });

  test('verschillen met het teken van de uitkomst, op één decimaal', () => {
    const lijst = [weging('2026-10-12', 72.0), weging('2026-10-26', 70.5), weging('2026-11-12', 71.3)];
    const c = verloopCijfers(lijst, VANDAAG);
    expect(c.sindsVorige).toBe(0.8);
    expect(c.sindsEerste).toBe(-0.7);
    expect(c.eerste.datum).toBe('2026-10-12');
    expect(c.vorige.datum).toBe('2026-10-26');
    expect(c.laagste).toEqual({ kg: 70.5, datum: '2026-10-26' });
    expect(c.hoogste).toEqual({ kg: 72.0, datum: '2026-10-12' });
  });

  test('geen drijvende-kommafout: 70,3 min 70,1 is 0,2', () => {
    expect(verloopCijfers([weging('2026-11-02', 70.1), weging('2026-11-12', 70.3)], VANDAAG).sindsVorige).toBe(0.2);
  });

  test('gelijke waarden geven geen verschil en bij gelijke laagste de meest recente', () => {
    const c = verloopCijfers([weging('2026-11-02', 69.0), weging('2026-11-12', 69.0)], VANDAAG);
    expect(c.sindsVorige).toBe(0);
    expect(c.laagste.datum).toBe('2026-11-12');
  });

  test('het maandgemiddelde telt alleen de wegingen van de lopende maand', () => {
    const lijst = [weging('2026-10-26', 80), weging('2026-11-02', 70.0), weging('2026-11-09', 71.0), weging('2026-11-12', 72.0)];
    // 2026-11-09 en 2026-11-12 zitten in dezelfde week: één weging per week, dus de latere vervangt de eerdere
    const eenPerWeek = [lijst[0], lijst[1], lijst[3]];
    const c = verloopCijfers(eenPerWeek, VANDAAG);
    expect(c.maand).toEqual({ gemiddelde: 71.0, aantal: 2 });
  });

  test('geen weging in de lopende maand: geen maandgemiddelde', () => {
    expect(verloopCijfers([weging('2026-10-12', 70), weging('2026-10-19', 71)], VANDAAG).maand).toBeNull();
  });

  test('de volgorde van de invoer maakt niet uit', () => {
    const a = weging('2026-10-12', 72);
    const b = weging('2026-11-12', 70);
    expect(verloopCijfers([b, a], VANDAAG)).toEqual(verloopCijfers([a, b], VANDAAG));
  });
});

describe('voortgangNaarStreef', () => {
  test('afvallen: halverwege', () => {
    const v = voortgangNaarStreef(80, 75, 70);
    expect(v.fractie).toBeCloseTo(0.5);
    expect(v.bereikt).toBe(false);
    expect(v.rest).toBe(5);
    expect(v.richting).toBe(-1);
  });

  test('bijkomen: de balk loopt ook van start naar streef', () => {
    const v = voortgangNaarStreef(50, 53, 56);
    expect(v.fractie).toBeCloseTo(0.5);
    expect(v.rest).toBe(3);
    expect(v.richting).toBe(1);
  });

  test('de rest rekent op één decimaal', () => {
    expect(voortgangNaarStreef(70, 68.3, 65.1).rest).toBe(3.2);
  });

  test('op het streefgewicht is ze er', () => {
    const v = voortgangNaarStreef(80, 70, 70);
    expect(v.bereikt).toBe(true);
    expect(v.fractie).toBe(1);
    expect(v.rest).toBe(0);
  });

  test('voorbij het streefgewicht is ze er ook, in beide richtingen', () => {
    expect(voortgangNaarStreef(80, 68, 70)).toMatchObject({ bereikt: true, fractie: 1, rest: 0 });
    expect(voortgangNaarStreef(50, 58, 56)).toMatchObject({ bereikt: true, fractie: 1, rest: 0 });
  });

  test('verder van het doel dan bij de start: de markering staat op het begin en alleen het verschil blijft', () => {
    expect(voortgangNaarStreef(80, 82, 70)).toMatchObject({ bereikt: false, fractie: 0, rest: 12 });
    expect(voortgangNaarStreef(50, 48, 56)).toMatchObject({ bereikt: false, fractie: 0, rest: 8 });
  });

  test('met één weging staat ze op de start', () => {
    expect(voortgangNaarStreef(72, 72, 65)).toMatchObject({ bereikt: false, fractie: 0, rest: 7 });
  });

  test('start gelijk aan streef: bereikt zolang ze er nog staat, anders het verschil', () => {
    expect(voortgangNaarStreef(70, 70, 70)).toMatchObject({ bereikt: true, fractie: 1 });
    expect(voortgangNaarStreef(70, 71.5, 70)).toMatchObject({ bereikt: false, fractie: 0, rest: 1.5 });
  });

  test('zonder streefgewicht of weging is er geen voortgang', () => {
    expect(voortgangNaarStreef(70, 70, null)).toBeNull();
    expect(voortgangNaarStreef(null, null, 65)).toBeNull();
  });
});

describe('weekKalender', () => {
  test('twaalf weken, oudste eerst, de lopende week laatst', () => {
    const weken = weekKalender([weging('2026-11-12', 70)], VANDAAG);
    expect(weken).toHaveLength(12);
    expect(weken.at(-1).week).toBe('2026-11-09');
    expect(weken.at(-1).isNu).toBe(true);
    expect(weken.filter((w) => w.isNu)).toHaveLength(1);
    expect(weken[0].week).toBe(plusDagen('2026-11-09', -77));
  });

  test('de datum is de maandag van die week, en een weging telt op elke dag van de week', () => {
    const weken = weekKalender([weging('2026-11-14', 70)], VANDAAG);
    expect(weken.at(-1).datum).toBe('2026-11-09');
    expect(weken.at(-2).datum).toBe('2026-11-02');
    expect(weken.at(-1).gevuld).toBe(true);
  });

  test('gevuld waar er een weging is; weken vóór de eerste weging zijn voorEerste', () => {
    const lijst = [weging('2026-10-15', 70), weging('2026-11-05', 70), weging('2026-11-12', 70)];
    const weken = weekKalender(lijst, VANDAAG);
    const gevuld = weken.filter((w) => w.gevuld).map((w) => w.week);
    expect(gevuld).toEqual(['2026-10-12', '2026-11-02', '2026-11-09']);
    const eerste = weken.findIndex((w) => w.gevuld);
    expect(weken.slice(0, eerste).every((w) => w.voorEerste)).toBe(true);
    expect(weken.slice(eerste).every((w) => !w.voorEerste)).toBe(true);
    expect(weken.find((w) => w.week === '2026-10-19').gevuld).toBe(false);
  });

  test('zonder wegingen is elke week voorEerste', () => {
    expect(weekKalender([], VANDAAG).every((w) => w.voorEerste && !w.gevuld)).toBe(true);
  });

  test('een maandlabel bij de eerste week en waar de maand wisselt', () => {
    const weken = weekKalender([], VANDAAG);
    expect(weken[0].maandLabel).not.toBeNull();
    const labels = weken.filter((w) => w.maandLabel).map((w) => w.maandLabel);
    // 12 weken tot 12 november 2026: de maandagen lopen van 24 augustus tot en met 9 november
    expect(labels).toEqual(['aug', 'sep', 'okt', 'nov']);
    for (let i = 1; i < weken.length; i++) expect(Boolean(weken[i].maandLabel)).toBe(weken[i].maand !== weken[i - 1].maand);
  });
});

describe('wekenGewogen', () => {
  test('telt alleen weken vanaf de eerste weging', () => {
    const lijst = [weging('2026-09-24', 70), weging('2026-10-08', 70), weging('2026-10-15', 70), weging('2026-11-05', 70), weging('2026-11-12', 70)];
    const weken = weekKalender(lijst, VANDAAG);
    // eerste weging in de week van 21 september: tot en met de lopende week zijn dat 8 weken, 5 gewogen
    expect(wekenGewogen(weken)).toEqual({ gewogen: 5, van: 8 });
  });

  test('de lopende week zonder weging is nog niet gemist', () => {
    const lijst = [weging('2026-11-02', 70)];
    expect(wekenGewogen(weekKalender(lijst, VANDAAG))).toEqual({ gewogen: 1, van: 1 });
  });

  test('twintig wekelijkse wegingen: twaalf van twaalf', () => {
    const lijst = Array.from({ length: 20 }, (_, i) => weging(plusDagen('2026-11-12', -7 * (19 - i)), 70));
    expect(wekenGewogen(weekKalender(lijst, VANDAAG))).toEqual({ gewogen: 12, van: 12 });
  });

  test('zonder wegingen valt er niets te tellen', () => {
    expect(wekenGewogen(weekKalender([], VANDAAG))).toEqual({ gewogen: 0, van: 0 });
  });
});
