// R6-05: elke versie ruimt alleen haar eigen caches op. R6-11: bij terugkeer naar de app hoogstens één keer per uur een update vragen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isEigenOudeCache } from '../../src/pwa/caches.js';
import { UPDATE_INTERVAL_MS, updateBijTerugkeer } from '../../src/pwa/registratie.js';

describe('isEigenOudeCache (R6-05)', () => {
  it('de echte app ruimt haar eigen oude caches op, maar niet die van de demo en niet de huidige', () => {
    expect(isEigenOudeCache('bloei-oud1', 'bloei', 'bloei-nieuw2')).toBe(true);
    expect(isEigenOudeCache('bloei-nieuw2', 'bloei', 'bloei-nieuw2')).toBe(false);
    expect(isEigenOudeCache('bloei-demo-oud1', 'bloei', 'bloei-nieuw2')).toBe(false);
    expect(isEigenOudeCache('iets-anders', 'bloei', 'bloei-nieuw2')).toBe(false);
  });

  it('de demo ruimt haar eigen oude caches op, maar niet die van de echte app', () => {
    expect(isEigenOudeCache('bloei-demo-oud1', 'bloei-demo', 'bloei-demo-nieuw2')).toBe(true);
    expect(isEigenOudeCache('bloei-oud1', 'bloei-demo', 'bloei-demo-nieuw2')).toBe(false);
    expect(isEigenOudeCache('bloei-demo-nieuw2', 'bloei-demo', 'bloei-demo-nieuw2')).toBe(false);
  });

  it('sw.js gebruikt die regel bij activate (en niet meer een kale startsWith)', () => {
    const sw = readFileSync(new URL('../../src/sw.js', import.meta.url), 'utf8');
    const activate = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf("addEventListener('fetch'"));
    expect(activate).toContain('isEigenOudeCache(');
    expect(activate).not.toMatch(/startsWith\(VOORVOEGSEL\)/);
  });
});

function nepDoc() {
  const luisteraars = [];
  return {
    visibilityState: 'visible',
    addEventListener: (naam, f) => naam === 'visibilitychange' && luisteraars.push(f),
    zend(stand) {
      this.visibilityState = stand;
      luisteraars.forEach((f) => f());
    },
    luisteraars,
  };
}

describe('updateBijTerugkeer (R6-11)', () => {
  it('vraagt bij terugkeer een update, hoogstens één keer per uur, en nooit terwijl de app verborgen is', async () => {
    let klok = 1_000_000;
    let updates = 0;
    const doc = nepDoc();
    updateBijTerugkeer({ update: async () => updates++ }, { doc, nu: () => klok });
    expect(doc.luisteraars).toHaveLength(1);

    doc.zend('visible'); // net geregistreerd: de browser keek al
    expect(updates).toBe(0);

    klok += UPDATE_INTERVAL_MS + 1;
    doc.zend('hidden');
    expect(updates).toBe(0);
    doc.zend('visible');
    expect(updates).toBe(1);

    klok += 10 * 60 * 1000; // tien minuten later opnieuw terug: niet nog eens
    doc.zend('hidden');
    doc.zend('visible');
    expect(updates).toBe(1);

    klok += UPDATE_INTERVAL_MS;
    doc.zend('visible');
    expect(updates).toBe(2);
  });

  it('een mislukte update (offline) geeft geen fout', async () => {
    let klok = 0;
    const doc = nepDoc();
    updateBijTerugkeer({ update: () => Promise.reject(new Error('offline')) }, { doc, nu: () => klok });
    klok += UPDATE_INTERVAL_MS + 1;
    expect(() => doc.zend('visible')).not.toThrow();
    await new Promise((k) => setTimeout(k, 0));
  });

  it('registreerSw koppelt het ook echt', () => {
    const bron = readFileSync(new URL('../../src/pwa/registratie.js', import.meta.url), 'utf8');
    const registreer = bron.slice(bron.indexOf('export async function registreerSw'));
    expect(registreer).toContain('updateBijTerugkeer(registratie)');
  });
});
