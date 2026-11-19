// OWASP-scan punt 5 (A07): de teller van foute pogingen mag geen telling verliezen als twee tabbladen tegelijk een foute code
// proberen. telFout in slot.js leest en schrijft in één Dexie-transactie; hier lopen gelijktijdige foute pogingen door dezelfde weg.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, openDb } from '../../src/data/db.js';
import { leesInstelling, zetInstelling } from '../../src/data/instellingen.js';
import { maakHash } from '../../src/vergrendeling/pin.js';
import { controleerHuidigeCode } from '../../src/vergrendeling/slot.js';
import { luister } from '../../src/kern/bus.js';

beforeEach(async () => {
  await db.delete();
  await openDb();
  // Een code met weinig rondes, zodat de test snel is; de controle volgt het bewaarde aantal rondes.
  await zetInstelling('slot.pin', { ...(await maakHash('482915', 1000)), lengte: 6 });
});

describe('de teller van foute pogingen (OWASP-scan punt 5)', () => {
  it('vier gelijktijdige foute pogingen tellen alle vier, zonder wachttijd (onder de vijf vrije pogingen)', async () => {
    const uit = await Promise.all(['000000', '111111', '222222', '333333'].map((c) => controleerHuidigeCode(c)));
    expect(uit.every((u) => u.ok === false && u.wachtMs === 0)).toBe(true);
    expect(await leesInstelling('slot.fouten')).toBe(4);
    expect(await leesInstelling('slot.wachtTot')).toBe(0);
  });

  it('de vijfde fout, ook gelijktijdig met de vierde, zet de wachttijd van 30 seconden zoals voorheen', async () => {
    await zetInstelling('slot.fouten', 3);
    const uit = await Promise.all(['000000', '111111'].map((c) => controleerHuidigeCode(c)));
    expect(await leesInstelling('slot.fouten')).toBe(5);
    const wachten = uit.map((u) => u.wachtMs).sort((a, b) => a - b);
    expect(wachten[0]).toBe(0);
    expect(wachten[1]).toBeGreaterThan(29000);
    expect(wachten[1]).toBeLessThanOrEqual(30000);
    expect(await leesInstelling('slot.wachtTot')).toBeGreaterThan(Date.now());
  });

  it('acht gelijktijdige foute pogingen: de teller staat op acht en de wachttijden lopen op zoals voorheen (30 s, 1, 5 en 15 minuten)', async () => {
    const uit = await Promise.all(Array.from({ length: 8 }, (_, i) => controleerHuidigeCode(String(i).repeat(6))));
    expect(await leesInstelling('slot.fouten')).toBe(8);
    const seconden = uit.map((u) => Math.ceil(u.wachtMs / 1000)).sort((a, b) => a - b);
    expect(seconden).toEqual([0, 0, 0, 0, 30, 60, 300, 900]);
  });

  it('de meldingen instelling:gewijzigd gaan nog altijd weg, een keer per sleutel, met de waarden die in de database staan', async () => {
    const gezien = [];
    const stop = luister('instelling:gewijzigd', async ({ sleutel, waarde }) => {
      if (sleutel.startsWith('slot.')) gezien.push([sleutel, waarde, (await db.instellingen.get(sleutel))?.waarde]);
    });
    await controleerHuidigeCode('000000');
    await new Promise((klaar) => setTimeout(klaar, 20));
    stop?.();
    expect(gezien).toEqual([
      ['slot.fouten', 1, 1],
      ['slot.wachtTot', 0, 0],
    ]);
  });

  it('een juiste code zet de teller terug op nul', async () => {
    await controleerHuidigeCode('000000');
    expect(await leesInstelling('slot.fouten')).toBe(1);
    expect((await controleerHuidigeCode('482915')).ok).toBe(true);
    expect(await leesInstelling('slot.fouten')).toBe(0);
  });
});
