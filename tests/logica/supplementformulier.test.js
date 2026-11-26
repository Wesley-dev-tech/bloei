// De pure kant van de supplementkaart: formulier naar aanroep, controleren en foutmeldingen. Verzonnen namen.
import { describe, expect, test } from 'vitest';
import { controleer, foutVan, formulierVan, isGewijzigd, leegFormulier, naarAanroep } from '../../src/logica/supplementformulier.js';

const nu = '2026-11-14';
const goed = () => ({ ...leegFormulier(nu), naam: 'Testkuur' });

describe('controleer', () => {
  test('een goed formulier geeft geen fout', () => {
    expect(controleer(goed())).toBeNull();
  });
  test('een lege naam, geen moment, een ongeldig ritme en een ongeldige periode', () => {
    expect(controleer({ ...goed(), naam: '  ' })).toEqual({ code: 'leeg', veld: 'naam' });
    expect(controleer({ ...goed(), momenten: [] })).toEqual({ code: 'momenten', veld: 'momenten' });
    expect(controleer({ ...goed(), soort: 'interval', dagen: 1 })).toEqual({ code: 'ritme', veld: 'dagen' });
    expect(controleer({ ...goed(), soort: 'interval', dagen: 14, start: '' })).toEqual({ code: 'ritme', veld: 'start' });
    expect(controleer({ ...goed(), vanaf: '2026-12-05', tot: '2026-12-04' })).toEqual({ code: 'periode', veld: 'tot' });
    expect(controleer({ ...goed(), vanaf: '5 december' })).toEqual({ code: 'datum', veld: 'vanaf' }); // een datum die niet bestaat heeft haar eigen melding
  });
  test('bij een periodiek ritme zijn de momenten niet nodig', () => {
    expect(controleer({ ...goed(), soort: 'maand', momenten: [] })).toBeNull();
  });
});

describe('naarAanroep', () => {
  test('dagelijks: momenten in vaste volgorde, lege grenzen worden lege tekst', () => {
    const o = naarAanroep({ ...goed(), momenten: ['avond', 'ochtend'], hoeveelheid: '2 capsules', aanwijzing: 'bij het eten' }, { oud: true });
    expect(o).toMatchObject({ naam: 'Testkuur', ritme: { soort: 'dagelijks' }, momenten: ['ochtend', 'avond'], vanaf: '', tot: '', dosis: '2 capsules · bij het eten' });
  });
  test('periodiek: ritme met start en dagen, geen momenten', () => {
    expect(naarAanroep({ ...goed(), soort: 'interval', dagen: '14', start: '2026-11-27', vanaf: '2026-11-27', tot: '2027-01-01' })).toMatchObject({
      ritme: { soort: 'interval', dagen: 14, start: '2026-11-27' },
      momenten: [],
      vanaf: '2026-11-27',
      tot: '2027-01-01',
    });
    expect(naarAanroep({ ...goed(), soort: 'maand', start: '2026-12-04' }).ritme).toEqual({ soort: 'maand', start: '2026-12-04' });
  });
});

describe('formulierVan en isGewijzigd', () => {
  test('een bestaand supplement wordt een formulier en terug zonder verschil', () => {
    const s = { naam: 'Kuur', hoeveelheid: 'een halve ampule', aanwijzing: '', momenten: [], ritme: { soort: 'maand', start: '2026-12-04' }, vanaf: '2026-12-04', tot: '2026-12-04' };
    const f = formulierVan(s, nu);
    expect(f).toMatchObject({ soort: 'maand', start: '2026-12-04', vanaf: '2026-12-04', tot: '2026-12-04', momenten: ['ochtend'] });
    expect(isGewijzigd(f, { ...f })).toBe(false);
    expect(isGewijzigd(f, { ...f, naam: 'Anders' })).toBe(true);
    expect(isGewijzigd(f, { ...f, naam: 'Kuur  ' })).toBe(false);
  });
});

describe('foutVan', () => {
  test('een Error van de datalaag wordt een melding bij het juiste veld', () => {
    expect(foutVan(new Error('leeg'))).toEqual({ code: 'leeg', veld: 'naam' });
    expect(foutVan(new Error('periode'))).toEqual({ code: 'periode', veld: 'tot' });
    expect(foutVan(new Error('iets anders'))).toBeNull();
  });
});

// Een naam zonder een enkel zichtbaar teken telt als leeg (zelfde melding als een lege naam). De tekens als escapes, zodat dit bestand ze
// zelf niet bevat. Gewone namen met accenten, cijfers, een koppelteken of emoji blijven werken. Verzonnen namen.
describe('controleer: een naam die je niet ziet', () => {
  test('alleen spaties of onzichtbare tekens: leeg', () => {
    const onzichtbaar = [
      '', '   ', '\t\n', ' ', '　',
      '​', '‌‍', '‎‏', '⁠', '⁣', '﻿', '­', '͏', '᠎',
      'ㅤ', 'ᅟ', 'ᅠ', 'ﾠ', '⠀', '⠀ ⠀',
      '️', '\u{E0041}', '́', ' ​ ㅤ ',
    ];
    for (const naam of onzichtbaar) expect(controleer({ ...goed(), naam }), JSON.stringify(naam)).toEqual({ code: 'leeg', veld: 'naam' });
  });
  test('gewone namen blijven werken', () => {
    const gewoon = ['Kurkuma', 'Café crème', 'Café', 'Vitamine C 500', 'Anti-oxidant', 'Niño', '❤️ hartje', '\u{1F33F}', 'Pil \u{1F468}‍\u{1F469}‍\u{1F467}', '1'];
    for (const naam of gewoon) expect(controleer({ ...goed(), naam }), naam).toBeNull();
  });
});
