// BESLISSING 446: geen halve kastlijntjes (U+2013) en geen kastlijntjes (U+2014) in de app, de code, de documenten en de tests.
// Een bereik krijgt een gewoon koppelteken met een spatie ervoor en erachter ("16 - 22 november"); een lege waarde krijgt "-".
// BESLISSING 447: geen pijltje als teken (U+203A, U+2039, U+2192) in een tekst voor de gebruiker; daar staat het icoon uit de huisstijl.
// BESLISSING 496: ook geen maalteken (U+00D7, wordt de letter x), geen minteken (U+2212, wordt het korte streepje) en geen beletselteken (U+2026, wordt drie punten),
// ook niet als HTML-entiteit. Een invoerparser mag ze wel aanvaarden, maar schrijft ze dan als \u-code.
// De tekens staan hier als \u-codes, zodat dit bestand zichzelf niet raakt.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { TEKSTEN } from '../../src/teksten.js';

const WORTEL = join(import.meta.dirname, '..', '..');
const STREEPJES = /[\u2013\u2014]/;
const TEKENS_496 = /[\u00d7\u2212\u2026]/;
const ENTITEITEN_496 = /&(?:times|minus|hellip);|&#(?:215|8722|8230|x[dD]7|x2212|x2026);/;
const PIJLTJES = /[\u203a\u2039\u2192]/;

// Wat gescand wordt: broncode, de ingang, de Worker, de scripts, de vier documenten en alle tests.
const MAPPEN = ['src', 'worker/src', 'scripts', 'tests', 'bloei-huisstijl'];
const BESTANDEN = ['index.html', 'README.md', 'HANDLEIDING-PUBLICEREN.md', 'worker/README.md'];
const SOORTEN = /\.(js|mjs|css|html|md|json|txt)$/;

// Uitgesloten: privédocumenten van de eigenaar en bestanden van derden (hun tekst blijft letterlijk zoals ze is).
const UITGESLOTEN = [
  'BESLISSINGEN.md',
  'PLAN.md',
  'LOGBOEK.md',
  'ITERATIES.md',
  'EISEN.md',
  'CLAUDE.md',
  'package-lock.json',
  'public/licenties-derden.txt', // licentieteksten van anderen; owasp.test.js vergelijkt ze met node_modules
];

function alleBestanden(map) {
  const uit = [];
  let namen = [];
  try {
    namen = readdirSync(join(WORTEL, map));
  } catch {
    return uit;
  }
  for (const naam of namen) {
    if (naam === 'node_modules') continue;
    const pad = join(map, naam);
    if (statSync(join(WORTEL, pad)).isDirectory()) uit.push(...alleBestanden(pad));
    else if (SOORTEN.test(naam)) uit.push(pad.split(sep).join('/'));
  }
  return uit;
}

describe('geen lange streepjes (BESLISSING 446)', () => {
  const lijst = [...MAPPEN.flatMap(alleBestanden), ...BESTANDEN].filter((f) => !UITGESLOTEN.includes(f));

  it('er worden bestanden gescand', () => {
    expect(lijst.length).toBeGreaterThan(100);
    expect(lijst).toContain('src/teksten.js');
    expect(lijst).toContain('tests/logica/geen-lange-streepjes.test.js');
    for (const uitgesloten of UITGESLOTEN) expect(lijst).not.toContain(uitgesloten);
  });

  it('U+2013 en U+2014 komen nergens voor', () => {
    const treffers = [];
    for (const f of lijst) {
      readFileSync(join(WORTEL, f), 'utf8')
        .split('\n')
        .forEach((regel, i) => {
          if (STREEPJES.test(regel)) treffers.push(`${f}:${i + 1}: ${regel.trim().slice(0, 100)}`);
        });
    }
    expect(treffers, treffers.join('\n')).toEqual([]);
  });

  it('U+00D7, U+2212 en U+2026 komen nergens voor, ook niet als HTML-entiteit (BESLISSING 496)', () => {
    const treffers = [];
    for (const f of lijst) {
      readFileSync(join(WORTEL, f), 'utf8')
        .split('\n')
        .forEach((regel, i) => {
          if (TEKENS_496.test(regel) || ENTITEITEN_496.test(regel)) treffers.push(`${f}:${i + 1}: ${regel.trim().slice(0, 100)}`);
        });
    }
    expect(treffers, treffers.join('\n')).toEqual([]);
  });
});

describe('geen pijltje als teken in de teksten (BESLISSING 447)', () => {
  it('geen U+203A, U+2039 of U+2192 in een tekstwaarde van src/teksten.js', () => {
    const treffers = [];
    const loop = (waarde, pad) => {
      if (typeof waarde === 'string') {
        if (PIJLTJES.test(waarde)) treffers.push(`${pad}: ${waarde}`);
      } else if (Array.isArray(waarde)) waarde.forEach((w, i) => loop(w, `${pad}.${i}`));
      else if (waarde && typeof waarde === 'object') for (const [k, w] of Object.entries(waarde)) loop(w, pad ? `${pad}.${k}` : k);
    };
    loop(TEKSTEN, '');
    expect(treffers, treffers.join('\n')).toEqual([]);
  });
});
