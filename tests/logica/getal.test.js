import { describe, expect, test } from 'vitest';
import { leesKg, opmaakKg, opmaakLiter, opmaakMl, opmaakVerschil } from '../../src/kern/getal.js';

const S = ' '; // vaste spatie

describe('opmaak', () => {
  test('ml', () => {
    expect(opmaakMl(250)).toBe(`250${S}ml`);
  });

  test('liter: komma, hoogstens twee decimalen, geen nullen achteraan', () => {
    expect(opmaakLiter(0)).toBe(`0${S}l`);
    expect(opmaakLiter(750)).toBe(`0,75${S}l`);
    expect(opmaakLiter(1250)).toBe(`1,25${S}l`);
    expect(opmaakLiter(1500)).toBe(`1,5${S}l`);
    expect(opmaakLiter(2000)).toBe(`2${S}l`);
    expect(opmaakLiter(330)).toBe(`0,33${S}l`);
  });

  test('kg: altijd één decimaal', () => {
    expect(opmaakKg(68.4)).toBe(`68,4${S}kg`);
    expect(opmaakKg(70)).toBe(`70,0${S}kg`);
  });

  test('verschil: plus, echt minteken, nul zonder teken', () => {
    expect(opmaakVerschil(0.4)).toBe(`+0,4${S}kg`);
    expect(opmaakVerschil(-0.3)).toBe(`-0,3${S}kg`);
    expect(opmaakVerschil(0)).toBe(`0,0${S}kg`);
    // 68,4 - 69,0 is in de computer niet exact -0,6
    expect(opmaakVerschil(68.4 - 69.0)).toBe(`-0,6${S}kg`);
    expect(opmaakVerschil(-0.04)).toBe(`0,0${S}kg`);
  });
});

describe('leesKg', () => {
  test('komma en punt', () => {
    expect(leesKg('68,4')).toBe(68.4);
    expect(leesKg('68.4')).toBe(68.4);
    expect(leesKg(' 70 ')).toBe(70);
    expect(leesKg('68,44')).toBe(68.4);
  });

  test('onzin en buiten 20 - 300 geeft null', () => {
    expect(leesKg('')).toBeNull();
    expect(leesKg('abc')).toBeNull();
    expect(leesKg('-5')).toBeNull();
    expect(leesKg('19,9')).toBeNull();
    expect(leesKg('300,1')).toBeNull();
    expect(leesKg('6,8,4')).toBeNull();
    expect(leesKg(null)).toBeNull();
  });
});
