// De css van het Android-werk als bestandscontrole, en de bewaking dat er geen melding voor een te oude browser in de app staat
// (BESLISSING 454: de eigenaar wil dat scherm niet).
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const lees = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const index = lees('index.html');
const main = lees('src/main.js');
const basis = lees('src/stijl/basis.css');
const blad = lees('src/ui/componenten.js');

describe('geen melding voor een te oude browser (BESLISSING 454)', () => {
  it('index.html, main.js en basis.css bevatten de regel niet meer', () => {
    expect(index).not.toMatch(/te-oud|te oud voor Bloei/);
    expect(main).not.toContain('te-oud');
    expect(basis).not.toContain('te-oud');
    expect(index.split('<script').length - 1).toBe(2); // het themascript en de module, niets erbij
    expect(index.split('<script>').length - 1).toBe(1); // precies één inline script: het themascript
    expect(index).not.toMatch(/<style|style="/);
  });
});

describe('css uit het Android-rapport', () => {
  it('geen trekken-om-te-vernieuwen in de geïnstalleerde app, alleen daar', () => {
    expect(basis).toMatch(/@media \(display-mode: standalone\) \{\s*html \{ overscroll-behavior-y: none; \}\s*\}/);
  });
  it('de pagina achter een open blad schuift niet mee, via css; blad() zet geen overflow meer op html', () => {
    expect(basis).toContain(':root:has(.blad > dialog:modal) { overflow: hidden; }');
    expect(blad).not.toMatch(/documentElement\.style\.overflow/);
  });
  it('de installatiestrook: gap en flex-wrap', () => {
    expect(lees('src/stijl/layout.css')).toMatch(/\.installatiestrook__acties \{[^}]*gap: var\(--s-2\);[^}]*flex-wrap: wrap;/);
  });
});
