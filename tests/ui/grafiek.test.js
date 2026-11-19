// Rekenwerk van de gewichtsgrafiek (HUISSTIJL §7): lege weken overbrugd, één weging = alleen het punt.
import { describe, it, expect } from 'vitest';
import { berekenGrafiek, beginVanPeriode } from '../../src/ui/grafiek.js';

const OPTIES = { van: '2026-08-01', tot: '2026-11-01', breedte: 340, hoogte: 200 };
const weging = (datum, kg) => ({ week: datum, datum, kg, voorbeeld: false, gewijzigdOp: 0 });

describe('berekenGrafiek', () => {
  it('zonder wegingen: geen punten, geen pad, wel de baseline en maandlabels', () => {
    const g = berekenGrafiek([], { ...OPTIES, streefKg: null });
    expect(g.punten).toEqual([]);
    expect(g.pad).toBe('');
    expect(g.yLijnen).toEqual([]);
    expect(g.streefY).toBeNull();
    expect(g.basisY).toBe(172);
    expect(g.xLabels.map((l) => l.tekst)).toEqual(['aug', 'sep', 'okt', 'nov']);
  });

  it('zonder wegingen maar met streefgewicht: alleen de streeflijn', () => {
    const g = berekenGrafiek([], { ...OPTIES, streefKg: 65 });
    expect(g.punten).toEqual([]);
    expect(g.streefY).not.toBeNull();
  });

  it('één weging: alleen het punt, geen pad, één label', () => {
    const g = berekenGrafiek([weging('2026-09-14', 68.4)], { ...OPTIES, streefKg: null });
    expect(g.punten).toHaveLength(1);
    expect(g.pad).toBe('');
    expect(g.yLijnen).toHaveLength(1);
    expect(g.yLijnen[0].kg).toBe(68.4);
  });

  it('tien wegingen: pad door alle punten, gesorteerd op datum, hoogste boven laagste', () => {
    const data = [];
    for (let i = 0; i < 10; i++) data.push(weging(`2026-09-${String(1 + i * 2).padStart(2, '0')}`, 70 - (i % 4) * 0.5));
    const g = berekenGrafiek([...data].reverse(), { ...OPTIES, streefKg: null });
    expect(g.punten).toHaveLength(10);
    expect(g.pad.startsWith('M')).toBe(true);
    expect(g.pad.split('L')).toHaveLength(10);
    const xs = g.punten.map((p) => p.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(g.yLijnen[0].y).toBeLessThan(g.yLijnen[1].y);
    expect(g.yLijnen.map((l) => l.kg)).toEqual([70, 68.5]);
  });

  it('met streefgewicht: de streeflijn valt in het bereik en telt mee voor de schaal', () => {
    const g = berekenGrafiek([weging('2026-09-01', 70), weging('2026-10-01', 69)], { ...OPTIES, streefKg: 66 });
    expect(g.streefY).toBeGreaterThan(g.punten[0].y);
    expect(g.streefY).toBeLessThanOrEqual(g.basisY);
    for (const p of g.punten) expect(p.y).toBeLessThan(g.basisY);
  });

  it('lege weken worden overbrugd: de lijn verbindt de punten ernaast', () => {
    const g = berekenGrafiek([weging('2026-09-01', 70), weging('2026-10-20', 69)], { ...OPTIES, streefKg: null });
    expect(g.punten).toHaveLength(2);
    expect(g.pad).toMatch(/^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
  });

  it('wegingen buiten het bereik doen niet mee', () => {
    const g = berekenGrafiek([weging('2026-01-01', 90), weging('2026-09-01', 70)], { ...OPTIES, streefKg: null });
    expect(g.punten).toHaveLength(1);
  });

  it('stijging en daling zijn elkaars spiegelbeeld, zonder verschil in opmaak', () => {
    const op = berekenGrafiek([weging('2026-09-01', 68), weging('2026-10-01', 70)], { ...OPTIES, streefKg: null });
    const neer = berekenGrafiek([weging('2026-09-01', 70), weging('2026-10-01', 68)], { ...OPTIES, streefKg: null });
    expect(Object.keys(op)).toEqual(Object.keys(neer));
    expect(op.punten[0].y - op.punten[1].y).toBeCloseTo(neer.punten[1].y - neer.punten[0].y, 5);
  });

  it('beginVanPeriode telt kalendermaanden terug', () => {
    expect(beginVanPeriode('maand', '2026-11-13')).toBe('2026-10-13');
    expect(beginVanPeriode('kwartaal', '2026-11-13')).toBe('2026-08-13');
    expect(beginVanPeriode('jaar', '2026-11-13')).toBe('2025-11-13');
  });
});
