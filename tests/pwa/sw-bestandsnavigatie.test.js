// BESLISSING 427: een navigatie naar een bestand met een andere extensie dan .html (licenties-derden.txt) komt uit de cache of het
// netwerk, nooit op index.html; index.html blijft alleen de terugval voor navigaties zonder extensie. Het .txt zit in de voorraadlijst.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const sw = readFileSync(new URL('../../src/sw.js', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');

describe('sw.js: bestandsnavigatie', () => {
  it('een navigatie naar een pad met een andere extensie dan .html valt niet terug op index.html', () => {
    const fetchDeel = sw.slice(sw.indexOf("addEventListener('fetch'"), sw.indexOf("addEventListener('message'"));
    expect(fetchDeel).toMatch(/laatste\.includes\('\.'\) && !laatste\.endsWith\('\.html'\)\) return \(await cache\.match\(verzoek\.url, opties\)\) \|\| fetch\(verzoek\)/);
    expect(fetchDeel.indexOf("laatste.includes('.')")).toBeLessThan(fetchDeel.indexOf('STARTPAGINA, opties'));
  });
  it('txt staat in de globPatterns van de voorraadlijst', () => {
    expect(vite).toMatch(/globPatterns: \['[^']*\btxt\b[^']*'\]/);
  });
});
