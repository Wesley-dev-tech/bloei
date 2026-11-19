// OW-02 (OWASP-doorloop 16 november): PBKDF2-HMAC-SHA256 met het aantal rondes dat de OWASP Password Storage Cheat Sheet nu
// aanbeveelt (600 000), zonder dat een bestaande code ophoudt te werken.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RONDES, maakHash, maakPin, controleer, isVerouderd, lengteVan, zetOmIndienVerouderd } from '../../src/vergrendeling/pin.js';

// Een opslag in het geheugen zoals 'slot.pin' in de instellingen.
function opslag(begin, { faalBijSchrijven = false } = {}) {
  let waarde = begin;
  return {
    lees: async () => waarde,
    bewaar: async (w) => {
      if (faalBijSchrijven) throw new Error('opslag vol');
      waarde = w;
    },
    get waarde() {
      return waarde;
    },
  };
}

describe('OW-02: rondes volgens OWASP', () => {
  it('een nieuwe code krijgt 600 000 rondes (OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256)', async () => {
    expect(RONDES).toBe(600000);
    const bewaard = await maakPin('482915');
    expect(bewaard.rondes).toBe(600000);
    expect(isVerouderd(bewaard)).toBe(false);
  });

  it('een code met 210 000 rondes blijft werken en wordt na een juiste invoer omgezet, met behoud van de lengte', async () => {
    const oud = { ...(await maakHash('482915', 210000)), lengte: 6 };
    expect(await controleer('482915', oud)).toBe(true);
    expect(isVerouderd(oud)).toBe(true);
    const o = opslag(oud);
    expect(await zetOmIndienVerouderd('482915', oud, o)).toBe(true);
    expect(o.waarde.rondes).toBe(600000);
    expect(o.waarde.lengte).toBe(6);
    expect(o.waarde.zout).not.toBe(oud.zout);
    expect(await controleer('482915', o.waarde)).toBe(true);
    expect(await controleer('482916', o.waarde)).toBe(false);
    // Een tweede keer: niets meer te doen.
    expect(await zetOmIndienVerouderd('482915', o.waarde, o)).toBe(false);
  });

  it('een oude code van vier cijfers zonder rondes en zonder lengte (eerste ontwerp, 100 000) blijft vier cijfers na het omzetten', async () => {
    const h = await maakHash('1357', 100000);
    const oud = { zout: h.zout, hash: h.hash };
    expect(await controleer('1357', oud)).toBe(true);
    const o = opslag(oud);
    expect(await zetOmIndienVerouderd('1357', oud, o)).toBe(true);
    expect(lengteVan(o.waarde)).toBe(4);
    expect(o.waarde.rondes).toBe(600000);
    expect(await controleer('1357', o.waarde)).toBe(true);
  });

  it('mislukt het bewaren, dan blijft de oude code gewoon werken en komt er geen fout', async () => {
    const oud = { ...(await maakHash('111111', 210000)), lengte: 6 };
    const o = opslag(oud, { faalBijSchrijven: true });
    expect(await zetOmIndienVerouderd('111111', oud, o)).toBe(false);
    expect(o.waarde).toBe(oud);
    expect(await controleer('111111', o.waarde)).toBe(true);
    // Ook een kapotte lees() of ontbrekende waarde gooit niet.
    expect(await zetOmIndienVerouderd('111111', oud, { lees: async () => { throw new Error('x'); }, bewaar: async () => {} })).toBe(false);
    expect(await zetOmIndienVerouderd('111111', null, o)).toBe(false);
  });

  it('is de code intussen gewijzigd, dan overschrijft het omzetten de nieuwe code niet', async () => {
    const oud = { ...(await maakHash('222222', 210000)), lengte: 6 };
    const nieuweCode = await maakPin('999999');
    const o = opslag(nieuweCode);
    expect(await zetOmIndienVerouderd('222222', oud, o)).toBe(false);
    expect(o.waarde).toBe(nieuweCode);
  });

  it('slot.js zet pas om NA het openen en via zetOmIndienVerouderd (nooit een schrijffout die het openen tegenhoudt)', () => {
    const bron = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'vergrendeling', 'slot.js'), 'utf8');
    const probeer = bron.slice(bron.indexOf('async function probeer('), bron.indexOf('async function faceId('));
    expect(probeer).toMatch(/await ontgrendel\(\);[\s\S]*zetOmIndienVerouderd\(/);
    expect(probeer.indexOf('ontgrendel()')).toBeLessThan(probeer.indexOf('zetOmIndienVerouderd('));
    expect(probeer).not.toMatch(/maakPin\(/);
  });
});
