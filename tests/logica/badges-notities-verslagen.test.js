// De medailles voor notities en verslagen van 0.5.8: de tellers uit ruwe gegevens (pure functies), de regels net niet en net wel, en de datum
// waarop een medaille van een notitie echt verdiend werd.
import { describe, expect, test } from 'vitest';
import { ALLE_BADGES, DOEL, GROEP_VOLGORDE, LANGE_NOTITIE, inGroepVolgorde, dagenInPeriode, isLangeNotitie, telVerslag, telWoorden, verdiendAlle, verslagTellers, voortgangVan } from '../../src/logica/badgeregels.js';
import { eersteDatums } from '../../src/logica/badgehistorie.js';
import { BADGE_ICOON } from '../../src/logica/badgeiconen.js';
import { TEKSTEN } from '../../src/teksten.js';

const NOTITIES = ['eerste-notitie', 'tien-notities', 'tweehonderd-notities', 'drie-notities-op-rij', 'week-notities-op-rij', 'maand-notities-op-rij', 'lange-notitie'];
const VERSLAGEN = ['twintig-verslagen', 'verslag-verstuurd', 'verslag-bewaard', 'volledig-verslag', 'weekverslag', 'maandverslag', 'maand-na-maand'];
const heeft = (id, stats) => verdiendAlle(stats).includes(id);
const ALLES = { eten: true, drinken: true, gewicht: true, notities: true };

describe('de nieuwe medailles bestaan, met naam, uitleg, icoon en twee zinnen', () => {
  test('veertien nieuwe medailles in de groepen Notities en Bewaren en delen', () => {
    for (const id of NOTITIES) expect(ALLE_BADGES.find((b) => b.id === id)?.groep, id).toBe('notities');
    for (const id of VERSLAGEN) expect(ALLE_BADGES.find((b) => b.id === id)?.groep, id).toBe('delen');
    expect(ALLE_BADGES.filter((b) => b.groep === 'notities')).toHaveLength(11);
    expect(ALLE_BADGES.filter((b) => b.groep === 'delen')).toHaveLength(10);
    for (const id of [...NOTITIES, ...VERSLAGEN]) {
      expect(TEKSTEN.badge.namen[id], id).toBeTruthy();
      expect(TEKSTEN.badge.voorwaarden[id], id).toMatch(/\.$/);
      expect(BADGE_ICOON[id], id).toBeTruthy();
      expect(Object.keys(TEKSTEN.motivatie['m-' + id] ?? {}), id).toHaveLength(2);
      const [, doel, eenheid] = DOEL[id];
      expect(TEKSTEN.badge[doel === 1 ? 'voortgangEen' : 'voortgang'][eenheid], id + ': tekst van de voortgang').toBeTruthy();
    }
  });
  test('op het badgescherm staan beide groepen van klein naar groot, en elke medaille van de groep staat in de volgorde', () => {
    for (const groep of ['notities', 'delen']) {
      const leden = ALLE_BADGES.filter((b) => b.groep === groep);
      expect(inGroepVolgorde(groep, leden).map((b) => b.id)).toEqual(GROEP_VOLGORDE[groep]);
    }
    expect(GROEP_VOLGORDE.notities.slice(0, 3)).toEqual(['eerste-notitie', 'kanttekening', 'tien-notities']);
    const andere = ALLE_BADGES.filter((b) => b.groep === 'eten');
    expect(inGroepVolgorde('eten', andere)).toBe(andere); // de andere groepen blijven zoals ze waren
  });
  test('de ultieme medaille vraagt alle andere', () => {
    expect(DOEL['verzameling-compleet'][1]).toBe(ALLE_BADGES.length - 1);
  });
});

describe('notities: woorden tellen en dagen na elkaar', () => {
  test('telWoorden telt woorden, hoe ze ook gescheiden zijn', () => {
    expect(telWoorden('')).toBe(0);
    expect(telWoorden(null)).toBe(0);
    expect(telWoorden('  een   twee\ndrie\t vier ')).toBe(4);
  });
  test('een lange notitie telt minstens vijftig woorden: net niet en net wel', () => {
    expect(LANGE_NOTITIE).toBe(50);
    expect(isLangeNotitie(Array(49).fill('woord').join(' '))).toBe(false);
    expect(isLangeNotitie(Array(50).fill('woord').join(' '))).toBe(true);
  });
  test('de regels: net niet en net wel', () => {
    for (const [id, teller, drempel] of [['eerste-notitie', 'notitieDagen', 1], ['tien-notities', 'notitieDagen', 10], ['tweehonderd-notities', 'notitieDagen', 200], ['drie-notities-op-rij', 'langsteNotitieReeks', 3], ['week-notities-op-rij', 'langsteNotitieReeks', 7], ['maand-notities-op-rij', 'langsteNotitieReeks', 30], ['lange-notitie', 'langeNotities', 1]]) {
      expect(heeft(id, { [teller]: drempel - 1 }), id + ' net niet').toBe(false);
      expect(heeft(id, { [teller]: drempel }), id + ' net wel').toBe(true);
      expect(voortgangVan(id, { [teller]: drempel - 1 })?.fractie, id).toBeCloseTo((drempel - 1) / drempel);
    }
  });
  test('de datum van een medaille is de dag waarop ze verdiend werd, niet de dag van de update', () => {
    const dag = (n, extra = {}) => ({ datum: '2026-03-' + String(n).padStart(2, '0'), bij: true, notitie: false, langeNotitie: false, ...extra });
    // 1 maart een notitie, 2 maart niets, 3 tot 5 maart drie dagen na elkaar een notitie (op de 4e een lange), 6 maart geen.
    const feiten = [dag(1, { notitie: true }), dag(2), dag(3, { notitie: true }), dag(4, { notitie: true, langeNotitie: true }), dag(5, { notitie: true }), dag(6)];
    const uit = eersteDatums(feiten, ['eerste-notitie', 'drie-notities-op-rij', 'lange-notitie', 'week-notities-op-rij', 'tien-notities']);
    expect(uit.get('eerste-notitie')).toBe('2026-03-01');
    expect(uit.get('lange-notitie')).toBe('2026-03-04');
    expect(uit.get('drie-notities-op-rij')).toBe('2026-03-05'); // de 1e telt niet mee: de 2e had geen notitie
    expect(uit.has('week-notities-op-rij')).toBe(false);
    expect(uit.has('tien-notities')).toBe(false);
  });
});

describe('verslagen: wat Bloei telt als er een verslag gemaakt is', () => {
  test('dagenInPeriode telt begin en einde mee, ook over een maandgrens en een schrikkeldag', () => {
    expect(dagenInPeriode('2026-11-26', '2026-11-26')).toBe(1);
    expect(dagenInPeriode('2026-11-20', '2026-11-26')).toBe(7);
    expect(dagenInPeriode('2028-02-25', '2028-03-02')).toBe(7);
    expect(dagenInPeriode('2026-11-26', '2026-11-20')).toBe(0);
    expect(dagenInPeriode('rommel', '2026-11-20')).toBe(0);
  });
  test('een eerste verslag: verstuurd, één dag, twee onderdelen', () => {
    const t = telVerslag(null, { van: '2026-11-26', tot: '2026-11-26', manier: 'versturen', onderdelen: { eten: true, drinken: true, gewicht: false, notities: false } }, '2026-11');
    expect(t).toEqual({ verstuurd: 1, bewaard: 0, volledig: 0, week: 0, maand: 0, maanden: ['2026-11'] });
  });
  test('bewaard, volledig, een week (7 dagen) en een maand (28 dagen): net niet en net wel', () => {
    const zes = telVerslag(null, { van: '2026-11-21', tot: '2026-11-26', manier: 'bewaren', onderdelen: ALLES }, '2026-11');
    expect(zes).toMatchObject({ verstuurd: 0, bewaard: 1, volledig: 1, week: 0, maand: 0 });
    const zeven = telVerslag(zes, { van: '2026-11-20', tot: '2026-11-26', manier: 'bewaren', onderdelen: ALLES }, '2026-11');
    expect(zeven).toMatchObject({ bewaard: 2, volledig: 2, week: 1, maand: 0 });
    const zevenentwintig = telVerslag(zeven, { van: '2026-10-31', tot: '2026-11-26', manier: 'versturen', onderdelen: ALLES }, '2026-11');
    expect(zevenentwintig).toMatchObject({ verstuurd: 1, week: 2, maand: 0 });
    const achtentwintig = telVerslag(zevenentwintig, { van: '2026-10-30', tot: '2026-11-26', manier: 'versturen', onderdelen: ALLES }, '2026-11');
    expect(achtentwintig).toMatchObject({ verstuurd: 2, week: 3, maand: 1, maanden: ['2026-11'] });
  });
  test('elke maand telt één keer, en rommel in de bewaarde telling doet niets stuk', () => {
    let t = { verstuurd: 'x', bewaard: -3, maanden: 'geen lijst' };
    for (const maand of ['2026-09', '2026-09', '2026-10', '2026-11', 'rommel']) t = telVerslag(t, { van: '2026-11-26', tot: '2026-11-26', manier: 'versturen', onderdelen: null }, maand);
    expect(t.maanden).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(t).toMatchObject({ verstuurd: 5, bewaard: 0, volledig: 0 });
    expect(verslagTellers(t)).toEqual({ verslagenVerstuurd: 5, verslagenBewaard: 0, verslagenVolledig: 0, verslagenWeek: 0, verslagenMaand: 0, verslagMaanden: 3 });
    expect(verslagTellers(null)).toEqual({ verslagenVerstuurd: 0, verslagenBewaard: 0, verslagenVolledig: 0, verslagenWeek: 0, verslagenMaand: 0, verslagMaanden: 0 });
  });
  test('de regels: net niet en net wel', () => {
    for (const [id, teller, drempel] of [['twintig-verslagen', 'verslagen', 20], ['verslag-verstuurd', 'verslagenVerstuurd', 1], ['verslag-bewaard', 'verslagenBewaard', 1], ['volledig-verslag', 'verslagenVolledig', 1], ['weekverslag', 'verslagenWeek', 1], ['maandverslag', 'verslagenMaand', 1], ['maand-na-maand', 'verslagMaanden', 3]]) {
      expect(heeft(id, { [teller]: drempel - 1 }), id + ' net niet').toBe(false);
      expect(heeft(id, { [teller]: drempel }), id + ' net wel').toBe(true);
    }
  });
});
