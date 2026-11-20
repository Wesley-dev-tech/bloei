// BESLISSING 705: een stapper op een raster springt naar het volgende veelvoud van de stap, en houdt halt op de standaardmaat.
import { describe, expect, test } from 'vitest';
import { volgendeStapwaarde } from '../../src/logica/stapwaarde.js';

const ml = { stap: 50, min: 50, max: 1000 };

describe('volgendeStapwaarde', () => {
  test('van 330 ml kom je met stappen van 50 op 500 uit', () => {
    let n = 330;
    const reeks = [];
    while (n < 500) reeks.push((n = volgendeStapwaarde(n, 1, ml)));
    expect(reeks).toEqual([350, 400, 450, 500]);
  });
  test('een waarde naast het raster (470) gaat naar 500, niet naar 520', () => {
    expect(volgendeStapwaarde(470, 1, ml)).toBe(500);
    expect(volgendeStapwaarde(470, -1, ml)).toBe(450);
  });
  test('op het raster blijft het een gewone stap', () => {
    expect(volgendeStapwaarde(200, 1, ml)).toBe(250);
    expect(volgendeStapwaarde(200, -1, ml)).toBe(150);
  });
  test('de standaardmaat blijft een halte in beide richtingen', () => {
    const met = { ...ml, stops: [330] };
    expect(volgendeStapwaarde(300, 1, met)).toBe(330);
    expect(volgendeStapwaarde(330, 1, met)).toBe(350);
    expect(volgendeStapwaarde(350, -1, met)).toBe(330);
    expect(volgendeStapwaarde(330, -1, met)).toBe(300);
  });
  test('de grenzen blijven gelden', () => {
    expect(volgendeStapwaarde(1000, 1, ml)).toBe(1000);
    expect(volgendeStapwaarde(980, 1, ml)).toBe(1000);
    expect(volgendeStapwaarde(50, -1, ml)).toBe(50);
  });
  test('kommagetallen: 70,5 kg met stappen van 0,1', () => {
    const kg = { stap: 0.1, min: 20, max: 300 };
    expect(volgendeStapwaarde(70.5, 1, kg)).toBe(70.6);
    expect(volgendeStapwaarde(70.5, -1, kg)).toBe(70.4);
  });
});
