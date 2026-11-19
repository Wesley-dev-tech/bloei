// BESLISSING 437: "Je week in cijfers" op Drinken gaat over de lopende week (maandag tot zondag) en telt altijd "van 7 dagen".
import { describe, expect, test } from 'vitest';
import { drinkWeekCijfers, gemiddeldPerDag, WEEKDAGEN } from '../../src/logica/drinken-week.js';
import { t } from '../../src/teksten.js';
import { weekDagen } from '../../src/kern/datum.js';

const week = (mls) => weekDagen('2026-11-16').map((datum, i) => ({ datum, ml: mls[i] ?? 0 }));

describe('drinkWeekCijfers', () => {
  test('maandag zonder dranken: geen gemiddelde, 0 gehaald, altijd van 7', () => {
    const c = drinkWeekCijfers({ dagen: week([]), doel: 2000, nu: '2026-11-16' });
    expect(c).toMatchObject({ gemiddelde: null, gehaald: 0, van: 7, beste: null });
  });

  test('maandag met één gehaalde dag: 1 van 7, gemiddelde van die ene dag', () => {
    const c = drinkWeekCijfers({ dagen: week([2100]), doel: 2000, nu: '2026-11-16' });
    expect(c.gehaald).toBe(1);
    expect(c.van).toBe(WEEKDAGEN);
    expect(c.gemiddelde).toBe(2100);
    expect(c.besteIndex).toBe(0);
  });

  test('woensdag: telt maandag tot woensdag, niet de toekomst', () => {
    const c = drinkWeekCijfers({ dagen: week([1000, 2000, 3000, 5000, 5000, 5000, 5000]), doel: 2000, nu: '2026-11-18' });
    expect(c.gehaald).toBe(2);
    expect(c.gemiddelde).toBe(2000);
    expect(c.beste.ml).toBe(3000);
    expect(c.besteIndex).toBe(2);
  });

  test('zondag: de hele week telt, nog steeds van 7; een lege dag telt als 0 in het gemiddelde (BESLISSING 449)', () => {
    const c = drinkWeekCijfers({ dagen: week([2000, 0, 2000, 2000, 2000, 2000, 2000]), doel: 2000, nu: '2026-11-22' });
    expect(c.gehaald).toBe(6);
    expect(c.van).toBe(7);
    expect(c.gemiddelde).toBe(12000 / 7);
  });

  test('zonder dagdoel is er niets gehaald', () => {
    expect(drinkWeekCijfers({ dagen: week([500]), doel: 0, nu: '2026-11-16' }).gehaald).toBe(0);
  });
});

// BESLISSING 449: "Gemiddeld per dag" rekent over alle dagen van de week die voorbij zijn (vandaag inbegrepen); een dag zonder invoer telt als 0.
describe('gemiddeld per dag (BESLISSING 449)', () => {
  test('lopende week op woensdag: delen door 3 verstreken dagen, ook als dinsdag leeg is; de toekomst telt niet mee', () => {
    const dagen = week([1500, 0, 3000, 4000, 4000, 0, 0]);
    expect(gemiddeldPerDag(dagen, '2026-11-18')).toBe(1500);
    expect(drinkWeekCijfers({ dagen, doel: 2000, nu: '2026-11-18' }).gemiddelde).toBe(1500);
  });

  test('maandag: alleen maandag telt (delen door 1)', () => {
    expect(gemiddeldPerDag(week([2100, 5000]), '2026-11-16')).toBe(2100);
  });

  test('een eerdere week: altijd delen door 7', () => {
    expect(gemiddeldPerDag(week([2600, 1000, 0, 0, 0, 0, 2600]), '2026-11-25')).toBe(6200 / 7);
    expect(drinkWeekCijfers({ dagen: week([2600, 1000, 0, 0, 0, 0, 2600]), doel: 2500, nu: '2026-12-01' }).gemiddelde).toBe(6200 / 7);
  });

  test('een week zonder drank (of nog niet begonnen): geen gemiddelde, het scherm toont het streepje', () => {
    expect(gemiddeldPerDag(week([]), '2026-11-22')).toBeNull();
    expect(gemiddeldPerDag(week([0, 0, 0, 2000]), '2026-11-17')).toBeNull(); // donderdag is toekomst
    expect(gemiddeldPerDag(week([2000]), '2026-11-15')).toBeNull(); // de week is nog niet begonnen
  });
});

describe('teksten van de kaart', () => {
  test('rechtsboven staat "deze week" en het dagdoel is altijd "van 7 dagen" (meervoud)', () => {
    expect(t('drinken.gemiddeldSub')).toBe('deze week');
    expect(t('drinken.gehaaldVan', { aantal: WEEKDAGEN })).toBe('van 7 dagen');
  });
});

import { weekAanduiding, weekPeriodeTekst, stapWeek, reeksVanaf, veegRichting } from '../../src/logica/drinken-week.js';

describe('terugbladeren (BESLISSING 438)', () => {
  test('aanduiding: deze, vorige of een periode', () => {
    expect(weekAanduiding('2026-11-16', '2026-11-18').soort).toBe('deze');
    expect(weekAanduiding('2026-11-09', '2026-11-18').soort).toBe('vorige');
    expect(weekAanduiding('2026-11-02', '2026-11-18')).toEqual({ soort: 'week', periode: '2 - 8 november' });
    expect(weekPeriodeTekst('2026-11-30')).toBe('30 november - 6 december');
  });
  test('stap: terug kan altijd, vooruit nooit voorbij de lopende week', () => {
    expect(stapWeek('2026-11-16', -1, '2026-11-18')).toBe('2026-11-09');
    expect(stapWeek('2026-11-16', 1, '2026-11-18')).toBe('2026-11-16');
    expect(stapWeek('2026-11-09', 1, '2026-11-18')).toBe('2026-11-16');
  });
  test('reeks aan het einde van een voorbije week, en een lopende dag die nog open is', () => {
    const gehaald = new Set(['2026-11-13', '2026-11-14', '2026-11-15']);
    const haalt = (d) => gehaald.has(d);
    expect(reeksVanaf({ haalt, vanaf: '2026-11-15', dagNogOpen: false })).toBe(3);
    expect(reeksVanaf({ haalt, vanaf: '2026-11-16', dagNogOpen: true })).toBe(3);
    expect(reeksVanaf({ haalt, vanaf: '2026-11-16', dagNogOpen: false })).toBe(0);
  });
  test('veeg: alleen duidelijk horizontaal (> 48 px, hoek < 30 graden)', () => {
    expect(veegRichting(-80, 10)).toBe(1);
    expect(veegRichting(80, -10)).toBe(-1);
    expect(veegRichting(-40, 0)).toBe(0);
    expect(veegRichting(-80, 60)).toBe(0);
    expect(veegRichting(5, 120)).toBe(0);
  });
});

// BESLISSING 489: de bladerkop van het Dagboek met het jaar; volle vorm op tablet en desktop, korte vorm op een telefoon, voluit voor een schermlezer.
import { datumKortDag, datumVoluit, weekVoluit } from '../../src/kern/datum.js';
describe('datumkoppen van het Dagboek met het jaar (BESLISSING 489)', () => {
  test('week: vol, kort en voluit, ook over een maand- en een jaargrens', () => {
    const gevallen = [
      ['2026-11-16', '16 - 22 november 2026', '16 - 22 nov 2026', 'Week van 16 tot 22 november 2026'],
      ['2026-09-28', '28 september - 4 oktober 2026', '28 sep - 4 okt 2026', 'Week van 28 september tot 4 oktober 2026'],
      ['2026-12-28', '28 december 2026 - 3 januari 2027', '28 dec 2026 - 3 jan 2027', 'Week van 28 december 2026 tot 3 januari 2027'],
    ];
    for (const [start, vol, kort, voluit] of gevallen) {
      expect(weekPeriodeTekst(start, { jaar: true })).toBe(vol);
      expect(weekPeriodeTekst(start, { jaar: true, kort: true })).toBe(kort);
      expect(weekVoluit(start)).toBe(voluit);
      expect(weekVoluit(plusDagenTest(start, 3))).toBe(voluit); // elke dag van de week geeft dezelfde week
    }
  });
  test('dag: voluit en kort (dag afgekort, maand voluit, altijd met het jaar)', () => {
    expect(datumVoluit('2026-11-16')).toBe('maandag 16 november 2026');
    expect(datumKortDag('2026-11-16')).toBe('ma 16 november 2026');
    expect(datumKortDag('2026-09-24')).toBe('do 24 september 2026');
    expect(datumKortDag('2027-01-03')).toBe('zo 3 januari 2027');
  });
});
function plusDagenTest(sleutel, n) {
  const [j, m, d] = sleutel.split('-').map(Number);
  const x = new Date(j, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
