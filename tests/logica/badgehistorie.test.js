// Wanneer werd een medaille echt behaald? (logica/badgehistorie.js) Stil toegekende medailles krijgen de dag uit het dagboek, niet de dag van de update.
import { describe, expect, test } from 'vitest';
import { eersteDatums } from '../../src/logica/badgehistorie.js';
import { plusDagen } from '../../src/kern/datum.js';

const dag = (n) => plusDagen('2026-09-07', n); // maandag 7 september 2026
const feit = (n, extra = {}) => ({ datum: dag(n), bij: true, maaltijden: 0, dranken: 0, ml: 0, soorten: [], innames: 0, periodiek: 0, wegingen: [], notitie: false, doel: false, vol: false, rond: false, etenKlaar: false, ...extra });

describe('eersteDatums', () => {
  test('tellers halen hun drempel op de dag zelf', () => {
    const feiten = Array.from({ length: 12 }, (_, n) => feit(n, { maaltijden: 1, dranken: 1, ml: 10000, soorten: [['water', 'thee', 'koffie'][n % 3]], doel: n >= 2 }));
    const uit = eersteDatums(feiten, ['tien-maaltijden', 'vijf-op-rij', 'tien-op-rij', 'volle-week', 'eerste-slok', 'drie-soorten', 'drie-dagen-water', 'honderd-liter', 'duizend-dagen', 'eigen-kleur']);
    expect(uit.get('tien-maaltijden')).toBe(dag(9));
    expect(uit.get('vijf-op-rij')).toBe(dag(4));
    expect(uit.get('tien-op-rij')).toBe(dag(9));
    expect(uit.get('volle-week')).toBe(dag(6)); // maandag tot en met zondag
    expect(uit.get('eerste-slok')).toBe(dag(0));
    expect(uit.get('drie-soorten')).toBe(dag(2));
    expect(uit.get('drie-dagen-water')).toBe(dag(4));
    expect(uit.get('honderd-liter')).toBe(dag(9));
    expect(uit.has('duizend-dagen')).toBe(false); // nog niet gehaald
    expect(uit.has('eigen-kleur')).toBe(false); // een instelling heeft geen dag in het dagboek
  });

  test('een reeks begint opnieuw na een gat; wegingen tellen per week', () => {
    const feiten = [0, 1, 4, 5, 6].map((n) => feit(n, { doel: true, rond: true, vol: true }));
    const uit = eersteDatums(feiten, ['drie-dagen-water', 'drie-rond-op-rij', 'dag-rond']);
    expect(uit.get('drie-dagen-water')).toBe(dag(6));
    expect(uit.get('drie-rond-op-rij')).toBe(dag(6));
    expect(uit.get('dag-rond')).toBe(dag(0));
    const wegen = [0, 7, 14, 21].map((n) => feit(n, { wegingen: [dag(n)] }));
    expect(eersteDatums(wegen, ['vier-weken-wegen', 'vier-wegingen']).get('vier-weken-wegen')).toBe(dag(21));
    expect(eersteDatums([wegen[0], wegen[1], wegen[3], feit(28, { wegingen: [dag(28)] })], ['vier-weken-wegen', 'vier-wegingen']).get('vier-weken-wegen')).toBe(undefined);
  });

  test('terugkomen na stilte en een volledige dag', () => {
    const feiten = [0, 6, 12, 18].map((n) => feit(n));
    expect(eersteDatums(feiten, ['altijd-welkom', 'weer-thuis']).get('altijd-welkom')).toBe(dag(18));
    expect(eersteDatums(feiten, ['altijd-welkom', 'weer-thuis']).get('weer-thuis')).toBe(dag(6));
    const vol = [feit(0, { rond: true }), feit(1, { rond: true, notitie: true })];
    expect(eersteDatums(vol, ['volledige-dag']).get('volledige-dag')).toBe(dag(1));
  });
});

// Het foute versienummer 0.5.0 (was 0.4.3): een toestel dat het onthield, krijgt het blad "Nieuw in Bloei" van 0.4.4 gewoon te zien.
import { gezienVersie, wijzigingenSinds, WIJZIGINGEN, vergelijkVersies } from '../../src/data/wijzigingen.js';
import { readFileSync } from 'node:fs';
describe('het versienummer (wijzigingen.js)', () => {
  // Het onthouden nummer '0.5.0' kan het foute van 24 november zijn (in feite 0.4.3) of het echte van 25 november.
  test("een onthouden '0.5.0' telt als 0.4.3, tenzij vaststaat dat het de echte 0.5.0 is", () => {
    expect(gezienVersie('0.5.0', false)).toBe('0.4.3');
    expect(gezienVersie('0.5.0', undefined)).toBe('0.4.3');
    expect(gezienVersie('0.5.0', true)).toBe('0.5.0');
    for (const echt of [true, false]) {
      expect(gezienVersie('0.4.2', echt)).toBe('0.4.2');
      expect(gezienVersie('0.5.1', echt)).toBe('0.5.1');
      expect(gezienVersie(null, echt)).toBe(null);
    }
  });
  test('wie op het foute nummer bleef staan, krijgt alles te zien wat sindsdien uitkwam; wie de echte 0.5.0 had, alleen het nieuwe', () => {
    expect(wijzigingenSinds(gezienVersie('0.5.0', false), '0.5.1').map((w) => w.versie)).toEqual(['0.5.1', '0.5.0', '0.4.9', '0.4.8', '0.4.7', '0.4.6', '0.4.5', '0.4.4']);
    expect(wijzigingenSinds(gezienVersie('0.5.0', true), '0.5.1').map((w) => w.versie)).toEqual(['0.5.1']);
    expect(wijzigingenSinds(gezienVersie('0.4.9', false), '0.5.1').map((w) => w.versie)).toEqual(['0.5.1', '0.5.0']);
    expect(wijzigingenSinds(gezienVersie('0.4.2', false), '0.4.4').map((w) => w.versie)).toEqual(['0.4.4', '0.4.3']);
  });
  test('de lijst staat ook in de tijd op volgorde: geen versie ging uit voor de versie eronder', () => {
    const moment = (w) => `${w.datum} ${w.tijd ?? '00:00'}`;
    for (let i = 0; i < WIJZIGINGEN.length - 1; i++) {
      expect(/^\d{4}-\d{2}-\d{2}$/.test(WIJZIGINGEN[i].datum), WIJZIGINGEN[i].versie).toBe(true);
      if (WIJZIGINGEN[i].tijd != null) expect(/^([01]\d|2[0-3]):[0-5]\d$/.test(WIJZIGINGEN[i].tijd), WIJZIGINGEN[i].versie).toBe(true);
      expect(moment(WIJZIGINGEN[i]) >= moment(WIJZIGINGEN[i + 1]), `${WIJZIGINGEN[i].versie} na ${WIJZIGINGEN[i + 1].versie}`).toBe(true);
    }
  });
  test('package.json, package-lock.json en de bovenste regel van de lijst dragen hetzelfde versienummer', () => {
    const lees = (bestand) => JSON.parse(readFileSync(new URL('../../' + bestand, import.meta.url), 'utf8'));
    const pakket = lees('package.json');
    const lock = lees('package-lock.json');
    expect(WIJZIGINGEN[0].versie).toBe(pakket.version);
    expect(lock.version).toBe(pakket.version);
    expect(lock.packages[''].version).toBe(pakket.version);
  });
  test('elke versie is precies één hoger op het laatste cijfer (na 9 volgt de volgende reeks), nieuwste bovenaan', () => {
    const versies = WIJZIGINGEN.map((w) => w.versie);
    for (let i = 0; i < versies.length - 1; i++) {
      const [a, b, c] = versies[i + 1].split('.').map(Number);
      const volgende = c === 9 ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
      // (0.2.4 heeft geen regel in de lijst: 0.2.5 volgt daar op 0.2.3)
      if (versies[i + 1] === '0.2.3') continue;
      expect(versies[i], versies[i + 1]).toBe(volgende);
      expect(vergelijkVersies(versies[i], versies[i + 1])).toBeGreaterThan(0);
    }
  });
});
