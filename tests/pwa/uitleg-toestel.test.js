// BESLISSING 590: een staptekst zegt niets over een ander toestel of een andere bediening dan die van wie leest. Op een telefoon met aanraking
// geen "computer", "muis" of "Escape"; op een computer (breed, met muis) geen "telefoon" en geen "tik" (behalve waar het over de telefoon zelf of
// het intikken van een code gaat). Alle rondleidingen en handleidingen, in elke variant (Android, apk), ook de teksten van afgeronde delen (STUKKEN).
import { describe, it, expect } from 'vitest';
import { STAPPEN, TOESTEL_TEKST, stappenVoor, tekstVoorToestel, toestelTekst } from '../../src/uitleg/stappen.js';
import { TEKSTEN } from '../../src/teksten.js';

const VARIANTEN = [{}, { android: true, chrome: true }, { android: true, chrome: true, apk: true }, { android: true, chrome: false }];
function alleStappen() {
  const uit = [];
  for (const sleutel of Object.keys(STAPPEN)) {
    for (const v of VARIANTEN) {
      for (const s of stappenVoor(sleutel, { android: false, chrome: false, apk: false, ...v })) {
        uit.push({ ...s, sleutel });
        for (const st of s.stukken?.stukken ?? []) uit.push({ ...s, sleutel, deel: {}, titel: st.titel, tekst: st.tekst });
        if (s.stukken?.vervolg) uit.push({ ...s, sleutel, deel: {}, ...s.stukken.vervolg });
      }
    }
  }
  return uit;
}
const telefoonMetAanraking = { breed: false, muis: false };
const computer = { breed: true, muis: true };
const opTelefoon = (s) => /(beginscherm|vergrendeling\.code)/.test(s.tekstSleutel || '');

describe('tekst per toestel (BESLISSING 590)', () => {
  const stappen = alleStappen();
  it('er zijn stappen om na te kijken', () => {
    expect(stappen.length).toBeGreaterThan(150);
  });
  it('op een telefoon met aanraking: geen computer, muis of Escape', () => {
    const fout = stappen
      .map((s) => ({ s, ...tekstVoorToestel(s, telefoonMetAanraking) }))
      .filter(({ titel, tekst }) => /computer|muis|escape/i.test(`${titel} ${tekst}`))
      .map(({ s, titel, tekst }) => `${s.sleutel}.${s.id}: ${titel} | ${tekst}`);
    expect(fout).toEqual([]);
    expect(toestelTekst('uitleg.weetje1', TEKSTEN.uitleg.weetje1, telefoonMetAanraking)).not.toMatch(/escape/i);
  });
  it('op een computer: geen telefoon en geen tik', () => {
    const fout = stappen
      .map((s) => ({ s, ...tekstVoorToestel(s, computer) }))
      .filter(({ s, titel, tekst }) => /telefoon/i.test(`${titel} ${tekst}`) || (!opTelefoon(s) && /\b(tik|tikken|aantikken|getikt|tikte)\b/i.test(`${titel} ${tekst}`)))
      .map(({ s, titel, tekst }) => `${s.sleutel}.${s.id}: ${titel} | ${tekst}`);
    expect(fout).toEqual([]);
  });
  // BESLISSING 600: nergens nog het woord "uitleg" in een zichtbare tekst (het heet rondleiding of handleiding).
  it('geen enkele tekst en geen staptitel of staptekst bevat het woord uitleg', () => {
    const fout = [];
    const loop = (o, pad) => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && /uitleg/i.test(v)) fout.push(`${pad}${k}: ${v}`);
        else if (v && typeof v === 'object') loop(v, `${pad}${k}.`);
      }
    };
    loop(TEKSTEN, 'TEKSTEN.');
    loop(TOESTEL_TEKST, 'TOESTEL_TEKST.');
    for (const s of stappen) {
      for (const toestel of [telefoonMetAanraking, computer]) {
        const { titel, tekst } = tekstVoorToestel(s, toestel);
        if (/uitleg/i.test(`${titel} ${tekst}`)) fout.push(`${s.sleutel}.${s.id}: ${titel} | ${tekst}`);
      }
      // de teksten die een deel zonder eigen stuk krijgt (STUKKEN, vervolg.maak)
      const maak = s.stukken?.vervolg?.maak;
      if (typeof maak === 'function') for (const namen of [['Ontbijt'], ['Ontbijt', 'Tussendoortje'], ['1', '8']]) {
        const { titel, tekst } = maak(namen);
        if (/uitleg/i.test(`${titel} ${tekst}`)) fout.push(`${s.sleutel}.${s.id} (vervolg): ${titel} | ${tekst}`);
      }
    }
    expect(fout).toEqual([]);
  });
  it('het menu: onderaan op een smal scherm, links op een breed', () => {
    const menu = stappenVoor('vandaag', { android: false, chrome: false, apk: false }).find((s) => s.id === 'menu');
    expect(tekstVoorToestel(menu, telefoonMetAanraking).tekst).toMatch(/^Onderaan/);
    expect(tekstVoorToestel(menu, computer).tekst).toMatch(/^Links/);
  });
});
