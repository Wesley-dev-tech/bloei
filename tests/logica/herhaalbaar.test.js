// De medailles van de feestdagen en van je verjaardag behaal je elk jaar opnieuw; alle andere één keer (logica/badgeregels.js).
import { describe, expect, test } from 'vitest';
import { ALLE_BADGES, DOEL, FEESTBADGES, HERHAALBAAR } from '../../src/logica/badgeregels.js';
import { feestdagOp } from '../../src/logica/kalender.js';
import { eersteDatums } from '../../src/logica/badgehistorie.js';
import { TEKSTEN } from '../../src/teksten.js';

describe('herhaalbare medailles', () => {
  test('elke feestdag van de kalender heeft een medaille, ook de niet-wettelijke', () => {
    const dagen = new Set();
    for (let d = new Date(Date.UTC(2027, 0, 1)); d.getUTCFullYear() === 2027; d.setUTCDate(d.getUTCDate() + 1)) {
      const feest = feestdagOp(d.toISOString().slice(0, 10));
      if (feest) dagen.add(feest);
    }
    expect([...dagen].sort()).toEqual(Object.keys(FEESTBADGES).sort());
    expect(dagen.size).toBe(18);
    const ids = ALLE_BADGES.map((b) => b.id);
    for (const [feest, id] of Object.entries(FEESTBADGES)) {
      expect(ids, id).toContain(id);
      expect(DOEL[id]).toEqual(['feest:' + feest, 1, 'keer']);
      expect(ALLE_BADGES.find((b) => b.id === id).groep).toBe('feestdagen');
    }
  });
  test('alleen de feestdagen en de twee medailles van de verjaardag zelf zijn herhaalbaar', () => {
    expect([...HERHAALBAAR].sort()).toEqual(['jarig', 'jarig-genoteerd', ...Object.values(FEESTBADGES)].sort());
    expect(HERHAALBAAR.has('geboortedatum')).toBe(false);
    for (const id of HERHAALBAAR) expect(TEKSTEN.badge.voorwaarden[id].endsWith('Elk jaar opnieuw.'), id).toBe(true);
    for (const b of ALLE_BADGES) if (!HERHAALBAAR.has(b.id)) expect(TEKSTEN.badge.voorwaarden[b.id].includes('opnieuw'), b.id).toBe(false);
  });
  test('wie al iets noteerde op een feestdag, krijgt die medaille met de datum van die dag', () => {
    const feiten = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-11', '2026-11-12'].map((datum) => ({ datum, bij: true }));
    const uit = eersteDatums(feiten, Object.values(FEESTBADGES));
    expect(Object.fromEntries(uit)).toEqual({ 'feest-halloween': '2026-10-31', 'feest-allerheiligen': '2026-11-01', 'feest-wapenstilstand': '2026-11-11' });
  });
});
