// BESLISSING 441: elke melding krijgt een eenkleurig icoon voor de statusbalk van Android (badge), naast het gewone icoon.
// De test laadt src/sw.js met een nagebootste service-workeromgeving, stuurt een leeg pushsignaal en kijkt wat showNotification krijgt.
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function laadSw(scope) {
  const luisteraars = {};
  const meldingen = [];
  vi.stubGlobal('self', {
    __WB_MANIFEST: [],
    registration: { scope, showNotification: vi.fn(async (titel, opties) => meldingen.push({ titel, opties })) },
    addEventListener: (naam, f) => (luisteraars[naam] = f),
  });
  await import('../../src/sw.js');
  return { luisteraars, meldingen };
}

describe('sw.js: de melding geeft een badge mee', () => {
  for (const scope of ['https://voorbeeld.test/', 'https://voorbeeld.test/bloei/']) {
    it(`bij een leeg pushsignaal (bereik ${scope})`, async () => {
      const { luisteraars, meldingen } = await laadSw(scope);
      let wacht;
      luisteraars.push({ waitUntil: (p) => (wacht = p) });
      await wacht;
      expect(meldingen).toHaveLength(1);
      const { opties } = meldingen[0];
      expect(opties.badge).toBe(scope + 'icons/badge-96.png');
      expect(opties.icon).toBe(scope + 'icons/icon-192.png');
    });
  }

  it('het bestand bestaat, is een png en komt door de precache (png in de globPatterns)', () => {
    const pad = new URL('../../public/icons/badge-96.png', import.meta.url);
    expect(existsSync(pad)).toBe(true);
    expect([...readFileSync(pad).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
    expect(vite).toMatch(/globPatterns: \['[^']*\bpng\b[^']*'\]/);
  });
});
