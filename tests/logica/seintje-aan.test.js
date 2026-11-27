// BESLISSING 754: de medaille Seintje aan behaal je met een tik op een herinnering, niet meer met alleen de schakelaar. Wie ze zo kreeg
// (tot 0.6.8), verliest ze eenmalig en stil tot die tik er is; een medaille van Je verzameling die daardoor onder haar drempel valt, ook.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { controleerBadges, leesBadges } from '../../src/data/badges.js';
import { zetInstelling } from '../../src/data/instellingen.js';
import { GETIKT, onthoudTik } from '../../src/meldingen/stand.js';
import { DOEL } from '../../src/logica/badgeregels.js';
import { TEKSTEN } from '../../src/teksten.js';

const VLAGGEN = ['badges.uitgebreid', 'badges.uitgebreid2', 'badges.uitgebreid3', 'badges.uitgebreid4'];
const ids = async () => (await leesBadges()).map((b) => b.id);

beforeEach(async () => {
  await db.delete();
  await openDb();
  for (const sleutel of VLAGGEN) await db.instellingen.put({ sleutel, waarde: true }); // geen stil toekennen
});

describe('Seintje aan (BESLISSING 754)', () => {
  test('de schakelaar alleen is niet genoeg', async () => {
    await zetInstelling('meldingen.drinken', [{ aan: true, uur: '11:00' }]);
    await controleerBadges();
    expect(await ids()).not.toContain('seintje-aan');
  });

  test('een tik op een herinnering geeft de medaille, en de eerste tik blijft onthouden', async () => {
    await onthoudTik(1000);
    await onthoudTik(2000);
    expect((await db.instellingen.get(GETIKT)).waarde).toBe(1000);
    await controleerBadges();
    expect(await ids()).toContain('seintje-aan');
  });

  test('wie de medaille had zonder tik, verliest ze eenmalig; na een tik komt ze terug', async () => {
    await db.badges.add({ id: 'seintje-aan', behaaldOp: 1, gezien: true });
    await controleerBadges();
    expect(await ids()).not.toContain('seintje-aan');
    expect((await db.instellingen.get('badges.seintjeHerzien'))?.waarde).toBe(true);
    await onthoudTik();
    await controleerBadges();
    expect(await ids()).toContain('seintje-aan');
  });

  test('wie al op een herinnering tikte, houdt de medaille', async () => {
    await onthoudTik();
    await db.badges.add({ id: 'seintje-aan', behaaldOp: 1, gezien: true });
    await controleerBadges();
    expect(await ids()).toContain('seintje-aan');
  });

  test('valt de verzameling onder de drempel, dan gaat ook Tien medailles terug', async () => {
    const andere = Object.keys(DOEL).filter((id) => id !== 'seintje-aan' && DOEL[id][0] !== 'medailles').slice(0, 9);
    for (const id of ['seintje-aan', ...andere, 'tien-medailles']) await db.badges.add({ id, behaaldOp: 1, gezien: true });
    await controleerBadges();
    const over = await ids();
    expect(over).not.toContain('seintje-aan');
    expect(over).not.toContain('tien-medailles');
  });

  test('het doel en de zin zeggen wat er nu telt', () => {
    expect(DOEL['seintje-aan']).toEqual(['meldingGetikt', 1, 'keer']);
    expect(TEKSTEN.badge.voorwaarden['seintje-aan']).toBe('Open Bloei met een tik op een herinnering.');
  });
});
