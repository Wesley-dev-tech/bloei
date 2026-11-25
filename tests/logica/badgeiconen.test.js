// Elke medaille haar eigen icoon (logica/badgeiconen.js): geen twee medailles delen een icoon, elke medaille heeft er een, en elk icoon
// bestaat als bestand in src/iconen/solid.
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BADGE_ICOON } from '../../src/logica/badgeiconen.js';
import { ALLE_BADGES } from '../../src/logica/badgeregels.js';

const ICONEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/iconen/solid');

describe('de iconen van de medailles', () => {
  test('elke medaille heeft een icoon, en er staat geen icoon voor een medaille die niet bestaat', () => {
    const ids = ALLE_BADGES.map((b) => b.id).sort();
    expect(Object.keys(BADGE_ICOON).sort()).toEqual(ids);
  });
  test('geen twee medailles hebben hetzelfde icoon', () => {
    const per = {};
    for (const [id, [, icoon]] of Object.entries(BADGE_ICOON)) (per[icoon] ??= []).push(id);
    expect(Object.values(per).filter((lijst) => lijst.length > 1)).toEqual([]);
  });
  test('elk icoon bestaat als bestand', () => {
    const zonder = Object.values(BADGE_ICOON).map(([, icoon]) => icoon).filter((icoon) => !fs.existsSync(path.join(ICONEN, icoon + '.svg')));
    expect(zonder).toEqual([]);
  });
  test('elke medaille heeft een soort die een kleur heeft', () => {
    const soorten = new Set(['reeks', 'drinken', 'supplementen', 'stemming', 'notities', 'eten', 'gewicht', 'dag', 'delen', 'ultiem']);
    expect(Object.entries(BADGE_ICOON).filter(([, [soort]]) => soort === 'ultiem').map(([id]) => id)).toEqual(['verzameling-compleet']);
    expect(Object.values(BADGE_ICOON).filter(([soort]) => !soorten.has(soort))).toEqual([]);
  });
});
