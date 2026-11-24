// Wanneer werd een medaille echt behaald? (logica/badgehistorie.js) Stil toegekende medailles krijgen de dag uit het dagboek, niet de dag van de update.
import { describe, expect, test } from 'vitest';
import { eersteDatums } from '../../src/logica/badgehistorie.js';
import { plusDagen } from '../../src/kern/datum.js';

const dag = (n) => plusDagen('2026-09-07', n); // maandag 7 september 2026
const feit = (n, extra = {}) => ({ datum: dag(n), bij: true, maaltijden: 0, gevoel: 0, dranken: 0, ml: 0, soorten: [], innames: 0, periodiek: 0, wegingen: [], stemming: null, energie: null, notitie: false, doel: false, vol: false, rond: false, etenKlaar: false, ...extra });

describe('eersteDatums', () => {
  test('tellers halen hun drempel op de dag zelf', () => {
    const feiten = Array.from({ length: 12 }, (_, n) => feit(n, { maaltijden: 1, dranken: 1, ml: 10000, soorten: [['water', 'thee', 'koffie'][n % 3]], doel: n >= 2, stemming: n >= 3 ? 3 : null, energie: n >= 5 ? 2 : null }));
    const uit = eersteDatums(feiten, ['tien-maaltijden', 'vijf-op-rij', 'tien-op-rij', 'volle-week', 'eerste-slok', 'drie-soorten', 'drie-dagen-water', 'honderd-liter', 'week-gezichtjes', 'gezichtje-en-blaadje', 'duizend-dagen', 'eigen-kleur']);
    expect(uit.get('tien-maaltijden')).toBe(dag(9));
    expect(uit.get('vijf-op-rij')).toBe(dag(4));
    expect(uit.get('tien-op-rij')).toBe(dag(9));
    expect(uit.get('volle-week')).toBe(dag(6)); // maandag tot en met zondag
    expect(uit.get('eerste-slok')).toBe(dag(0));
    expect(uit.get('drie-soorten')).toBe(dag(2));
    expect(uit.get('drie-dagen-water')).toBe(dag(4));
    expect(uit.get('honderd-liter')).toBe(dag(9));
    expect(uit.get('week-gezichtjes')).toBe(dag(9));
    expect(uit.get('gezichtje-en-blaadje')).toBe(dag(11));
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
    const vol = [feit(0, { rond: true }), feit(1, { rond: true, stemming: 4, energie: 3, notitie: true })];
    expect(eersteDatums(vol, ['volledige-dag']).get('volledige-dag')).toBe(dag(1));
  });
});

// Het foute versienummer 0.5.0 (was 0.4.3): een toestel dat het onthield, krijgt het blad "Nieuw in Bloei" van 0.4.4 gewoon te zien.
import { gezienVersie, wijzigingenSinds, WIJZIGINGEN, vergelijkVersies } from '../../src/data/wijzigingen.js';
describe('het versienummer (wijzigingen.js)', () => {
  test('0.5.0 telt als 0.4.3 zolang de app onder 0.5.0 zit', () => {
    expect(gezienVersie('0.5.0', '0.4.4')).toBe('0.4.3');
    expect(gezienVersie('0.4.2', '0.4.4')).toBe('0.4.2');
    expect(gezienVersie('0.5.0', '0.5.0')).toBe('0.5.0');
    expect(gezienVersie('0.5.0', '0.5.1')).toBe('0.5.0');
    expect(wijzigingenSinds(gezienVersie('0.5.0', '0.4.4'), '0.4.4').map((w) => w.versie)).toEqual(['0.4.4']);
    expect(wijzigingenSinds(gezienVersie('0.4.2', '0.4.4'), '0.4.4').map((w) => w.versie)).toEqual(['0.4.4', '0.4.3']);
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
