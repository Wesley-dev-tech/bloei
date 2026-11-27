// BESLISSING 713: het uur van een herinnering is per minuut te kiezen (00:00 tot en met 23:59), niet meer per kwartier.
// De pure regels van het scherm Herinneringen (src/meldingen/scherm.js) en de keuze van de melding (src/meldingen/tekst.js).
import { describe, it, expect } from 'vitest';
import { DAGBOEK_LIMIET, LIMIET, geldigUur, nieuwUur, voegSamen } from '../../src/meldingen/scherm.js';
import { dagboekLijst, dagboekWaarde, kiesSoort } from '../../src/meldingen/tekst.js';
import { LIMIETEN } from '../../src/meldingen/push.js';
import { MAX_UREN as MAX_UREN_DIENST } from '../../worker/src/valideer.js';

const t2 = (n) => String(n).padStart(2, '0');

describe('een uur per minuut (713)', () => {
  it('elke minuut van 00:00 tot 23:59 is geldig en blijft ongewijzigd', () => {
    let n = 0;
    for (let u = 0; u < 24; u += 1) {
      for (let m = 0; m < 60; m += 1) {
        const uur = `${t2(u)}:${t2(m)}`;
        expect(geldigUur(uur)).toBe(uur);
        n += 1;
      }
    }
    expect(n).toBe(1440);
  });
  it('er wordt niet afgerond op een kwartier', () => {
    expect(geldigUur('18:07')).toBe('18:07');
    expect(geldigUur('08:05')).toBe('08:05');
    expect(geldigUur('23:59')).toBe('23:59');
    expect(geldigUur('19:52')).toBe('19:52');
  });
  it('seconden vallen weg (sommige browsers geven UU:MM:SS)', () => {
    expect(geldigUur('18:07:00')).toBe('18:07');
    expect(geldigUur('18:07:30.500')).toBe('18:07');
  });
  it('wat geen uur is, telt niet', () => {
    for (const fout of ['', null, undefined, '24:00', '18:60', '8:05', '18:7', 'tekst', '18-07', ' : ']) expect(geldigUur(fout), String(fout)).toBeNull();
  });
});

describe('Tijdstip toevoegen per minuut', () => {
  it('stelt twee uur na het laatste voor, met dezelfde minuten', () => {
    expect(nieuwUur([{ aan: true, uur: '18:07' }])).toBe('20:07');
    expect(nieuwUur([{ aan: true, uur: '23:59' }])).toBe('01:59');
    expect(nieuwUur([{ aan: true, uur: '11:00' }, { aan: true, uur: '15:00' }, { aan: true, uur: '19:00' }])).toBe('21:00');
  });
  it('is dat uur al bezet, dan een kwartier later', () => {
    expect(nieuwUur([{ aan: true, uur: '20:07' }, { aan: true, uur: '18:07' }])).toBe('20:22');
  });
  it('een lege lijst begint op 12:00 (twee uur na 10:00)', () => {
    expect(nieuwUur([])).toBe('12:00');
  });
});

describe('dubbele tijdstippen binnen een soort, per minuut', () => {
  it('hetzelfde uur wordt een tijdstip; een minuut verschil zijn er twee', () => {
    expect(voegSamen([{ aan: true, uur: '18:07' }, { aan: false, uur: '18:07' }])).toEqual([{ aan: true, uur: '18:07' }]);
    expect(voegSamen([{ aan: true, uur: '18:07' }, { aan: true, uur: '18:08' }])).toHaveLength(2);
    // vroeger werden 18:07 en 18:10 allebei 18:00 en dus samengevoegd; nu blijven ze apart
    expect(voegSamen([{ aan: true, uur: '18:07' }, { aan: true, uur: '18:10' }])).toHaveLength(2);
  });
});

describe('de melding kiest de soort per minuut', () => {
  const nu = (u, m) => new Date(2026, 10, 18, u, m);
  it('het signaal op 18:07 hoort bij het tijdstip van 18:07, niet bij dat van 18:00', () => {
    const invoer = { dagboek: { aan: true, uur: '18:00' }, drinken: [{ aan: true, uur: '18:07' }], supplementenUren: [] };
    expect(kiesSoort({ ...invoer, nu: nu(18, 7) })).toBe('drinken');
    expect(kiesSoort({ ...invoer, nu: nu(18, 0) })).toBe('dagboek');
  });
  it('over middernacht: 23:59 en 00:01 liggen twee minuten uit elkaar', () => {
    expect(kiesSoort({ nu: nu(0, 1), dagboek: { aan: true, uur: '20:00' }, drinken: [{ aan: true, uur: '23:59' }], supplementenUren: [] })).toBe('drinken');
  });
});

describe('het maximum aantal tijdstippen tegenover de grens van de dienst', () => {
  it('dagboek (2) + eten (3) + drinken (4) + supplementen (3) = 12, de grens van de dienst (BESLISSING 736; Dagboek 2 en Drinken 4 sinds 0.6.7)', () => {
    expect(LIMIET).toEqual({ dagboek: 2, eten: 3, drinken: 4, supplementen: 3 });
    expect(DAGBOEK_LIMIET).toBe(2);
    expect(LIMIETEN.drinken).toBe(4);
    const totaal = LIMIET.dagboek + LIMIET.eten + LIMIET.drinken + LIMIET.supplementen;
    expect(totaal).toBe(12);
    expect(totaal).toBeLessThanOrEqual(MAX_UREN_DIENST);
  });
});

describe('Dagboek als lijst van tijdstippen (714)', () => {
  it('een oude waarde "Om 20:00" wordt zonder verlies Tijdstip 1, 20:00, met dezelfde stand', () => {
    expect(dagboekLijst({ aan: true, uur: '20:00' })).toEqual([{ aan: true, uur: '20:00' }]);
    expect(dagboekLijst({ aan: false, uur: '21:15' })).toEqual([{ aan: false, uur: '21:15' }]);
    expect(dagboekLijst(undefined)).toEqual([]);
    expect(dagboekLijst(null)).toEqual([]);
  });
  it('de nieuwe vorm houdt aan en uur in lijn met de lijst, zodat een oudere lezer (aan, uur) ze nog begrijpt', () => {
    const w = dagboekWaarde([{ aan: false, uur: '08:05' }, { aan: true, uur: '18:07' }, { aan: true, uur: '23:59' }]);
    expect(w).toEqual({ aan: true, uur: '18:07', tijdstippen: [{ aan: false, uur: '08:05' }, { aan: true, uur: '18:07' }, { aan: true, uur: '23:59' }] });
    expect(dagboekLijst(w)).toEqual(w.tijdstippen);
  });
  it('alles uit of leeg: aan is false; zonder tijdstippen blijft het vorige uur staan', () => {
    expect(dagboekWaarde([{ aan: false, uur: '09:00' }])).toEqual({ aan: false, uur: '09:00', tijdstippen: [{ aan: false, uur: '09:00' }] });
    expect(dagboekWaarde([], '20:00')).toEqual({ aan: false, uur: '20:00', tijdstippen: [] });
    expect(dagboekLijst(dagboekWaarde([], '20:00'))).toEqual([]);
  });
  it('zet een oudere lezer aan op false (toestemming ingetrokken), dan staat elk tijdstip uit', () => {
    const w = { ...dagboekWaarde([{ aan: true, uur: '18:07' }, { aan: true, uur: '20:00' }]), aan: false };
    expect(dagboekLijst(w)).toEqual([{ aan: false, uur: '18:07' }, { aan: false, uur: '20:00' }]);
  });
  it('de melding kent elk dagboektijdstip, in de oude en de nieuwe vorm', () => {
    const nu = new Date(2026, 10, 18, 9, 0);
    const leeg = { drinken: [], supplementenUren: [] };
    expect(kiesSoort({ ...leeg, nu, venster: 20, dagboek: dagboekWaarde([{ aan: true, uur: '20:00' }, { aan: true, uur: '09:00' }]) })).toBe('dagboek');
    expect(kiesSoort({ ...leeg, nu, drinken: [{ aan: true, uur: '09:10' }], dagboek: dagboekWaarde([{ aan: true, uur: '20:00' }, { aan: true, uur: '09:00' }]) })).toBe('dagboek');
    expect(kiesSoort({ ...leeg, nu, drinken: [{ aan: true, uur: '09:10' }], dagboek: { aan: true, uur: '20:00' } })).toBe('drinken');
  });
});
